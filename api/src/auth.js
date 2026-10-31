import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminEmails } from './config.js';
import { query } from './db.js';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error('[auth] falta JWT_SECRET (revisa .env.base44-defaults)');
  process.exit(1);
}

const tokenTtl = process.env.TOKEN_TTL || '72h';

export const hashPassword = (password) => bcrypt.hash(password, 10);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash || '');

export const signToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: tokenTtl });

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const isAdmin = (user) =>
  Boolean(user) && (user.role === 'admin' || adminEmails.includes(user.email));

export const bannedNow = (user) =>
  Boolean(user) && (user.banned_permanent || (user.banned_until && new Date(user.banned_until) > new Date()));

export const isDriverSuspended = (user) => {
  if (!user) return false;
  if (user.banned_permanent) return true;
  if (user.banned_until && new Date(user.banned_until) > new Date()) return true;
  if (user.suspended_until && new Date(user.suspended_until) > new Date()) return true;
  if (user.risk_level === 'red') return true;
  return false;
};

export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: isAdmin(user) ? 'admin' : user.role,
  banned: bannedNow(user),
  bannedUntil: user.banned_until,
  bannedPermanent: user.banned_permanent,
  riskLevel: user.risk_level || 'green',
  cancellationCount: user.cancellation_count || 0,
  suspendedUntil: user.suspended_until,
  consecutiveCompletedTrips: user.consecutive_completed_trips || 0,
  reportsCount: user.reports_count || 0,
  isSuspended: isDriverSuspended(user),
});

export const findUserByEmail = async (email) => {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [String(email || '').toLowerCase()]);
  return rows[0] || null;
};

export const findUserById = async (id) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
};

export const publicAccount = (user) => ({ user: publicUser(user) });

const readToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const attachUser = async (req) => {
  const token = readToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await findUserById(payload.sub);
    if (!user) return null;
    req.user = user;
    return user;
  } catch {
    return null;
  }
};

// Adjunta req.user cuando hay token válido; sigue sin autenticar si no lo hay.
export async function optionalAuth(req, res, next) {
  try {
    await attachUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(req, res, next) {
  try {
    const user = req.user || (await attachUser(req));
    if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    if (bannedNow(user)) return res.status(403).json({ error: 'Tu cuenta está suspendida.' });
    next();
  } catch (error) {
    next(error);
  }
}

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    const allowed = roles.some((role) => role === 'admin' && isAdmin(req.user)) || roles.includes(req.user?.role);
    if (!allowed) return res.status(403).json({ error: 'No tienes permiso para esta sección.' });
    next();
  };

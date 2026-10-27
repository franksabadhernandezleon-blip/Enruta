import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error('[auth] falta JWT_SECRET (revisa .env.base44-defaults)');
  process.exit(1);
}

const tokenTtl = process.env.TOKEN_TTL || '72h';

export const hashPassword = (password) => bcrypt.hash(password, 10);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const signToken = (ownerId) => jwt.sign({ sub: ownerId }, jwtSecret, { expiresIn: tokenTtl });

export const httpError = (status, message) => Object.assign(new Error(message), { status });

const ACCOUNT_SQL = `
  SELECT o.id AS owner_id, o.email, o.name AS owner_name,
         s.id AS store_id, s.name AS store_name, s.slug
  FROM owners o
  LEFT JOIN stores s ON s.owner_id = o.id
  WHERE o.id = $1
  ORDER BY s.created_at ASC
  LIMIT 1
`;

export const loadAccount = async (ownerId) => {
  const { rows } = await query(ACCOUNT_SQL, [ownerId]);
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    owner: { id: row.owner_id, email: row.email, name: row.owner_name },
    store: row.store_id ? { id: row.store_id, name: row.store_name, slug: row.slug } : null,
  };
};

export const publicAccount = (account) => ({
  owner: account.owner,
  store: account.store,
});

// Adjunta la tienda del dueño autenticado a la request.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
  }

  try {
    const account = await loadAccount(payload.sub);
    if (!account) {
      return res.status(401).json({ error: 'Tu sesión ya no es válida.' });
    }
    req.account = account;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireStore(req, res, next) {
  if (!req.account?.store) {
    return res.status(409).json({ error: 'Tu cuenta aún no tiene una tienda asociada.' });
  }
  next();
}

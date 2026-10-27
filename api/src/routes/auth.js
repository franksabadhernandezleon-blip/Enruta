import { Router } from 'express';
import { query } from '../db.js';
import {
  hashPassword,
  httpError,
  loadAccount,
  publicAccount,
  requireAuth,
  signToken,
  verifyPassword,
} from '../auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tienda';

router.post('/register', async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const ownerName = String(req.body?.ownerName || '').trim();
  const storeName = String(req.body?.storeName || '').trim();

  if (!EMAIL_RE.test(email)) {
    return next(httpError(400, 'Escribe un correo válido.'));
  }
  if (password.length < 8) {
    return next(httpError(400, 'La contraseña debe tener al menos 8 caracteres.'));
  }
  if (!storeName) {
    return next(httpError(400, 'Escribe el nombre de tu tienda.'));
  }

  const passwordHash = await hashPassword(password);
  const slug = `${slugify(storeName)}-${Math.random().toString(36).slice(2, 7)}`;

  let ownerId;
  try {
    const { rows } = await query(
      'INSERT INTO owners (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
      [email, passwordHash, ownerName || storeName],
    );
    ownerId = rows[0].id;
  } catch (error) {
    if (error.code === '23505') {
      return next(httpError(409, 'Ya existe una cuenta con ese correo.'));
    }
    return next(error);
  }

  try {
    await query('INSERT INTO stores (owner_id, name, slug) VALUES ($1, $2, $3)', [
      ownerId,
      storeName,
      slug,
    ]);
  } catch (error) {
    await query('DELETE FROM owners WHERE id = $1', [ownerId]);
    return next(error);
  }

  const account = await loadAccount(ownerId);
  res.status(201).json({ token: signToken(ownerId), ...publicAccount(account) });
});

router.post('/login', async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return next(httpError(400, 'Escribe tu correo y contraseña.'));
  }

  const { rows } = await query('SELECT id, password_hash FROM owners WHERE email = $1', [email]);
  const owner = rows[0];

  if (!owner || !(await verifyPassword(password, owner.password_hash))) {
    return next(httpError(401, 'Correo o contraseña incorrectos.'));
  }

  const account = await loadAccount(owner.id);
  res.json({ token: signToken(owner.id), ...publicAccount(account) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(publicAccount(req.account));
});

export default router;

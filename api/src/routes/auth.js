import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { googleClientId } from '../config.js';
import {
  bannedNow,
  findUserByEmail,
  hashPassword,
  httpError,
  isAdmin,
  publicUser,
  requireAuth,
  signToken,
  verifyPassword,
} from '../auth.js';
import { query } from '../db.js';
import { notify, pushReady, saveSubscription } from '../push.js';

const router = Router();
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

// Si el correo ya está registrado como dueño de una tienda, la cuenta nace con ese rol.
const linkRoleForEmail = async (user) => {
  const { rows } = await query(
    'SELECT id FROM stores WHERE lower(owner_email) = lower($1) LIMIT 1',
    [user.email],
  );
  if (!rows[0]) return user;
  const updated = await query("UPDATE users SET role = 'owner' WHERE id = $1 RETURNING *", [user.id]);
  await query('UPDATE stores SET owner_id = $2 WHERE id = $1', [rows[0].id, user.id]);
  return updated.rows[0];
};

const session = async (user, store = null) => ({
  token: signToken(user),
  user: publicUser(user),
  store,
});

const loadOwnStore = async (user) => {
  const { rows } = await query(
    'SELECT * FROM stores WHERE owner_id = $1 OR lower(owner_email) = lower($2) ORDER BY created_at LIMIT 1',
    [user.id, user.email],
  );
  return rows[0] || null;
};

const publicStore = (store) =>
  store
    ? {
        id: store.id,
        name: store.name,
        slug: store.slug,
        logoUrl: store.logo_url,
        bannerUrl: store.banner_url,
        open: store.open,
        rating: Number(store.rating),
      }
    : null;

router.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email.includes('@')) throw httpError(400, 'Escribe un correo válido.');
    if (password.length < 8) throw httpError(400, 'La contraseña necesita al menos 8 caracteres.');

    const existing = await findUserByEmail(email);
    if (existing) throw httpError(409, 'Ese correo ya tiene cuenta. Inicia sesión.');

    const inserted = await query(
      `INSERT INTO users (email, password_hash, name, phone) VALUES ($1,$2,$3,$4) RETURNING *`,
      [
        email,
        await hashPassword(password),
        String(req.body?.name || '').slice(0, 120),
        String(req.body?.phone || '').slice(0, 40),
      ],
    );
    const user = await linkRoleForEmail(inserted.rows[0]);
    res.status(201).json(await session(user, publicStore(await loadOwnStore(user))));
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = await findUserByEmail(email);
    if (!user) throw httpError(401, 'Correo o contraseña incorrectos.');
    const ok = await verifyPassword(String(req.body?.password || ''), user.password_hash);
    if (!ok) throw httpError(401, 'Correo o contraseña incorrectos.');
    if (bannedNow(user)) throw httpError(403, 'Tu cuenta está suspendida. Escríbenos por WhatsApp.');

    const linked = isAdmin(user) ? user : await linkRoleForEmail(user);
    res.json(await session(linked, publicStore(await loadOwnStore(linked))));
  } catch (error) {
    next(error);
  }
});

// Login con Google: se valida el ID token contra el client ID configurado.
router.post('/google', async (req, res, next) => {
  try {
    if (!googleClient) {
      throw httpError(503, 'El acceso con Google aún no está configurado (falta GOOGLE_CLIENT_ID).');
    }

    const credential = String(req.body?.credential || '');
    if (!credential) throw httpError(400, 'No recibimos el token de Google.');

    console.log('[google-login] GOOGLE_CLIENT_ID:', googleClientId);
    console.log('[google-login] credential length:', credential.length);

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });

    const payload = ticket.getPayload() || {};
    const email = String(payload.email || '').toLowerCase();
    if (!email) throw httpError(400, 'Tu cuenta de Google no tiene correo verificado.');

    let user = await findUserByEmail(email);
    if (user) {
      if (user.banned_permanent || (user.banned_until && new Date(user.banned_until) > new Date())) {
        throw httpError(403, 'Tu cuenta está suspendida.');
      }
      await query('UPDATE users SET google_id = COALESCE(google_id, $2) WHERE id = $1', [user.id, payload.sub]);
    } else {
      const inserted = await query(
        `INSERT INTO users (email, google_id, name) VALUES ($1,$2,$3) RETURNING *`,
        [email, payload.sub, String(payload.name || '').slice(0, 120)],
      );
      user = inserted.rows[0];
    }

    user = await linkRoleForEmail(user);
    res.json(await session(user, publicStore(await loadOwnStore(user))));
  } catch (error) {
    console.error('[google-login] FULL ERROR:', error);
    console.error('[google-login] MESSAGE:', error?.message);
    console.error('[google-login] STACK:', error?.stack);

    if (error.status) return next(error);
    next(httpError(401, 'No pudimos validar tu cuenta de Google.'));
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = isAdmin(req.user) ? req.user : await linkRoleForEmail(req.user);
    const store = await loadOwnStore(user);
    res.json({
      user: publicUser(user),
      store: publicStore(store),
      pushEnabled: pushReady,
    });
  } catch (error) {
    next(error);
  }
});

// Suscripción Web Push (puede registrarse sin sesión: el rol viaja en el cuerpo).
router.post('/push', async (req, res, next) => {
  try {
    const saved = await saveSubscription({
      subscription: req.body?.subscription,
      user: req.user,
      role: req.body?.role,
    });
    if (!saved) throw httpError(400, 'Suscripción push inválida.');
    res.status(201).json({ ok: true, pushReady });
  } catch (error) {
    next(error);
  }
});

router.post('/push/test', requireAuth, async (req, res, next) => {
  try {
    const sent = await notify({
      emails: [req.user.email],
      roles: [],
      payload: {
        title: 'ENRUTA',
        body: 'Notificación de prueba: todo listo en tu dispositivo.',
        url: '/',
        tag: 'test',
      },
    });
    res.json({ ok: true, sent });
  } catch (error) {
    next(error);
  }
});

export default router;

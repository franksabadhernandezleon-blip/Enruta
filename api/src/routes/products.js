import { Router } from 'express';
import { httpError, isAdmin, requireAuth } from '../auth.js';
import { query } from '../db.js';

const router = Router();

router.use(requireAuth);

const parsePrice = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim();
  if (normalized === '') return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError(400, 'El precio debe ser un número mayor o igual a cero.');
  }
  return Math.round(amount * 100);
};

const parseNumber = (value, fallback = 0) => {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
};

const serializeProduct = (product) => ({
  id: product.id,
  storeId: product.store_id,
  storeName: product.store_name,
  name: product.name,
  description: product.description,
  priceCents: product.price_cents,
  stock: product.stock,
  weightKg: Number(product.weight_kg),
  imageUrl: product.image_url,
  requiresConfirmation: product.requires_confirmation,
  position: product.position,
  active: product.active,
});

// Resuelve la tienda para el usuario logueado o mediante storeId si es admin
const resolveStoreForUser = async (user, requestedStoreId) => {
  if (isAdmin(user) && requestedStoreId) {
    const { rows } = await query('SELECT * FROM stores WHERE id = $1', [requestedStoreId]);
    if (rows[0]) return rows[0];
  }

  const { rows } = await query(
    'SELECT * FROM stores WHERE owner_id = $1 OR lower(owner_email) = lower($2) ORDER BY created_at LIMIT 1',
    [user.id, user.email],
  );

  if (!rows[0]) return null;

  if (!rows[0].owner_id) {
    await query('UPDATE stores SET owner_id = $2 WHERE id = $1', [rows[0].id, user.id]);
  }

  return rows[0];
};

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw httpError(400, 'El producto necesita un nombre.');

    const store = await resolveStoreForUser(req.user, body.storeId);
    if (!store) {
      return res.status(409).json({ error: 'No tienes una tienda asignada, contacta al administrador' });
    }

    const { rows } = await query(
      `INSERT INTO products (store_id, name, description, price_cents, stock, weight_kg, image_url, requires_confirmation, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *, (SELECT name FROM stores WHERE id = $1) AS store_name`,
      [
        store.id,
        name.slice(0, 120),
        String(body.description || '').slice(0, 500),
        parsePrice(body.price),
        Math.max(0, Math.round(parseNumber(body.stock, 0))),
        Math.max(0, parseNumber(body.weightKg, 1)),
        body.imageUrl ? String(body.imageUrl) : null,
        Boolean(body.requiresConfirmation),
        Math.min(4, Math.max(1, Math.round(parseNumber(body.position, 1)))),
      ],
    );

    res.status(201).json({ product: serializeProduct(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    const store = await resolveStoreForUser(req.user, body.storeId);

    // Si es admin sin tienda asignada, o el dueño
    let currentQuery = 'SELECT * FROM products WHERE id = $1';
    const queryParams = [req.params.id];

    if (!isAdmin(req.user)) {
      if (!store) {
        return res.status(409).json({ error: 'No tienes una tienda asignada, contacta al administrador' });
      }
      currentQuery += ' AND store_id = $2';
      queryParams.push(store.id);
    }

    const { rows: current } = await query(currentQuery, queryParams);
    if (!current[0]) throw httpError(404, 'Ese producto no existe o no pertenece a tu catálogo.');

    const product = current[0];
    const priceCents = body.price === undefined ? product.price_cents : parsePrice(body.price);

    const { rows } = await query(
      `UPDATE products SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         price_cents = $4,
         stock = COALESCE($5, stock),
         weight_kg = COALESCE($6, weight_kg),
         image_url = $7,
         requires_confirmation = COALESCE($8, requires_confirmation),
         position = COALESCE($9, position),
         active = COALESCE($10, active),
         updated_at = now()
       WHERE id = $1 RETURNING *, (SELECT name FROM stores WHERE id = products.store_id) AS store_name`,
      [
        product.id,
        body.name !== undefined ? String(body.name).trim().slice(0, 120) : null,
        body.description !== undefined ? String(body.description).slice(0, 500) : null,
        priceCents,
        body.stock !== undefined ? Math.max(0, Math.round(parseNumber(body.stock, 0))) : null,
        body.weightKg !== undefined ? Math.max(0, parseNumber(body.weightKg, 1)) : null,
        body.imageUrl !== undefined ? body.imageUrl || null : product.image_url,
        body.requiresConfirmation !== undefined ? Boolean(body.requiresConfirmation) : null,
        body.position !== undefined ? Math.min(4, Math.max(1, Math.round(parseNumber(body.position, 1)))) : null,
        body.active !== undefined ? Boolean(body.active) : null,
      ],
    );

    res.json({ product: serializeProduct(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const store = await resolveStoreForUser(req.user, req.query.storeId);

    let deleteQuery = 'DELETE FROM products WHERE id = $1';
    const queryParams = [req.params.id];

    if (!isAdmin(req.user)) {
      if (!store) {
        return res.status(409).json({ error: 'No tienes una tienda asignada, contacta al administrador' });
      }
      deleteQuery += ' AND store_id = $2';
      queryParams.push(store.id);
    }

    const { rowCount } = await query(deleteQuery, queryParams);
    if (!rowCount) throw httpError(404, 'Ese producto no existe o no pertenece a tu catálogo.');

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;

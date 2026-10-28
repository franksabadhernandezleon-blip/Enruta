import { Router } from 'express';
import { findUserByEmail, httpError, isAdmin, requireAuth, requireRole } from '../auth.js';
import { query } from '../db.js';
import { cancelOrder, loadOrder, serializeOrder } from '../orders.js';
import { notify } from '../push.js';
import { getSettings, updateSettings } from '../settings.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

const serializeStore = (store) => ({
  id: store.id,
  name: store.name,
  slug: store.slug,
  description: store.description,
  logoUrl: store.logo_url,
  bannerUrl: store.banner_url,
  open: store.open,
  address: store.address,
  lat: store.lat,
  lng: store.lng,
  phone: store.phone,
  rating: Number(store.rating),
  ownerEmail: store.owner_email,
  ownerId: store.owner_id,
  link: `/tienda/${store.slug}`,
});

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

const parsePrice = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim();
  if (normalized === '') return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw httpError(400, 'Precio inválido.');
  return Math.round(amount * 100);
};

const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

router.get('/overview', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const [counts, sos, payouts, crm] = await Promise.all([
      query(
        `SELECT
           (SELECT count(*)::int FROM stores) AS stores,
           (SELECT count(*)::int FROM products WHERE active) AS products,
           (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM orders WHERE status NOT IN ('delivered','cancelled')) AS open_orders,
           (SELECT count(*)::int FROM orders WHERE status = 'delivered') AS delivered_orders,
           (SELECT COALESCE(sum(total_cents), 0)::int FROM orders WHERE status = 'delivered') AS revenue_cents,
           (SELECT COALESCE(sum(platform_commission_cents), 0)::int FROM orders WHERE status = 'delivered') AS platform_cents,
           (SELECT COALESCE(sum(courier_commission_cents), 0)::int FROM orders WHERE status = 'delivered') AS courier_cents`,
      ),
      query("SELECT * FROM sos_alerts WHERE status = 'open' ORDER BY created_at DESC LIMIT 20"),
      query(
        `SELECT pr.*, u.name, u.email, u.phone FROM payout_requests pr
           JOIN users u ON u.id = pr.courier_id
          WHERE pr.status = 'requested' ORDER BY pr.created_at DESC LIMIT 20`,
      ),
      query('SELECT * FROM crm_events ORDER BY created_at DESC LIMIT 40'),
    ]);

    res.json({
      settings,
      counts: counts.rows[0],
      sos: sos.rows.map((alert) => ({
        id: alert.id,
        courierName: alert.courier_name,
        courierPhone: alert.courier_phone,
        orderCode: alert.order_code,
        lat: alert.lat,
        lng: alert.lng,
        status: alert.status,
        createdAt: alert.created_at,
      })),
      payouts: payouts.rows.map((payout) => ({
        id: payout.id,
        courierName: payout.name || payout.email,
        courierPhone: payout.phone,
        amountCents: payout.amount_cents,
        status: payout.status,
        createdAt: payout.created_at,
      })),
      crm: crm.rows.map((event) => ({
        id: event.id,
        email: event.email,
        orderCode: event.order_code,
        kind: event.kind,
        note: event.note,
        createdAt: event.created_at,
      })),
      isAdmin: isAdmin(req.user),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    const settings = await updateSettings(req.body || {});
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

/* ---------------------------------- Tiendas --------------------------------- */

router.get('/stores', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM stores ORDER BY name ASC');
    res.json({ stores: rows.map(serializeStore) });
  } catch (error) {
    next(error);
  }
});

router.post('/stores', async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw httpError(400, 'La tienda necesita un nombre.');
    const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase();
    const slug = slugify(body.slug || name);

    const existing = await query('SELECT id FROM stores WHERE slug = $1', [slug]);
    if (existing.rows[0]) throw httpError(409, 'Ya existe una tienda con ese link único.');

    const owner = ownerEmail ? await findUserByEmail(ownerEmail) : null;

    const { rows } = await query(
      `INSERT INTO stores (owner_id, owner_email, name, slug, description, phone, address, lat, lng, rating, logo_url, banner_url, open)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        owner?.id || null,
        ownerEmail || null,
        name.slice(0, 120),
        slug,
        String(body.description || '').slice(0, 400),
        String(body.phone || '').slice(0, 40),
        String(body.address || '').slice(0, 240),
        Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
        Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
        Number(body.rating) || 5,
        body.logoUrl || null,
        body.bannerUrl || null,
        body.open === undefined ? true : Boolean(body.open),
      ],
    );

    if (owner) await query("UPDATE users SET role = 'owner' WHERE id = $1", [owner.id]);
    res.status(201).json({ store: serializeStore(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/stores/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    const ownerEmail = body.ownerEmail !== undefined ? String(body.ownerEmail).trim().toLowerCase() : null;
    const owner = ownerEmail ? await findUserByEmail(ownerEmail) : null;
    if (owner) await query("UPDATE users SET role = 'owner' WHERE id = $1", [owner.id]);

    const { rows } = await query(
      `UPDATE stores SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         phone = COALESCE($4, phone),
         address = COALESCE($5, address),
         lat = COALESCE($6, lat),
         lng = COALESCE($7, lng),
         rating = COALESCE($8, rating),
         logo_url = COALESCE($9, logo_url),
         banner_url = COALESCE($10, banner_url),
         open = COALESCE($11, open),
         owner_email = COALESCE($12, owner_email),
         owner_id = COALESCE($13, owner_id)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        body.name !== undefined ? String(body.name).slice(0, 120) : null,
        body.description !== undefined ? String(body.description).slice(0, 400) : null,
        body.phone !== undefined ? String(body.phone).slice(0, 40) : null,
        body.address !== undefined ? String(body.address).slice(0, 240) : null,
        body.lat !== undefined ? Number(body.lat) : null,
        body.lng !== undefined ? Number(body.lng) : null,
        body.rating !== undefined ? Number(body.rating) : null,
        body.logoUrl !== undefined ? body.logoUrl || null : null,
        body.bannerUrl !== undefined ? body.bannerUrl || null : null,
        body.open !== undefined ? Boolean(body.open) : null,
        ownerEmail,
        owner?.id || null,
      ],
    );
    if (!rows[0]) throw httpError(404, 'Esa tienda no existe.');
    res.json({ store: serializeStore(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/stores/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM stores WHERE id = $1', [req.params.id]);
    if (!rowCount) throw httpError(404, 'Esa tienda no existe.');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/* --------------------------------- Productos -------------------------------- */

router.get('/products', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.storeId) {
      params.push(req.query.storeId);
      where = `WHERE p.store_id = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT p.*, s.name AS store_name FROM products p JOIN stores s ON s.id = p.store_id ${where}
        ORDER BY s.name ASC, p.position ASC, p.name ASC`,
      params,
    );
    res.json({ products: rows.map(serializeProduct) });
  } catch (error) {
    next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.storeId) throw httpError(400, 'Elige la tienda del producto.');
    const { rows } = await query(
      `INSERT INTO products (store_id, name, description, price_cents, stock, weight_kg, image_url, requires_confirmation, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *, (SELECT name FROM stores WHERE id = $1) AS store_name`,
      [
        body.storeId,
        String(body.name || '').trim().slice(0, 120),
        String(body.description || '').slice(0, 500),
        parsePrice(body.price),
        Math.max(0, Math.round(Number(body.stock) || 0)),
        Math.max(0, Number(body.weightKg) || 0),
        body.imageUrl || null,
        Boolean(body.requiresConfirmation),
        Math.min(4, Math.max(1, Math.round(Number(body.position) || 1))),
      ],
    );
    res.status(201).json({ product: serializeProduct(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    const { rows: current } = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!current[0]) throw httpError(404, 'Ese producto no existe.');

    const { rows } = await query(
      `UPDATE products SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         price_cents = COALESCE($4, price_cents),
         stock = COALESCE($5, stock),
         weight_kg = COALESCE($6, weight_kg),
         image_url = COALESCE($7, image_url),
         requires_confirmation = COALESCE($8, requires_confirmation),
         position = COALESCE($9, position),
         active = COALESCE($10, active),
         updated_at = now()
       WHERE id = $1 RETURNING *, (SELECT name FROM stores WHERE id = products.store_id) AS store_name`,
      [
        req.params.id,
        body.name !== undefined ? String(body.name).slice(0, 120) : null,
        body.description !== undefined ? String(body.description).slice(0, 500) : null,
        body.price !== undefined ? parsePrice(body.price) : null,
        body.stock !== undefined ? Math.max(0, Math.round(Number(body.stock) || 0)) : null,
        body.weightKg !== undefined ? Math.max(0, Number(body.weightKg) || 0) : null,
        body.imageUrl !== undefined ? body.imageUrl || null : null,
        body.requiresConfirmation !== undefined ? Boolean(body.requiresConfirmation) : null,
        body.position !== undefined ? Math.min(4, Math.max(1, Math.round(Number(body.position) || 1))) : null,
        body.active !== undefined ? Boolean(body.active) : null,
      ],
    );
    res.json({ product: serializeProduct(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (!rowCount) throw httpError(404, 'Ese producto no existe.');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/* ---------------------------------- Pedidos --------------------------------- */

router.get('/orders', async (req, res, next) => {
  try {
    const params = [];
    const filters = [];
    if (req.query.status && req.query.status !== 'all') {
      params.push(req.query.status);
      filters.push(`status = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${String(req.query.q).toLowerCase()}%`);
      filters.push(`(lower(code) LIKE $${params.length} OR lower(customer_name) LIKE $${params.length})`);
    }
    const { rows } = await query(
      `SELECT id FROM orders ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY created_at DESC LIMIT 60`,
      params,
    );

    const orders = [];
    for (const row of rows) {
      orders.push(serializeOrder(await loadOrder({ id: row.id }), { view: 'admin' }));
    }
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    const order = await cancelOrder({ orderId: req.params.id, reason: req.body?.reason, actor: 'admin' });
    res.json({ order: serializeOrder(order, { view: 'admin' }) });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------ Usuarios y CRM ------------------------------ */

router.get('/users', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.q) {
      params.push(`%${String(req.query.q).toLowerCase()}%`);
      where = `WHERE lower(email) LIKE $1 OR lower(name) LIKE $1`;
    }
    const { rows } = await query(
      `SELECT u.*,
              (SELECT count(*)::int FROM orders o WHERE o.customer_id = u.id) AS orders_count,
              (SELECT count(*)::int FROM orders o WHERE o.courier_id = u.id AND o.status = 'delivered') AS deliveries_count
         FROM users u ${where} ORDER BY u.created_at DESC LIMIT 80`,
      params,
    );
    res.json({
      users: rows.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        bannedPermanent: user.banned_permanent,
        bannedUntil: user.banned_until,
        ordersCount: user.orders_count,
        deliveriesCount: user.deliveries_count,
        createdAt: user.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/ban', async (req, res, next) => {
  try {
    const permanent = Boolean(req.body?.permanent);
    const days = Math.max(1, Math.round(Number(req.body?.days) || 7));
    const until = permanent ? null : new Date(Date.now() + days * 86400000);

    const { rows } = await query(
      'UPDATE users SET banned_permanent = $2, banned_until = $3 WHERE id = $1 RETURNING *',
      [req.params.id, permanent, until],
    );
    if (!rows[0]) throw httpError(404, 'Ese usuario no existe.');

    await query('INSERT INTO crm_events (email, kind, note) VALUES ($1,$2,$3)', [
      rows[0].email,
      permanent ? 'ban' : 'ban_temp',
      permanent ? 'Baneo permanente' : `Baneo por ${days} días`,
    ]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/unban', async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE users SET banned_permanent = false, banned_until = NULL WHERE id = $1 RETURNING *',
      [req.params.id],
    );
    if (!rows[0]) throw httpError(404, 'Ese usuario no existe.');
    await query('INSERT INTO crm_events (email, kind, note) VALUES ($1,$2,$3)', [
      rows[0].email,
      'unban',
      'Baneo levantado',
    ]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/crm', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM crm_events ORDER BY created_at DESC LIMIT 100');
    res.json({
      events: rows.map((event) => ({
        id: event.id,
        email: event.email,
        orderCode: event.order_code,
        kind: event.kind,
        note: event.note,
        createdAt: event.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------- SOS ----------------------------------- */

router.get('/sos', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM sos_alerts ORDER BY created_at DESC LIMIT 50');
    res.json({
      alerts: rows.map((alert) => ({
        id: alert.id,
        courierName: alert.courier_name,
        courierPhone: alert.courier_phone,
        orderCode: alert.order_code,
        lat: alert.lat,
        lng: alert.lng,
        status: alert.status,
        createdAt: alert.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/sos/:id/ack', async (req, res, next) => {
  try {
    const { rowCount } = await query("UPDATE sos_alerts SET status = 'ack' WHERE id = $1", [req.params.id]);
    if (!rowCount) throw httpError(404, 'Esa alerta no existe.');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* -------------------------------- Liquidaciones ------------------------------ */

router.get('/payouts', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT pr.*, u.name, u.email, u.phone FROM payout_requests pr
         JOIN users u ON u.id = pr.courier_id ORDER BY pr.created_at DESC LIMIT 40`,
    );
    res.json({
      payouts: rows.map((payout) => ({
        id: payout.id,
        courierName: payout.name || payout.email,
        courierPhone: payout.phone,
        amountCents: payout.amount_cents,
        status: payout.status,
        createdAt: payout.created_at,
        paidAt: payout.paid_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/payouts/:id/pay', async (req, res, next) => {
  try {
    const { rows } = await query(
      "UPDATE payout_requests SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *",
      [req.params.id],
    );
    if (!rows[0]) throw httpError(404, 'Esa solicitud no existe.');

    await query(
      `INSERT INTO wallet_entries (courier_id, amount_cents, kind, note) VALUES ($1,$2,'payout',$3)`,
      [rows[0].courier_id, rows[0].amount_cents, 'Liquidación pagada'],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/push/test', async (req, res, next) => {
  try {
    const sent = await notify({
      roles: ['admin'],
      emails: [],
      payload: { title: 'ENRUTA admin', body: 'Notificación de prueba enviada al panel.', url: '/tuteteno', tag: 'admin-test' },
    });
    res.json({ ok: true, sent });
  } catch (error) {
    next(error);
  }
});

export default router;

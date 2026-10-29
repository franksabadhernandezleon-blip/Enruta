import { Router } from 'express';
import { httpError, isAdmin, requireAuth, requireRole } from '../auth.js';
import { query } from '../db.js';
import {
  courierReleaseState,
  loadCourierLocation,
  loadOrder,
  releaseCourierByDelay,
  releaseStop,
} from '../orders.js';
import { listStoreProofs, serializeProof } from '../proofs.js';

const router = Router();

router.use(requireAuth, requireRole('owner', 'admin'));

const myStore = async (user) => {
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

const serializeProduct = (product) => ({
  id: product.id,
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
  schedule: store.schedule,
  ownerEmail: store.owner_email,
});

const parsePrice = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim();
  if (normalized === '') return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw httpError(400, 'El precio debe ser un número mayor o igual a cero.');
  return Math.round(amount * 100);
};

const parseNumber = (value, fallback = 0) => {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
};

const requireStore = async (req, res, next) => {
  try {
    const store = await myStore(req.user);
    if (!store) return res.status(409).json({ error: 'Tu cuenta todavía no tiene una tienda asignada.' });
    req.store = store;
    next();
  } catch (error) {
    next(error);
  }
};

router.get('/store', requireStore, async (req, res, next) => {
  try {
    const products = await query(
      'SELECT * FROM products WHERE store_id = $1 ORDER BY position ASC, name ASC',
      [req.store.id],
    );
    res.json({ store: serializeStore(req.store), products: products.rows.map(serializeProduct) });
  } catch (error) {
    next(error);
  }
});

// Pin arrastrable, logo, banner y estado Abierto/Cerrado de la tienda.
router.put('/store', requireStore, async (req, res, next) => {
  try {
    const body = req.body || {};
    const { rows } = await query(
      `UPDATE stores SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         logo_url = COALESCE($4, logo_url),
         banner_url = COALESCE($5, banner_url),
         open = COALESCE($6, open),
         address = COALESCE($7, address),
         lat = COALESCE($8, lat),
         lng = COALESCE($9, lng),
         phone = COALESCE($10, phone),
         schedule = COALESCE($11::jsonb, schedule)
       WHERE id = $1 RETURNING *`,
      [
        req.store.id,
        body.name !== undefined ? String(body.name).slice(0, 120) : null,
        body.description !== undefined ? String(body.description).slice(0, 400) : null,
        body.logoUrl !== undefined ? body.logoUrl || null : null,
        body.bannerUrl !== undefined ? body.bannerUrl || null : null,
        body.open !== undefined ? Boolean(body.open) : null,
        body.address !== undefined ? String(body.address).slice(0, 240) : null,
        body.lat !== undefined ? parseNumber(body.lat, null) : null,
        body.lng !== undefined ? parseNumber(body.lng, null) : null,
        body.phone !== undefined ? String(body.phone).slice(0, 40) : null,
        body.schedule !== undefined ? JSON.stringify(body.schedule) : null,
      ],
    );
    res.json({ store: serializeStore(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.get('/products', requireStore, async (req, res, next) => {
  try {
    const products = await query(
      'SELECT * FROM products WHERE store_id = $1 ORDER BY position ASC, name ASC',
      [req.store.id],
    );
    res.json({ products: products.rows.map(serializeProduct) });
  } catch (error) {
    next(error);
  }
});

router.post('/products', requireStore, async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw httpError(400, 'El producto necesita un nombre.');

    const { rows } = await query(
      `INSERT INTO products (store_id, name, description, price_cents, stock, weight_kg, image_url, requires_confirmation, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.store.id,
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

router.patch('/products/:id', requireStore, async (req, res, next) => {
  try {
    const { rows: current } = await query('SELECT * FROM products WHERE id = $1 AND store_id = $2', [
      req.params.id,
      req.store.id,
    ]);
    if (!current[0]) throw httpError(404, 'Ese producto no está en tu catálogo.');

    const body = req.body || {};
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
       WHERE id = $1 RETURNING *`,
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

router.delete('/products/:id', requireStore, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM products WHERE id = $1 AND store_id = $2', [
      req.params.id,
      req.store.id,
    ]);
    if (!rowCount) throw httpError(404, 'Ese producto no está en tu catálogo.');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Pedidos que tocan mi tienda, con el estado de mi parada.
// Comprobantes de pago de los pedidos que pasan por esta tienda: número de pedido y
// foto. Solo los vigentes (una semana); los vencidos se borran solos.
router.get('/proofs', requireStore, async (req, res, next) => {
  try {
    const proofs = await listStoreProofs(req.store.id);
    res.json({
      proofs: proofs.map((proof) => ({
        ...serializeProof(proof),
        paymentMethod: proof.payment_method,
        totalCents: proof.total_cents,
        customerName: proof.customer_name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders', requireStore, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.id, o.code, o.status, o.created_at, o.address, o.notes, st.id AS stop_id,
              st.released, st.released_at, st.seq, st.extra_fee_cents
         FROM order_stops st JOIN orders o ON o.id = st.order_id
        WHERE st.store_id = $1 AND o.status NOT IN ('delivered','cancelled')
        ORDER BY o.created_at DESC`,
      [req.store.id],
    );

    const orders = [];
    for (const row of rows) {
      const full = await loadOrder({ id: row.id });
      orders.push({
        id: row.id,
        code: row.code,
        status: row.status,
        createdAt: row.created_at,
        address: row.address,
        notes: row.notes,
        courier: full.courier_id
          ? { id: full.courier_id, name: full.courier_name, phone: full.courier_phone }
          : null,
        acceptedAt: full.accepted_at,
        courierLocation: await loadCourierLocation(full.courier_id),
        release: courierReleaseState(full, row.stop_id),
        stop: {
          id: row.stop_id,
          seq: row.seq,
          released: row.released,
          releasedAt: row.released_at,
          extraFeeCents: row.extra_fee_cents,
        },
        stopsCount: full.stops.length,
        items: full.items.filter((item) => item.store_id === req.store.id).map((item) => ({
          name: item.name,
          qty: item.qty,
          priceCents: item.price_cents,
        })),
      });
    }
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

// Liberar mi parte con el PIN de retiro que dicta el motorizado.
router.post('/orders/:orderId/release', requireStore, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM order_stops WHERE order_id = $1 AND store_id = $2', [
      req.params.orderId,
      req.store.id,
    ]);
    if (!rows[0]) throw httpError(404, 'Ese pedido no incluye tu tienda.');

    const order = await releaseStop({
      orderId: req.params.orderId,
      stopId: rows[0].id,
      pin: req.body?.pin,
      by: 'store',
    });
    res.json({ ok: true, status: order.status, stops: order.stops.map((stop) => ({ id: stop.id, released: stop.released })) });
  } catch (error) {
    next(error);
  }
});

// Liberar / cambiar conductor por demora: reabre el pedido al Radar tras la espera.
router.post('/orders/:orderId/release-courier', requireStore, async (req, res, next) => {
  try {
    const order = await releaseCourierByDelay({
      orderId: req.params.orderId,
      storeId: req.store.id,
      actor: req.user.email,
    });
    res.json({ ok: true, status: order.status, courier: null });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', requireStore, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         (SELECT count(*)::int FROM order_stops st JOIN orders o ON o.id = st.order_id
           WHERE st.store_id = $1 AND o.created_at::date = current_date) AS orders_today,
         (SELECT count(*)::int FROM order_stops WHERE store_id = $1 AND released = false) AS pending_stops,
         (SELECT COALESCE(sum(oi.price_cents * oi.qty), 0)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE oi.store_id = $1 AND o.created_at::date = current_date AND o.status <> 'cancelled') AS revenue_today_cents`,
      [req.store.id],
    );
    res.json({
      stats: {
        ordersToday: rows[0].orders_today,
        pendingStops: rows[0].pending_stops,
        revenueTodayCents: rows[0].revenue_today_cents,
        isAdminView: isAdmin(req.user),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

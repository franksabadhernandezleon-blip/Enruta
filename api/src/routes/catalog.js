import { Router } from 'express';
import { googleClientId, vapidPublicKey } from '../config.js';
import { bannedNow, httpError, optionalAuth, requireAuth } from '../auth.js';
import { query } from '../db.js';
import { createOrder, loadOrder, quoteCart, serializeOrder } from '../orders.js';
import { getSettings, publicSettings } from '../settings.js';

const router = Router();

const storeCard = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  logoUrl: row.logo_url,
  bannerUrl: row.banner_url,
  open: row.open,
  rating: Number(row.rating),
  productCount: Number(row.product_count || 0),
});

// Público: sin dirección ni teléfono del local (privacidad de la tienda).
router.get('/config', async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json({
      settings: publicSettings(settings),
      vapidPublicKey,
      googleClientId: googleClientId || null,
      pushReady: Boolean(vapidPublicKey),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stores', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, (SELECT count(*) FROM products p WHERE p.store_id = s.id AND p.active) AS product_count
         FROM stores s ORDER BY s.open DESC, s.rating DESC, s.name ASC`,
    );
    res.json({ stores: rows.map(storeCard) });
  } catch (error) {
    next(error);
  }
});

router.get('/stores/:slug', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM stores WHERE slug = $1', [req.params.slug]);
    if (!rows[0]) throw httpError(404, 'Esa tienda no existe.');

    const products = await query(
      `SELECT id, name, description, price_cents, stock, weight_kg, image_url, requires_confirmation, position
         FROM products WHERE store_id = $1 AND active ORDER BY position ASC, name ASC`,
      [rows[0].id],
    );

    res.json({
      store: storeCard(rows[0]),
      products: products.rows.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.price_cents,
        stock: product.stock,
        weightKg: Number(product.weight_kg),
        imageUrl: product.image_url,
        requiresConfirmation: product.requires_confirmation,
        position: product.position,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Cotización multi-tienda: desglose de paradas extra y total en USD y Bs.
router.post('/quote', async (req, res, next) => {
  try {
    const built = await quoteCart({
      cart: req.body?.cart,
      destination: req.body?.destination,
      dynamic: Boolean(req.body?.dynamic),
    });

    res.json({
      lines: built.lines.map((line) => ({
        productId: line.product.id,
        name: line.name,
        qty: line.qty,
        priceCents: line.priceCents,
        lineTotalCents: line.lineTotalCents,
        storeId: line.storeId,
        storeName: line.storeName,
      })),
      stops: built.stops.map((stop) => ({ storeId: stop.storeId, storeName: stop.storeName })),
      subtotalCents: built.subtotalCents,
      deliveryCents: built.deliveryCents,
      totalCents: built.totalCents,
      bcvRate: Number(built.settings.bcv_rate),
      totalBs: Math.round((built.totalCents / 100) * Number(built.settings.bcv_rate) * 100) / 100,
      distanceKm: built.quote.distanceKm,
      extraStops: built.quote.extraStops,
      legs: built.quote.legs,
      breakdown: built.quote.breakdown,
      overWeight: built.overWeight,
      weightKg: built.weightKg,
      maxWeightKg: Number(built.settings.max_weight_kg),
      requiresConfirmation: built.requiresConfirmation,
      dynamicFeeEnabled: built.settings.dynamic_fee_enabled,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/orders', optionalAuth, async (req, res, next) => {
  try {
    if (bannedNow(req.user)) throw httpError(403, 'Tu cuenta está suspendida.');
    const order = await createOrder({
      cart: req.body?.cart,
      destination: req.body?.destination,
      customer: req.body?.customer,
      paymentMethod: req.body?.paymentMethod,
      paymentRef: req.body?.paymentRef,
      notes: req.body?.notes,
      dynamic: Boolean(req.body?.dynamic),
      user: req.user,
    });
    res.status(201).json({ order: serializeOrder(order, { view: 'customer' }) });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/mine', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 30',
      [req.user.id],
    );
    const orders = [];
    for (const row of rows) {
      orders.push(serializeOrder(await loadOrder({ id: row.id }), { view: 'customer' }));
    }
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:code', async (req, res, next) => {
  try {
    const order = await loadOrder({ code: req.params.code });
    if (!order) throw httpError(404, 'No encontramos ese pedido.');
    res.json({ order: serializeOrder(order, { view: 'customer' }) });
  } catch (error) {
    next(error);
  }
});

export default router;

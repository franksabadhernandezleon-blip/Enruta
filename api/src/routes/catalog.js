import path from 'node:path';
import { Router } from 'express';
import { googleClientId, vapidPublicKey } from '../config.js';
import { bannedNow, httpError, isAdmin, optionalAuth, requireAuth } from '../auth.js';
import { query } from '../db.js';
import { createOrder, loadOrder, quoteCart, serializeOrder } from '../orders.js';
import {
  addProof,
  canSeeProof,
  findProof,
  listOrderProofs,
  proofPath,
  removeProofFile,
  serializeProof,
} from '../proofs.js';
import { getSettings, publicSettings } from '../settings.js';
import { proofUpload } from '../uploads.js';

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

// Público: buscador de la pestaña "Buscar" (tiendas y productos).
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ query: q, stores: [], products: [] });
    const like = `%${q}%`;

    const [storeRows, productRows] = await Promise.all([
      query(
        `SELECT s.*, (SELECT count(*) FROM products p WHERE p.store_id = s.id AND p.active) AS product_count
           FROM stores s
          WHERE s.name ILIKE $1 OR s.description ILIKE $1
          ORDER BY s.open DESC, s.rating DESC, s.name ASC LIMIT 12`,
        [like],
      ),
      query(
        `SELECT p.id, p.name, p.description, p.price_cents, p.image_url, p.stock,
                s.name AS store_name, s.slug AS store_slug, s.open AS store_open
           FROM products p JOIN stores s ON s.id = p.store_id
          WHERE p.active AND (p.name ILIKE $1 OR p.description ILIKE $1)
          ORDER BY p.name ASC LIMIT 30`,
        [like],
      ),
    ]);

    res.json({
      query: q,
      stores: storeRows.rows.map(storeCard),
      products: productRows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        priceCents: row.price_cents,
        imageUrl: row.image_url,
        stock: row.stock,
        storeName: row.store_name,
        storeSlug: row.store_slug,
        storeOpen: row.store_open,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stores', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, (SELECT count(*) FROM products p WHERE p.store_id = s.id AND p.active) AS product_count
         FROM stores s
        WHERE s.is_active = true
        ORDER BY s.open DESC, s.rating DESC, s.name ASC`,
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
      // Las coordenadas de la tienda permiten dibujar las paradas en el mapa del checkout.
      stops: built.stops.map((stop) => ({
        storeId: stop.storeId,
        storeName: stop.storeName,
        lat: Number(stop.lat),
        lng: Number(stop.lng),
      })),
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

// El pedido llega como multipart cuando trae la foto del comprobante de pago
// (obligatoria salvo que el pedido se cierre por WhatsApp con la tienda).
router.post('/orders', optionalAuth, proofUpload.single('proof'), async (req, res, next) => {
  try {
    if (bannedNow(req.user)) throw httpError(403, 'Tu cuenta está suspendida.');

    let body = req.body || {};
    if (typeof body.payload === 'string') {
      try {
        body = JSON.parse(body.payload);
      } catch {
        throw httpError(400, 'No pudimos leer los datos del pedido.');
      }
    }

    const paymentMethod = String(body.paymentMethod || '');
    const proofRequired = paymentMethod.toLowerCase() !== 'whatsapp';
    if (proofRequired && !req.file) {
      throw httpError(400, 'Adjunta la foto del comprobante de pago para registrar tu pedido.');
    }

    const order = await createOrder({
      cart: body.cart,
      destination: body.destination,
      customer: body.customer,
      paymentMethod: body.paymentMethod,
      paymentRef: body.paymentRef,
      notes: body.notes,
      dynamic: Boolean(body.dynamic),
      user: req.user,
      addressId: body.addressId || body.customer?.addressId,
      reference: body.reference || body.customer?.reference,
    });

    let proofs = [];
    if (req.file) {
      try {
        await addProof({ orderId: order.id, file: req.file });
        proofs = (await listOrderProofs(order.id)).map(serializeProof);
      } catch (error) {
        await removeProofFile(req.file);
        throw error;
      }
    }

    res.status(201).json({ order: serializeOrder(order, { view: 'customer' }), proofs });
  } catch (error) {
    await removeProofFile(req.file);
    next(error);
  }
});

// Comprobantes del pedido: los sube el cliente (solo fotos) y los ven las tiendas de la ruta.
router.get('/orders/:code/proofs', requireAuth, async (req, res, next) => {
  try {
    const order = await loadOrder({ code: req.params.code });
    if (!order) throw httpError(404, 'No encontramos ese pedido.');

    const isCustomer = Boolean(req.user) && order.customer_id === req.user.id;
    const { rows: owned } = await query(
      `SELECT 1 FROM order_stops st JOIN stores s ON s.id = st.store_id
        WHERE st.order_id = $1 AND (s.owner_id = $2 OR lower(s.owner_email) = lower($3)) LIMIT 1`,
      [order.id, req.user.id, req.user.email],
    );
    if (!isCustomer && !owned.length && !isAdmin(req.user)) {
      throw httpError(403, 'No puedes ver los comprobantes de este pedido.');
    }

    const proofs = (await listOrderProofs(order.id)).map((proof) =>
      serializeProof({ ...proof, order_code: order.code }),
    );
    res.json({ proofs, canUpload: isCustomer || isAdmin(req.user) });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:code/proofs', requireAuth, proofUpload.single('image'), async (req, res, next) => {
  try {
    const order = await loadOrder({ code: req.params.code });
    if (!order) throw httpError(404, 'No encontramos ese pedido.');
    if (order.customer_id !== req.user.id && !isAdmin(req.user)) {
      throw httpError(403, 'Solo el cliente del pedido puede enviar comprobantes.');
    }
    if (order.status === 'cancelled') throw httpError(400, 'Este pedido fue cancelado.');
    if (!req.file) throw httpError(400, 'Adjunta una foto del comprobante de pago.');

    const proof = await addProof({ orderId: order.id, file: req.file });
    res.status(201).json({ proof: serializeProof({ ...proof, order_code: order.code }) });
  } catch (error) {
    await removeProofFile(req.file);
    next(error);
  }
});

// Foto del comprobante: privada, solo para el cliente, la tienda y el admin.
router.get('/proofs/:id/photo', requireAuth, async (req, res, next) => {
  try {
    const proof = await findProof(req.params.id);
    if (!proof) throw httpError(404, 'Ese comprobante ya no está disponible.');
    if (!isAdmin(req.user) && !(await canSeeProof({ proof, user: req.user }))) {
      throw httpError(403, 'No puedes ver este comprobante.');
    }
    res.type(proof.mime_type || path.extname(proof.file_name));
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.sendFile(proofPath(proof.file_name));
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

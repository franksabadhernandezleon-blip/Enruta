import { Router } from 'express';
import { httpError, requireAuth, requireRole } from '../auth.js';
import { query } from '../db.js';
import {
  acceptOrder,
  deliverOrder,
  loadOrder,
  raiseSos,
  releaseStop,
  serializeOrder,
  setChecklist,
} from '../orders.js';

const router = Router();

router.use(requireAuth, requireRole('courier', 'admin'));

const loadFull = async (id) => {
  const order = await loadOrder({ id });
  if (!order) throw httpError(404, 'Ese pedido no existe.');
  return order;
};

const courierView = (order) => ({
  ...serializeOrder(order, { view: 'courier' }),
  earningsCents: order.courier_commission_cents,
  mine: order.courier_id,
});

// Radar: itinerario completo (paradas, distancias y ganancia) antes de aceptar.
router.get('/orders/ready', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id FROM orders WHERE status = 'ready' AND courier_id IS NULL ORDER BY created_at ASC LIMIT 30`,
    );
    const orders = [];
    for (const row of rows) {
      orders.push(courierView(await loadFull(row.id)));
    }
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/mine', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id FROM orders WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 40`,
      [req.user.id],
    );
    const orders = [];
    for (const row of rows) {
      orders.push(courierView(await loadFull(row.id)));
    }
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    res.json({ order: courierView(await loadFull(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/accept', async (req, res, next) => {
  try {
    const order = await acceptOrder({ orderId: req.params.id, courier: req.user });
    res.json({ order: courierView(order) });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/checklist', async (req, res, next) => {
  try {
    const order = await setChecklist({ orderId: req.params.id, items: req.body?.items });
    res.json({ order: courierView(order) });
  } catch (error) {
    next(error);
  }
});

// Liberación de parada por PIN: el motorizado puede validarlo y sincronizar después.
router.post('/orders/:id/stops/:stopId/release', async (req, res, next) => {
  try {
    const order = await releaseStop({
      orderId: req.params.id,
      stopId: req.params.stopId,
      pin: req.body?.pin,
      by: req.body?.offline ? 'courier-offline' : 'courier',
    });
    res.json({ ok: true, status: order.status, stops: order.stops.map((stop) => ({ id: stop.id, released: stop.released })) });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/deliver', async (req, res, next) => {
  try {
    const order = await deliverOrder({ orderId: req.params.id, code: req.body?.code, courier: req.user });
    res.json({ order: courierView(order) });
  } catch (error) {
    next(error);
  }
});

router.post('/sos', async (req, res, next) => {
  try {
    const result = await raiseSos({
      courier: req.user,
      orderId: req.body?.orderId || null,
      lat: req.body?.lat,
      lng: req.body?.lng,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Caché offline: PINs de los pedidos activos para validar sin señal.
router.get('/pins', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.id, o.code, o.pickup_pin, o.delivery_code, o.status,
              json_agg(json_build_object('id', st.id, 'storeId', st.store_id, 'storeName', st.store_name,
                                         'released', st.released, 'seq', st.seq) ORDER BY st.seq) AS stops
         FROM orders o JOIN order_stops st ON st.order_id = o.id
        WHERE o.courier_id = $1 AND o.status NOT IN ('delivered','cancelled')
        GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.user.id],
    );
    res.json({
      orders: rows.map((row) => ({
        id: row.id,
        code: row.code,
        pickupPin: row.pickup_pin,
        deliveryCode: row.delivery_code,
        status: row.status,
        stops: row.stops,
      })),
      cachedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Billetera virtual: acumula comisiones y permite pedir liquidación.
router.get('/wallet', async (req, res, next) => {
  try {
    const [entries, payouts, totals] = await Promise.all([
      query('SELECT * FROM wallet_entries WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]),
      query('SELECT * FROM payout_requests WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]),
      query(
        `SELECT
           COALESCE(sum(CASE WHEN kind = 'earning' THEN amount_cents ELSE 0 END), 0)::int AS earned,
           COALESCE(sum(CASE WHEN kind = 'payout' THEN amount_cents ELSE 0 END), 0)::int AS paid`,
        [req.user.id],
      ),
    ]);

    const requested = await query(
      "SELECT COALESCE(sum(amount_cents), 0)::int AS total FROM payout_requests WHERE courier_id = $1 AND status = 'requested'",
      [req.user.id],
    );

    const earned = totals.rows[0].earned;
    const paid = totals.rows[0].paid;
    const pending = requested.rows[0].total;

    res.json({
      balanceCents: earned - paid - pending,
      earnedCents: earned,
      paidCents: paid,
      pendingCents: pending,
      entries: entries.rows.map((entry) => ({
        id: entry.id,
        orderCode: entry.order_code,
        amountCents: entry.amount_cents,
        kind: entry.kind,
        note: entry.note,
        createdAt: entry.created_at,
      })),
      payouts: payouts.rows.map((payout) => ({
        id: payout.id,
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

router.post('/payouts', async (req, res, next) => {
  try {
    const amountCents = Math.max(0, Math.round(Number(req.body?.amountCents) || 0));
    if (amountCents < 100) throw httpError(400, 'El monto mínimo de liquidación es 1,00 USD.');

    const { rows } = await query(
      `SELECT
         COALESCE((SELECT sum(amount_cents) FROM wallet_entries WHERE courier_id = $1 AND kind = 'earning'), 0)::int AS earned,
         COALESCE((SELECT sum(amount_cents) FROM wallet_entries WHERE courier_id = $1 AND kind = 'payout'), 0)::int AS paid,
         COALESCE((SELECT sum(amount_cents) FROM payout_requests WHERE courier_id = $1 AND status = 'requested'), 0)::int AS pending`,
      [req.user.id],
    );
    const available = rows[0].earned - rows[0].paid - rows[0].pending;
    if (amountCents > available) {
      throw httpError(400, `Tu saldo disponible es ${(available / 100).toFixed(2)} USD.`);
    }

    const inserted = await query(
      "INSERT INTO payout_requests (courier_id, amount_cents) VALUES ($1, $2) RETURNING *",
      [req.user.id, amountCents],
    );
    await query('INSERT INTO crm_events (email, kind, note) VALUES ($1, $2, $3)', [
      req.user.email,
      'payout',
      `Solicitud de liquidación por ${(amountCents / 100).toFixed(2)} USD`,
    ]);
    res.status(201).json({ payout: { id: inserted.rows[0].id, amountCents, status: 'requested' } });
  } catch (error) {
    next(error);
  }
});

export default router;

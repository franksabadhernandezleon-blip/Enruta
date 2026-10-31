import { Router } from 'express';
import { httpError, isDriverSuspended, requireAuth, requireRole } from '../auth.js';
import { query } from '../db.js';
import {
  acceptOrder,
  cancelOrder,
  deliverOrder,
  loadOrder,
  raiseSos,
  releaseStop,
  saveCourierLocation,
  serializeOrder,
  setChecklist,
  triggerRedAlert,
} from '../orders.js';

const router = Router();

router.use(requireAuth, requireRole('courier', 'admin', 'motorizado', 'conductor', 'repartidor'));

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

// Radar: los viajes y entregas aparecen filtrados por el rol de transporte del usuario.
router.get('/orders/ready', async (req, res, next) => {
  try {
    // Si el conductor está suspendido o en Alerta Roja, el radar queda completamente bloqueado
    const { rows: userRows } = await query(
      'SELECT risk_level, cancellation_count, suspended_until, banned_permanent, banned_until FROM users WHERE id = $1',
      [req.user.id],
    );
    const user = userRows[0] || req.user;
    if (isDriverSuspended(user)) {
      return res.json({
        orders: [],
        radarLocked: true,
        riskLevel: user.risk_level,
        suspendedUntil: user.suspended_until,
        reason: 'Tu radar está bloqueado. Tu cuenta se encuentra suspendida por alerta de riesgo/fraude.',
      });
    }

    const role = String(req.user.role || '').toLowerCase();

    let whereClause = "WHERE courier_id IS NULL AND status IN ('pending','picking','ready')";

    if (role === 'motorizado') {
      whereClause += " AND (order_type = 'mototaxi' AND (vehicle_type = 'moto' OR vehicle_type IS NULL))";
    } else if (role === 'conductor') {
      whereClause += " AND (order_type = 'mototaxi' AND vehicle_type = 'carro')";
    } else if (role === 'repartidor') {
      whereClause += " AND (order_type = 'delivery' OR order_type IS NULL)";
    }

    const { rows } = await query(
      `SELECT id FROM orders ${whereClause} ORDER BY created_at ASC LIMIT 30`,
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
    const order = await setChecklist({ orderId: req.params.id, items: req.body?.items, pin: req.body?.pin });
    res.json({ order: courierView(order) });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/start', async (req, res, next) => {
  try {
    const order = await setChecklist({ orderId: req.params.id, pin: req.body?.pin });
    res.json({ order: courierView(order) });
  } catch (error) {
    next(error);
  }
});

// Validación de PIN en tiempo real por el motorizado
router.post('/orders/:id/validate-pin', async (req, res, next) => {
  try {
    const order = await loadOrder({ id: req.params.id });
    if (!order) throw httpError(404, 'Ese pedido no existe.');

    const pin = String(req.body?.pin || '').trim();
    if (!pin) throw httpError(400, 'Ingresa el PIN del cliente para validar.');

    if (pin !== String(order.delivery_code || '').trim()) {
      const { rows } = await query(
        'UPDATE orders SET pin_failed_attempts = pin_failed_attempts + 1 WHERE id = $1 RETURNING pin_failed_attempts',
        [order.id],
      );
      const attempts = rows[0]?.pin_failed_attempts || 1;
      if (attempts >= 3) {
        await triggerRedAlert({
          driverId: req.user.id,
          reason: '3 intentos fallidos de validar PIN de seguridad',
          orderCode: order.code,
        });
        throw httpError(403, 'Has intentado ingresar el PIN incorrecto 3 veces. Tu cuenta ha sido suspendida por 72 horas (Alerta Roja).');
      }
      throw httpError(400, `PIN incorrecto. Intento ${attempts} de 3.`);
    }

    res.json({ ok: true, valid: true });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    const order = await cancelOrder({
      orderId: req.params.id,
      reason: req.body?.reason || 'Cancelado por el conductor',
      actor: 'courier',
      courier: req.user,
    });
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

// Ubicación en vivo: la tienda la ve en su mini-mapa mientras la ruta está activa.
router.post('/location', async (req, res, next) => {
  try {
    const result = await saveCourierLocation({
      courier: req.user,
      lat: req.body?.lat,
      lng: req.body?.lng,
      orderId: req.body?.orderId || null,
    });
    res.json(result);
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
    const [entries, payouts, totals, uRows] = await Promise.all([
      query('SELECT * FROM wallet_entries WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]),
      query('SELECT * FROM payout_requests WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]),
      query(
        `SELECT
           COALESCE(sum(CASE WHEN kind = 'earning' THEN amount_cents ELSE 0 END), 0)::int AS earned,
           COALESCE(sum(CASE WHEN kind = 'payout' THEN amount_cents ELSE 0 END), 0)::int AS paid
         FROM wallet_entries WHERE courier_id = $1`,
        [req.user.id],
      ),
      query(
        'SELECT risk_level, cancellation_count, suspended_until, consecutive_completed_trips, banned_permanent, banned_until FROM users WHERE id = $1',
        [req.user.id],
      ),
    ]);
    const courierInfo = uRows.rows[0] || req.user;

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
      courierRisk: {
        riskLevel: courierInfo.risk_level || 'green',
        cancellationCount: courierInfo.cancellation_count || 0,
        suspendedUntil: courierInfo.suspended_until,
        consecutiveCompletedTrips: courierInfo.consecutive_completed_trips || 0,
        isSuspended: isDriverSuspended(courierInfo),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/payouts', async (req, res, next) => {
  try {
    const { rows: uRows } = await query(
      'SELECT risk_level, suspended_until, banned_permanent, banned_until FROM users WHERE id = $1',
      [req.user.id],
    );
    const user = uRows[0] || req.user;
    if (isDriverSuspended(user) || user.risk_level === 'red') {
      throw httpError(403, 'Tu billetera está congelada debido a una suspensión por alerta de riesgo/fraude.');
    }

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

import { randomInt } from 'node:crypto';
import { httpError } from './auth.js';
import { query } from './db.js';
import { courierWaitMinutes } from './config.js';
import { buildQuote, haversineKm, splitCommission } from './delivery.js';
import { notifyAdmins, notifyCouriers, notifyEmail } from './push.js';
import { getSettings } from './settings.js';

const pin4 = () => String(randomInt(1000, 10000));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const nextOrderCode = async () => {
  const { rows } = await query("SELECT nextval('order_code_seq') AS value");
  return `ENR-${rows[0].value}`;
};

const crm = (kind, note, { email = null, orderCode = null } = {}) =>
  query('INSERT INTO crm_events (email, order_code, kind, note) VALUES ($1, $2, $3, $4)', [
    email,
    orderCode,
    kind,
    note,
  ]);

export const loadStoreIds = async (ids) => {
  if (!ids.length) return [];
  const { rows } = await query('SELECT * FROM stores WHERE id = ANY($1::uuid[])', [ids]);
  return rows;
};

/** Arma items, paradas y cotización a partir de un carrito. */
export const quoteCart = async ({ cart = [], destination, dynamic = false }) => {
  if (!Array.isArray(cart) || !cart.length) throw httpError(400, 'Tu carrito está vacío.');
  if (!destination || !Number.isFinite(Number(destination.lat)) || !Number.isFinite(Number(destination.lng))) {
    throw httpError(400, 'Necesitamos el punto de entrega en el mapa.');
  }

  const settings = await getSettings();
  // Solo ids con forma de uuid: un carrito viejo puede traer líneas sin producto.
  const productIds = cart.map((line) => String(line?.productId ?? '').trim()).filter((id) => UUID_RE.test(id));
  if (!productIds.length) {
    throw httpError(400, 'Los productos de tu carrito ya no están disponibles. Vuelve a agregarlos desde el catálogo.');
  }
  const { rows: products } = await query(
    `SELECT p.*, s.name AS store_name, s.slug AS store_slug, s.lat AS store_lat, s.lng AS store_lng,
            s.address AS store_address, s.phone AS store_phone, s.owner_email, s.open AS store_open
       FROM products p JOIN stores s ON s.id = p.store_id
      WHERE p.id = ANY($1::uuid[]) AND p.active`,
    [productIds],
  );

  if (!products.length) throw httpError(400, 'Los productos de tu carrito ya no están disponibles.');

  const lines = [];
  let subtotalCents = 0;
  let weightKg = 0;
  let requiresConfirmation = false;

  for (const line of cart) {
    const product = products.find((row) => row.id === String(line.productId));
    if (!product) continue;
    const qty = Math.max(1, Math.min(50, Number(line.qty) || 1));
    if (product.stock < qty) {
      throw httpError(409, `No hay suficiente stock de "${product.name}" (quedan ${product.stock}).`);
    }
    subtotalCents += product.price_cents * qty;
    weightKg += Number(product.weight_kg) * qty;
    if (product.requires_confirmation) requiresConfirmation = true;
    lines.push({
      product,
      qty,
      name: product.name,
      priceCents: product.price_cents,
      storeId: product.store_id,
      storeName: product.store_name,
      lineTotalCents: product.price_cents * qty,
    });
  }

  if (!lines.length) throw httpError(400, 'Los productos de tu carrito ya no están disponibles.');

  const stops = [];
  for (const line of lines) {
    if (stops.some((stop) => stop.storeId === line.storeId)) continue;
    const product = line.product;
    stops.push({
      storeId: product.store_id,
      storeName: product.store_name,
      storeAddress: product.store_address,
      storePhone: product.store_phone,
      ownerEmail: product.owner_email,
      lat: product.store_lat,
      lng: product.store_lng,
    });
  }

  const quote = buildQuote({ settings, stops, destination, dynamic });
  const roundedWeight = Math.round(weightKg * 100) / 100;
  const overWeight = roundedWeight > Number(settings.max_weight_kg);

  return {
    settings,
    lines,
    stops,
    quote,
    subtotalCents,
    weightKg: roundedWeight,
    overWeight,
    requiresConfirmation,
    deliveryCents: quote.deliveryCents,
    totalCents: subtotalCents + quote.deliveryCents,
  };
};

export const createOrder = async ({ cart, destination, customer, paymentMethod, paymentRef, notes, dynamic, user, addressId, reference }) => {
  const built = await quoteCart({ cart, destination, dynamic });

  if (built.overWeight) {
    throw httpError(
      400,
      `El pedido pesa ${built.weightKg} kg y supera el límite de ${built.settings.max_weight_kg} kg del delivery.`,
    );
  }

  // La tasa BCV se congela aquí: el recibo guarda la tasa del día de la compra.
  const rate = Number(built.settings.bcv_rate);
  const totalBs = Math.round((built.totalCents / 100) * rate * 100) / 100;
  const { courierCents, platformCents } = splitCommission(built.quote, built.deliveryCents);
  const code = await nextOrderCode();

  const { rows } = await query(
    `INSERT INTO orders (code, customer_id, customer_name, customer_phone, address, lat, lng,
                         pickup_pin, delivery_code, subtotal_cents, delivery_cents, total_cents,
                         bcv_rate, total_bs, distance_km, extra_stops, dynamic_fee_applied, max_weight_kg,
                         payment_method, payment_ref, notes, courier_commission_cents, platform_commission_cents,
                         address_id, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     RETURNING *`,
    [
      code,
      user?.id || null,
      String(customer?.name || user?.name || '').slice(0, 120),
      String(customer?.phone || user?.phone || '').slice(0, 40),
      String(customer?.address || '').slice(0, 240),
      Number(destination.lat),
      Number(destination.lng),
      pin4(),
      pin4(),
      built.subtotalCents,
      built.deliveryCents,
      built.totalCents,
      rate,
      totalBs,
      built.quote.distanceKm,
      built.quote.extraStops,
      built.quote.dynamicApplied,
      Number(built.settings.max_weight_kg),
      String(paymentMethod || '').slice(0, 40),
      String(paymentRef || '').slice(0, 80),
      String(notes || '').slice(0, 300),
      courierCents,
      platformCents,
      addressId || customer?.addressId || null,
      reference || customer?.reference || null,
    ],
  );

  const order = rows[0];

  for (const line of built.lines) {
    await query(
      `INSERT INTO order_items (order_id, product_id, store_id, store_name, name, qty, price_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [order.id, line.product.id, line.storeId, line.storeName, line.name, line.qty, line.priceCents],
    );
    await query('UPDATE products SET stock = GREATEST(0, stock - $2), updated_at = now() WHERE id = $1', [
      line.product.id,
      line.qty,
    ]);
  }

  let seq = 0;
  for (const stop of built.stops) {
    seq += 1;
    await query(
      `INSERT INTO order_stops (order_id, store_id, store_name, store_address, store_phone, lat, lng, seq, extra_fee_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        order.id,
        stop.storeId,
        stop.storeName,
        stop.storeAddress,
        stop.storePhone,
        stop.lat,
        stop.lng,
        seq,
        seq === 1 ? 0 : built.settings.extra_stop_cents,
      ],
    );
  }

  // Deducción de billetera por tienda: (total_productos * 0.07) + delivery_tienda
  for (const stop of built.stops) {
    const storeProductsCents = built.lines
      .filter((line) => line.storeId === stop.storeId)
      .reduce((sum, line) => sum + line.lineTotalCents, 0);

    const storeDeliveryFeeCents = stop.extraFeeCents || 0; // O la cuota base si es la única
    const storeDeductionCents = Math.round(storeProductsCents * 0.07) + storeDeliveryFeeCents;
    const storeDeductionUsd = storeDeductionCents / 100;

    await query(
      `UPDATE stores
          SET wallet_balance = wallet_balance - $2,
              is_active = CASE WHEN (wallet_balance - $2) <= $3 THEN false ELSE is_active END
        WHERE id = $1`,
      [stop.storeId, storeDeductionUsd, Number(built.settings.max_negative_balance || -10.0)],
    );
  }

  await crm('order', `Pedido ${code} por ${(built.totalCents / 100).toFixed(2)} USD`, {
    email: order.customer_phone ? null : user?.email || null,
    orderCode: code,
  });

  // El pedido entra al Radar de los motorizados de inmediato, sin PIN ni liberación previa.
  await notifyCouriers({
    title: `Nuevo pedido ${code} en el radar`,
    body: `${built.stops.length} parada(s) · ${Number(built.quote.distanceKm).toFixed(1)} km · delivery ${(
      built.deliveryCents / 100
    ).toFixed(2)} USD`,
    url: '/repartidor',
    tag: `radar-${order.id}`,
  }).catch(() => 0);

  const adminEmails = (built.settings.admin_emails || []).map((email) => String(email).toLowerCase());
  await notifyAdmins(adminEmails, {
    title: `Nuevo pedido ${code}`,
    body: `${order.customer_name || 'Cliente'} · ${(built.totalCents / 100).toFixed(2)} USD · ${built.stops.length} parada(s)`,
    url: '/tuteteno',
    tag: `order-${order.id}`,
  }).catch(() => 0);

  for (const stop of built.stops) {
    await notifyEmail(stop.ownerEmail, {
      title: `Nueva orden ${code}`,
      body: `Tienes una orden de ${stop.storeName} por preparar.`,
      url: '/mitienda',
      tag: `order-${order.id}-${stop.storeId}`,
    }).catch(() => 0);
  }

  return loadOrder({ id: order.id });
};

/** Crea una solicitud de carrera en Mototaxi/Movilidad (sin tiendas ni columna store_id). */
export const createMototaxiOrder = async ({
  user,
  order_type = 'mototaxi',
  vehicle_type = 'moto',
  origin_lat,
  origin_lng,
  origin_address = '',
  destination_lat,
  destination_lng,
  destination_address = '',
  reference = '',
  total,
  customer_name,
  customer_phone,
  paymentMethod = 'efectivo',
}) => {
  const origLat = Number(origin_lat);
  const origLng = Number(origin_lng);
  const destLat = Number(destination_lat);
  const destLng = Number(destination_lng);

  if (!Number.isFinite(origLat) || !Number.isFinite(origLng) || !Number.isFinite(destLat) || !Number.isFinite(destLng)) {
    throw httpError(400, 'Faltan coordenadas válidas de origen o destino.');
  }

  const settings = await getSettings();
  const rate = Number(settings.bcv_rate || 36.5);
  const cleanVehicle = String(vehicle_type).toLowerCase() === 'carro' ? 'carro' : 'moto';

  const distanceKm = haversineKm({ lat: origLat, lng: origLng }, { lat: destLat, lng: destLng });

  let calculatedCents = 150;
  if (cleanVehicle === 'carro') {
    const baseCents = Number(settings.taxi_base_fee_cents || 250);
    const perKmCents = Number(settings.taxi_per_km_cents || 100);
    calculatedCents = Math.max(baseCents, Math.round(baseCents + distanceKm * perKmCents));
  } else {
    const baseCents = Number(settings.moto_base_fee_cents || 150);
    const perKmCents = Number(settings.moto_per_km_cents || 60);
    calculatedCents = Math.max(baseCents, Math.round(baseCents + distanceKm * perKmCents));
  }

  const totalVal = total !== undefined ? Math.max(0.50, Number(total)) : calculatedCents / 100;
  const totalCents = Math.round(totalVal * 100);
  const totalBs = Math.round((totalCents / 100) * rate * 100) / 100;

  const courierCommissionCents = Math.round(totalCents * 0.90);
  const platformCommissionCents = Math.round(totalCents * 0.10);

  const code = await nextOrderCode();

  const origAddr = String(origin_address || '').slice(0, 240);
  const destAddr = String(destination_address || reference || `Viaje en ${cleanVehicle === 'carro' ? 'Carro' : 'Moto'}`).slice(0, 240);

  const { rows } = await query(
    `INSERT INTO orders (
      code, order_type, vehicle_type, origin_lat, origin_lng, origin_address, destination_lat, destination_lng,
      customer_id, customer_name, customer_phone, address, lat, lng, pickup_pin, delivery_code,
      subtotal_cents, delivery_cents, total_cents, bcv_rate, total_bs, distance_km, extra_stops,
      payment_method, notes, courier_commission_cents, platform_commission_cents, reference, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 'ready'
    ) RETURNING *`,
    [
      code,
      'mototaxi',
      cleanVehicle,
      origLat,
      origLng,
      origAddr,
      destLat,
      destLng,
      user?.id || null,
      String(customer_name || user?.name || 'Cliente').slice(0, 120),
      String(customer_phone || user?.phone || '').slice(0, 40),
      destAddr,
      destLat,
      destLng,
      pin4(),
      pin4(),
      0,
      totalCents,
      totalCents,
      rate,
      totalBs,
      distanceKm,
      0,
      String(paymentMethod || 'efectivo').slice(0, 40),
      String(reference || '').slice(0, 300),
      courierCommissionCents,
      platformCommissionCents,
      String(reference || '').slice(0, 200),
    ],
  );

  const order = rows[0];

  await crm('order', `Solicitud Viaje ${code} (${cleanVehicle}) por ${totalVal.toFixed(2)} USD`, {
    email: user?.email || null,
    orderCode: code,
  });

  await notifyCouriers({
    title: `🚗/🏍️ Solicitud de Viaje ${code}`,
    body: `Vehículo: ${cleanVehicle.toUpperCase()} · Distancia ${distanceKm.toFixed(1)} km · Carrera ${totalVal.toFixed(2)} USD`,
    url: '/repartidor',
    tag: `radar-${order.id}`,
  }).catch(() => 0);

  return loadOrder({ id: order.id });
};

export const loadOrder = async ({ id, code } = {}) => {
  const filter = id ? 'id = $1' : 'code = $1';
  const { rows } = await query(`SELECT * FROM orders WHERE ${filter}`, [id || code]);
  const order = rows[0];
  if (!order) return null;

  const [items, stops] = await Promise.all([
    query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY store_name, name', [order.id]),
    query('SELECT * FROM order_stops WHERE order_id = $1 ORDER BY seq', [order.id]),
  ]);

  return { ...order, items: items.rows, stops: stops.rows };
};

export const serializeOrder = (order, { view = 'customer' } = {}) => {
  const full = view === 'admin' || view === 'courier';
  return {
    id: order.id,
    code: order.code,
    orderType: order.order_type || 'delivery',
    vehicleType: order.vehicle_type || 'moto',
    originLat: order.origin_lat ? Number(order.origin_lat) : undefined,
    originLng: order.origin_lng ? Number(order.origin_lng) : undefined,
    originAddress: order.origin_address || (order.order_type === 'mototaxi' ? 'Punto de recogida del pasajero' : undefined),
    destinationLat: order.destination_lat ? Number(order.destination_lat) : undefined,
    destinationLng: order.destination_lng ? Number(order.destination_lng) : undefined,
    destinationAddress: order.address || order.reference,
    status: order.status,
    sos: order.sos,
    createdAt: order.created_at,
    acceptedAt: order.accepted_at,
    deliveredAt: order.delivered_at,
    cancelledAt: order.cancelled_at,
    customerName: order.customer_name,
    customerPhone: full ? order.customer_phone : undefined,
    address: order.address,
    addressId: order.address_id,
    reference: order.reference,
    lat: order.lat,
    lng: order.lng,
    deliveryCode: view === 'customer' || view === 'admin' ? order.delivery_code : undefined,
    pickupPin: full ? order.pickup_pin : undefined,
    subtotalCents: order.subtotal_cents,
    deliveryCents: order.delivery_cents,
    totalCents: order.total_cents,
    bcvRate: Number(order.bcv_rate),
    totalBs: Number(order.total_bs),
    distanceKm: Number(order.distance_km),
    extraStops: order.extra_stops,
    dynamicFeeApplied: order.dynamic_fee_applied,
    maxWeightKg: Number(order.max_weight_kg),
    paymentMethod: order.payment_method,
    paymentRef: order.payment_ref,
    notes: order.notes,
    courier: order.courier_id ? { name: order.courier_name, phone: full || true ? order.courier_phone : null } : null,
    courierCommissionCents: full ? order.courier_commission_cents : undefined,
    platformCommissionCents: view === 'admin' ? order.platform_commission_cents : undefined,
    checklist: order.checklist,
    items: (order.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      qty: item.qty,
      priceCents: item.price_cents,
      storeId: item.store_id,
      storeName: item.store_name,
    })),
    stops: (order.stops || []).map((stop) => ({
      id: stop.id,
      storeId: stop.store_id,
      storeName: stop.store_name,
      seq: stop.seq,
      released: stop.released,
      releasedAt: stop.released_at,
      releasedBy: stop.released_by,
      extraFeeCents: stop.extra_fee_cents,
      lat: full ? stop.lat : undefined,
      lng: full ? stop.lng : undefined,
      storeAddress: full ? stop.store_address : undefined,
      storePhone: full ? stop.store_phone : undefined,
    })),
  };
};

export const releaseStop = async ({ orderId, stopId, pin, by = 'store' }) => {
  const order = await loadOrder({ id: orderId });
  if (!order) throw httpError(404, 'Ese pedido no existe.');
  if (String(pin || '').trim() !== order.pickup_pin) {
    throw httpError(400, 'El PIN de retiro no coincide. Pídelo de nuevo al motorizado.');
  }

  const stop = order.stops.find((row) => row.id === stopId) || order.stops[0];
  if (!stop) throw httpError(404, 'Ese pedido no tiene paradas.');

  await query(
    'UPDATE order_stops SET released = true, released_at = now(), released_by = $2 WHERE id = $1',
    [stop.id, by],
  );

  const { rows: pending } = await query(
    'SELECT count(*)::int AS total FROM order_stops WHERE order_id = $1 AND released = false',
    [order.id],
  );

  const allReleased = pending[0].total === 0;
  let updated = order;

  if (allReleased && ['pending', 'picking'].includes(order.status)) {
    const { rows } = await query(
      "UPDATE orders SET status = 'ready', updated_at = now() WHERE id = $1 RETURNING id",
      [order.id],
    );
    if (rows[0]) {
      updated = await loadOrder({ id: order.id });
      await notifyCouriers({
        title: `Pedido ${order.code} listo`,
        body: `${order.stops.length} parada(s) · ${Number(order.distance_km).toFixed(1)} km · delivery ${(
          order.delivery_cents / 100
        ).toFixed(2)} USD`,
        url: '/repartidor',
        tag: `ready-${order.id}`,
      }).catch(() => 0);
    }
  } else if (order.status === 'pending') {
    await query("UPDATE orders SET status = 'picking', updated_at = now() WHERE id = $1", [order.id]);
    updated = await loadOrder({ id: order.id });
  }

  await crm('release', `Parada ${stop.store_name} liberada en ${order.code}`, { orderCode: order.code });
  return updated;
};

// Anti-choque: el pedido se bloquea para el primero que acepta.
// Se puede aceptar desde que la tienda recibe el pedido (pending/picking): el PIN de
// retiro se valida después, en la tienda, y no bloquea el Radar.
export const acceptOrder = async ({ orderId, courier }) => {
  const order = await loadOrder({ id: orderId });
  if (!order) throw httpError(404, 'Ese pedido no existe.');

  // Si es un servicio de transporte (mototaxi/taxi), verificar si el conductor supera el límite de deuda
  if (order.order_type === 'mototaxi' || order.order_type === 'taxi') {
    const settings = await getSettings();
    const maxDebt = Number(settings.max_debt_usd || 10.00);
    const { rows: courierRows } = await query('SELECT wallet_balance FROM users WHERE id = $1', [courier.id]);
    const balance = Number(courierRows[0]?.wallet_balance || 0);
    // Un saldo negativo por debajo de -maxDebt indica exceso de deuda acumulada por comisiones
    if (balance <= -maxDebt) {
      throw httpError(
        403,
        `No puedes aceptar más viajes porque tu deuda por comisiones ($${Math.abs(balance).toFixed(2)} USD) supera el límite permitido ($${maxDebt.toFixed(2)} USD). Por favor cancela tu saldo pendiente para continuar.`,
      );
    }
  }

  const { rows } = await query(
    `UPDATE orders SET courier_id = $2, courier_name = $3, courier_phone = $4,
                       status = 'accepted', accepted_at = now(), updated_at = now()
      WHERE id = $1 AND courier_id IS NULL AND status IN ('pending','picking','ready')
      RETURNING id`,
    [orderId, courier.id, courier.name || courier.email, courier.phone || null],
  );

  if (!rows[0]) throw httpError(409, 'Ese pedido ya no está disponible: otro motorizado lo tomó.');

  const updatedOrder = await loadOrder({ id: orderId });
  await crm('accepted', `Pedido ${updatedOrder.code} aceptado por ${updatedOrder.courier_name}`, { orderCode: updatedOrder.code });
  await notifyStores(updatedOrder, {
    title: `Motorizado asignado en ${updatedOrder.code}`,
    body: `${updatedOrder.courier_name} va en camino a tu tienda. Dicta el PIN de retiro cuando llegue.`,
    url: '/mitienda',
    tag: `courier-${updatedOrder.id}`,
  }).catch(() => 0);

  return updatedOrder;
};

const notifyStores = async (order, payload) => {
  const storeIds = [...new Set((order.stops || []).map((stop) => stop.store_id).filter(Boolean))];
  if (!storeIds.length) return 0;
  const { rows } = await query(
    'SELECT owner_email FROM stores WHERE id = ANY($1::uuid[]) AND owner_email IS NOT NULL',
    [storeIds],
  );
  let sent = 0;
  for (const row of rows) {
    sent += await notifyEmail(row.owner_email, payload).catch(() => 0);
  }
  return sent;
};

/**
 * Estado de la liberación manual del dueño: se habilita cuando pasan los minutos de
 * espera desde la asignación y el motorizado todavía no retiró el pedido en esa tienda.
 */
export const courierReleaseState = (order, stopId = null) => {
  const stops = order.stops || [];
  const arrived = stopId
    ? stops.some((stop) => stop.id === stopId && stop.released)
    : stops.length > 0 && stops.every((stop) => stop.released);
  const assignedAt = order.accepted_at ? new Date(order.accepted_at).getTime() : null;
  const availableAt = assignedAt ? assignedAt + courierWaitMinutes * 60000 : null;
  const remainingMs = availableAt ? availableAt - Date.now() : null;

  return {
    courierAssigned: Boolean(order.courier_id),
    arrived,
    waitMinutes: courierWaitMinutes,
    availableAt: availableAt ? new Date(availableAt).toISOString() : null,
    remainingSeconds: remainingMs === null ? null : Math.max(0, Math.ceil(remainingMs / 1000)),
    canRelease:
      Boolean(order.courier_id) &&
      !arrived &&
      !['delivered', 'cancelled'].includes(order.status) &&
      remainingMs !== null &&
      remainingMs <= 0,
  };
};

/** Reasignación manual por demora: el pedido vuelve al Radar para otro motorizado. */
export const releaseCourierByDelay = async ({ orderId, storeId = null, actor = 'store' }) => {
  const order = await loadOrder({ id: orderId });
  if (!order) throw httpError(404, 'Ese pedido no existe.');
  if (['delivered', 'cancelled'].includes(order.status)) throw httpError(409, 'Ese pedido ya está cerrado.');
  if (!order.courier_id) throw httpError(409, 'Ese pedido no tiene motorizado asignado.');
  if (storeId && !order.stops.some((stop) => stop.store_id === storeId)) {
    throw httpError(403, 'Ese pedido no incluye tu tienda.');
  }

  const state = courierReleaseState(order, storeId);
  if (state.arrived) throw httpError(409, 'Ese motorizado ya retiró el pedido: no hay nada que liberar.');
  if (!state.canRelease) {
    const minutes = state.remainingSeconds ? Math.ceil(state.remainingSeconds / 60) : courierWaitMinutes;
    throw httpError(409, `Todavía faltan ${minutes} min de espera desde la asignación.`);
  }

  await query(
    `UPDATE orders SET courier_id = NULL, courier_name = NULL, courier_phone = NULL,
                       accepted_at = NULL, checklist = NULL, status = 'ready', updated_at = now()
      WHERE id = $1`,
    [order.id],
  );

  await crm('delay', `Pedido ${order.code} liberado por demora del motorizado (${actor})`, {
    orderCode: order.code,
  });
  await notifyCouriers({
    title: `Pedido ${order.code} liberado de nuevo`,
    body: 'La tienda lo liberó por demora del motorizado. Tómalo si te conviene.',
    url: '/repartidor',
    tag: `reopen-${order.id}`,
  }).catch(() => 0);

  return loadOrder({ id: order.id });
};

/** Última posición conocida del motorizado, para el mapa en vivo del dueño. */
export const saveCourierLocation = async ({ courier, lat, lng, orderId = null }) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw httpError(400, 'Ubicación inválida.');
  }

  const { rows } = await query(
    `INSERT INTO courier_locations (courier_id, lat, lng, order_id, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (courier_id) DO UPDATE
        SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, order_id = EXCLUDED.order_id, updated_at = now()
     RETURNING updated_at`,
    [courier.id, latitude, longitude, orderId],
  );
  return { ok: true, updatedAt: rows[0].updated_at };
};

export const loadCourierLocation = async (courierId) => {
  if (!courierId) return null;
  const { rows } = await query('SELECT lat, lng, updated_at FROM courier_locations WHERE courier_id = $1', [
    courierId,
  ]);
  if (!rows[0]) return null;
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lng), updatedAt: rows[0].updated_at };
};

export const setChecklist = async ({ orderId, items }) => {
  const order = await loadOrder({ id: orderId });
  if (!order) throw httpError(404, 'Ese pedido no existe.');

  // Diferenciación de lógica delivery vs transporte de personas
  const isTransport = order.order_type === 'mototaxi' || order.order_type === 'taxi';
  let checklistData;

  if (isTransport) {
    // En transporte de personas se registra el inicio de viaje con pasajero a bordo
    checklistData = {
      passenger_onboard: true,
      safety_verified: true,
      at: new Date().toISOString(),
    };
  } else {
    // En pedidos de comida/tienda se validan los 3 puntos físicos del paquete
    const clean = (Array.isArray(items) ? items : []).slice(0, 3).map(Boolean);
    if (clean.length < 3 || clean.some((value) => !value)) {
      throw httpError(400, 'Debes marcar los 3 puntos del checklist antes de iniciar la ruta.');
    }
    checklistData = { empaque: true, productos: true, contenido: true, at: new Date().toISOString() };
  }

  const { rows } = await query(
    "UPDATE orders SET checklist = $2::jsonb, status = 'on_route', updated_at = now() WHERE id = $1 RETURNING id",
    [orderId, JSON.stringify(checklistData)],
  );
  if (!rows[0]) throw httpError(404, 'Ese pedido no existe.');
  return loadOrder({ id: orderId });
};

export const deliverOrder = async ({ orderId, code, courier }) => {
  const order = await loadOrder({ id: orderId });
  if (!order) throw httpError(404, 'Ese pedido no existe.');
  if (String(code || '').trim() !== order.delivery_code) {
    throw httpError(400, 'El código de entrega no coincide con el recibo del cliente.');
  }
  if (order.delivered_at) throw httpError(409, 'Ese pedido ya fue entregado.');

  await query(
    `UPDATE orders SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE id = $1`,
    [order.id],
  );

  const courierId = order.courier_id || courier?.id;

  // Liquidación y comisiones según tipo de servicio (Transporte vs Delivery de tiendas)
  if (order.order_type === 'mototaxi' || order.order_type === 'taxi') {
    const platformUsd = (order.platform_commission_cents || 0) / 100;
    if (courierId) {
      await query(
        `UPDATE users SET wallet_balance = wallet_balance - $2 WHERE id = $1`,
        [courierId, platformUsd],
      );
      await query(
        `INSERT INTO wallet_entries (courier_id, order_code, amount_cents, kind, note)
         VALUES ($1, $2, $3, 'commission', $4)`,
        [courierId, order.code, -(order.platform_commission_cents || 0), `Comisión Viaje ${order.code}`],
      );
    }
  } else {
    if (order.courier_commission_cents > 0 && courierId) {
      await query(
        `INSERT INTO wallet_entries (courier_id, order_code, amount_cents, kind, note)
         VALUES ($1, $2, $3, 'earning', $4)`,
        [courierId, order.code, order.courier_commission_cents, `Entrega ${order.code}`],
      );
    }
  }

  await crm('delivered', `Pedido ${order.code} entregado`, { orderCode: order.code });
  return loadOrder({ id: order.id });
};

export const cancelOrder = async ({ orderId, reason = '', actor = 'admin' }) => {
  const order = await loadOrder({ id: orderId });
  if (!order) throw httpError(404, 'Ese pedido no existe.');
  if (order.status === 'delivered') throw httpError(409, 'Un pedido entregado no se puede cancelar.');

  for (const item of order.items) {
    if (!item.product_id) continue;
    await query('UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1', [
      item.product_id,
      item.qty,
    ]);
  }

  await query(
    `UPDATE orders SET status = 'cancelled', cancelled_at = now(), updated_at = now(),
                       courier_commission_cents = 0, platform_commission_cents = 0
      WHERE id = $1`,
    [order.id],
  );
  await query("DELETE FROM wallet_entries WHERE order_code = $1 AND kind = 'earning'", [order.code]);
  await crm('cancel', `Pedido ${order.code} cancelado (${actor}): ${reason || 'sin motivo'}`, {
    orderCode: order.code,
  });

  return loadOrder({ id: order.id });
};

export const raiseSos = async ({ courier, orderId, lat, lng }) => {
  const order = orderId ? await loadOrder({ id: orderId }) : null;
  const settings = await getSettings();

  await query(
    `INSERT INTO sos_alerts (courier_id, courier_name, courier_phone, order_id, order_code, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      courier.id,
      courier.name || courier.email,
      courier.phone || null,
      order?.id || null,
      order?.code || null,
      Number.isFinite(Number(lat)) ? Number(lat) : null,
      Number.isFinite(Number(lng)) ? Number(lng) : null,
    ],
  );

  if (order) await query('UPDATE orders SET sos = true, updated_at = now() WHERE id = $1', [order.id]);
  await crm('sos', `Alerta SOS de ${courier.name || courier.email}${order ? ` en ${order.code}` : ''}`);

  const adminEmails = (settings.admin_emails || []).map((email) => String(email).toLowerCase());
  await notifyAdmins(adminEmails, {
    title: '🚨 SOS motorizado',
    body: `${courier.name || courier.email}${order ? ` · ${order.code}` : ''} · GPS ${
      lat && lng ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` : 'sin señal'
    }`,
    url: '/tuteteno',
    tag: 'sos',
    requireInteraction: true,
  }).catch(() => 0);

  return { ok: true };
};

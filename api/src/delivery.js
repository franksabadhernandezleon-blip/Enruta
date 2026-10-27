const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

export const haversineKm = (from, to) => {
  if (!from || !to) return 0;
  const lat1 = Number(from.lat);
  const lng1 = Number(from.lng);
  const lat2 = Number(to.lat);
  const lng2 = Number(to.lng);
  if ([lat1, lng1, lat2, lng2].some((value) => !Number.isFinite(value))) return 0;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(km * 100) / 100;
};

// Ruta real del pedido: tienda 1 → tienda 2 → … → cliente. Haversine entre paradas.
export const routeLegs = (stops = [], destination) => {
  const points = [...stops, destination].filter(Boolean);
  const legs = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    legs.push({
      from: stops[index]?.storeName || `Parada ${index + 1}`,
      to: index + 1 < stops.length ? stops[index + 1].storeName : 'Cliente',
      km: haversineKm(points[index], points[index + 1]),
    });
  }
  return legs;
};

/**
 * Motor de delivery.
 * fee = base + km facturables + paradas extra (multi-tienda) + tramo Repartidor→Tienda + tarifa dinámica.
 */
export const buildQuote = ({ settings, stops = [], destination, dynamic = false }) => {
  const legs = routeLegs(stops, destination);
  const distanceKm = Math.round(legs.reduce((total, leg) => total + leg.km, 0) * 100) / 100;
  const includedKm = Number(settings.included_km);
  const billableKm = Math.max(0, Math.round((distanceKm - includedKm) * 100) / 100);
  const extraStops = Math.max(0, stops.length - 1);

  const baseCents = settings.base_fee_cents;
  const kmCents = Math.round(billableKm * settings.per_km_cents);
  const extraStopsCents = extraStops * settings.extra_stop_cents;
  const courierLegCents = settings.charge_courier_store_leg ? baseCents : 0;
  const dynamicCents = dynamic && settings.dynamic_fee_enabled ? settings.dynamic_fee_cents : 0;

  const raw =
    settings.free_delivery
      ? 0
      : baseCents + kmCents + extraStopsCents + courierLegCents + dynamicCents;

  const breakdown = [
    { label: 'Tarifa base', amountCents: settings.free_delivery ? 0 : baseCents },
    {
      label: `Distancia (${distanceKm} km, ${includedKm} km incluidos)`,
      amountCents: settings.free_delivery ? 0 : kmCents,
    },
  ];

  if (extraStops > 0) {
    breakdown.push({
      label: `Paradas extra multi-tienda (${extraStops})`,
      amountCents: settings.free_delivery ? 0 : extraStopsCents,
    });
  }
  if (courierLegCents > 0) {
    breakdown.push({ label: 'Tramo Repartidor→Tienda', amountCents: courierLegCents });
  }
  if (dynamicCents > 0) {
    breakdown.push({ label: 'Tarifa dinámica (lluvia / noche)', amountCents: dynamicCents });
  }
  if (settings.free_delivery) {
    breakdown.push({ label: 'Delivery gratis (promoción activa)', amountCents: 0 });
  }

  return {
    distanceKm,
    billableKm,
    includedKm,
    stopsCount: stops.length,
    extraStops,
    legs,
    breakdown,
    deliveryCents: raw,
    dynamicApplied: dynamicCents > 0,
    courierCommissionPct: Number(settings.courier_commission_pct),
    platformCommissionPct: Number(settings.platform_commission_pct),
    personalCourierMode: settings.personal_courier_mode,
    maxWeightKg: Number(settings.max_weight_kg),
  };
};

// Reparto de la tarifa de delivery entre motorizado y plataforma.
export const splitCommission = (quote, deliveryCents) => {
  if (quote.personalCourierMode) {
    return { courierCents: 0, platformCents: deliveryCents };
  }
  const courierCents = Math.round((deliveryCents * quote.courierCommissionPct) / 100);
  return { courierCents, platformCents: deliveryCents - courierCents };
};

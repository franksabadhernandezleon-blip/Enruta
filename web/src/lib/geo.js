const EARTH_RADIUS_KM = 6371;

// Centro de operaciones: Caripito, Monagas.
export const CARIPITO = { lat: 10.1447, lng: -63.1013 };

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
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a))) * 100) / 100;
};

export const mapsLink = (point) =>
  `https://www.google.com/maps/search/?api=1&query=${Number(point?.lat)},${Number(point?.lng)}`;

export const whatsappLink = (phone, message) =>
  `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

// Convierte el punto tocado en el mapa a coordenadas dentro del área de Caripito.
export const pointFromClick = (event, element, spanKm = 6) => {
  const rect = element.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const latSpan = spanKm / 111;
  const lngSpan = latSpan / Math.max(0.2, Math.cos(toRadians(CARIPITO.lat)));
  return {
    lat: Number((CARIPITO.lat + (0.5 - y) * latSpan).toFixed(5)),
    lng: Number((CARIPITO.lng + (x - 0.5) * lngSpan).toFixed(5)),
  };
};

export const relativePosition = (point, spanKm = 6) => {
  const latSpan = spanKm / 111;
  const lngSpan = latSpan / Math.max(0.2, Math.cos(toRadians(CARIPITO.lat)));
  return {
    left: `${((1 + (Number(point.lng) - CARIPITO.lng) / lngSpan) / 2) * 100}%`,
    top: `${((1 - (Number(point.lat) - CARIPITO.lat) / latSpan) / 2) * 100}%`,
  };
};

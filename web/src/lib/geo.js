const EARTH_RADIUS_KM = 6371;
const TILE_SIZE = 256;
const WORLD_METERS = 40075016.686;

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

/* ------------------------- Proyección Web Mercator ------------------------- */
// El fondo del mapa son tiles de OpenStreetMap, así que los pines se ubican con
// la misma proyección que los tiles: lo que se ve y lo que se toca coinciden.

const worldSize = (zoom) => TILE_SIZE * 2 ** zoom;

const project = (lat, lng, zoom) => {
  const size = worldSize(zoom);
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
  const radians = toRadians(safeLat);
  return {
    x: ((Number(lng) + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * size,
  };
};

const unproject = (x, y, zoom) => {
  const size = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {
    lat: Number(((180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))).toFixed(5)),
    lng: Number((((x / size) * 360) - 180).toFixed(5)),
  };
};

/**
 * Encuadre del mapa: zoom y rectángulo (en píxeles de mundo) que cubren
 * `spanKm` de ancho con el aspecto del contenedor.
 */
export const mapView = ({ center = CARIPITO, spanKm = 6, aspect = 1.6 } = {}) => {
  const span = Math.max(0.5, Number(spanKm) || 6);
  const lat = Number(center?.lat ?? CARIPITO.lat);
  const lng = Number(center?.lng ?? CARIPITO.lng);
  const metersAtLatitude = WORLD_METERS * Math.cos(toRadians(lat));
  const metersPerPixel = (span * 1000) / 900;
  const zoom = Math.max(11, Math.min(17, Math.round(Math.log2(metersAtLatitude / (metersPerPixel * TILE_SIZE)))));
  const width = (span * 1000) / (metersAtLatitude / worldSize(zoom));
  const height = width / aspect;
  const middle = project(lat, lng, zoom);
  return { zoom, width, height, x: middle.x - width / 2, y: middle.y - height / 2 };
};

/** Tiles que cubren la vista, con su posición y tamaño en % del contenedor. */
export const mapTiles = (view) => {
  if (!view) return [];
  const limit = 2 ** view.zoom;
  const minX = Math.floor(view.x / TILE_SIZE);
  const maxX = Math.floor((view.x + view.width) / TILE_SIZE);
  const minY = Math.max(0, Math.floor(view.y / TILE_SIZE));
  const maxY = Math.min(limit - 1, Math.floor((view.y + view.height) / TILE_SIZE));

  const tiles = [];
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      const wrapped = ((tx % limit) + limit) % limit;
      tiles.push({
        key: `${view.zoom}-${tx}-${ty}`,
        url: `https://tile.openstreetmap.org/${view.zoom}/${wrapped}/${ty}.png`,
        left: `${((tx * TILE_SIZE - view.x) / view.width) * 100}%`,
        top: `${((ty * TILE_SIZE - view.y) / view.height) * 100}%`,
        width: `${(TILE_SIZE / view.width) * 100}%`,
        height: `${(TILE_SIZE / view.height) * 100}%`,
      });
    }
  }
  return tiles;
};

/** Posición en % (left/top) de un punto dentro de la vista. */
export const viewPosition = (point, view) => {
  if (!point || !view) return { left: '50%', top: '50%' };
  const projected = project(point.lat, point.lng, view.zoom);
  return {
    left: `${((projected.x - view.x) / view.width) * 100}%`,
    top: `${((projected.y - view.y) / view.height) * 100}%`,
  };
};

/** Coordenadas que corresponden al punto tocado dentro del mapa. */
export const pointAt = (clientX, clientY, element, view) => {
  const rect = element.getBoundingClientRect();
  const xRatio = (clientX - rect.left) / rect.width;
  const yRatio = (clientY - rect.top) / rect.height;
  return unproject(view.x + xRatio * view.width, view.y + yRatio * view.height, view.zoom);
};

/* ---------------- API de Geo (proxy backend a Nominatim y OSRM) ---------------- */
/**
 * Convierte un texto de dirección en coordenadas latitud y longitud a través del proxy backend.
 */
export async function geocodeAddress(text) {
  const response = await fetch('/api/geo/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No pudimos encontrar esa dirección.');
  }
  return data;
}

/**
 * Convierte coordenadas (lat, lng) en una dirección legible a través del proxy backend.
 */
export async function reverseGeocode(lat, lng) {
  const response = await fetch('/api/geo/reverse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No pudimos obtener la dirección para estas coordenadas.');
  }
  return data;
}

/**
 * Calcula la ruta y distancia real por carretera usando OSRM a través del proxy backend.
 */
export async function getRoute(origin, destination) {
  const response = await fetch('/api/geo/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No pudimos calcular la ruta.');
  }
  return data;
}

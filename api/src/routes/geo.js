import { Router } from 'express';
import { httpError } from '../auth.js';

const router = Router();

// User-Agent obligatorio exigido por las políticas de uso de Nominatim
const USER_AGENT = 'Enruta/1.0 (contacto@enruta.com)';

// Rate limiter simple en memoria: máximo 1 petición por segundo por IP
const lastRequestByIp = new Map();

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'global';
  const now = Date.now();
  const last = lastRequestByIp.get(ip) || 0;

  if (now - last < 1000) {
    return res.status(429).json({ error: 'Por favor espera un momento entre consultas de ubicación.' });
  }

  lastRequestByIp.set(ip, now);
  next();
};

/**
 * Formatea distancia en metros a texto legible.
 */
function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '0 km';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Formatea duración en segundos a texto legible.
 */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '0 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours} h ${remMins} min`;
}

// POST /api/geo/geocode → { text } → { lat, lng, formattedAddress }
router.post('/geocode', rateLimit, async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) throw httpError(400, 'Ingresa una dirección para buscar.');

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      text,
    )}&format=json&limit=1&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'es',
      },
    });

    if (!response.ok) {
      throw httpError(502, 'No pudimos consultar el servicio de geocodificación de OpenStreetMap.');
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw httpError(404, 'Dirección no encontrada. Intenta especificar más detalles.');
    }

    const result = data[0];
    const lat = Number(result.lat);
    const lng = Number(result.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw httpError(400, 'Las coordenadas obtenidas no son válidas.');
    }

    res.json({
      lat,
      lng,
      formattedAddress: result.display_name || text,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/geo/reverse → { lat, lng } → { formattedAddress }
router.post('/reverse', rateLimit, async (req, res, next) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw httpError(400, 'Coordenadas inválidas.');
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'es',
      },
    });

    if (!response.ok) {
      throw httpError(502, 'No pudimos consultar el servicio de dirección inversa de OpenStreetMap.');
    }

    const data = await response.json();
    const formattedAddress = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    res.json({ formattedAddress });
  } catch (error) {
    next(error);
  }
});

// POST /api/geo/route → { origin: {lat,lng}, destination: {lat,lng} }
// → { polyline: [[lat,lng],...], distanceText, durationText, distanceMeters, durationSeconds }
router.post('/route', async (req, res, next) => {
  try {
    const origin = req.body?.origin;
    const destination = req.body?.destination;

    const lat1 = Number(origin?.lat);
    const lng1 = Number(origin?.lng);
    const lat2 = Number(destination?.lat);
    const lng2 = Number(destination?.lng);

    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      throw httpError(400, 'Coordenadas de origen o destino no válidas.');
    }

    // OSRM espera {lng1},{lat1};{lng2},{lat2}
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;

    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(7000),
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'TimeoutError' || fetchErr.code === 23) {
        return res.status(504).json({ error: 'El servicio de rutas OSRM tardó demasiado en responder.' });
      }
      return res.status(502).json({ error: 'No pudimos conectar con el servicio de rutas OSRM.' });
    }

    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502;
      const message =
        response.status === 429
          ? 'Límite de solicitudes alcanzado en el servicio OSRM. Intenta en unos segundos.'
          : 'No pudimos calcular la ruta en el servicio OSRM.';
      return res.status(status).json({ error: message });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return res.status(502).json({ error: 'Respuesta inválida del servicio de rutas OSRM.' });
    }

    const route = data?.routes?.[0];

    if (!route || !route.geometry?.coordinates) {
      return res.status(404).json({ error: 'No se pudo trazar una ruta entre estos dos puntos.' });
    }

    // OSRM devuelve las coordenadas en formato [lng, lat] → invertimos a [lat, lng] para Leaflet
    const polyline = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

    const distanceMeters = Number(route.distance) || 0;
    const durationSeconds = Number(route.duration) || 0;
    const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;

    res.json({
      polyline,
      distanceKm,
      distanceText: formatDistance(distanceMeters),
      durationText: formatDuration(durationSeconds),
      distanceMeters,
      durationSeconds,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

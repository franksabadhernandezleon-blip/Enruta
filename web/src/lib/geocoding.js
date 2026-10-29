/**
  * OPTIMIZACIÓN DE CUOTA DE GOOGLE MAPS API:
  * Este archivo es la ÚNICA parte de todo el frontend que realiza llamadas
  * directas a la API de Geocoding de Google Maps (Geocoding & Reverse Geocoding).
  *
  * Principios de consumo eficiente de API Key:
  * 1. Las búsquedas de geocodificación (geocodeAddress) NUNCA se ejecutan mientras
  *    el usuario escribe en listas, carritos ni en la pantalla de checkout.
  * 2. Únicamente se invoca geocodeAddress() cuando el usuario guarda una dirección
  *    NUEVA en el formulario AddressFormModal.
  * 3. La geocodificación inversa (reverseGeocode) SOLO se activa cuando el usuario
  *    presiona explícitamente el botón "Usar mi ubicación actual".
  * 4. Una vez guardados las coordenadas (lat, lng) y la dirección de texto en la base de datos,
  *    el checkout y los listados consumen los datos guardados directamente sin realizar
  *    ninguna petición a la API de Geocoding.
  */

const getApiKey = () => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('No se ha configurado VITE_GOOGLE_MAPS_API_KEY en las variables de entorno.');
  }
  return apiKey;
};

/**
 * Convierte un texto de dirección en coordenadas latitud y longitud.
 * @param {string} text - Texto de la dirección ingresada por el usuario.
 * @returns {Promise<{lat: number, lng: number, formattedAddress: string}>}
 */
export async function geocodeAddress(text) {
  const addressText = String(text || '').trim();
  if (!addressText) {
    throw new Error('Ingresa una dirección para buscar.');
  }

  const apiKey = getApiKey();
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    addressText,
  )}&key=${apiKey}`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Error de red al consultar la ubicación. Revisa tu conexión a internet.');
  }

  if (!response.ok) {
    throw new Error('No pudimos conectar con el servicio de mapas de Google.');
  }

  const data = await response.json();

  if (data.status === 'ZERO_RESULTS') {
    throw new Error('Dirección no encontrada. Intenta especificar más detalles (ciudad, sector, calle).');
  }

  if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'RESOURCE_EXHAUSTED') {
    throw new Error('Límite de cuota de la API de Google Maps superado. Inténtalo más tarde.');
  }

  if (data.status === 'REQUEST_DENIED') {
    throw new Error('Acceso denegado a la API de Google Maps. Verifica la clave de API.');
  }

  if (data.status !== 'OK' || !data.results?.[0]) {
    throw new Error(`No se pudo obtener la ubicación para esa dirección (${data.status}).`);
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;

  return {
    lat,
    lng,
    formattedAddress: result.formatted_address || addressText,
  };
}

/**
 * Convierte coordenadas (lat, lng) en una dirección formateada comprensible por humanos.
 * @param {number} lat - Latitud.
 * @param {number} lng - Longitud.
 * @returns {Promise<{formattedAddress: string}>}
 */
export async function reverseGeocode(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Las coordenadas ingresadas no son válidas.');
  }

  const apiKey = getApiKey();
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Error de red al obtener la dirección desde tu ubicación actual.');
  }

  if (!response.ok) {
    throw new Error('No pudimos conectar con el servicio de geocodificación.');
  }

  const data = await response.json();

  if (data.status !== 'OK' || !data.results?.[0]) {
    return { formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` };
  }

  return {
    formattedAddress: data.results[0].formatted_address,
  };
}

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, Route } from 'lucide-react';
import { Spinner } from './ui.jsx';
import { getRoute } from '../lib/geo.js';

// Corregir icono por defecto de Leaflet en React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const defaultCenter = [10.1447, -63.1013]; // Caripito, Monagas

/**
 * Componente de mapa de entrega con OpenStreetMap + Leaflet + OSRM.
 */
export default function DeliveryMap({ origin, destination }) {
  const [routeData, setRouteData] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState('');

  const originLat = Number(origin?.lat);
  const originLng = Number(origin?.lng);
  const destLat = Number(destination?.lat);
  const destLng = Number(destination?.lng);

  const validOrigin = Number.isFinite(originLat) && Number.isFinite(originLng);
  const validDest = Number.isFinite(destLat) && Number.isFinite(destLng);

  useEffect(() => {
    if (!validOrigin || !validDest) return;

    setLoadingRoute(true);
    setRouteError('');

    getRoute({ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng })
      .then((data) => {
        setRouteData(data);
      })
      .catch((err) => {
        setRouteError(err.message || 'No se pudo trazar la ruta de entrega.');
      })
      .finally(() => {
        setLoadingRoute(false);
      });
  }, [originLat, originLng, destLat, destLng, validOrigin, validDest]);

  const handleOpenOpenStreetMap = () => {
    if (!validOrigin || !validDest) return;
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${originLat}%2C${originLng}%3B${destLat}%2C${destLng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const center = validOrigin ? [originLat, originLng] : validDest ? [destLat, destLng] : defaultCenter;

  return (
    <div className="delivery-map-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {loadingRoute && (
        <p className="muted small">
          <Spinner /> Calculando la ruta con OSRM…
        </p>
      )}

      {routeError && <p className="muted small" style={{ color: 'var(--danger, #e53e3e)' }}>{routeError}</p>}

      {routeData && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--bg-subtle, #f5f5f5)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
          <span>
            <Route size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
            Distancia: <strong>{routeData.distanceText}</strong>
          </span>
          <span>
            Tiempo estimado: <strong>{routeData.durationText}</strong>
          </span>
        </div>
      )}

      <div style={{ height: '320px', width: '100%', borderRadius: '0.5rem', overflow: 'hidden' }}>
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {validOrigin && (
            <Marker position={[originLat, originLng]}>
              <Popup>Origen</Popup>
            </Marker>
          )}

          {validDest && (
            <Marker position={[destLat, destLng]}>
              <Popup>Destino</Popup>
            </Marker>
          )}

          {routeData?.polyline && routeData.polyline.length > 0 && (
            <Polyline positions={routeData.polyline} color="#0070f3" weight={5} opacity={0.8} />
          )}
        </MapContainer>
      </div>

      {validOrigin && validDest && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={handleOpenOpenStreetMap}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <Navigation size={16} aria-hidden="true" />
          Navegar en OpenStreetMap
        </button>
      )}
    </div>
  );
}

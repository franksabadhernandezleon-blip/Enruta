import { useCallback, useState } from 'react';
import { GoogleMap, useLoadScript, DirectionsService, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { ExternalLink, Navigation, Route } from 'lucide-react';
import { Spinner } from './ui.jsx';

const libraries = ['places'];
const mapContainerStyle = {
  width: '100%',
  height: '320px',
  borderRadius: '0.5rem',
};

const defaultCenter = { lat: 10.1500, lng: -63.1000 }; // Caripito, Monagas por defecto

/**
 * Componente de mapa de entrega con Google Maps.
 *
 * OPTIMIZACIÓN DE CUOTA DIRECTIONS API:
 * - DirectionsService calcula la ruta UNA SOLA VEZ por entrega (cuando se cargan
 *   las coordenadas de origen y destino), guardando el resultado en el estado `response`.
 * - CERO llamadas por segundo: no se vuelve a pedir la ruta mientras el mapa se renderiza.
 * - Para la navegación activa del repartidor, se incluye un botón directo a la app oficial de Google Maps
 *   (`https://www.google.com/maps/dir/?api=1`), evitando costos adicionales del Navigation SDK.
 */
export default function DeliveryMap({ origin, destination }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const [response, setResponse] = useState(null);
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');

  const directionsCallback = useCallback(
    (res) => {
      if (res !== null && res.status === 'OK') {
        setResponse(res);
        const routeLeg = res.routes[0]?.legs[0];
        if (routeLeg) {
          setDistance(routeLeg.distance?.text || '');
          setDuration(routeLeg.duration?.text || '');
        }
      }
    },
    [],
  );

  const handleOpenGoogleMaps = () => {
    if (!origin || !destination) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!apiKey) {
    return (
      <div className="panel" style={{ padding: '1rem', textAlign: 'center' }}>
        <p className="muted">La clave de Google Maps (VITE_GOOGLE_MAPS_API_KEY) no está configurada.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleOpenGoogleMaps}>
          <ExternalLink size={14} aria-hidden="true" /> Navegar en Google Maps
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="panel" style={{ padding: '1rem', textAlign: 'center' }}>
        <p className="muted">No se pudo cargar el mapa de Google Maps.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenGoogleMaps}>
          <Navigation size={14} aria-hidden="true" /> Navegar en Google Maps
        </button>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <Spinner /> Cargando mapa de entrega…
      </div>
    );
  }

  const originCoords = origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? origin : null;
  const destinationCoords = destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng) ? destination : null;

  return (
    <div className="delivery-map-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {(distance || duration) && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--bg-subtle, #f5f5f5)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
          <span>
            <Route size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
            Distancia: <strong>{distance}</strong>
          </span>
          <span>
            Tiempo estimado: <strong>{duration}</strong>
          </span>
        </div>
      )}

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        zoom={13}
        center={originCoords || destinationCoords || defaultCenter}
      >
        {originCoords && destinationCoords && !response && (
          // Invocación única de Directions API por ruta
          <DirectionsService
            options={{
              origin: originCoords,
              destination: destinationCoords,
              travelMode: 'DRIVING',
            }}
            callback={directionsCallback}
          />
        )}

        {response && (
          <DirectionsRenderer
            options={{
              directions: response,
            }}
          />
        )}

        {originCoords && !response && <Marker position={originCoords} label="Origen" />}
        {destinationCoords && !response && <Marker position={destinationCoords} label="Cliente" />}
      </GoogleMap>

      {originCoords && destinationCoords && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={handleOpenGoogleMaps}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <Navigation size={16} aria-hidden="true" />
          Navegar en Google Maps (App Oficial)
        </button>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bike, LocateFixed, Route } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig } from '../lib/config.jsx';
import { formatBs, formatUsd } from '../lib/format.js';
import { CARIPITO, getRoute, reverseGeocode } from '../lib/geo.js';

// Corregir icono por defecto de Leaflet en React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Componente para capturar toques en el mapa de Leaflet
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MototaxiPage() {
  const { settings } = useConfig();
  const navigate = useNavigate();

  const [originCoords, setOriginCoords] = useState(CARIPITO);
  const [destCoords, setDestCoords] = useState({ lat: 10.1485, lng: -63.1062 });

  const [destAddress, setDestAddress] = useState('');
  const [reference, setReference] = useState('');

  const [routeData, setRouteData] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [loadingGps, setLoadingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const bcvRate = Number(settings.bcvRate || 36.5);

  // Cada vez que cambia el origen o el destino, calcula la ruta con OSRM
  useEffect(() => {
    if (!originCoords || !destCoords) return;

    setLoadingRoute(true);
    getRoute(originCoords, destCoords)
      .then((data) => {
        setRouteData(data);
      })
      .catch(() => {
        setRouteData(null);
      })
      .finally(() => {
        setLoadingRoute(false);
      });
  }, [originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng]);

  // Reverse geocoding del destino cuando cambia
  useEffect(() => {
    let active = true;
    reverseGeocode(destCoords.lat, destCoords.lng)
      .then((res) => {
        if (!active) return;
        if (res?.formattedAddress) {
          setDestAddress(res.formattedAddress);
        }
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, [destCoords.lat, destCoords.lng]);

  const distanceKm = routeData?.distanceKm || 1.2;
  const durationText = routeData?.durationText || '5 min';

  // Tarifa estimada: Base $1.50 + $0.60 / km (mínimo $1.50)
  const calculatedTotalUsd = Math.max(1.5, Math.round((1.5 + distanceKm * 0.6) * 100) / 100);
  const calculatedTotalBs = Math.round(calculatedTotalUsd * bcvRate * 100) / 100;

  const handleMapClick = (coords) => {
    setDestCoords({
      lat: Number(coords.lat.toFixed(5)),
      lng: Number(coords.lng.toFixed(5)),
    });
  };

  const handleUseCurrentLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocalización no soportada en este navegador.');
      return;
    }
    setLoadingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setOriginCoords({ lat, lng });
        setLoadingGps(false);
      },
      () => {
        setError('No pudimos obtener tu ubicación actual.');
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        order_type: 'mototaxi',
        store_id: null,
        origin_lat: originCoords.lat,
        origin_lng: originCoords.lng,
        destination_lat: destCoords.lat,
        destination_lng: destCoords.lng,
        reference: `${destAddress || 'Destino seleccionado en mapa'}${reference.trim() ? `. Ref: ${reference.trim()}` : ''}`,
        total: calculatedTotalUsd,
        paymentMethod: 'efectivo',
      };

      const response = await api.createOrder(payload);

      if (response?.order?.code) {
        navigate(`/pedido/${response.order.code}`);
      } else {
        setError('No pudimos crear la solicitud. Intenta de nuevo.');
      }
    } catch (err) {
      setError(err.message || 'Ocurrió un error al procesar tu solicitud de mototaxi.');
    } finally {
      setSubmitting(false);
    }
  };

  const destMarkerEventHandlers = useMemo(
    () => ({
      dragend(e) {
        const marker = e.target;
        if (marker != null) {
          const latLng = marker.getLatLng();
          setDestCoords({
            lat: Number(latLng.lat.toFixed(5)),
            lng: Number(latLng.lng.toFixed(5)),
          });
        }
      },
    }),
    [],
  );

  return (
    <div className="client-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <ClientHeader />

      <div style={{ position: 'relative', flex: 1, width: '100%' }}>
        {/* Mapa interactivo de Leaflet */}
        <MapContainer
          center={[originCoords.lat, originCoords.lng]}
          zoom={14}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {/* Marcador de Origen (GPS / Salida) */}
          <Marker position={[originCoords.lat, originCoords.lng]}>
            <Popup>
              <b>Tu Origen / Salida</b>
            </Popup>
          </Marker>

          {/* Marcador de Destino (Arrastrable o tocando el mapa) */}
          <Marker
            position={[destCoords.lat, destCoords.lng]}
            draggable
            eventHandlers={destMarkerEventHandlers}
          >
            <Popup>
              <b>Destino Seleccionado</b>
              <br />
              {destAddress || `${destCoords.lat}, ${destCoords.lng}`}
            </Popup>
          </Marker>

          {/* Polyline de la ruta OSRM */}
          {routeData?.polyline && routeData.polyline.length > 0 && (
            <Polyline positions={routeData.polyline} color="#e53e3e" weight={5} opacity={0.8} />
          )}
        </MapContainer>

        {/* Botón flotante de GPS */}
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={loadingGps}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            zIndex: 1000,
            background: '#ffffff',
            color: '#16171b',
            border: 'none',
            borderRadius: '2rem',
            padding: '0.6rem 1rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          {loadingGps ? <Spinner size={16} /> : <LocateFixed size={18} color="#e53e3e" />}
          Usar mi ubicación actual
        </button>

        {/* Indicador de cálculo de ruta */}
        {loadingRoute && (
          <div
            style={{
              position: 'absolute',
              top: '1rem',
              left: '1rem',
              zIndex: 1000,
              background: '#ffffff',
              padding: '0.5rem 0.8rem',
              borderRadius: '1rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Spinner size={14} /> Calculando tarifa...
          </div>
        )}
      </div>

      {/* Bottom Sheet deslizable / panel inferior de solicitud */}
      <div
        style={{
          background: '#ffffff',
          borderTopLeftRadius: '1.25rem',
          borderTopRightRadius: '1.25rem',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
          padding: '1.25rem',
          zIndex: 1001,
          maxHeight: '45vh',
          overflowY: 'auto',
        }}
      >
        <Alert>{error}</Alert>

        <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#666', display: 'block', marginBottom: '0.25rem' }}>
              📍 Toca el mapa para cambiar el destino:
            </label>
            <input
              type="text"
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value)}
              placeholder="Dirección del destino..."
              required
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid #ccc',
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej: Frente a la farmacia, casa azul (opcional)"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.5rem 0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid #ccc',
                fontSize: '0.85rem',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8f9fa',
              padding: '0.75rem 1rem',
              borderRadius: '0.75rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#555' }}>
                <Route size={15} /> {distanceKm.toFixed(1)} km · {durationText}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#888' }}>Tarifa fija en tiempo real</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ fontSize: '1.3rem', color: '#e53e3e', display: 'block' }}>
                {formatUsd(Math.round(calculatedTotalUsd * 100))}
              </strong>
              <small style={{ color: '#666' }}>{formatBs(calculatedTotalBs)}</small>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              background: '#e53e3e',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.85rem',
              fontSize: '1.05rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(229, 62, 62, 0.3)',
            }}
          >
            {submitting ? (
              <>
                <Spinner /> Solicitando mototaxi...
              </>
            ) : (
              <>
                <Bike size={20} />
                Solicitar Mototaxi ({formatUsd(Math.round(calculatedTotalUsd * 100))})
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

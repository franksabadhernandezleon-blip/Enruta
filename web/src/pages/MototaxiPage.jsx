import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bike, Car, LocateFixed, Route, AlertTriangle } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig } from '../lib/config.jsx';
import { formatBs, formatUsd } from '../lib/format.js';
import { CARIPITO, getRoute, reverseGeocode } from '../lib/geo.js';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

  const [vehicleType, setVehicleType] = useState('moto'); // 'moto' | 'carro'
  const [originCoords, setOriginCoords] = useState(CARIPITO);
  const [destCoords, setDestCoords] = useState({ lat: 10.1485, lng: -63.1062 });

  const [destAddress, setDestAddress] = useState('');
  const [reference, setReference] = useState('');

  const [routeData, setRouteData] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [loadingGps, setLoadingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const bcvRate = Number(settings.bcvRate || 36.5);

  // Cada vez que cambia el origen o el destino, se consulta OSRM de manera obligatoria.
  useEffect(() => {
    if (!originCoords || !destCoords) return;

    setLoadingRoute(true);
    setRouteError('');
    setRouteData(null);

    getRoute(originCoords, destCoords)
      .then((data) => {
        if (!data || typeof data.distanceKm !== 'number') {
          throw new Error('No pudimos calcular la ruta por carretera.');
        }
        setRouteData(data);
      })
      .catch((err) => {
        setRouteError(err.message || 'Error al calcular la ruta OSRM. Verifica tu conexión a internet.');
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

  // Tarifas dinámicas desde configuración o valores por defecto
  const isCarro = vehicleType === 'carro';

  const motoBase = Number(settings.moto_base_fee_cents ?? settings.motoBaseFeeCents ?? 150) / 100;
  const motoPerKm = Number(settings.moto_per_km_cents ?? settings.motoPerKmCents ?? 60) / 100;
  const taxiBase = Number(settings.taxi_base_fee_cents ?? settings.taxiBaseFeeCents ?? 250) / 100;
  const taxiPerKm = Number(settings.taxi_per_km_cents ?? settings.taxiPerKmCents ?? 100) / 100;

  const basePrice = isCarro ? taxiBase : motoBase;
  const perKmPrice = isCarro ? taxiPerKm : motoPerKm;

  const distanceKm = routeData ? routeData.distanceKm : 0;
  const durationText = routeData?.durationText || '';

  // Cálculo estricto OSRM: Tarifa Base + (Costo por KM * Distancia OSRM)
  const calculatedTotalUsd = routeData
    ? Math.max(basePrice, Math.round((basePrice + distanceKm * perKmPrice) * 100) / 100)
    : 0;

  const calculatedTotalBs = Math.round(calculatedTotalUsd * bcvRate * 100) / 100;

  const handleMapClick = (coords) => {
    setDestCoords({
      lat: Number(coords.lat.toFixed(5)),
      lng: Number(coords.lng.toFixed(5)),
    });
  };

  const handleUseCurrentLocation = () => {
    setSubmitError('');
    if (!navigator.geolocation) {
      setSubmitError('Geolocalización no soportada en este navegador.');
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
        setSubmitError('No pudimos obtener tu ubicación actual.');
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!routeData || routeError || loadingRoute) {
      setSubmitError('No es posible solicitar el viaje sin una ruta OSRM válida. Revisa tu conexión a internet.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        order_type: 'mototaxi',
        vehicle_type: vehicleType,
        store_id: null,
        origin_lat: originCoords.lat,
        origin_lng: originCoords.lng,
        destination_lat: destCoords.lat,
        destination_lng: destCoords.lng,
        reference: `${destAddress || 'Destino en mapa'}${reference.trim() ? `. Ref: ${reference.trim()}` : ''}`,
        total: calculatedTotalUsd,
        paymentMethod: 'efectivo',
      };

      const response = await api.createOrder(payload);

      if (response?.order?.code) {
        navigate(`/pedido/${response.order.code}`);
      } else {
        setSubmitError('No pudimos crear la solicitud. Intenta de nuevo.');
      }
    } catch (err) {
      setSubmitError(err.message || 'Ocurrió un error al procesar tu solicitud de transporte.');
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

          <Marker position={[originCoords.lat, originCoords.lng]}>
            <Popup>
              <b>Tu Origen / Salida</b>
            </Popup>
          </Marker>

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

          {routeData?.polyline && routeData.polyline.length > 0 && (
            <Polyline positions={routeData.polyline} color="#e53e3e" weight={5} opacity={0.8} />
          )}
        </MapContainer>

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
            <Spinner size={14} /> Calculando distancia OSRM por calles...
          </div>
        )}
      </div>

      <div
        style={{
          background: '#ffffff',
          borderTopLeftRadius: '1.25rem',
          borderTopRightRadius: '1.25rem',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
          padding: '1.25rem',
          zIndex: 1001,
          maxHeight: '48vh',
          overflowY: 'auto',
        }}
      >
        <Alert>{submitError}</Alert>

        {routeError && (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
            }}
          >
            <AlertTriangle size={18} />
            <span>{routeError}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setVehicleType('moto')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.65rem',
              borderRadius: '0.75rem',
              border: vehicleType === 'moto' ? '2px solid #e53e3e' : '1px solid #ccc',
              background: vehicleType === 'moto' ? '#fff5f5' : '#ffffff',
              color: vehicleType === 'moto' ? '#e53e3e' : '#555',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            <Bike size={18} />
            Motorizado 🏍️
          </button>

          <button
            type="button"
            onClick={() => setVehicleType('carro')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.65rem',
              borderRadius: '0.75rem',
              border: vehicleType === 'carro' ? '2px solid #e53e3e' : '1px solid #ccc',
              background: vehicleType === 'carro' ? '#fff5f5' : '#ffffff',
              color: vehicleType === 'carro' ? '#e53e3e' : '#555',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            <Car size={18} />
            Carro 🚗
          </button>
        </div>

        <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#666', display: 'block', marginBottom: '0.25rem' }}>
              📍 Toca o arrastra el pin en el mapa para establecer el destino:
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
                <Route size={15} /> {routeData ? `${distanceKm.toFixed(1)} km · ${durationText}` : 'Calculando ruta...'}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#888' }}>Cobro dinámico por calles (OSRM)</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ fontSize: '1.3rem', color: routeData ? '#e53e3e' : '#aaa', display: 'block' }}>
                {routeData ? formatUsd(Math.round(calculatedTotalUsd * 100)) : '--'}
              </strong>
              <small style={{ color: '#666' }}>{routeData ? formatBs(calculatedTotalBs) : '--'}</small>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || loadingRoute || Boolean(routeError) || !routeData}
            style={{
              width: '100%',
              background: submitting || loadingRoute || routeError || !routeData ? '#a0aec0' : '#e53e3e',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.85rem',
              fontSize: '1.05rem',
              fontWeight: '700',
              cursor: submitting || loadingRoute || routeError || !routeData ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: routeData && !routeError ? '0 4px 12px rgba(229, 62, 62, 0.3)' : 'none',
            }}
          >
            {submitting ? (
              <>
                <Spinner /> Solicitando transporte...
              </>
            ) : loadingRoute ? (
              <>
                <Spinner /> Calculando tarifa...
              </>
            ) : (
              <>
                {isCarro ? <Car size={20} /> : <Bike size={20} />}
                Solicitar {isCarro ? 'Carro' : 'Motorizado'}{' '}
                {routeData ? `(${formatUsd(Math.round(calculatedTotalUsd * 100))})` : ''}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

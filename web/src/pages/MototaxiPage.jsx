import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Bike, Car, LocateFixed, Route, AlertTriangle, LogIn, X } from 'lucide-react';
import { Alert, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useConfig } from '../lib/config.jsx';
import { formatBs, formatUsd } from '../lib/format.js';
import { CARIPITO, getRoute, haversineKm, reverseGeocode } from '../lib/geo.js';

// Configuración de iconos por defecto para Leaflet
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
  const { user } = useAuth();
  const { settings } = useConfig();
  const navigate = useNavigate();

  // Estados principales de la vista
  const [vehicleType, setVehicleType] = useState('moto'); // 'moto' | 'carro'
  const [originCoords, setOriginCoords] = useState(null); // Obligatorio: debe provenir de GPS
  const [hasCurrentLocation, setHasCurrentLocation] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [destCoords, setDestCoords] = useState({ lat: 10.1485, lng: -63.1062 });

  const [originAddress, setOriginAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [reference, setReference] = useState('');

  const [showLoginModal, setShowLoginModal] = useState(false);

  const [routeData, setRouteData] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [isEstimated, setIsEstimated] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [loadingGps, setLoadingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Tasa de cambio BCV
  const bcvRate = Number(settings.bcvRate || 36.5);

  // Solicitud de ubicación GPS obligatoria del usuario
  const requestCurrentLocation = useCallback(() => {
    setGpsError('');
    setSubmitError('');

    if (!navigator.geolocation) {
      setGpsError('Tu navegador o dispositivo no soporta geolocalización GPS.');
      setHasCurrentLocation(false);
      return;
    }

    setLoadingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setOriginCoords({ lat, lng });
        setHasCurrentLocation(true);
        setGpsError('');
        setLoadingGps(false);
      },
      (err) => {
        console.warn('[mototaxi] GPS error:', err);
        setHasCurrentLocation(false);
        setGpsError(
          'La ubicación actual está desactivada o denegada. Es obligatoria para fijar tu punto de recogida. Por favor actívala en tu dispositivo y concede permisos para continuar.',
        );
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  // Solicitar ubicación GPS automáticamente al montar la vista
  useEffect(() => {
    requestCurrentLocation();
  }, [requestCurrentLocation]);

  // Consulta a la API OSRM cada vez que cambia el origen o destino con debounce de 500ms
  useEffect(() => {
    if (!originCoords || !destCoords) return;

    setLoadingRoute(true);
    setRouteError('');

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const data = await getRoute(originCoords, destCoords);
        if (!isMounted) return;

        const km = Number(data?.distanceKm ?? (data?.distanceMeters ? data.distanceMeters / 1000 : null));
        if (!data || typeof km !== 'number' || Number.isNaN(km)) {
          throw new Error('Respuesta de ruta incompleta');
        }

        setRouteData({
          ...data,
          distanceKm: km,
        });
        setIsEstimated(false);
        setRouteError('');
      } catch (err) {
        if (!isMounted) return;
        // OSRM falló o tardó demasiado: usar respaldo Haversine * 1.3
        const straightKm = haversineKm(originCoords, destCoords);
        const estimatedKm = Math.round(straightKm * 1.3 * 100) / 100;

        if (estimatedKm > 0) {
          const estimatedMinutes = Math.max(3, Math.round(estimatedKm * 3));
          setRouteData({
            distanceKm: estimatedKm,
            durationText: `~${estimatedMinutes} min`,
            polyline: [
              [originCoords.lat, originCoords.lng],
              [destCoords.lat, destCoords.lng],
            ],
            isFallback: true,
          });
          setIsEstimated(true);
          setRouteError('No pudimos calcular la ruta. Verifica tu conexión o intenta de nuevo (mostrando tarifa estimada).');
        } else {
          setRouteData(null);
          setIsEstimated(false);
          setRouteError('No pudimos calcular la ruta. Verifica tu conexión o intenta de nuevo.');
        }
      } finally {
        if (isMounted) {
          setLoadingRoute(false);
        }
      }
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [originCoords?.lat, originCoords?.lng, destCoords.lat, destCoords.lng]);

  // Obtener dirección del origen mediante geocodificación inversa
  useEffect(() => {
    if (!originCoords) return;
    let active = true;
    reverseGeocode(originCoords.lat, originCoords.lng)
      .then((res) => {
        if (!active) return;
        if (res?.formattedAddress) {
          setOriginAddress(res.formattedAddress);
        }
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, [originCoords?.lat, originCoords?.lng]);

  // Obtener nombre de la dirección del destino mediante reverse geocoding
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

  // Tarifas dinámicas de movilidad obtenidas de settings
  const isCarro = vehicleType === 'carro';

  // Compatible con publicSettings (camelCase) y admin/direct settings (snake_case)
  const motoBase = Number(settings.motoBaseFeeCents ?? settings.moto_base_fee_cents ?? 150) / 100;
  const motoPerKm = Number(settings.motoPerKmCents ?? settings.moto_per_km_cents ?? 60) / 100;
  const taxiBase = Number(settings.taxiBaseFeeCents ?? settings.taxi_base_fee_cents ?? 250) / 100;
  const taxiPerKm = Number(settings.taxiPerKmCents ?? settings.taxi_per_km_cents ?? 100) / 100;

  const basePrice = isCarro ? taxiBase : motoBase;
  const perKmPrice = isCarro ? taxiPerKm : motoPerKm;

  const distanceKm = routeData ? routeData.distanceKm : 0;
  const durationText = routeData?.durationText || '';

  // Total = Tarifa Base + (Costo por KM * Distancia)
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
    requestCurrentLocation();
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setSubmitError('');

    // Validación 1: El usuario invitado no puede pedir; debe loguearse
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    // Validación 2: El origen debe ser obligatoriamente la ubicación GPS actual
    if (!hasCurrentLocation || !originCoords) {
      setSubmitError('Debes activar y conceder permiso a tu ubicación GPS actual para poder solicitar un transporte.');
      requestCurrentLocation();
      return;
    }

    if (!routeData || loadingRoute) {
      setSubmitError('No es posible solicitar el viaje sin una ruta calculada. Revisa tu conexión a internet.');
      return;
    }

    setSubmitting(true);

    try {
      // Envío de solicitud de servicio de transporte con origen y destino explícitos
      const payload = {
        order_type: vehicleType === 'carro' ? 'taxi' : 'mototaxi',
        vehicle_type: vehicleType,
        store_id: null,
        origin_lat: originCoords.lat,
        origin_lng: originCoords.lng,
        origin_address: originAddress || 'Ubicación actual del pasajero',
        destination_lat: destCoords.lat,
        destination_lng: destCoords.lng,
        destination_address: destAddress || 'Destino seleccionado',
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

  const mapCenter = originCoords ? [originCoords.lat, originCoords.lng] : [CARIPITO.lat, CARIPITO.lng];

  return (
    <div className="client-shell mototaxi-container">
      {/* El encabezado general se oculta en /mototaxi para darle protagonismo limpio al mapa */}

      {/* Modal de inicio de sesión requerido para usuarios invitados */}
      {showLoginModal && (
        <div className="modal-backdrop" style={{ zIndex: 2000 }}>
          <div className="modal" style={{ maxWidth: '400px', width: '90%' }}>
            <header className="modal-head">
              <h2>Iniciar sesión requerido</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowLoginModal(false)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </header>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              <p style={{ margin: 0, fontSize: '0.95rem', color: '#4a5568' }}>
                Para solicitar un mototaxi o taxi en <b>ENRUTA</b> y asignar un conductor de forma segura, debes tener una cuenta activa.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => navigate('/login?next=/mototaxi')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <LogIn size={16} /> Iniciar sesión o Registrarme
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => setShowLoginModal(false)}
                >
                  Volver al mapa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mapa interactivo con altura balanceada */}
      <div className="mototaxi-map-wrapper">
        <MapContainer center={mapCenter} zoom={14} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {originCoords && (
            <Marker position={[originCoords.lat, originCoords.lng]}>
              <Popup>
                <b>🟢 Tu Ubicación Actual (Origen)</b>
                <br />
                {originAddress || 'Punto de partida'}
              </Popup>
            </Marker>
          )}

          <Marker position={[destCoords.lat, destCoords.lng]} draggable eventHandlers={destMarkerEventHandlers}>
            <Popup>
              <b>🔴 Destino Seleccionado</b>
              <br />
              {destAddress || `${destCoords.lat}, ${destCoords.lng}`}
            </Popup>
          </Marker>

          {routeData?.polyline && routeData.polyline.length > 0 && (
            <Polyline positions={routeData.polyline} color="#e53e3e" weight={5} opacity={0.85} />
          )}
        </MapContainer>

        {/* Botón flotante para regresar a las tiendas */}
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Volver a inicio"
          style={{
            position: 'absolute',
            top: '0.85rem',
            left: '0.85rem',
            zIndex: 1000,
            background: '#ffffff',
            color: '#16171b',
            border: 'none',
            borderRadius: '2rem',
            width: '2.5rem',
            height: '2.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={18} />
        </button>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={loadingGps}
          style={{
            position: 'absolute',
            top: '0.85rem',
            right: '0.85rem',
            zIndex: 1000,
            background: hasCurrentLocation ? '#ffffff' : '#fff5f5',
            color: hasCurrentLocation ? '#16171b' : '#c53030',
            border: hasCurrentLocation ? 'none' : '1.5px solid #feb2b2',
            borderRadius: '2rem',
            padding: '0.5rem 0.85rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontWeight: '600',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          {loadingGps ? <Spinner size={14} /> : <LocateFixed size={16} color="#e53e3e" />}
          {hasCurrentLocation ? 'GPS Activo' : 'Activar GPS'}
        </button>

        {loadingRoute && (
          <div
            style={{
              position: 'absolute',
              top: '3.75rem',
              left: '0.85rem',
              zIndex: 1000,
              background: '#ffffff',
              padding: '0.4rem 0.75rem',
              borderRadius: '1rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Spinner size={13} /> Calculando ruta...
          </div>
        )}
      </div>

      {/* Panel inferior confortable para los controles de viaje */}
      <div className="mototaxi-bottom-sheet">
        <Alert>{submitError}</Alert>

        {/* Alerta si el GPS está desactivado */}
        {gpsError && (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              padding: '0.65rem 0.75rem',
              borderRadius: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}>
              <AlertTriangle size={16} />
              <span>Ubicación GPS actual obligatoria</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>{gpsError}</p>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={requestCurrentLocation}
              disabled={loadingGps}
              style={{ alignSelf: 'flex-start', background: '#ffffff', color: '#c53030', border: '1px solid #feb2b2' }}
            >
              {loadingGps ? <Spinner size={12} /> : <LocateFixed size={14} />} Activar / Reintentar GPS
            </button>
          </div>
        )}

        {routeError && (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.8rem',
            }}
          >
            <AlertTriangle size={16} />
            <span>{routeError}</span>
          </div>
        )}

        {/* Selector de vehículo en fila compacta */}
        <div className="mototaxi-type-selector">
          <button
            type="button"
            className={`mototaxi-type-btn ${vehicleType === 'moto' ? 'is-active' : ''}`}
            onClick={() => setVehicleType('moto')}
          >
            <Bike size={18} />
            Moto 🏍️
          </button>

          <button
            type="button"
            className={`mototaxi-type-btn ${vehicleType === 'carro' ? 'is-active' : ''}`}
            onClick={() => setVehicleType('carro')}
          >
            <Car size={18} />
            Carro 🚗
          </button>
        </div>

        {/* Formulario estilizado de viaje */}
        <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: '#4a5568', marginBottom: '0.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ color: '#38a169', fontWeight: 'bold' }}>🟢 Origen (Ubicación actual):</span>
              </div>
              {!hasCurrentLocation && (
                <button
                  type="button"
                  onClick={requestCurrentLocation}
                  disabled={loadingGps}
                  style={{ background: 'transparent', border: 'none', color: '#c53030', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Activar GPS
                </button>
              )}
            </div>
            <div
              style={{
                padding: '0.45rem 0.65rem',
                borderRadius: '0.5rem',
                border: hasCurrentLocation ? '1px solid #cbd5e0' : '1px solid #feb2b2',
                background: hasCurrentLocation ? '#f8fafc' : '#fff5f5',
                fontSize: '0.85rem',
                color: hasCurrentLocation ? '#2d3748' : '#c53030',
              }}
            >
              {loadingGps
                ? 'Obteniendo señal GPS...'
                : hasCurrentLocation
                ? originAddress || 'Ubicación actual obtenida por GPS'
                : 'Ubicación desactivada — Activa tu GPS para continuar'}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#4a5568', marginBottom: '0.2rem' }}>
              <span style={{ color: '#e53e3e', fontWeight: 'bold' }}>🔴 Destino:</span>
              <span style={{ fontSize: '0.75rem', color: '#718096' }}>(Toca o arrastra el pin)</span>
            </div>
            <input
              type="text"
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value)}
              placeholder="Dirección del destino..."
              required
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                borderRadius: '0.5rem',
                border: '1px solid #cbd5e0',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Referencia: casa, color, negocio cercano (opcional)"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '0.5rem',
                border: '1px solid #cbd5e0',
                fontSize: '0.8rem',
              }}
            />
          </div>

          {/* Resumen de tarifa de movilidad */}
          <div className="mototaxi-fare-card">
            <div className="mototaxi-fare-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#4a5568' }}>
                <Route size={14} /> {routeData ? `${distanceKm.toFixed(1)} km · ${durationText}` : 'Calculando...'}
              </div>
              <span style={{ fontSize: '0.7rem', color: isEstimated ? '#c53030' : '#718096' }}>
                {isEstimated ? 'Tarifa estimada' : 'Tarifa por trayecto'}
              </span>
            </div>
            <div className="mototaxi-fare-price">
              <strong style={{ fontSize: '1.15rem', color: routeData ? '#e53e3e' : '#a0aec0', display: 'block', lineHeight: 1.1 }}>
                {routeData ? formatUsd(Math.round(calculatedTotalUsd * 100)) : '--'}
              </strong>
              <small style={{ color: '#718096', fontSize: '0.75rem' }}>{routeData ? formatBs(calculatedTotalBs) : '--'}</small>
            </div>
          </div>

          <button
            type={user ? 'submit' : 'button'}
            onClick={!user ? () => setShowLoginModal(true) : undefined}
            disabled={user && (submitting || loadingRoute || !hasCurrentLocation || !routeData)}
            style={{
              width: '100%',
              background:
                user && (submitting || loadingRoute || !hasCurrentLocation || !routeData)
                  ? '#a0aec0'
                  : '#e53e3e',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.65rem',
              padding: '0.75rem',
              fontSize: '1rem',
              fontWeight: '700',
              cursor:
                user && (submitting || loadingRoute || !hasCurrentLocation || !routeData)
                  ? 'not-allowed'
                  : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: !user || (routeData && hasCurrentLocation) ? '0 4px 12px rgba(229, 62, 62, 0.25)' : 'none',
            }}
          >
            {submitting ? (
              <>
                <Spinner size={16} /> Solicitando viaje...
              </>
            ) : !user ? (
              <>
                <LogIn size={18} />
                Iniciar sesión para pedir {isCarro ? 'Carro' : 'Mototaxi'}
              </>
            ) : !hasCurrentLocation ? (
              <>
                <LocateFixed size={18} />
                Activa tu GPS para pedir transporte
              </>
            ) : loadingRoute ? (
              <>
                <Spinner size={16} /> Calculando tarifa...
              </>
            ) : (
              <>
                {isCarro ? <Car size={18} /> : <Bike size={18} />}
                Pedir {isCarro ? 'Carro' : 'Mototaxi'}{' '}
                {routeData ? `(${formatUsd(Math.round(calculatedTotalUsd * 100))})` : ''}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

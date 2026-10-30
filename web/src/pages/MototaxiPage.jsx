import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike, MapPin, Navigation, Send } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Field, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig } from '../lib/config.jsx';
import { formatBs, formatUsd } from '../lib/format.js';
import { CARIPITO, geocodeAddress, haversineKm, reverseGeocode } from '../lib/geo.js';

export default function MototaxiPage() {
  const { settings } = useConfig();
  const navigate = useNavigate();

  const [pickupText, setPickupText] = useState('');
  const [destText, setDestText] = useState('');
  const [reference, setReference] = useState('');

  const [originCoords, setOriginCoords] = useState(CARIPITO);
  const [destCoords, setDestCoords] = useState({ lat: 10.148, lng: -63.106 });

  const [loadingGps, setLoadingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Tasa BCV y cálculo de tarifa
  const bcvRate = Number(settings.bcvRate || 36.5);
  const distanceKm = haversineKm(originCoords, destCoords);
  // Tarifa base $1.50 + $0.60 por km (mínimo $1.50)
  const calculatedTotalUsd = Math.max(1.5, Math.round((1.5 + distanceKm * 0.6) * 100) / 100);
  const calculatedTotalBs = Math.round(calculatedTotalUsd * bcvRate * 100) / 100;

  const handleUseCurrentLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocalización no soportada en este navegador.');
      return;
    }
    setLoadingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Number(pos.coords.latitude);
          const lng = Number(pos.coords.longitude);
          setOriginCoords({ lat, lng });

          const geoResult = await reverseGeocode(lat, lng).catch(() => null);
          if (geoResult?.formattedAddress) {
            setPickupText(geoResult.formattedAddress);
          } else {
            setPickupText(`Ubicación GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
          }
        } catch {
          setError('No pudimos obtener la dirección exacta de tu ubicación.');
        } finally {
          setLoadingGps(false);
        }
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

    if (!pickupText.trim() || !destText.trim()) {
      setError('Ingresa el punto de origen y el destino.');
      return;
    }

    setSubmitting(true);

    try {
      // Intentar geocodificar destino si no se seleccionó con coordenadas exactas
      let finalDestLat = destCoords.lat;
      let finalDestLng = destCoords.lng;

      try {
        const geocoded = await geocodeAddress(destText.trim());
        if (geocoded && geocoded.lat && geocoded.lng) {
          finalDestLat = Number(geocoded.lat);
          finalDestLng = Number(geocoded.lng);
        }
      } catch {
        // Usar coordenadas estimadas por defecto si falla la geocodificación
      }

      const payload = {
        order_type: 'mototaxi',
        store_id: null,
        origin_lat: originCoords.lat,
        origin_lng: originCoords.lng,
        destination_lat: finalDestLat,
        destination_lng: finalDestLng,
        reference: `${pickupText.trim()} ➔ ${destText.trim()}${reference.trim() ? `. Ref: ${reference.trim()}` : ''}`,
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

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Servicio de Transporte Express</p>
            <h1>Solicitar Mototaxi 🏍️</h1>
            <p className="lede">
              Muévete rápido por Caripito con nuestros motorizados de confianza.
            </p>
          </div>
        </section>

        <section className="panel" style={{ maxWidth: '600px', margin: '0 auto', padding: '1.5rem' }}>
          <Alert>{error}</Alert>

          <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Field label="Punto de Salida / Origen">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={pickupText}
                  onChange={(e) => setPickupText(e.target.value)}
                  placeholder="Ej: Plaza Bolívar de Caripito"
                  required
                  disabled={submitting}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleUseCurrentLocation}
                  disabled={loadingGps || submitting}
                  title="Usar mi ubicación actual"
                >
                  <Navigation size={16} />
                </button>
              </div>
            </Field>

            <Field label="Punto de Llegada / Destino">
              <input
                type="text"
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                placeholder="Ej: Mercado Municipal / Sector Caripe"
                required
                disabled={submitting}
              />
            </Field>

            <Field label="Instrucciones o Referencias para el motorizado (opcional)">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej: Llevo un bolso pequeño, estaré frente a la farmacia"
                disabled={submitting}
              />
            </Field>

            <div
              className="panel"
              style={{
                backgroundColor: 'var(--bg-subtle, #f8f9fa)',
                padding: '1rem',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span className="muted small" style={{ display: 'block' }}>
                  Distancia aprox: {distanceKm.toFixed(1)} km
                </span>
                <strong>Monto del viaje:</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ fontSize: '1.2rem', color: 'var(--primary, #0070f3)', display: 'block' }}>
                  {formatUsd(Math.round(calculatedTotalUsd * 100))}
                </strong>
                <small className="muted">{formatBs(calculatedTotalBs)}</small>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.8rem',
                fontSize: '1rem',
              }}
            >
              {submitting ? (
                <>
                  <Spinner /> Procesando solicitud…
                </>
              ) : (
                <>
                  <Bike size={18} />
                  Solicitar Mototaxi ({formatUsd(Math.round(calculatedTotalUsd * 100))})
                </>
              )}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

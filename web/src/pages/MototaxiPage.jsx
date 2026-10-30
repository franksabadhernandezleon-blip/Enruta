import { useState } from 'react';
import { Bike, MapPin, Navigation, Send } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Field } from '../components/ui.jsx';
import { useConfig } from '../lib/config.jsx';
import { whatsappLink } from '../lib/geo.js';

export default function MototaxiPage() {
  const { settings } = useConfig();
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);
  const [error, setError] = useState('');

  const handleUseLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocalización no soportada en este navegador.');
      return;
    }
    setLoadingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickup(`Ubicación GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
        setLoadingGps(false);
      },
      () => {
        setError('No pudimos obtener tu ubicación actual.');
        setLoadingGps(false);
      }
    );
  };

  const handleRequestMototaxi = (e) => {
    e.preventDefault();
    if (!pickup.trim() || !destination.trim()) {
      setError('Por favor completa el punto de origen y el destino.');
      return;
    }

    const message = `¡Hola ENRUTA! Solicitud de Mototaxi 🏍️\n\n📍 Origen: ${pickup.trim()}\n🎯 Destino: ${destination.trim()}${notes.trim() ? `\n📝 Notas: ${notes.trim()}` : ''}`;
    const link = whatsappLink(settings.whatsappNumber || '584121590242', message);
    window.open(link, '_blank');
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

          <form onSubmit={handleRequestMototaxi} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Field label="Punto de Salida / Origen">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Ej: Plaza Bolívar de Caripito"
                  required
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleUseLocation}
                  disabled={loadingGps}
                  title="Usar mi ubicación actual"
                >
                  <Navigation size={16} />
                </button>
              </div>
            </Field>

            <Field label="Destino">
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Ej: Mercado Municipal / Sector Caripe"
                required
              />
            </Field>

            <Field label="Instrucciones o Referencias (opcional)">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Llevo un bolso pequeño, estaré frente a la farmacia"
              />
            </Field>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
            >
              <Send size={18} />
              Solicitar Mototaxi por WhatsApp
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

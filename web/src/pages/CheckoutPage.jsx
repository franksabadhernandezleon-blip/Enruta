import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Copy, MessageCircle, Route, Truck } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import MapPicker from '../components/MapPicker.jsx';
import { Alert, Field, Spinner, Toggle } from '../components/ui.jsx';
import { saveAddress, useAddress } from '../lib/address.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useCart } from '../lib/cart.jsx';
import { useConfig } from '../lib/config.jsx';
import { formatBs, formatUsd } from '../lib/format.js';
import { buildOrderMessage, whatsappOrderLink } from '../lib/whatsapp.js';

const PAYMENT_LABELS = {
  pagoMovil: 'Pago móvil',
  transferencia: 'Transferencia',
  binance: 'Binance',
};

export default function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useConfig();
  const [address, persistAddress] = useAddress();

  const [destination, setDestination] = useState({ lat: address.lat, lng: address.lng });
  const [label, setLabel] = useState(address.label);
  const [reference, setReference] = useState(address.reference || '');
  const [customer, setCustomer] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [notes, setNotes] = useState('');
  const [dynamic, setDynamic] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('pagoMovil');
  const [paymentRef, setPaymentRef] = useState('');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const payments = settings.payment || {};
  const paymentDetails = payments[paymentMethod] || null;

  const quoteCart = useCallback(async () => {
    if (!cart.lines.length) return;
    setStatus('quoting');
    setError('');
    try {
      const data = await api.quote({ cart: cart.cartPayload, destination, dynamic });
      setQuote(data);
      setStatus('ready');
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    }
  }, [cart.cartPayload, cart.lines.length, destination, dynamic]);

  useEffect(() => {
    quoteCart();
  }, [quoteCart]);

  useEffect(() => {
    if (user) setCustomer((prev) => ({ name: prev.name || user.name || '', phone: prev.phone || user.phone || '' }));
  }, [user]);

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setError('No pudimos copiar automáticamente. Selecciona el texto y cópialo.');
    }
  };

  const markers = useMemo(
    () => cart.stores.map((group) => ({ id: group.storeId, name: group.storeName, lat: 0, lng: 0 })),
    [cart.stores],
  );

  const whatsappMessage = useMemo(() => {
    if (!quote) return '';
    const pseudoOrder = {
      code: 'nuevo',
      totalCents: quote.totalCents,
      totalBs: quote.totalBs,
      bcvRate: quote.bcvRate,
      deliveryCents: quote.deliveryCents,
      distanceKm: quote.distanceKm,
      extraStops: quote.extraStops,
      customerName: customer.name,
      customerPhone: customer.phone,
      notes,
      address: `${label}${reference ? ` (${reference})` : ''}`,
    };
    return buildOrderMessage({
      order: pseudoOrder,
      lines: cart.lines,
      stops: quote.stops,
      address: { ...destination, label, reference },
      settings,
      paymentLabel: quote.requiresConfirmation ? '' : PAYMENT_LABELS[paymentMethod],
    });
  }, [quote, cart.lines, customer, label, reference, notes, destination, settings, paymentMethod]);

  const submit = async () => {
    setError('');
    if (!customer.name.trim()) {
      setError('Escribe el nombre de quien recibe el pedido.');
      return;
    }
    if (!customer.phone.trim()) {
      setError('Escribe un teléfono de contacto.');
      return;
    }
    if (!quote?.requiresConfirmation && !paymentRef.trim()) {
      setError('Registra la referencia del pago para confirmar el pedido.');
      return;
    }

    setStatus('saving');
    try {
      persistAddress({ label, reference, lat: destination.lat, lng: destination.lng });
      const data = await api.createOrder({
        cart: cart.cartPayload,
        destination: { lat: destination.lat, lng: destination.lng },
        customer: { name: customer.name, phone: customer.phone, address: `${label}${reference ? ` (${reference})` : ''}` },
        paymentMethod: quote.requiresConfirmation ? 'whatsapp' : PAYMENT_LABELS[paymentMethod],
        paymentRef: quote.requiresConfirmation ? '' : paymentRef,
        notes,
        dynamic,
      });
      cart.clear();
      navigate(`/pedido/${data.order.code}`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus('ready');
    }
  };

  if (!cart.lines.length) {
    return (
      <div className="client-shell">
        <ClientHeader />
        <main className="page">
          <section className="empty">
            <h2>Tu carrito está vacío</h2>
            <p>Agrega productos de una o varias tiendas para armar la ruta.</p>
            <Link to="/" className="btn btn-primary">
              Ver tiendas
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="page-head">
          <div>
            <p className="eyebrow">Checkout multi-ruta</p>
            <h1>Confirma tu ruta de entrega</h1>
            <p className="lede">
              Toca el mapa para ajustar el punto exacto. Calculamos la distancia real entre las paradas con
              Haversine ({quote?.distanceKm ?? 0} km).
            </p>
          </div>
        </section>

        <Alert>{error}</Alert>

        <div className="checkout-grid">
          <section className="panel">
            <h2>Punto de entrega</h2>
            <MapPicker
              point={destination}
              onChange={(point) => setDestination(point)}
              markers={markers.filter((marker) => Number.isFinite(marker.lat))}
              label="Entrega"
            />
            <div className="field-row">
              <Field label="Nombre de la dirección">
                <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ej: Casa, oficina, vereda" />
              </Field>
              <Field label="Referencia">
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Ej: frente a la panadería"
                />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Quién recibe">
                <input value={customer.name} onChange={(event) => setCustomer((prev) => ({ ...prev, name: event.target.value }))} required />
              </Field>
              <Field label="Teléfono / WhatsApp">
                <input
                  value={customer.phone}
                  onChange={(event) => setCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="0412-1590242"
                  required
                />
              </Field>
            </div>
            <Field label="Notas para el motorizado">
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Portón negro, timbre 2" />
            </Field>
          </section>

          <section className="panel">
            <h2>Desglose del delivery</h2>

            {status === 'quoting' && (
              <p className="muted">
                <Spinner /> Calculando la ruta…
              </p>
            )}

            {quote && (
              <>
                <ol className="route-steps">
                  {quote.stops.map((stop, index) => (
                    <li key={stop.storeId}>
                      <span className="route-index">{index + 1}</span>
                      <div>
                        <strong>{stop.storeName}</strong>
                        <span className="muted">{index === 0 ? 'Primera parada' : 'Parada extra'}</span>
                      </div>
                    </li>
                  ))}
                  <li>
                    <span className="route-index is-client">
                      <Check size={13} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{label || 'Tu dirección'}</strong>
                      <span className="muted">Entrega final</span>
                    </div>
                  </li>
                </ol>

                <ul className="breakdown">
                  {quote.breakdown.map((row) => (
                    <li key={row.label}>
                      <span>{row.label}</span>
                      <b>{formatUsd(row.amountCents)}</b>
                    </li>
                  ))}
                </ul>

                {quote.overWeight && (
                  <Alert tone="warn">
                    Tu pedido pesa {quote.weightKg} kg y supera el límite de {quote.maxWeightKg} kg.
                  </Alert>
                )}

                {quote.dynamicFeeEnabled && (
                  <Toggle
                    checked={dynamic}
                    onChange={setDynamic}
                    label="Lluvia / noche (+ tarifa dinámica)"
                    hint="Aplica el recargo dinámico configurado por ENRUTA."
                  />
                )}

                <div className="summary-row is-total">
                  <span>Total</span>
                  <b>{formatUsd(quote.totalCents)}</b>
                </div>
                <div className="summary-row">
                  <span>Total en bolívares (tasa congelada)</span>
                  <b>{formatBs(quote.totalBs)}</b>
                </div>
                <p className="muted">
                  <Route size={13} aria-hidden="true" /> {quote.extraStops} parada(s) extra · tasa BCV{' '}
                  {Number(quote.bcvRate).toFixed(2)} Bs/USD
                </p>
              </>
            )}
          </section>

          <section className="panel">
            <h2>Forma de pago</h2>

            {quote?.requiresConfirmation ? (
              <div className="hybrid-stock">
                <Alert tone="warn">
                  Tu pedido tiene productos que requieren confirmación de stock. Coordinamos por WhatsApp antes de
                  cobrar.
                </Alert>
                <a
                  className="btn btn-primary btn-block"
                  href={whatsappOrderLink(settings.whatsappNumber, whatsappMessage)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  Enviar pedido por WhatsApp
                </a>
              </div>
            ) : (
              <>
                <div className="payment-tabs">
                  {Object.keys(PAYMENT_LABELS).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`tab${paymentMethod === key ? ' is-active' : ''}`}
                      onClick={() => setPaymentMethod(key)}
                    >
                      {PAYMENT_LABELS[key]}
                    </button>
                  ))}
                </div>

                {paymentDetails ? (
                  <ul className="payment-details">
                    {Object.entries(paymentDetails).map(([key, value]) => (
                      <li key={key}>
                        <span className="muted">{key}</span>
                        <b>{value}</b>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => copy(String(value), `${paymentMethod}-${key}`)}
                          aria-label={`Copiar ${key}`}
                        >
                          {copied === `${paymentMethod}-${key}` ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">El administrador aún no cargó los datos de {PAYMENT_LABELS[paymentMethod]}.</p>
                )}

                <Field label="Referencia del pago">
                  <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} placeholder="Últimos 4 dígitos o nº de operación" />
                </Field>
              </>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={submit}
              disabled={status === 'saving' || !quote}
            >
              <Truck size={16} aria-hidden="true" />
              {status === 'saving' ? 'Generando pedido…' : 'Confirmar pedido'}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <p className="muted small">
              Al confirmar guardamos la tasa BCV de hoy dentro del recibo: si la tasa cambia mañana, tu monto en Bs no
              se mueve.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

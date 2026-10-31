import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  Car,
  Lock,
  MessageCircle,
  Navigation,
  Phone,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import ProofPhoto from '../components/ProofPhoto.jsx';
import { Alert, Field, Modal, Spinner, StatusPill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig } from '../lib/config.jsx';
import { formatBs, formatDate, formatUsd, getOrderStatusLabel, statusLabel } from '../lib/format.js';
import { mapsLink, whatsappLink } from '../lib/geo.js';
import { buildOrderMessage } from '../lib/whatsapp.js';

export default function OrderPage() {
  const { code } = useParams();
  const { settings } = useConfig();
  const [order, setOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [proofs, setProofs] = useState([]);
  const [canUploadProof, setCanUploadProof] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');

    const load = () =>
      (code ? api.order(code).then((data) => ({ order: data.order })) : api.myOrders())
        .then((data) => {
          if (!active) return;
          if (code) setOrder(data.order);
          else setOrders(data.orders);
          setStatus('ready');
        })
        .catch((requestError) => {
          if (!active) return;
          setError(requestError.message);
          setStatus('error');
        });

    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [code]);

  // Comprobantes vigentes del pedido (los vencidos ya no llegan desde la API).
  const loadProofs = useCallback(async () => {
    if (!code) return;
    try {
      const data = await api.orderProofs(code);
      setProofs(data.proofs || []);
      setCanUploadProof(Boolean(data.canUpload));
    } catch {
      setProofs([]);
      setCanUploadProof(false);
    }
  }, [code]);

  useEffect(() => {
    loadProofs();
  }, [loadProofs]);

  const submitReport = async () => {
    if (!reportReason) return;
    setReportSubmitting(true);
    setReportError('');
    setReportMessage('');
    try {
      const res = await api.reportOrder(order.code, {
        reason: reportReason,
        details: reportDetails,
        isFraud: reportReason.includes('por fuera'),
      });
      setReportMessage(res.message || 'Reporte enviado con éxito.');
      setTimeout(() => {
        setReportOpen(false);
        setReportReason('');
        setReportDetails('');
        setReportMessage('');
      }, 2500);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportSubmitting(false);
    }
  };

  const sendProof = async (file) => {
    if (!file) return;
    setProofError('');
    if (!file.type.startsWith('image/')) {
      setProofError('El comprobante debe ser una foto (JPG, PNG, WEBP o GIF).');
      return;
    }
    setProofBusy(true);
    try {
      await api.addOrderProof(code, file);
      await loadProofs();
    } catch (requestError) {
      setProofError(requestError.message);
    } finally {
      setProofBusy(false);
    }
  };

  const message = useMemo(() => {
    if (!order) return '';
    return buildOrderMessage({
      order,
      lines: order.items,
      stops: order.stops,
      address: { label: order.address, lat: order.lat, lng: order.lng },
      settings,
      paymentLabel: order.paymentMethod,
    });
  }, [order, settings]);

  const grouped = useMemo(() => {
    const groups = [];
    for (const item of order?.items || []) {
      let group = groups.find((entry) => entry.storeName === item.storeName);
      if (!group) {
        group = { storeName: item.storeName, items: [], subtotalCents: 0 };
        groups.push(group);
      }
      group.items.push(item);
      group.subtotalCents += item.priceCents * item.qty;
    }
    return groups;
  }, [order]);

  // Diferenciación de lógica delivery vs transporte de personas
  const isTransport =
    order?.orderType === 'mototaxi' ||
    order?.order_type === 'mototaxi' ||
    order?.orderType === 'taxi' ||
    order?.order_type === 'taxi';

  if (!code) {
    return (
      <div className="client-shell">
        <ClientHeader />
        <main className="page">
          <section className="page-head">
            <div>
              <p className="eyebrow">Historial</p>
              <h1>Mis pedidos</h1>
              <p className="lede">Tus pedidos con la tasa BCV congelada del día de la compra.</p>
            </div>
          </section>
          <Alert>{error}</Alert>
          {status === 'loading' && (
            <p className="muted">
              <Spinner /> Cargando…
            </p>
          )}
          {status === 'error' && <p className="muted">Inicia sesión para ver tus pedidos.</p>}
          <ul className="order-list">
            {orders.map((item) => (
              <li key={item.id}>
                <Link to={`/pedido/${item.code}`} className="panel order-row">
                  <div>
                    <strong>{item.code}</strong>
                    <span className="muted">{formatDate(item.createdAt)}</span>
                  </div>
                  <StatusPill status={item.status} label={getOrderStatusLabel(item)} />
                  <b className="price">{formatUsd(item.totalCents)}</b>
                </Link>
              </li>
            ))}
          </ul>
        </main>
      </div>
    );
  }

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <div className="page-actions">
          <Link to="/" className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} aria-hidden="true" />
            Ver todas las tiendas
          </Link>
        </div>

        <Alert>{error}</Alert>
        {status === 'loading' && (
          <p className="muted">
            <Spinner /> Cargando tu pedido…
          </p>
        )}

        {status === 'ready' && order && (
          <div className="order-grid">
            <section className="panel">
              {/* Notificación cuando el motorizado está llegando */}
              {order.status === 'accepted' && order.isCourierNearby && (
                <div
                  style={{
                    background: '#ebf8ff',
                    border: '1.5px solid #3182ce',
                    color: '#2b6cb0',
                    padding: '0.85rem 1rem',
                    borderRadius: '0.65rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    fontWeight: '600',
                  }}
                >
                  <span style={{ fontSize: '1.35rem' }}>🛵</span>
                  <span>El motorizado está llegando. Ten tu PIN listo.</span>
                </div>
              )}

              {/* Recuadro destacado de seguridad con el PIN */}
              {order.deliveryCode && !['delivered', 'cancelled'].includes(order.status) && (
                <div
                  style={{
                    background: '#fefcbf',
                    border: '2px dashed #b7791f',
                    color: '#744210',
                    padding: '1.1rem',
                    borderRadius: '0.75rem',
                    marginBottom: '1.25rem',
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(183, 121, 31, 0.12)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      fontSize: '0.95rem',
                      fontWeight: '700',
                    }}
                  >
                    <Lock size={16} /> Tu código de seguridad es:
                  </div>
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: '900',
                      letterSpacing: '0.35rem',
                      color: '#975a16',
                      margin: '0.25rem 0',
                    }}
                  >
                    {order.deliveryCode}
                  </div>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem', fontWeight: '600', color: '#744210' }}>
                    Dicta este código al motorizado al subir. <u>NUNCA lo compartas por WhatsApp</u>.
                  </p>
                </div>
              )}

              <header className="panel-head">
                <div>
                  <p className="eyebrow">
                    {isTransport
                      ? order.vehicleType === 'carro'
                        ? 'Servicio de Carro / Taxi 🚗'
                        : 'Servicio de Mototaxi 🏍️'
                      : 'Pedido de Tienda'}
                  </p>
                  <h1>{order.code}</h1>
                  <p className="muted">{formatDate(order.createdAt)}</p>
                </div>
                <StatusPill status={order.status} label={getOrderStatusLabel(order)} />
              </header>

              {/* Flujo de estados diferenciado: Transporte vs Delivery de comida */}
              {isTransport ? (
                <ol className="timeline">
                  {[
                    { key: 'ready', label: 'Buscando conductor' },
                    { key: 'accepted', label: 'Conductor asignado' },
                    { key: 'on_route', label: 'Viaje en curso' },
                    { key: 'delivered', label: 'Viaje finalizado' },
                  ].map((step, idx) => {
                    const transportOrder = ['ready', 'accepted', 'on_route', 'delivered'];
                    // Mapeo del estado actual al índice de transporte
                    const currentStatus = ['pending', 'picking'].includes(order.status) ? 'ready' : order.status;
                    const currentIndex = transportOrder.indexOf(currentStatus);
                    const isDone = currentIndex >= idx;
                    return (
                      <li key={step.key} className={isDone ? 'is-done' : ''}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <span>{step.label}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <ol className="timeline">
                  {['pending', 'picking', 'ready', 'accepted', 'on_route', 'delivered'].map((step) => {
                    const order_steps = ['pending', 'picking', 'ready', 'accepted', 'on_route', 'delivered'];
                    const currentIndex = order_steps.indexOf(order.status);
                    const index = order_steps.indexOf(step);
                    return (
                      <li key={step} className={index <= currentIndex ? 'is-done' : ''}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <span>{statusLabel[step]}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {/* Vista de contenido: En transporte se muestran origen y destino claros sin tiendas ni productos */}
              {isTransport ? (
                <div className="order-group" style={{ marginTop: '1.25rem' }}>
                  <h2>Itinerario del viaje</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '0.5rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>🟢</span>
                      <div>
                        <strong>Origen (Punto de recogida):</strong>
                        <p className="muted" style={{ margin: '0.15rem 0' }}>
                          {order.originAddress || 'Ubicación actual del pasajero'}
                        </p>
                        {order.originLat && (
                          <a
                            href={mapsLink({ lat: order.originLat, lng: order.originLng })}
                            target="_blank"
                            rel="noreferrer"
                            className="small"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#2b6cb0' }}
                          >
                            <Navigation size={12} /> Ver origen en mapa
                          </a>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>🔴</span>
                      <div>
                        <strong>Destino (Punto de llegada):</strong>
                        <p className="muted" style={{ margin: '0.15rem 0' }}>
                          {order.reference || order.address || 'Destino seleccionado'}
                        </p>
                        <a
                          href={mapsLink({ lat: order.destinationLat || order.lat, lng: order.destinationLng || order.lng })}
                          target="_blank"
                          rel="noreferrer"
                          className="small"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#2b6cb0' }}
                        >
                          <Navigation size={12} /> Ver destino en mapa
                        </a>
                      </div>
                    </div>

                    <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#4a5568' }}>
                      <span>Vehículo: <b>{order.vehicleType === 'carro' ? 'Carro / Taxi 🚗' : 'Mototaxi 🏍️'}</b></span>
                      <span style={{ margin: '0 0.5rem' }}>·</span>
                      <span>Distancia: <b>{Number(order.distanceKm).toFixed(2)} km</b></span>
                    </div>
                  </div>
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.storeName} className="order-group">
                    <h2>{group.storeName}</h2>
                    <ul className="cart-lines is-compact">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <div className="cart-line-body">
                            <strong>
                              {item.qty}x {item.name}
                            </strong>
                            <span className="muted">
                              {order.stops.find((stop) => stop.storeName === group.storeName)?.released
                                ? 'Retirado por el motorizado'
                                : 'Esperando liberación en tienda'}
                            </span>
                          </div>
                          <b className="price">{formatUsd(item.priceCents * item.qty)}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}

              {!isTransport && (
                <p className="muted">
                  Entrega en {order.address} ·{' '}
                  <a href={mapsLink({ lat: order.lat, lng: order.lng })} target="_blank" rel="noreferrer">
                    ver mapa
                  </a>
                </p>
              )}
            </section>

            <section className="panel receipt">
              <header className="panel-head">
                <div>
                  <h2>
                    <Receipt size={16} aria-hidden="true" /> Recibo con tasa congelada
                  </h2>
                  <p className="muted">Guardamos la tasa BCV del momento de tu compra.</p>
                </div>
              </header>

              {isTransport ? (
                <>
                  <div className="summary-row">
                    <span>Carrera de transporte ({Number(order.distanceKm).toFixed(2)} km)</span>
                    <b>{formatUsd(order.totalCents)}</b>
                  </div>
                  <div className="summary-row is-total">
                    <span>Total a pagar al conductor</span>
                    <b>{formatUsd(order.totalCents)}</b>
                  </div>
                </>
              ) : (
                <>
                  <div className="summary-row">
                    <span>Productos</span>
                    <b>{formatUsd(order.subtotalCents)}</b>
                  </div>
                  <div className="summary-row">
                    <span>Delivery ({Number(order.distanceKm).toFixed(2)} km · {order.extraStops} parada(s) extra)</span>
                    <b>{formatUsd(order.deliveryCents)}</b>
                  </div>
                  <div className="summary-row is-total">
                    <span>Total</span>
                    <b>{formatUsd(order.totalCents)}</b>
                  </div>
                </>
              )}
              <div className="summary-row">
                <span>Tasa BCV congelada</span>
                <b>{Number(order.bcvRate).toFixed(2)} Bs/USD</b>
              </div>
              <div className="summary-row">
                <span>Total en bolívares</span>
                <b>{formatBs(order.totalBs)}</b>
              </div>
              {order.paymentMethod && (
                <div className="summary-row">
                  <span>Pago</span>
                  <b>
                    {order.paymentMethod}
                    {order.paymentRef ? ` · ${order.paymentRef}` : ''}
                  </b>
                </div>
              )}

              <div className="code-block">
                <span className="muted">
                  {isTransport ? 'Código PIN del viaje (dáselo al conductor al llegar)' : 'Código de entrega (dáselo al motorizado)'}
                </span>
                <strong>{order.deliveryCode}</strong>
                <small className="muted">
                  <ShieldCheck size={13} aria-hidden="true" />{' '}
                  {isTransport
                    ? 'El conductor ingresa este PIN para finalizar el viaje al llegar al destino.'
                    : 'El motorizado lo ingresa para cerrar el pedido.'}
                </small>
              </div>

              <div className="page-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                {/* Ocultar botón de reenviar por WhatsApp a tienda en servicios de transporte */}
                {!isTransport && (
                  <a
                    className="btn btn-ghost"
                    href={whatsappLink(settings.whatsappNumber, message)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                    Reenviar por WhatsApp
                  </a>
                )}
                {order.courier?.phone && (
                  <a className="btn btn-primary" href={`tel:${order.courier.phone}`}>
                    <Phone size={15} aria-hidden="true" />
                    Llamar al conductor
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: '#c53030', borderColor: '#feb2b2', marginLeft: 'auto' }}
                  onClick={() => setReportOpen(true)}
                >
                  <AlertTriangle size={15} aria-hidden="true" />
                  Reportar Problema
                </button>
              </div>

              {order.courier && (
                <div className="courier-card">
                  {order.vehicleType === 'carro' ? <Car size={16} aria-hidden="true" /> : <Bike size={16} aria-hidden="true" />}
                  <div>
                    <strong>{order.courier.name}</strong>
                    <span className="muted">Tu conductor asignado</span>
                  </div>
                  {order.courier.phone && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={whatsappLink(order.courier.phone, `Hola ${order.courier.name}, soy el pasajero del viaje ${order.code}.`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={14} aria-hidden="true" />
                      Chat
                    </a>
                  )}
                </div>
              )}

              <p className="muted small">
                <Sparkles size={13} aria-hidden="true" /> Si la tasa cambia mañana, este pedido mantiene su monto
                original en Bs.
              </p>
            </section>

            {/* Ocultar comprobante de pago en servicios de transporte (se paga en efectivo directo al conductor) */}
            {!isTransport && (
              <section className="panel">
                <header className="panel-head">
                  <div>
                    <h2>
                      <Receipt size={16} aria-hidden="true" /> Comprobante de pago
                    </h2>
                    <p className="muted">
                      La tienda lo ve junto al número de pedido {order.code} y se borra solo a los 7 días.
                    </p>
                  </div>
                </header>

                {proofs.length > 0 && (
                  <div className="proof-gallery">
                    {proofs.map((proof) => (
                      <ProofPhoto key={proof.id} proofId={proof.id} />
                    ))}
                  </div>
                )}
                {!proofs.length && <p className="muted">Todavía no enviaste el comprobante de pago.</p>}

                {canUploadProof && order.status !== 'cancelled' && (
                  <>
                    <Field label="Enviar otra foto del comprobante">
                      <input
                        type="file"
                        accept="image/*"
                        disabled={proofBusy}
                        onChange={(event) => {
                          sendProof(event.target.files?.[0] || null);
                          event.target.value = '';
                        }}
                      />
                    </Field>
                    <p className="muted small">
                      Solo fotos, sin mensajes de texto. Cada comprobante se guarda una semana y se elimina solo.
                    </p>
                    <Alert>{proofError}</Alert>
                  </>
                )}
              </section>
            )}
          </div>
        )}

        {/* Modal de Reporte de Cliente (Anti-Desintermediación y Control de Riesgo) */}
        <Modal
          open={reportOpen}
          title="Reportar Problema con el Servicio"
          onClose={() => {
            setReportOpen(false);
            setReportMessage('');
            setReportError('');
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="muted small" style={{ margin: 0 }}>
              Tu seguridad es lo primero. Si el conductor te pide cancelar o acordar la carrera por fuera, repórtalo para activar protección inmediata.
            </p>

            <Alert>{reportError}</Alert>
            <Alert tone="ok">{reportMessage}</Alert>

            <Field label="Motivo del reporte">
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '0.4rem',
                  border: '1px solid #cbd5e0',
                  fontSize: '0.9rem',
                }}
              >
                <option value="">Selecciona un motivo...</option>
                <option value="El conductor me pidió hacer la carrera por fuera">
                  🚨 El conductor me pidió hacer la carrera por fuera (Fraude)
                </option>
                <option value="El conductor nunca llegó / no responde">
                  El conductor nunca llegó / no responde
                </option>
                <option value="Trato inadecuado o conducción peligrosa">
                  Trato inadecuado o conducción peligrosa
                </option>
                <option value="Cobro indebido / tarifa diferente a la app">
                  Cobro indebido o cobro extra no autorizado
                </option>
                <option value="Otro motivo">Otro problema</option>
              </select>
            </Field>

            <Field label="Detalles adicionales (opcional)">
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={3}
                placeholder="Describe brevemente lo ocurrido..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.4rem',
                  border: '1px solid #cbd5e0',
                  fontSize: '0.9rem',
                }}
              />
            </Field>

            <div className="page-actions" style={{ marginTop: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setReportOpen(false)}
                disabled={reportSubmitting}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#e53e3e', borderColor: '#c53030' }}
                onClick={submitReport}
                disabled={!reportReason || reportSubmitting}
              >
                {reportSubmitting ? <Spinner /> : <ShieldAlert size={15} aria-hidden="true" />}
                Enviar Reporte
              </button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
}

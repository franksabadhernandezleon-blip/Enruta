import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bike, MessageCircle, Phone, Receipt, ShieldCheck, Sparkles } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner, StatusPill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig } from '../lib/config.jsx';
import { formatBs, formatDate, formatUsd, statusLabel } from '../lib/format.js';
import { mapsLink, whatsappLink } from '../lib/geo.js';
import { buildOrderMessage } from '../lib/whatsapp.js';

export default function OrderPage() {
  const { code } = useParams();
  const { settings } = useConfig();
  const [order, setOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

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
                  <StatusPill status={item.status} label={statusLabel[item.status]} />
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
              <header className="panel-head">
                <div>
                  <p className="eyebrow">Pedido</p>
                  <h1>{order.code}</h1>
                  <p className="muted">{formatDate(order.createdAt)}</p>
                </div>
                <StatusPill status={order.status} label={statusLabel[order.status]} />
              </header>

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

              {grouped.map((group) => (
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
              ))}

              <p className="muted">
                Entrega en {order.address} ·{' '}
                <a href={mapsLink({ lat: order.lat, lng: order.lng })} target="_blank" rel="noreferrer">
                  ver mapa
                </a>
              </p>
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
                <span className="muted">Código de entrega (dáselo al motorizado)</span>
                <strong>{order.deliveryCode}</strong>
                <small className="muted">
                  <ShieldCheck size={13} aria-hidden="true" /> El motorizado lo ingresa para cerrar el pedido.
                </small>
              </div>

              <div className="page-actions">
                <a
                  className="btn btn-ghost"
                  href={whatsappLink(settings.whatsappNumber, message)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={15} aria-hidden="true" />
                  Reenviar por WhatsApp
                </a>
                {order.courier?.phone && (
                  <a className="btn btn-primary" href={`tel:${order.courier.phone}`}>
                    <Phone size={15} aria-hidden="true" />
                    Llamar al motorizado
                  </a>
                )}
              </div>

              {order.courier && (
                <div className="courier-card">
                  <Bike size={16} aria-hidden="true" />
                  <div>
                    <strong>{order.courier.name}</strong>
                    <span className="muted">Tu motorizado asignado</span>
                  </div>
                  {order.courier.phone && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={whatsappLink(order.courier.phone, `Hola ${order.courier.name}, soy el cliente del pedido ${order.code}.`)}
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
          </div>
        )}
      </main>
    </div>
  );
}

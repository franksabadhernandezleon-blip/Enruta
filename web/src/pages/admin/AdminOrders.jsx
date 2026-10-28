import { useEffect, useState } from 'react';
import { Phone, RefreshCw, XCircle } from 'lucide-react';
import { Alert, Section, Spinner, StatusPill } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatBs, formatDate, formatUsd, statusLabel } from '../../lib/format.js';
import { mapsLink } from '../../lib/geo.js';

export default function AdminOrders({ onChanged }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.admin.orders({ status, q: query });
      setOrders(data.orders);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const cancel = async (order) => {
    const reason = window.prompt(`Motivo de la cancelación de ${order.code}:`, 'Cliente canceló');
    if (reason === null) return;
    try {
      await api.admin.cancelOrder(order.id, reason);
      setMessage(`${order.code} cancelado: stock repuesto y comisiones anuladas.`);
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="admin-grid">
      <Alert>{error}</Alert>
      <Alert tone="ok">{message}</Alert>

      <Section
        title="Monitor de pedidos"
        subtitle="Multi-ruta con tasa congelada. Cancelar repone stock, anula comisión y deja registro en CRM."
        actions={
          <div className="inline-actions">
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por estado">
              <option value="all">Todos</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && load()}
              placeholder="Buscar código o cliente"
              aria-label="Buscar pedido"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={14} aria-hidden="true" />
              Actualizar
            </button>
          </div>
        }
      >
        {loading && <Spinner />}
        <ul className="admin-list">
          {orders.map((order) => (
            <li key={order.id} className="is-stacked">
              <div className="admin-row-main">
                <div>
                  <strong>{order.code}</strong>
                  <span className="muted">
                    {formatDate(order.createdAt)} · {order.customerName || 'Cliente'} · {order.stops.length} parada(s)
                  </span>
                </div>
                <StatusPill status={order.status} label={statusLabel[order.status]} />
                <b className="price">{formatUsd(order.totalCents)}</b>
                <span className="muted">{formatBs(order.totalBs)} · tasa {Number(order.bcvRate).toFixed(2)}</span>
              </div>

              <div className="admin-row-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                  {expanded === order.id ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
                {order.courier?.phone && (
                  <a className="btn btn-ghost btn-sm" href={`tel:${order.courier.phone}`}>
                    <Phone size={14} aria-hidden="true" />
                    {order.courier.name}
                  </a>
                )}
                {['delivered', 'cancelled'].includes(order.status) ? null : (
                  <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => cancel(order)}>
                    <XCircle size={14} aria-hidden="true" />
                    Cancelar
                  </button>
                )}
              </div>

              {expanded === order.id && (
                <div className="order-detail">
                  <div className="order-detail-grid">
                    <div>
                      <h3>Paradas</h3>
                      <ol className="route-steps">
                        {order.stops.map((stop) => (
                          <li key={stop.id}>
                            <span className={`route-index${stop.released ? ' is-client' : ''}`}>{stop.seq}</span>
                            <div>
                              <strong>{stop.storeName}</strong>
                              <span className="muted">
                                {stop.released ? `Liberada ${formatDate(stop.releasedAt)} (${stop.releasedBy})` : 'Pendiente de PIN'}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <h3>Entrega</h3>
                      <p className="muted">
                        {order.address} ·{' '}
                        <a href={mapsLink({ lat: order.lat, lng: order.lng })} target="_blank" rel="noreferrer">
                          mapa
                        </a>
                      </p>
                      <p className="muted">
                        Distancia {Number(order.distanceKm).toFixed(2)} km · {order.extraStops} parada(s) extra ·
                        delivery {formatUsd(order.deliveryCents)}
                      </p>
                      <p className="muted">
                        PIN de retiro <b>{order.pickupPin}</b> · código de entrega <b>{order.deliveryCode}</b>
                      </p>
                      <p className="muted">
                        Comisión motorizado {formatUsd(order.courierCommissionCents)} · plataforma{' '}
                        {formatUsd(order.platformCommissionCents)}
                      </p>
                      {order.paymentMethod && (
                        <p className="muted">
                          Pago: {order.paymentMethod} {order.paymentRef ? `· ref ${order.paymentRef}` : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  <ul className="cart-lines is-compact">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <div className="cart-line-body">
                          <strong>
                            {item.qty}x {item.name}
                          </strong>
                          <span className="muted">{item.storeName}</span>
                        </div>
                        <b className="price">{formatUsd(item.priceCents * item.qty)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

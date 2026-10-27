import { useEffect, useState } from 'react';
import { BellRing, Check, MapPin, Phone, Siren, Wallet } from 'lucide-react';
import { Alert, Section, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatDate, formatUsd } from '../../lib/format.js';
import { mapsLink } from '../../lib/geo.js';
import { enablePush, pushSupported } from '../../lib/push.js';
import { useConfig } from '../../lib/config.jsx';

export default function AdminSos({ sos = [], payouts = [], onChanged }) {
  const { vapidPublicKey } = useConfig();
  const [alerts, setAlerts] = useState(sos);
  const [requests, setRequests] = useState(payouts);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => setAlerts(sos), [sos]);
  useEffect(() => setRequests(payouts), [payouts]);

  const reload = async () => {
    setLoading(true);
    try {
      const [sosData, payoutData] = await Promise.all([api.admin.sos(), api.admin.payouts()]);
      setAlerts(sosData.alerts);
      setRequests(payoutData.payouts);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const ack = async (id) => {
    try {
      await api.admin.ackSos(id);
      await reload();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const pay = async (id) => {
    try {
      await api.admin.payPayout(id);
      setMessage('Liquidación marcada como pagada.');
      await reload();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const enableAdminPush = async () => {
    const result = await enablePush({ vapidPublicKey, role: 'admin' });
    setMessage(result.message);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="admin-grid">
      <Alert>{error}</Alert>
      <Alert tone="ok">{message}</Alert>

      <Section
        title="Monitor SOS"
        subtitle="Alertas push del motorizado con GPS y llamada directa"
        actions={
          <div className="inline-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>
              Actualizar
            </button>
            {pushSupported() && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={enableAdminPush}>
                <BellRing size={14} aria-hidden="true" />
                Activar push en este equipo
              </button>
            )}
          </div>
        }
      >
        {loading && <Spinner />}
        <ul className="admin-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={alert.status === 'open' ? 'is-alert' : ''}>
              <div className="admin-row-main">
                <span className="avatar is-danger" aria-hidden="true">
                  <Siren size={16} />
                </span>
                <div>
                  <strong>{alert.courierName}</strong>
                  <span className="muted">
                    {alert.orderCode ? `Pedido ${alert.orderCode} · ` : ''}
                    {formatDate(alert.createdAt)} ·{' '}
                    {alert.lat && alert.lng ? `${Number(alert.lat).toFixed(4)}, ${Number(alert.lng).toFixed(4)}` : 'sin GPS'}
                  </span>
                </div>
              </div>
              <div className="admin-row-actions">
                {alert.courierPhone && (
                  <a className="btn btn-primary btn-sm" href={`tel:${alert.courierPhone}`}>
                    <Phone size={14} aria-hidden="true" />
                    Llamar
                  </a>
                )}
                {alert.lat && alert.lng && (
                  <a className="btn btn-ghost btn-sm" href={mapsLink(alert)} target="_blank" rel="noreferrer">
                    <MapPin size={14} aria-hidden="true" />
                    GPS
                  </a>
                )}
                {alert.status === 'open' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => ack(alert.id)}>
                    <Check size={14} aria-hidden="true" />
                    Atendida
                  </button>
                )}
                {alert.status !== 'open' && <span className="status status-delivered">Atendida</span>}
              </div>
            </li>
          ))}
          {!alerts.length && <li className="muted">Sin alertas SOS. Todo tranquilo.</li>}
        </ul>
      </Section>

      <Section title="Liquidaciones" subtitle="Solicitudes de cierre de los motorizados">
        <ul className="admin-list">
          {requests.map((request) => (
            <li key={request.id}>
              <div className="admin-row-main">
                <span className="avatar" aria-hidden="true">
                  <Wallet size={16} />
                </span>
                <div>
                  <strong>{request.courierName}</strong>
                  <span className="muted">
                    {formatDate(request.createdAt)} {request.courierPhone ? `· ${request.courierPhone}` : ''}
                  </span>
                </div>
                <b className="price">{formatUsd(request.amountCents)}</b>
              </div>
              <div className="admin-row-actions">
                {request.status === 'requested' ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => pay(request.id)}>
                    Marcar pagada
                  </button>
                ) : (
                  <span className="status status-delivered">Pagada</span>
                )}
              </div>
            </li>
          ))}
          {!requests.length && <li className="muted">Sin solicitudes pendientes.</li>}
        </ul>
      </Section>
    </div>
  );
}

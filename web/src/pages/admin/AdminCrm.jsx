import { useEffect, useState } from 'react';
import { Search, ShieldOff, ShieldCheck } from 'lucide-react';
import { Alert, Section, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';

export default function AdminCrm() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [userData, eventData] = await Promise.all([api.admin.users(query), api.admin.crm()]);
      setUsers(userData.users);
      setEvents(eventData.events);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ban = async (user, permanent) => {
    setError('');
    setMessage('');
    try {
      await api.admin.ban(user.id, { permanent, days: Number(days) || 7 });
      setMessage(`${user.email} ${permanent ? 'baneado permanentemente' : `baneado por ${days} días`}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const unban = async (user) => {
    try {
      await api.admin.unban(user.id);
      setMessage(`${user.email} puede volver a usar ENRUTA.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="admin-grid">
      <Alert>{error}</Alert>
      <Alert tone="ok">{message}</Alert>

      <Section
        title="Usuarios y baneos"
        subtitle="Historial de cada cuenta con suspensión temporal o permanente"
        actions={
          <div className="inline-actions">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && load()}
              placeholder="Buscar correo o nombre"
              aria-label="Buscar usuario"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <Search size={14} aria-hidden="true" />
              Buscar
            </button>
            <label className="inline-field">
              Días
              <input value={days} onChange={(event) => setDays(event.target.value)} inputMode="numeric" aria-label="Días de baneo" />
            </label>
          </div>
        }
      >
        {loading && <Spinner />}
        <table className="table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Rol</th>
              <th>Pedidos</th>
              <th>Entregas</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const banned =
                user.bannedPermanent || (user.bannedUntil && new Date(user.bannedUntil) > new Date());
              return (
                <tr key={user.id}>
                  <td data-label="Cuenta">
                    <strong>{user.name || user.email}</strong>
                    <span className="muted">{user.email}</span>
                  </td>
                  <td data-label="Rol">{user.role}</td>
                  <td data-label="Pedidos">{user.ordersCount}</td>
                  <td data-label="Entregas">{user.deliveriesCount}</td>
                  <td data-label="Estado">
                    {banned ? (
                      <span className="status status-cancelled">
                        {user.bannedPermanent ? 'Permanente' : `Hasta ${formatDate(user.bannedUntil)}`}
                      </span>
                    ) : (
                      <span className="status status-delivered">Activa</span>
                    )}
                  </td>
                  <td>
                    <div className="inline-actions">
                      {banned ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => unban(user)}>
                          <ShieldCheck size={14} aria-hidden="true" />
                          Levantar
                        </button>
                      ) : (
                        <>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => ban(user, false)}>
                            <ShieldOff size={14} aria-hidden="true" />
                            Temporal
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => ban(user, true)}>
                            Permanente
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="CRM" subtitle="Registro de pedidos, cancelaciones, liberaciones, SOS y liquidaciones">
        <ul className="admin-list is-feed">
          {events.map((event) => (
            <li key={event.id}>
              <span className={`feed-dot feed-${event.kind}`} aria-hidden="true" />
              <div>
                <strong>{event.kind.toUpperCase()}</strong>
                <span className="muted">
                  {event.note} {event.orderCode ? `· ${event.orderCode}` : ''} {event.email ? `· ${event.email}` : ''}
                </span>
              </div>
              <span className="muted small">{formatDate(event.createdAt)}</span>
            </li>
          ))}
          {!events.length && <li className="muted">Todavía no hay movimientos.</li>}
        </ul>
      </Section>
    </div>
  );
}

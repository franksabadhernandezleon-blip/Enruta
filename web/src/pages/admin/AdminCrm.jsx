import { useEffect, useState } from 'react';
import { Search, ShieldOff, ShieldCheck } from 'lucide-react';
import { Alert, Section, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';

const ROLES = [
  { value: 'customer', label: 'Cliente' },
  { value: 'owner', label: 'Dueño Tienda' },
  { value: 'repartidor', label: 'Repartidor 📦' },
  { value: 'motorizado', label: 'Motorizado 🏍️' },
  { value: 'conductor', label: 'Conductor 🚗' },
  { value: 'admin', label: 'Admin' },
];

const VEHICLES = [
  { value: 'moto', label: 'Moto 🏍️' },
  { value: 'carro', label: 'Carro 🚗' },
];

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

  const handleUpdateUser = async (userId, payload) => {
    setError('');
    setMessage('');
    try {
      await api.admin.updateUser(userId, payload);
      setMessage('Usuario actualizado correctamente.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

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
        title="Usuarios, Roles y Vehículos"
        subtitle="Asigna roles específicos (motorizado, conductor, repartidor) y su tipo de vehículo"
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
              <th>Vehículo</th>
              <th>Pedidos / Viajes</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const banned =
                user.bannedPermanent || (user.bannedUntil && new Date(user.bannedUntil) > new Date());
              const isDriverRole = ['motorizado', 'conductor', 'repartidor'].includes(user.role);

              return (
                <tr key={user.id}>
                  <td data-label="Cuenta">
                    <strong>{user.name || user.email}</strong>
                    <span className="muted">{user.email}</span>
                  </td>
                  <td data-label="Rol">
                    <select
                      value={user.role}
                      onChange={(e) => handleUpdateUser(user.id, { role: e.target.value })}
                      style={{ padding: '0.2rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.85rem' }}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Vehículo">
                    {isDriverRole ? (
                      <select
                        value={user.vehicleType || 'moto'}
                        onChange={(e) => handleUpdateUser(user.id, { vehicleType: e.target.value })}
                        style={{ padding: '0.2rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.85rem' }}
                      >
                        {VEHICLES.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted small">N/A</span>
                    )}
                  </td>
                  <td data-label="Pedidos / Viajes">
                    {user.ordersCount} / {user.deliveriesCount}
                  </td>
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

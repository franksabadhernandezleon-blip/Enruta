import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bike,
  Check,
  CheckCircle,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Store as StoreIcon,
  X,
} from 'lucide-react';
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
  const [reports, setReports] = useState([]);
  const [regRequests, setRegRequests] = useState([]);
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingReqId, setProcessingReqId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [userData, eventData, reportData, regData] = await Promise.all([
        api.admin.users(query),
        api.admin.crm(),
        api.admin.driverReports(),
        api.admin.registrationRequests('pending'),
      ]);
      setUsers(userData.users);
      setEvents(eventData.events);
      setReports(reportData.reports || []);
      setRegRequests(regData.requests || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async (reqItem) => {
    if (!window.confirm(`¿Aprobar la solicitud de ${reqItem.applicantName} (${reqItem.type === 'store' ? `Tienda ${reqItem.storeName}` : reqItem.roleRequested})?`)) {
      return;
    }
    setProcessingReqId(reqItem.id);
    setError('');
    setMessage('');
    try {
      await api.admin.approveRegistration(reqItem.id);
      setMessage(`Solicitud de ${reqItem.applicantName} aprobada con éxito.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingReqId('');
    }
  };

  const handleRejectRequest = async (reqItem) => {
    const reason = window.prompt('Motivo del rechazo de la solicitud:', 'Documentación incompleta o no válida');
    if (reason === null) return;
    setProcessingReqId(reqItem.id);
    setError('');
    setMessage('');
    try {
      await api.admin.rejectRegistration(reqItem.id, reason);
      setMessage(`Solicitud de ${reqItem.applicantName} rechazada.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingReqId('');
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

  const handleFraudBlock = async (user) => {
    if (!window.confirm(`¿Confirmas el bloqueo permanente por FRAUDE para ${user.name || user.email}?`)) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await api.admin.fraudBlock(user.id);
      setMessage(`Conductor ${user.email} bloqueado permanentemente por fraude (Alerta Roja).`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetRisk = async (user) => {
    if (!window.confirm(`¿Restablecer el semáforo a VERDE y perdonar sanciones a ${user.name || user.email}?`)) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await api.admin.resetRisk(user.id);
      setMessage(`Semáforo de ${user.email} restablecido a Verde exitosamente.`);
      await load();
    } catch (err) {
      setError(err.message);
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
              <th>Semáforo & Riesgo</th>
              <th>Pedidos / Viajes</th>
              <th>Estado</th>
              <th>Acciones de Sanción</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const banned =
                user.bannedPermanent || (user.bannedUntil && new Date(user.bannedUntil) > new Date());
              const isSuspended =
                banned || (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) || user.riskLevel === 'red';
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
                  <td data-label="Semáforo & Riesgo">
                    {isDriverRole ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div>
                          {user.riskLevel === 'yellow' ? (
                            <span
                              className="status"
                              style={{
                                background: '#fefcbf',
                                color: '#744210',
                                border: '1px solid #ecc94b',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              🟡 Amarillo
                            </span>
                          ) : user.riskLevel === 'red' || isSuspended ? (
                            <span
                              className="status status-cancelled"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                              🔴 Rojo (Riesgo)
                            </span>
                          ) : (
                            <span
                              className="status status-delivered"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                              🟢 Verde (Seguro)
                            </span>
                          )}
                        </div>
                        <span className="muted small">
                          Cancelaciones: <b>{user.cancellationCount || 0}</b> | Reportes: <b>{user.reportsCount || 0}</b>
                        </span>
                      </div>
                    ) : (
                      <span className="muted small">N/A</span>
                    )}
                  </td>
                  <td data-label="Pedidos / Viajes">
                    {user.ordersCount} / {user.deliveriesCount}
                  </td>
                  <td data-label="Estado">
                    {isSuspended ? (
                      <span className="status status-cancelled">
                        {user.bannedPermanent
                          ? 'Permanente'
                          : user.suspendedUntil
                          ? `Suspendido 72h`
                          : `Hasta ${formatDate(user.bannedUntil)}`}
                      </span>
                    ) : (
                      <span className="status status-delivered">Activa</span>
                    )}
                  </td>
                  <td data-label="Acciones">
                    <div className="inline-actions" style={{ flexWrap: 'wrap', gap: '0.3rem' }}>
                      {isDriverRole && (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#276749', borderColor: '#9ae6b4' }}
                            onClick={() => handleResetRisk(user)}
                            title="Restablecer semáforo a Verde y perdonar sanciones técnicas"
                          >
                            <RefreshCw size={13} aria-hidden="true" />
                            Perdonar / Verde
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-danger"
                            onClick={() => handleFraudBlock(user)}
                            title="Bloqueo permanente por fraude o carrera por fuera"
                          >
                            <ShieldAlert size={13} aria-hidden="true" />
                            Bloqueo Fraude
                          </button>
                        </>
                      )}
                      {banned ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => unban(user)}>
                          <ShieldCheck size={14} aria-hidden="true" />
                          Levantar
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => ban(user, false)}>
                          <ShieldOff size={14} aria-hidden="true" />
                          Temp
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* Sección de Solicitudes Pendientes de Registro (Tiendas y Trabajadores) */}
      <Section
        title={`Solicitudes Pendientes de Registro (${regRequests.length})`}
        subtitle="Postulaciones de nuevas tiendas y conductores / repartidores para revisión y aprobación"
      >
        <ul className="admin-list">
          {regRequests.map((reqItem) => (
            <li key={reqItem.id} className="is-stacked">
              <div className="admin-row-main">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: reqItem.type === 'store' ? '#feebc8' : '#c6f6d5',
                        color: reqItem.type === 'store' ? '#7b341e' : '#22543d',
                        fontWeight: '700',
                        fontSize: '0.78rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '1rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      {reqItem.type === 'store' ? (
                        <>
                          <StoreIcon size={13} /> TIENDA / COMERCIO
                        </>
                      ) : (
                        <>
                          <Bike size={13} /> TRABAJADOR ({reqItem.roleRequested.toUpperCase()})
                        </>
                      )}
                    </span>
                    <strong>{reqItem.applicantName}</strong>
                    <span className="muted small">{formatDate(reqItem.createdAt)}</span>
                  </div>

                  <div style={{ fontSize: '0.9rem', color: '#2d3748', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div>
                      <b>Correo:</b> {reqItem.applicantEmail} · <b>Tel/WhatsApp:</b> {reqItem.applicantPhone}
                      {reqItem.documentId && <span> · <b>Cédula/RIF:</b> {reqItem.documentId}</span>}
                    </div>

                    {reqItem.type === 'store' && (
                      <div>
                        <b>Nombre Tienda:</b> {reqItem.storeName}
                        {reqItem.storeAddress && <span> · <b>Dirección:</b> {reqItem.storeAddress}</span>}
                      </div>
                    )}

                    {reqItem.type === 'worker' && (
                      <div>
                        <b>Vehículo:</b> {reqItem.vehicleType === 'carro' ? 'Carro 🚗' : 'Moto 🏍️'}
                        {reqItem.vehicleModel && <span> ({reqItem.vehicleModel})</span>}
                        {reqItem.vehiclePlate && <span> · <b>Placa:</b> {reqItem.vehiclePlate}</span>}
                      </div>
                    )}

                    {reqItem.details && (
                      <div className="muted small" style={{ marginTop: '0.15rem' }}>
                        <b>Detalles:</b> <i>"{reqItem.details}"</i>
                      </div>
                    )}

                    {reqItem.documentUrl && (
                      <div style={{ marginTop: '0.35rem' }}>
                        <a
                          href={reqItem.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#2b6cb0', padding: '0.2rem 0.5rem' }}
                        >
                          <FileText size={13} /> Ver Documento / Cédula adjunta
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="inline-actions" style={{ gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ background: '#38a169', borderColor: '#2f855a' }}
                    onClick={() => handleApproveRequest(reqItem)}
                    disabled={processingReqId === reqItem.id}
                  >
                    {processingReqId === reqItem.id ? <Spinner /> : <Check size={14} aria-hidden="true" />}
                    Aprobar y Activar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-danger"
                    onClick={() => handleRejectRequest(reqItem)}
                    disabled={processingReqId === reqItem.id}
                  >
                    <X size={14} aria-hidden="true" />
                    Rechazar
                  </button>
                </div>
              </div>
            </li>
          ))}
          {!regRequests.length && (
            <li className="muted">No hay solicitudes de registro pendientes de aprobación.</li>
          )}
        </ul>
      </Section>

      {/* Sección de Alertas Rojas y Reportes de Clientes (Anti-Desintermediación) */}
      <Section
        title="Alertas Rojas y Reportes de Clientes (Anti-Fraude)"
        subtitle="Reportes generados por usuarios: intentos de cobrar por fuera, desintermediación y conducta"
      >
        <ul className="admin-list">
          {reports.map((report) => (
            <li key={report.id} className="is-stacked">
              <div className="admin-row-main">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <strong>Pedido {report.orderCode || 'N/A'}</strong>
                    {report.isFraud ? (
                      <span
                        style={{
                          background: '#e53e3e',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '1rem',
                        }}
                      >
                        🚨 CARRERA POR FUERA (FRAUDE)
                      </span>
                    ) : (
                      <span
                        style={{
                          background: '#dd6b20',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '1rem',
                        }}
                      >
                        REPORTE DE CLIENTE
                      </span>
                    )}
                    <span className="muted small">{formatDate(report.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#2d3748', marginTop: '0.25rem' }}>
                    <b>Motivo:</b> {report.reason}
                  </div>
                  {report.details && (
                    <div style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: '0.2rem' }}>
                      <b>Detalles:</b> <i>"{report.details}"</i>
                    </div>
                  )}
                  <div className="muted small" style={{ marginTop: '0.35rem' }}>
                    Cliente: <b>{report.customerName || 'Cliente'}</b> · Conductor reportado:{' '}
                    <b>{report.driverName || report.driverEmail || 'Desconocido'}</b>
                  </div>
                </div>

                {report.driverId && (
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#276749', borderColor: '#9ae6b4' }}
                      onClick={() => handleResetRisk({ id: report.driverId, email: report.driverEmail })}
                    >
                      <CheckCircle size={13} aria-hidden="true" />
                      Perdonar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() => handleFraudBlock({ id: report.driverId, email: report.driverEmail })}
                    >
                      <ShieldAlert size={13} aria-hidden="true" />
                      Bloquear Fraude
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {!reports.length && <li className="muted">No se han registrado reportes de clientes ni fraudes.</li>}
        </ul>
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

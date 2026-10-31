import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BellRing,
  Bike,
  Car,
  CheckCircle,
  ClipboardList,
  FileText,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Receipt,
  Store as StoreIcon,
  UploadCloud,
  UserRound,
} from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import PhotoInput from '../components/PhotoInput.jsx';
import { Alert, Field, Modal, Section, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useConfig } from '../lib/config.jsx';
import { whatsappLink } from '../lib/geo.js';
import { enablePush, pushSupported } from '../lib/push.js';

const ROLE_LABEL = {
  admin: 'Administrador',
  owner: 'Dueño de tienda',
  courier: 'Motorizado',
  motorizado: 'Motorizado 🏍️',
  conductor: 'Conductor Taxi 🚗',
  repartidor: 'Repartidor 📦',
  customer: 'Cliente',
};

// Pestaña "Cuenta": identidad, avisos push y accesos a los paneles según el rol.
export default function AccountPage() {
  const { user, isAdmin, isOwner, isCourier, logout } = useAuth();
  const { settings, vapidPublicKey } = useConfig();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Estados para modales de registro de Tiendas y Trabajadores
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSuccess, setRegSuccess] = useState('');
  const [regError, setRegError] = useState('');

  // Formulario tienda
  const [storeForm, setStoreForm] = useState({
    storeName: '',
    applicantName: '',
    applicantPhone: '',
    documentId: '',
    documentUrl: '',
    storeAddress: '',
    details: '',
  });

  // Formulario trabajador
  const [workerForm, setWorkerForm] = useState({
    roleRequested: 'motorizado',
    applicantName: '',
    applicantPhone: '',
    documentId: '',
    documentUrl: '',
    vehicleType: 'moto',
    vehiclePlate: '',
    vehicleModel: '',
    details: '',
  });

  const supportWhatsApp = settings?.whatsappNumber || '04121590242';

  const enableNotifications = async () => {
    setError('');
    setMessage('');
    const result = await enablePush({ vapidPublicKey, role: user?.role || 'customer' });
    if (result.ok) setMessage(result.message);
    else setError(result.message);
  };

  const sendTestPush = async () => {
    setError('');
    setMessage('');
    try {
      await api.testPush();
      setMessage('Aviso de prueba enviado a este dispositivo.');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="page-head">
          <div>
            <p className="eyebrow">Cuenta</p>
            <h1>{user ? `Hola, ${String(user.name || user.email).split(' ')[0]}` : 'Tu cuenta ENRUTA'}</h1>
            <p className="lede">
              {user
                ? 'Tus datos, tus avisos y los paneles que te corresponden.'
                : 'Entra para ver tus pedidos, guardar tu dirección y recibir avisos del delivery.'}
            </p>
          </div>
        </section>

        <Alert>{error}</Alert>
        <Alert tone="ok">{message}</Alert>

        {!user && (
          <Section title="Sesión" subtitle="Invitado">
            <p className="muted">Puedes explorar el catálogo sin cuenta, pero los pedidos y el historial necesitan sesión.</p>
            <div className="page-actions">
              <Link to="/login" className="btn btn-primary">
                <UserRound size={15} aria-hidden="true" />
                Entrar o crear cuenta
              </Link>
            </div>
          </Section>
        )}

        {user && (
          <>
            <Section title="Datos de la cuenta" subtitle={user.email}>
              <div className="account-identity">
                <span className="account-avatar" aria-hidden="true">
                  <UserRound size={22} />
                </span>
                <div>
                  <strong>{user.name || user.email}</strong>
                  <span className="muted small">
                    {ROLE_LABEL[user.role] || user.role}
                    {user.phone ? ` · ${user.phone}` : ''}
                  </span>
                </div>
              </div>
              {user.banned && <p className="muted small">Esta cuenta está suspendida temporalmente.</p>}
            </Section>

            <Section title="Paneles" subtitle="Solo aparecen los que tu rol puede abrir">
              <div className="account-links">
                <Link to="/pedidos" className="btn btn-ghost">
                  <Receipt size={15} aria-hidden="true" />
                  Mis pedidos
                </Link>
                <Link to="/cuenta/direcciones" className="btn btn-ghost">
                  <MapPin size={15} aria-hidden="true" />
                  Mis direcciones
                </Link>
                {isOwner && (
                  <Link to="/mitienda" className="btn btn-ghost">
                    <StoreIcon size={15} aria-hidden="true" />
                    Mi tienda
                  </Link>
                )}
                {isCourier && (
                  <Link to="/repartidor" className="btn btn-ghost">
                    <Bike size={15} aria-hidden="true" />
                    Repartidor
                  </Link>
                )}
                {isAdmin && (
                  <Link to="/tuteteno" className="btn btn-ghost">
                    <ClipboardList size={15} aria-hidden="true" />
                    Administración
                  </Link>
                )}
              </div>
            </Section>

            <Section title="Avisos del pedido" subtitle="Notificaciones push de ENRUTA en este dispositivo">
              {pushSupported() ? (
                <div className="page-actions">
                  <button type="button" className="btn btn-primary" onClick={enableNotifications}>
                    <BellRing size={15} aria-hidden="true" />
                    Activar avisos
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={sendTestPush}>
                    Enviar prueba
                  </button>
                </div>
              ) : (
                <p className="muted">Este navegador no soporta notificaciones push.</p>
              )}
            </Section>

            {/* Sección de Registro de Tiendas y Trabajadores */}
            <Section
              title="Únete a la Red ENRUTA"
              subtitle="Registra tu tienda para vender o postúlate como conductor / repartidor"
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                <div
                  style={{
                    background: '#f7fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{ background: '#feebc8', color: '#c05621', padding: '0.4rem', borderRadius: '0.5rem', display: 'flex' }}>
                        <StoreIcon size={20} />
                      </span>
                      <strong style={{ fontSize: '1.05rem' }}>Registrar Mi Tienda</strong>
                    </div>
                    <p className="muted small" style={{ margin: 0 }}>
                      Vende tus productos en Caripito con delivery integrado, tasa BCV garantizada y control total de inventario.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => {
                      setRegError('');
                      setRegSuccess('');
                      setStoreForm({
                        storeName: '',
                        applicantName: user?.name || '',
                        applicantPhone: user?.phone || '',
                        documentId: '',
                        documentUrl: '',
                        storeAddress: '',
                        details: '',
                      });
                      setStoreModalOpen(true);
                    }}
                  >
                    <StoreIcon size={15} aria-hidden="true" />
                    Registrar Negocio
                  </button>
                </div>

                <div
                  style={{
                    background: '#f7fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{ background: '#c6f6d5', color: '#22543d', padding: '0.4rem', borderRadius: '0.5rem', display: 'flex' }}>
                        <Bike size={20} />
                      </span>
                      <strong style={{ fontSize: '1.05rem' }}>Trabajar con Nosotros</strong>
                    </div>
                    <p className="muted small" style={{ margin: 0 }}>
                      Gana dinero como Motorizado 🏍️, Conductor de Taxi 🚗 o Repartidor de Encomiendas 📦 con horarios flexibles.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => {
                      setRegError('');
                      setRegSuccess('');
                      setWorkerForm({
                        roleRequested: 'motorizado',
                        applicantName: user?.name || '',
                        applicantPhone: user?.phone || '',
                        documentId: '',
                        documentUrl: '',
                        vehicleType: 'moto',
                        vehiclePlate: '',
                        vehicleModel: '',
                        details: '',
                      });
                      setWorkerModalOpen(true);
                    }}
                  >
                    <Bike size={15} aria-hidden="true" />
                    Postularme como Conductor
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#ebf8ff', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div className="muted small">
                  ¿Tienes dudas con tu registro? Contáctanos directamente por WhatsApp:
                </div>
                <a
                  href={whatsappLink(supportWhatsApp, 'Hola equipo de ENRUTA, tengo una duda sobre el registro.')}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#2b6cb0', borderColor: '#bee3f8', background: '#fff' }}
                >
                  <MessageCircle size={14} aria-hidden="true" />
                  Soporte WhatsApp ({supportWhatsApp})
                </a>
              </div>
            </Section>

            <Section title="Sesión" subtitle="Cerrar la sesión en este dispositivo">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                <LogOut size={15} aria-hidden="true" />
                Salir
              </button>
            </Section>
          </>
        )}

        {/* Modal de Registro de Tienda */}
        <Modal
          open={storeModalOpen}
          title="Registro de Tienda o Negocio"
          onClose={() => setStoreModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="muted small" style={{ margin: 0 }}>
              Completa los datos de tu comercio. El equipo de administración revisará la información y te activará la tienda.
            </p>

            <Alert>{regError}</Alert>
            <Alert tone="ok">{regSuccess}</Alert>

            <Field label="Nombre comercial de la tienda *">
              <input
                value={storeForm.storeName}
                onChange={(e) => setStoreForm((prev) => ({ ...prev, storeName: e.target.value }))}
                placeholder="Ej. Panadería La Central"
                required
              />
            </Field>

            <Field label="Nombre del responsable / propietario *">
              <input
                value={storeForm.applicantName}
                onChange={(e) => setStoreForm((prev) => ({ ...prev, applicantName: e.target.value }))}
                placeholder="Ej. Juan Pérez"
                required
              />
            </Field>

            <div className="field-row">
              <Field label="Cédula de Identidad o RIF *">
                <input
                  value={storeForm.documentId}
                  onChange={(e) => setStoreForm((prev) => ({ ...prev, documentId: e.target.value }))}
                  placeholder="Ej. V-12345678 o J-12345678-9"
                  required
                />
              </Field>
              <Field label="Teléfono de contacto / WhatsApp *">
                <input
                  value={storeForm.applicantPhone}
                  onChange={(e) => setStoreForm((prev) => ({ ...prev, applicantPhone: e.target.value }))}
                  placeholder="Ej. 04121234567"
                  required
                />
              </Field>
            </div>

            <Field label="Dirección exacta del local en Caripito">
              <input
                value={storeForm.storeAddress}
                onChange={(e) => setStoreForm((prev) => ({ ...prev, storeAddress: e.target.value }))}
                placeholder="Ej. Calle Bolívar, frente a la plaza"
              />
            </Field>

            <PhotoInput
              label="Foto del Documento / RIF / Cédula"
              value={storeForm.documentUrl}
              onChange={(url) => setStoreForm((prev) => ({ ...prev, documentUrl: url }))}
            />

            <Field label="Descripción o rubros que vendes">
              <textarea
                value={storeForm.details}
                onChange={(e) => setStoreForm((prev) => ({ ...prev, details: e.target.value }))}
                rows={2}
                placeholder="Comida rápida, víveres, farmacia, repuestos..."
              />
            </Field>

            <div className="page-actions" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStoreModalOpen(false)}
                disabled={regSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={regSubmitting || !storeForm.storeName || !storeForm.applicantName || !storeForm.applicantPhone}
                onClick={async () => {
                  setRegSubmitting(true);
                  setRegError('');
                  setRegSuccess('');
                  try {
                    const res = await api.submitRegistrationRequest({
                      type: 'store',
                      roleRequested: 'owner',
                      storeName: storeForm.storeName,
                      applicantName: storeForm.applicantName,
                      applicantPhone: storeForm.applicantPhone,
                      documentId: storeForm.documentId,
                      documentUrl: storeForm.documentUrl,
                      storeAddress: storeForm.storeAddress,
                      details: storeForm.details,
                    });
                    setRegSuccess(res.message || 'Solicitud enviada con éxito.');
                    setTimeout(() => {
                      setStoreModalOpen(false);
                      setRegSuccess('');
                    }, 2500);
                  } catch (err) {
                    setRegError(err.message);
                  } finally {
                    setRegSubmitting(false);
                  }
                }}
              >
                {regSubmitting ? <Spinner /> : <StoreIcon size={15} aria-hidden="true" />}
                Enviar Solicitud
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal de Registro de Trabajador */}
        <Modal
          open={workerModalOpen}
          title="Postulación de Conductor / Repartidor"
          onClose={() => setWorkerModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="muted small" style={{ margin: 0 }}>
              Únete a nuestro equipo de conductores y repartidores en Caripito. Revisa tus datos y sube tu documento.
            </p>

            <Alert>{regError}</Alert>
            <Alert tone="ok">{regSuccess}</Alert>

            <Field label="Modalidad de trabajo">
              <select
                value={workerForm.roleRequested}
                onChange={(e) => {
                  const role = e.target.value;
                  const vType = role === 'conductor' ? 'carro' : 'moto';
                  setWorkerForm((prev) => ({ ...prev, roleRequested: role, vehicleType: vType }));
                }}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #cbd5e0' }}
              >
                <option value="motorizado">🏍️ Motorizado (Transporte de pasajeros)</option>
                <option value="conductor">🚗 Conductor de Taxi / Carro (Transporte de pasajeros)</option>
                <option value="repartidor">📦 Repartidor de Encomiendas y Delivery de Tiendas</option>
              </select>
            </Field>

            <Field label="Nombre y Apellido completo *">
              <input
                value={workerForm.applicantName}
                onChange={(e) => setWorkerForm((prev) => ({ ...prev, applicantName: e.target.value }))}
                placeholder="Ej. Carlos Rodríguez"
                required
              />
            </Field>

            <div className="field-row">
              <Field label="Cédula de Identidad *">
                <input
                  value={workerForm.documentId}
                  onChange={(e) => setWorkerForm((prev) => ({ ...prev, documentId: e.target.value }))}
                  placeholder="Ej. V-20123456"
                  required
                />
              </Field>
              <Field label="Número de Teléfono / WhatsApp *">
                <input
                  value={workerForm.applicantPhone}
                  onChange={(e) => setWorkerForm((prev) => ({ ...prev, applicantPhone: e.target.value }))}
                  placeholder="Ej. 04121234567"
                  required
                />
              </Field>
            </div>

            <div className="field-row">
              <Field label="Modelo / Marca de Vehículo">
                <input
                  value={workerForm.vehicleModel}
                  onChange={(e) => setWorkerForm((prev) => ({ ...prev, vehicleModel: e.target.value }))}
                  placeholder="Ej. Bera SBR 2023 / Toyota Corolla"
                />
              </Field>
              <Field label="Placa de Vehículo">
                <input
                  value={workerForm.vehiclePlate}
                  onChange={(e) => setWorkerForm((prev) => ({ ...prev, vehiclePlate: e.target.value }))}
                  placeholder="Ej. AB1C23D"
                />
              </Field>
            </div>

            <PhotoInput
              label="Foto de la Cédula / Licencia de Conducir"
              value={workerForm.documentUrl}
              onChange={(url) => setWorkerForm((prev) => ({ ...prev, documentUrl: url }))}
            />

            <Field label="Experiencia o información complementaria">
              <textarea
                value={workerForm.details}
                onChange={(e) => setWorkerForm((prev) => ({ ...prev, details: e.target.value }))}
                rows={2}
                placeholder="Años de experiencia conduciendo, disponibilidad horaria..."
              />
            </Field>

            <div className="page-actions" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setWorkerModalOpen(false)}
                disabled={regSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={regSubmitting || !workerForm.applicantName || !workerForm.applicantPhone}
                onClick={async () => {
                  setRegSubmitting(true);
                  setRegError('');
                  setRegSuccess('');
                  try {
                    const res = await api.submitRegistrationRequest({
                      type: 'worker',
                      roleRequested: workerForm.roleRequested,
                      applicantName: workerForm.applicantName,
                      applicantPhone: workerForm.applicantPhone,
                      documentId: workerForm.documentId,
                      documentUrl: workerForm.documentUrl,
                      vehicleType: workerForm.vehicleType,
                      vehiclePlate: workerForm.vehiclePlate,
                      vehicleModel: workerForm.vehicleModel,
                      details: workerForm.details,
                    });
                    setRegSuccess(res.message || 'Solicitud enviada con éxito.');
                    setTimeout(() => {
                      setWorkerModalOpen(false);
                      setRegSuccess('');
                    }, 2500);
                  } catch (err) {
                    setRegError(err.message);
                  } finally {
                    setRegSubmitting(false);
                  }
                }}
              >
                {regSubmitting ? <Spinner /> : <Bike size={15} aria-hidden="true" />}
                Enviar Postulación
              </button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
}

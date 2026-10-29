import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, Bike, ClipboardList, LogOut, MapPin, Receipt, Store as StoreIcon, UserRound } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Section } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useConfig } from '../lib/config.jsx';
import { enablePush, pushSupported } from '../lib/push.js';

const ROLE_LABEL = {
  admin: 'Administrador',
  owner: 'Dueño de tienda',
  courier: 'Motorizado',
  customer: 'Cliente',
};

// Pestaña "Cuenta": identidad, avisos push y accesos a los paneles según el rol.
export default function AccountPage() {
  const { user, isAdmin, isOwner, isCourier, logout } = useAuth();
  const { vapidPublicKey } = useConfig();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
      </main>
    </div>
  );
}

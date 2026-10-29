import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bike, ShieldCheck } from 'lucide-react';
import { Alert, Field, Spinner, Tabs } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useConfig } from '../lib/config.jsx';

const DEMO = [
  { label: 'Admin', email: 'franksabadhernandezleon@gmail.com' },
  { label: 'Dueño', email: 'dueno@enruta.com' },
  { label: 'Motorizado', email: 'motorizado@enruta.com' },
  { label: 'Cliente', email: 'cliente@enruta.com' },
];

let gisPromise = null;
const loadGis = () => {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(window.google.accounts.id);
    script.onerror = () => reject(new Error('No pudimos cargar el acceso de Google.'));
    document.head.appendChild(script);
  });
  return gisPromise;
};

export default function LoginPage() {
  const { login, register, loginWithGoogle, user, isAdmin, isOwner, isCourier } = useAuth();
  const { config } = useConfig();
  const googleClientId = config.googleClientId;
  const navigate = useNavigate();
  const location = useLocation();
  const buttonRef = useRef(null);
  const next = new URLSearchParams(location.search).get('next');

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    if (next && next.startsWith('/')) navigate(next, { replace: true });
    else if (isAdmin) navigate('/tuteteno');
    else if (isOwner) navigate('/mitienda');
    else if (isCourier) navigate('/repartidor');
    else navigate('/');
  }, [user, next, isAdmin, isOwner, isCourier, navigate]);

  useEffect(() => {
    if (!googleClientId || !buttonRef.current) return;
    let cancelled = false;

    loadGis()
      .then((id) => {
        if (cancelled) return;
        id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            setError('');
            try {
              await loginWithGoogle(response.credential);
            } catch (requestError) {
              setError(requestError.message);
            }
          },
        });
        id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'continue_with',
          locale: 'es',
        });
      })
      .catch((loadError) => setGoogleMessage(loadError.message));

    return () => {
      cancelled = true;
    };
  }, [googleClientId, loginWithGoogle]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login({ email: form.email.trim(), password: form.password });
      else
        await register({
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          phone: form.phone.trim(),
        });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="brand is-light">
          <span className="brand-logo">
            <Bike size={20} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <strong>ENRUTA</strong>
            <small>Caripito</small>
          </span>
        </div>

        <div className="auth-story-body">
          <p className="eyebrow">Delivery multi-tienda</p>
          <h1>Una sola ruta para todo Caripito.</h1>
          <p className="auth-story-lede">
            Pide en varias tiendas, marca tu ubicación en el mapa y sigue el pedido en tiempo real con la tasa
            del día congelada en tu recibo.
          </p>
          <ul className="auth-points">
            <li>Tasa BCV congelada por pedido</li>
            <li>Ubicación exacta para el motorizado</li>
            <li>Pago móvil, transferencia y Binance</li>
          </ul>
        </div>

        <p className="auth-story-foot">Panel admin · Dueños · Motorizados</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <Tabs
            tabs={[
              { id: 'login', label: 'Entrar' },
              { id: 'register', label: 'Crear cuenta' },
            ]}
            active={mode}
            onChange={(value) => {
              setMode(value);
              setError('');
            }}
          />

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && (
              <>
                <Field label="Tu nombre">
                  <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Ana Pérez" />
                </Field>
                <Field label="Teléfono / WhatsApp">
                  <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="0412-1590242" />
                </Field>
              </>
            )}

            <Field label="Correo">
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="tucorreo@gmail.com"
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Contraseña">
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : undefined}
                required
              />
            </Field>

            <Alert>{error}</Alert>

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? <Spinner /> : <ShieldCheck size={16} aria-hidden="true" />}
              {mode === 'login' ? 'Entrar a ENRUTA' : 'Crear mi cuenta'}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </form>

          <div className="google-block">
            {googleClientId ? (
              <div ref={buttonRef} />
            ) : (
              <p className="muted small">
                El acceso con Google se activa cuando se configura <code>GOOGLE_CLIENT_ID</code> en los secretos de
                la app.
              </p>
            )}
            {googleMessage && <Alert tone="warn">{googleMessage}</Alert>}
          </div>

          <div className="demo-card">
            <strong>Cuentas de la demo</strong>
            <p className="muted small">Contraseña para todas: enruta123</p>
            <ul>
              {DEMO.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-block"
                    onClick={() => setForm((prev) => ({ ...prev, email: account.email, password: 'enruta123' }))}
                  >
                    {account.label} · {account.email}
                  </button>
                </li>
              ))}
            </ul>
            <Link to="/" className="muted small">
              Seguir como invitado →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

import { useState } from 'react';
import { Bike, ArrowRight, Loader2, Store } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

const DEMO = { email: 'dueno@enruta.com', password: 'enruta123' };

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    email: '',
    password: '',
    ownerName: '',
    storeName: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  const useDemo = () => {
    setMode('login');
    setError('');
    setForm((prev) => ({ ...prev, ...DEMO }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await login({ email: form.email.trim(), password: form.password });
      } else {
        await register({
          email: form.email.trim(),
          password: form.password,
          ownerName: form.ownerName.trim(),
          storeName: form.storeName.trim(),
        });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <Bike size={20} aria-hidden="true" />
          </span>
          <span className="brand-name">ENRUTA</span>
        </div>

        <div className="auth-story-body">
          <p className="eyebrow">Panel de tienda</p>
          <h1>Tu catálogo, siempre al día.</h1>
          <p className="auth-story-lede">
            Sube las fotos de tus productos desde el panel y tus clientes verán el catálogo
            actualizado al instante.
          </p>
          <ul className="auth-points">
            <li>
              <span className="dot" aria-hidden="true" />
              Arrastra una foto y listo, sin salir del panel.
            </li>
            <li>
              <span className="dot" aria-hidden="true" />
              JPG, PNG, WEBP o GIF de hasta 5 MB.
            </li>
            <li>
              <span className="dot" aria-hidden="true" />
              Solo tú puedes editar el catálogo de tu tienda.
            </li>
          </ul>
        </div>

        <p className="auth-story-foot">Delivery para tiendas locales</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="tabs" role="tablist" aria-label="Acceso a ENRUTA">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`tab${mode === 'login' ? ' is-active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Ingresar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`tab${mode === 'register' ? ' is-active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Crear tienda
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && (
              <>
                <label className="field">
                  <span>Tu nombre</span>
                  <input
                    value={form.ownerName}
                    onChange={update('ownerName')}
                    placeholder="Rosa Delgado"
                    autoComplete="name"
                  />
                </label>
                <label className="field">
                  <span>Nombre de tu tienda</span>
                  <input
                    value={form.storeName}
                    onChange={update('storeName')}
                    placeholder="Pizzería El Rincón"
                    autoComplete="organization"
                    required
                  />
                </label>
              </>
            )}

            <label className="field">
              <span>Correo</span>
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                placeholder="dueno@enruta.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                value={form.password}
                onChange={update('password')}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : undefined}
                required
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                  Procesando…
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Entrar al panel' : 'Crear mi tienda'}
                  <ArrowRight size={16} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="demo-card">
            <div className="demo-card-head">
              <Store size={16} aria-hidden="true" />
              <span>Cuenta de demostración</span>
            </div>
            <p>
              <code>{DEMO.email}</code> · <code>{DEMO.password}</code>
            </p>
            <button type="button" className="btn btn-ghost btn-block" onClick={useDemo}>
              Usar cuenta demo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

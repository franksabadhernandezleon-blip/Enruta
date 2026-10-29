import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

export default function LoginPage() {
  const { user, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || '/';

    if (user) {
      window.location.href = next;
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Falta VITE_GOOGLE_CLIENT_ID en Render. Rehace el deploy del servicio web.');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (!window.google) {
        setError('No se pudo cargar Google Identity.');
        return;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            try {
              setLoading(true);
              await loginWithGoogle(credential);
              window.location.href = next;
            } catch (err) {
              console.error('Error al iniciar sesión con Google:', err);
              setError('No se pudo iniciar sesión con Google.');
            } finally {
              setLoading(false);
            }
          },
        });

        const button = document.getElementById('google-login-button');
        if (button) {
          window.google.accounts.id.renderButton(button, {
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
          });
        }
      } catch (err) {
        console.error(err);
        setError('Error al inicializar Google Login.');
      }
    };

    script.onerror = () => {
      setError('No se pudo cargar el script de Google.');
    };

    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [user, loginWithGoogle]);

  return (
    <div className="login-container">
      <h2>Iniciar sesión</h2>
      <p>Necesitas iniciar sesión para continuar con tu compra.</p>

      {error && <p style={{ color: 'crimson', marginBottom: 12 }}>{error}</p>}

      <div id="google-login-button" />

      {loading && <p>Cargando sesión con Google...</p>}
    </div>
  );
}
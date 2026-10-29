import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

export default function LoginPage() {
  const { user, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || '/';

    if (user) {
      window.location.href = next;
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (!window.google) return;

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        console.error('Falta VITE_GOOGLE_CLIENT_ID');
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            setLoading(true);
            await loginWithGoogle(credential);
            window.location.href = next;
          } catch (error) {
            console.error('Error al iniciar sesión con Google:', error);
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

      <div id="google-login-button" />

      {loading && <p>Cargando sesión con Google...</p>}
    </div>
  );
}
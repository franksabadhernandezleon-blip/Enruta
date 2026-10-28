import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (!window.google) return;

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            setLoading(true);
            await loginWithGoogle(credential);
            window.location.href = '/';
          } catch (error) {
            console.error('Error en Google login:', error);
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
      document.body.removeChild(script);
    };
  }, [loginWithGoogle]);

  return (
    <div className="login-container">
      <h2>Iniciar sesión</h2>
      <div id="google-login-button" />
      {loading && <p>Conectando con Google...</p>}
    </div>
  );
}
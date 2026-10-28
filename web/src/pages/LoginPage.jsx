LoginPage.jsx' utilizando Supabase para gestionar la sesión e iniciar sesión con Google es el siguiente:
import React from 'react';
import { supabase } from '../lib/supabaseClient';

const LoginPage = () => {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) console.error('Error al iniciar sesión:', error.message);
  };

  return (
    <div className="login-container">
      <h2>Iniciar Sesión</h2>
      <button onClick={handleGoogleLogin} className="google-login-btn">
        Continuar con Google
      </button>
    </div>
  );
};

export default LoginPage;
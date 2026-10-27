import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const restore = async () => {
      if (!getToken()) {
        setReady(true);
        return;
      }
      try {
        const me = await api.me();
        if (active) setAccount(me);
      } catch {
        setToken(null);
      } finally {
        if (active) setReady(true);
      }
    };

    restore();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const result = await api.login({ email, password });
    setToken(result.token);
    setAccount({ owner: result.owner, store: result.store });
    return result;
  }, []);

  const register = useCallback(async (payload) => {
    const result = await api.register(payload);
    setToken(result.token);
    setAccount({ owner: result.owner, store: result.store });
    return result;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAccount(null);
  }, []);

  const value = useMemo(
    () => ({ account, ready, login, register, logout }),
    [account, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}

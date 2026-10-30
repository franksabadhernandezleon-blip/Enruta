import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [ready, setReady] = useState(false);

  const apply = useCallback((data) => {
    if (!data) {
      setUser(null);
      setStore(null);
      return null;
    }
    setToken(data.token);
    setUser(data.user);
    setStore(data.store || null);
    return data.user;
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStore(null);
      return null;
    }
    try {
      const data = await api.me();
      setUser(data.user);
      setStore(data.store || null);
      return data.user;
    } catch {
      setToken(null);
      setUser(null);
      setStore(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      store,
      ready,
      isAdmin: user?.role === 'admin',
      isOwner: user?.role === 'owner' || user?.role === 'admin',
      isCourier: ['courier', 'admin', 'motorizado', 'conductor', 'repartidor'].includes(user?.role),
      login: async (payload) => apply(await api.login(payload)),
      register: async (payload) => apply(await api.register(payload)),
      loginWithGoogle: async (credential) => apply(await api.google(credential)),
      logout: () => {
        setToken(null);
        setUser(null);
        setStore(null);
      },
      refresh,
    }),
    [user, store, ready, apply, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth necesita AuthProvider');
  return context;
};

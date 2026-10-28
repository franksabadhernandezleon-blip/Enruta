import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const ConfigContext = createContext(null);

const FALLBACK = {
  settings: {
    bcvRate: 0,
    baseFeeCents: 0,
    perKmCents: 0,
    includedKm: 0,
    extraStopCents: 0,
    dynamicFeeEnabled: false,
    dynamicFeeCents: 0,
    freeDelivery: false,
    maxWeightKg: 20,
    whatsappNumber: '584121590242',
    whatsappMessage: '¡Hola ENRUTA! Quiero hacer un pedido.',
    payment: {},
  },
  vapidPublicKey: null,
  googleClientId: null,
  pushReady: false,
};

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(FALLBACK);

  const refresh = useCallback(async () => {
    try {
      const data = await api.config();
      setConfig({ ...FALLBACK, ...data });
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ config, settings: config.settings, refresh }), [config, refresh]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig necesita ConfigProvider');
  return context;
};

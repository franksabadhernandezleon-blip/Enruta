import { api } from './api.js';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const registerServiceWorker = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (window.location.pathname.startsWith('/login')) return null;

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
};

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
};

/** Pide permiso, suscribe el dispositivo y registra la suscripción en la API. */
export const enablePush = async ({ vapidPublicKey, role }) => {
  if (!pushSupported()) return { ok: false, message: 'Este navegador no soporta notificaciones push.' };
  if (!vapidPublicKey) return { ok: false, message: 'Las notificaciones aún no están configuradas en el servidor.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, message: 'Permiso de notificaciones denegado.' };

  const registration =
    (await navigator.serviceWorker.getRegistration('/')) || (await registerServiceWorker());
  if (!registration) return { ok: false, message: 'No pudimos activar el service worker.' };

  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  await api.subscribePush(subscription.toJSON(), role);
  return { ok: true, message: 'Notificaciones activadas: sonarán y vibrarán en este dispositivo.' };
};
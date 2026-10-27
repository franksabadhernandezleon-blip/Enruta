import { api } from './api.js';

/**
 * Resiliencia offline del motorizado: IndexedDB guarda los PINs de la ruta y
 * las liberaciones que se validan sin señal, para sincronizarlas al volver.
 */
const DB_NAME = 'enruta-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const QUEUE_STORE = 'queue';

const openDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async (storeName, mode, action) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = action(store);
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
  });
};

export const savePinCache = async (payload) => {
  try {
    await withStore(CACHE_STORE, 'readwrite', (store) =>
      store.put({ ...payload, cachedAt: new Date().toISOString() }, 'pins'),
    );
    return true;
  } catch {
    return false;
  }
};

export const readPinCache = async () => {
  try {
    return (await withStore(CACHE_STORE, 'readonly', (store) => store.get('pins'))) || null;
  } catch {
    return null;
  }
};

const queueRelease = (entry) =>
  withStore(QUEUE_STORE, 'readwrite', (store) => store.add({ ...entry, createdAt: Date.now() }));

export const listQueue = async () => {
  try {
    return (await withStore(QUEUE_STORE, 'readonly', (store) => store.getAll())) || [];
  } catch {
    return [];
  }
};

const dropQueueItem = (id) => withStore(QUEUE_STORE, 'readwrite', (store) => store.delete(id));

// Refresca la caché local de la ruta activa (PIN y códigos) mientras hay señal.
export const refreshPinCache = async () => {
  try {
    const data = await api.courier.pins();
    await savePinCache(data);
    return data;
  } catch {
    return readPinCache();
  }
};

/** Valida el PIN sin señal contra la copia local y lo deja en cola de sincronización. */
export const validatePinOffline = async ({ orderId, stopId, pin }) => {
  const cache = await readPinCache();
  const order = cache?.orders?.find((item) => item.id === orderId);
  if (!order) return { ok: false, message: 'Este pedido no está guardado en el teléfono.' };
  if (String(pin || '').trim() !== String(order.pickupPin)) {
    return { ok: false, message: 'El PIN no coincide (validado sin señal).' };
  }

  const stop = order.stops?.find((item) => item.id === stopId);
  if (stop) stop.released = true;
  await savePinCache(cache);
  await queueRelease({ orderId, stopId, pin: String(pin).trim() });
  return { ok: true, queued: true, message: 'PIN validado sin señal. Se enviará al volver la conexión.' };
};

/** Sincroniza las liberaciones guardadas cuando el motorizado recupera señal. */
export const syncQueuedReleases = async () => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0, pending: (await listQueue()).length };

  const items = await listQueue();
  let synced = 0;

  for (const item of items) {
    try {
      await api.courier.releaseStop(item.orderId, item.stopId, item.pin, true);
      await dropQueueItem(item.id);
      synced += 1;
    } catch (error) {
      // PIN inválido o pedido inexistente: no tiene sentido reintentar.
      if ([400, 404, 409].includes(error.status)) {
        await dropQueueItem(item.id);
        continue;
      }
      break;
    }
  }

  const pending = await listQueue();
  if (synced) await refreshPinCache();
  return { synced, pending: pending.length };
};

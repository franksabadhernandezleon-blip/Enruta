import { useEffect, useState } from 'react';

/**
 * Favoritos del cliente: viven en el teléfono (localStorage) para que la pestaña
 * funcione igual sin señal y no dependan de una sesión.
 */
const KEY = 'enruta.favorites';
const EVENT = 'enruta:favorites';

export const readFavoriteIds = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const writeFavoriteIds = (ids) => {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(EVENT));
};

export const toggleFavorite = (storeId) => {
  const ids = readFavoriteIds();
  writeFavoriteIds(ids.includes(storeId) ? ids.filter((id) => id !== storeId) : [...ids, storeId]);
};

export const useFavorites = () => {
  const [ids, setIds] = useState(readFavoriteIds);

  useEffect(() => {
    const sync = () => setIds(readFavoriteIds());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { ids, isFavorite: (storeId) => ids.includes(storeId), toggle: toggleFavorite };
};

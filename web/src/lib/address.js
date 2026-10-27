import { useEffect, useState } from 'react';
import { CARIPITO } from './geo.js';

const KEY = 'enruta.destination';
const EVENT = 'enruta:address';

const DEFAULT = { label: 'Caripito centro', lat: CARIPITO.lat, lng: CARIPITO.lng, reference: '' };

export const readAddress = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
};

export const saveAddress = (value) => {
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(EVENT));
};

export const useAddress = () => {
  const [address, setAddress] = useState(readAddress);

  useEffect(() => {
    const sync = () => setAddress(readAddress());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return [address, saveAddress];
};

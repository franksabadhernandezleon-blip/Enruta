export const formatUsd = (cents) => {
  const value = (Number(cents) || 0) / 100;
  return `USD ${value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatBs = (amount) =>
  `Bs ${(Number(amount) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatRate = (rate) => `${(Number(rate) || 0).toFixed(2)} Bs/USD`;

export const formatDate = (value) =>
  value ? new Date(value).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const formatKm = (km) => `${(Number(km) || 0).toFixed(2)} km`;

export const statusLabel = {
  pending: 'Por preparar',
  picking: 'Preparando',
  ready: 'Listo para retiro',
  accepted: 'Motorizado asignado',
  on_route: 'En ruta',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

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

// Estados para pedidos de tiendas / delivery de comida
export const statusLabel = {
  pending: 'Por preparar',
  picking: 'Preparando',
  ready: 'Listo para retiro',
  accepted: 'Motorizado asignado',
  on_route: 'En ruta',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

// Estados limpios para servicios de movilidad y transporte de pasajeros (mototaxi / taxi)
export const transportStatusLabel = {
  pending: 'Buscando conductor',
  picking: 'Buscando conductor',
  ready: 'Buscando conductor',
  accepted: 'Conductor asignado / En camino al origen',
  on_route: 'Pasajero a bordo / Viaje en curso',
  delivered: 'Viaje finalizado',
  cancelled: 'Viaje cancelado',
};

// Obtiene la etiqueta del estado según el tipo de pedido (delivery vs transporte)
export const getOrderStatusLabel = (order) => {
  const type = order?.orderType || order?.order_type || '';
  const isTransport = type === 'mototaxi' || type === 'taxi';
  if (isTransport) {
    return transportStatusLabel[order?.status] || order?.status;
  }
  return statusLabel[order?.status] || order?.status;
};

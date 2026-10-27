const formatter = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

export const formatPrice = (cents) => formatter.format((Number(cents) || 0) / 100);

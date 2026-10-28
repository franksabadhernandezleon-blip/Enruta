import { mapsLink, whatsappLink } from './geo.js';
import { formatBs, formatUsd } from './format.js';

/** Mensaje estructurado del pedido: productos por tienda, delivery multi-parada, total y mapa. */
export const buildOrderMessage = ({ order, lines = [], stops = [], address, settings, paymentLabel }) => {
  const byStore = [];
  for (const line of lines) {
    let group = byStore.find((item) => item.storeName === line.storeName);
    if (!group) {
      group = { storeName: line.storeName, items: [], subtotalCents: 0 };
      byStore.push(group);
    }
    group.items.push(line);
    group.subtotalCents += line.priceCents * line.qty;
  }

  const rows = [
    `*ENRUTA · Pedido ${order?.code || 'nuevo'}*`,
    '',
    '*Productos por tienda:*',
  ];

  for (const group of byStore) {
    rows.push(`• *${group.storeName}* — ${formatUsd(group.subtotalCents)}`);
    for (const line of group.items) {
      rows.push(`   ${line.qty}x ${line.name} (${formatUsd(line.priceCents)})`);
    }
  }

  rows.push('', '*Delivery multi-parada:*');
  if (stops.length) {
    stops.forEach((stop, index) => {
      rows.push(`   ${index + 1}. ${stop.storeName}${stop.extraFeeCents ? ` (+${formatUsd(stop.extraFeeCents)})` : ''}`);
    });
  } else {
    rows.push('   1 parada');
  }
  rows.push(`   Distancia: ${Number(order?.distanceKm || 0).toFixed(2)} km · ${order?.extraStops || 0} parada(s) extra`);
  rows.push(`   Delivery: ${formatUsd(order?.deliveryCents || 0)}`);

  rows.push(
    '',
    `*Total: ${formatUsd(order?.totalCents || 0)}*`,
    `Total en Bs: ${formatBs(order?.totalBs || 0)} (tasa BCV congelada ${Number(order?.bcvRate || settings?.bcvRate || 0).toFixed(2)})`,
    '',
    '*Datos:*',
    `   Cliente: ${order?.customerName || ''} ${order?.customerPhone ? `· ${order.customerPhone}` : ''}`,
    `   Dirección: ${address?.label || order?.address || ''}${address?.reference ? ` (${address.reference})` : ''}`,
    `   Mapa: ${mapsLink({ lat: order?.lat || address?.lat, lng: order?.lng || address?.lng })}`,
  );

  if (paymentLabel) rows.push(`   Pago: ${paymentLabel}${order?.paymentRef ? ` · ref ${order.paymentRef}` : ''}`);
  if (order?.notes) rows.push(`   Notas: ${order.notes}`);

  return rows.join('\n');
};

export const whatsappOrderLink = (number, message) => whatsappLink(number, message);

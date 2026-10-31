import { query } from './db.js';

// La configuración vive en una sola fila (id = 1). Se crea con valores por defecto si falta.
export const getSettings = async () => {
  const { rows } = await query('SELECT * FROM settings WHERE id = 1');
  if (rows[0]) return rows[0];
  const inserted = await query('INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET id = 1 RETURNING *');
  return inserted.rows[0];
};

const NUMERIC_FIELDS = [
  'bcv_rate',
  'base_fee_cents',
  'per_km_cents',
  'moto_base_fee_cents',
  'moto_per_km_cents',
  'taxi_base_fee_cents',
  'taxi_per_km_cents',
  'included_km',
  'extra_stop_cents',
  'dynamic_fee_cents',
  'courier_commission_pct',
  'platform_commission_pct',
  'max_weight_kg',
  'max_negative_balance',
  'max_debt_usd',
];

const BOOLEAN_FIELDS = [
  'charge_courier_store_leg',
  'dynamic_fee_enabled',
  'personal_courier_mode',
  'free_delivery',
];

const TEXT_FIELDS = ['whatsapp_number', 'whatsapp_message'];

export const updateSettings = async (patch = {}) => {
  const sets = [];
  const values = [];

  for (const field of NUMERIC_FIELDS) {
    if (patch[field] === undefined) continue;
    const value = Number(patch[field]);
    if (!Number.isFinite(value) || value < 0) continue;
    values.push(value);
    sets.push(`${field} = $${values.length}`);
  }

  for (const field of BOOLEAN_FIELDS) {
    if (patch[field] === undefined) continue;
    values.push(Boolean(patch[field]));
    sets.push(`${field} = $${values.length}`);
  }

  for (const field of TEXT_FIELDS) {
    if (patch[field] === undefined) continue;
    values.push(String(patch[field]));
    sets.push(`${field} = $${values.length}`);
  }

  if (patch.payment && typeof patch.payment === 'object') {
    values.push(JSON.stringify(patch.payment));
    sets.push(`payment = $${values.length}::jsonb`);
  }

  if (patch.admin_emails && Array.isArray(patch.admin_emails)) {
    const emails = patch.admin_emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
    values.push(JSON.stringify(emails));
    sets.push(`admin_emails = $${values.length}::jsonb`);
  }

  if (patch.bcv_rate !== undefined) {
    sets.push('bcv_updated_at = now()');
  }

  if (!sets.length) return getSettings();

  sets.push('updated_at = now()');
  values.push(1);
  const { rows } = await query(`UPDATE settings SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  return rows[0];
};

// Lo que el cliente necesita antes de iniciar sesión: nada de comisiones ni correos.
export const publicSettings = (settings) => ({
  bcvRate: Number(settings.bcv_rate),
  bcvUpdatedAt: settings.bcv_updated_at,
  baseFeeCents: settings.base_fee_cents,
  perKmCents: settings.per_km_cents,
  motoBaseFeeCents: settings.moto_base_fee_cents,
  motoPerKmCents: settings.moto_per_km_cents,
  taxiBaseFeeCents: settings.taxi_base_fee_cents,
  taxiPerKmCents: settings.taxi_per_km_cents,
  includedKm: Number(settings.included_km),
  extraStopCents: settings.extra_stop_cents,
  chargeCourierStoreLeg: settings.charge_courier_store_leg,
  dynamicFeeEnabled: settings.dynamic_fee_enabled,
  dynamicFeeCents: settings.dynamic_fee_cents,
  freeDelivery: settings.free_delivery,
  maxWeightKg: Number(settings.max_weight_kg),
  whatsappNumber: settings.whatsapp_number,
  whatsappMessage: settings.whatsapp_message,
  payment: settings.payment,
});

import { useEffect, useState } from 'react';
import { Save, Send } from 'lucide-react';
import { Alert, Field, Section, Spinner, Toggle } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';

const centsToUsd = (cents) => (Number(cents || 0) / 100).toFixed(2);

export default function AdminRateEngine({ settings, onSaved }) {
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!settings) return;
    setForm({
      bcv_rate: Number(settings.bcv_rate),
      base_fee: centsToUsd(settings.base_fee_cents),
      per_km: centsToUsd(settings.per_km_cents),
      moto_base_fee: centsToUsd(settings.moto_base_fee_cents ?? 150),
      moto_per_km: centsToUsd(settings.moto_per_km_cents ?? 60),
      taxi_base_fee: centsToUsd(settings.taxi_base_fee_cents ?? 250),
      taxi_per_km: centsToUsd(settings.taxi_per_km_cents ?? 100),
      included_km: Number(settings.included_km),
      extra_stop: centsToUsd(settings.extra_stop_cents),
      dynamic_fee: centsToUsd(settings.dynamic_fee_cents),
      courier_commission_pct: Number(settings.courier_commission_pct),
      platform_commission_pct: Number(settings.platform_commission_pct),
      max_weight_kg: Number(settings.max_weight_kg),
      max_negative_balance: settings.max_negative_balance !== undefined ? Number(settings.max_negative_balance) : -10.0,
      whatsapp_number: settings.whatsapp_number,
      whatsapp_message: settings.whatsapp_message,
      charge_courier_store_leg: settings.charge_courier_store_leg,
      dynamic_fee_enabled: settings.dynamic_fee_enabled,
      free_delivery: settings.free_delivery,
      personal_courier_mode: settings.personal_courier_mode,
      payment: {
        pagoMovil: { ...(settings.payment?.pagoMovil || {}) },
        transferencia: { ...(settings.payment?.transferencia || {}) },
        binance: { ...(settings.payment?.binance || {}) },
      },
    });
  }, [settings]);

  if (!form) return <Spinner />;

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const updatePayment = (method, key, value) =>
    setForm((prev) => ({ ...prev, payment: { ...prev.payment, [method]: { ...prev.payment[method], [key]: value } } }));

  const save = async () => {
    setStatus('saving');
    setError('');
    setMessage('');
    try {
      await api.admin.updateSettings({
        bcv_rate: Number(form.bcv_rate),
        base_fee_cents: Math.round(Number(form.base_fee) * 100),
        per_km_cents: Math.round(Number(form.per_km) * 100),
        moto_base_fee_cents: Math.round(Number(form.moto_base_fee) * 100),
        moto_per_km_cents: Math.round(Number(form.moto_per_km) * 100),
        taxi_base_fee_cents: Math.round(Number(form.taxi_base_fee) * 100),
        taxi_per_km_cents: Math.round(Number(form.taxi_per_km) * 100),
        included_km: Number(form.included_km),
        extra_stop_cents: Math.round(Number(form.extra_stop) * 100),
        dynamic_fee_cents: Math.round(Number(form.dynamic_fee) * 100),
        courier_commission_pct: Number(form.courier_commission_pct),
        platform_commission_pct: Number(form.platform_commission_pct),
        max_weight_kg: Number(form.max_weight_kg),
        max_negative_balance: Number(form.max_negative_balance),
        whatsapp_number: form.whatsapp_number,
        whatsapp_message: form.whatsapp_message,
        charge_courier_store_leg: form.charge_courier_store_leg,
        dynamic_fee_enabled: form.dynamic_fee_enabled,
        free_delivery: form.free_delivery,
        personal_courier_mode: form.personal_courier_mode,
        payment: form.payment,
      });
      setMessage('Configuración guardada.');
      setStatus('idle');
      onSaved?.();
    } catch (requestError) {
      setError(requestError.message);
      setStatus('idle');
    }
  };

  const testPush = async () => {
    try {
      const result = await api.admin.testPush();
      setMessage(`Notificación enviada a ${result.sent} dispositivo(s).`);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="admin-grid">
      <Alert>{error}</Alert>
      <Alert tone="ok">{message}</Alert>

      <Section title="Tasa BCV" subtitle={`Actualización manual · última ${formatDate(settings?.bcv_updated_at)}`}>
        <Field label="Bolívares por dólar" hint="La tasa se congela en cada pedido al generarlo.">
          <input value={form.bcv_rate} onChange={update('bcv_rate')} inputMode="decimal" />
        </Field>
      </Section>

      <Section
        title="Tarifas de Movilidad"
        subtitle="Tarifa base y costo por km para Mototaxi y Taxi/Carro"
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={status === 'saving'}>
            <Save size={15} aria-hidden="true" />
            {status === 'saving' ? 'Guardando…' : 'Guardar Tarifas'}
          </button>
        }
      >
        <div className="field-row">
          <Field label="Tarifa Base (Motorizado 🏍️)" hint="Precio base mínimo para carreras en moto (USD)">
            <input value={form.moto_base_fee} onChange={update('moto_base_fee')} inputMode="decimal" />
          </Field>
          <Field label="Costo por KM (Motorizado 🏍️)" hint="Costo por cada km recorrido en moto (USD)">
            <input value={form.moto_per_km} onChange={update('moto_per_km')} inputMode="decimal" />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Tarifa Base (Carro 🚗)" hint="Precio base mínimo para carreras en carro (USD)">
            <input value={form.taxi_base_fee} onChange={update('taxi_base_fee')} inputMode="decimal" />
          </Field>
          <Field label="Costo por KM (Carro 🚗)" hint="Costo por cada km recorrido en carro (USD)">
            <input value={form.taxi_per_km} onChange={update('taxi_per_km')} inputMode="decimal" />
          </Field>
        </div>
      </Section>

      <Section title="Motor de delivery" subtitle="Tarifa base, costo por km y paradas extra multi-tienda">
        <div className="field-row">
          <Field label="Tarifa base (USD)">
            <input value={form.base_fee} onChange={update('base_fee')} inputMode="decimal" />
          </Field>
          <Field label="Costo por KM (USD)">
            <input value={form.per_km} onChange={update('per_km')} inputMode="decimal" />
          </Field>
        </div>
        <div className="field-row">
          <Field label="KM incluidos">
            <input value={form.included_km} onChange={update('included_km')} inputMode="decimal" />
          </Field>
          <Field label="Parada extra (USD)" hint="Se suma por cada tienda adicional en la ruta.">
            <input value={form.extra_stop} onChange={update('extra_stop')} inputMode="decimal" />
          </Field>
        </div>
        <Toggle
          checked={form.charge_courier_store_leg}
          onChange={(value) => setForm((prev) => ({ ...prev, charge_courier_store_leg: value }))}
          label="Cobrar tramo Repartidor→Tienda"
          hint="Suma la tarifa base por el recorrido del motorizado hasta la tienda."
        />
        <Toggle
          checked={form.dynamic_fee_enabled}
          onChange={(value) => setForm((prev) => ({ ...prev, dynamic_fee_enabled: value }))}
          label="Tarifa dinámica (lluvia / noche)"
          hint="El cliente puede activar el recargo al pagar."
        />
        <Field label="Recargo dinámico (USD)">
          <input value={form.dynamic_fee} onChange={update('dynamic_fee')} inputMode="decimal" />
        </Field>
        <Toggle
          checked={form.free_delivery}
          onChange={(value) => setForm((prev) => ({ ...prev, free_delivery: value }))}
          label="Delivery gratis (promoción)"
          hint="Los pedidos se facturan sin costo de envío."
        />
      </Section>

      <Section title="Comisiones" subtitle="Porcentaje del delivery para cada parte">
        <div className="field-row">
          <Field label="Motorizado (%)">
            <input value={form.courier_commission_pct} onChange={update('courier_commission_pct')} inputMode="decimal" />
          </Field>
          <Field label="Plataforma (%)">
            <input value={form.platform_commission_pct} onChange={update('platform_commission_pct')} inputMode="decimal" />
          </Field>
        </div>
        <Toggle
          checked={form.personal_courier_mode}
          onChange={(value) => setForm((prev) => ({ ...prev, personal_courier_mode: value }))}
          label="Modo repartidor personal (100% al Admin)"
          hint="El motorizado no acumula comisión: todo el delivery queda para ENRUTA."
        />
      </Section>

      <Section title="Ajustes" subtitle="WhatsApp, límite de peso y datos de pago">
        <Field label="Número de WhatsApp (con código de país)">
          <input value={form.whatsapp_number} onChange={update('whatsapp_number')} />
        </Field>
        <Field label="Mensaje base de WhatsApp">
          <textarea value={form.whatsapp_message} onChange={update('whatsapp_message')} rows={2} />
        </Field>
        <div className="field-row">
          <Field label="Límite de peso por pedido (kg)">
            <input value={form.max_weight_kg} onChange={update('max_weight_kg')} inputMode="decimal" />
          </Field>
          <Field label="Límite de deuda billetera tienda (USD)">
            <input value={form.max_negative_balance} onChange={update('max_negative_balance')} inputMode="decimal" />
          </Field>
        </div>

        {['pagoMovil', 'transferencia', 'binance'].map((method) => (
          <div key={method} className="payment-editor">
            <h3>{method}</h3>
            <div className="field-row">
              {Object.keys(form.payment[method]).length === 0 && (
                <p className="muted small">Sin datos cargados.</p>
              )}
              {Object.entries(form.payment[method]).map(([key, value]) => (
                <Field key={key} label={key}>
                  <input value={value} onChange={(event) => updatePayment(method, key, event.target.value)} />
                </Field>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <div className="page-actions">
        <button type="button" className="btn btn-ghost" onClick={testPush}>
          <Send size={15} aria-hidden="true" />
          Probar notificación
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? <Spinner /> : <Save size={15} aria-hidden="true" />}
          Guardar configuración
        </button>
      </div>
    </div>
  );
}

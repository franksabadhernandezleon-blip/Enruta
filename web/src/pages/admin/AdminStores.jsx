import { useEffect, useState } from 'react';
import { Copy, Link2, MapPin, Plus, Save, Store as StoreIcon, Trash2 } from 'lucide-react';
import MapPicker from '../../components/MapPicker.jsx';
import PhotoInput from '../../components/PhotoInput.jsx';
import { Alert, Field, Section, Spinner, Toggle } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { CARIPITO } from '../../lib/geo.js';

const EMPTY = {
  name: '',
  slug: '',
  ownerEmail: '',
  phone: '',
  description: '',
  address: '',
  lat: CARIPITO.lat,
  lng: CARIPITO.lng,
  rating: 5,
  logoUrl: '',
  bannerUrl: '',
  open: true,
};

export default function AdminStores() {
  const [stores, setStores] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [payoutModal, setPayoutModal] = useState({ open: false, store: null, amount: '' });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPin, setShowPin] = useState(false);

  const load = async () => {
    try {
      const data = await api.admin.stores();
      setStores(data.stores);
      setStatus('ready');
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (store) => {
    setEditingId(store.id);
    setShowPin(true);
    setDraft({
      name: store.name,
      slug: store.slug,
      ownerEmail: store.ownerEmail || '',
      phone: store.phone || '',
      description: store.description || '',
      address: store.address || '',
      lat: store.lat ?? CARIPITO.lat,
      lng: store.lng ?? CARIPITO.lng,
      rating: Number(store.rating),
      logoUrl: store.logoUrl || '',
      bannerUrl: store.bannerUrl || '',
      open: store.open,
    });
  };

  const save = async () => {
    setError('');
    setMessage('');
    try {
      const payload = {
        ...draft,
        lat: Number(draft.lat),
        lng: Number(draft.lng),
        rating: Number(draft.rating),
      };
      if (editingId) await api.admin.updateStore(editingId, payload);
      else await api.admin.createStore(payload);
      setMessage(editingId ? 'Tienda actualizada.' : 'Tienda creada.');
      setDraft(EMPTY);
      setEditingId(null);
      setShowPin(false);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const remove = async (store) => {
    setError('');
    try {
      await api.admin.deleteStore(store.id);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const copyLink = async (store) => {
    const url = `${window.location.origin}/tienda/${store.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`Link único copiado: ${url}`);
    } catch {
      setMessage(`Link único: ${url}`);
    }
  };

  return (
    <div className="admin-grid">
      <Alert>{error}</Alert>
      <Alert tone="ok">{message}</Alert>

      <Section title="Tiendas" subtitle="CRUD con mapa de pin arrastrable, link único y correo del dueño">
        {status === 'loading' && <Spinner />}
        <ul className="admin-list">
          {stores.map((store) => (
            <li key={store.id}>
              <div className="admin-row-main">
                <span className="avatar" aria-hidden="true">
                  <StoreIcon size={16} />
                </span>
                <div>
                  <strong>{store.name}</strong>
                  <span className="muted">
                    {store.ownerEmail || 'sin dueño'} · Saldo: ${Number(store.walletBalance || 0).toFixed(2)} ·{' '}
                    {store.isActive ? (store.open ? 'Abierta' : 'Cerrada') : 'Pausada (Deuda)'}
                  </span>
                </div>
              </div>
              <div className="admin-row-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyLink(store)}>
                  <Link2 size={14} aria-hidden="true" />
                  Link único
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPayoutModal({ open: true, store, amount: '' })}
                >
                  Abonar Billetera
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(store)}>
                  Editar
                </button>
                <button type="button" className="btn btn-icon btn-danger" onClick={() => remove(store)} aria-label={`Eliminar ${store.name}`}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={editingId ? 'Editar tienda' : 'Nueva tienda'}
        subtitle="El pin colapsa al guardar y define las distancias del delivery"
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(EMPTY); setEditingId(null); setShowPin(false); }}>
            <Plus size={14} aria-hidden="true" />
            Limpiar
          </button>
        }
      >
        <div className="field-row">
          <Field label="Nombre">
            <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
          </Field>
          <Field label="Correo del dueño" hint="Al registrarse con este correo, la cuenta queda como dueño.">
            <input value={draft.ownerEmail} onChange={(event) => setDraft((prev) => ({ ...prev, ownerEmail: event.target.value }))} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Teléfono del local (privado)">
            <input value={draft.phone} onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))} />
          </Field>
          <Field label="Estrellas (1 a 5)">
            <input value={draft.rating} onChange={(event) => setDraft((prev) => ({ ...prev, rating: event.target.value }))} inputMode="decimal" />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} rows={2} />
        </Field>
        <Field label="Dirección (privada, solo admin y motorizado)">
          <input value={draft.address} onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))} />
        </Field>

        <div className="pin-block">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPin((prev) => !prev)}>
            <MapPin size={14} aria-hidden="true" />
            {showPin ? 'Colapsar ubicación' : 'Ubicación en el mapa'}
          </button>
          {showPin && (
            <MapPicker
              point={{ lat: Number(draft.lat), lng: Number(draft.lng) }}
              onChange={(point) => setDraft((prev) => ({ ...prev, lat: point.lat, lng: point.lng }))}
              label="Tienda"
            />
          )}
        </div>

        <div className="field-row">
          <PhotoInput label="Logo" shape="square" value={draft.logoUrl} onChange={(url) => setDraft((prev) => ({ ...prev, logoUrl: url }))} />
          <PhotoInput label="Banner" value={draft.bannerUrl} onChange={(url) => setDraft((prev) => ({ ...prev, bannerUrl: url }))} />
        </div>

        <Toggle
          checked={draft.open}
          onChange={(value) => setDraft((prev) => ({ ...prev, open: value }))}
          label="Tienda abierta"
          hint="Si está cerrada, el cliente no puede agregar productos."
        />

        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={save}>
            <Save size={15} aria-hidden="true" />
            {editingId ? 'Guardar cambios' : 'Crear tienda'}
          </button>
        </div>
      </Section>

      {payoutModal.open && (
        <div
          className="modal-backdrop"
          onClick={() => setPayoutModal({ open: false, store: null, amount: '' })}
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(420px, 100%)', backgroundColor: '#fff', borderRadius: '14px', padding: '20px' }}
          >
            <h3>Abonar a Billetera — {payoutModal.store?.name}</h3>
            <p className="muted small" style={{ margin: '8px 0 16px' }}>
              Saldo actual: ${Number(payoutModal.store?.walletBalance || 0).toFixed(2)}
            </p>
            <Field label="Monto a abonar (USD)">
              <input
                type="number"
                step="0.01"
                value={payoutModal.amount}
                onChange={(e) => setPayoutModal((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Ej: 10.00"
              />
            </Field>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPayoutModal({ open: false, store: null, amount: '' })}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await api.admin.payoutStore(payoutModal.store.id, Number(payoutModal.amount));
                    setPayoutModal({ open: false, store: null, amount: '' });
                    setMessage('Abono registrado y saldo actualizado.');
                    await load();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Registrar Pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

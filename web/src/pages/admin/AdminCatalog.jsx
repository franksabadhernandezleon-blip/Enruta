import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import PhotoInput from '../../components/PhotoInput.jsx';
import { Alert, Field, Section, Spinner, Toggle } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatUsd } from '../../lib/format.js';

const EMPTY = {
  storeId: '',
  name: '',
  description: '',
  price: '',
  stock: '',
  weightKg: '1',
  imageUrl: '',
  requiresConfirmation: false,
  position: 1,
};

export default function AdminCatalog() {
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (storeId = filter) => {
    setLoading(true);
    try {
      const [storeData, productData] = await Promise.all([
        api.admin.stores(),
        api.admin.products(storeId || undefined),
      ]);
      setStores(storeData.stores);
      setProducts(productData.products);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const create = async () => {
    setError('');
    setMessage('');
    try {
      if (!draft.storeId) throw new Error('Elige la tienda.');
      await api.admin.createProduct({
        ...draft,
        price: draft.price,
        stock: Number(draft.stock) || 0,
        weightKg: Number(draft.weightKg) || 0,
        position: Number(draft.position) || 1,
      });
      setDraft({ ...EMPTY, storeId: draft.storeId });
      setMessage('Producto creado.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const patch = async (id, payload) => {
    setError('');
    try {
      await api.admin.updateProduct(id, payload);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const remove = async (id) => {
    try {
      await api.admin.deleteProduct(id);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="admin-grid">
      <Alert>{error}</Alert>
      <Alert tone="ok">{message}</Alert>

      <Section
        title="Productos"
        subtitle="Precio, stock, peso (20 kg por pedido), foto dual, confirmación y posicionamiento manual 1 a 4"
        actions={
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar por tienda">
            <option value="">Todas las tiendas</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        }
      >
        {loading && <Spinner />}
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Tienda</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Peso</th>
              <th>Pos.</th>
              <th>Confirmar</th>
              <th>Activo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td data-label="Producto">
                  <strong>{product.name}</strong>
                </td>
                <td data-label="Tienda">{product.storeName}</td>
                <td data-label="Precio">
                  <input
                    defaultValue={(product.priceCents / 100).toFixed(2)}
                    onBlur={(event) => patch(product.id, { price: event.target.value })}
                    inputMode="decimal"
                    aria-label={`Precio de ${product.name}`}
                  />
                </td>
                <td data-label="Stock">
                  <input
                    defaultValue={product.stock}
                    onBlur={(event) => patch(product.id, { stock: Number(event.target.value) })}
                    inputMode="numeric"
                    aria-label={`Stock de ${product.name}`}
                  />
                </td>
                <td data-label="Peso">
                  <input
                    defaultValue={product.weightKg}
                    onBlur={(event) => patch(product.id, { weightKg: Number(event.target.value) })}
                    inputMode="decimal"
                    aria-label={`Peso de ${product.name}`}
                  />
                </td>
                <td data-label="Pos.">
                  <input
                    defaultValue={product.position}
                    onBlur={(event) => patch(product.id, { position: Number(event.target.value) })}
                    inputMode="numeric"
                    aria-label={`Posición de ${product.name}`}
                  />
                </td>
                <td data-label="Confirmar">
                  <input
                    type="checkbox"
                    checked={product.requiresConfirmation}
                    onChange={(event) => patch(product.id, { requiresConfirmation: event.target.checked })}
                    aria-label={`Confirmación de ${product.name}`}
                  />
                </td>
                <td data-label="Activo">
                  <input
                    type="checkbox"
                    checked={product.active}
                    onChange={(event) => patch(product.id, { active: event.target.checked })}
                    aria-label={`Activo ${product.name}`}
                  />
                </td>
                <td>
                  <button type="button" className="btn btn-icon btn-danger" onClick={() => remove(product.id)} aria-label={`Eliminar ${product.name}`}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Nuevo producto" subtitle="Puedes subir la foto desde el teléfono o pegar una URL">
        <div className="field-row">
          <Field label="Tienda">
            <select value={draft.storeId} onChange={(event) => setDraft((prev) => ({ ...prev, storeId: event.target.value }))}>
              <option value="">Elige una tienda</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} rows={2} />
        </Field>
        <div className="field-row">
          <Field label="Precio (USD)">
            <input value={draft.price} onChange={(event) => setDraft((prev) => ({ ...prev, price: event.target.value }))} inputMode="decimal" />
          </Field>
          <Field label="Stock">
            <input value={draft.stock} onChange={(event) => setDraft((prev) => ({ ...prev, stock: event.target.value }))} inputMode="numeric" />
          </Field>
          <Field label="Peso (kg)">
            <input value={draft.weightKg} onChange={(event) => setDraft((prev) => ({ ...prev, weightKg: event.target.value }))} inputMode="decimal" />
          </Field>
          <Field label="Posición (1 a 4)">
            <input value={draft.position} onChange={(event) => setDraft((prev) => ({ ...prev, position: event.target.value }))} inputMode="numeric" />
          </Field>
        </div>
        <PhotoInput label="Foto del producto" value={draft.imageUrl} onChange={(url) => setDraft((prev) => ({ ...prev, imageUrl: url }))} />
        <Toggle
          checked={draft.requiresConfirmation}
          onChange={(value) => setDraft((prev) => ({ ...prev, requiresConfirmation: value }))}
          label="Requiere confirmación de stock"
          hint="Los pedidos con estos productos se coordinan por WhatsApp (sin pago automático)."
        />
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={create}>
            <Save size={15} aria-hidden="true" />
            Crear producto
          </button>
        </div>
      </Section>
    </div>
  );
}

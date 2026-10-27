import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

const EMPTY = { name: '', description: '', price: '', available: true };

export default function ProductFormModal({ open, product, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            description: product.description,
            price: (product.priceCents / 100).toFixed(2),
            available: product.available,
          }
        : EMPTY,
    );
    setError('');
    setSaving(false);
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const update = (field) => (event) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        name: form.name,
        description: form.description,
        price: form.price,
        available: form.available,
      });
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <div className="modal-head">
          <h2 id="product-modal-title">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span>Nombre del producto</span>
            <input
              value={form.name}
              onChange={update('name')}
              placeholder="Pizza Margarita"
              required
            />
          </label>

          <label className="field">
            <span>Descripción</span>
            <textarea
              value={form.description}
              onChange={update('description')}
              placeholder="Masa artesanal, salsa de tomate y mozzarella fresca."
              rows={3}
              maxLength={500}
            />
          </label>

          <label className="field">
            <span>Precio (USD)</span>
            <input
              value={form.price}
              onChange={update('price')}
              inputMode="decimal"
              placeholder="8.50"
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(event) => setForm((prev) => ({ ...prev, available: event.target.checked }))}
            />
            <span>Disponible en el catálogo</span>
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : product ? (
                'Guardar cambios'
              ) : (
                'Agregar producto'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

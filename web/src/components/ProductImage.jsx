import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const validate = (file) => {
  if (!ACCEPTED.includes(file.type)) return 'Usa una imagen JPG, PNG, WEBP o GIF.';
  if (file.size > MAX_BYTES) return 'La imagen supera el límite de 5 MB.';
  return '';
};

export default function ProductImage({ product, onUpdated }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file) => {
    const problem = validate(file);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setBusy(true);
    try {
      const result = await api.uploadProductImage(product.id, file);
      onUpdated(result.product);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await api.removeProductImage(product.id);
      onUpdated(result.product);
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className="media-wrap">
      <div
        className={`media${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={`Foto de ${product.name}`} />
        ) : (
          <div className="media-empty">
            <ImagePlus size={24} aria-hidden="true" />
            <span>Sin foto todavía</span>
            <small>Arrastra una imagen o usa el botón</small>
          </div>
        )}

        <div className="media-actions">
          <button
            type="button"
            className="chip"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {product.imageUrl ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {product.imageUrl && (
            <button
              type="button"
              className="chip chip-quiet"
              onClick={remove}
              disabled={busy}
              aria-label={`Quitar foto de ${product.name}`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {busy && (
          <div className="media-busy">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Subiendo…</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

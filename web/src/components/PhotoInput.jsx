import { useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Upload, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { Alert } from './ui.jsx';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Subida dual: archivo local (stored publicly — anyone with the link can open them) o URL externa, con vista previa. */
export default function PhotoInput({ value, onChange, label = 'Foto', shape = 'wide' }) {
  const inputRef = useRef(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const upload = async (file) => {
    if (!ACCEPTED.includes(file.type)) {
      setMessage('Usa una imagen JPG, PNG, WEBP o GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage('La imagen supera el límite de 5 MB.');
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      const result = await api.uploadImage(file);
      onChange(result.url);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`photo-input photo-${shape}`}>
      <div className="photo-preview">
        {value ? (
          <img src={value} alt={`Vista previa de ${label.toLowerCase()}`} />
        ) : (
          <div className="photo-empty">
            <ImagePlus size={22} aria-hidden="true" />
            <span>Sin foto</span>
          </div>
        )}
        {busy && (
          <div className="photo-busy">
            <Loader2 size={18} className="spin" aria-hidden="true" />
            <span>Subiendo…</span>
          </div>
        )}
        {value && (
          <button type="button" className="photo-clear" onClick={() => onChange('')} aria-label={`Quitar ${label}`}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="photo-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload size={14} aria-hidden="true" />
          Archivo local
        </button>
        <div className="photo-url">
          <input
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="https://…/foto.jpg"
            aria-label={`URL externa para ${label}`}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (!urlDraft.trim()) return;
              onChange(urlDraft.trim());
              setUrlDraft('');
            }}
          >
            <Link2 size={14} aria-hidden="true" />
            URL
          </button>
        </div>
      </div>

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

      <Alert>{message}</Alert>
    </div>
  );
}

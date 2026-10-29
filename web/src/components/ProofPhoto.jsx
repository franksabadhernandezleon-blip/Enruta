import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { loadProofPhoto } from '../lib/api.js';

/**
 * Comprobante de pago. La foto es privada (solo el cliente, la tienda y el admin
 * pueden verla), así que se descarga con el token y se pinta desde un blob local.
 */
export default function ProofPhoto({ proofId, alt = 'Comprobante de pago' }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setSrc('');
    setFailed(false);

    loadProofPhoto(proofId)
      .then((url) => {
        objectUrl = url;
        if (active) setSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proofId]);

  if (failed) {
    return (
      <span className="proof-photo is-empty">
        <ImageOff size={15} aria-hidden="true" />
      </span>
    );
  }

  if (!src) return <span className="proof-photo is-empty">…</span>;

  return (
    <a className="proof-link" href={src} target="_blank" rel="noreferrer" title="Ver comprobante completo">
      <img className="proof-photo" src={src} alt={alt} />
    </a>
  );
}

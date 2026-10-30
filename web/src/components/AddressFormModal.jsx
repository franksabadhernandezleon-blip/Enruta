import { useEffect, useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { Alert, Field, Spinner } from './ui.jsx';
import { api } from '../lib/api.js';
import { geocodeAddress, reverseGeocode } from '../lib/geo.js';

const LABELS = [
  { value: 'Casa', label: 'Casa' },
  { value: 'Trabajo', label: 'Trabajo' },
  { value: 'Otro', label: 'Otro' },
];

/**
 * Modal flotante para crear o editar una dirección de entrega.
 */
export default function AddressFormModal({ isOpen, onClose, onSaved, addressToEdit = null }) {
  const [label, setLabel] = useState('Casa');
  const [addressText, setAddressText] = useState('');
  const [reference, setReference] = useState('');
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [gpsUsed, setGpsUsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (addressToEdit) {
      setLabel(addressToEdit.label || 'Casa');
      setAddressText(addressToEdit.addressText || addressToEdit.address_text || '');
      setReference(addressToEdit.reference || '');
      if (
        addressToEdit.lat !== undefined &&
        addressToEdit.lat !== null &&
        addressToEdit.lng !== undefined &&
        addressToEdit.lng !== null
      ) {
        setCoords({ lat: Number(addressToEdit.lat), lng: Number(addressToEdit.lng) });
        setGpsUsed(true);
      } else {
        setCoords(null);
        setGpsUsed(false);
      }
    } else {
      setLabel('Casa');
      setAddressText('');
      setReference('');
      setCoords(null);
      setGpsUsed(false);
    }
    setError('');
  }, [addressToEdit, isOpen]);

  if (!isOpen) return null;

  const handleUseCurrentLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = Number(position.coords.latitude);
          const lng = Number(position.coords.longitude);
          setCoords({ lat, lng });
          setGpsUsed(true);

          const { formattedAddress } = await reverseGeocode(lat, lng);
          if (formattedAddress) {
            setAddressText(formattedAddress);
          }
        } catch (err) {
          setError(err.message || 'No pudimos obtener la dirección exacta de tu ubicación.');
        } finally {
          setLoading(false);
        }
      },
      (geoError) => {
        setLoading(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError('Permiso de ubicación denegado. Permite el acceso a la ubicación en tu navegador.');
        } else {
          setError('No pudimos obtener tu ubicación actual. Escribe tu dirección manualmente.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!addressText.trim()) {
      setError('Ingresa la dirección exacta.');
      return;
    }

    setLoading(true);

    try {
      let finalLat = coords?.lat !== undefined && coords?.lat !== null ? Number(coords.lat) : null;
      let finalLng = coords?.lng !== undefined && coords?.lng !== null ? Number(coords.lng) : null;

      if (!gpsUsed || finalLat === null || finalLng === null || !Number.isFinite(finalLat) || !Number.isFinite(finalLng)) {
        try {
          const geocoded = await geocodeAddress(addressText.trim());
          if (geocoded && geocoded.lat && geocoded.lng) {
            finalLat = Number(geocoded.lat);
            finalLng = Number(geocoded.lng);
            if (geocoded.formattedAddress) {
              setAddressText(geocoded.formattedAddress);
            }
          }
        } catch {
          // Si falla la geocodificación pero el texto fue ingresado, se permite continuar
        }
      }

      const payload = {
        label,
        addressText: addressText.trim(),
        reference: reference.trim(),
        lat: finalLat,
        lng: finalLng,
      };

      let savedAddress;
      if (addressToEdit?.id) {
        const response = await api.addresses.update(addressToEdit.id, payload);
        savedAddress = response.address;
      } else {
        const response = await api.addresses.create(payload);
        savedAddress = response.address;
      }

      if (onSaved) onSaved(savedAddress);
      onClose();
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar la dirección.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop bg-black/50 fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="modal-content bg-white w-full max-w-lg rounded-xl shadow-xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold flex items-center gap-2 m-0">
            <MapPin size={20} className="text-primary" aria-hidden="true" />
            {addressToEdit ? 'Editar dirección' : 'Nueva dirección de entrega'}
          </h3>
          <button
            type="button"
            className="btn btn-icon p-1 text-gray-500 hover:text-gray-700"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body p-4 overflow-y-auto flex-1 space-y-4">
          <Alert>{error}</Alert>

          <button
            type="button"
            className="btn btn-ghost btn-block w-full flex items-center justify-center gap-2 border border-gray-300 py-2 rounded-lg hover:bg-gray-50"
            onClick={handleUseCurrentLocation}
            disabled={loading}
          >
            <Navigation size={16} aria-hidden="true" />
            Usar mi ubicación actual
          </button>

          <Field label="Etiqueta / Tipo de lugar">
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={loading}
              required
            >
              {LABELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Dirección exacta">
            <input
              type="text"
              value={addressText}
              onChange={(e) => {
                setAddressText(e.target.value);
                setGpsUsed(false);
              }}
              placeholder="Ej: Calle 3, Sector Las Flores, Casa #45"
              required
              disabled={loading}
            />
          </Field>

          <Field label="Punto de referencia (opcional)">
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej: Frente a la panadería, portón azul"
              disabled={loading}
            />
          </Field>

          <div className="modal-actions flex items-center justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner /> Guardando…
                </>
              ) : (
                'Guardar dirección'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

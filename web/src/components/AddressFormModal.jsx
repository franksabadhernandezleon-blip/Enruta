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
 * Modal para crear o editar una dirección.
 *
 * Optimización de cuota de Google Maps:
 * - Si el usuario utiliza "Usar mi ubicación actual", se realiza 1 llamada a reverseGeocode()
 *   y las coordenadas (lat, lng) quedan fijas en el estado. Al guardar NO se vuelve a llamar a Geocoding.
 * - Si el usuario escribe la dirección manualmente, SOLO al presionar "Guardar dirección" se llama a geocodeAddress(addressText)
 *   una única vez para obtener lat/lng.
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
      if (addressToEdit.lat !== undefined && addressToEdit.lng !== undefined) {
        setCoords({ lat: Number(addressToEdit.lat), lng: Number(addressToEdit.lng) });
      } else {
        setCoords(null);
      }
      setGpsUsed(true);
      setCoords({ lat: addressToEdit.lat, lng: addressToEdit.lng });
      setGpsUsed(true); // Al editar con coordenadas existentes, no requiere re-geocodificar salvo que edite el texto
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

          
          // reverseGeocode invoca la API solo al presionar este botón
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
      setError('Ingresa la dirección.');
      return;
    }

    setLoading(true);

    try {
      let finalLat = coords?.lat !== undefined ? Number(coords.lat) : null;
      let finalLng = coords?.lng !== undefined ? Number(coords.lng) : null;

      if (!gpsUsed || finalLat === null || finalLng === null || !Number.isFinite(finalLat) || !Number.isFinite(finalLng)) {
        const geocoded = await geocodeAddress(addressText);
        finalLat = Number(geocoded.lat);
        finalLng = Number(geocoded.lng);
      let finalLat = coords?.lat;
      let finalLng = coords?.lng;

      // Si no utilizó ubicación GPS o cambió el texto manualmente, geocodificamos el texto ingresado
      if (!gpsUsed || !finalLat || !finalLng) {
        // Unica llamada a Geocoding API al guardar dirección redactada a mano
        const geocoded = await geocodeAddress(addressText);
        finalLat = geocoded.lat;
        finalLng = geocoded.lng;
        if (geocoded.formattedAddress) {
          setAddressText(geocoded.formattedAddress);
        }
      }

      const payload = {
        label,
        addressText: addressText.trim(),
        reference: reference.trim(),
        lat: finalLat,
        lng: finalLng,
      }
        try {
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
        } 
     catch (err) {
      setError(err.message || 'Ocurrió un error al guardar la dirección.');
                                                    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: '18px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(500px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 'var(--radius, 14px)',
          backgroundColor: '#ffffff',
          boxShadow: 'var(--shadow, 0 10px 30px rgba(22, 23, 27, 0.08))',
          padding: '20px',
        }}
      >
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--line, #e4e6eb)',
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.1rem' }}>
            <MapPin size={20} className="text-primary" aria-hidden="true" />
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <MapPin size={18} aria-hidden="true" />
            {addressToEdit ? 'Editar dirección' : 'Nueva dirección de entrega'}
          </h3>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Alert>{error}</Alert>

        <form onSubmit={handleSubmit} className="modal-body">
          <Alert>{error}</Alert>

          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={handleUseCurrentLocation}
            disabled={loading}
            style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
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
          <Field label="Dirección exactas">
            <input
              type="text"
              value={addressText}
              onChange={(e) => {
                setAddressText(e.target.value);
                setGpsUsed(false);
                setGpsUsed(false); // Al modificar el texto manualmente se requiere re-geocodificar al guardar
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

          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={handleUseCurrentLocation}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px' }}
          >
            <Navigation size={16} aria-hidden="true" />
            Usar mi ubicación actual
          </button>

          <div
            className="modal-actions"
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid var(--line, #e4e6eb)',
            }}
          >
          <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
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

import { useEffect, useState } from 'react';
import { Briefcase, Check, Home, MapPin, Plus, X } from 'lucide-react';
import AddressFormModal from './AddressFormModal.jsx';
import { Alert, Spinner } from './ui.jsx';
import { api } from '../lib/api.js';

const LABEL_ICONS = {
  Casa: Home,
  Trabajo: Briefcase,
  Otro: MapPin,
};

/**
 * Modal selector de direcciones para el Checkout.
 *
 * OPTIMIZACIÓN DE CUOTA:
 * Al seleccionar una dirección guardada, se leen sus coordenadas (lat, lng) y textos
 * directamente desde la base de datos.
 * CERO llamadas a la API de Geocoding.
 */
export default function AddressSelectorModal({ isOpen, onClose, onSelect, selectedAddressId = null }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  const fetchAddresses = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.addresses.list();
      const list = data.addresses || [];
      setAddresses(list);

      // Si el usuario no tiene direcciones guardadas, abrir directamente el formulario de nueva dirección
      if (list.length === 0) {
        setIsFormModalOpen(true);
      }
    } catch (err) {
      setError(err.message || 'No pudimos obtener tus direcciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAddresses();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectAddress = (addr) => {
    // Retorna los datos guardados sin hacer ninguna llamada a geocodificación
    onSelect(addr);
    onClose();
  };

  const handleNewAddressSaved = async (newAddr) => {
    await fetchAddresses();
    if (newAddr) {
      handleSelectAddress(newAddr);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>¿A qué dirección enviamos tu pedido?</h3>
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar modal">
              <X size={18} />
            </button>
          </div>

          <div className="modal-body">
            <Alert>{error}</Alert>

            {loading ? (
              <p className="muted pad" style={{ textAlign: 'center' }}>
                <Spinner /> Cargando direcciones guardadas…
              </p>
            ) : (
              <div className="address-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {addresses.map((addr) => {
                  const Icon = LABEL_ICONS[addr.label] || MapPin;
                  const isSelected = selectedAddressId === addr.id || (!selectedAddressId && addr.isDefault);

                  return (
                    <div
                      key={addr.id}
                      onClick={() => handleSelectAddress(addr)}
                      style={{
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        border: isSelected ? '2px solid var(--primary, #0070f3)' : '1px solid var(--border, #eaeaea)',
                        background: isSelected ? 'var(--bg-subtle, #f0f7ff)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ display: 'inline-flex', padding: '0.4rem', borderRadius: '50%', background: 'var(--bg-subtle, #f5f5f5)', marginTop: '0.1rem' }}>
                          <Icon size={18} />
                        </span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong>{addr.label}</strong>
                            {addr.isDefault && (
                              <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '0.5rem', background: '#0070f3', color: '#fff' }}>
                                Predeterminada
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>{addr.addressText}</p>
                          {addr.reference && (
                            <p className="muted small" style={{ margin: '0.1rem 0 0 0' }}>
                              Ref: {addr.reference}
                            </p>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <span style={{ color: 'var(--primary, #0070f3)' }}>
                          <Check size={20} />
                        </span>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => setIsFormModalOpen(true)}
                  style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <Plus size={16} aria-hidden="true" />
                  Agregar nueva dirección
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddressFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSaved={handleNewAddressSaved}
      />
    </>
  );
}

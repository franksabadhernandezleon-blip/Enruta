import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, Check, Home, MapPin, Plus, Trash2, Edit3 } from 'lucide-react';
import AddressFormModal from '../components/AddressFormModal.jsx';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Section, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';

const LABEL_ICONS = {
  Casa: Home,
  Trabajo: Briefcase,
  Otro: MapPin,
};

export default function AddressesPage() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addressToEdit, setAddressToEdit] = useState(null);

  const loadAddresses = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.addresses.list();
      setAddresses(data.addresses || []);
    } catch (err) {
      setError(err.message || 'No pudimos cargar tus direcciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const handleSetDefault = async (id) => {
    setError('');
    setMessage('');
    try {
      await api.addresses.setDefault(id);
      setMessage('Dirección predeterminada actualizada.');
      await loadAddresses();
    } catch (err) {
      setError(err.message || 'No se pudo establecer como predeterminada.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta dirección?')) return;

    setError('');
    setMessage('');
    try {
      await api.addresses.delete(id);
      setMessage('Dirección eliminada correctamente.');
      await loadAddresses();
    } catch (err) {
      // Manejar error 409 cuando hay pedido activo
      setError(err.message || 'No se pudo eliminar la dirección.');
    }
  };

  const handleOpenCreateModal = () => {
    setAddressToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (addr) => {
    setAddressToEdit(addr);
    setIsModalOpen(true);
  };

  const handleSaved = async () => {
    setMessage('Dirección guardada con éxito.');
    await loadAddresses();
  };

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="page-head">
          <div>
            <Link to="/cuenta" className="btn btn-ghost btn-sm" style={{ marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <ArrowLeft size={14} aria-hidden="true" /> Volver a Cuenta
            </Link>
            <p className="eyebrow">Direcciones de entrega</p>
            <h1>Mis Direcciones</h1>
            <p className="lede">
              Guarda tus direcciones habituales para agilizar el proceso de pedido en el checkout.
            </p>
          </div>
          <div>
            <button type="button" className="btn btn-primary" onClick={handleOpenCreateModal}>
              <Plus size={16} aria-hidden="true" />
              Agregar nueva dirección
            </button>
          </div>
        </section>

        <Alert>{error}</Alert>
        <Alert tone="ok">{message}</Alert>

        {loading ? (
          <p className="muted pad">
            <Spinner /> Cargando direcciones…
          </p>
        ) : (
          <Section title="Direcciones guardadas">
            {addresses.length === 0 ? (
              <div className="empty">
                <p>Aún no has guardado ninguna dirección.</p>
                <button type="button" className="btn btn-primary" onClick={handleOpenCreateModal}>
                  <Plus size={16} aria-hidden="true" />
                  Agregar mi primera dirección
                </button>
              </div>
            ) : (
              <div className="address-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {addresses.map((addr) => {
                  const Icon = LABEL_ICONS[addr.label] || MapPin;
                  return (
                    <div
                      key={addr.id}
                      className={`panel ${addr.isDefault ? 'is-default-card' : ''}`}
                      style={{
                        position: 'relative',
                        padding: '1.25rem',
                        border: addr.isDefault ? '2px solid var(--primary, #0070f3)' : '1px solid var(--border, #eaeaea)',
                        borderRadius: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ display: 'inline-flex', padding: '0.4rem', borderRadius: '50%', background: 'var(--bg-subtle, #f5f5f5)' }}>
                            <Icon size={18} />
                          </span>
                          <strong>{addr.label}</strong>
                        </div>
                        {addr.isDefault && (
                          <span className="badge" style={{ backgroundColor: 'var(--primary, #0070f3)', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '1rem' }}>
                            Predeterminada
                          </span>
                        )}
                      </div>

                      <p style={{ margin: '0.5rem 0 0.25rem 0', fontWeight: '500' }}>{addr.addressText}</p>
                      {addr.reference && (
                        <p className="muted small" style={{ margin: 0 }}>
                          Ref: {addr.reference}
                        </p>
                      )}

                      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border, #eaeaea)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {!addr.isDefault && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleSetDefault(addr.id)}
                            title="Marcar como predeterminada"
                          >
                            <Check size={14} aria-hidden="true" />
                            Predeterminada
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleOpenEditModal(addr)}
                          title="Editar dirección"
                        >
                          <Edit3 size={14} aria-hidden="true" />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(addr.id)}
                          style={{ color: 'var(--danger, #e53e3e)' }}
                          title="Eliminar dirección"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )}
      </main>

      <AddressFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
        addressToEdit={addressToEdit}
      />
    </div>
  );
}

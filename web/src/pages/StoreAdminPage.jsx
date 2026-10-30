import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Bike, MapPin, Phone, Plus, RefreshCw, Save, Store as StoreIcon, Trash2, Volume2 } from 'lucide-react';
import MapPicker from '../components/MapPicker.jsx';
import PhotoInput from '../components/PhotoInput.jsx';
import ProofPhoto from '../components/ProofPhoto.jsx';
import { Alert, Field, Modal, Section, Spinner, StatusPill, Toggle } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useConfig } from '../lib/config.jsx';
import { formatDate, formatKm, formatUsd, statusLabel } from '../lib/format.js';
import { haversineKm } from '../lib/geo.js';
import { enablePush, pushSupported } from '../lib/push.js';

const EMPTY_PRODUCT = {
  name: '',
  description: '',
  price: '',
  stock: '',
  weightKg: '1',
  imageUrl: '',
  requiresConfirmation: false,
  position: 1,
};

export default function StoreAdminPage() {
  const { user, refresh } = useAuth();
  const { vapidPublicKey } = useConfig();

  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [editor, setEditor] = useState({ open: false, product: null });
  const [draft, setDraft] = useState(EMPTY_PRODUCT);
  const [pins, setPins] = useState({});
  const [busyOrder, setBusyOrder] = useState('');
  const [clock, setClock] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const [storeData, orderData, statsData, proofData] = await Promise.all([
        api.owner.store(),
        api.owner.orders(),
        api.owner.stats(),
        api.owner.proofs(),
      ]);
      setStore(storeData.store);
      setProducts(storeData.products);
      setOrders(orderData.orders);
      setProofs(proofData.proofs);
      setStats(statsData.stats);
      setStatus('ready');
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  // Reloj corto: mantiene al día la cuenta atrás del botón por demora.
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const releaseCourier = async (order) => {
    setError('');
    setMessage('');
    setBusyOrder(order.id);
    try {
      await api.owner.releaseCourier(order.id);
      setMessage(`Pedido ${order.code} liberado: vuelve al radar para que otro motorizado lo tome.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyOrder('');
    }
  };

  // Estado del botón por demora: espera desde la asignación, no desde la creación.
  const courierWaitText = (order) => {
    const release = order.release;
    if (!release?.courierAssigned) return '';
    if (release.arrived) return 'El motorizado ya retiró tu pedido: la ruta va en curso.';
    const availableAt = release.availableAt ? Date.parse(release.availableAt) : null;
    if (!availableAt) return '';
    const remaining = Math.max(0, availableAt - clock);
    if (remaining > 0) {
      return `Si no llega, podrás liberarlo en ${Math.ceil(remaining / 60000)} min (${release.waitMinutes} min desde la asignación).`;
    }
    return `Pasaron los ${release.waitMinutes} min sin que llegue: puedes liberarlo y buscar otro motorizado.`;
  };

  const saveStore = async () => {
    setError('');
    setMessage('');
    try {
      await api.owner.updateStore({
        name: store.name,
        description: store.description,
        phone: store.phone,
        address: store.address,
        lat: Number(store.lat),
        lng: Number(store.lng),
        logoUrl: store.logoUrl,
        bannerUrl: store.bannerUrl,
        open: store.open,
      });
      setShowPin(false);
      setMessage('Tienda guardada. La ubicación quedó actualizada.');
      await refresh();
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const openEditor = (product) => {
    setEditor({ open: true, product });
    setDraft(
      product
        ? {
            name: product.name,
            description: product.description,
            price: (product.priceCents / 100).toFixed(2),
            stock: product.stock,
            weightKg: product.weightKg,
            imageUrl: product.imageUrl || '',
            requiresConfirmation: product.requiresConfirmation,
            position: product.position,
          }
        : EMPTY_PRODUCT,
    );
  };

  const saveProduct = async () => {
    setError('');
    try {
      const payload = {
        storeId: store?.id,
        name: draft.name,
        description: draft.description,
        price: draft.price,
        stock: Number(draft.stock) || 0,
        weightKg: Number(draft.weightKg) || 0,
        imageUrl: draft.imageUrl,
        requiresConfirmation: draft.requiresConfirmation,
        position: Number(draft.position) || 1,
      };
      if (editor.product) await api.products.update(editor.product.id, payload);
      else await api.products.create(payload);
      setEditor({ open: false, product: null });
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const release = async (order) => {
    setError('');
    setMessage('');
    try {
      await api.owner.release(order.id, pins[order.id]);
      setPins((prev) => ({ ...prev, [order.id]: '' }));
      setMessage(`Parada liberada en ${order.code}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const enableOwnerPush = async () => {
    const result = await enablePush({ vapidPublicKey, role: 'owner' });
    setMessage(result.message);
    if (!result.ok) setError(result.message);
  };

  if (status === 'loading') {
    return (
      <div className="admin-shell">
        <p className="muted pad">
          <Spinner /> Cargando tu tienda…
        </p>
      </div>
    );
  }

  if (status === 'error' && !store) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <div className="brand">
            <span className="brand-logo">
              <StoreIcon size={20} aria-hidden="true" />
            </span>
            <span className="brand-text">
              <strong>Mi tienda</strong>
              <small>/mitienda · panel del dueño</small>
            </span>
          </div>
          <div className="admin-header-actions">
            <span className="muted small">{user?.email}</span>
            <Link to="/" className="btn btn-ghost btn-sm">
              Ir al inicio
            </Link>
          </div>
        </header>
        <main className="admin-main pad">
          <Alert tone="error">
            {error || 'No tienes una tienda asignada, contacta al administrador'}
          </Alert>
          <div className="card pad align-center" style={{ marginTop: '1rem' }}>
            <StoreIcon size={48} className="muted" style={{ margin: '1rem auto' }} />
            <h2>Sin tienda asignada</h2>
            <p className="muted">
              Tu cuenta ({user?.email}) aún no tiene una tienda vinculada en el sistema.
            </p>
            <p className="muted small">
              Solicita al administrador en /tuteteno que agregue tu correo como dueño de la tienda.
            </p>
            <div className="page-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={load}>
                <RefreshCw size={15} aria-hidden="true" /> Reintentar
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand">
          <span className="brand-logo">
            <StoreIcon size={20} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <strong>{store?.name || 'Mi tienda'}</strong>
            <small>/mitienda · panel del dueño</small>
          </span>
        </div>
        <div className="admin-header-actions">
          <span className="muted small">{user?.email}</span>
          {pushSupported() && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={enableOwnerPush}>
              <BellRing size={14} aria-hidden="true" />
              Avisos de pedidos
            </button>
          )}
          <Link to={store ? `/tienda/${store.slug}` : '/'} className="btn btn-primary btn-sm">
            Ver Catálogo
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Volver a mi Tienda
          </button>
        </div>
      </header>

      <main className="admin-main">
        <Alert>{error}</Alert>
        <Alert tone="ok">{message}</Alert>

        {store && (store.walletBalance <= (store.maxNegativeBalance ?? -10) || !store.isActive) && (
          <Alert tone="error">
            Tu tienda ha sido pausada. Tienes un saldo pendiente de ${Math.abs(store.walletBalance || 0).toFixed(2)}. Regulariza tu pago para volver a recibir pedidos.
          </Alert>
        )}

        {stats && (
          <section className="stat-grid">
            <div className="stat">
              <span className="stat-value">{stats.ordersToday}</span>
              <span className="stat-label">pedidos hoy</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.pendingStops}</span>
              <span className="stat-label">paradas por liberar</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatUsd(stats.revenueTodayCents)}</span>
              <span className="stat-label">vendido hoy</span>
            </div>
            <div className="stat">
              <span className="stat-value">${Number(store?.walletBalance || 0).toFixed(2)}</span>
              <span className="stat-label">saldo billetera</span>
            </div>
          </section>
        )}

        <div className="admin-grid">
          <Section title="Mi tienda" subtitle="Logotipo, banner y estado Abierto/Cerrado">
            <div className="field-row">
              <PhotoInput label="Logotipo" shape="square" value={store?.logoUrl || ''} onChange={(url) => setStore((prev) => ({ ...prev, logoUrl: url }))} />
              <PhotoInput label="Banner" value={store?.bannerUrl || ''} onChange={(url) => setStore((prev) => ({ ...prev, bannerUrl: url }))} />
            </div>
            <div className="field-row">
              <Field label="Nombre">
                <input value={store?.name || ''} onChange={(event) => setStore((prev) => ({ ...prev, name: event.target.value }))} />
              </Field>
              <Field label="Teléfono del local (privado)">
                <input value={store?.phone || ''} onChange={(event) => setStore((prev) => ({ ...prev, phone: event.target.value }))} />
              </Field>
            </div>
            <Field label="Descripción">
              <textarea
                value={store?.description || ''}
                onChange={(event) => setStore((prev) => ({ ...prev, description: event.target.value }))}
                rows={2}
              />
            </Field>
            <Field label="Dirección del local (privada: solo motorizado y admin)">
              <input value={store?.address || ''} onChange={(event) => setStore((prev) => ({ ...prev, address: event.target.value }))} />
            </Field>

            <Toggle
              checked={Boolean(store?.open)}
              onChange={(value) => setStore((prev) => ({ ...prev, open: value }))}
              label={store?.open ? 'Tienda abierta' : 'Tienda cerrada'}
              hint="Si cierras, el catálogo deja de aceptar pedidos."
            />

            <div className="pin-block">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPin((prev) => !prev)}>
                <MapPin size={14} aria-hidden="true" />
                {showPin ? 'Colapsar ubicación' : 'Ubicación en el mapa'}
              </button>
              {showPin && (
                <MapPicker
                  point={{ lat: Number(store?.lat), lng: Number(store?.lng) }}
                  onChange={(point) => setStore((prev) => ({ ...prev, lat: point.lat, lng: point.lng }))}
                  label="Tu tienda"
                />
              )}
              <p className="muted small">
                El pin define las distancias del delivery. Al guardar, el mapa se colapsa.
              </p>
            </div>

            <div className="page-actions">
              <button type="button" className="btn btn-primary" onClick={saveStore}>
                <Save size={15} aria-hidden="true" />
                Guardar tienda
              </button>
            </div>
          </Section>

          <Section
            title="Pedidos de mi tienda"
            subtitle="Ingresa el PIN de retiro que dicta el motorizado para liberar tu parte"
            actions={
              <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
                Actualizar
              </button>
            }
          >
            <ul className="admin-list">
              {orders.map((order) => (
                <li key={order.id} className="is-stacked">
                  <div className="admin-row-main">
                    <div>
                      <strong>{order.code}</strong>
                      <span className="muted">
                        {formatDate(order.createdAt)} · parada {order.stop.seq} de {order.stopsCount}
                      </span>
                    </div>
                    <StatusPill status={order.status} label={statusLabel[order.status]} />
                    {order.stop.released ? (
                      <span className="status status-delivered">Liberada</span>
                    ) : (
                      <div className="inline-actions">
                        <input
                          value={pins[order.id] || ''}
                          onChange={(event) => setPins((prev) => ({ ...prev, [order.id]: event.target.value }))}
                          placeholder="PIN de 4 dígitos"
                          inputMode="numeric"
                          aria-label={`PIN de retiro para ${order.code}`}
                        />
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => release(order)}>
                          <Volume2 size={14} aria-hidden="true" />
                          Liberar
                        </button>
                      </div>
                    )}
                  </div>

                  {order.courier && (
                    <div className="courier-live">
                      <div className="courier-live-head">
                        <span className="courier-badge">
                          <Bike size={15} aria-hidden="true" />
                          <b>{order.courier.name}</b>
                          <span className="muted small">asignado · va en camino</span>
                        </span>
                        {order.courier.phone && (
                          <a className="btn btn-ghost btn-sm" href={`tel:${order.courier.phone}`}>
                            <Phone size={14} aria-hidden="true" />
                            Llamar
                          </a>
                        )}
                      </div>

                      {order.courierLocation ? (
                        <>
                          <MapPicker
                            readOnly
                            spanKm={4}
                            point={{ lat: order.courierLocation.lat, lng: order.courierLocation.lng }}
                            markers={
                              store
                                ? [
                                    {
                                      id: 'store',
                                      name: 'Tu tienda',
                                      lat: Number(store.lat),
                                      lng: Number(store.lng),
                                    },
                                  ]
                                : []
                            }
                            label="Motorizado"
                          />
                          <p className="muted small">
                            A{' '}
                            {formatKm(
                              haversineKm(order.courierLocation, {
                                lat: Number(store?.lat),
                                lng: Number(store?.lng),
                              }),
                            )}{' '}
                            de tu local · actualizado {formatDate(order.courierLocation.updatedAt)}
                          </p>
                        </>
                      ) : (
                        <p className="muted small">Esperando la ubicación del motorizado…</p>
                      )}

                      <div className="page-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => releaseCourier(order)}
                          disabled={!order.release?.canRelease || busyOrder === order.id}
                        >
                          <RefreshCw size={14} aria-hidden="true" />
                          Liberar / Cambiar conductor por demora
                        </button>
                      </div>
                      <p className="muted small">{courierWaitText(order)}</p>
                    </div>
                  )}

                  <ul className="cart-lines is-compact">
                    {order.items.map((item) => (
                      <li key={item.name}>
                        <div className="cart-line-body">
                          <strong>
                            {item.qty}x {item.name}
                          </strong>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {!orders.length && <li className="muted">Sin pedidos activos por ahora.</li>}
            </ul>
          </Section>

          <Section
            title="Comprobantes de pago"
            subtitle="Solo fotos que envía el cliente. Cada una se borra sola a la semana"
            actions={
              <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
                Actualizar
              </button>
            }
          >
            <ul className="admin-list">
              {proofs.map((proof) => (
                <li key={proof.id}>
                  <div className="admin-row-main">
                    <div>
                      <strong>Pedido {proof.orderCode}</strong>
                      <span className="muted">
                        {proof.customerName || 'Cliente'} · {proof.paymentMethod || 'Pago'} ·{' '}
                        {formatUsd(proof.totalCents)} · {formatDate(proof.createdAt)}
                      </span>
                    </div>
                    <ProofPhoto proofId={proof.id} alt={`Comprobante del pedido ${proof.orderCode}`} />
                    <span className="status status-pending">
                      Se borra en {proof.daysLeft} día{proof.daysLeft === 1 ? '' : 's'}
                    </span>
                  </div>
                </li>
              ))}
              {!proofs.length && <li className="muted">Todavía no hay comprobantes de pago.</li>}
            </ul>
          </Section>

          <Section
            title="Gestión de productos"
            subtitle="Stock, horarios por producto y foto dual"
            actions={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openEditor(null)}>
                <Plus size={14} aria-hidden="true" />
                Nuevo producto
              </button>
            }
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Peso</th>
                  <th>Pos.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td data-label="Producto">
                      <strong>{product.name}</strong>
                      {product.requiresConfirmation && <span className="tag">Confirmar</span>}
                    </td>
                    <td data-label="Precio">{formatUsd(product.priceCents)}</td>
                    <td data-label="Stock">
                      <input
                        defaultValue={product.stock}
                        onBlur={(event) => api.owner.updateProduct(product.id, { stock: Number(event.target.value) }).then(load)}
                        inputMode="numeric"
                        aria-label={`Stock de ${product.name}`}
                      />
                    </td>
                    <td data-label="Peso">{Number(product.weightKg).toFixed(1)} kg</td>
                    <td data-label="Pos.">{product.position}</td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEditor(product)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-danger"
                          onClick={() => api.products.delete(product.id).then(load)}
                          aria-label={`Eliminar ${product.name}`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      </main>

      <Modal
        open={editor.open}
        title={editor.product ? 'Editar producto' : 'Nuevo producto'}
        onClose={() => setEditor({ open: false, product: null })}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditor({ open: false, product: null })}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={saveProduct}>
              <Save size={15} aria-hidden="true" />
              Guardar
            </button>
          </>
        }
      >
        <Field label="Nombre">
          <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} required />
        </Field>
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
          hint="En el checkout se oculta el pago y se coordina por WhatsApp."
        />
      </Modal>
    </div>
  );
}

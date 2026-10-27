import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { formatPrice } from '../lib/format.js';
import TopBar from '../components/TopBar.jsx';
import ProductImage from '../components/ProductImage.jsx';
import ProductFormModal from '../components/ProductFormModal.jsx';

export default function DashboardPage() {
  const { account, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [editor, setEditor] = useState({ open: false, product: null });

  const loadProducts = useCallback(async () => {
    setStatus('loading');
    setLoadError('');
    try {
      const result = await api.listProducts();
      setProducts(result.products);
      setStatus('ready');
    } catch (error) {
      setLoadError(error.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const stats = useMemo(
    () => ({
      total: products.length,
      withImage: products.filter((product) => product.imageUrl).length,
      available: products.filter((product) => product.available).length,
    }),
    [products],
  );

  const replaceProduct = (updated) =>
    setProducts((prev) => prev.map((product) => (product.id === updated.id ? updated : product)));

  const createProduct = async (values) => {
    const result = await api.createProduct(values);
    setProducts((prev) => [result.product, ...prev]);
  };

  const updateProduct = async (values) => {
    const result = await api.updateProduct(editor.product.id, values);
    replaceProduct(result.product);
  };

  const toggleAvailability = async (product) => {
    const previous = products;
    replaceProduct({ ...product, available: !product.available });
    try {
      const result = await api.updateProduct(product.id, { available: !product.available });
      replaceProduct(result.product);
    } catch (error) {
      setProducts(previous);
      setLoadError(error.message);
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`¿Eliminar "${product.name}" de tu catálogo?`)) return;
    try {
      await api.deleteProduct(product.id);
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
    } catch (error) {
      setLoadError(error.message);
    }
  };

  const openNew = () => setEditor({ open: true, product: null });
  const openEdit = (product) => setEditor({ open: true, product });
  const closeEditor = useCallback(() => setEditor({ open: false, product: null }), []);

  return (
    <div className="app-shell">
      <TopBar
        storeName={account.store?.name || 'Mi tienda'}
        ownerEmail={account.owner.email}
        onLogout={logout}
      />

      <main className="page">
        <section className="page-head">
          <div>
            <p className="eyebrow">Catálogo</p>
            <h1>{account.store?.name || 'Mi tienda'}</h1>
            <p className="lede">
              Sube una foto por producto: tu catálogo se actualiza en cuanto la imagen termina de
              cargar.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            <Plus size={16} aria-hidden="true" />
            Nuevo producto
          </button>
        </section>

        <div className="stats">
          <div className="stat">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">productos</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.withImage}</span>
            <span className="stat-label">con foto</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.available}</span>
            <span className="stat-label">disponibles</span>
          </div>
        </div>

        {loadError && (
          <p className="form-error" role="alert">
            {loadError}
          </p>
        )}

        {status === 'loading' && <p className="muted">Cargando tu catálogo…</p>}

        {status === 'error' && (
          <button type="button" className="btn btn-ghost" onClick={loadProducts}>
            Reintentar
          </button>
        )}

        {status === 'ready' && products.length === 0 && (
          <div className="empty">
            <span className="empty-icon">
              <ImagePlus size={22} aria-hidden="true" />
            </span>
            <h2>Tu catálogo está vacío</h2>
            <p>Agrega tu primer producto y súbele una foto para que tus clientes lo vean.</p>
            <button type="button" className="btn btn-primary" onClick={openNew}>
              <Plus size={16} aria-hidden="true" />
              Agregar producto
            </button>
          </div>
        )}

        {status === 'ready' && products.length > 0 && (
          <ul className="product-grid">
            {products.map((product) => (
              <li key={product.id} className={`card${product.available ? '' : ' is-hidden'}`}>
                <ProductImage product={product} onUpdated={replaceProduct} />

                <div className="card-body">
                  <div className="card-title-row">
                    <h3>{product.name}</h3>
                    <span className="price">{formatPrice(product.priceCents)}</span>
                  </div>

                  {product.description && <p className="card-desc">{product.description}</p>}

                  <div className="card-footer">
                    <button
                      type="button"
                      className={`status-pill${product.available ? ' is-on' : ''}`}
                      onClick={() => toggleAvailability(product)}
                      aria-pressed={product.available}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      {product.available ? 'Disponible' : 'Agotado'}
                    </button>

                    <div className="card-actions">
                      <button
                        type="button"
                        className="btn btn-icon"
                        onClick={() => openEdit(product)}
                        aria-label={`Editar ${product.name}`}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon btn-danger"
                        onClick={() => deleteProduct(product)}
                        aria-label={`Eliminar ${product.name}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <ProductFormModal
        open={editor.open}
        product={editor.product}
        onClose={closeEditor}
        onSubmit={editor.product ? updateProduct : createProduct}
      />
    </div>
  );
}

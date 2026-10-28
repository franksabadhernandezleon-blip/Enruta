import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LayoutList, Minus, Plus, ShoppingCart, Store as StoreIcon } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner, Stars } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useCart } from '../lib/cart.jsx';
import { formatUsd } from '../lib/format.js';

export default function StorePage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const cart = useCart();

  useEffect(() => {
    let active = true;
    setStatus('loading');
    api
      .store(slug)
      .then((result) => {
        if (!active) return;
        setData(result);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const grouped = cart.stores.find((group) => group.storeSlug === slug);

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <div className="page-actions">
          <Link to="/" className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} aria-hidden="true" />
            Ver todas las tiendas
          </Link>
          <Link to="/carrito" className="btn btn-primary btn-sm">
            <ShoppingCart size={15} aria-hidden="true" />
            Carrito ({cart.count})
          </Link>
        </div>

        {status === 'loading' && (
          <p className="muted">
            <Spinner /> Cargando catálogo…
          </p>
        )}
        <Alert>{error}</Alert>

        {status === 'ready' && data && (
          <>
            <section className="store-hero">
              <div className="store-hero-banner">
                {data.store.bannerUrl ? (
                  <img src={data.store.bannerUrl} alt={`Banner de ${data.store.name}`} />
                ) : (
                  <span className="store-banner-empty">
                    <StoreIcon size={26} aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="store-hero-body">
                {data.store.logoUrl && (
                  <img className="store-logo" src={data.store.logoUrl} alt={`Logo de ${data.store.name}`} />
                )}
                <div>
                  <h1>{data.store.name}</h1>
                  <Stars value={data.store.rating} />
                  <p className="muted">{data.store.description}</p>
                </div>
                <span className={`status ${data.store.open ? 'status-ready' : 'status-cancelled'}`}>
                  {data.store.open ? 'Abierto' : 'Cerrado'}
                </span>
              </div>
            </section>

            <ul className="product-grid">
              {data.products.map((product) => {
                const line = grouped?.lines.find((item) => item.productId === product.id);
                return (
                  <li key={product.id} className={`product-card${product.stock > 0 ? '' : ' is-out'}`}>
                    <div className="product-media">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} />
                      ) : (
                        <span className="product-media-empty">{product.name.slice(0, 1)}</span>
                      )}
                      {product.requiresConfirmation && <span className="tag">Confirmar stock</span>}
                    </div>
                    <div className="product-body">
                      <h2>{product.name}</h2>
                      <p className="muted">{product.description}</p>
                      <div className="product-meta">
                        <span className="chip chip-quiet">{Number(product.weightKg).toFixed(1)} kg</span>
                        <span className="chip chip-quiet">{product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</span>
                      </div>
                      <div className="product-foot">
                        <b className="price">{formatUsd(product.priceCents)}</b>
                        {line ? (
                          <div className="qty">
                            <button
                              type="button"
                              className="btn btn-icon"
                              onClick={() => cart.setQty(product.id, line.qty - 1)}
                              aria-label={`Quitar uno de ${product.name}`}
                            >
                              <Minus size={14} aria-hidden="true" />
                            </button>
                            <span>{line.qty}</span>
                            <button
                              type="button"
                              className="btn btn-icon"
                              onClick={() => cart.setQty(product.id, line.qty + 1)}
                              aria-label={`Agregar uno de ${product.name}`}
                            >
                              <Plus size={14} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={product.stock <= 0 || !data.store.open}
                            onClick={() => cart.add(product, data.store)}
                          >
                            Agregar
                            <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="page-actions is-footer">
              <Link to="/" className="btn btn-ghost">
                <LayoutList size={15} aria-hidden="true" />
                Ver todas las tiendas
              </Link>
              <Link to="/carrito" className="btn btn-primary">
                Ir al carrito
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

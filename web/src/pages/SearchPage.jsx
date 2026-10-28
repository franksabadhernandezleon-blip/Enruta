import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon, Store as StoreIcon } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner, Stars } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatUsd } from '../lib/format.js';

// Pestaña "Buscar": tiendas y productos de Caripito en una sola consulta.
export default function SearchPage() {
  const [term, setTerm] = useState('');
  const [data, setData] = useState({ stores: [], products: [] });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Retardo corto para no consultar en cada tecla.
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setData({ stores: [], products: [] });
      setStatus('idle');
      setError('');
      return undefined;
    }

    setStatus('loading');
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((result) => {
          setData({ stores: result.stores, products: result.products });
          setError('');
          setStatus('ready');
        })
        .catch((requestError) => {
          setError(requestError.message);
          setStatus('error');
        });
    }, 320);

    return () => clearTimeout(timer);
  }, [term]);

  const searching = term.trim().length >= 2;
  const empty = status === 'ready' && !data.stores.length && !data.products.length;

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="page-head">
          <div>
            <p className="eyebrow">Buscar</p>
            <h1>¿Qué necesitas hoy?</h1>
            <p className="lede">Encuentra tiendas y productos abiertos en Caripito.</p>
          </div>
        </section>

        <div className="search-box">
          <SearchIcon size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Pizza, pan, refrescos…"
            aria-label="Buscar tiendas y productos"
          />
          {status === 'loading' && <Spinner />}
        </div>

        <Alert>{error}</Alert>
        {!searching && <p className="muted">Escribe al menos 2 letras para buscar.</p>}
        {empty && <p className="muted">No encontramos nada con «{term.trim()}».</p>}

        {data.stores.length > 0 && (
          <section className="search-block">
            <h2>Tiendas</h2>
            <ul className="store-grid">
              {data.stores.map((store) => (
                <li key={store.id}>
                  <Link to={`/tienda/${store.slug}`} className={`store-card${store.open ? '' : ' is-closed'}`}>
                    <div className="store-banner">
                      {store.bannerUrl ? (
                        <img src={store.bannerUrl} alt={`Banner de ${store.name}`} />
                      ) : (
                        <span className="store-banner-empty">
                          <StoreIcon size={22} aria-hidden="true" />
                        </span>
                      )}
                      {!store.open && <span className="store-closed">Cerrado</span>}
                    </div>
                    <div className="store-body">
                      <div className="store-title">
                        <h2>{store.name}</h2>
                        <Stars value={store.rating} />
                      </div>
                      <p className="muted">{store.description}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.products.length > 0 && (
          <section className="search-block">
            <h2>Productos</h2>
            <ul className="search-results">
              {data.products.map((product) => (
                <li key={product.id}>
                  <Link to={`/tienda/${product.storeSlug}`} className="panel search-row">
                    <div>
                      <strong>{product.name}</strong>
                      <span className="muted">
                        {product.storeName} · {product.stock > 0 ? `${product.stock} disponibles` : 'sin stock'}
                      </span>
                    </div>
                    <b className="price">{formatUsd(product.priceCents)}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

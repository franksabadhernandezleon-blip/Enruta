import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Heart, Store as StoreIcon } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner, Stars } from '../components/ui.jsx';
import { useConfig } from '../lib/config.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFavorites } from '../lib/favorites.js';

export default function CatalogPage() {
  const [stores, setStores] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const { settings } = useConfig();
  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();

  useEffect(() => {
    let active = true;
    api
      .stores()
      .then((data) => {
        if (!active) return;
        setStores(data.stores);
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
  }, []);

  const openStores = stores.filter((store) => store.open);

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Centro comercial & Transporte</p>
            <h1>
              {user?.name ? `¿Qué te provoca hoy, ${String(user.name).split(' ')[0]}?` : 'Pide a varias tiendas en una sola ruta'}
            </h1>
            <p className="lede">
              Arma tu pedido entre varias tiendas de Caripito o solicita un servicio de transporte exprés.
              Nosotros calculamos la ruta con las paradas extra incluidas.
            </p>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/mototaxi" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                Mototaxis 🏍️
              </Link>
            </div>
          </div>
          <div className="hero-badges">
            <span className="badge">{openStores.length} tiendas abiertas</span>
            <span className="badge">Tasa BCV {Number(settings.bcvRate).toFixed(2)} Bs/USD</span>
            <span className="badge">Máx. {Number(settings.maxWeightKg)} kg por pedido</span>
          </div>
        </section>

        <Alert>{error}</Alert>

        {status === 'loading' && (
          <p className="muted">
            <Spinner /> Cargando tiendas de Caripito…
          </p>
        )}

        {status === 'ready' && (
          <ul className="store-grid">
            {stores.map((store) => (
              <li key={store.id} className="store-card-wrap">
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
                    <div className="store-foot">
                      <span className="chip chip-quiet">{store.productCount} productos</span>
                      <span className="chip chip-quiet">
                        <Clock size={13} aria-hidden="true" /> {store.open ? 'Abierto ahora' : 'Cerrado'}
                      </span>
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  className={`fav-toggle${isFavorite(store.id) ? ' is-on' : ''}`}
                  onClick={() => toggle(store.id)}
                  aria-pressed={isFavorite(store.id)}
                  aria-label={
                    isFavorite(store.id)
                      ? `Quitar ${store.name} de favoritos`
                      : `Guardar ${store.name} en favoritos`
                  }
                >
                  <Heart size={16} fill={isFavorite(store.id) ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Store as StoreIcon } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner, Stars } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useFavorites } from '../lib/favorites.js';

// Pestaña "Favoritos": las tiendas guardadas en el teléfono, con acceso directo a su catálogo.
export default function FavoritesPage() {
  const { ids, toggle } = useFavorites();
  const [stores, setStores] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

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

  const favorites = stores.filter((store) => ids.includes(store.id));

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="page-head">
          <div>
            <p className="eyebrow">Favoritos</p>
            <h1>Mis tiendas de siempre</h1>
            <p className="lede">Guardadas en tu teléfono: no pierdes tus favoritas aunque cierres sesión.</p>
          </div>
        </section>

        <Alert>{error}</Alert>

        {status === 'loading' && (
          <p className="muted">
            <Spinner /> Cargando tu lista…
          </p>
        )}

        {!ids.length && (
          <p className="muted">
            Todavía no tienes favoritas. Toca el corazón en una tienda del <Link to="/">inicio</Link>.
          </p>
        )}

        {ids.length > 0 && status === 'ready' && !favorites.length && (
          <p className="muted">Tus tiendas guardadas ya no están disponibles en el catálogo.</p>
        )}

        {favorites.length > 0 && (
          <ul className="store-grid">
            {favorites.map((store) => (
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
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  className="fav-toggle is-on"
                  onClick={() => toggle(store.id)}
                  aria-label={`Quitar ${store.name} de favoritos`}
                >
                  <Heart size={16} fill="currentColor" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

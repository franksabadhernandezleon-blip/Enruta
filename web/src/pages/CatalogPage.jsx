import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Store as StoreIcon } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { Alert, Spinner, Stars } from '../components/ui.jsx';
import { useConfig } from '../lib/config.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function CatalogPage() {
  const [stores, setStores] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const { settings } = useConfig();
  const { user } = useAuth();

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
            <p className="eyebrow">Centro comercial</p>
            <h1>
              {user?.name ? `¿Qué te provoca hoy, ${String(user.name).split(' ')[0]}?` : 'Pide a varias tiendas en una sola ruta'}
            </h1>
            <p className="lede">
              Arma tu pedido entre varias tiendas de Caripito y nosotros calculamos la ruta con las paradas
              extra incluidas. La tasa BCV queda congelada en tu recibo.
            </p>
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
                    <div className="store-foot">
                      <span className="chip chip-quiet">{store.productCount} productos</span>
                      <span className="chip chip-quiet">
                        <Clock size={13} aria-hidden="true" /> {store.open ? 'Abierto ahora' : 'Cerrado'}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

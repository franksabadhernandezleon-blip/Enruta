import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bike, ClipboardList, MapPin, ShoppingCart, Store, UserRound } from 'lucide-react';
import { useAddress } from '../lib/address.js';
import { useAuth } from '../lib/auth.jsx';
import { useCart } from '../lib/cart.jsx';
import { useConfig } from '../lib/config.jsx';
import { formatRate } from '../lib/format.js';

// Botones de /mitienda y /repartidor: prohibidos para clientes, solo con correo/rol autorizado.
export default function ClientHeader({ onOpenAddress }) {
  const { user, isOwner, isCourier, isAdmin, logout } = useAuth();
  const { count } = useCart();
  const { settings } = useConfig();
  const [address] = useAddress();
  const location = useLocation();
  const navigate = useNavigate();
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);

  // Ocultar encabezado en /mototaxi para darle protagonismo total al mapa interactivo
  if (location.pathname === '/mototaxi' || location.pathname.startsWith('/mototaxi/')) {
    return null;
  }

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollY.current;

      // Al estar muy cerca de la parte superior, mantener siempre visible
      if (currentScrollY <= 60) {
        setIsHidden(false);
      } else if (diff > 8) {
        // Scrolling hacia abajo
        setIsHidden(true);
      } else if (diff < -8) {
        // Scrolling hacia arriba
        setIsHidden(false);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header className={`client-header${isHidden ? ' is-hidden' : ''}`}>
      <div className="client-header-top">
        <Link to="/" className="brand">
          <span className="brand-logo">
            <Bike size={20} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <strong>ENRUTA</strong>
            <small>Caripito</small>
          </span>
        </Link>

        <div className="client-header-actions">
          <Link to="/mototaxi" className="btn btn-ghost btn-sm" title="Solicitar servicio de Mototaxi">
            Mototaxis 🏍️
          </Link>

          <span className="greeting">
            <UserRound size={15} aria-hidden="true" />
            {user ? `Hola, ${String(user.name || user.email).split(' ')[0]}` : 'Hola, invitado'}
          </span>

          {isOwner && (
            <Link to="/mitienda" className="btn btn-ghost btn-sm" title="Panel del dueño">
              <Store size={15} aria-hidden="true" />
              /mitienda
            </Link>
          )}
          {isCourier && (
            <Link to="/repartidor" className="btn btn-ghost btn-sm" title="Panel del motorizado">
              <Bike size={15} aria-hidden="true" />
              /repartidor
            </Link>
          )}
          {isAdmin && (
            <Link to="/tuteteno" className="btn btn-ghost btn-sm" title="Panel de administración">
              <ClipboardList size={15} aria-hidden="true" />
              /tuteteno
            </Link>
          )}

          <Link to="/carrito" className="btn btn-primary btn-cart" aria-label={`Carrito: ${count} productos`}>
            <ShoppingCart size={17} aria-hidden="true" />
            Carrito
            {count > 0 && <span className="cart-count">{count}</span>}
          </Link>
        </div>
      </div>

      <div className="client-header-meta">
        <button type="button" className="meta-chip" onClick={onOpenAddress || (() => navigate('/carrito'))}>
          <MapPin size={14} aria-hidden="true" />
          <span className="meta-label">Entregar en</span>
          <b>{address.label}</b>
        </button>
        <span className="meta-chip is-static">
          <span className="meta-label">Tasa BCV</span>
          <b>{formatRate(settings.bcvRate)}</b>
        </span>
        {user ? (
          <button
            type="button"
            className="meta-chip is-quiet"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            Salir
          </button>
        ) : (
          <Link to="/login" className="meta-chip is-quiet">
            Entrar
          </Link>
        )}
      </div>
    </header>
  );
}

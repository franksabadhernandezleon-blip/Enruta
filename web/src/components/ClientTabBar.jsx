import { NavLink, useLocation } from 'react-router-dom';
import { Heart, Home, Package, Search, UserRound } from 'lucide-react';

// Las 5 opciones fijas de la PWA. El orden no cambia en ninguna vista.
const TABS = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/pedidos', label: 'Pedidos', icon: Package },
  { to: '/buscar', label: 'Buscar', icon: Search },
  { to: '/favoritos', label: 'Favoritos', icon: Heart },
  { to: '/cuenta', label: 'Cuenta', icon: UserRound },
];

// Los paneles de consola (admin, dueño, motorizado) y el login tienen su propia navegación.
const CONSOLE_PATHS = ['/tuteteno', '/mitienda', '/repartidor', '/login'];

export default function ClientTabBar() {
  const { pathname } = useLocation();
  if (CONSOLE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  return (
    <nav className="tabbar" aria-label="Navegación principal">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `tabbar-item${isActive ? ' is-active' : ''}`}
        >
          <tab.icon size={20} aria-hidden="true" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

import { Bike, LogOut, Store } from 'lucide-react';

export default function TopBar({ storeName, ownerEmail, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-icon">
            <Bike size={18} aria-hidden="true" />
          </span>
          <span className="brand-name">ENRUTA</span>
          <span className="brand-tag">Panel de tienda</span>
        </div>

        <div className="topbar-right">
          <span className="store-chip">
            <Store size={15} aria-hidden="true" />
            {storeName}
          </span>
          <span className="owner-email">{ownerEmail}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
            <LogOut size={15} aria-hidden="true" />
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}

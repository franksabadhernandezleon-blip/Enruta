import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, ClipboardList, Store as StoreIcon, Wallet } from 'lucide-react';
import { Alert, Spinner, Tabs } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatUsd } from '../lib/format.js';
import AdminCatalog from './admin/AdminCatalog.jsx';
import AdminCrm from './admin/AdminCrm.jsx';
import AdminOrders from './admin/AdminOrders.jsx';
import AdminRateEngine from './admin/AdminRateEngine.jsx';
import AdminSos from './admin/AdminSos.jsx';
import AdminStores from './admin/AdminStores.jsx';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'tasa', label: 'Tasa y motor' },
  { id: 'tiendas', label: 'Tiendas' },
  { id: 'productos', label: 'Productos' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'crm', label: 'Usuarios y CRM' },
  { id: 'sos', label: 'SOS y pagos' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('resumen');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.admin.overview();
      setOverview(data);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand">
          <span className="brand-logo">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <strong>ENRUTA</strong>
            <small>/tuteteno · administración</small>
          </span>
        </div>
        <div className="admin-header-actions">
          <span className="muted small">{user?.email}</span>
          <Link to="/" className="btn btn-primary btn-sm">
            Ver Tienda
          </Link>
        </div>
      </header>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <main className="admin-main">
        <Alert>{error}</Alert>
        {loading && !overview && (
          <p className="muted">
            <Spinner /> Cargando panel…
          </p>
        )}

        {overview && tab === 'resumen' && (
          <div className="admin-grid">
            <section className="stat-grid">
              <div className="stat">
                <span className="stat-value">{overview.counts.stores}</span>
                <span className="stat-label">tiendas</span>
              </div>
              <div className="stat">
                <span className="stat-value">{overview.counts.products}</span>
                <span className="stat-label">productos activos</span>
              </div>
              <div className="stat">
                <span className="stat-value">{overview.counts.open_orders}</span>
                <span className="stat-label">pedidos en curso</span>
              </div>
              <div className="stat">
                <span className="stat-value">{overview.counts.users}</span>
                <span className="stat-label">usuarios</span>
              </div>
              <div className="stat">
                <span className="stat-value">{formatUsd(overview.counts.revenue_cents)}</span>
                <span className="stat-label">facturado entregado</span>
              </div>
              <div className="stat">
                <span className="stat-value">{formatUsd(overview.counts.platform_cents)}</span>
                <span className="stat-label">comisión plataforma</span>
              </div>
              <div className="stat">
                <span className="stat-value">{formatUsd(overview.counts.courier_cents)}</span>
                <span className="stat-label">comisión motorizados</span>
              </div>
              <div className="stat">
                <span className="stat-value">{overview.sos.filter((alert) => alert.status === 'open').length}</span>
                <span className="stat-label">SOS abiertas</span>
              </div>
            </section>

            <section className="panel">
              <h2>Tasa y operación</h2>
              <div className="summary-row">
                <span>Tasa BCV actual</span>
                <b>{Number(overview.settings.bcv_rate).toFixed(2)} Bs/USD</b>
              </div>
              <div className="summary-row">
                <span>Tarifa base + km</span>
                <b>
                  {formatUsd(overview.settings.base_fee_cents)} + {formatUsd(overview.settings.per_km_cents)}/km
                </b>
              </div>
              <div className="summary-row">
                <span>Comisión motorizado</span>
                <b>{Number(overview.settings.courier_commission_pct).toFixed(0)}%</b>
              </div>
              <p className="muted small">
                <StoreIcon size={13} aria-hidden="true" /> Configura todo desde las pestañas{' '}
                <b>Tasa y motor</b> y <b>Tiendas</b>.
              </p>
            </section>

            <section className="panel">
              <h2>Últimos movimientos</h2>
              <ul className="admin-list is-feed">
                {overview.crm.slice(0, 8).map((event) => (
                  <li key={event.id}>
                    <span className={`feed-dot feed-${event.kind}`} aria-hidden="true" />
                    <div>
                      <strong>{event.kind}</strong>
                      <span className="muted">{event.note}</span>
                    </div>
                  </li>
                ))}
                {!overview.crm.length && <li className="muted">Sin movimientos aún.</li>}
              </ul>
            </section>

            <section className="panel">
              <h2>Atajos</h2>
              <div className="page-actions">
                <Link to="/repartidor" className="btn btn-ghost">
                  <Bike size={15} aria-hidden="true" />
                  Ver /repartidor
                </Link>
                <Link to="/mitienda" className="btn btn-ghost">
                  <StoreIcon size={15} aria-hidden="true" />
                  Ver /mitienda
                </Link>
                <Link to="/tuteteno" className="btn btn-ghost" onClick={() => setTab('sos')}>
                  <Wallet size={15} aria-hidden="true" />
                  Liquidaciones
                </Link>
              </div>
            </section>
          </div>
        )}

        {overview && tab === 'tasa' && <AdminRateEngine settings={overview.settings} onSaved={load} />}
        {tab === 'tiendas' && <AdminStores />}
        {tab === 'productos' && <AdminCatalog />}
        {tab === 'pedidos' && <AdminOrders onChanged={load} />}
        {tab === 'crm' && <AdminCrm />}
        {tab === 'sos' && <AdminSos sos={overview?.sos || []} payouts={overview?.payouts || []} onChanged={load} />}
      </main>
    </div>
  );
}

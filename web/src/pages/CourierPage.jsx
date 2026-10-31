import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  Bike,
  Car,
  Check,
  CloudOff,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Siren,
  Wallet,
} from 'lucide-react';
import MapPicker from '../components/MapPicker.jsx';
import { Alert, Field, Section, Spinner, Tabs, Toggle } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useConfig } from '../lib/config.jsx';
import { formatDate, formatKm, formatUsd, getOrderStatusLabel } from '../lib/format.js';
import { mapsLink, whatsappLink } from '../lib/geo.js';
import { listQueue, refreshPinCache, syncQueuedReleases, validatePinOffline } from '../lib/offline.js';
import { enablePush, pushSupported } from '../lib/push.js';

const CHECKLIST = [
  { key: 'empaque', label: 'Empaque sellado' },
  { key: 'productos', label: 'Productos completos' },
  { key: 'contenido', label: 'Contenido protegido' },
];

export default function CourierPage() {
  const { user } = useAuth();
  const { vapidPublicKey } = useConfig();

  const [tab, setTab] = useState('radar');
  const [ready, setReady] = useState([]);
  const [mine, setMine] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyOrder, setBusyOrder] = useState('');
  const [checklist, setChecklist] = useState({});
  const [pins, setPins] = useState({});
  const [codes, setCodes] = useState({});
  const [payoutAmount, setPayoutAmount] = useState('');
  const [loading, setLoading] = useState(true);

  const active = useMemo(
    () => mine.find((order) => ['accepted', 'on_route'].includes(order.status)) || null,
    [mine],
  );

  const activeId = active?.id || '';

  const load = useCallback(async () => {
    try {
      const [readyData, mineData, walletData] = await Promise.all([
        api.courier.ready(),
        api.courier.mine(),
        api.courier.wallet(),
      ]);
      setReady(readyData.orders);
      setMine(mineData.orders);
      setWallet(walletData);
      await refreshPinCache();
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setQueued((await listQueue()).length);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  // Sincroniza los PINs validados sin señal cuando el motorizado recupera conexión.
  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      const result = await syncQueuedReleases();
      if (result.synced) {
        setMessage(`${result.synced} liberación(es) sincronizada(s) al volver la conexión.`);
        await load();
      }
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [load]);

  // Mientras hay ruta activa compartimos la posición con la tienda (mapa en vivo del dueño).
  useEffect(() => {
    if (!activeId || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSent < 20000) return;
        lastSent = now;
        api.courier
          .shareLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            orderId: activeId,
          })
          .catch(() => {});
      },
      () => {},
      { maximumAge: 15000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeId]);

  const accept = async (order) => {
    setBusyOrder(order.id);
    setError('');
    setMessage('');
    try {
      await api.courier.accept(order.id);
      setMessage(`Pedido ${order.code} bloqueado a tu nombre.`);
      setTab('ruta');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyOrder('');
    }
  };

  const startRoute = async (order) => {
    setError('');
    try {
      const isTransport = order.orderType === 'mototaxi' || order.orderType === 'taxi';
      const items = isTransport ? [true, true, true] : CHECKLIST.map((point) => Boolean(checklist[order.id]?.[point.key]));
      await api.courier.checklist(order.id, items);
      setMessage(isTransport ? `¡Viaje ${order.code} iniciado! Conduce con precaución.` : `Checklist completo en ${order.code}. ¡Buen viaje!`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const releaseStop = async (order, stop) => {
    const pin = pins[stop.id] || '';
    setError('');
    setMessage('');
    try {
      await api.courier.releaseStop(order.id, stop.id, pin, false);
      setPins((prev) => ({ ...prev, [stop.id]: '' }));
      setMessage(`Parada ${stop.storeName} liberada.`);
      await load();
    } catch (requestError) {
      // Sin señal: validamos el PIN con la copia local y lo dejamos en cola.
      if (requestError.status === 0) {
        const result = await validatePinOffline({ orderId: order.id, stopId: stop.id, pin });
        setMessage(result.message);
        if (!result.ok) setError(result.message);
        setQueued((await listQueue()).length);
        return;
      }
      setError(requestError.message);
    }
  };

  const deliver = async (order) => {
    setError('');
    try {
      await api.courier.deliver(order.id, codes[order.id] || '');
      setMessage(`Pedido ${order.code} cerrado y comisión acreditada.`);
      await load();
      setTab('billetera');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const sendSos = async () => {
    setError('');
    setMessage('');
    const send = async (lat, lng) => {
      try {
        await api.courier.sos({ orderId: active?.id || null, lat, lng });
        setMessage('Alerta SOS enviada al administrador con tu ubicación.');
      } catch (requestError) {
        setError(requestError.message);
      }
    };

    if (!navigator.geolocation) {
      send(null, null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => send(position.coords.latitude, position.coords.longitude),
      () => send(null, null),
      { timeout: 6000 },
    );
  };

  const requestPayout = async () => {
    setError('');
    setMessage('');
    try {
      await api.courier.requestPayout(Math.round(Number(payoutAmount || 0) * 100));
      setPayoutAmount('');
      setMessage('Solicitud de liquidación enviada al administrador.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand">
          <span className="brand-logo">
            <Bike size={20} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <strong>{user?.name || 'Conductor / Motorizado'}</strong>
            <small>/repartidor</small>
          </span>
        </div>
        <div className="admin-header-actions">
          {pushSupported() && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                const result = await enablePush({ vapidPublicKey, role: 'courier' });
                setMessage(result.message);
                if (!result.ok) setError(result.message);
              }}
            >
              <BellRing size={14} aria-hidden="true" />
              Avisos de pedidos
            </button>
          )}
          <Link to="/" className="btn btn-primary btn-sm">
            Ver Tienda
          </Link>
        </div>
      </header>

      {(!online || queued > 0) && (
        <div className="offline-bar">
          <CloudOff size={16} aria-hidden="true" />
          <span>
            {online ? 'Hay acciones sin sincronizar' : 'Sin señal: validamos los PIN con la copia del teléfono'}
            {queued > 0 ? ` · ${queued} en cola` : ''}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const result = await syncQueuedReleases();
              setMessage(`${result.synced} sincronizada(s) · ${result.pending} pendiente(s)`);
              await load();
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Sincronizar
          </button>
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'radar', label: `Radar (${ready.length})` },
          { id: 'ruta', label: 'Mi ruta' },
          { id: 'billetera', label: 'Billetera' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <main className="admin-main">
        <Alert>{error}</Alert>
        <Alert tone="ok">{message}</Alert>
        {loading && (
          <p className="muted">
            <Spinner /> Cargando viajes y pedidos…
          </p>
        )}

        {tab === 'radar' && (
          <div className="admin-grid">
            <Section
              title="Radar de viajes y pedidos"
              subtitle="Los servicios aparecen en tiempo real según tu rol. Al aceptar uno, lo tomas en exclusiva."
            >
              <ul className="admin-list">
                {ready.map((order) => {
                  const isMototaxi = order.orderType === 'mototaxi';
                  return (
                    <li key={order.id} className="is-stacked">
                      <div className="admin-row-main">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                            <strong>{order.code}</strong>
                            {isMototaxi && (
                              <span
                                style={{
                                  background: '#e53e3e',
                                  color: '#ffffff',
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '1rem',
                                }}
                              >
                                {order.vehicleType === 'carro' ? 'CARRO 🚗' : 'MOTO 🏍️'}
                              </span>
                            )}
                          </div>
                          <span className="muted">
                            {isMototaxi
                              ? `Carrera Exprés · ${formatKm(order.distanceKm)} · pago ${formatUsd(order.deliveryCents || order.totalCents)}`
                              : `${order.stops.length} parada(s) · ${formatKm(order.distanceKm)} · ganancia ${formatUsd(
                                  order.earningsCents || order.deliveryCents,
                                )}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => accept(order)}
                          disabled={busyOrder === order.id}
                        >
                          {busyOrder === order.id ? <Spinner /> : <Check size={14} aria-hidden="true" />}
                          Aceptar {isMototaxi ? 'Viaje' : 'Pedido'}
                        </button>
                      </div>

                      {isMototaxi ? (
                        <div
                          style={{
                            marginTop: '0.75rem',
                            padding: '0.85rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.65rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.65rem',
                          }}
                        >
                          {/* 🟢 Origen (Punto de recogida del pasajero) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                              <strong style={{ color: '#276749', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span>🟢</span> Origen (Recogida del pasajero):
                              </strong>
                              {order.originLat && order.originLng && (
                                <a
                                  href={mapsLink({ lat: order.originLat, lng: order.originLng })}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#2b6cb0', textDecoration: 'none', background: '#ebf8ff' }}
                                >
                                  <Navigation size={13} aria-hidden="true" />
                                  Navegar al origen
                                </a>
                              )}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#2d3748', fontWeight: '500' }}>
                              {order.originAddress || 'Ubicación actual del pasajero (marcada en mapa)'}
                            </div>
                            <div className="muted small">
                              Pasajero: <b>{order.customerName || 'Cliente'}</b>
                              {order.customerPhone && <span style={{ marginLeft: '0.4rem' }}>({order.customerPhone})</span>}
                            </div>
                          </div>

                          {/* 🔴 Destino (Punto de entrega) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid #edf2f7', paddingTop: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                              <strong style={{ color: '#c53030', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span>🔴</span> Destino (Punto de entrega):
                              </strong>
                              {(order.destinationLat || order.lat) && (
                                <a
                                  href={mapsLink({ lat: order.destinationLat || order.lat, lng: order.destinationLng || order.lng })}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#4a5568', textDecoration: 'none' }}
                                >
                                  <MapPin size={13} aria-hidden="true" />
                                  Ver destino
                                </a>
                              )}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#2d3748' }}>
                              {order.reference || order.notes || order.address || 'Destino seleccionado en mapa'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <ol className="route-steps">
                          {order.stops.map((stop, index) => (
                            <li key={stop.id}>
                              <span className="route-index">{stop.seq}</span>
                              <div>
                                <strong>
                                  {index === 0 ? 'Retiro en ' : 'Parada extra en '}
                                  {stop.storeName}
                                </strong>
                                <span className="muted">{stop.storeAddress || 'Dirección por confirmar'}</span>
                                {stop.storePhone && <span className="muted small">Local: {stop.storePhone}</span>}
                              </div>
                            </li>
                          ))}
                          <li>
                            <span className="route-index is-client">
                              <Navigation size={13} aria-hidden="true" />
                            </span>
                            <div>
                              <strong>Destino: {order.customerName || 'cliente'}</strong>
                              <span className="muted">
                                {order.address || 'Dirección por confirmar'} ·{' '}
                                <a href={mapsLink({ lat: order.lat, lng: order.lng })} target="_blank" rel="noreferrer">
                                  navegar
                                </a>
                              </span>
                            </div>
                          </li>
                        </ol>
                      )}
                    </li>
                  );
                })}
                {!ready.length && (
                  <li className="muted">El radar está vacío: los nuevos pedidos y carreras aparecen aquí en tiempo real.</li>
                )}
              </ul>
            </Section>
          </div>
        )}

        {tab === 'ruta' && (
          <div className="admin-grid">
            {!active && <p className="muted">No tienes una ruta activa. Acepta un viaje o pedido del radar.</p>}

            {active && (
              <>
                {/* Diferenciación de vistas: Transporte (Mototaxi/Taxi) vs Delivery de tiendas */}
                {active.orderType === 'mototaxi' || active.orderType === 'taxi' ? (
                  <>
                    <Section
                      title={`Carrera ${active.code} (${active.vehicleType === 'carro' ? 'Carro 🚗' : 'Moto 🏍️'})`}
                      subtitle={`Distancia ${formatKm(active.distanceKm)} · Ganancia ${formatUsd(active.earningsCents || active.deliveryCents)} · Estado: ${getOrderStatusLabel(active)}`}
                    >
                      <ol className="route-steps">
                        {/* 🟢 Parada 1: Origen / Punto de recogida */}
                        <li>
                          <span className="route-index" style={{ background: '#38a169', color: '#fff' }}>
                            🟢
                          </span>
                          <div>
                            <strong>Punto de recogida (Buscar pasajero)</strong>
                            <span className="muted">{active.originAddress || 'Ubicación actual del pasajero'}</span>
                            <span className="muted small">
                              Pasajero: <b>{active.customerName || 'Cliente'}</b>
                            </span>
                            <div className="inline-actions" style={{ marginTop: '0.4rem' }}>
                              {active.originLat && active.originLng && (
                                <a
                                  className="btn btn-primary btn-sm"
                                  href={mapsLink({ lat: active.originLat, lng: active.originLng })}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Navigation size={14} aria-hidden="true" />
                                  Navegar al origen
                                </a>
                              )}
                              {active.customerPhone && (
                                <>
                                  <a className="btn btn-ghost btn-sm" href={`tel:${active.customerPhone}`}>
                                    <Phone size={14} aria-hidden="true" />
                                    Llamar
                                  </a>
                                  <a
                                    className="btn btn-ghost btn-sm"
                                    href={whatsappLink(active.customerPhone, `Hola ${active.customerName || ''}, soy tu conductor de ENRUTA para la carrera ${active.code}. Voy en camino a buscarte.`)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <MessageCircle size={14} aria-hidden="true" />
                                    WhatsApp
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        </li>

                        {/* 🔴 Parada 2: Destino / Punto de entrega */}
                        <li>
                          <span className="route-index" style={{ background: '#e53e3e', color: '#fff' }}>
                            🔴
                          </span>
                          <div>
                            <strong>Destino final del viaje</strong>
                            <span className="muted">{active.reference || active.address || 'Destino seleccionado'}</span>
                            <div className="inline-actions" style={{ marginTop: '0.4rem' }}>
                              <a
                                className="btn btn-ghost btn-sm"
                                href={mapsLink({ lat: active.destinationLat || active.lat, lng: active.destinationLng || active.lng })}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MapPin size={14} aria-hidden="true" />
                                Navegar al destino
                              </a>
                            </div>
                          </div>
                        </li>
                      </ol>
                    </Section>

                    {/* Flujo de control de viaje: Inicio de viaje vs Finalización con PIN */}
                    {active.status === 'accepted' && (
                      <Section
                        title="Inicio de viaje"
                        subtitle="Confirma que el pasajero esté a bordo antes de partir"
                      >
                        <div className="checklist">
                          <Toggle
                            checked={Boolean(checklist[active.id]?.passenger)}
                            onChange={(value) =>
                              setChecklist((prev) => ({
                                ...prev,
                                [active.id]: { ...prev[active.id], passenger: value },
                              }))
                            }
                            label="Pasajero identificado y a bordo"
                          />
                          <Toggle
                            checked={Boolean(checklist[active.id]?.safety)}
                            onChange={(value) =>
                              setChecklist((prev) => ({
                                ...prev,
                                [active.id]: { ...prev[active.id], safety: value },
                              }))
                            }
                            label={
                              active.vehicleType === 'carro'
                                ? 'Cinturón de seguridad colocado'
                                : 'Casco de seguridad colocado'
                            }
                          />
                        </div>
                        <div className="page-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-block"
                            onClick={() => startRoute(active)}
                          >
                            <Route size={15} aria-hidden="true" />
                            Iniciar viaje (Pasajero a bordo)
                          </button>
                        </div>
                      </Section>
                    )}

                    {active.status === 'on_route' && (
                      <Section
                        title="Finalizar viaje"
                        subtitle="Solicita el código PIN de 4 dígitos al pasajero al llegar al destino"
                      >
                        <Field label="Código PIN del pasajero (4 dígitos)">
                          <input
                            value={codes[active.id] || ''}
                            onChange={(event) => setCodes((prev) => ({ ...prev, [active.id]: event.target.value }))}
                            inputMode="numeric"
                            placeholder="Ej. 1234"
                          />
                        </Field>
                        <button type="button" className="btn btn-primary btn-block" onClick={() => deliver(active)}>
                          <Check size={15} aria-hidden="true" />
                          Finalizar viaje y cobrar
                        </button>
                      </Section>
                    )}
                  </>
                ) : (
                  <>
                    <Section
                      title={`Ruta ${active.code}`}
                      subtitle={`PIN de retiro ${active.pickupPin} · ${formatKm(active.distanceKm)} · ganancia ${formatUsd(active.earningsCents || active.deliveryCents)}`}
                    >
                      <ol className="route-steps">
                        {(active.stops || []).map((stop) => (
                          <li key={stop.id} className={stop.released ? 'is-released' : ''}>
                            <span className={`route-index${stop.released ? ' is-client' : ''}`}>{stop.seq}</span>
                            <div>
                              <strong>{stop.storeName}</strong>
                              <span className="muted">{stop.storeAddress}</span>
                              {!stop.released && (
                                <div className="inline-actions">
                                  <input
                                    value={pins[stop.id] || ''}
                                    onChange={(event) => setPins((prev) => ({ ...prev, [stop.id]: event.target.value }))}
                                    placeholder="PIN que dicta la tienda"
                                    inputMode="numeric"
                                    aria-label={`PIN de retiro en ${stop.storeName}`}
                                  />
                                  <button type="button" className="btn btn-primary btn-sm" onClick={() => releaseStop(active, stop)}>
                                    <Volume2Icon />
                                    Validar y liberar
                                  </button>
                                </div>
                              )}
                              {stop.released && <span className="status status-delivered">Retirado</span>}
                            </div>
                          </li>
                        ))}
                        <li>
                          <span className="route-index is-client">
                            <Navigation size={13} aria-hidden="true" />
                          </span>
                          <div>
                            <strong>Entrega a {active.customerName || 'cliente'}</strong>
                            <span className="muted">{active.address || active.reference}</span>
                            <div className="inline-actions">
                              {active.customerPhone && (
                                <>
                                  <a className="btn btn-ghost btn-sm" href={`tel:${active.customerPhone}`}>
                                    <Phone size={14} aria-hidden="true" />
                                    Llamar
                                  </a>
                                  <a
                                    className="btn btn-ghost btn-sm"
                                    href={whatsappLink(active.customerPhone, `Hola, soy tu motorizado de ENRUTA para el viaje/pedido ${active.code}.`)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <MessageCircle size={14} aria-hidden="true" />
                                    Chat
                                  </a>
                                </>
                              )}
                              <a className="btn btn-ghost btn-sm" href={mapsLink({ lat: active.lat, lng: active.lng })} target="_blank" rel="noreferrer">
                                <MapPin size={14} aria-hidden="true" />
                                Navegar
                              </a>
                            </div>
                          </div>
                        </li>
                      </ol>
                    </Section>

                    <Section title="Checklist digital" subtitle="Marca los 3 puntos antes de iniciar la ruta">
                      <div className="checklist">
                        {CHECKLIST.map((point) => (
                          <Toggle
                            key={point.key}
                            checked={Boolean(checklist[active.id]?.[point.key])}
                            onChange={(value) =>
                              setChecklist((prev) => ({ ...prev, [active.id]: { ...prev[active.id], [point.key]: value } }))
                            }
                            label={point.label}
                          />
                        ))}
                      </div>
                      <div className="page-actions">
                        <button type="button" className="btn btn-primary" onClick={() => startRoute(active)}>
                          <Route size={15} aria-hidden="true" />
                          Iniciar ruta
                        </button>
                      </div>

                      <Field label="Código de entrega del cliente (4 dígitos)">
                        <input
                          value={codes[active.id] || ''}
                          onChange={(event) => setCodes((prev) => ({ ...prev, [active.id]: event.target.value }))}
                          inputMode="numeric"
                        />
                      </Field>
                      <button type="button" className="btn btn-primary btn-block" onClick={() => deliver(active)}>
                        <Check size={15} aria-hidden="true" />
                        Cerrar pedido
                      </button>
                    </Section>
                  </>
                )}

                <Section
                  title="Mi ubicación en ruta"
                  subtitle="Con ruta activa compartes tu posición en vivo"
                >
                  <MapPicker
                    point={{ lat: Number(active.destinationLat || active.lat), lng: Number(active.destinationLng || active.lng) }}
                    markers={
                      active.orderType === 'mototaxi' || active.orderType === 'taxi'
                        ? [
                            ...(active.originLat ? [{ id: 'orig', name: '🟢 Recogida Pasajero', lat: Number(active.originLat), lng: Number(active.originLng) }] : []),
                            ...(active.destinationLat || active.lat ? [{ id: 'dest', name: '🔴 Destino Pasajero', lat: Number(active.destinationLat || active.lat), lng: Number(active.destinationLng || active.lng) }] : []),
                          ]
                        : (active.stops || []).map((stop) => ({ id: stop.id, name: stop.storeName, lat: stop.lat, lng: stop.lng }))
                    }
                    label="Destino"
                    readOnly
                  />
                </Section>
              </>
            )}
          </div>
        )}

        {tab === 'billetera' && wallet && (
          <div className="admin-grid">
            <Section title="Billetera virtual" subtitle="Comisiones acumuladas por entregas y carreras cerradas">
              <div className="summary-row is-total">
                <span>Saldo disponible</span>
                <b>{formatUsd(wallet.balanceCents)}</b>
              </div>
              <div className="summary-row">
                <span>Ganado histórico</span>
                <b>{formatUsd(wallet.earnedCents)}</b>
              </div>
              <div className="summary-row">
                <span>Liquidado</span>
                <b>{formatUsd(wallet.paidCents)}</b>
              </div>
              <div className="summary-row">
                <span>Solicitudes pendientes</span>
                <b>{formatUsd(wallet.pendingCents)}</b>
              </div>

              <Field label="Monto a liquidar (USD)">
                <input value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} inputMode="decimal" />
              </Field>
              <button type="button" className="btn btn-primary btn-block" onClick={requestPayout}>
                <Wallet size={15} aria-hidden="true" />
                Solicitar liquidación / cierre
              </button>
            </Section>

            <Section title="Movimientos" subtitle="Entregas, comisiones y pagos">
              <ul className="admin-list is-feed">
                {wallet.entries.map((entry) => (
                  <li key={entry.id}>
                    <span className={`feed-dot feed-${entry.kind === 'earning' ? 'delivered' : 'payout'}`} aria-hidden="true" />
                    <div>
                      <strong>{entry.note}</strong>
                      <span className="muted">{formatDate(entry.createdAt)}</span>
                    </div>
                    <b className="price">{formatUsd(entry.kind === 'payout' ? -entry.amountCents : entry.amountCents)}</b>
                  </li>
                ))}
                {!wallet.entries.length && <li className="muted">Aún no tienes entregas cerradas.</li>}
              </ul>
            </Section>
          </div>
        )}
      </main>

      <button type="button" className="sos-button" onClick={sendSos}>
        <Siren size={18} aria-hidden="true" />
        SOS
      </button>
    </div>
  );
}

const Volume2Icon = () => <Check size={14} aria-hidden="true" />;

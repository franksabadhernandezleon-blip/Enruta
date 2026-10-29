import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { CARIPITO, haversineKm, mapView, pointAt, viewPosition } from '../lib/geo.js';
import MapTiles from './MapTiles.jsx';
import { Spinner } from './ui.jsx';

const ASPECT = 1.6;

const GEOLOCATION_ERRORS = {
  1: 'Permiso de ubicación denegado. Toca el mapa para marcar tu punto.',
  2: 'Tu GPS no está disponible ahora. Toca el mapa para marcar tu punto.',
  3: 'La ubicación tardó demasiado. Intenta de nuevo o toca el mapa.',
};

/**
 * Mapa interactivo con fondo real de OpenStreetMap: muestra las paradas del
 * pedido y un pin arrastrable para el punto de entrega. En modo editable
 * permite tomar la ubicación actual del teléfono.
 */
export default function MapPicker({
  point,
  onChange,
  markers = [],
  spanKm = 6,
  label = 'Punto de entrega',
  readOnly = false,
}) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [center, setCenter] = useState(() =>
    point ? { lat: Number(point.lat), lng: Number(point.lng) } : { ...CARIPITO },
  );

  const view = useMemo(() => mapView({ center, spanKm, aspect: ASPECT }), [center, spanKm]);

  // Si el punto llega desde fuera (GPS, pedido abierto) recentramos el mapa;
  // al arrastrar el pin dentro del encuadre no se mueve.
  useEffect(() => {
    if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return;
    if (haversineKm(center, point) > spanKm * 0.35) {
      setCenter({ lat: Number(point.lat), lng: Number(point.lng) });
    }
  }, [point, spanKm, center]);

  const move = (event) => {
    if (readOnly) return;
    const element = ref.current;
    if (!element) return;
    setNotice('');
    onChange?.(pointAt(event.clientX, event.clientY, element, view));
  };

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNotice('Tu navegador no comparte la ubicación. Toca el mapa para marcar tu punto.');
      return;
    }
    setLocating(true);
    setNotice('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: Number(position.coords.latitude.toFixed(5)),
          lng: Number(position.coords.longitude.toFixed(5)),
        };
        setLocating(false);
        setCenter(next);
        setNotice(`Ubicación actual tomada (±${Math.round(position.coords.accuracy || 0)} m).`);
        onChange?.(next);
      },
      (error) => {
        setLocating(false);
        setNotice(GEOLOCATION_ERRORS[error.code] || 'No pudimos leer tu ubicación. Toca el mapa para marcar tu punto.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const pinStyle = viewPosition(point || CARIPITO, view);
  const distanceToCenter = haversineKm(point || CARIPITO, CARIPITO);

  return (
    <div className="map-wrap">
      <div
        ref={ref}
        className={`map${dragging ? ' is-dragging' : ''}${readOnly ? ' is-static' : ''}`}
        style={{ aspectRatio: '16 / 10' }}
        role="application"
        aria-label={readOnly ? `${label}: mapa en vivo` : `${label}: toca o arrastra el pin`}
        onPointerDown={(event) => {
          if (readOnly) return;
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            // El navegador puede rechazar la captura; el pin igual se mueve.
          }
          setDragging(true);
          move(event);
        }}
        onPointerMove={(event) => {
          if (dragging) move(event);
        }}
        onPointerUp={(event) => {
          setDragging(false);
          try {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          } catch {
            // Sin captura activa no hay nada que liberar.
          }
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <svg className="map-grid" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 11 }, (_, index) => (
            <line key={`v${index}`} x1={index * 10} y1="0" x2={index * 10} y2="60" />
          ))}
          {Array.from({ length: 7 }, (_, index) => (
            <line key={`h${index}`} x1="0" y1={index * 10} x2="100" y2={index * 10} />
          ))}
          <path className="map-road" d="M2 46 C 22 34, 38 52, 58 30 S 88 20, 98 12" />
          <path className="map-road" d="M6 12 C 26 22, 40 8, 62 22 S 84 40, 97 44" />
        </svg>

        <MapTiles view={view} />

        {markers
          .filter((marker) => Number.isFinite(Number(marker.lat)) && Number.isFinite(Number(marker.lng)))
          .map((marker) => (
            <span
              key={marker.id || marker.name}
              className="map-marker"
              style={viewPosition(marker, view)}
              title={marker.name}
            >
              <span className="map-marker-dot" aria-hidden="true" />
              <span className="map-marker-name">{marker.name}</span>
            </span>
          ))}

        <span className={`map-pin${dragging ? ' is-dragging' : ''}`} style={pinStyle}>
          <MapPin size={22} aria-hidden="true" />
        </span>
      </div>

      <div className="map-foot">
        <span>
          <b>{label}:</b> {Number(point?.lat || 0).toFixed(5)}, {Number(point?.lng || 0).toFixed(5)}
        </span>
        <span className="muted">
          {notice || `${distanceToCenter.toFixed(2)} km del centro de Caripito`}
        </span>
        {!readOnly && (
          <button type="button" className="btn btn-ghost btn-sm map-locate" onClick={locate} disabled={locating}>
            {locating ? <Spinner /> : <LocateFixed size={14} aria-hidden="true" />}
            {locating ? 'Ubicando…' : 'Usar mi ubicación actual'}
          </button>
        )}
      </div>
    </div>
  );
}

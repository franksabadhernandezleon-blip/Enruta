import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { CARIPITO, haversineKm, pointFromClick, relativePosition } from '../lib/geo.js';

/**
 * Mapa interactivo local (sin servicios externos): dibuja el área de Caripito,
 * las paradas del pedido y un pin arrastrable para el punto de entrega.
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

  const move = (event) => {
    if (readOnly) return;
    const element = ref.current;
    if (!element) return;
    onChange(pointFromClick(event, element, spanKm));
  };

  const pinStyle = relativePosition(point || CARIPITO, spanKm);
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
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setDragging(true);
          move(event);
        }}
        onPointerMove={(event) => {
          if (dragging) move(event);
        }}
        onPointerUp={(event) => {
          setDragging(false);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
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

        {markers.map((marker) => (
          <span
            key={marker.id || marker.name}
            className="map-marker"
            style={relativePosition(marker, spanKm)}
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
        <span className="muted">{distanceToCenter.toFixed(2)} km del centro de Caripito</span>
      </div>
    </div>
  );
}

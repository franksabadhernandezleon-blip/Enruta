import { useMemo } from 'react';
import { mapTiles } from '../lib/geo.js';

/**
 * Fondo real de mapa con tiles de OpenStreetMap. Si un tile no carga (sin
 * señal) se oculta y queda visible la retícula de respaldo del mapa.
 */
export default function MapTiles({ view }) {
  const tiles = useMemo(() => mapTiles(view), [view]);

  return (
    <>
      <div className="map-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            loading="lazy"
            style={{ left: tile.left, top: tile.top, width: tile.width, height: tile.height }}
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ))}
      </div>
      <span className="map-attribution">© OpenStreetMap</span>
    </>
  );
}

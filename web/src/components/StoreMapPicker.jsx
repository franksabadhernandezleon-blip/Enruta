import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, LocateFixed, MapPin } from 'lucide-react';
import { geocodeAddress } from '../lib/geo.js';
import { Spinner } from './ui.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick({
        lat: Number(e.latlng.lat.toFixed(5)),
        lng: Number(e.latlng.lng.toFixed(5)),
      });
    },
  });
  return null;
}

function MapRecenter({ center }) {
  const map = useMap();
  map.setView([center.lat, center.lng], map.getZoom());
  return null;
}

export default function StoreMapPicker({ point, onChange, label = 'Tu tienda' }) {
  const coords = useMemo(() => {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    return {
      lat: Number.isFinite(lat) && lat !== 0 ? lat : 10.1447,
      lng: Number.isFinite(lng) && lng !== 0 ? lng : -63.1013,
    };
  }, [point?.lat, point?.lng]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');

  const handleMapClick = (newCoords) => {
    setNotice('');
    onChange?.(newCoords);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setNotice('');
    try {
      const res = await geocodeAddress(searchQuery.trim());
      if (res && res.lat && res.lng) {
        const next = {
          lat: Number(res.lat.toFixed(5)),
          lng: Number(res.lng.toFixed(5)),
        };
        onChange?.(next);
        setNotice(`Ubicación encontrada: ${res.formattedAddress || searchQuery}`);
      } else {
        setNotice('No pudimos encontrar esa dirección.');
      }
    } catch (err) {
      setNotice(err.message || 'Error al buscar la dirección.');
    } finally {
      setSearching(false);
    }
  };

  const handleLocateGps = () => {
    if (!navigator.geolocation) {
      setNotice('Tu navegador no soporta geolocalización.');
      return;
    }
    setLocating(true);
    setNotice('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        setLocating(false);
        onChange?.(next);
        setNotice('Ubicación de tu dispositivo obtenida por GPS.');
      },
      () => {
        setLocating(false);
        setNotice('No pudimos obtener tu ubicación GPS.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const markerEventHandlers = useMemo(
    () => ({
      dragend(e) {
        const marker = e.target;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onChange?.({
            lat: Number(latLng.lat.toFixed(5)),
            lng: Number(latLng.lng.toFixed(5)),
          });
        }
      },
    }),
    [onChange],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '0.75rem 0' }}>
      {/* Buscador de dirección y GPS */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar dirección (ej. Plaza Bolívar, Caripito)"
            style={{ width: '100%', paddingRight: '2.5rem' }}
          />
        </div>
        <button type="submit" className="btn btn-ghost btn-sm" disabled={searching}>
          {searching ? <Spinner size={14} /> : <Search size={14} />}
          Buscar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleLocateGps} disabled={locating}>
          {locating ? <Spinner size={14} /> : <LocateFixed size={14} color="#e53e3e" />}
          GPS
        </button>
      </form>

      {notice && (
        <div className="small muted" style={{ background: '#f7fafc', padding: '0.4rem 0.6rem', borderRadius: '0.4rem' }}>
          {notice}
        </div>
      )}

      {/* Mapa interactivo Leaflet */}
      <div style={{ height: '320px', width: '100%', borderRadius: '0.75rem', overflow: 'hidden', position: 'relative' }}>
        <MapContainer center={[coords.lat, coords.lng]} zoom={15} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          <MapRecenter center={coords} />

          <Marker position={[coords.lat, coords.lng]} draggable eventHandlers={markerEventHandlers}>
            <Popup>
              <b>{label}</b>
              <br />
              {coords.lat}, {coords.lng}
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <MapPin size={14} color="#e53e3e" />
        <span>
          Coordenadas de {label}: <strong>{coords.lat}</strong>, <strong>{coords.lng}</strong> (Arrastra el pin o toca el mapa)
        </span>
      </div>
    </div>
  );
}

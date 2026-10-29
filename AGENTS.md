# ENRUTA — notas de desarrollo

PWA de delivery multi-tienda para Caripito: API Express + Postgres (`api/`), cliente React/Vite con
Service Worker (`web/`). Cubre catálogo por tienda, carrito multi-parada, motor de delivery con tasa
BCV congelada en el recibo, paneles de admin/dueño/motorizado y notificaciones Web Push.

## Cómo corre

`docker-compose.base44.yml` levanta cuatro servicios, todos desde el código fuente:

| Servicio  | Rol                                                        | Puerto host |
| --------- | ---------------------------------------------------------- | ----------- |
| `web`     | Vite dev server (React 18) con recarga en caliente          | 3000        |
| `api`     | Express + Postgres, `node --watch` (recarga al guardar)     | interno     |
| `db`      | Postgres 16 **de respaldo** (solo si no hay `DATABASE_URL`) | interno     |
| `migrate` | One-shot: aplica `api/db/schema.sql` y siembra la demo      | —           |

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml ps
docker compose -f docker-compose.base44.yml logs -f api
```

## Dependencias (ojo)

Cada servicio instala en el arranque con `npm ci` contra `package-lock.json` y guarda `node_modules`
en un volumen nombrado. Si se agrega una dependencia a `api/package.json`:

```bash
docker compose -f docker-compose.base44.yml exec -T api npm install --no-audit --no-fund
docker compose -f docker-compose.base44.yml restart api
```

`npm install` dentro del contenedor actualiza `api/package-lock.json` (lo que queda en el repo) y el
volumen. Sin ese paso, `npm ci` aborta por lockfile desincronizado y la API queda caída con
`ERR_MODULE_NOT_FOUND`; `node --watch` no reinstala dependencias por sí solo.

## Base de datos: Supabase

La base real del proyecto es **Supabase** (es un Postgres normal, así que la API sigue hablando `pg`
con `DATABASE_URL`; no hace falta `@supabase/supabase-js` ni mover el esquema).

- **La URL es un secreto del dashboard** (`DATABASE_URL`), no un valor del repositorio. Se declara en
  `.base44/environment.json` y llega por `/run/base44/app.env`, que es el **último** `env_file` de
  `migrate` y `api`: por eso un valor del dashboard siempre gana sobre el respaldo local. Nunca poner
  `DATABASE_URL` bajo `environment:` en el compose, o el valor del dashboard quedaría anulado para
  siempre.
- **Respaldo local.** `.env.base44-defaults` trae `DATABASE_URL=postgres://...@db:5432/enruta`, así que
  el preview arranca aunque todavía no se haya cargado la conexión de Supabase; en cuanto se define el
  secreto, `migrate` y `api` usan Supabase y el servicio `db` queda sin uso (se puede apagar).
- **Qué cadena usar.** En Supabase → *Project Settings → Database → Connection string*, usa el
  **Session pooler** (`aws-0-<región>.pooler.supabase.com:5432`). La conexión directa
  `db.<ref>.supabase.co` es **solo IPv6** y los contenedores del sandbox no tienen IPv6: con esa URL la
  API no conecta. Reemplaza `[YOUR-PASSWORD]` por la contraseña de la base.
- **SSL.** `api/src/db.js` activa SSL en cualquier URL remota (`rejectUnauthorized: false`), que es lo
  que Supabase exige; el respaldo local sigue sin SSL.
- **El esquema lo aplica `migrate`.** El one-shot corre `api/db/schema.sql` (idempotente) contra el
  `DATABASE_URL` vigente y siembra la demo solo si `users` está vacía. Apuntar el secreto a un proyecto
  de Supabase vacío crea ahí las tablas y las cuentas demo; `SEED_DEMO=0` evita las cuentas/tiendas demo.
  `dropPreviousDemo()` solo borra `products/stores/owners` cuando existe el esquema viejo (`owners` sin
  `settings`), nunca un esquema nuevo.
- **Diagnóstico.** `/health` hace `SELECT 1`: si Supabase no responde, el contenedor `api` queda
  *unhealthy* y `migrate` no termina, así que el fallo se ve en `docker compose logs migrate`.
  ```bash
  docker compose -f docker-compose.base44.yml logs --tail=40 migrate
  docker compose -f docker-compose.base44.yml exec -T api sh -c 'printenv DATABASE_URL >/dev/null && echo present || echo missing'
  ```

## Detalles que no son obvios

- **Un solo origen.** El navegador solo habla con el puerto 3000; Vite hace proxy de `/api` y
  `/uploads` hacia `api:8000`. Por eso no hay CORS: cualquier endpoint nuevo se consume con rutas
  relativas (`/api/...`). La API no publica puerto al host.
- **Las imágenes de catálogo son públicas.** Se guardan en el volumen `enruta_uploads` y la API las sirve
  en `/uploads/<archivo>`; cualquiera con el enlace puede abrirlas. Al reemplazar o quitar una foto, el
  archivo anterior se borra del volumen. **Excepción:** los comprobantes de pago son privados y viven en
  `PROOF_DIR` (ver "Comprobantes de pago").
- **Migraciones idempotentes.** `npm run migrate` aplica `api/db/schema.sql` con `IF NOT EXISTS` y
  solo siembra la demo cuando `users` está vacía. Nunca borra datos existentes.
- **Cuentas demo** (contraseña `enruta123` para todas): `dueno@enruta.com` (dueño de "Pizzería El
  Rincón"), `motorizado@enruta.com` (motorizado), `cliente@enruta.com` (cliente),
  `admin@enruta.com` y `ADMIN_EMAIL` (admin).
- **`JWT_SECRET`** viene de `.env.base44-defaults` como placeholder de desarrollo; `/run/base44/app.env`
  se declara después en `env_file`, así que un valor real del dashboard siempre gana. Los placeholders
  de VAPID también viven ahí, así que Web Push funciona en desarrollo.
- **Google es opcional.** Sin `GOOGLE_CLIENT_ID` la API responde 503 en `/api/auth/google`, la clave
  `googleClientId` de `/api/config` queda en null y la pantalla de login oculta el botón de Google
  (muestra el aviso de configuración en su lugar). El login por correo/contraseña funciona igual; para
  activar Google hay que definir `GOOGLE_CLIENT_ID` en los secretos de la app.
- **SSL de Postgres.** `api/src/db.js` activa SSL solo con un `DATABASE_URL` remoto: la URL del respaldo
  local (`@db:5432`) o un `sslmode=disable` apagan el SSL. Supabase y Render exigen SSL, así que no se toca
  esa rama.
- **Archivos reparados.** `api/src/server.js` y `web/src/lib/api.js` llegaron truncados a esta rama y
  `LoginPage` había perdido el formulario de correo/contraseña (quedaba solo el botón de Google). Se
  restauraron desde el historial (commits `181ac1c` y `aec753b`): sin eso la API no arrancaba y el cliente
  no compilaba.

## Mapa y ubicación del pedido

- **Mapas y Geocodificación (OpenStreetMap + Nominatim + OSRM):** 100% gratuito y sin claves de API ni tarjetas de crédito. El backend expone enrutadores proxy `/api/geo/geocode`, `/api/geo/reverse` y `/api/geo/route` con un User-Agent propio (`Enruta/1.0`) y un rate limiter (1 req/s por IP) para cumplir las políticas de Nominatim y OSRM. Los mapas del cliente se renderizan con `react-leaflet`.

- **Fondo real de mapa.** `web/src/components/MapPicker.jsx` pinta los tiles de OpenStreetMap
  (`tile.openstreetmap.org`, sin clave ni dependencias nuevas) con la atribución visible. Los pide el
  navegador; si no cargan, se ocultan solos y queda la retícula de respaldo del componente.
- **Una sola proyección.** Los pines usan Web Mercator igual que los tiles (`web/src/lib/geo.js`:
  `mapView`, `mapTiles`, `viewPosition`, `pointAt`). Para cambiar el encuadre se tocan esas funciones, no
  posiciones en porcentaje a mano.
- **Ubicación actual.** En modo editable el mapa muestra "Usar mi ubicación actual"
  (`navigator.geolocation`): al obtener la posición recentra y mueve el pin. Necesita permiso del navegador;
  si se niega, aparece el aviso y el cliente marca el punto con un toque. En el preview de Base44 el iframe
  puede bloquear el permiso: ese mensaje de respaldo es el comportamiento esperado, no un fallo.
- **El motorizado sabe a dónde va.** El checkout envía `destination.lat/lng` a `POST /api/orders`; el
  pedido guarda ese punto y el radar de `/repartidor` lo muestra con la dirección, las coordenadas y el
  enlace "Navegar" a Google Maps.

## Comprobantes de pago (solo fotos, borrado a la semana)

- **Obligatorio al comprar.** `POST /api/orders` acepta `multipart/form-data` con `payload` (JSON del
  pedido) y `proof` (la foto). Sin foto responde 400 salvo que `paymentMethod` sea `whatsapp` (el
  pedido que se cierra por WhatsApp con la tienda). El cliente lo envía desde `api.createOrder(payload, file)`.
- **Tabla `payment_proofs`** (`order_id`, `file_name`, `mime_type`, `expires_at = now() + 7 días`).
  `api/src/proofs.js` filtra siempre `expires_at > now()`, así que lo vencido desaparece de las listas
  aunque la limpieza aún no haya corrido.
- **Borrado automático.** `startProofCleanup()` en `api/src/server.js` corre al arrancar y cada hora:
  borra filas vencidas y su archivo del disco. Para probarlo a mano:
  `docker compose -f docker-compose.base44.yml exec -T api node -e "import('./src/proofs.js').then(async m => console.log(await m.purgeExpiredProofs()))"`.
- **Privados, no en `/uploads`.** Los archivos viven en `PROOF_DIR` (volumen `enruta_proofs`, `/app/proofs`;
  en Render `/var/data/proofs`) y se sirven con `GET /api/proofs/:id/photo` exigiendo sesión: solo el
  cliente del pedido, las tiendas de esa ruta y el admin. Por eso el cliente React no puede usar `<img src>`
  directo: `ProofPhoto` descarga el blob con el token (`loadProofPhoto` en `web/src/lib/api.js`).
- **Lo que ve la tienda.** `GET /api/owner/proofs` devuelve número de pedido, método de pago, monto,
  cliente, `daysLeft` y la URL de la foto; se pinta en la sección "Comprobantes de pago" de `/mitienda`.
- **Solo fotos.** No hay endpoint de mensajes de texto en ninguna dirección; el cliente puede añadir más
  fotos a su pedido con `POST /api/orders/:code/proofs` (solo el cliente del pedido o el admin).

## Navegación del cliente

- **Barra inferior fija de 5 pestañas** (`web/src/components/ClientTabBar.jsx`): Inicio (`/`),
  Pedidos (`/pedidos`), Buscar (`/buscar`), Favoritos (`/favoritos`), Cuenta (`/cuenta`). Se oculta
  en `/login` y en los paneles (`/tuteteno`, `/mitienda`, `/repartidor`). El contenido del cliente
  reserva espacio con `.client-shell .page { padding-bottom }` para que nada quede tapado.
- **Buscar** usa `GET /api/search?q=` (tiendas + productos, público). **Favoritos** vive en
  `localStorage` (`web/src/lib/favorites.js`), no en la base de datos: funciona sin señal.

## Flujo del pedido: radar, PIN y reasignación

- **Radar sin PIN.** `GET /api/courier/orders/ready` lista los pedidos **sin motorizado** en estado
  `pending`, `picking` o `ready`: aparecen apenas la tienda recibe el pedido, con el itinerario
  completo (dirección y teléfono de cada tienda, dirección del cliente, paradas extra, distancia y
  ganancia). `POST /api/courier/orders/:id/accept` bloquea el pedido a nombre del motorizado
  (atómico: el primero gana) y avisa a la tienda.
- **PIN de retiro (4 dígitos).** Lo genera el cliente con el pedido; el motorizado se lo dicta a la
  tienda y **el dueño lo ingresa en `/mitienda`** (`POST /api/owner/orders/:id/release`). El
  motorizado también puede validarlo él mismo (con cola offline en IndexedDB) si no hay señal.
- **Código de entrega (4 dígitos).** Lo ve el cliente en `/pedido/:code`; cierra el pedido en
  `/repartidor` (`POST /api/courier/orders/:id/deliver`) y acredita la comisión en la billetera.
- **Liberar / cambiar conductor por demora.** `POST /api/owner/orders/:id/release-courier` solo se
  habilita cuando pasaron `COURIER_WAIT_MINUTES` (10 por defecto) desde `accepted_at` y la parada de
  esa tienda sigue sin liberar; devuelve el pedido al radar (`status = 'ready'`, motorizado en NULL).
  `GET /api/owner/orders` entrega `release` (con `canRelease`, `availableAt`, `remainingSeconds`).
- **Ubicación en vivo.** Con ruta activa el teléfono del motorizado hace `POST /api/courier/location`
  (cada ~20 s vía `watchPosition`) y la última posición queda en la tabla `courier_locations`. El
  dueño la recibe en `GET /api/owner/orders` como `courierLocation` y la dibuja con `MapPicker`
  en modo `readOnly` sobre la tienda.
- **Billetera del motorizado.** La consulta de totales de `GET /api/courier/wallet` **necesita el
  `FROM wallet_entries WHERE courier_id = $1`**: sin él Postgres fallaba con 500 y, como el panel
  carga todo con un `Promise.all`, el Radar quedaba vacío aunque la API devolviera pedidos.

## Modo preview (Base44)

Con `BASE44_PREVIEW_MODE=1` el servidor de Vite agrega el host del proxy a `allowedHosts`; sin esa
variable no se toca la configuración (`allowedHosts` queda en el default de Vite). Además del
wildcard `.<BASE44_SANDBOX_HOST_DOMAIN>` hay que permitir `3000-<dominio>`: el puerto se antepone
al mismo label DNS, así que el host del preview es *hermano* del dominio, no un subdominio — con solo
el wildcard, Vite responde 403.

## Producción (Render)

`render.yaml` es el Blueprint: Postgres, disco persistente para las fotos y **un solo servicio web**
que compila `web/` y arranca la API. No hay servicio aparte para el cliente: `api/src/server.js`
sirve `web/dist` cuando existe (config `WEB_DIST_DIR`, por defecto `../../web/dist` respecto a
`api/src`) con fallback SPA para las rutas del cliente y `Cache-Control` inmutable solo en `/assets`.
En desarrollo esa carpeta se ignora porque la app la sirve Vite, así que el flujo local no cambia.

- Build: `npm ci --prefix api && npm ci --prefix web && npm run build --prefix web`.
- Migraciones: `preDeployCommand: node api/scripts/migrate.js`. Si el plan no admite
  `preDeployCommand`, muévelo al arranque (`node api/scripts/migrate.js && node api/src/server.js`).
- `SEED_DEMO=0` evita sembrar la demo. Un arranque limpio aplica solo el esquema y la fila de
  `settings` se crea sola con los valores por defecto (`api/src/settings.js`), así que la app
  funciona sin datos demo.
- Las fotos viven en el disco (`UPLOAD_DIR=/var/data/uploads`): sin disco se pierden en cada deploy.
- `JWT_SECRET` lo genera Render; `VAPID_*` y `GOOGLE_CLIENT_ID` se cargan en el dashboard.
- La API escucha en `PORT` (`api/src/config.js`): Render lo inyecta solo y el respaldo es 10000; en
  desarrollo el compose fija `PORT=8000`, que es el que usa el proxy de Vite (`api:8000`).

## Cómo verificar

```bash
# la API responde a través del proxy de Vite
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/
curl -s localhost:3000/api/config | head -c 200

# login por correo/contraseña
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dueno@enruta.com","password":"enruta123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

En el navegador (puerto 3000): el catálogo lista las tres tiendas demo; "Entrar" con la cuenta demo
lleva al encabezado personalizado y `/mitienda` abre el panel del dueño. Los roles se comprueban con
las cuentas motorizado/cliente/admin.

## Pendiente

- No hay tests automatizados todavía.
- El acceso con Google queda desactivado hasta cargar un `GOOGLE_CLIENT_ID` real (proyecto de Google
  Cloud con el origen del preview autorizado).

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
| `db`      | Postgres 16                                                 | interno     |
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

## Detalles que no son obvios

- **Un solo origen.** El navegador solo habla con el puerto 3000; Vite hace proxy de `/api` y
  `/uploads` hacia `api:8000`. Por eso no hay CORS: cualquier endpoint nuevo se consume con rutas
  relativas (`/api/...`). La API no publica puerto al host.
- **Las imágenes son públicas.** Se guardan en el volumen `enruta_uploads` y la API las sirve en
  `/uploads/<archivo>`; cualquiera con el enlace puede abrirlas. Al reemplazar o quitar una foto, el
  archivo anterior se borra del volumen.
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

## Modo preview (Base44)

Con `BASE44_PREVIEW_MODE=1` el servidor de Vite agrega el host del proxy a `allowedHosts`; sin esa
variable no se toca la configuración (`allowedHosts` queda en el default de Vite). Además del
wildcard `.<BASE44_SANDBOX_HOST_DOMAIN>` hay que permitir `3000-<dominio>`: el puerto se antepone
al mismo label DNS, así que el host del preview es *hermano* del dominio, no un subdominio — con solo
el wildcard, Vite responde 403.

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

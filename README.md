# ENRUTA

Aplicación de delivery. Hoy incluye el **panel de tienda**: cada dueño autenticado administra su
catálogo y sube las fotos de sus productos directamente desde el panel.

## Qué hace

- Acceso con correo y contraseña; cada dueño entra solo a su tienda.
- Catálogo con alta, edición, disponibilidad y borrado de productos.
- **Carga de imágenes**: botón "Subir foto" o arrastrar la imagen sobre la tarjeta del producto.
  Acepta JPG, PNG, WEBP y GIF de hasta 5 MB, muestra el progreso y el catálogo queda actualizado al
  instante. Las fotos se sirven públicamente en `/uploads/...` (cualquiera con el enlace puede
  abrirlas, igual que el catálogo del cliente).

## Stack

- **Frontend:** React 18 + Vite (servidor de desarrollo con recarga en caliente), React Router.
- **API:** Node 22 + Express, autenticación con JWT y contraseñas con bcrypt; subidas con multer.
- **Base de datos:** Supabase (Postgres gestionado) en desarrollo y producción; el compose trae un
  Postgres 16 local solo como respaldo. Esquema en `api/db/schema.sql`.
- Todo corre en contenedores con `docker-compose.base44.yml`.

## Arrancar

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

El panel queda en <http://localhost:3000>. Las migraciones y los datos de demostración se aplican
solos al arrancar (servicio `migrate`).

**Cuenta de demostración:** `dueno@enruta.com` / `enruta123` (tienda "Pizzería El Rincón").

## Estructura

```
web/                 React + Vite (panel de tienda)
  src/pages/         LoginPage, DashboardPage
  src/components/    ProductImage (carga), ProductFormModal, TopBar
  src/lib/           cliente de API, contexto de sesión, formato de precios
api/                 Express + Postgres
  src/routes/        auth (registro/login), products (CRUD + /:id/image)
  db/schema.sql      esquema idempotente
  scripts/migrate.js esquema + datos demo
```

El navegador solo habla con el puerto 3000: Vite hace proxy de `/api` y `/uploads` hacia la API.

## Despliegue en Render

El repositorio incluye el Blueprint `render.yaml`: en Render, **New → Blueprint**, elige este
repositorio y confirma. Crea la base Postgres, un disco persistente para las fotos y un **único
servicio web** que sirve la PWA compilada y la API Express: el cliente habla con rutas relativas
(`/api`, `/uploads`), así que no hay CORS ni URL de API que configurar.

| Ajuste | Valor |
| --- | --- |
| Build | `npm ci --prefix api && npm ci --prefix web && npm run build --prefix web` |
| Migraciones | `preDeployCommand: node api/scripts/migrate.js` |
| Arranque | `node api/src/server.js` (sirve `web/dist` si existe) |
| Healthcheck | `/health` |
| Fotos | disco `/var/data` con `UPLOAD_DIR=/var/data/uploads` |

Variables que Render pide al crear el Blueprint (se pueden dejar vacías y completar después en el
dashboard): `ADMIN_EMAIL` (tu correo; esa cuenta nace admin), `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (Web Push), `GOOGLE_CLIENT_ID` (login con Google) y `VITE_GOOGLE_MAPS_API_KEY` (Google Maps). `JWT_SECRET`
lo genera Render y `DATABASE_URL` sale de la base del Blueprint.

**Geocodificación y Mapas:**
Se utilizan los servicios públicos gratuitos de **OpenStreetMap**, **Nominatim** y **OSRM** mediante el proxy backend `/api/geo` (sin API keys ni costos).
**Seguridad de la clave de Google Maps (`VITE_GOOGLE_MAPS_API_KEY`):**
En Google Cloud Console, restringe la clave de API por:
1. **HTTP Referrers:** Solo el dominio de producción de Render.
2. **Restricción de API:** Limitar el uso a las 3 APIs requeridas: **Geocoding API**, **Directions API** y **Maps JavaScript API**.

Antes de abrirlo al público:

- El disco persistente y `preDeployCommand` requieren instancias de pago; revisa el plan elegido.
- `SEED_DEMO=0` ya viaja en el Blueprint para no crear las cuentas demo (contraseña pública
  `enruta123`) en producción: regístrate con `ADMIN_EMAIL` y esa cuenta nace admin.
- Para el login con Google, autoriza el dominio de Render en los orígenes del cliente OAuth.
- El Blueprint despliega la rama por defecto del repositorio: primero hay que fusionar el PR.

## Notas

- `JWT_SECRET` se toma de `.env.base44-defaults` (placeholder de desarrollo). Cualquier valor que se
  configure en el dashboard llega por `/run/base44/app.env` y tiene prioridad.
- **Base de datos en Supabase:** la API habla Postgres con `pg`, así que basta definir el secreto
  `DATABASE_URL` con la cadena de conexión del proyecto (Supabase → Project Settings → Database →
  Connection string → **Session pooler**, `aws-0-<región>.pooler.supabase.com:5432`; la conexión directa
  `db.<ref>.supabase.co` es IPv6 y no funciona desde los contenedores). Ese valor llega por
  `/run/base44/app.env` y gana sobre el respaldo local de `.env.base44-defaults`. Al arrancar, `migrate`
  aplica el esquema idempotente (y la demo solo si `users` está vacía; `SEED_DEMO=0` la desactiva). No se
  usa `@supabase/supabase-js`.
- Detalles de entorno y verificación: `AGENTS.md`.

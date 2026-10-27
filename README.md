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
- **Base de datos:** Postgres 16 (esquema en `api/db/schema.sql`).
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

## Notas

- `JWT_SECRET` se toma de `.env.base44-defaults` (placeholder de desarrollo). Cualquier valor que se
  configure en el dashboard llega por `/run/base44/app.env` y tiene prioridad.
- Migrar a un proyecto alojado de Supabase implica reemplazar el cliente de `web/src/lib/api.js` por
  `@supabase/supabase-js` y mover el esquema a `supabase/migrations`; requiere las claves del proyecto.
- Detalles de entorno y verificación: `AGENTS.md`.

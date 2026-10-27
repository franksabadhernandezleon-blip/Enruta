# ENRUTA — notas de desarrollo

Aplicación de delivery. Este repo se creó desde cero sobre un README vacío: no había código
previo. Lo que existe hoy es el panel de tienda (catálogo + carga de imágenes de productos).

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

Las dependencias se instalan en el arranque (`npm ci`) dentro de volúmenes nombrados, así que
cambiar `package.json` / `package-lock.json` requiere `docker compose ... up -d --force-recreate`
(o reinstalar a mano) para ese servicio.

## Detalles que no son obvios

- **Un solo origen.** El navegador solo habla con el puerto 3000; Vite hace proxy de `/api` y
  `/uploads` hacia `api:8000`. Por eso no hay CORS: cualquier endpoint nuevo se consume con rutas
  relativas (`/api/...`).
- **Las imágenes son públicas.** Se guardan en el volumen `enruta_uploads` y la API las sirve en
  `/uploads/<archivo>`; cualquiera con el enlace puede abrirlas, igual que en el catálogo que ve el
  cliente. Al reemplazar o quitar una foto, el archivo anterior se borra del volumen.
- **Pasarela de carga.** `POST /api/products/:id/image` (multipart, campo `image`) valida
  MIME (`image/jpeg|png|webp|gif`) y tamaño (5 MB), y solo acepta productos de la tienda del dueño
  autenticado. Límites duplicados en `api/src/config.js` y en `web/src/components/ProductImage.jsx`.
- **Migraciones idempotentes.** `npm run migrate` aplica el esquema con `IF NOT EXISTS` y solo
  siembra la demo cuando la tabla `owners` está vacía. Nunca borra datos existentes.
- **Cuenta demo:** `dueno@enruta.com` / `enruta123` (tienda "Pizzería El Rincón" con 4 productos).
- **`JWT_SECRET`** viene de `.env.base44-defaults` como placeholder de desarrollo; `/run/base44/app.env`
  se declara después en `env_file`, así que un valor real del dashboard siempre gana.

## Modo preview (Base44)

Con `BASE44_PREVIEW_MODE=1` el servidor de Vite agrega el host del proxy a `allowedHosts`; sin esa
variable no se toca la configuración (`allowedHosts` queda en el default de Vite). Además del
wildcard `.<BASE44_SANDBOX_HOST_DOMAIN>` hay que permitir `3000-<dominio>`: el puerto se antepone
al mismo label DNS, así que el host del preview es *hermano* del dominio, no un subdominio — con solo
el wildcard, Vite responde 403.

## Cómo verificar

```bash
# login y catálogo
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dueno@enruta.com","password":"enruta123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:3000/api/products -H "Authorization: Bearer $TOKEN"

# carga de imagen
curl -s -X POST localhost:3000/api/products/<id>/image -H "Authorization: Bearer $TOKEN" \
  -F "image=@foto.png;type=image/png"
```

En el navegador: entra con la cuenta demo, abre el panel y sube una foto con el botón "Subir foto"
o arrastrándola sobre la tarjeta del producto. La imagen aparece en la tarjeta y queda servida en
`/uploads/...`.

## Pendiente

- No hay tests automatizados todavía.
- La API es local (Express + Postgres). Para usar un proyecto real de Supabase hay que reemplazar
  `web/src/lib/api.js` por `@supabase/supabase-js` (auth + `storage.from('product-images')`) y
  mover el esquema a `supabase/migrations`; requiere las claves del proyecto.

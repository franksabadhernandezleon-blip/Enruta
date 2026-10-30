-- ENRUTA (Caripito) — esquema idempotente.
-- Se aplica en cada arranque: no borra datos existentes.

-- Fila única de configuración: tasa BCV, motor de delivery, comisiones y ajustes.
CREATE TABLE IF NOT EXISTS settings (
  id                       integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bcv_rate                 numeric(14,2) NOT NULL DEFAULT 0,
  bcv_updated_at           timestamptz,
  base_fee_cents           integer NOT NULL DEFAULT 150,
  per_km_cents             integer NOT NULL DEFAULT 60,
  included_km              numeric(6,2) NOT NULL DEFAULT 2,
  extra_stop_cents         integer NOT NULL DEFAULT 100,
  charge_courier_store_leg boolean NOT NULL DEFAULT false,
  dynamic_fee_enabled      boolean NOT NULL DEFAULT false,
  dynamic_fee_cents        integer NOT NULL DEFAULT 100,
  courier_commission_pct   numeric(5,2) NOT NULL DEFAULT 80,
  platform_commission_pct  numeric(5,2) NOT NULL DEFAULT 20,
  personal_courier_mode    boolean NOT NULL DEFAULT false,
  free_delivery            boolean NOT NULL DEFAULT false,
  max_weight_kg            numeric(6,2) NOT NULL DEFAULT 20,
  whatsapp_number          text NOT NULL DEFAULT '584121590242',
  whatsapp_message         text NOT NULL DEFAULT '¡Hola ENRUTA! Quiero hacer un pedido.',
  payment                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_emails             jsonb NOT NULL DEFAULT '["franksabadhernandezleon@gmail.com"]'::jsonb,
  max_negative_balance     numeric(14,2) NOT NULL DEFAULT -10.00,
  max_debt_usd             numeric(14,2) NOT NULL DEFAULT 10.00,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Clientes, dueños de tienda, motorizados y admin.
CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL UNIQUE,
  password_hash     text,
  google_id         text,
  name              text NOT NULL DEFAULT '',
  phone             text,
  role              text NOT NULL DEFAULT 'customer',
  banned_until      timestamptz,
  banned_permanent  boolean NOT NULL DEFAULT false,
  wallet_balance    numeric(14,2) NOT NULL DEFAULT 0.00,
  vehicle_type      text DEFAULT 'moto',
  vehicle_plate     text,
  vehicle_model     text,
  is_available      boolean DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  owner_email    text,
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  description    text NOT NULL DEFAULT '',
  logo_url       text,
  banner_url     text,
  open           boolean NOT NULL DEFAULT true,
  address        text NOT NULL DEFAULT '',
  lat            double precision,
  lng            double precision,
  phone          text,
  rating         numeric(2,1) NOT NULL DEFAULT 5.0,
  schedule       jsonb NOT NULL DEFAULT '{}'::jsonb,
  wallet_balance numeric(14,2) NOT NULL DEFAULT 0.00,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Migraciones idempotentes (por si las tablas ya existían antes de añadir estas columnas):
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wallet_balance numeric(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS max_negative_balance numeric(14,2) NOT NULL DEFAULT -10.00;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS max_debt_usd numeric(14,2) NOT NULL DEFAULT 10.00;

ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance numeric(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_type text DEFAULT 'moto';
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_plate text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_model text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  description           text NOT NULL DEFAULT '',
  price_cents           integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  stock                 integer NOT NULL DEFAULT 0,
  weight_kg             numeric(6,2) NOT NULL DEFAULT 1,
  image_url             text,
  requires_confirmation boolean NOT NULL DEFAULT false,
  position              integer NOT NULL DEFAULT 1,
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_store_id_idx ON products (store_id);

CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1001;

-- Pedido: guarda la tasa BCV congelada del momento de la compra.
CREATE TABLE IF NOT EXISTS orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      text NOT NULL UNIQUE,
  customer_id               uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_name             text NOT NULL DEFAULT '',
  customer_phone            text NOT NULL DEFAULT '',
  address                   text NOT NULL DEFAULT '',
  lat                       double precision,
  lng                       double precision,
  pickup_pin                text NOT NULL,
  delivery_code             text NOT NULL,
  subtotal_cents            integer NOT NULL DEFAULT 0,
  delivery_cents            integer NOT NULL DEFAULT 0,
  total_cents               integer NOT NULL DEFAULT 0,
  bcv_rate                  numeric(14,2) NOT NULL DEFAULT 0,
  total_bs                  numeric(16,2) NOT NULL DEFAULT 0,
  distance_km               numeric(8,2) NOT NULL DEFAULT 0,
  extra_stops               integer NOT NULL DEFAULT 0,
  dynamic_fee_applied       boolean NOT NULL DEFAULT false,
  max_weight_kg             numeric(6,2) NOT NULL DEFAULT 20,
  payment_method            text NOT NULL DEFAULT '',
  payment_ref               text NOT NULL DEFAULT '',
  notes                     text NOT NULL DEFAULT '',
  status                    text NOT NULL DEFAULT 'pending',
  courier_id                uuid REFERENCES users(id) ON DELETE SET NULL,
  courier_name              text,
  courier_phone             text,
  courier_commission_cents  integer NOT NULL DEFAULT 0,
  platform_commission_cents integer NOT NULL DEFAULT 0,
  checklist                 jsonb,
  sos                       boolean NOT NULL DEFAULT false,
  accepted_at               timestamptz,
  delivered_at              timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES products(id) ON DELETE SET NULL,
  store_id    uuid REFERENCES stores(id) ON DELETE SET NULL,
  store_name  text NOT NULL DEFAULT '',
  name        text NOT NULL DEFAULT '',
  qty         integer NOT NULL DEFAULT 1,
  price_cents integer NOT NULL DEFAULT 0
);

-- Una parada por tienda: cada tienda libera su parte con el PIN de retiro.
CREATE TABLE IF NOT EXISTS order_stops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES stores(id) ON DELETE SET NULL,
  store_name      text NOT NULL DEFAULT '',
  store_address   text NOT NULL DEFAULT '',
  store_phone     text,
  lat             double precision,
  lng             double precision,
  seq             integer NOT NULL DEFAULT 1,
  released        boolean NOT NULL DEFAULT false,
  released_at     timestamptz,
  released_by     text,
  extra_fee_cents integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS crm_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  order_code text,
  kind       text NOT NULL,
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  courier_name  text NOT NULL DEFAULT '',
  courier_phone text,
  order_id      uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_code    text,
  lat           double precision,
  lng           double precision,
  status        text NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_code   text,
  amount_cents integer NOT NULL DEFAULT 0,
  kind         text NOT NULL DEFAULT 'earning',
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'requested',
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint   text NOT NULL UNIQUE,
  keys       jsonb NOT NULL,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  email      text,
  role       text NOT NULL DEFAULT 'customer',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Última posición conocida del motorizado en ruta: alimenta el mapa en vivo del dueño.
CREATE TABLE IF NOT EXISTS courier_locations (
  courier_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  order_id   uuid REFERENCES orders(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Comprobantes de pago: el cliente solo envía fotos (sin texto) y la tienda las ve
-- junto al número de pedido. Se borran solas a los 7 días (fila + archivo).
CREATE TABLE IF NOT EXISTS payment_proofs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_name  text NOT NULL,
  mime_type  text NOT NULL DEFAULT 'image/jpeg',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

-- Direcciones guardadas por los clientes.
CREATE TABLE IF NOT EXISTS addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        text NOT NULL CHECK (label IN ('Casa','Trabajo','Otro')),
  address_text text NOT NULL,
  reference    text,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON addresses (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS addresses_user_default_idx ON addresses (user_id) WHERE is_default = true;

-- Columnas opcionales de dirección en pedidos.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_id uuid REFERENCES addresses(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reference text;

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_stops_order_idx ON order_stops (order_id);
CREATE INDEX IF NOT EXISTS payment_proofs_order_idx ON payment_proofs (order_id);
CREATE INDEX IF NOT EXISTS payment_proofs_expires_idx ON payment_proofs (expires_at);

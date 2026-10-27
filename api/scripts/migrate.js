import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'franksabadhernandezleon@gmail.com').toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'enruta123';

// El panel de tienda anterior usaba tablas `owners`/`stores`/`products` con otra forma.
// Se retiran una sola vez para dejar sitio al esquema nuevo (migración idempotente).
const dropPreviousDemo = async () => {
  const { rows } = await pool.query(
    "SELECT to_regclass('public.owners') AS owners, to_regclass('public.settings') AS settings",
  );
  if (!rows[0].owners) return false;
  if (rows[0].settings) return false; // el esquema nuevo ya existe: no tocar nada
  await pool.query('DROP TABLE IF EXISTS products, stores, owners CASCADE');
  console.log('[migrate] se retiraron las tablas de la demo anterior');
  return true;
};

const STORES = [
  {
    slug: 'pizzeria-el-rincon',
    name: 'Pizzería El Rincón',
    ownerEmail: 'dueno@enruta.com',
    ownerName: 'Rosa Delgado',
    phone: '584141234567',
    description: 'Pizzas al horno de leña, empanadas y refrescos bien fríos.',
    lat: 10.1465,
    lng: -63.0995,
    rating: 4.8,
    products: [
      ['Pizza Margarita', 'Masa artesanal, salsa de tomate y mozzarella fresca.', 850, 12, 1.2, false, 1],
      ['Pizza Pepperoni', 'Doble pepperoni y queso fundido al horno de leña.', 975, 10, 1.3, false, 2],
      ['Pan de Ajo', 'Horneado al momento con mantequilla de ajo y perejil.', 320, 25, 0.4, false, 3],
      ['Refresco 1.5L', 'Bien frío, para acompañar tu pedido.', 200, 40, 1.6, false, 4],
    ],
  },
  {
    slug: 'panaderia-la-espiga',
    name: 'Panadería La Espiga',
    ownerEmail: 'espiga@enruta.com',
    ownerName: 'Jorge Villarroel',
    phone: '584241112233',
    description: 'Pan recién horneado, tortas y café del día.',
    lat: 10.142,
    lng: -63.104,
    rating: 4.6,
    products: [
      ['Pan campesino', 'Bola de pan artesanal, corteza crocante.', 180, 30, 0.8, false, 1],
      ['Torta de zanahoria', 'Porción individual con frosting de queso crema.', 350, 8, 0.5, false, 2],
      ['Café con leche', 'Café guayoyo con leche caliente, 12 oz.', 150, 50, 0.4, false, 3],
    ],
  },
  {
    slug: 'bodegon-el-sol',
    name: 'Bodegón El Sol',
    ownerEmail: 'bodegon@enruta.com',
    ownerName: 'Marta Rojas',
    phone: '584261445566',
    description: 'Víveres, bebidas y lo que falte en la cocina.',
    lat: 10.1488,
    lng: -63.1062,
    rating: 4.4,
    products: [
      ['Harina de maíz 1kg', 'Paquete precocido para arepas.', 130, 60, 1, false, 1],
      ['Cartón de huevos (12)', 'Huevos frescos de granja local.', 380, 20, 0.9, true, 2],
      ['Pollo entero (2kg)', 'Pollo fresco refrigerado, precio por kilo 80 Bs.', 640, 6, 2, true, 3],
    ],
  },
];

const seed = async () => {
  const { rows } = await pool.query('SELECT count(*)::int AS total FROM users');
  if (rows[0].total > 0) {
    console.log('[migrate] ya hay datos, no se siembra la demo');
    return;
  }

  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const insertUser = async (email, name, role) => {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id`,
      [email.toLowerCase(), password, name, role],
    );
    return result.rows[0].id;
  };

  const adminId = await insertUser(ADMIN_EMAIL, 'Admin ENRUTA', 'admin');
  await insertUser('motorizado@enruta.com', 'Luis Marcano', 'courier');
  await insertUser('cliente@enruta.com', 'Ana Pérez', 'customer');

  await pool.query(
    `INSERT INTO settings (id, bcv_rate, bcv_updated_at, payment, admin_emails)
     VALUES (1, $1, now(), $2::jsonb, $3::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      36.5,
      JSON.stringify({
        pagoMovil: { bank: 'Banesco', phone: '0412-1590242', id: 'V-12345678', holder: 'Franks A. Hernández' },
        transferencia: { bank: 'Banesco', account: '0134-0000-0000-0000000000', id: 'V-12345678', holder: 'Franks A. Hernández' },
        binance: { id: '345678901', email: 'pagos@enruta.app', note: 'USDT (TRC20)' },
      }),
      JSON.stringify([ADMIN_EMAIL]),
    ],
  );

  for (const store of STORES) {
    const ownerId = await insertUser(store.ownerEmail, store.ownerName, 'owner');
    const inserted = await pool.query(
      `INSERT INTO stores (owner_id, owner_email, name, slug, description, phone, lat, lng, rating, address, open)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true) RETURNING id`,
      [
        ownerId,
        store.ownerEmail,
        store.name,
        store.slug,
        store.description,
        store.phone,
        store.lat,
        store.lng,
        store.rating,
        `Caripito, Monagas — ${store.name}`,
      ],
    );
    for (const [name, description, priceCents, stock, weight, confirmation, position] of store.products) {
      await pool.query(
        `INSERT INTO products (store_id, name, description, price_cents, stock, weight_kg, requires_confirmation, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [inserted.rows[0].id, name, description, priceCents, stock, weight, confirmation, position],
      );
    }
  }

  await insertUser('admin@enruta.com', 'Co-Admin ENRUTA', 'admin').catch(() => null);
  console.log(`[migrate] demo lista — admin ${ADMIN_EMAIL} (${adminId ? 'ok' : 'sin id'}) / ${DEMO_PASSWORD}`);
};

try {
  await dropPreviousDemo();
  await pool.query(schema);
  console.log('[migrate] esquema aplicado');
  await seed();
} catch (error) {
  console.error('[migrate] falló:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

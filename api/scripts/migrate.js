import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8');

const seed = async () => {
  const { rows } = await pool.query('SELECT count(*)::int AS total FROM owners');
  if (rows[0].total > 0) {
    console.log('[migrate] ya hay datos, no se siembra la demo');
    return;
  }

  const passwordHash = await bcrypt.hash('enruta123', 10);
  const owner = await pool.query(
    `INSERT INTO owners (email, password_hash, name)
     VALUES ($1, $2, $3) RETURNING id`,
    ['dueno@enruta.com', passwordHash, 'Rosa Delgado'],
  );

  const store = await pool.query(
    `INSERT INTO stores (owner_id, name, slug) VALUES ($1, $2, $3) RETURNING id`,
    [owner.rows[0].id, 'Pizzería El Rincón', 'pizzeria-el-rincon'],
  );

  const products = [
    ['Pizza Margarita', 'Masa artesanal, salsa de tomate y mozzarella fresca.', 850],
    ['Pizza Pepperoni', 'Doble pepperoni y queso fundido al horno de leña.', 975],
    ['Pan de Ajo', 'Horneado al momento con mantequilla de ajo y perejil.', 320],
    ['Refresco 1.5L', 'Bien frío, para acompañar tu pedido.', 200],
  ];

  for (const [name, description, priceCents] of products) {
    await pool.query(
      `INSERT INTO products (store_id, name, description, price_cents)
       VALUES ($1, $2, $3, $4)`,
      [store.rows[0].id, name, description, priceCents],
    );
  }

  console.log('[migrate] demo creada: dueno@enruta.com / enruta123');
};

try {
  await pool.query(schema);
  console.log('[migrate] esquema aplicado');
  await seed();
} catch (error) {
  console.error('[migrate] falló:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

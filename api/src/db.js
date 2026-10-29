import pg from 'pg';

const connectionString = process.env.DATABASE_URL || '';

// El Postgres alojado (Render) exige SSL; el de docker-compose no lo ofrece.
// Se desactiva solo para anfitriones locales o cuando la URL lo pide explícito.
const localDatabase =
  /@(db|localhost|127\.0\.0\.1)[:/]/.test(connectionString) || /sslmode=disable/.test(connectionString);

export const pool = new pg.Pool({
  connectionString,
  ssl: localDatabase ? false : { rejectUnauthorized: false },
  max: 10,
});

export const query = (text, params = []) => pool.query(text, params);
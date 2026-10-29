import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
});

pool.on('error', (error) => {
  console.error('[db] error inesperado en el pool:', error.message);
});

export const query = (text, params) => pool.query(text, params);
import fs from 'node:fs/promises';
import path from 'node:path';
import { proofDir } from './config.js';
import { query } from './db.js';

// Comprobantes de pago: solo fotos, del cliente hacia la tienda. Cada uno vive una
// semana y después se borra solo (la fila de la base y el archivo del disco).
const DAY_MS = 24 * 60 * 60 * 1000;

export const proofPath = (fileName) => path.join(proofDir, path.basename(String(fileName || '')));

export const removeProofFile = (file) => (file?.filename ? fs.unlink(proofPath(file.filename)).catch(() => {}) : null);

export const daysLeft = (expiresAt) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));

export const serializeProof = (proof) => ({
  id: proof.id,
  url: `/api/proofs/${proof.id}/photo`,
  orderCode: proof.order_code,
  createdAt: proof.created_at,
  expiresAt: proof.expires_at,
  daysLeft: daysLeft(proof.expires_at),
});

export const addProof = async ({ orderId, file }) => {
  const { rows } = await query(
    'INSERT INTO payment_proofs (order_id, file_name, mime_type) VALUES ($1, $2, $3) RETURNING *',
    [orderId, file.filename, file.mimetype],
  );
  return rows[0];
};

export const listOrderProofs = async (orderId) => {
  const { rows } = await query(
    'SELECT * FROM payment_proofs WHERE order_id = $1 AND expires_at > now() ORDER BY created_at ASC',
    [orderId],
  );
  return rows;
};

// Lo que ve la tienda: número de pedido + comprobante vigente.
export const listStoreProofs = async (storeId) => {
  const { rows } = await query(
    `SELECT p.*, o.code AS order_code, o.payment_method, o.total_cents, o.customer_name
       FROM payment_proofs p
       JOIN orders o ON o.id = p.order_id
       JOIN order_stops st ON st.order_id = o.id AND st.store_id = $1
      WHERE p.expires_at > now()
      ORDER BY p.created_at DESC
      LIMIT 200`,
    [storeId],
  );
  return rows;
};

export const findProof = async (id) => {
  const { rows } = await query(
    `SELECT p.*, o.customer_id, o.code AS order_code
       FROM payment_proofs p JOIN orders o ON o.id = p.order_id
      WHERE p.id = $1 AND p.expires_at > now()`,
    [id],
  );
  return rows[0] || null;
};

// Un comprobante lo ven el cliente del pedido, las tiendas de esa ruta y el admin.
export const canSeeProof = async ({ proof, user }) => {
  if (!proof || !user) return false;
  if (proof.customer_id === user.id) return true;
  const { rows } = await query(
    `SELECT 1 FROM order_stops st JOIN stores s ON s.id = st.store_id
      WHERE st.order_id = $1 AND (s.owner_id = $2 OR lower(s.owner_email) = lower($3))`,
    [proof.order_id, user.id, user.email],
  );
  return rows.length > 0;
};

export const purgeExpiredProofs = async () => {
  const { rows } = await query('DELETE FROM payment_proofs WHERE expires_at <= now() RETURNING file_name');
  await Promise.all(rows.map((row) => fs.unlink(proofPath(row.file_name)).catch(() => {})));
  return rows.length;
};

// Se ejecuta al arrancar y cada hora: los comprobantes viejos no quedan en disco.
export const startProofCleanup = () => {
  const run = () =>
    purgeExpiredProofs()
      .then((total) => {
        if (total) console.log(`[proofs] ${total} comprobante(s) vencidos eliminados`);
      })
      .catch((error) => console.error('[proofs] no pudimos limpiar los comprobantes vencidos', error));

  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
  return timer;
};

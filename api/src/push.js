import webpush from 'web-push';
import { vapidPrivateKey, vapidPublicKey, vapidSubject } from './config.js';
import { query } from './db.js';

export const pushReady = Boolean(vapidPublicKey && vapidPrivateKey);

if (pushReady) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('[push] sin claves VAPID: las notificaciones push quedan desactivadas');
}

export const saveSubscription = async ({ subscription, user, role }) => {
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return false;

  await query(
    `INSERT INTO push_subscriptions (endpoint, keys, user_id, email, role)
     VALUES ($1, $2::jsonb, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET keys = EXCLUDED.keys, user_id = EXCLUDED.user_id, email = EXCLUDED.email, role = EXCLUDED.role`,
    [endpoint, JSON.stringify(keys), user?.id || null, user?.email || null, role || user?.role || 'customer'],
  );
  return true;
};

const send = async (rows, payload) => {
  if (!pushReady || !rows.length) return 0;
  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, body, { TTL: 3600 });
        delivered += 1;
      } catch (error) {
        // 404/410: la suscripción ya no existe en el navegador.
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [row.id]).catch(() => {});
        } else {
          console.error('[push] falló el envío:', error?.statusCode || error?.message);
        }
      }
    }),
  );

  return delivered;
};

export const notify = async ({ roles = [], emails = [], payload }) => {
  const conditions = [];
  const values = [];

  if (roles.length) {
    values.push(roles);
    conditions.push(`role = ANY($${values.length})`);
  }
  if (emails.length) {
    values.push(emails.map((email) => String(email).toLowerCase()));
    conditions.push(`lower(email) = ANY($${values.length})`);
  }
  if (!conditions.length) return 0;

  const { rows } = await query(
    `SELECT id, endpoint, keys FROM push_subscriptions WHERE ${conditions.join(' OR ')}`,
    values,
  );
  return send(rows, payload);
};

export const notifyAdmins = (adminEmails, payload) =>
  notify({ roles: ['admin'], emails: adminEmails, payload });

export const notifyCouriers = (payload) => notify({ roles: ['courier'], payload });

export const notifyEmail = (email, payload) => (email ? notify({ emails: [email], payload }) : Promise.resolve(0));

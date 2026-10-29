import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Render inyecta PORT en el servicio web (10000 por defecto); este valor es solo el respaldo
// cuando nadie lo define. En desarrollo el compose fija PORT=8000 y el proxy de Vite lo usa.
export const port = Number(process.env.PORT || 10000);

export const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Comprobantes de pago: privados (no pasan por /uploads) y se borran a la semana.
export const proofDir = process.env.PROOF_DIR || path.join(process.cwd(), 'proofs');
fs.mkdirSync(proofDir, { recursive: true });

// Cliente compilado por Vite. En producción lo sirve este mismo Express para conservar
// un solo origen (Render); en desarrollo la carpeta no existe y la sirve el servidor de Vite.
export const webDistDir =
  process.env.WEB_DIST_DIR || fileURLToPath(new URL('../../web/dist', import.meta.url));

export const maxImageBytes = 5 * 1024 * 1024;

export const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

export const adminEmails = (process.env.ADMIN_EMAIL || 'franksabadhernandezleon@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Claves VAPID: placeholders de desarrollo en .env.base44-defaults, override por dashboard.
export const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
export const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
export const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@enruta.app';

export const googleClientId = process.env.GOOGLE_CLIENT_ID || '';

// Minutos que debe esperar la tienda antes de poder liberar/cambiar al motorizado por demora.
export const courierWaitMinutes = Number(process.env.COURIER_WAIT_MINUTES || 10);

export const MAX_WEIGHT_FALLBACK_KG = 20;

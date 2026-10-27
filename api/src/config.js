import fs from 'node:fs';
import path from 'node:path';

export const port = Number(process.env.PORT || 8000);

export const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

export const maxImageBytes = 5 * 1024 * 1024;

export const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

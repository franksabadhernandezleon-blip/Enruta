import multer from 'multer';
import { allowedImageTypes, maxImageBytes, proofDir, uploadDir } from './config.js';
import { httpError } from './auth.js';

// Subida dual de fotos: archivo local (aquí) o URL externa (la guarda el cliente tal cual).
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = allowedImageTypes.get(file.mimetype) || 'jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  },
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: maxImageBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      return cb(httpError(400, 'Usa una imagen JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  },
});

// Comprobantes de pago: misma validación de imagen, guardados fuera de /uploads
// (privados) en su propia carpeta para poder borrarlos a la semana.
const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, proofDir),
  filename: (req, file, cb) => {
    const ext = allowedImageTypes.get(file.mimetype) || 'jpg';
    cb(null, `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  },
});

export const proofUpload = multer({
  storage: proofStorage,
  limits: { fileSize: maxImageBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      return cb(httpError(400, 'El comprobante debe ser una imagen JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  },
});

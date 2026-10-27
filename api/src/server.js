import express from 'express';
import multer from 'multer';
import { port, uploadDir } from './config.js';
import { query } from './db.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});

// Imágenes del catálogo: públicas, servidas desde el volumen de uploads.
app.use(
  '/uploads',
  express.static(uploadDir, {
    index: false,
    maxAge: '1h',
    fallthrough: false,
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen supera el límite de 5 MB.'
        : 'No pudimos procesar esa imagen.';
    return res.status(400).json({ error: message });
  }

  const status = error.status || 500;
  if (status >= 500) console.error('[api]', error);
  res.status(status).json({
    error: status >= 500 ? 'Ocurrió un error inesperado. Inténtalo de nuevo.' : error.message,
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[api] ENRUTA escuchando en http://0.0.0.0:${port}`);
});

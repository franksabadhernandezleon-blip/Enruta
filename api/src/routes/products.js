import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth, requireStore, httpError } from '../auth.js';
import { allowedImageTypes, maxImageBytes, uploadDir } from '../config.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = allowedImageTypes.get(file.mimetype);
    cb(null, `${req.params.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxImageBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      return cb(httpError(400, 'Usa una imagen JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  },
});

const PRODUCT_COLUMNS = `
  id, name, description, price_cents, image_url, available, created_at, updated_at
`;

const serialize = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  priceCents: row.price_cents,
  imageUrl: row.image_url,
  available: row.available,
  updatedAt: row.updated_at,
});

// Borra un archivo subido previamente sin salir del directorio de uploads.
const removeUpload = (imageUrl) => {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  const target = path.join(uploadDir, filename);
  if (!target.startsWith(uploadDir)) return;
  fs.promises.unlink(target).catch(() => {});
};

const parsePrice = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim();
  if (normalized === '') return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError(400, 'El precio debe ser un número mayor o igual a cero.');
  }
  return Math.round(amount * 100);
};

const parseName = (value) => {
  const name = String(value || '').trim();
  if (!name) throw httpError(400, 'El producto necesita un nombre.');
  if (name.length > 120) throw httpError(400, 'El nombre es demasiado largo.');
  return name;
};

const findProduct = async (productId, storeId) => {
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND store_id = $2`,
    [productId, storeId],
  );
  return rows[0] || null;
};

router.use(requireAuth, requireStore);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE store_id = $1 ORDER BY created_at DESC`,
      [req.account.store.id],
    );
    res.json({ products: rows.map(serialize) });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = parseName(req.body?.name);
    const priceCents = parsePrice(req.body?.price);
    const description = String(req.body?.description || '').trim().slice(0, 500);

    const { rows } = await query(
      `INSERT INTO products (store_id, name, description, price_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PRODUCT_COLUMNS}`,
      [req.account.store.id, name, description, priceCents],
    );
    res.status(201).json({ product: serialize(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const product = await findProduct(req.params.id, req.account.store.id);
    if (!product) throw httpError(404, 'Ese producto no existe en tu catálogo.');

    const name = req.body?.name === undefined ? product.name : parseName(req.body.name);
    const description =
      req.body?.description === undefined
        ? product.description
        : String(req.body.description || '').trim().slice(0, 500);
    const priceCents =
      req.body?.price === undefined ? product.price_cents : parsePrice(req.body.price);
    const available =
      req.body?.available === undefined ? product.available : Boolean(req.body.available);

    const { rows } = await query(
      `UPDATE products
       SET name = $1, description = $2, price_cents = $3, available = $4, updated_at = now()
       WHERE id = $5 AND store_id = $6
       RETURNING ${PRODUCT_COLUMNS}`,
      [name, description, priceCents, available, product.id, req.account.store.id],
    );
    res.json({ product: serialize(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM products WHERE id = $1 AND store_id = $2 RETURNING image_url',
      [req.params.id, req.account.store.id],
    );
    if (!rows[0]) throw httpError(404, 'Ese producto no existe en tu catálogo.');
    removeUpload(rows[0].image_url);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Pasarela de carga: la imagen del producto se guarda y queda pública en el catálogo.
router.post('/:id/image', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'Selecciona una imagen para subir.');

    const product = await findProduct(req.params.id, req.account.store.id);
    if (!product) {
      removeUpload(`/uploads/${req.file.filename}`);
      throw httpError(404, 'Ese producto no existe en tu catálogo.');
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const { rows } = await query(
      `UPDATE products SET image_url = $1, updated_at = now()
       WHERE id = $2 AND store_id = $3
       RETURNING ${PRODUCT_COLUMNS}`,
      [imageUrl, product.id, req.account.store.id],
    );

    removeUpload(product.image_url);
    res.json({ product: serialize(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/image', async (req, res, next) => {
  try {
    const product = await findProduct(req.params.id, req.account.store.id);
    if (!product) throw httpError(404, 'Ese producto no existe en tu catálogo.');

    const { rows } = await query(
      `UPDATE products SET image_url = NULL, updated_at = now()
       WHERE id = $1 AND store_id = $2
       RETURNING ${PRODUCT_COLUMNS}`,
      [product.id, req.account.store.id],
    );

    removeUpload(product.image_url);
    res.json({ product: serialize(rows[0]) });
  } catch (error) {
    next(error);
  }
});

export default router;

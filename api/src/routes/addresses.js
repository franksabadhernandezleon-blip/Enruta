import { Router } from 'express';
import { httpError, requireAuth } from '../auth.js';
import { query } from '../db.js';

const router = Router();

// Todas las rutas requieren autenticación con JWT.
router.use(requireAuth);

const VALID_LABELS = ['Casa', 'Trabajo', 'Otro'];

const serializeAddress = (row) => ({
  id: row.id,
  userId: row.user_id,
  label: row.label,
  addressText: row.address_text,
  reference: row.reference || '',
  lat: Number(row.lat),
  lng: Number(row.lng),
  isDefault: Boolean(row.is_default),
  createdAt: row.created_at,
});

// GET /api/addresses → Lista del usuario autenticado
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id],
    );
    res.json({ addresses: rows.map(serializeAddress) });
  } catch (error) {
    next(error);
  }
});

// POST /api/addresses → Crea una nueva dirección
router.post('/', async (req, res, next) => {
  try {
    const { label, addressText, reference, lat, lng } = req.body || {};

    if (!label || !VALID_LABELS.includes(label)) {
      throw httpError(400, 'El tipo de dirección debe ser Casa, Trabajo u Otro.');
    }
    if (!addressText || !String(addressText).trim()) {
      throw httpError(400, 'Escribe la dirección.');
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw httpError(400, 'Las coordenadas geográficas no son válidas.');
    }

    // Verificar si el usuario tiene direcciones previamente
    const { rows: existing } = await query(
      `SELECT count(*)::int AS total FROM addresses WHERE user_id = $1`,
      [req.user.id],
    );
    const isFirst = existing[0].total === 0;

    const { rows } = await query(
      `INSERT INTO addresses (user_id, label, address_text, reference, lat, lng, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.id,
        label,
        String(addressText).trim(),
        reference ? String(reference).trim() : null,
        latitude,
        longitude,
        isFirst,
      ],
    );

    res.status(201).json({ address: serializeAddress(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/addresses/:id → Edita label, addressText, reference
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, addressText, reference, lat, lng } = req.body || {};

    const { rows: current } = await query(
      `SELECT * FROM addresses WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );
    if (!current[0]) throw httpError(404, 'Dirección no encontrada.');

    const newLabel = label !== undefined ? label : current[0].label;
    if (!VALID_LABELS.includes(newLabel)) {
      throw httpError(400, 'El tipo de dirección debe ser Casa, Trabajo u Otro.');
    }

    const newText = addressText !== undefined ? String(addressText).trim() : current[0].address_text;
    if (!newText) throw httpError(400, 'La dirección no puede estar vacía.');

    const newRef = reference !== undefined ? (reference ? String(reference).trim() : null) : current[0].reference;

    const newLat = lat !== undefined ? Number(lat) : current[0].lat;
    const newLng = lng !== undefined ? Number(lng) : current[0].lng;
    if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) {
      throw httpError(400, 'Las coordenadas geográficas no son válidas.');
    }

    const { rows } = await query(
      `UPDATE addresses
          SET label = $1, address_text = $2, reference = $3, lat = $4, lng = $5
        WHERE id = $6 AND user_id = $7
        RETURNING *`,
      [newLabel, newText, newRef, newLat, newLng, id, req.user.id],
    );

    res.json({ address: serializeAddress(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/addresses/:id/default → Marca como predeterminada
router.patch('/:id/default', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: target } = await query(
      `SELECT * FROM addresses WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );
    if (!target[0]) throw httpError(404, 'Dirección no encontrada.');

    // Desmarcar todas las del usuario y marcar la seleccionada
    await query(`UPDATE addresses SET is_default = false WHERE user_id = $1`, [req.user.id]);
    const { rows } = await query(
      `UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id],
    );

    res.json({ address: serializeAddress(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/addresses/:id → Elimina la dirección (409 si hay pedido activo usando esa dirección)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: target } = await query(
      `SELECT * FROM addresses WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );
    if (!target[0]) throw httpError(404, 'Dirección no encontrada.');

    // Verificar si hay algún pedido activo asociado a esta dirección
    const { rows: activeOrders } = await query(
      `SELECT id FROM orders WHERE address_id = $1 AND status NOT IN ('delivered', 'cancelled') LIMIT 1`,
      [id],
    );
    if (activeOrders.length > 0) {
      throw httpError(409, 'No puedes eliminar esta dirección porque tiene un pedido en curso.');
    }

    const wasDefault = target[0].is_default;
    await query(`DELETE FROM addresses WHERE id = $1 AND user_id = $2`, [id, req.user.id]);

    // Si la eliminada era la predeterminada, reasignar la más reciente
    if (wasDefault) {
      await query(
        `UPDATE addresses SET is_default = true WHERE id = (
           SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
         )`,
        [req.user.id],
      );
    }

    res.json({ ok: true, message: 'Dirección eliminada correctamente.' });
  } catch (error) {
    next(error);
  }
});

export default router;

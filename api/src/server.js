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
    error: error.message || 'Ocurrió un error inesperado.',
  });
});

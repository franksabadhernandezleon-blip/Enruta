async function request(path, { method = 'GET', body, formData, offline = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (offline === false && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('Sin señal. Guardamos tu acción y la sincronizamos al volver.', 0);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu señal.', 0);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    console.error('Server Error Details:', {
      status: response.status,
      body: text,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    throw new ApiError(parsed?.error || text || 'Ocurrió un error inesperado.', response.status);
  }

  return data;
}

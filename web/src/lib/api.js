const TOKEN_KEY = 'enruta.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, formData } = {}) {
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

  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError('No pudimos conectar con el servidor. Inténtalo de nuevo.', 0);
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
    throw new ApiError(data?.error || 'Ocurrió un error inesperado.', response.status);
  }

  return data;
}

export const api = {
  login: ({ email, password }) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  listProducts: () => request('/products'),
  createProduct: (product) => request('/products', { method: 'POST', body: product }),
  updateProduct: (id, changes) => request(`/products/${id}`, { method: 'PATCH', body: changes }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  uploadProductImage: (id, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return request(`/products/${id}/image`, { method: 'POST', formData });
  },
  removeProductImage: (id) => request(`/products/${id}/image`, { method: 'DELETE' }),
};

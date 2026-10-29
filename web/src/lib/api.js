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

const uploadImage = (file) => {
  const formData = new FormData();
  formData.append('image', file);
  return request('/uploads', { method: 'POST', formData });
};

// El comprobante va dentro del pedido: el servidor lo guarda privado y lo borra a la semana.
const createOrder = (payload, proofFile) => {
  if (!proofFile) return request('/orders', { method: 'POST', body: payload });
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  formData.append('proof', proofFile);
  return request('/orders', { method: 'POST', formData });
};

const addOrderProof = (code, file) => {
  const formData = new FormData();
  formData.append('image', file);
  return request(`/orders/${code}/proofs`, { method: 'POST', formData });
};

// La foto es privada: se pide con el token y se muestra como blob local.
export const loadProofPhoto = async (id) => {
  const token = getToken();
  const response = await fetch(`/api/proofs/${id}/photo`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError('No pudimos cargar el comprobante.', response.status);
  return URL.createObjectURL(await response.blob());
};

export const api = {
  config: () => request('/config'),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: ({ email, password }) => request('/auth/login', { method: 'POST', body: { email, password } }),
  google: (credential) => request('/auth/google', { method: 'POST', body: { credential } }),
  me: () => request('/auth/me'),
  subscribePush: (subscription, role) =>
    request('/auth/push', { method: 'POST', body: { subscription, role } }),
  testPush: () => request('/auth/push/test', { method: 'POST' }),
  uploadImage,

  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  stores: () => request('/stores'),
  store: (slug) => request(`/stores/${slug}`),
  quote: (payload) => request('/quote', { method: 'POST', body: payload }),
  createOrder,
  order: (code) => request(`/orders/${code}`),
  myOrders: () => request('/orders/mine'),
  orderProofs: (code) => request(`/orders/${code}/proofs`),
  addOrderProof,

  owner: {
    store: () => request('/owner/store'),
    updateStore: (payload) => request('/owner/store', { method: 'PUT', body: payload }),
    createProduct: (payload) => request('/owner/products', { method: 'POST', body: payload }),
    updateProduct: (id, payload) => request(`/owner/products/${id}`, { method: 'PATCH', body: payload }),
    deleteProduct: (id) => request(`/owner/products/${id}`, { method: 'DELETE' }),
    orders: () => request('/owner/orders'),
    proofs: () => request('/owner/proofs'),
    release: (orderId, pin) =>
      request(`/owner/orders/${orderId}/release`, { method: 'POST', body: { pin } }),
    releaseCourier: (orderId) =>
      request(`/owner/orders/${orderId}/release-courier`, { method: 'POST', body: {} }),
    stats: () => request('/owner/stats'),
  },

  courier: {
    ready: () => request('/courier/orders/ready'),
    mine: () => request('/courier/orders/mine'),
    order: (id) => request(`/courier/orders/${id}`),
    accept: (id) => request(`/courier/orders/${id}/accept`, { method: 'POST' }),
    checklist: (id, items) =>
      request(`/courier/orders/${id}/checklist`, { method: 'POST', body: { items } }),
    releaseStop: (orderId, stopId, pin, isOffline) =>
      request(`/courier/orders/${orderId}/stops/${stopId}/release`, {
        method: 'POST',
        body: { pin, offline: Boolean(isOffline) },
      }),
    deliver: (id, code) => request(`/courier/orders/${id}/deliver`, { method: 'POST', body: { code } }),
    shareLocation: (payload) => request('/courier/location', { method: 'POST', body: payload }),
    sos: (payload) => request('/courier/sos', { method: 'POST', body: payload }),
    pins: () => request('/courier/pins'),
    wallet: () => request('/courier/wallet'),
    requestPayout: (amountCents) =>
      request('/courier/payouts', { method: 'POST', body: { amountCents } }),
  },

  admin: {
    overview: () => request('/admin/overview'),
    updateSettings: (payload) => request('/admin/settings', { method: 'PUT', body: payload }),
    stores: () => request('/admin/stores'),
    createStore: (payload) => request('/admin/stores', { method: 'POST', body: payload }),
    updateStore: (id, payload) => request(`/admin/stores/${id}`, { method: 'PATCH', body: payload }),
    deleteStore: (id) => request(`/admin/stores/${id}`, { method: 'DELETE' }),
    products: (storeId) => request(`/admin/products${storeId ? `?storeId=${storeId}` : ''}`),
    createProduct: (payload) => request('/admin/products', { method: 'POST', body: payload }),
    updateProduct: (id, payload) => request(`/admin/products/${id}`, { method: 'PATCH', body: payload }),
    deleteProduct: (id) => request(`/admin/products/${id}`, { method: 'DELETE' }),
    orders: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
      ).toString();
      return request(`/admin/orders${query ? `?${query}` : ''}`);
    },
    cancelOrder: (id, reason) =>
      request(`/admin/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
    users: (q) => request(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    ban: (id, payload) => request(`/admin/users/${id}/ban`, { method: 'POST', body: payload }),
    unban: (id) => request(`/admin/users/${id}/unban`, { method: 'POST' }),
    crm: () => request('/admin/crm'),
    sos: () => request('/admin/sos'),
    ackSos: (id) => request(`/admin/sos/${id}/ack`, { method: 'POST' }),
    payouts: () => request('/admin/payouts'),
    payPayout: (id) => request(`/admin/payouts/${id}/pay`, { method: 'POST' }),
    testPush: () => request('/admin/push/test', { method: 'POST' }),
  },
};

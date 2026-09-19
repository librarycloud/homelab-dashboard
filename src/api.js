const API_BASE = import.meta.env.VITE_API_BASE || '/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options
  })
  if (response.status === 204) return null
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || 'Request failed')
  return body
}

export const authApi = {
  login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (payload) => request('/auth/password', { method: 'POST', body: JSON.stringify(payload) })
}

export const systemApi = {
  info: () => request('/system/info'),
  loginAudit: (limit = 10) => request(`/system/login-audit?limit=${limit}`),
  restore: (payload) => request('/system/restore', { method: 'POST', body: JSON.stringify(payload) })
}

export const settingsApi = {
  get: () => request('/settings'),
  update: (settings) => request('/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

export const serviceApi = {
  list: () => request('/services'),
  refresh: () => request('/services/refresh', { method: 'POST' }),
  create: (service) => request('/services', { method: 'POST', body: JSON.stringify(service) }),
  update: (id, service) => request(`/services/${id}`, { method: 'PUT', body: JSON.stringify(service) }),
  reorder: (ids) => request('/services/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
  checkVersion: (id) => request(`/services/${id}/check-version`, { method: 'POST' }),
  remove: (id) => request(`/services/${id}`, { method: 'DELETE' })
}

export const domainApi = {
  list: () => request('/domains'),
  create: (domain) => request('/domains', { method: 'POST', body: JSON.stringify(domain) }),
  update: (id, domain) => request(`/domains/${id}`, { method: 'PUT', body: JSON.stringify(domain) }),
  reorder: (ids) => request('/domains/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
  refresh: (id) => request(`/domains/${id}/refresh`, { method: 'POST' }),
  remove: (id) => request(`/domains/${id}`, { method: 'DELETE' }),
  getDict: () => request('/domains/dict'),
  updateDict: (payload) => request('/domains/dict', { method: 'PUT', body: JSON.stringify(payload) }),
  renameCategory: (oldName, newName) => request('/domains/categories/rename', { method: 'PUT', body: JSON.stringify({ oldName, newName }) }),
  deleteCategory: (name) => request('/domains/categories/delete', { method: 'POST', body: JSON.stringify({ name }) })
}

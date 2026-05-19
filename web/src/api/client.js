// web/src/api/client.js — NanoFly API Client
const BASE = '/api/v1';

async function request(method, path, body) {
  const token = localStorage.getItem('nanofly_token');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const get  = (path)        => request('GET',    path);
const post = (path, body)  => request('POST',   path, body);
const del  = (path)        => request('DELETE', path);

// Auth
export const authApi = {
  login:   (email, password) => post('/auth/login',   { email, password }),
  me:      ()                => get('/auth/me'),
  refresh: ()                => get('/auth/refresh'),
};

// Setup
export const setupApi = {
  status: () => fetch('/api/setup/status').then(r => r.json()),
  init:   (payload) => fetch('/api/setup/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json()),
};

// Projects
export const projectsApi = {
  list:   ()           => get('/projects'),
  get:    (id)         => get(`/projects/${id}`),
  create: (body)       => post('/projects', body),
  delete: (id)         => del(`/projects/${id}`),
};

// Services — apps & databases within a project
export const servicesApi = {
  // List all services for a project
  listByProject: (projectId)      => get(`/projects/${projectId}/services`),
  // Create an app (Docker image or GitHub)
  createApp:     (projectId, body) => post(`/projects/${projectId}/services/app`, body),
  // Create a managed database
  createDB:      (projectId, body) => post(`/projects/${projectId}/services/database`, body),
  // Per-service
  get:           (id)              => get(`/services/${id}`),
  delete:        (id)              => del(`/services/${id}`),
  deploy:        (id)              => post(`/services/${id}/deploy`),
  deployments:   (id)              => get(`/services/${id}/deployments`),
  // Env vars
  getEnvVars:    (id)              => get(`/services/${id}/envvars`),
  upsertEnvVar:  (id, key, value)  => post(`/services/${id}/envvars`, { key, value }),
  deleteEnvVar:  (id, key)         => del(`/services/${id}/envvars/${key}`),
};

// Domains
export const domainsApi = {
  list:   ()      => get('/domains'),
  create: (body)  => post('/domains', body),
  delete: (id)    => del(`/domains/${id}`),
};

// Metrics
export const metricsApi = {
  snapshot: () => get('/metrics/snapshot'),
};

// Terminal WebSocket URL (for xterm.js)
export const terminalWsUrl = () => {
  const token = localStorage.getItem('nanofly_token');
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/v1/terminal/ws?token=${token}`;
};

// Metrics WebSocket — connects and calls onMessage with each JSON snapshot.
// Returns the WebSocket instance so the caller can close it.
export function connectMetricsWS(onMessage, onClose) {
  const token = localStorage.getItem('nanofly_token');
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/api/v1/metrics/ws?token=${token}`);

  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch (_) {}
  };
  ws.onclose = () => onClose?.();
  ws.onerror = () => { ws.close(); };
  return ws;
}

// Panel Update Management
export const updateApi = {
  check: () => get('/settings/update/check'),
  apply: () => post('/settings/update/apply'),
  log:   () => get('/settings/update/log'),
};



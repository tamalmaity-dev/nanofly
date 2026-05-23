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

async function uploadRequest(path, formData) {
  const token = localStorage.getItem('nanofly_token');
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

const get  = (path)        => request('GET',    path);
const post = (path, body)  => request('POST',   path, body);
const put  = (path, body)  => request('PUT',    path, body);
const del  = (path)        => request('DELETE', path);

// Auth
export const authApi = {
  login:   (email, password) => post('/auth/login',   { email, password }),
  me:      ()                => get('/auth/me'),
  refresh: ()                => get('/auth/refresh'),
  logout:  ()                => post('/auth/logout'),
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
  updateBackupSettings: (id, body) => request('PUT', `/projects/${id}/backup-settings`, body),
  delete: (id)         => del(`/projects/${id}`),
};

// Services — apps & databases within a project
export const servicesApi = {
  listByProject: (projectId)      => get(`/projects/${projectId}/services`),
  createApp:     (projectId, body) => post(`/projects/${projectId}/services/app`, body),
  createDB:      (projectId, body) => post(`/projects/${projectId}/services/database`, body),
  get:           (id)              => get(`/services/${id}`),
  update:        (id, body)        => request('PUT', `/services/${id}`, body),
  delete:        (id)              => del(`/services/${id}`),
  deploy:        (id)              => post(`/services/${id}/deploy`),
  stop:          (id)              => post(`/services/${id}/stop`),
  restart:       (id)              => post(`/services/${id}/restart`),
  deployments:   (id)              => get(`/services/${id}/deployments`),
  getLogs:       (id)              => get(`/services/${id}/logs`),
  getMetrics:    (id)              => get(`/services/${id}/metrics`),
  getEnvVars:    (id)              => get(`/services/${id}/envvars`),
  upsertEnvVar:  (id, key, value)  => post(`/services/${id}/envvars`, { key, value }),
  deleteEnvVar:  (id, key)         => del(`/services/${id}/envvars/${key}`),
  backup:        (id)              => post(`/services/${id}/backup`),
  importBackup:  (id, fileName)    => post(`/services/${id}/import`, { file_name: fileName }),
};

// Systemd Services (real system services)
export const systemdApi = {
  list:    ()     => get('/services/systemd'),
  start:   (name) => post(`/services/systemd/${name}/start`),
  stop:    (name) => post(`/services/systemd/${name}/stop`),
  restart: (name) => post(`/services/systemd/${name}/restart`),
};

// Domains
export const domainsApi = {
  list:   ()      => get('/domains'),
  create: (body)  => post('/domains', body),
  update: (id, body) => put(`/domains/${id}`, body),
  delete: (id)    => del(`/domains/${id}`),
  verify: (id)    => post(`/domains/${id}/verify`),
};

// Activity Log
export const activityApi = {
  list: () => get('/activity'),
};

// Metrics
export const metricsApi = {
  snapshot: () => get('/metrics/snapshot'),
};

// Terminal WebSocket URL (for xterm.js)
export const terminalWsUrl = (target = 'host', container = '') => {
  const token = localStorage.getItem('nanofly_token');
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({ token: token || '', target });
  if (container) params.set('container', container);
  return `${proto}://${window.location.host}/api/v1/terminal/ws?${params.toString()}`;
};

// Metrics WebSocket — connects and calls onMessage with each JSON snapshot.
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

// Files (File Manager)
export const filesApi = {
  list:   (path)          => get(`/files/list?path=${encodeURIComponent(path || '')}`),
  view:   (path)          => get(`/files/view?path=${encodeURIComponent(path || '')}`),
  save:   (path, content) => post('/files/save', { path, content }),
  create: (path, isDir)   => post('/files/create', { path, is_dir: isDir }),
  upload: (formData)      => uploadRequest('/files/upload', formData),
  delete: (path)          => del(`/files/delete?path=${encodeURIComponent(path || '')}`),
};

// Panel Update Management
export const settingsApi = {
  get:  ()     => get('/settings'),
  save: (body) => put('/settings', body),
};

// Backups Management
export const backupsApi = {
  list:     ()     => get('/settings/backups'),
  create:   (body) => post('/settings/backups', body),
  delete:   (name) => del(`/settings/backups/${encodeURIComponent(name)}`),
  download: (name) => `/api/v1/settings/backups/${encodeURIComponent(name)}/download`,
};

export const updateApi = {
  check: (channel = '') => get(`/settings/update/check${channel ? `?channel=${channel}` : ''}`),
  apply: () => post('/settings/update/apply'),
  log:   () => get('/settings/update/log'),
};

// GitHub Apps Management
export const githubApi = {
  listApps: () => get('/github/app'),
  getApp: (id) => get(`/github/app/${id}`),
  deleteApp: (id) => del(`/github/app/${id}`),
};

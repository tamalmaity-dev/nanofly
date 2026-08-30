// web/src/api/client.ts — NanoFly API Client (typed)
const BASE = '/api/v1';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
    throw new Error((err as { error?: string; message?: string }).error || (err as { message?: string }).message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
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
    throw new Error((err as { error?: string; message?: string }).error || (err as { message?: string }).message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const get = <T>(path: string): Promise<T> => request<T>('GET', path);
const post = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body);
const put = <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body);
const del = <T>(path: string): Promise<T> => request<T>('DELETE', path);

// Auth
export const authApi = {
  login: (email: string, password: string): Promise<{ token: string; user: unknown }> => post('/auth/login', { email, password }),
  me: (): Promise<unknown> => get('/auth/me'),
  refresh: (): Promise<unknown> => get('/auth/refresh'),
  logout: (): Promise<unknown> => post('/auth/logout'),
};

// Setup
export const setupApi = {
  status: (): Promise<{ version?: string; initialized?: boolean }> => fetch('/api/setup/status').then(r => r.json()),
  init: (payload: unknown): Promise<{ token: string; user: unknown }> => fetch('/api/setup/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json()),
};

// Projects
export const projectsApi = {
  list: (): Promise<unknown> => get('/projects'),
  get: (id: string): Promise<unknown> => get(`/projects/${id}`),
  create: (body: unknown): Promise<unknown> => post('/projects', body),
  updateBackupSettings: (id: string, body: unknown): Promise<unknown> => request('PUT', `/projects/${id}/backup-settings`, body),
  delete: (id: string): Promise<unknown> => del(`/projects/${id}`),
};

// Services — apps & databases within a project
export const servicesApi = {
  listByProject: (projectId: string): Promise<unknown> => get(`/projects/${projectId}/services`),
  createApp: (projectId: string, body: unknown): Promise<unknown> => post(`/projects/${projectId}/services/app`, body),
  createDB: (projectId: string, body: unknown): Promise<unknown> => post(`/projects/${projectId}/services/database`, body),
  get: (id: string): Promise<unknown> => get(`/services/${id}`),
  update: (id: string, body: unknown): Promise<unknown> => request('PUT', `/services/${id}`, body),
  delete: (id: string): Promise<unknown> => del(`/services/${id}`),
  deploy: (id: string): Promise<unknown> => post(`/services/${id}/deploy`),
  stop: (id: string): Promise<unknown> => post(`/services/${id}/stop`),
  restart: (id: string): Promise<unknown> => post(`/services/${id}/restart`),
  deployments: (id: string, includeLogs = true): Promise<unknown> => get(`/services/${id}/deployments${includeLogs ? '' : '?include_logs=0'}`),
  deployment: (id: string, deployID: string): Promise<unknown> => get(`/services/${id}/deployments/${deployID}`),
  cancelDeployment: (id: string, deployID: string): Promise<unknown> => post(`/services/${id}/deployments/${deployID}/cancel`),
  getLogs: (id: string): Promise<unknown> => get(`/services/${id}/logs`),
  getMetrics: (id: string): Promise<unknown> => get(`/services/${id}/metrics`),
  getEnvVars: (id: string): Promise<unknown> => get(`/services/${id}/envvars`),
  upsertEnvVar: (id: string, key: string, value: string): Promise<unknown> => post(`/services/${id}/envvars`, { key, value }),
  deleteEnvVar: (id: string, key: string): Promise<unknown> => del(`/services/${id}/envvars/${key}`),
  backup: (id: string): Promise<unknown> => post(`/services/${id}/backup`),
  importBackup: (id: string, fileName: string): Promise<unknown> => post(`/services/${id}/import`, { file_name: fileName }),
  webhookLog: (id: string): Promise<unknown> => get(`/services/${id}/webhook-log`),
  webhookTest: (id: string): Promise<unknown> => post(`/services/${id}/webhook-test`),
};

// Systemd Services (real system services)
export const systemdApi = {
  list: (): Promise<unknown> => get('/services/systemd'),
  start: (name: string): Promise<unknown> => post(`/services/systemd/${name}/start`),
  stop: (name: string): Promise<unknown> => post(`/services/systemd/${name}/stop`),
  restart: (name: string): Promise<unknown> => post(`/services/systemd/${name}/restart`),
};

// Domains
export const domainsApi = {
  list: (): Promise<unknown> => get('/domains'),
  create: (body: unknown): Promise<unknown> => post('/domains', body),
  update: (id: string, body: unknown): Promise<unknown> => put(`/domains/${id}`, body),
  delete: (id: string): Promise<unknown> => del(`/domains/${id}`),
  verify: (id: string): Promise<unknown> => post(`/domains/${id}/verify`),
};

// Activity Log
export const activityApi = {
  list: (): Promise<unknown> => get('/activity'),
};

// Metrics
export const metricsApi = {
  snapshot: (): Promise<unknown> => get('/metrics/snapshot'),
  fixCgroups: (): Promise<unknown> => post('/metrics/fix-cgroups'),
};

// Terminal WebSocket URL (for xterm.js)
export const terminalWsUrl = (target = 'host', container = ''): string => {
  const token = localStorage.getItem('nanofly_token');
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({ token: token || '', target });
  if (container) params.set('container', container);
  return `${proto}://${window.location.host}/api/v1/terminal/ws?${params.toString()}`;
};

// Metrics WebSocket — connects and calls onMessage with each JSON snapshot.
export function connectMetricsWS(onMessage: (data: unknown) => void, onClose?: () => void): WebSocket {
  const token = localStorage.getItem('nanofly_token');
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/api/v1/metrics/ws?token=${token}`);

  ws.onmessage = (e: MessageEvent) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };
  ws.onclose = () => onClose?.();
  ws.onerror = () => { ws.close(); };
  return ws;
}

// Files (File Manager)
export const filesApi = {
  list: (path?: string): Promise<unknown> => get(`/files/list?path=${encodeURIComponent(path || '')}`),
  view: (path?: string): Promise<unknown> => get(`/files/view?path=${encodeURIComponent(path || '')}`),
  save: (path: string, content: string): Promise<unknown> => post('/files/save', { path, content }),
  create: (path: string, isDir: boolean): Promise<unknown> => post('/files/create', { path, is_dir: isDir }),
  upload: (formData: FormData): Promise<unknown> => uploadRequest('/files/upload', formData),
  delete: (path: string): Promise<unknown> => del(`/files/delete?path=${encodeURIComponent(path || '')}`),
  drives: (): Promise<unknown> => get('/files/drives'),
  zip: (path: string, dest: string): Promise<unknown> => post('/files/zip', { path, dest }),
  unzip: (path: string, dest: string): Promise<unknown> => post('/files/unzip', { path, dest }),
  rename: (oldPath: string, newPath: string): Promise<unknown> => post('/files/rename', { old_path: oldPath, new_path: newPath }),
};

// Panel Update Management
export const settingsApi = {
  get: (): Promise<unknown> => get('/settings'),
  save: (body: unknown): Promise<unknown> => put('/settings', body),
  reboot: (): Promise<unknown> => post('/settings/reboot'),
  prune: (body: unknown): Promise<unknown> => post('/settings/prune', body),
  activatePanelDomain: (body: unknown): Promise<unknown> => post('/settings/panel-domain', body),
};

// Backups Management
export const backupsApi = {
  list: (): Promise<unknown> => get('/settings/backups'),
  create: (body: unknown): Promise<unknown> => post('/settings/backups', body),
  delete: (name: string): Promise<unknown> => del(`/settings/backups/${encodeURIComponent(name)}`),
  download: (name: string): string => `/api/v1/settings/backups/${encodeURIComponent(name)}/download`,
};

export const updateApi = {
  check: (channel = ''): Promise<unknown> => get(`/settings/update/check${channel ? `?channel=${channel}` : ''}`),
  apply: (): Promise<unknown> => post('/settings/update/apply'),
  log: (): Promise<unknown> => get('/settings/update/log'),
};

// GitHub Apps Management
export const githubApi = {
  listApps: (): Promise<unknown> => get('/github/app'),
  getApp: (id: string | number): Promise<unknown> => get(`/github/app/${id}`),
  deleteApp: (id: string | number): Promise<unknown> => del(`/github/app/${id}`),
  listRepos: (id: string | number): Promise<unknown> => get(`/github/app/${id}/repositories`),
};

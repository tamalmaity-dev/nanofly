// @ts-nocheck
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { servicesApi, projectsApi, domainsApi, filesApi, githubApi } from '../api/client';
import { Plus, Play, Trash2, RefreshCw, ChevronRight, GitBranch, Package, Database, Globe, Settings, Eye, EyeOff, Copy, X, Check, ExternalLink, Cpu, MemoryStick, Folder, Key, FileCode, Sliders, Upload, FolderPlus, FilePlus, ArrowLeft, Save, FileText, TerminalSquare, AlertCircle, Info, SaveIcon, HardDrive } from 'lucide-react';
import { Modal, Tabs, TabsContent, Button, SelectRoot, SelectTrigger, SelectContent, SelectItem, Tooltip, useToast } from '../components/ui';
import CodeEditor from '../components/CodeEditor';
import { ServiceLogo, ResourceIcon } from '../components/ServiceLogo';
import { AddServiceConfigFields, ConfigStepBackBar, getResourceFormDefaults } from '../components/AddServiceConfigFields';
import { markPendingRedeploy, clearPendingRedeploy, hasPendingRedeploy } from '../utils/servicePending';
import { generateSecurePassword, generateRandomIdent } from '../utils/password';
import { load as yamlLoad } from 'js-yaml';

// Lazy-loaded terminal (xterm); monitoring imported eagerly for faster tab open
import MonitoringPanel from '../components/panels/MonitoringPanel';
import { EnvVarsPanel } from './ProjectDetail/EnvVarsPanel';
import { ComposeEnvVarsPanel } from './ProjectDetail/ComposeEnvVarsPanel';
import { ServiceSidebar } from './ProjectDetail/ServiceSidebar';
import { GitHubAppWizard } from './ProjectDetail/github-app/GitHubAppWizard';
import VolumesPanel from '../components/panels/VolumesPanel';
const ContainerTerminalPanel = React.lazy(() => import('../components/panels/TerminalPanel'));


// A map of database types to their available versions, ordered from oldest to newest (with 'latest' as an alias for the newest stable version). This is used to populate the version dropdown when adding a new database service. The keys should match the identifiers used in the backend for DB types.
const DB_VERSIONS = {
  postgres: ['postgres:18', 'postgres:17', 'postgres:16', 'postgres:15', 'postgres:14', 'postgres:13', 'postgres:12', 'postgres:latest'],
  mysql: ['mysql:8.4', 'mysql:8.3', 'mysql:8.0', 'mysql:5.7', 'mysql:latest'],
  mariadb: ['mariadb:11', 'mariadb:10', 'mariadb:latest'],
  redis: ['redis:7.2', 'redis:7.0', 'redis:6.2', 'redis:latest'],
  mongo: ['mongo:7', 'mongo:6', 'mongo:5', 'mongo:4.4', 'mongo:latest'],
  keydb: ['keydb:latest', 'keydb:6.3'],
  dragonfly: ['dragonfly:latest'],
  clickhouse: ['clickhouse/clickhouse-server:latest', 'clickhouse/clickhouse-server:24.3'],
};

// A map of service types to their respective DB versions.
const getDbVersions = (dbType) => {
  switch (dbType) {
    case 'postgres': return DB_VERSIONS.postgres;
    case 'mysql': return DB_VERSIONS.mysql;
    case 'mariadb': return DB_VERSIONS.mariadb;
    case 'redis': return DB_VERSIONS.redis;
    case 'mongo': return DB_VERSIONS.mongo;
    case 'keydb': return DB_VERSIONS.keydb;
    case 'dragonfly': return DB_VERSIONS.dragonfly;
    case 'clickhouse': return DB_VERSIONS.clickhouse;
    default: return [];
  }
};


// helper function to get database key from type string
const getDbKey = (typeStr) => {
  if (typeStr.includes('postgres')) return 'postgres';
  if (typeStr.includes('mysql')) return 'mysql';
  if (typeStr.includes('mariadb')) return 'mariadb';
  if (typeStr.includes('redis')) return 'redis';
  if (typeStr.includes('mongo')) return 'mongo';
  if (typeStr.includes('keydb')) return 'keydb';
  if (typeStr.includes('dragonfly')) return 'dragonfly';
  if (typeStr.includes('clickhouse')) return 'clickhouse';
  return typeStr.split(':')[0];
};

const normalizeResourceText = (value = '') => String(value).trim().toLowerCase();

const isWordPressService = (svc) => {
  const haystack = `${svc?.name || ''} ${svc?.image || ''}`;
  return normalizeResourceText(haystack).includes('wordpress');
};

const getDatabaseEngine = (svc) => {
  const haystack = normalizeResourceText(`${svc?.name || ''} ${svc?.image || ''}`);
  if (haystack.includes('mariadb') || haystack.includes('maria')) return 'mariadb';
  if (haystack.includes('mysql')) return 'mysql';
  if (haystack.includes('postgres')) return 'postgres';
  if (haystack.includes('mongo')) return 'mongo';
  if (haystack.includes('redis')) return 'redis';
  return normalizeResourceText(svc?.image || svc?.type || 'database').split(':')[0] || 'database';
};

const getLinkedDatabaseCandidates = (app, services = []) => {
  if (!app) return [];
  const appName = normalizeResourceText(app.name);
  const directNameScore = new Map([
    [`${appName}-mysql`, 0],
    [`${appName}-mariadb`, 0],
    [`${appName}-maria`, 0],
    [`wp-db-${appName}`, 1],
  ]);

  const candidates = services.map((svc, index) => {
    if (svc.type !== 'database') return false;
    const name = normalizeResourceText(svc.name);
    const image = normalizeResourceText(svc.image);
    const isMysqlFamily = image.includes('mysql') || image.includes('mariadb') || name.includes('mysql') || name.includes('mariadb') || name.includes('maria');
    if (!isMysqlFamily) return false;
    if (directNameScore.has(name)) {
      return { svc, score: directNameScore.get(name), index };
    }
    if (name.includes(appName) && (name.includes('wp') || name.includes('wordpress') || name.includes('mysql') || name.includes('maria'))) {
      return { svc, score: 2, index };
    }
    return false;
  }).filter(Boolean);

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const aRunning = a.svc.status === 'running' ? 0 : 1;
    const bRunning = b.svc.status === 'running' ? 0 : 1;
    if (aRunning !== bRunning) return aRunning - bRunning;
    return a.index - b.index;
  });

  return candidates.length > 0 ? [candidates[0].svc] : [];
};

const buildServiceStacks = (services = []) => {
  const stacks = [];
  const groupedIds = new Set();

  services.forEach((svc) => {
    if (svc.type !== 'app' || !isWordPressService(svc)) return;
    const databases = getLinkedDatabaseCandidates(svc, services);
    if (databases.length === 0) return;

    stacks.push({
      id: svc.id,
      name: svc.name,
      type: 'wordpress',
      app: svc,
      databases,
      db: databases[0],
    });
    groupedIds.add(svc.id);
    databases.forEach(db => groupedIds.add(db.id));
  });

  return { stacks, groupedIds };
};


// Extracted to components/ServiceLogo.jsx




// Helper to parse builder value into type and version for form state management
const parseBuilderValue = (val) => {
  if (!val || val === 'auto' || val === 'dockerfile' || val === 'docker-compose' || val === 'nixpacks' || val === 'static') {
    return { type: val || 'auto', version: val || '' };
  }
  if (val.includes(':')) {
    const parts = val.split(':');
    let type = parts[0];
    if (type === 'golang') type = 'go';
    return { type, version: val };
  }
  return { type: val, version: '' };
};

// Helper to parse bulk env var input into array of { key, value } objects
const parseBulkEnv = (text) => {
  if (!text) return [];
  const lines = text.split('\n');
  const parsed = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      const value = line.substring(idx + 1).trim();
      if (key) {
        parsed.push({ key, value });
      }
    }
  }
  return parsed;
};

//  Source Files Panel
function SourceFilesPanel({ service }) {
  const rootPath = service.git_repo_url?.startsWith('file://')
    ? service.git_repo_url.replace('file://', '')
    : '';

  const [currentPath, setCurrentPath] = useState(rootPath);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Selected file details for editing
  const [selectedFile, setSelectedFile] = useState(null); // { path, name, content, originalContent, size, loading }
  const [savingFile, setSavingFile] = useState(false);
  const [editorError, setEditorError] = useState('');

  // Modals for creating new file/folder
  const [newItemModal, setNewItemModal] = useState(null); // 'file' | 'folder' | null
  const [newItemName, setNewItemName] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (!currentPath) return;
    setLoading(true);
    setError('');
    try {
      const res = await filesApi.list(currentPath);
      setFiles(res?.items || []);
    } catch (e) {
      setError(e.message || 'Failed to load files');
    }
    setLoading(false);
  }, [currentPath]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPath(rootPath);
  }, [rootPath]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('path', currentPath);
      for (const file of Array.from(selected)) {
        fd.append('files', file);
      }
      await filesApi.upload(fd);
      await fetchFiles();
    } catch (e) {
      setError(e.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleDelete = async (filePath) => {
    if (!confirm('Are you sure you want to delete this file/folder?')) return;
    try {
      await filesApi.delete(filePath);
      await fetchFiles();
    } catch (e) {
      setError(e.message || 'Failed to delete');
    }
  };

  const handleOpenFile = async (file) => {
    setEditorError('');
    setSelectedFile({
      path: file.path,
      name: file.name,
      content: '',
      originalContent: '',
      size: file.size_human,
      loading: true
    });
    try {
      const res = await filesApi.view(file.path);
      setSelectedFile({
        path: file.path,
        name: file.name,
        content: res.content || '',
        originalContent: res.content || '',
        size: file.size_human,
        loading: false
      });
    } catch (err) {
      setEditorError(err.message || 'Failed to open file');
      setSelectedFile(null);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    setSavingFile(true);
    setEditorError('');
    try {
      await filesApi.save(selectedFile.path, selectedFile.content);
      setSelectedFile(prev => ({
        ...prev,
        originalContent: prev.content
      }));
      await fetchFiles();
    } catch (err) {
      setEditorError(err.message || 'Failed to save file');
    }
    setSavingFile(false);
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemModal) return;
    setCreatingItem(true);
    setError('');
    try {
      const fullPath = `${currentPath}/${newItemName.trim()}`;
      const isDir = newItemModal === 'folder';
      await filesApi.create(fullPath, isDir);
      setNewItemName('');
      setNewItemModal(null);
      await fetchFiles();
    } catch (err) {
      setError(err.message || 'Failed to create item');
    }
    setCreatingItem(false);
  };

  const getBreadcrumbs = () => {
    const root = rootPath.replace(/\\/g, '/');
    const current = currentPath.replace(/\\/g, '/');
    const crumbs = [{ name: 'Root', path: rootPath }];
    if (current === root) return crumbs;

    if (current.startsWith(`${root}/`)) {
      let accum = root;
      current.slice(root.length + 1).split('/').filter(Boolean).forEach(part => {
        accum = `${accum}/${part}`;
        crumbs.push({ name: part, path: accum });
      });
      return crumbs;
    }

    let accum = '';
    current.split('/').filter(Boolean).forEach(part => {
      accum = accum ? `${accum}/${part}` : current.startsWith('/') ? `/${part}` : part;
      crumbs.push({ name: part, path: accum });
    });
    return crumbs;
  };

  const getParentPath = () => {
    const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const current = currentPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (current === root) return null;
    const idx = current.lastIndexOf('/');
    if (idx <= 0) return root;
    const parent = current.substring(0, idx);
    return parent.length < root.length ? root : parent;
  };

  const getFileIcon = (file) => {
    if (file.is_dir) return <Folder size={16} style={{ color: '#eab308' }} />;
    const ext = file.name.split('.').pop().toLowerCase();
    if (['go', 'js', 'jsx', 'ts', 'tsx', 'py', 'php', 'html', 'css', 'json', 'sh', 'yaml', 'yml'].includes(ext)) {
      return <FileCode size={16} style={{ color: '#3b82f6' }} />;
    }
    if (['md', 'txt', 'log', 'conf', 'env'].includes(ext)) {
      return <FileText size={16} style={{ color: '#10b981' }} />;
    }
    return <FileText size={16} style={{ color: 'var(--text-muted)' }} />;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {getParentPath() !== null && (
            <Button
              variant="outline"
              size="sm"
              style={{ padding: '4px 8px', height: 28, minWidth: 0, display: 'inline-flex', alignItems: 'center' }}
              onClick={() => setCurrentPath(getParentPath())}
              icon={ArrowLeft}
            />
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Folder size={14} style={{ color: 'var(--accent)' }} /> Path:
          </span>
          {getBreadcrumbs().map((crumb, idx) => (
            <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem' }}>
              {idx > 0 && <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
              <span
                style={{
                  color: idx === getBreadcrumbs().length - 1 ? 'var(--text-primary)' : 'var(--accent)',
                  cursor: idx === getBreadcrumbs().length - 1 ? 'default' : 'pointer',
                  fontWeight: idx === getBreadcrumbs().length - 1 ? 600 : 500,
                  textDecoration: idx === getBreadcrumbs().length - 1 ? 'none' : 'underline'
                }}
                onClick={() => {
                  if (idx !== getBreadcrumbs().length - 1) {
                    setCurrentPath(crumb.path);
                  }
                }}
              >
                {crumb.name}
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setNewItemName(''); setNewItemModal('file'); }}
            icon={FilePlus}
            style={{ fontSize: '0.78rem' }}
          >
            New File
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setNewItemName(''); setNewItemModal('folder'); }}
            icon={FolderPlus}
            style={{ fontSize: '0.78rem' }}
          >
            New Folder
          </Button>
          <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, padding: '6px 12px', background: 'var(--accent)', color: 'white', borderRadius: 'var(--radius)', fontSize: '0.78rem', fontWeight: 600 }}>
            <Upload size={14} /> Upload Files
            <input type="file" multiple onChange={handleUpload} style={{ display: 'none' }} />
          </label>
          <Button variant="outline" size="sm" onClick={fetchFiles} disabled={loading} icon={RefreshCw} />
        </div>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 4 }}>⚠️ {error}</div>}
      {uploading && <div style={{ color: 'var(--yellow)', fontSize: '0.8rem', marginBottom: '1rem' }}>Uploading files…</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', width: 100 }}>Size</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', width: 180 }}>Last Modified</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            )}
            {!loading && files.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.82rem' }}>No files found. Select files to upload or create one.</td></tr>
            )}
            {!loading && files.map(file => (
              <tr
                key={file.path}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => {
                  if (file.is_dir) {
                    setCurrentPath(file.path);
                  } else {
                    handleOpenFile(file);
                  }
                }}
              >
                <td style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{getFileIcon(file)}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: file.is_dir ? 600 : 400 }}>{file.name}</span>
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{file.is_dir ? '—' : file.size_human}</td>
                <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{new Date(file.mod_time).toLocaleString()}</td>
                <td style={{ padding: '6px 14px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28, color: 'var(--red)' }} onClick={() => handleDelete(file.path)} icon={Trash2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editor Modal */}
      <Modal
        open={!!selectedFile}
        onOpenChange={open => { if (!open) setSelectedFile(null); }}
        title={`Editing: ${selectedFile?.name || ''}`}
        maxWidth={800}
      >
        {selectedFile?.loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {editorError && <div style={{ color: 'var(--red)', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 4 }}>⚠️ {editorError}</div>}
            <CodeEditor
              value={selectedFile?.content || ''}
              onChange={val => setSelectedFile(prev => ({ ...prev, content: val }))}
              language={selectedFile?.name?.endsWith('.json') ? 'javascript' : selectedFile?.name?.endsWith('.py') ? 'python' : selectedFile?.name?.endsWith('.yaml') || selectedFile?.name?.endsWith('.yml') ? 'yaml' : selectedFile?.name?.includes('Dockerfile') ? 'docker' : 'javascript'}
              style={{ height: '450px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Size: {selectedFile?.size || '—'} · {selectedFile?.content !== selectedFile?.originalContent ? <span style={{ color: 'var(--yellow)', fontWeight: 500 }}>Unsaved changes</span> : <span style={{ color: 'var(--green)' }}>Saved</span>}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="outline" size="sm" onClick={() => setSelectedFile(null)}>Close</Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedFile?.content === selectedFile?.originalContent}
                  loading={savingFile}
                  onClick={handleSaveFile}
                  icon={Save}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Create New Item Modal */}
      <Modal
        open={!!newItemModal}
        onOpenChange={open => { if (!open) setNewItemModal(null); }}
        title={newItemModal === 'folder' ? 'Create New Folder' : 'Create New File'}
        maxWidth={400}
      >
        <form onSubmit={handleCreateItem} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{newItemModal === 'folder' ? 'Folder Name' : 'File Name'}</label>
            <input
              className="form-input"
              placeholder={newItemModal === 'folder' ? 'e.g. src, config' : 'e.g. main.py, index.js'}
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="outline" size="sm" onClick={() => setNewItemModal(null)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" loading={creatingItem}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// generate random password
const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pass = '';
  for (let i = 0; i < 24; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  return pass;
};

const getComposePreflight = (content) => {
  try {
    const parsed = yamlLoad(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.services || typeof parsed.services !== 'object' || Array.isArray(parsed.services)) {
      return { valid: false, error: 'Compose files need a top-level services: mapping.', serviceCount: 0, missingVolumes: [] };
    }

    const declared = new Set(Object.keys(parsed.volumes || {}));
    const referenced = new Set();
    Object.values(parsed.services).forEach(service => {
      if (!service || !Array.isArray(service.volumes)) return;
      service.volumes.forEach(mount => {
        let source = '';
        if (typeof mount === 'string' && mount.includes(':')) source = mount.split(':', 1)[0].trim();
        if (mount && typeof mount === 'object' && (mount.type || 'volume') === 'volume') source = String(mount.source || '').trim();
        if (!source || source.includes('$') || source.startsWith('/') || source.startsWith('~') || source.startsWith('./') || source.startsWith('../')) return;
        referenced.add(source);
      });
    });

    return {
      valid: true,
      error: '',
      serviceCount: Object.keys(parsed.services).length,
      missingVolumes: [...referenced].filter(name => !declared.has(name)).sort(),
    };
  } catch (err) {
    return { valid: false, error: `Invalid YAML: ${err.message}`, serviceCount: 0, missingVolumes: [] };
  }
};

//  Add Service Form 
function AddServiceForm({ projectId, projectName, domains = [], services = [], onCancel, onCreated }) {
  const [step, setStep] = useState('type'); // type | config
  const [type, setType] = useState('app'); // app | database
  const [subType, setSubType] = useState('docker'); // docker | github
  const [dbType, setDbType] = useState('postgres:18');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [githubApps, setGithubApps] = useState([]);

  const handleGithubWizardComplete = ({ githubAppId, gitUrl, repoFullName, defaultBranch }) => {
    const repoName = (repoFullName || '').split('/')[1] || (repoFullName || 'app');
    setForm(f => ({
      ...f,
      githubAppId,
      gitUrl,
      name: repoName,
      branch: defaultBranch || 'main',
    }));
    setStep('config');
  };

  useEffect(() => {
    if (subType === 'github') {
      githubApi.listApps().then(apps => setGithubApps(apps || [])).catch(() => { });
    }
  }, [subType]);
  const [form, setForm] = useState(() => ({
    name: '',
    image: '',
    port: '',
    gitUrl: '',
    localPath: '',
    branch: 'main',
    token: '',
    sshKey: '',
    dockerfileContent: '',
    dockerComposeContent: '',
    gitBuilder: 'auto',
    appDirectory: '',
    runFile: '',
    requirementsFile: 'requirements.txt',
    useVenv: true,
    startCommand: '',
    installCommand: '',
    dockerArgs: '',
    githubAppId: '',
    envText: '',
    dbUser: 'nanofly_user',
    dbPassword: generatePassword(),
    dbName: '',
    resourceTier: 'micro',
    dbSetupType: 'create-mysql',
    domain: '',
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const composePreflight = getComposePreflight(form.dockerComposeContent);

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    // Duplicate-name check (live, before the API call).
    // The backend enforces this too, but catching it here saves a round-trip
    // and the backend returns a less friendly error path.
    const nameConflict = (services || []).find(
      s => s.name?.toLowerCase() === form.name.trim().toLowerCase(),
    );
    if (nameConflict) {
      setError(`A service named "${form.name.trim()}" already exists in this project. Delete it first or choose a different name.`);
      return;
    }
    if (subType === 'local' && !form.localPath.trim()) { setError('Server folder path is required'); return; }
    if (selectedResourceId === 'docker-compose' && !composePreflight.valid) {
      setError(composePreflight.error);
      return;
    }
    if (subType === 'github' && selectedResourceId !== 'git-private-app' && !form.gitUrl.trim()) {
      setError('Repository URL is required');
      return;
    }
    if (selectedResourceId === 'git-private-app' && !form.githubAppId) {
      setError('Select a GitHub App or configure one in Sources first');
      return;
    }
    setLoading(true); setError('');
    try {
      let svc;
      const envVars = parseBulkEnv(form.envText);
      if (type === 'database') {
        svc = await servicesApi.createDB(projectId, {
          name: form.name.trim(),
          db_type: dbType,
          db_user: form.dbUser.trim(),
          db_password: form.dbPassword.trim(),
          db_name: form.dbName.trim(),
          tier_name: form.resourceTier
        });
      } else if (subType === 'github' || subType === 'local') {
        svc = await servicesApi.createApp(projectId, {
          name: form.name.trim(),
          git_repo_url: subType === 'github' ? (form.gitUrl.trim() || '') : '',
          local_path: subType === 'local' ? form.localPath.trim() : '',
          git_branch: form.branch.trim() || 'main',
          git_token: selectedResourceId === 'git-pat' ? form.token.trim() : '',
          github_app_id: form.githubAppId || undefined,
          ssh_key: selectedResourceId === 'git-private-key' ? form.sshKey.trim() : '',
          git_builder: form.gitBuilder || 'auto',
          app_directory: form.appDirectory.trim(),
          run_file: form.runFile.trim(),
          requirements_file: form.requirementsFile.trim() || 'requirements.txt',
          use_venv: !!form.useVenv,
          start_command: form.startCommand.trim(),
          install_command: form.installCommand.trim(),
          docker_args: form.dockerArgs.trim(),
          port: Number(form.port) || 0,
          env_vars: envVars,
          dockerfile_content: form.dockerfileContent,
          docker_compose_content: form.dockerComposeContent,
          tier_name: form.resourceTier,
          dockerfile_location: form.dockerfileLocation?.trim() || '',
          build_stage_target: form.buildStageTarget?.trim() || '',
          build_custom_options: form.buildCustomOptions?.trim() || '',
          base_directory: form.baseDirectory?.trim() || '',
          docker_registry_image: form.dockerRegistryImage?.trim() || '',
          docker_registry_tag: form.dockerRegistryTag?.trim() || '',
          ports_exposes: Number(form.portsExposes) || 0,
          port_mappings: form.portMappings?.trim() || '',
          network_aliases: form.networkAliases?.trim() || '',
          build_watch_paths: form.buildWatchPaths?.trim() || '',
          build_use_server: !!form.buildUseServer,
        });
      } else if (selectedResourceId === 'wordpress') {
        let finalEnvVars = [...envVars];

        if (form.dbSetupType === 'create-mysql' || form.dbSetupType === 'create-mariadb') {
          const isMariaDB = form.dbSetupType === 'create-mariadb';
          const dbContainerName = `${form.name.trim()}-${isMariaDB ? 'mariadb' : 'mysql'}`;
          const dbUser = form.dbUser ? form.dbUser.trim() : generateRandomIdent('wpuser_', 6);
          const dbPass = form.dbPassword ? form.dbPassword.trim() : generateSecurePassword(24);
          const dbName = form.dbName ? form.dbName.trim() : generateRandomIdent('wpdb_', 6);

          // Prevent duplicate DB services by checking if it already exists and deleting it first
          const existingDb = services.find(s => s.type === 'database' && s.name === dbContainerName);
          if (existingDb) {
            try {
              await servicesApi.delete(existingDb.id);
            } catch (err) {
              console.warn('Failed to delete existing duplicate database service:', err);
            }
          }

          const dbSvc = await servicesApi.createDB(projectId, {
            name: dbContainerName,
            db_type: isMariaDB ? 'mariadb' : 'mysql',
            db_user: dbUser,
            db_password: dbPass,
            db_name: dbName,
            tier_name: 'micro'
          });
          const dbData = dbSvc.data || dbSvc;

          finalEnvVars = finalEnvVars.filter(ev => !['WORDPRESS_DB_HOST', 'WORDPRESS_DB_USER', 'WORDPRESS_DB_PASSWORD', 'WORDPRESS_DB_NAME'].includes(ev.key));
          finalEnvVars.push({ key: 'WORDPRESS_DB_HOST', value: `host.docker.internal:${dbData.port}` });
          finalEnvVars.push({ key: 'WORDPRESS_DB_USER', value: dbUser });
          finalEnvVars.push({ key: 'WORDPRESS_DB_PASSWORD', value: dbPass });
          finalEnvVars.push({ key: 'WORDPRESS_DB_NAME', value: dbName });
        } else if (form.dbSetupType && form.dbSetupType.startsWith('link-')) {
          const dbId = form.dbSetupType.split('link-')[1];
          const dbSvc = await servicesApi.get(dbId);
          const dbData = dbSvc.data || dbSvc;

          finalEnvVars = finalEnvVars.filter(ev => !['WORDPRESS_DB_HOST', 'WORDPRESS_DB_USER', 'WORDPRESS_DB_PASSWORD', 'WORDPRESS_DB_NAME'].includes(ev.key));
          finalEnvVars.push({ key: 'WORDPRESS_DB_HOST', value: `host.docker.internal:${dbData.port}` });
          finalEnvVars.push({ key: 'WORDPRESS_DB_USER', value: dbData.db_user || 'root' });
          finalEnvVars.push({ key: 'WORDPRESS_DB_PASSWORD', value: dbData.db_password || '' });
          finalEnvVars.push({ key: 'WORDPRESS_DB_NAME', value: dbData.db_name || '' });
        }

        svc = await servicesApi.createApp(projectId, {
          name: form.name.trim(),
          image: form.image.trim() || 'wordpress:php8.3-apache',
          port: Number(form.port) || 8080,
          env_vars: finalEnvVars,
          tier_name: form.resourceTier,
        });
      } else {
        svc = await servicesApi.createApp(projectId, {
          name: form.name.trim(),
          image: form.image.trim(),
          port: Number(form.port) || 0,
          env_vars: envVars,
          tier_name: form.resourceTier,
        });
      }

      // Auto-register one sslip.io domain for app services (skip if already assigned)
      if (svc && type !== 'database') {
        const svcData = svc.data || svc;
        const svcName = svcData.name || form.name.trim();
        const host = window.location.hostname;
        const hasDomain = domains.some(d => d.service === svcName && d.project === (projectName || ''));
        if (!hasDomain) {
          let targetDomain = form.domain.trim();
          if (!targetDomain) {
            // eslint-disable-next-line react-hooks/purity
            const randomStr = Math.random().toString(36).substring(2, 10);
            targetDomain = `${randomStr}.${host}.sslip.io`;
          }
          // Remove protocol if user included it
          targetDomain = targetDomain.replace(/^https?:\/\//, '');
          try {
            await domainsApi.create({
              domain: targetDomain,
              service: svcName,
              project: projectName || '',
              direction: 'both',
            });
          } catch { /* domain already exists or conflict, skip */ }
        }

        const skipAutoDeploy = selectedResourceId === 'git-private-app' && !form.gitUrl.trim();
        if (!skipAutoDeploy) {
          try { await servicesApi.deploy(svcData.id); } catch { /* deploy trigger failed, user can retry */ }
        }
      }

      onCreated(svc);
    } catch (e) { setError(e.message || 'Failed to create resource'); }
    setLoading(false);
  };

  const handleSelectResource = (resource) => {
    setSelectedResourceId(resource.id || '');
    if (resource.type === 'app') {
      setType('app');
      let sub = resource.subType;
      if (['dockerfile', 'docker-compose', 'local-folder', 'node-template', 'python-template'].includes(resource.id)) {
        sub = 'local';
      }
      setSubType(sub);
      setIsPrivate(resource.isPrivate || false);
      const defaults = getResourceFormDefaults(resource);
      const host = window.location.hostname;
      const cleanHost = host.split(':')[0];
      // eslint-disable-next-line react-hooks/purity
      const randomStr = Math.random().toString(36).substring(2, 10);
      const generatedDomain = `http://${randomStr}.${cleanHost}.sslip.io`;

      // Auto-generate service name: project-name + short random suffix
      const shortUuid = Math.random().toString(36).substring(2, 8);
      const slug = (projectName || resource.defaultName || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const autoName = `${slug}-${shortUuid}`;

      setForm(f => ({
        ...f,
        name: autoName,
        image: resource.defaultImage || f.image,
        port: resource.defaultPort || defaults.port || '',
        ...defaults,
        envText: defaults.envText !== undefined ? defaults.envText : f.envText,
        domain: generatedDomain,
      }));

      // Docker Compose / Dockerfile go to their editor first, then config
      if (resource.id === 'docker-compose') {
        setStep('compose-editor');
        return;
      }
      if (resource.id === 'dockerfile') {
        setStep('dockerfile-editor');
        return;
      }
    } else {
      setType('database');
      const defaultVer = getDbVersions(resource.dbType)?.[0] || resource.dbType;
      setDbType(defaultVer);
      setForm(f => ({
        ...f,
        name: `my-${resource.dbType}`,
      }));
    }
    if (resource.id === 'git-private-app') {
      setStep('select-app');
    } else {
      setStep('config');
    }
  };

  const APP_RESOURCES = [
    {
      id: 'git-public',
      type: 'app',
      subType: 'github',
      isPrivate: false,
      title: 'Public Repository',
      desc: 'Deploy any kind of public repositories from the supported git providers.',
      icon: 'ðŸŒ',
      defaultName: 'public-app'
    },
    {
      id: 'local-folder',
      type: 'app',
      subType: 'local',
      title: 'Local Folder',
      desc: 'Map any server folder and build it with auto-detected Node, Python, Go, PHP, static, or Dockerfile templates.',
      icon: 'Folder',
      defaultName: 'local-app',
      defaultBuilder: 'auto'
    },
    {
      id: 'wordpress',
      type: 'app',
      subType: 'docker',
      title: 'WordPress',
      desc: 'One-click WordPress container. Add a database resource and environment variables for production use.',
      icon: 'WP',
      defaultName: 'wordpress',
      defaultImage: 'wordpress:php8.3-apache',
      defaultPort: '8080'
    },
    {
      id: 'python-template',
      type: 'app',
      subType: 'local',
      title: 'Python Template',
      desc: 'Run a Python folder with generated slim Dockerfile support.',
      icon: 'Py',
      defaultName: 'python-app',
      defaultPort: '8000',
      defaultBuilder: 'python'
    },
    {
      id: 'node-template',
      type: 'app',
      subType: 'local',
      title: 'Node.js Template',
      desc: 'Run a Node.js folder with generated Alpine Dockerfile support.',
      icon: 'JS',
      defaultName: 'node-app',
      defaultPort: '3000',
      defaultBuilder: 'node'
    },
    {
      id: 'git-private-app',
      type: 'app',
      subType: 'github',
      isPrivate: true,
      title: 'Private Repository (GitHub App)',
      desc: 'Deploy public & private repositories through GitHub Apps integrations.',
      icon: 'ðŸ”‘',
      defaultName: 'private-app'
    },
    {
      id: 'git-private-key',
      type: 'app',
      subType: 'github',
      isPrivate: true,
      title: 'Private Repository (Deploy Key)',
      desc: 'Deploy private repositories securely using a standalone SSH deploy key.',
      icon: 'ðŸ”’',
      defaultName: 'secure-app'
    },
    {
      id: 'dockerfile',
      type: 'app',
      subType: 'local',
      title: 'Dockerfile',
      desc: 'Build from a server folder with an editable Dockerfile (Node, Python, Go, PHP templates).',
      icon: 'ðŸ“„',
      defaultName: 'docker-app',
    },
    {
      id: 'docker-compose',
      type: 'app',
      subType: 'local',
      title: 'Docker Compose',
      desc: 'Run multi-container stacks with an editable docker-compose.yml.',
      icon: 'ðŸŽ›ï¸',
      defaultName: 'compose-app',
    },
    {
      id: 'docker-image',
      type: 'app',
      subType: 'docker',
      title: 'Docker Image',
      desc: 'Deploy an existing compiled Docker image from Docker Hub or a custom registry.',
      icon: 'ðŸ³',
      titleSuffix: 'Image',
      defaultName: 'web-image',
      defaultImage: 'nginx:alpine'
    }
  ];

  const DB_RESOURCES = [
    { dbType: 'postgres', title: 'PostgreSQL', desc: 'Object-relational database known for robustness and standards compliance.', icon: 'ðŸ˜' },
    { dbType: 'mysql', title: 'MySQL', desc: 'Popular open-source relational database management system.', icon: 'ðŸ¬' },
    { dbType: 'mariadb', title: 'MariaDB', desc: 'Commercially supported fork of MySQL relational database system.', icon: 'ðŸŒŠ' },
    { dbType: 'redis', title: 'Redis', desc: 'Fast, in-memory key-value data store used as database, cache, or broker.', icon: 'ðŸ”´' },
    { dbType: 'keydb', title: 'KeyDB', desc: 'High-performance, multithreaded alternative to Redis core.', icon: 'âš¡' },
    { dbType: 'dragonfly', title: 'Dragonfly', desc: 'Modern in-memory database built for high-throughput memory efficiency.', icon: 'ðŸ‰' },
    { dbType: 'mongo', title: 'MongoDB', desc: 'Flexible NoSQL document-oriented database for scalable data storage.', icon: 'ðŸƒ' },
    { dbType: 'clickhouse', title: 'ClickHouse', desc: 'Column-oriented DBMS optimized for real-time analytical queries.', icon: 'ðŸ“Š' }
  ];

  return (
    <div className="card fade-in" style={{ padding: '1.5rem', marginTop: '1rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: '1.1rem', fontWeight: 600 }}>
            New Resource <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>Environment: production</span>
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Deploy applications, databases, or local folders on your server.</p>
        </div>
        <Button variant="soft" color="gray" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', marginTop: '0.5rem' }}>
        {step === 'type' ? (
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 6 }}>
            {/* Apps Side-by-side Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>

              {/* Git Based */}
              <div>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  <GitBranch size={14} color="var(--accent)" /> Git Based
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  {APP_RESOURCES.filter(r => r.id.startsWith('git-')).map(r => (
                    <div
                      key={r.id}
                      onClick={() => handleSelectResource(r)}
                      style={{
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '1rem 1.25rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      className="hover-glow"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <ResourceIcon type={r.id} size={32} />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{r.title}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.35, margin: 0 }}>{r.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Docker / Folder Based */}
              <div>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  <Package size={14} color="var(--accent)" /> Docker & Folder Based
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  {APP_RESOURCES.filter(r => !r.id.startsWith('git-')).map(r => (
                    <div
                      key={r.id}
                      onClick={() => handleSelectResource(r)}
                      style={{
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '1rem 1.25rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      className="hover-glow"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <ResourceIcon type={r.id} size={32} />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{r.title}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.35, margin: 0 }}>{r.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* DB Section */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '1rem' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                <Database size={14} color="var(--accent)" /> Databases
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {DB_RESOURCES.map(r => (
                  <div
                    key={r.dbType}
                    onClick={() => handleSelectResource({ type: 'database', dbType: r.dbType })}
                    style={{
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '1rem 1.25rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    className="hover-glow"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <ResourceIcon type={r.dbType} size={32} />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{r.title}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.35, margin: 0 }}>{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 6 }}>
            <ConfigStepBackBar onBack={() => {
              if (selectedResourceId === 'git-private-app') {
                if (step === 'select-app') setStep('type');
                else if (step === 'select-repo') setStep('select-app');
                else if (step === 'configure-app') setStep('select-repo');
                else setStep('type');
              } else if (step === 'compose-editor' || step === 'dockerfile-editor') {
                setStep('type');
              } else if (step === 'config' && selectedResourceId === 'docker-compose') {
                setStep('compose-editor');
              } else if (step === 'config' && selectedResourceId === 'dockerfile') {
                setStep('dockerfile-editor');
              } else {
                setStep('type');
              }
            }} />

            {/* Docker Compose editor step */}
            {step === 'compose-editor' && selectedResourceId === 'docker-compose' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    Docker Compose
                    <span className="badge badge-blue" style={{ fontSize: '0.65rem', fontWeight: 500 }}>Step 1 of 2</span>
                  </h3>
                  <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Define your services in docker-compose.yml. NanoFly will run <code style={{ background: 'var(--bg-base)', padding: '1px 5px', borderRadius: 4, fontSize: '0.8rem' }}>docker compose up</code> for this stack.
                  </p>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <CodeEditor
                    value={form.dockerComposeContent}
                    onChange={val => setForm(f => ({ ...f, dockerComposeContent: val }))}
                    language="yaml"
                    style={{ height: 380 }}
                  />
                </div>

                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '0.75rem 0.9rem', borderRadius: 8,
                  border: `1px solid ${composePreflight.valid ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.35)'}`,
                  background: composePreflight.valid ? 'rgba(34, 197, 94, 0.06)' : 'rgba(239, 68, 68, 0.07)',
                  fontSize: '0.82rem', lineHeight: 1.45,
                }}>
                  {composePreflight.valid ? <Check size={17} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={17} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />}
                  <div style={{ color: composePreflight.valid ? 'var(--text-secondary)' : 'var(--red)' }}>
                    {composePreflight.valid ? (
                      <>
                        <strong style={{ color: 'var(--text-primary)' }}>Compose preflight ready</strong> · {composePreflight.serviceCount} service{composePreflight.serviceCount === 1 ? '' : 's'} detected.
                        {composePreflight.missingVolumes.length > 0 && <span> NanoFly will add the required top-level volume declaration{composePreflight.missingVolumes.length === 1 ? '' : 's'} for: <code>{composePreflight.missingVolumes.join(', ')}</code>.</span>}
                      </>
                    ) : composePreflight.error}
                  </div>
                </div>

                {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ {error}</p>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: '0.5rem' }}>
                  <Button variant="soft" color="gray" onClick={() => setStep('type')}>Back</Button>
                  <Button variant="primary" disabled={!composePreflight.valid} loading={loading} onClick={async () => {
                    // Coolify-style: create directly from compose file without config step
                    setError('');
                    setLoading(true);
                    try {
                      let envText = form.envText;
                      let port = form.port;
                      try {
                        const parsed = yamlLoad(form.dockerComposeContent);
                        const firstSvc = parsed?.services ? parsed.services[Object.keys(parsed.services)[0]] : null;
                        if (firstSvc) {
                          if (!port && firstSvc.ports?.length > 0) {
                            const hp = String(firstSvc.ports[0]).split(':')[0]?.replace(/[^0-9]/g, '');
                            if (hp) port = hp;
                          }
                          if (firstSvc.environment && !envText) {
                            if (Array.isArray(firstSvc.environment)) envText = firstSvc.environment.join('\n');
                            else if (typeof firstSvc.environment === 'object') envText = Object.entries(firstSvc.environment).map(([k, v]) => `${k}=${v}`).join('\n');
                          }
                        }
                      } catch { }
                      const envVars = envText ? envText.split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }; }) : [];
                      const svc = await servicesApi.createApp(projectId, {
                        name: form.name.trim(),
                        local_path: form.localPath?.trim() || `/opt/nanofly/apps/${form.name.trim()}`,
                        git_builder: 'docker-compose',
                        docker_compose_content: form.dockerComposeContent,
                        port: Number(port) || 0,
                        env_vars: envVars,
                        tier_name: form.resourceTier || 'micro',
                      });
                      onCreated(svc);
                    } catch (e) {
                      setError(e.message || 'Failed to create service');
                    }
                    setLoading(false);
                  }}>
                    Create service
                  </Button>
                </div>
              </div>
            )}

            {/* Dockerfile editor step */}
            {step === 'dockerfile-editor' && selectedResourceId === 'dockerfile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    Dockerfile
                    <span className="badge badge-blue" style={{ fontSize: '0.65rem', fontWeight: 500 }}>Step 1 of 2</span>
                  </h3>
                  <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Define your <code style={{ background: 'var(--bg-base)', padding: '1px 5px', borderRadius: 4, fontSize: '0.8rem' }}>Dockerfile</code> — pick a template or write your own. NanoFly will <code style={{ background: 'var(--bg-base)', padding: '1px 5px', borderRadius: 4, fontSize: '0.8rem' }}>docker build</code> this context.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { id: 'node', label: 'Node 20', tpl: 'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]' },
                    { id: 'python', label: 'Python 3.11', tpl: 'FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["python", "app.py"]' },
                    { id: 'go', label: 'Go 1.22', tpl: 'FROM golang:1.22-alpine AS builder\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN go build -o /app/main .\nFROM alpine:3.19\nCOPY --from=builder /app/main /app/main\nEXPOSE 8080\nCMD ["/app/main"]' },
                    { id: 'static', label: 'Static / Nginx', tpl: 'FROM nginx:alpine\nCOPY . /usr/share/nginx/html\nEXPOSE 80' },
                  ].map(t => (
                    <button key={t.id} type="button" onClick={() => setForm(f => ({ ...f, dockerfileContent: t.tpl }))} style={{ padding: '6px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}>{t.label}</button>
                  ))}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <CodeEditor
                    value={form.dockerfileContent}
                    onChange={val => setForm(f => ({ ...f, dockerfileContent: val }))}
                    language="dockerfile"
                    style={{ height: 380 }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: '0.5rem' }}>
                  <Button variant="soft" color="gray" onClick={() => setStep('type')}>Back</Button>
                  <Button variant="primary" onClick={() => {
                    // Auto-detect EXPOSE port
                    try {
                      const m = form.dockerfileContent.match(/EXPOSE\s+(\d+)/i);
                      if (m && m[1]) {
                        const p = m[1].trim();
                        setForm(f => ({ ...f, port: p, portsExposes: p }));
                      }
                    } catch { /* ignore */ }
                    setStep('config');
                  }}>
                    Next: Configuration
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            )}

            {selectedResourceId === 'git-private-app' ? (
              <GitHubAppWizard
                onComplete={handleGithubWizardComplete}
                onCancel={() => { setSelectedResourceId(''); setStep('type'); }}
              />
            ) : (
              <>
                {type === 'app' ? (
                  <AddServiceConfigFields
                    projectId={projectId}
                    resourceMeta={APP_RESOURCES.find(r => r.id === selectedResourceId)}
                    form={form}
                    setForm={setForm}
                    subType={subType}
                    isPrivate={isPrivate}
                    selectedResourceId={selectedResourceId}
                    githubApps={githubApps}
                    existingServices={services}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(79,110,247,0.06)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(79,110,247,0.1)' }}>
                      {/* <span style={{ fontSize: '1.1rem' }}>💾</span> */}
                      <SaveIcon className="text-blue-500" />
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Deploying Database: {dbType.toUpperCase()}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          NanoFly will spin up an isolated database container and inject connection strings automatically.
                        </div>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Database Version</label>
                      <SelectRoot value={dbType} onValueChange={setDbType}>
                        <SelectTrigger style={{ width: '100%' }} />
                        <SelectContent>
                          {(() => {
                            const versions = getDbVersions(getDbKey(dbType));
                            const items = versions.length > 0 ? versions : [dbType];
                            return items.map(v => (
                              <SelectItem key={v} value={v}>
                                {v.includes(':') ? `${v.split(':')[0].toUpperCase()} ${v.split(':')[1]}` : (v.includes('/') ? v.split('/')[1].toUpperCase() : v.toUpperCase())}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </SelectRoot>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Database Instance Name *</label>
                      <input className="form-input" placeholder={`my-${dbType.split(':')[0]}`} value={form.name} onChange={set('name')} autoFocus />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Resource Tier</label>
                      <select className="form-input" value={form.resourceTier} onChange={set('resourceTier')}>
                        <option value="nano">Nano (128MB / 0.25 CPU)</option>
                        <option value="micro">Micro (256MB / 0.5 CPU) - Default</option>
                        <option value="standard">Standard (512MB / 1.0 CPU)</option>
                        <option value="large">Large (1GB / 2.0 CPU)</option>
                        <option value="unlimited">Unlimited (No Limits)</option>
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Database User</label>
                        <input className="form-input" value={form.dbUser} onChange={set('dbUser')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Database Password</label>
                        <input className="form-input" value={form.dbPassword} onChange={set('dbPassword')} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Initial Database Name</label>
                      <input className="form-input" placeholder="Leave empty to use instance name" value={form.dbName} onChange={set('dbName')} />
                    </div>
                  </div>
                )}

                {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ {error}</p>}

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <Button variant="soft" color="gray" onClick={() => setStep('type')}>Back</Button>
                  <Button variant="solid" onClick={submit} loading={loading}>
                    Deploy Now
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper component for copying deployment logs
function DeploymentLogPre({ logText, logRef, d }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: '#fff',
          padding: '2px 8px',
          fontSize: '0.7rem',
          cursor: 'pointer',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre
        ref={logRef}
        style={{
          margin: 0,
          background: '#0a0d14',
          padding: '1rem',
          fontSize: '0.78rem',
          color: '#a8d8a8',
          overflow: 'auto',
          maxHeight: 380,
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
        }}
      >
        {logText.split('\n').map((line, i) => {
          let color = '#a8d8a8';
          if (line.includes('❌') || line.includes('Error') || line.includes('error') || line.includes('failed')) color = '#ff6b6b';
          else if (line.includes('✅') || line.includes('succeeded') || line.includes('complete')) color = '#51cf66';
          else if (line.includes('⚠️') || line.includes('warn')) color = '#ffd43b';
          else if (line.includes('📥') || line.includes('📦') || line.includes('🔨') || line.includes('🚀')) color = '#74c0fc';
          return <span key={i} style={{ color, display: 'block' }}>{line}</span>;
        })}
        {(d.status === 'building' || d.status === 'deploying') && (
          <span style={{ color: '#f59e0b', display: 'block', marginTop: 4 }}>▌ Building...</span>
        )}
      </pre>
    </div>
  );
}

//  Deployments Panel ─
function DeploymentsPanel({ serviceId }) {
  const [deps, setDeps] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);

  const logRef = useCallback(node => {
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  const fetchDeps = useCallback(() => {
    servicesApi.deployments(serviceId).then(d => {
      setDeps(d || []);
      // Auto-open the latest deployment
      if (d && d.length > 0 && open === null) setOpen(d[0].id);
    }).catch(() => { }).finally(() => setLoading(false));
  }, [serviceId, open]);

  useEffect(() => {
    fetchDeps();
    // Poll faster (1.5s) if something is building
    const interval = setInterval(() => {
      servicesApi.deployments(serviceId).then(d => {
        setDeps(d || []);
      }).catch(() => { });
    }, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const isBuilding = deps.some(d => d.status === 'building' || d.status === 'deploying');

  const statusColor = {
    running: 'var(--green)',
    completed: 'var(--green)',
    building: 'var(--yellow)',
    deploying: 'var(--yellow)',
    error: 'var(--red)',
    idle: 'var(--text-muted)',
  };

  const statusLabel = {
    running: 'Running',
    completed: 'Completed',
    building: 'Building...',
    deploying: 'Deploying...',
    error: 'Failed',
    idle: 'Idle',
  };

  const getStatusColor = (status) => {
    return Object.prototype.hasOwnProperty.call(statusColor, status) ? statusColor[status] : 'var(--text-muted)';
  };

  const getStatusLabel = (status) => {
    return Object.prototype.hasOwnProperty.call(statusLabel, status) ? statusLabel[status] : status;
  };

  return (
    <div>
      {isBuilding && (
        <div style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8,
          padding: '0.6rem 1rem',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '1.05rem',
          color: '#f59e0b',
        }}>
          <span className="spinner" style={{ width: 16, height: 16 }} />
          <strong>Build in progress</strong> — logs are updating live below…
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="card fade-in" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="skeleton-circle" style={{ width: 14, height: 14 }}></div>
              <div className="skeleton-text" style={{ width: 180, height: 16 }}></div>
              <div className="skeleton-text" style={{ width: 100, height: 16, marginLeft: 'auto' }}></div>
            </div>
          ))}
        </div>
      ) : deps.length === 0 ? (
        <div className="card fade-in" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No deployments yet. Click <strong>Redeploy</strong> to start.
        </div>
      ) : null}

      {deps.map(d => (
        <div key={d.id} className="card" style={{ marginBottom: '0.75rem', padding: 0, overflow: 'hidden', border: open === d.id ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
          {/* Deployment header */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', cursor: 'pointer', background: 'var(--bg-card)' }}
            onClick={() => setOpen(open === d.id ? null : d.id)}
          >
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: getStatusColor(d.status),
              flexShrink: 0,
              boxShadow: (d.status === 'building' || d.status === 'deploying') ? `0 0 6px ${getStatusColor(d.status)}` : 'none',
            }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
              {getStatusLabel(d.status)}
            </span>
            {d.commit_sha && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--accent)', background: 'rgba(79,110,247,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                {d.commit_sha.slice(0, 7)}
              </span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              {new Date(d.started_at).toLocaleString()}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, transform: open === d.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
          </div>

          {/* Build log */}
          {open === d.id && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {d.log ? (
                <DeploymentLogPre logText={d.log} logRef={logRef} d={d} />
              ) : (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '1.05rem', textAlign: 'center' }}>
                  {(d.status === 'building' || d.status === 'deploying') ? '⚙️ Starting build, logs will appear shortly...' : 'No log output.'}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Extracted to components/ServiceLogo.jsx

// Service Card
function ServiceCard({ svc }) {
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)', creating: 'var(--yellow)', oom_killed: 'var(--red)', crashed: 'var(--red)' };
  const getStatusColor = (status) => {
    return Object.prototype.hasOwnProperty.call(statusColor, status) ? statusColor[status] : 'var(--text-muted)';
  };

  return (
    <div className="card hover-glow" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{svc.name}</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: getStatusColor(svc.status), boxShadow: `0 0 6px ${getStatusColor(svc.status)}` }} title={svc.status} />
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
        {svc.description || (svc.type === 'database' ? `This is NanoFly's ${svc.name} database.` : `This is the ${svc.name} application.`)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {svc.git_repo_url && (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
            {svc.git_repo_url.replace('https://github.com/', '').replace('file://', '')}
          </div>
        )}
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
          Server: localhost{svc.port > 0 ? `:${svc.port}` : ''}
        </div>
      </div>
    </div>
  );
}

// Stack Card for Grouped Services (e.g. WordPress App + Database)
function StackCard({ stack, setActiveSvc, setActiveTab }) {
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)', creating: 'var(--yellow)', oom_killed: 'var(--red)', crashed: 'var(--red)' };
  const getStatusColor = (status) => {
    return Object.prototype.hasOwnProperty.call(statusColor, status) ? statusColor[status] : 'var(--text-muted)';
  };

  const app = stack.app;
  const databases = stack.databases || (stack.db ? [stack.db] : []);
  const primaryDb = databases[0];
  const databaseLabel = databases.length > 1
    ? `${databases.length} linked databases`
    : `linked ${primaryDb ? getDatabaseEngine(primaryDb) : 'database'}`;

  return (
    <div className="card hover-glow" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', position: 'relative', border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(79, 110, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ServiceLogo type="app" name={app.name} image={app.image} builder={app.git_builder} size={20} />
        </div>
        <div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{app.name} stack</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>WordPress with {databaseLabel}</div>
        </div>
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
        {app.description || 'Application and database resources are managed together as one service stack.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* App Item */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setActiveSvc(app.id);
            setActiveTab('deployments');
          }}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: 'var(--bg-elevated)',
            borderRadius: 6,
            cursor: 'pointer',
            border: '1px solid var(--border)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.background = 'rgba(79, 110, 247, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.background = 'var(--bg-elevated)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ServiceLogo type={app.type} name={app.name} image={app.image} builder={app.git_builder} size={16} />
            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>{app.name} (App)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(app.status), boxShadow: `0 0 6px ${getStatusColor(app.status)}` }} />
            <span style={{ fontSize: '0.75rem', color: getStatusColor(app.status), textTransform: 'capitalize' }}>{app.status}</span>
          </div>
        </div>

        {/* Database Items */}
        {databases.map((db) => (
          <div
            key={db.id}
            onClick={(e) => {
              e.stopPropagation();
              setActiveSvc(db.id);
              setActiveTab('connection');
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 6,
              cursor: 'pointer',
              border: '1px solid var(--border)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.background = 'rgba(79, 110, 247, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'var(--bg-elevated)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ServiceLogo type={db.type} name={db.name} image={db.image} size={16} />
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>{db.name} (DB)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(db.status), boxShadow: `0 0 6px ${getStatusColor(db.status)}` }} />
              <span style={{ fontSize: '0.75rem', color: getStatusColor(db.status), textTransform: 'capitalize' }}>{db.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Container Logs Panel
function ContainerLogsPanel({ serviceId, services = [], selectedSvc = null }) {
  const [logs, setLogs] = useState('Fetching container logs...');
  const [copied, setCopied] = useState(false);
  const [selectedLogSvcId, setSelectedLogSvcId] = useState(serviceId);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState(100);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedLogSvcId(serviceId);
  }, [serviceId]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await servicesApi.getLogs(selectedLogSvcId);
      setLogs(res.logs || 'No runtime logs found. Container might be stopped or starting.');
    } catch (err) {
      setLogs(`Error: ${err.message}`);
    }
  }, [selectedLogSvcId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSvc?.name || 'service'}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const projectDbs = selectedSvc?.type === 'app' ? getLinkedDatabaseCandidates(selectedSvc, services) : [];
  const filteredLogs = search
    ? logs.split('\n').filter(l => l.toLowerCase().includes(search.toLowerCase())).join('\n')
    : logs;
  const displayedLogs = filteredLogs.split('\n').slice(-lines).join('\n');

  return (
    <div>
      {projectDbs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Button
            variant={selectedLogSvcId === serviceId ? 'solid' : 'ghost'}
            size="sm"
            onClick={() => setSelectedLogSvcId(serviceId)}
          >
            {selectedSvc?.name} (App)
          </Button>
          {projectDbs.map(db => (
            <Button
              key={db.id}
              variant={selectedLogSvcId === db.id ? 'solid' : 'ghost'}
              size="sm"
              onClick={() => setSelectedLogSvcId(db.id)}
            >
              {db.name} ({db.image || 'Database'})
            </Button>
          ))}
        </div>
      )}
      {/* Toolbar like Coolify */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
          <span style={{ fontWeight: 600 }}>Seaweedfs</span>
          <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <Button variant="ghost" size="sm" style={{ padding: 6, minWidth: 32, height: 32 }} onClick={handleCopy} icon={copied ? Check : Copy} title="Copy" />
          <Button variant="ghost" size="sm" style={{ padding: 6, minWidth: 32, height: 32 }} onClick={fetchLogs} icon={RefreshCw} title="Refresh" />
          <Button variant="ghost" size="sm" style={{ padding: 6, minWidth: 32, height: 32 }} onClick={handleDownload} icon={FileText} title="Download logs" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lines</span>
          <select value={lines} onChange={e => setLines(Number(e.target.value))} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            placeholder="Find in logs"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 10px 6px 28px', fontSize: '0.8rem', color: 'var(--text-primary)', width: 180 }}
          />
          <span style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
        </div>
      </div>
      <pre style={{
        background: '#0d1117',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1rem',
        fontSize: '0.8rem',
        lineHeight: 1.6,
        color: '#e2e8f0',
        overflow: 'auto',
        maxHeight: 380,
        fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
        whiteSpace: 'pre-wrap',
      }}>
        {displayedLogs}
      </pre>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <span>{filteredLogs.split('\n').length} lines {search && `(filtered)`}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} /> Live polling every 3s</span>
      </div>
    </div>
  );
}

//  Webhook Panel 
function WebhookPanel({ serviceId, githubAppId, gitRepoUrl }) {
  const [copied, setCopied] = useState(false);
  const isGitHubApp = !!githubAppId;
  const webhookUrl = isGitHubApp
    ? `${window.location.origin}/api/webhooks/github`
    : `${window.location.origin}/api/webhooks/${serviceId}`;
  const pendingRepo = gitRepoUrl === 'github-app://pending' || !gitRepoUrl;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {isGitHubApp ? 'GitHub App auto-deploy' : 'Automatic deployments webhook'}
        </h4>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {isGitHubApp
            ? 'Set this URL on your GitHub App (Sources page). Pushes to repos covered by the installation trigger deploy; the repository URL is linked on the first push.'
            : 'Configure a webhook in your repository provider to trigger builds on every push.'}
        </p>
        {isGitHubApp && pendingRepo && (
          <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--yellow)' }}>
            Waiting for the first push to link this service to a repository.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          readOnly
          className="form-input"
          value={webhookUrl}
          style={{ fontFamily: 'monospace', fontSize: '0.8rem', border: '1px solid var(--border)', flex: 1 }}
        />
        <Button variant="ghost" size="sm" onClick={copyToClipboard} style={{ height: 38, width: 38 }} icon={copied ? Check : Copy} />
      </div>

      <div className="card" style={{ padding: '1rem', background: 'rgba(79,110,247,0.04)', border: '1px solid rgba(79,110,247,0.08)', borderRadius: 8 }}>
        <h5 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>
          {isGitHubApp ? 'GitHub App setup' : 'Per-repository webhook setup'}
        </h5>
        {isGitHubApp ? (
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Open <strong>Sources</strong> and edit your GitHub App.</li>
            <li>Set the app webhook URL to the value above (Push events).</li>
            <li>Install the app on your organization or repositories.</li>
            <li>Push to a linked branch — NanoFly deploys automatically.</li>
          </ol>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Go to your repository on <strong>GitHub</strong>.</li>
            <li>Navigate to <strong>Settings</strong> &rarr; <strong>Webhooks</strong>.</li>
            <li>Add a webhook with the Payload URL above.</li>
            <li>Content type: <strong>application/json</strong>, events: <strong>push</strong>.</li>
          </ol>
        )}
      </div>
    </div>
  );
}

// Settings Panel 
function SettingsPanel({ service, project, domains = [], services = [], onUpdate }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [githubApps, setGithubApps] = useState([]);

  // Routing direction handling
  const [direction, setDirection] = useState('both');

  const [form, setForm] = useState(() => ({
    name: service.name,
    description: service.description || '',
    image: service.image || '',
    port: service.port || '',
    gitUrl: service.git_repo_url?.startsWith('file://') ? '' : (service.git_repo_url || ''),
    localPath: service.git_repo_url?.startsWith('file://') ? service.git_repo_url.replace('file://', '') : '',
    branch: service.git_branch || 'main',
    gitBuilder: service.git_builder || 'auto',
    appDirectory: service.app_directory || '',
    runFile: service.run_file || '',
    requirementsFile: service.requirements_file || 'requirements.txt',
    useVenv: service.use_venv !== false,
    startCommand: service.start_command || '',
    installCommand: service.install_command || '',
    dockerArgs: service.docker_args || '',
    token: service.git_token || '',
    sshKey: service.ssh_key || '',
    githubAppId: service.github_app_id || '',
    dockerfileContent: service.dockerfile_content || '',
    dockerComposeContent: service.docker_compose_content || '',
    dbUser: service.db_user || '',
    dbPassword: service.db_password || '',
    dbName: service.db_name || '',
    resourceTier: service.resource_tier || 'micro',
    customMemory: service.custom_memory || 0,
    customCPU: service.custom_cpu || 0,
    domain: '',
    dockerRegistryImage: service.docker_registry_image || '',
    dockerRegistryTag: service.docker_registry_tag || '',
    baseDirectory: service.base_directory || '',
    dockerfileLocation: service.dockerfile_location || '',
    buildStageTarget: service.build_stage_target || '',
    buildWatchPaths: service.build_watch_paths || '',
    buildCustomOptions: service.build_custom_options || '',
    buildUseServer: !!service.build_use_server,
    portsExposes: service.ports_exposes ? String(service.ports_exposes) : (service.port ? String(service.port) : ''),
    portMappings: service.port_mappings || '',
    networkAliases: service.network_aliases || '',
  }));

  useEffect(() => {
    githubApi.listApps().then(apps => setGithubApps(apps || [])).catch(() => { });
  }, []);

  useEffect(() => {
    const matched = domains.find(d => d.service === service.name && d.project === project?.name);
    let initialDomain = '';
    if (matched) {
      initialDomain = matched.domain;
      // Ensure it starts with http:// or https://
      if (!initialDomain.startsWith('http://') && !initialDomain.startsWith('https://')) {
        initialDomain = `http://${initialDomain}`;
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      name: service.name,
      description: service.description || '',
      image: service.image || '',
      port: service.port || '',
      gitUrl: service.git_repo_url?.startsWith('file://') ? '' : (service.git_repo_url || ''),
      localPath: service.git_repo_url?.startsWith('file://') ? service.git_repo_url.replace('file://', '') : '',
      branch: service.git_branch || 'main',
      gitBuilder: service.git_builder || 'auto',
      appDirectory: service.app_directory || '',
      runFile: service.run_file || '',
      requirementsFile: service.requirements_file || 'requirements.txt',
      useVenv: service.use_venv !== false,
      startCommand: service.start_command || '',
      installCommand: service.install_command || '',
      dockerArgs: service.docker_args || '',
      token: service.git_token || '',
      sshKey: service.ssh_key || '',
      githubAppId: service.github_app_id || '',
      dockerfileContent: service.dockerfile_content || '',
      dockerComposeContent: service.docker_compose_content || '',
      dbUser: service.db_user || '',
      dbPassword: service.db_password || '',
      dbName: service.db_name || '',
      resourceTier: service.resource_tier || 'micro',
      customMemory: service.custom_memory || 0,
      customCPU: service.custom_cpu || 0,
      domain: initialDomain,
      dockerRegistryImage: service.docker_registry_image || '',
      dockerRegistryTag: service.docker_registry_tag || '',
      baseDirectory: service.base_directory || '',
      dockerfileLocation: service.dockerfile_location || '',
      buildStageTarget: service.build_stage_target || '',
      buildWatchPaths: service.build_watch_paths || '',
      buildCustomOptions: service.build_custom_options || '',
      buildUseServer: !!service.build_use_server,
      portsExposes: service.ports_exposes ? String(service.ports_exposes) : (service.port ? String(service.port) : ''),
      portMappings: service.port_mappings || '',
      networkAliases: service.network_aliases || '',
    });

    setDirection(matched && matched.direction ? matched.direction : 'both');
  }, [service, domains, project]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess(false);

    let finalGitUrl = form.gitUrl.trim();
    if (service.type === 'app') {
      const isLocalPathApp = service.git_repo_url?.startsWith('file://') || form.localPath.trim() !== '';
      if (isLocalPathApp) {
        if (!form.localPath.trim()) {
          setError('Server folder path is required');
          toast.error('Server folder path is required');
          setSaving(false);
          return;
        }
        finalGitUrl = 'file://' + form.localPath.trim();
      }
    }

    try {
      await servicesApi.update(service.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        image: form.image.trim(),
        port: Number(form.port) || 0,
        git_repo_url: finalGitUrl,
        git_branch: form.branch.trim(),
        git_builder: form.gitBuilder,
        app_directory: form.appDirectory.trim(),
        run_file: form.runFile.trim(),
        requirements_file: form.requirementsFile.trim() || 'requirements.txt',
        use_venv: !!form.useVenv,
        start_command: form.startCommand.trim(),
        install_command: form.installCommand.trim(),
        docker_args: form.dockerArgs.trim(),
        git_token: form.token.trim(),
        ssh_key: form.sshKey.trim(),
        dockerfile_content: form.dockerfileContent,
        docker_compose_content: form.dockerComposeContent,
        db_user: form.dbUser.trim(),
        db_password: form.dbPassword.trim(),
        db_name: form.dbName.trim(),
        tier_name: form.resourceTier,
        custom_memory: Number(form.customMemory),
        custom_cpu: Number(form.customCPU),
        docker_registry_image: form.dockerRegistryImage.trim(),
        docker_registry_tag: form.dockerRegistryTag.trim(),
        base_directory: form.baseDirectory.trim(),
        dockerfile_location: form.dockerfileLocation.trim(),
        build_stage_target: form.buildStageTarget.trim(),
        build_watch_paths: form.buildWatchPaths.trim(),
        build_custom_options: form.buildCustomOptions.trim(),
        build_use_server: !!form.buildUseServer,
        ports_exposes: Number(form.portsExposes) || 0,
        port_mappings: form.portMappings.trim(),
        network_aliases: form.networkAliases.trim(),
      });

      // Update domain and direction in domains_v2 if modified
      const matched = domains.find(d => d.service === service.name && d.project === project?.name);
      const cleanNewDomain = form.domain.trim().replace(/^https?:\/\//, ''); // strip protocol
      const cleanOldDomain = matched ? matched.domain : '';

      if (cleanNewDomain !== cleanOldDomain) {
        if (matched) {
          await domainsApi.delete(matched.id);
        }
        if (cleanNewDomain) {
          await domainsApi.create({
            domain: cleanNewDomain,
            service: form.name.trim(),
            project: project?.name || 'Production',
            direction: direction
          });
        }
      } else if (matched && matched.direction !== direction) {
        await domainsApi.update(matched.id, {
          domain: cleanNewDomain,
          service: form.name.trim(),
          project: project?.name || 'Production',
          direction: direction
        });
      }

      setSuccess(true);
      markPendingRedeploy(service.id);
      toast.info('Configuration saved — Redeploy to apply changes');
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      const errorMsg = err.message || 'Failed to save configuration';
      setError(errorMsg);
      toast.error(errorMsg);
    }
    setSaving(false);
  };

  const isBuiltApp = !!(service.git_repo_url || service.local_path || form.localPath);
  const isWordPress = (form.image || '').toLowerCase().includes('wordpress');

  const getResourceMeta = () => {
    if (service.type === 'database') {
      const dbKey = getDbKey(service.image || '');
      const dbTitles = {
        postgres: 'PostgreSQL',
        mysql: 'MySQL',
        mariadb: 'MariaDB',
        redis: 'Redis',
        mongo: 'MongoDB',
        keydb: 'KeyDB',
        dragonfly: 'Dragonfly',
        clickhouse: 'ClickHouse'
      };
      const title = dbTitles[dbKey] || (dbKey.toUpperCase());
      return {
        id: dbKey,
        title: `${title} Database`,
        desc: `Managed database instance running ${service.image || 'latest'}.`
      };
    }

    if (isWordPress) {
      return {
        id: 'wordpress',
        title: 'WordPress Site',
        desc: 'Official WordPress image with PHP and Apache.'
      };
    }

    const isLocal = service.git_repo_url?.startsWith('file://') || form.localPath;

    if (isBuiltApp && !isLocal) {
      if (service.github_app_id) {
        return {
          id: 'git-private-app',
          title: 'Private Repository (GitHub App)',
          desc: 'Deploy public & private repositories through GitHub Apps integrations.'
        };
      }
      if (form.sshKey) {
        return {
          id: 'git-private-key',
          title: 'Private Repository (Deploy Key)',
          desc: 'Deploy private repositories securely using a standalone SSH deploy key.'
        };
      }
      return {
        id: 'git-public',
        title: 'Public Repository',
        desc: 'Deploy any kind of public repositories from the supported git providers.'
      };
    }

    if (isLocal) {
      const currentBuilder = parseBuilderValue(form.gitBuilder).type;
      if (currentBuilder === 'dockerfile') {
        return {
          id: 'dockerfile',
          title: 'Dockerfile Local Project',
          desc: 'Build and deploy using a local Dockerfile.'
        };
      }
      if (currentBuilder === 'docker-compose') {
        return {
          id: 'docker-compose',
          title: 'Docker Compose Local Project',
          desc: 'Deploy multi-container stacks using local docker-compose.yml.'
        };
      }
      return {
        id: 'local-folder',
        title: 'Local Folder Project',
        desc: 'Build from a local folder path on the server.'
      };
    }

    return {
      id: 'docker-image',
      title: 'Docker Image App',
      desc: 'Deploy an existing compiled Docker image from Docker Hub or a custom registry.'
    };
  };

  const resourceMeta = getResourceMeta();
  const subType = resourceMeta.id.startsWith('git-') ? 'github' : (['dockerfile', 'docker-compose', 'local-folder', 'node-template', 'python-template'].includes(resourceMeta.id) ? 'local' : 'docker');
  const isPrivate = service.github_app_id || resourceMeta.id === 'git-private-key';

  /* eslint-disable react-hooks/static-components */
  const ConfigSection = ({ title, desc, children }) => (
    <div
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        marginBottom: '1rem',
      }}
    >
      <div>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h4>
        {desc && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
  /* eslint-enable react-hooks/static-components */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8, maxWidth: '100%' }}>
      {service.type === 'database' ? (
        <ConfigSection title="Database Credentials" desc="Keep these in sync with your running database container.">
          <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)', borderRadius: 8, padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            If you change the values here, please sync it here, otherwise automations (like backups) won't work.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Username</label>
              <input className="form-input" value={form.dbUser} onChange={e => setForm(prev => ({ ...prev, dbUser: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Password</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="form-input"
                  type={showPassword ? "text" : "password"}
                  value={form.dbPassword}
                  onChange={e => setForm(prev => ({ ...prev, dbPassword: e.target.value }))}
                  style={{ flex: 1 }}
                />
                <Button variant="ghost" size="sm" type="button" onClick={() => setShowPassword(!showPassword)} style={{ height: 38, width: 38, padding: 0 }}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Initial Database</label>
            <input className="form-input" value={form.dbName} onChange={e => setForm(prev => ({ ...prev, dbName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Database Engine</label>
            <input className="form-input" value={form.image} onChange={e => setForm(prev => ({ ...prev, image: e.target.value }))} placeholder="e.g. postgres, redis, mysql" />
          </div>
        </ConfigSection>
      ) : (
        <>
          <AddServiceConfigFields
            projectId={project?.id}
            resourceMeta={resourceMeta}
            form={form}
            setForm={setForm}
            subType={subType}
            isPrivate={isPrivate}
            selectedResourceId={resourceMeta.id}
            githubApps={githubApps}
            hideEnvVars={true}
            existingServices={services.filter(s => s.id !== service.id)}
          />

          <ConfigSection title="Routing Direction" desc="Select how requests to www and non-www subdomains are handled.">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Direction
                <Tooltip content="Select how requests to www and non-www subdomains are handled.">
                  <Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
                </Tooltip>
              </label>
              <select
                className="form-input"
                value={direction}
                onChange={e => setDirection(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="both">Allow www & non-www.</option>
                <option value="www">Redirect to www</option>
                <option value="non-www">Redirect to non-www</option>
              </select>
            </div>
          </ConfigSection>
        </>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: 8, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius)' }}>⚠️ {error}</div>}
      {success && <div style={{ color: 'var(--green)', fontSize: '0.85rem', marginBottom: 8, padding: '8px 12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--radius)' }}>✅ Configuration saved. Redeploy to apply.</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <Button variant="primary" icon={Save} onClick={handleSave} disabled={saving} loading={saving}>
          Save Configuration
        </Button>
      </div>
    </div>
  );
}

//  Backup & Restore Panel 
function BackupRestorePanel({ service }) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupFile, setBackupFile] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const handleBackup = async () => {
    try {
      setLoading(true);
      const res = await servicesApi.backup(service.id);
      toast.success('Backup created: ' + (res.file || res.backupFileName || 'done'));
    } catch (e) {
      toast.error('Backup failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!backupFile) return toast.error('Enter a filename to import');
    try {
      setImporting(true);
      await servicesApi.importBackup(service.id, backupFile);
      toast.success('Database imported successfully!');
    } catch (e) {
      toast.error('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header like Coolify */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Backups</h3>
        <div style={{ position: 'relative' }}>
          <Button variant="primary" size="sm" onClick={() => setShowAddMenu(!showAddMenu)} icon={Plus}>
            Add backup
          </Button>
          {showAddMenu && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 4, minWidth: 180, zIndex: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <div onClick={() => { setShowAddMenu(false); handleBackup(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-base)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Database size={14} /> Storage backup
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats like Coolify */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, padding: '1rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Schedules</div><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>0</div></div>
        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Enabled</div><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>0</div></div>
        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total executions</div><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>0</div></div>
      </div>

      {/* Search + Filter like Coolify */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input placeholder="Search backups" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px 8px 32px', fontSize: '0.85rem', color: 'var(--text-primary)', width: '100%' }} />
          <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
        </div>
        <Button variant="outline" size="sm" icon={Sliders}>Filter</Button>
        <Button variant="outline" size="sm" icon={RefreshCw}>Sort</Button>
      </div>

      {/* Empty state like Coolify */}
      <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-base)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Database size={20} style={{ color: 'var(--text-muted)' }} />
        </div>
        <h4 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>No scheduled backups</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, maxWidth: 420, marginInline: 'auto' }}>Add a database, persistent volume, or directory backup schedule to protect service data.</p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" onClick={handleBackup} loading={loading}>Create Storage Backup</Button>
        </div>
      </div>

      {/* Manual Import (kept for compatibility) */}
      <div className="card" style={{ padding: '1.25rem', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Upload size={14} /> Import Backup
        </h4>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Restore a backup file from the persistent host volume. <strong style={{ color: 'var(--red)' }}>Warning: This will drop the current content!</strong></p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input form-input-sm" placeholder="backup_file.sql or backup_*.tar.gz" value={backupFile} onChange={e => setBackupFile(e.target.value)} style={{ flex: 1 }} />
          <Button variant="outline" size="sm" onClick={handleImport} loading={importing} disabled={importing || !backupFile}>
            Import Data
          </Button>
        </div>
      </div>
    </div>
  );
}

//  Connection Details Panel (Databases) 
function ConnectionDetailsPanel({ service }) {
  const [envVars, setEnvVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    servicesApi.getEnvVars(service.id)
      .then(vars => {
        setEnvVars(vars || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [service.id]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><div className="spinner" /></div>;

  const connStringObj = envVars.find(v => v.key === 'CONNECTION_STRING');
  const connString = connStringObj ? connStringObj.value : '';

  // Parse connection details from the connection string
  let host = 'localhost';
  let port = service.port || 5432;
  let username = 'nanofly';
  let password = '';
  let dbName = service.name ? service.name.toLowerCase().replace(/-/g, '_') : 'nanofly';

  const type = (service.image || '').split(':')[0] || 'postgres';

  if (connString) {
    try {
      if (connString.startsWith('redis://')) {
        const parts = connString.replace('redis://', '').split(':');
        if (parts.length > 1) {
          const hostPort = parts[parts.length - 1];
          port = parseInt(hostPort, 10) || port;
        }
        username = '(none)';
      } else if (connString.startsWith('postgres://') || connString.startsWith('mysql://') || connString.startsWith('mongodb://') || connString.startsWith('clickhouse://')) {
        const match = connString.match(/^([a-z0-9]+):\/\/([^:]+):(.*)@([^:]+):([0-9]+)\/(.*)$/);
        if (match) {
          host = 'localhost';
          username = match[2];
          password = match[3];
          port = parseInt(match[5], 10) || port;
          dbName = match[6];
        } else {
          const urlStr = connString.replace('mongodb://', 'http://').replace('postgres://', 'http://').replace('mysql://', 'http://').replace('clickhouse://', 'http://');
          const parsed = new URL(urlStr);
          host = 'localhost';
          port = parseInt(parsed.port, 10) || port;
          username = parsed.username || 'nanofly';
          password = parsed.password || '';
          dbName = parsed.pathname ? parsed.pathname.replace('/', '') : dbName;
        }
      }
    } catch (e) {
      console.error('Error parsing connection string:', e);
    }
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate connection CLI commands
  let cliCmd = '';
  switch (type) {
    case 'postgres':
      cliCmd = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${username} -d ${dbName}`;
      break;
    case 'mysql':
    case 'mariadb':
      cliCmd = `mysql -h ${host} -P ${port} -u ${username} -p"${password}" ${dbName}`;
      break;
    case 'redis':
    case 'keydb':
    case 'dragonfly':
      cliCmd = `redis-cli -h ${host} -p ${port}`;
      break;
    case 'mongo':
      cliCmd = `mongosh "mongodb://${username}:${password}@${host}:${port}/${dbName}?authSource=admin"`;
      break;
    case 'clickhouse':
      cliCmd = `clickhouse-client --host ${host} --port ${port} --user ${username} --password "${password}" --database ${dbName}`;
      break;
    default:
      cliCmd = `conn -h ${host} -p ${port}`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* Credentials Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={14} color="var(--accent)" /> Access Credentials
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Database Host</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{host}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>External Port</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{port}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Database Name</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{dbName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Username</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{username}</span>
            </div>
            {type !== 'redis' && type !== 'keydb' && type !== 'dragonfly' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>Password</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {showPassword ? password : '••••••••••••••••'}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setShowPassword(!showPassword)} icon={showPassword ? EyeOff : Eye} style={{ padding: 4 }} />
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(password)} icon={Copy} style={{ padding: 4 }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Engine Information Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={14} color="var(--accent)" /> Engine Details
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <ServiceLogo type="database" name={service.name} image={service.image} size={32} />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {type} Engine
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {service.image || 'latest'}
                </div>
              </div>
            </div>
          </div>
          <div style={{ background: 'rgba(79,110,247,0.06)', border: '1px solid rgba(79,110,247,0.18)', borderRadius: 8, padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            This database is managed inside Docker. The external port is mapped to allow connections from local and external applications.
          </div>
        </div>
      </div>

      {/* Connection Strings and CLI commands */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Connection URLs
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Connection URI</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input form-input-sm"
                type={showPassword ? 'text' : 'password'}
                value={connString || 'Generating connection URL...'}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', flex: 1 }}
              />
              <Button variant="outline" size="sm" onClick={() => handleCopy(connString)} icon={Copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>CLI Connection Command</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input form-input-sm"
                value={cliCmd}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', flex: 1 }}
              />
              <Button variant="outline" size="sm" onClick={() => handleCopy(cliCmd)} icon={Copy}>
                Copy
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceLimitsPanel({ service, onUpdate }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const getInitialTier = (svc) => {
    let tier = svc.resource_tier;
    if (svc.type === 'database') {
      if (!tier || tier === 'micro' || tier === 'nano') {
        return 'unlimited';
      }
    }
    return tier || 'micro';
  };

  const [resourceTier, setResourceTier] = useState(getInitialTier(service));
  const [customMemory, setCustomMemory] = useState(service.custom_memory || 0);
  const [customCPU, setCustomCPU] = useState(service.custom_cpu || 0);

  useEffect(() => {
    setResourceTier(getInitialTier(service));
    setCustomMemory(service.custom_memory || 0);
    setCustomCPU(service.custom_cpu || 0);
  }, [service]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await servicesApi.update(service.id, {
        tier_name: resourceTier,
        custom_memory: Number(customMemory),
        custom_cpu: Number(customCPU),
      });
      markPendingRedeploy(service.id);
      toast.info('Resource limits saved — Redeploy to apply changes');
      onUpdate();
    } catch (err) {
      const errorMsg = err.message || 'Failed to save resource limits';
      toast.error(errorMsg);
    }
    setSaving(false);
  };

  const TIER_DETAILS = {
    nano: { memory: 128, cpu: 0.25, color: '#38bdf8', name: 'Nano', desc: 'Perfect for small scripts and lightweight services' },
    micro: { memory: 256, cpu: 0.5, color: '#22c55e', name: 'Micro', desc: 'Great for small applications - Default option' },
    standard: { memory: 512, cpu: 1.0, color: '#eab308', name: 'Standard', desc: 'Balanced performance for most applications' },
    large: { memory: 1024, cpu: 2.0, color: '#f97316', name: 'Large', desc: 'High performance for resource-heavy applications' },
    unlimited: { memory: null, cpu: null, color: '#ef4444', name: 'Unlimited', desc: 'No resource limits - Use with caution' },
    custom: { memory: null, cpu: null, color: '#8b5cf6', name: 'Custom', desc: 'Define your own resource limits' }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Resource Limits</h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Configure CPU and memory limits for this service
          </p>
        </div>
        <Button
          variant="primary"
          icon={Save}
          onClick={handleSave}
          loading={saving}
        >
          Save Changes
        </Button>
      </div>

      {service.type === 'database' && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '1rem',
          background: 'rgba(234, 179, 8, 0.08)',
          border: '1px solid rgba(234, 179, 8, 0.2)',
          borderRadius: 8,
          marginBottom: '1.25rem',
          color: '#eab308',
          fontSize: '0.85rem',
          lineHeight: 1.5
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ display: 'block', marginBottom: 4 }}>Database Service Detected</strong>
            To prevent unexpected Out-Of-Memory (OOM) crashes during database initialization or query operations, database services on NanoFly default to <strong>Unlimited</strong>. Adjust these resource constraints carefully.
          </div>
        </div>
      )}

      {/* Tier Selection */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="section-title" style={{ marginBottom: '1rem' }}>
          Select Resource Tier
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '1rem' }}>
          {Object.entries(TIER_DETAILS).map(([key, tier]) => (
            <div
              key={key}
              onClick={() => setResourceTier(key)}
              style={{
                border: `2px solid ${resourceTier === key ? tier.color : 'var(--border)'}`,
                background: resourceTier === key ? `${tier.color}15` : 'var(--bg-base)',
                borderRadius: 'var(--radius)',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: `${tier.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {key === 'custom' ? <Sliders size={16} color={tier.color} /> :
                    key === 'unlimited' ? <Globe size={16} color={tier.color} /> :
                      <Cpu size={16} color={tier.color} />}
                </div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tier.name}</span>
                {key === 'micro' && <span className="badge badge-green" style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>Default</span>}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{tier.desc}</p>
              {key !== 'custom' && key !== 'unlimited' && (
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MemoryStick size={12} /> {tier.memory} MB
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Cpu size={12} /> {tier.cpu} Cores
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom Limits Section */}
      {resourceTier === 'custom' && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={16} /> Custom Resource Limits
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Memory Limit (MB)
                  <Tooltip content="Maximum amount of memory the container can use">
                    <Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
                  </Tooltip>
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={customMemory ? customMemory / (1024 * 1024) : ''}
                  onChange={e => setCustomMemory(Number(e.target.value) * 1024 * 1024)}
                  placeholder="e.g., 512"
                  min="0"
                />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                128 MB = 0.125 GB · 1024 MB = 1 GB
              </div>
            </div>

            <div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  CPU Limit (Cores)
                  <Tooltip content="Maximum CPU cores the container can use">
                    <Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
                  </Tooltip>
                </label>
                <input
                  type="number"
                  step="0.25"
                  className="form-input"
                  value={customCPU || ''}
                  onChange={e => setCustomCPU(Number(e.target.value))}
                  placeholder="e.g., 1.5"
                  min="0"
                />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                0.25 = ¼ core · 1.0 = 1 full core · 2.0 = 2 full cores
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div style={{
        marginTop: '1.25rem',
        padding: '1rem 1.25rem',
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.18)',
        borderRadius: 'var(--radius)',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10
      }}>
        <Info size={18} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> Changes to resource limits will take effect the next time you redeploy this service. The current running container will continue using the old limits until you redeploy.
        </div>
      </div>

      {/* Database Warning Banner */}
      {service.type === 'database' && (
        <div style={{
          marginTop: '1.25rem',
          padding: '1rem 1.25rem',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.18)',
          borderRadius: 'var(--radius)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10
        }}>
          <AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Important Database Resource Advice:</strong> Databases (especially MySQL, PostgreSQL, and MongoDB) require significant RAM to initialize and operate stably. Setting resource limits below 512MB (such as Micro or Nano plans) is highly likely to trigger kernel Out-Of-Memory (OOM) crashes (Exit Code 137). It is strongly recommended to use <strong>Unlimited</strong> or custom tiers with at least 512MB RAM for all databases.
          </div>
        </div>
      )}
    </div>
  );
}

//  Main ProjectDetail 
export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [services, setServices] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState('configuration');
  const [activeSvc, setActiveSvc] = useState(null);
  const [deletingSvc, setDeletingSvc] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [stoppingSvc, setStoppingSvc] = useState(null);
  const [loadingStates, setLoadingStates] = useState({
    redeploying: null,
    restarting: null,
    stopping: null,
    deleting: null,
  });
  const [pendingRedeploy, setPendingRedeploy] = useState(false);

  useEffect(() => {
    setPendingRedeploy(activeSvc ? hasPendingRedeploy(activeSvc) : false);
  }, [activeSvc]);

  const load = useCallback(async () => {
    try {
      const [proj, svcs, doms] = await Promise.all([
        projectsApi.get(id),
        servicesApi.listByProject(id),
        domainsApi.list(),
      ]);
      setProject(proj?.data || proj);
      setServices(svcs || []);
      setDomains(doms?.data || doms || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id]);

  const patchServiceStatus = (svcId, status) => {
    setServices(prev => prev.map(s => (s.id === svcId ? { ...s, status } : s)));
  };

  const waitForServiceStatus = async (svcId, targetStatuses, timeoutMs = 180000) => {
    const targets = Array.isArray(targetStatuses) ? targetStatuses : [targetStatuses];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await servicesApi.get(svcId);
        const svc = res?.data || res;
        if (svc?.status && targets.includes(svc.status)) {
          return svc;
        }
      } catch (_) { /* retry */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Operation timed out waiting for service status');
  };

  const refreshService = async (svcId) => {
    const res = await servicesApi.get(svcId);
    const fresh = res?.data || res;
    if (fresh?.id) {
      setServices(prev => prev.map(s => (s.id === svcId ? { ...s, ...fresh } : s)));
    }
    return fresh;
  };

  const isActionBusy = (svcId) =>
    loadingStates.redeploying === svcId ||
    loadingStates.restarting === svcId ||
    loadingStates.stopping === svcId ||
    loadingStates.deleting === svcId;


  useEffect(() => {
    load();
    if (activeTab !== 'configuration' && activeTab !== 'resources' && activeTab !== 'envvars') {
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }
  }, [load, activeTab]);

  const handleDeploy = async (svcId) => {
    const svc = services.find(s => s.id === svcId);
    setLoadingStates(prev => ({ ...prev, redeploying: svcId }));
    patchServiceStatus(svcId, 'deploying');
    toast.promise(
      (async () => {
        if (svc?.type === 'app') {
          const existing = domains.find(d => d.service === svc.name && d.project === project?.name);
          if (!existing) {
            const host = window.location.hostname.split(':')[0];
            const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
            try {
              await domainsApi.create({
                domain: `${randomStr}.${host}.sslip.io`,
                service: svc.name,
                project: project?.name || '',
                direction: 'both',
              });
            } catch (_) { }
          }
        }
        await servicesApi.deploy(svcId);
        setActiveTab('deployments');
        await waitForServiceStatus(svcId, ['running', 'error', 'stopped', 'crashed', 'oom_killed']);
        clearPendingRedeploy(svcId);
        setPendingRedeploy(false);
        await refreshService(svcId);
        await load();
      })(),
      {
        loading: 'Redeploying service...',
        success: 'Service redeployed successfully!',
        error: (err) => err.message || 'Failed to redeploy service',
      }
    ).finally(() => {
      setLoadingStates(prev => ({ ...prev, redeploying: null }));
    });
  };

  const handleStop = (svcId) => {
    const svc = services.find(s => s.id === svcId);
    if (svc) {
      setStoppingSvc(svc);
    }
  };

  const confirmStop = async () => {
    if (!stoppingSvc) return;
    const svcId = stoppingSvc.id;
    const prevStatus = stoppingSvc.status;
    setLoadingStates(prev => ({ ...prev, stopping: svcId }));
    patchServiceStatus(svcId, 'stopped');
    toast.promise(
      (async () => {
        await servicesApi.stop(svcId);
        await refreshService(svcId);
        await load();
      })(),
      {
        loading: 'Stopping service...',
        success: 'Service stopped successfully!',
        error: (err) => {
          patchServiceStatus(svcId, prevStatus);
          return err.message || 'Failed to stop service';
        },
      }
    ).finally(() => {
      setLoadingStates(prev => ({ ...prev, stopping: null }));
      setStoppingSvc(null);
    });
  };

  const handleRestart = async (svcId) => {
    setLoadingStates(prev => ({ ...prev, restarting: svcId }));
    patchServiceStatus(svcId, 'deploying');
    toast.promise(
      (async () => {
        await servicesApi.restart(svcId);
        setActiveTab('logs');
        await waitForServiceStatus(svcId, ['running', 'error', 'stopped', 'crashed']);
        await refreshService(svcId);
        await load();
      })(),
      {
        loading: 'Restarting service...',
        success: 'Service restarted successfully!',
        error: (err) => err.message || 'Failed to restart service',
      }
    ).finally(() => {
      setLoadingStates(prev => ({ ...prev, restarting: null }));
    });
  };

  const handleDelete = (svcId) => {
    const svc = services.find(s => s.id === svcId);
    if (svc) {
      setDeletingSvc(svc);
      setDeleteConfirmName('');
    }
  };

  const confirmDelete = async () => {
    if (!deletingSvc) return;
    const svcId = deletingSvc.id;
    setLoadingStates(prev => ({ ...prev, deleting: svcId }));
    toast.promise(
      (async () => {
        await servicesApi.delete(svcId);
        setServices(s => s.filter(x => x.id !== svcId));
        if (activeSvc === svcId) setActiveSvc(null);
        setDeletingSvc(null);
        await load();
      })(),
      {
        loading: 'Deleting service and removing files from disk...',
        success: 'Service deleted completely!',
        error: (err) => err.message || 'Failed to delete service',
      }
    ).finally(() => {
      setLoadingStates(prev => ({ ...prev, deleting: null }));
    });
  };

  const handleCreated = (svc) => {
    setServices(s => [svc, ...s]);
    setShowAddForm(false);
    setActiveSvc(svc.id);
    setActiveTab('deployments');
  };

  const { stacks, groupedIds } = buildServiceStacks(services);
  const apps = services.filter(s => s.type === 'app' && !groupedIds.has(s.id));
  const dbs = services.filter(s => s.type === 'database' && !groupedIds.has(s.id));

  const standaloneApps = services.filter(s => s.type === 'app' && !groupedIds.has(s.id));
  const standaloneDbs = services.filter(s => s.type === 'database' && !groupedIds.has(s.id));
  const selectedSvc = services.find(s => s.id === activeSvc);
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', stopped: 'var(--text-muted)', idle: 'var(--text-muted)', creating: 'var(--yellow)', oom_killed: 'var(--red)', crashed: 'var(--red)' };
  const getSvcStatusColor = (status) => {
    return Object.prototype.hasOwnProperty.call(statusColor, status) ? statusColor[status] : 'var(--text-muted)';
  };
  const getStackStatus = (stack) => {
    const members = [stack.app, ...(stack.databases || [])].filter(Boolean);
    if (members.some(s => ['error', 'crashed', 'oom_killed'].includes(s.status))) return 'error';
    if (members.some(s => ['deploying', 'building', 'creating'].includes(s.status))) return 'deploying';
    if (members.length > 0 && members.every(s => s.status === 'running')) return 'running';
    return stack.app?.status || 'idle';
  };
  const monitoringRows = [
    ...stacks.map(stack => ({
      id: `stack-${stack.id}`,
      kind: 'stack',
      name: stack.name,
      typeLabel: 'Service Stack',
      status: getStackStatus(stack),
      displaySvc: stack.app,
      members: [stack.app, ...(stack.databases || [])].filter(Boolean),
      onOpen: () => {
        setActiveSvc(stack.app.id);
        setActiveTab('configuration');
      },
    })),
    ...services.filter(s => !groupedIds.has(s.id)).map(svc => ({
      id: svc.id,
      kind: 'service',
      name: svc.name,
      typeLabel: svc.type === 'database' ? 'Database' : 'Application',
      status: svc.status,
      displaySvc: svc,
      members: [svc],
      onOpen: () => {
        setActiveSvc(svc.id);
        setActiveTab(svc.type === 'database' ? 'connection' : 'configuration');
      },
    })),
  ];

  if (loading) return <div className="page-content"><div className="spinner" /></div>;

  if (activeSvc && selectedSvc) {
    const matchedDomain = (domains || []).find(d => d.service === selectedSvc.name && d.project === project?.name);
    let httpUrl = null;
    let httpsUrl = null;
    if (matchedDomain) {
      const cleanDomain = matchedDomain.domain.replace(/^https?:\/\//i, '');
      httpUrl = `http://${cleanDomain}`;
      if (!cleanDomain.includes('.sslip.io')) {
        httpsUrl = `https://${cleanDomain}`;
      }
    } else if ((selectedSvc.git_builder === 'docker-compose' || selectedSvc.docker_compose_content) && selectedSvc.type === 'app') {
      try {
        const parsed = yamlLoad(selectedSvc.docker_compose_content || '');
        if (parsed?.services) {
          for (const cfg of Object.values(parsed.services as Record<string, { ports?: string[] }>)) {
            if (cfg.ports && cfg.ports.length > 0) {
              const hp = String(cfg.ports[0]).split(':')[0].replace(/[^0-9]/g, '');
              if (hp) { httpUrl = `http://${window.location.hostname}:${hp}`; break; }
            }
          }
        }
      } catch { }
      if (!httpUrl && selectedSvc.port > 0) httpUrl = `http://${window.location.hostname}:${selectedSvc.port}`;
    } else if (selectedSvc.port > 0 && selectedSvc.type === 'app') {
      httpUrl = `http://${window.location.hostname}:${selectedSvc.port}`;
    }

    return (
      <div className="page-content fade-in">
        {/* Resource Header */}
        <div className="page-header" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Breadcrumbs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
              <div
                onClick={() => navigate('/projects')}
                style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
                className="hover-text-accent"
              >
                Projects
              </div>
              <ChevronRight size={14} />
              <div
                onClick={() => setActiveSvc(null)}
                style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
                className="hover-text-accent"
              >
                {project?.name || 'Project'}
              </div>
              <ChevronRight size={14} />
              <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {selectedSvc.name}
              </div>
            </div>

            {/* Title & Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <ServiceLogo type={selectedSvc.type} name={selectedSvc.name} image={selectedSvc.image} builder={selectedSvc.git_builder} size={28} />
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)', lineHeight: 1 }}>{selectedSvc.name}</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>localhost</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: getSvcStatusColor(selectedSvc.status) }} />
              <span style={{ fontSize: '1.05rem', color: getSvcStatusColor(selectedSvc.status), fontWeight: 600, textTransform: 'capitalize' }}>{selectedSvc.status}</span>
            </div>

            {/* Metadata Subtitle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '20px' }}>
                <Package size={14} color="var(--accent)" /> {selectedSvc.type === 'database' ? `${selectedSvc.image || 'Database'}` : 'Application'}
              </span>
              {selectedSvc.git_repo_url && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '20px' }}>
                  <GitBranch size={14} color="var(--blue)" /> {selectedSvc.git_repo_url.replace('https://github.com/', '')} ({selectedSvc.git_branch})
                </span>
              )}
              {(() => {
                const isComposePort = selectedSvc.git_builder === 'docker-compose' || selectedSvc.docker_compose_content;
                if (isComposePort) {
                  try {
                    const parsed = yamlLoad(selectedSvc.docker_compose_content || '');
                    const ports: string[] = [];
                    if (parsed?.services) {
                      for (const cfg of Object.values(parsed.services as Record<string, { ports?: string[] }>)) {
                        if (cfg.ports) ports.push(...cfg.ports.map(p => String(p).split(':')[0].replace(/[^0-9]/g, '')).filter(Boolean));
                      }
                    }
                    const uniq = [...new Set(ports)].slice(0, 3);
                    if (uniq.length > 0) {
                      return (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '20px' }}>
                          <Globe size={14} color="var(--green)" /> :{uniq.join(', :')}
                        </span>
                      );
                    }
                  } catch { }
                }
                if (selectedSvc.port > 0) {
                  return (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '20px' }}>
                      <Globe size={14} color="var(--green)" /> :{selectedSvc.port}
                    </span>
                  );
                }
                return null;
              })()}
              {httpUrl && (
                <a href={httpUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(79,110,247,0.1)', color: 'var(--accent)', padding: '3px 10px', borderRadius: '20px', textDecoration: 'none', fontWeight: 500, border: '1px solid rgba(79,110,247,0.2)' }}>
                  <ExternalLink size={13} /> {httpUrl}
                </a>
              )}
              {httpsUrl && (
                <a href={httpsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(79,110,247,0.1)', color: 'var(--accent)', padding: '3px 10px', borderRadius: '20px', textDecoration: 'none', fontWeight: 500, border: '1px solid rgba(79,110,247,0.2)' }}>
                  <ExternalLink size={13} /> {httpsUrl}
                </a>
              )}
              {selectedSvc.resource_tier && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '20px' }}>
                  <Cpu size={14} color="var(--text-secondary)" /> Tier: <span style={{ textTransform: 'capitalize' }}>{selectedSvc.resource_tier}</span>
                </span>
              )}
            </div>

            {selectedSvc.status === 'oom_killed' && (
              <div style={{ marginTop: 16, padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: 8 }}>
                <h4 style={{ margin: '0 0 8px 0', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} /> Out of Memory (OOM) Killed
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  This container was killed by the operating system because it exceeded the RAM limit of its configured resource tier ({selectedSvc.resource_tier}). Please upgrade the resource tier in Settings and restart the service.
                </p>
              </div>
            )}
            {selectedSvc.status === 'crashed' && (
              <div style={{ marginTop: 16, padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: 8 }}>
                <h4 style={{ margin: '0 0 8px 0', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} /> Container Crashed
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  This container exited unexpectedly. Check the container logs for more details on the error.
                </p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="solid"
              color="amber"
              size="md"
              onClick={() => handleDeploy(selectedSvc.id)}
              icon={Play}
              style={{ fontWeight: 600 }}
              loading={loadingStates.redeploying === selectedSvc.id}
              disabled={isActionBusy(selectedSvc.id)}
            >
              Redeploy
            </Button>
            <Button
              variant="outline"
              color="amber"
              size="md"
              onClick={() => handleRestart(selectedSvc.id)}
              icon={RefreshCw}
              loading={loadingStates.restarting === selectedSvc.id}
              disabled={isActionBusy(selectedSvc.id)}
            >
              Restart
            </Button>
            {['running', 'deploying', 'error', 'crashed', 'oom_killed'].includes(selectedSvc.status) && (
              <Button
                variant="outline"
                color="red"
                size="md"
                onClick={() => handleStop(selectedSvc.id)}
                icon={X}
                loading={loadingStates.stopping === selectedSvc.id}
                disabled={isActionBusy(selectedSvc.id)}
              >
                Stop
              </Button>
            )}
            <Button
              variant="ghost"
              size="md"
              style={{ color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
              onClick={() => handleDelete(selectedSvc.id)}
              icon={Trash2}
              loading={loadingStates.deleting === selectedSvc.id}
              disabled={isActionBusy(selectedSvc.id)}
            >
              Delete
            </Button>
          </div>
        </div>

        {pendingRedeploy && (
          <div
            className="card"
            style={{
              marginBottom: '1rem',
              padding: '0.85rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              <AlertCircle size={18} color="var(--amber)" />
              <span>Configuration was saved. <strong>Redeploy</strong> to apply changes to the running container.</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="solid" color="amber" size="sm" icon={Play} onClick={() => handleDeploy(selectedSvc.id)} loading={loadingStates.redeploying === selectedSvc.id}>
                Redeploy now
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { clearPendingRedeploy(selectedSvc.id); setPendingRedeploy(false); }}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Service Details — left nav + content (Coolify-style grouped) */}
        {(() => {
          const isCompose = selectedSvc.git_builder === 'docker-compose' || selectedSvc.docker_compose_content;
          return (
            <div style={{ display: 'flex', gap: '1.25rem', minHeight: 500, alignItems: 'flex-start' }}>
              <ServiceSidebar service={selectedSvc} activeTab={activeTab} onSelect={setActiveTab} />

              {/* Right content */}
              <div className="card hover-glow" style={{ flex: 1, minWidth: 0, padding: '1.5rem' }}>
                {activeTab === 'connection' && <ConnectionDetailsPanel service={selectedSvc} />}
                {activeTab === 'deployments' && <DeploymentsPanel serviceId={activeSvc} />}
                {activeTab === 'logs' && <ContainerLogsPanel serviceId={activeSvc} services={services} selectedSvc={selectedSvc} />}
                {activeTab === 'terminal' && (
                  <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading terminal...</div>}>
                    <ContainerTerminalPanel service={selectedSvc} />
                  </Suspense>
                )}
                {activeTab === 'monitoring' && (
                  <MonitoringPanel
                    serviceId={activeSvc}
                    initialMetrics={{
                      cpu_percent: selectedSvc.cpu_percent ?? 0,
                      memory_usage: selectedSvc.memory_usage || '0 B',
                    }}
                  />
                )}
                {activeTab === 'resources' && <ResourceLimitsPanel service={selectedSvc} onUpdate={load} />}
                {activeTab === 'volumes' && (
                  isCompose ? (
                    <div>
                      <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: '0.82rem', color: '#facc15', marginBottom: 16 }}>
                        Service volume mounts are read-only here. Edit the Docker Compose file and reload it to change volumes.
                      </div>
                      {(() => {
                        try {
                          const parsed = yamlLoad(selectedSvc.docker_compose_content || '');
                          const entries = [];
                          if (parsed?.services) {
                            for (const [svcName, cfg] of Object.entries(parsed.services)) {
                              const vols = (cfg as { volumes?: string[] }).volumes || [];
                              for (const v of vols) {
                                const str = String(v);
                                const parts = str.split(':');
                                const src = parts.length >= 2 ? parts[0] : '';
                                const dst = parts.length >= 2 ? parts[1].split(':')[0] : parts[0];
                                entries.push({ svcName, src: src || '—', dst });
                              }
                            }
                          }
                          if (entries.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>No volumes defined in compose file.</div>;
                          // Group by service like Coolify
                          const bySvc: Record<string, typeof entries> = {};
                          for (const e of entries) { (bySvc[e.svcName] = bySvc[e.svcName] || []).push(e); }
                          return Object.entries(bySvc).map(([svcName, vols]) => (
                            <div key={svcName} style={{ marginBottom: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}><HardDrive size={14} /> {svcName}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 999 }}>Volumes ({vols.length})</span>
                              </div>
                              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead><tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}><th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Source Path</th><th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Destination Path</th></tr></thead>
                                  <tbody>
                                    {vols.map((v, i) => (
                                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '10px 12px', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{v.src}</td>
                                        <td style={{ padding: '10px 12px', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{v.dst}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ));
                        } catch {
                          return <div style={{ padding: '1rem', color: 'var(--red)', fontSize: '0.85rem' }}>Invalid compose file</div>;
                        }
                      })()}
                    </div>
                  ) : (
                    <VolumesPanel service={selectedSvc} onUpdate={load} />
                  )
                )}
                {activeTab === 'webhooks' && (selectedSvc.github_app_id || (selectedSvc.git_repo_url && !selectedSvc.git_repo_url.startsWith('file://'))) && (
                  <WebhookPanel serviceId={activeSvc} githubAppId={selectedSvc.github_app_id} gitRepoUrl={selectedSvc.git_repo_url} />
                )}
                {activeTab === 'files' && selectedSvc.git_repo_url?.startsWith('file://') && <SourceFilesPanel service={selectedSvc} />}
                {activeTab === 'configuration' && <SettingsPanel service={selectedSvc} project={project} domains={domains} services={services} onUpdate={load} />}
                {activeTab === 'backup' && <BackupRestorePanel service={selectedSvc} />}
                {activeTab === 'envvars' && (
                  isCompose ? (
                    <ComposeEnvVarsPanel service={selectedSvc} onUpdate={load} />
                  ) : (
                    <EnvVarsPanel serviceId={activeSvc} />
                  )
                )}
                {activeTab === 'domains' && (
                  <div>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Domains</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>Domains routed to this service via Traefik.</p>
                    {domains.filter(d => d.service === selectedSvc.name && d.project === project?.name).length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>No domains assigned. Add one in the project Domains page.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {domains.filter(d => d.service === selectedSvc.name && d.project === project?.name).map(d => (
                          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                            <Globe size={14} style={{ color: 'var(--accent)' }} />
                            <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.85rem' }}>{d.domain}</a>
                            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.type || 'auto'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'compose' && isCompose && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Docker Compose file</h3>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('configuration')}>Edit Compose file</Button>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <CodeEditor value={selectedSvc.docker_compose_content || ''} onChange={() => { }} language="yaml" style={{ height: 260 }} readOnly />
                    </div>

                    <div>
                      <h3 style={{ margin: '16px 0 6px', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Compose resources</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Applications and databases defined in this service.</p>
                      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Resource</th>
                              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Image</th>
                              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              try {
                                const parsed = yamlLoad(selectedSvc.docker_compose_content || '');
                                const svcs = parsed?.services ? Object.entries(parsed.services) : [];
                                if (svcs.length === 0) return <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No services defined</td></tr>;
                                return svcs.map(([name, cfg]) => (
                                  <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 14px', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}><Package size={14} /> {name}</td>
                                    <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>{(cfg as { image?: string }).image || '—'}</td>
                                    <td style={{ padding: '10px 14px' }}><span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 999, background: selectedSvc.status === 'running' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: selectedSvc.status === 'running' ? '#22c55e' : '#ef4444' }}>{selectedSvc.status}</span></td>
                                  </tr>
                                ));
                              } catch {
                                return <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--red)' }}>Invalid compose file</td></tr>;
                              }
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Delete Service Modal */}
        <Modal open={!!deletingSvc} onClose={() => setDeletingSvc(null)} title="Delete Service">
          <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <p style={{ color: 'var(--red)', marginBottom: 12 }}>
              <strong>Warning:</strong> Deleting this service will permanently destroy its data, containers, and entirely remove it from the disk space. This cannot be undone.
            </p>
            <p style={{ marginBottom: 8 }}>
              Please type <strong>{deletingSvc?.name}</strong> to confirm.
            </p>
            <input
              className="form-input"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={deletingSvc?.name}
              style={{ width: '100%' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
              <Button variant="ghost" onClick={() => setDeletingSvc(null)} disabled={loadingStates.deleting === deletingSvc?.id}>Cancel</Button>
              <Button
                variant="solid"
                style={{ background: 'var(--red)', color: '#fff' }}
                onClick={confirmDelete}
                disabled={deleteConfirmName !== deletingSvc?.name || loadingStates.deleting === deletingSvc?.id}
                loading={loadingStates.deleting === deletingSvc?.id}
              >
                I understand, delete this service
              </Button>
            </div>
          </div>
        </Modal>

        {/* Stop Service Modal */}
        <Modal open={!!stoppingSvc} onClose={() => setStoppingSvc(null)} title="Stop Service">
          <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <p style={{ marginBottom: 20 }}>
              Are you sure you want to stop <strong>{stoppingSvc?.name}</strong>? The service will stop running and become unavailable.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setStoppingSvc(null)} disabled={loadingStates.stopping === stoppingSvc?.id}>Cancel</Button>
              <Button
                variant="solid"
                style={{ background: 'var(--red)', color: '#fff' }}
                onClick={confirmStop}
                disabled={loadingStates.stopping === stoppingSvc?.id}
                loading={loadingStates.stopping === stoppingSvc?.id}
              >
                Stop Service
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="page-content fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Projects</span>
            <ChevronRight size={14} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{project?.name}</span>
          </div>
          <p className="page-subtitle">{project?.description || 'Project environment'}</p>
        </div>
        {!showAddForm && (
          <Button variant="primary" onClick={() => setShowAddForm(true)} icon={Plus}>New Resource</Button>
        )}
      </div>

      {showAddForm ? (
        <AddServiceForm
          domains={domains}
          services={services}
          projectId={id}
          projectName={project?.name}
          onCancel={() => setShowAddForm(false)}
          onCreated={handleCreated}
        />
      ) : (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Applications', val: apps.length, icon: Package, color: 'var(--accent)' },
              { label: 'Databases', val: dbs.length, icon: Database, color: 'var(--blue)' },
              { label: 'Running', val: services.filter(s => s.status === 'running').length, icon: Play, color: 'var(--green)' },
            ].map(st => (
              <div key={st.label} className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${st.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <st.icon size={28} color={st.color} />
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{st.val}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{st.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Project Monitoring Dashboard */}
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Cpu size={20} color="var(--accent)" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Project Resource Monitoring</h3>
              </div>
              <span className="badge badge-amber" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} className="pulse" />
                Live
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CPU</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Memory</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Disk</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Network</th>
                  </tr>
                </thead>
                <tbody>
                  {monitoringRows.map(row => {
                    const svc = row.displaySvc;
                    const hasMetrics = row.status === 'running' && (svc.cpu_percent > 0 || svc.memory_usage);
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={row.onOpen}
                      >
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ServiceLogo type={svc.type} name={svc.name} image={svc.image} builder={svc.git_builder} size={20} />
                            <div>
                              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{row.name}</span>
                              {row.kind === 'stack' && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  {row.members.map(member => member.name).join(' + ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {row.typeLabel}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: getSvcStatusColor(row.status) }} />
                            <span style={{ fontSize: '0.8rem', color: getSvcStatusColor(row.status), textTransform: 'capitalize' }}>
                              {row.status}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {hasMetrics ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${Math.min(svc.cpu_percent || 0, 100)}%`,
                                  height: '100%',
                                  background: (svc.cpu_percent || 0) > 80 ? 'var(--red)' : (svc.cpu_percent || 0) > 50 ? 'var(--yellow)' : 'var(--green)',
                                  borderRadius: 3
                                }} />
                              </div>
                              <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{(svc.cpu_percent || 0).toFixed(1)}%</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {hasMetrics ? (
                            <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{svc.memory_usage}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: activeSvc ? '1fr 380px' : '1fr', gap: '1rem' }}>
            {/* Left: service list */}
            <div>
              {stacks.length > 0 && (
                <>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Service Stacks</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {stacks.map(st => (
                      <StackCard
                        key={st.id}
                        stack={st}
                        setActiveSvc={setActiveSvc}
                        setActiveTab={setActiveTab}
                      />
                    ))}
                  </div>
                </>
              )}

              {standaloneApps.length > 0 && (
                <>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Applications</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {standaloneApps.map(s => (
                      <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('configuration'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
                        <ServiceCard svc={s} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {standaloneDbs.length > 0 && (
                <>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Databases</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    {standaloneDbs.map(s => (
                      <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('connection'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
                        <ServiceCard svc={s} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {services.length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                  <div className="empty-icon" style={{ margin: '0 auto 1rem' }}><Package size={28} /></div>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 8 }}>No resources yet</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Add an app or database to get started</p>
                  <Button variant="primary" onClick={() => setShowAddForm(true)} icon={Plus}>Add Resource</Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Delete Service Modal */}
      <Modal open={!!deletingSvc} onClose={() => setDeletingSvc(null)} title="Delete Service">
        <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <p style={{ color: 'var(--red)', marginBottom: 12 }}>
            <strong>Warning:</strong> Deleting this service will permanently destroy its data, containers, and entirely remove it from the disk space. This cannot be undone.
          </p>
          <p style={{ marginBottom: 8 }}>
            Please type <strong>{deletingSvc?.name}</strong> to confirm.
          </p>
          <input
            className="form-input"
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={deletingSvc?.name}
            style={{ width: '100%' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
            <Button variant="ghost" onClick={() => setDeletingSvc(null)} disabled={loadingStates.deleting === deletingSvc?.id}>Cancel</Button>
            <Button
              variant="solid"
              style={{ background: 'var(--red)', color: '#fff' }}
              onClick={confirmDelete}
              disabled={deleteConfirmName !== deletingSvc?.name || loadingStates.deleting === deletingSvc?.id}
              loading={loadingStates.deleting === deletingSvc?.id}
            >
              I understand, delete this service
            </Button>
          </div>
        </div>
      </Modal>

      {/* Stop Service Modal */}
      <Modal open={!!stoppingSvc} onClose={() => setStoppingSvc(null)} title="Stop Service">
        <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <p style={{ marginBottom: 20 }}>
            Are you sure you want to stop <strong>{stoppingSvc?.name}</strong>? The service will stop running and become unavailable.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setStoppingSvc(null)} disabled={loadingStates.stopping === stoppingSvc?.id}>Cancel</Button>
            <Button
              variant="solid"
              style={{ background: 'var(--red)', color: '#fff' }}
              onClick={confirmStop}
              disabled={loadingStates.stopping === stoppingSvc?.id}
              loading={loadingStates.stopping === stoppingSvc?.id}
            >
              Stop Service
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

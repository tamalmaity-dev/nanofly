import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { servicesApi, projectsApi, domainsApi, filesApi, githubApi, terminalWsUrl } from '../api/client';
import { Plus, Play, Trash2, RefreshCw, ChevronRight, GitBranch, Package, Database, Globe, Settings, Eye, EyeOff, Copy, X, Check, ExternalLink, Cpu, MemoryStick, Folder, Key, Lock, FileCode, Sliders, Upload, FolderPlus, FilePlus, ArrowLeft, Save, FileText, TerminalSquare, AlertCircle, Info } from 'lucide-react';
import { Modal, Tabs, TabsContent, Button, SelectRoot, SelectTrigger, SelectContent, SelectItem, Tooltip, useToast } from '../components/ui';
import CodeEditor from '../components/CodeEditor';
import { ServiceLogo, ResourceIcon } from '../components/ServiceLogo';

// Lazy-loaded heavy panels (xterm + recharts only downloaded when tab is opened)
const MonitoringPanel = React.lazy(() => import('../components/panels/MonitoringPanel'));
const ContainerTerminalPanel = React.lazy(() => import('../components/panels/TerminalPanel'));


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


// Extracted to components/ServiceLogo.jsx
const RUNTIME_VERSIONS = {
  node: [
    { value: 'node:24-alpine', label: 'Node.js 24 Alpine (Latest)' },
    { value: 'node:22-alpine', label: 'Node.js 22 Alpine (Recommended)' },
    { value: 'node:20-alpine', label: 'Node.js 20 (LTS)' },
    { value: 'node:18-alpine', label: 'Node.js 18 (LTS)' },
    { value: 'node:16-alpine', label: 'Node.js 16' },
  ],

  python: [
    { value: 'python:3.11-slim', label: 'Python 3.11 Slim (Recommended)' },
    { value: 'python:3.11-alpine', label: 'Python 3.11 Alpine ' },
    { value: 'python:3.14-slim', label: 'Python 3.14 Slim (Latest)' },
    { value: 'python:3.14-alpine', label: 'Python 3.14 Alpine (Latest)' },
    { value: 'python:3.13-slim', label: 'Python 3.13 Slim' },
    { value: 'python:3.13-alpine', label: 'Python 3.13 Alpine' },
    { value: 'python:3.12-slim', label: 'Python 3.12 Slim' },
    { value: 'python:3.12-alpine', label: 'Python 3.12 Alpine' },
    { value: 'python:3.10-slim', label: 'Python 3.10 Slim' },
    { value: 'python:3.10-alpine', label: 'Python 3.10 Alpine' },
    { value: 'python:3.9-slim', label: 'Python 3.9 Slim' },
    { value: 'python:3.9-alpine', label: 'Python 3.9 Alpine' },
  ],


  go: [
    { value: 'golang:1.22-alpine', label: 'Go 1.22 (Recommended)' },
    { value: 'golang:1.23-alpine', label: 'Go 1.23 (Latest)' },
    { value: 'golang:1.21-alpine', label: 'Go 1.21' },
    { value: 'golang:1.20-alpine', label: 'Go 1.20' },
  ],
  php: [
    { value: 'php:8.2-apache', label: 'PHP 8.2 (Recommended)' },
    { value: 'php:8.3-apache', label: 'PHP 8.3 (Latest)' },
    { value: 'php:8.1-apache', label: 'PHP 8.1' },
    { value: 'php:8.0-apache', label: 'PHP 8.0' },
    { value: 'php:7.4-apache', label: 'PHP 7.4' },
  ]
};

const parseBuilderValue = (val) => {
  if (!val || val === 'auto' || val === 'dockerfile' || val === 'static') {
    return { type: val || 'auto', version: '' };
  }
  if (val.includes(':')) {
    const parts = val.split(':');
    let type = parts[0];
    if (type === 'golang') type = 'go';
    return { type, version: val };
  }
  return { type: val, version: '' };
};

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

//  Source Files Panel â”€
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
    setCurrentPath(rootPath);
  }, [rootPath]);

  useEffect(() => {
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
      for (let i = 0; i < selected.length; i++) {
        fd.append('files', selected[i]);
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

    let accum = current.startsWith('/') ? '' : '';
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
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let pass = '';
  for (let i = 0; i < 16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  return pass;
};

//  Add Service Form 
function AddServiceForm({ projectId, projectName, onCancel, onCreated }) {
  const [step, setStep] = useState('type'); // type | config
  const [type, setType] = useState('app'); // app | database
  const [subType, setSubType] = useState('docker'); // docker | github
  const [dbType, setDbType] = useState('postgres:18');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [githubApps, setGithubApps] = useState([]);

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
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (subType === 'local' && !form.localPath.trim()) { setError('Server folder path is required'); return; }
    if (subType === 'github' && !form.gitUrl.trim()) { setError('Repository URL is required'); return; }
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
          git_repo_url: subType === 'github' ? form.gitUrl.trim() : '',
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

      // Auto-register a sslip.io domain for app services
      if (svc && type !== 'database') {
        const svcData = svc.data || svc;
        const port = Number(form.port) || 0;
        const host = window.location.hostname;
        const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
        const autoDomain = `${randomStr}.${host}.sslip.io`;
        try {
          await domainsApi.create({
            domain: autoDomain,
            service: svcData.name || form.name.trim(),
            project: projectName || '',
            direction: 'both',
          });
        } catch (_) { /* domain already exists or conflict, skip */ }

        // Auto-trigger first deploy
        try { await servicesApi.deploy(svcData.id); } catch (_) { }
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
      if (resource.id === 'dockerfile' || resource.id === 'docker-compose') {
        sub = 'local';
      }
      setSubType(sub);
      setIsPrivate(resource.isPrivate || false);
      setForm(f => {
        const defaultPath = (resource.id === 'dockerfile' || resource.id === 'docker-compose')
          ? `/opt/nanofly/apps/${resource.defaultName}`
          : f.localPath;
        return {
          ...f,
          name: resource.defaultName || '',
          image: resource.defaultImage || '',
          port: resource.defaultPort || '',
          gitBuilder: (resource.id === 'dockerfile' || resource.id === 'docker-compose') ? resource.id : (resource.defaultBuilder || 'auto'),
          localPath: defaultPath,
          useVenv: (resource.id === 'dockerfile' || resource.id === 'docker-compose') ? false : f.useVenv,
        };
      });
    } else {
      setType('database');
      const defaultVer = DB_VERSIONS[resource.dbType]?.[0] || resource.dbType;
      setDbType(defaultVer);
      setForm(f => ({
        ...f,
        name: `my-${resource.dbType}`,
      }));
    }
    setStep('config');
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
      defaultImage: 'wordpress:php8.2-apache',
      defaultPort: '8050'
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
      subType: 'docker',
      title: 'Dockerfile',
      desc: 'Deploy a custom Dockerfile build configuration directly without Git setup.',
      icon: 'ðŸ“„',
      defaultName: 'docker-app',
      defaultImage: 'nginx:alpine'
    },
    {
      id: 'docker-compose',
      type: 'app',
      subType: 'docker',
      title: 'Docker Compose Empty',
      desc: 'Deploy complex application stacks easily with custom multi-container Compose definitions.',
      icon: 'ðŸŽ›ï¸',
      defaultName: 'compose-app'
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
            {type === 'app' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(79,110,247,0.06)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(79,110,247,0.1)' }}>
                  <span style={{ fontSize: '1.1rem' }}>âš™ï¸</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Configuring {subType === 'github' ? 'Git Application' : subType === 'local' ? 'Local Folder Application' : 'Docker Application'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Setup the name, local path, and deployment configuration.
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Service Name *</label>
                  <input className="form-input" placeholder="e.g. production-api" value={form.name} onChange={set('name')} autoFocus />
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

                {subType === 'docker' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Docker Image *</label>
                      <input className="form-input" placeholder="e.g. nginx:alpine" value={form.image} onChange={set('image')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Host Port (Optional)</label>
                      <input className="form-input" placeholder="e.g. 80 or empty for random" value={form.port} onChange={set('port')} />
                    </div>
                  </>
                ) : subType === 'local' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Server Folder Path *</label>
                      <input className="form-input" placeholder="/opt/apps/my-python-app" value={form.localPath} onChange={set('localPath')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Exposed Container Port</label>
                      <input className="form-input" placeholder="e.g. 3000 or 8000" value={form.port} onChange={set('port')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Build Type / Runtime</label>
                      <SelectRoot value={parseBuilderValue(form.gitBuilder).type} onValueChange={val => {
                        let finalVal = val;
                        if (val === 'node') finalVal = 'node:20-alpine';
                        else if (val === 'python') finalVal = 'python:3.11-slim';
                        else if (val === 'go') finalVal = 'golang:1.22-alpine';
                        else if (val === 'php') finalVal = 'php:8.2-apache';
                        setForm(f => ({
                          ...f,
                          gitBuilder: finalVal,
                          useVenv: (val === 'dockerfile' || val === 'docker-compose') ? false : f.useVenv,
                        }));
                      }}>
                        <SelectTrigger style={{ width: '100%' }} />
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect (Recommended)</SelectItem>
                          <SelectItem value="node">Node.js</SelectItem>
                          <SelectItem value="go">Go (Golang)</SelectItem>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="php">PHP</SelectItem>
                          <SelectItem value="static">HTML / Static Website</SelectItem>
                          <SelectItem value="dockerfile">Dockerfile</SelectItem>
                          <SelectItem value="docker-compose">Docker Compose</SelectItem>
                          <SelectItem value="nixpacks">Nixpacks</SelectItem>
                        </SelectContent>
                      </SelectRoot>
                    </div>
                    {parseBuilderValue(form.gitBuilder).type === 'dockerfile' && (
                      <div className="form-group">
                        <label className="form-label">Dockerfile Content</label>
                        <CodeEditor
                          value={form.dockerfileContent}
                          onChange={val => setForm(f => ({ ...f, dockerfileContent: val }))}
                          language="docker"
                          placeholder={`FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nCMD ["python", "app.py"]`}
                          style={{ height: '220px' }}
                        />
                      </div>
                    )}
                    {parseBuilderValue(form.gitBuilder).type === 'docker-compose' && (
                      <div className="form-group">
                        <label className="form-label">Docker Compose Definition (docker-compose.yml)</label>
                        <CodeEditor
                          value={form.dockerComposeContent}
                          onChange={val => setForm(f => ({ ...f, dockerComposeContent: val }))}
                          language="yaml"
                          placeholder={`version: '3.8'\nservices:\n  web:\n    build: .\n    ports:\n      - "80:80"`}
                          style={{ height: '220px' }}
                        />
                      </div>
                    )}
                    {['node', 'python', 'go', 'php'].includes(parseBuilderValue(form.gitBuilder).type) && (
                      <div className="form-group">
                        <label className="form-label">Runtime Version</label>
                        <SelectRoot value={form.gitBuilder} onValueChange={val => setForm(f => ({ ...f, gitBuilder: val }))}>
                          <SelectTrigger style={{ width: '100%' }} />
                          <SelectContent>
                            {RUNTIME_VERSIONS[parseBuilderValue(form.gitBuilder).type].map(v => (
                              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </SelectRoot>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">App Directory</label>
                        <input className="form-input" placeholder="Blank for folder root, or src/app" value={form.appDirectory} onChange={set('appDirectory')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Run File</label>
                        <input className="form-input" placeholder="e.g. main.py, server.js" value={form.runFile} onChange={set('runFile')} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      {parseBuilderValue(form.gitBuilder).type === 'python' && (
                        <div className="form-group">
                          <label className="form-label">Requirements File</label>
                          <input className="form-input" placeholder="requirements.txt" value={form.requirementsFile} onChange={set('requirementsFile')} />
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label">Start Command Override</label>
                        <input className="form-input" placeholder="Blank auto-runs the selected file" value={form.startCommand} onChange={set('startCommand')} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Install Command Override</label>
                      <input className="form-input" placeholder="Blank installs dependencies" value={form.installCommand} onChange={set('installCommand')} />
                    </div>
                    {parseBuilderValue(form.gitBuilder).type === 'python' && (
                      <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                          <input type="checkbox" checked={form.useVenv} onChange={e => setForm(f => ({ ...f, useVenv: e.target.checked }))} />
                          Generate Python virtual environment inside the container
                        </label>
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Docker Run Arguments</label>
                      <input
                        className="form-input"
                        value={form.dockerArgs}
                        onChange={set('dockerArgs')}
                        placeholder="e.g. --privileged --device /dev/i2c-1"
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}
                      />
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Extra flags for <code>docker run</code>. Use for hardware access, custom networks, etc.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Repository URL *</label>
                      <input className="form-input" placeholder="e.g. https://github.com/username/repo" value={form.gitUrl} onChange={set('gitUrl')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Branch</label>
                      <input className="form-input" placeholder="main" value={form.branch} onChange={set('branch')} />
                    </div>
                    {isPrivate && (
                      selectedResourceId === 'git-private-key' ? (
                        <div className="form-group">
                          <label className="form-label">SSH Private Key *</label>
                          <textarea
                            className="form-input"
                            style={{ fontFamily: 'monospace', height: '120px', fontSize: '0.82rem' }}
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                            value={form.sshKey}
                            onChange={e => setForm(f => ({ ...f, sshKey: e.target.value }))}
                          />
                        </div>
                      ) : selectedResourceId === 'git-private-app' ? (
                        <div className="form-group">
                          <label className="form-label">Select GitHub App *</label>
                          <SelectRoot value={form.githubAppId} onValueChange={val => setForm(f => ({ ...f, githubAppId: val }))}>
                            <SelectTrigger style={{ width: '100%' }}>
                              {form.githubAppId ? githubApps.find(a => String(a.id) === String(form.githubAppId))?.name : "Select App..."}
                            </SelectTrigger>
                            <SelectContent>
                              {githubApps.length === 0 ? (
                                <SelectItem value="" disabled>No GitHub Apps configured. Go to Settings.</SelectItem>
                              ) : (
                                githubApps.map(app => (
                                  <SelectItem key={app.id} value={String(app.id)}>{app.name}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </SelectRoot>
                          {githubApps.length === 0 && (
                            <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Configure a GitHub App integration in the Settings page first.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="form-group">
                          <label className="form-label">Personal Access Token (GitHub Token)</label>
                          <input className="form-input" type="password" placeholder="ghp_xxxxxxxxxxxx" value={form.token} onChange={set('token')} />
                        </div>
                      )
                    )}
                    <div className="form-group">
                      <label className="form-label">Exposed Container Port</label>
                      <input className="form-input" placeholder="e.g. 3000" value={form.port} onChange={set('port')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Build Type / Runtime</label>
                      <SelectRoot value={parseBuilderValue(form.gitBuilder).type} onValueChange={val => {
                        let finalVal = val;
                        if (val === 'node') finalVal = 'node:20-alpine';
                        else if (val === 'python') finalVal = 'python:3.11-slim';
                        else if (val === 'go') finalVal = 'golang:1.22-alpine';
                        else if (val === 'php') finalVal = 'php:8.2-apache';
                        setForm(f => ({
                          ...f,
                          gitBuilder: finalVal,
                          useVenv: (val === 'dockerfile' || val === 'docker-compose') ? false : f.useVenv,
                        }));
                      }}>
                        <SelectTrigger style={{ width: '100%' }} />
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect (Recommended)</SelectItem>
                          <SelectItem value="node">Node.js</SelectItem>
                          <SelectItem value="go">Go (Golang)</SelectItem>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="php">PHP</SelectItem>
                          <SelectItem value="static">HTML / Static Website</SelectItem>
                          <SelectItem value="dockerfile">Dockerfile</SelectItem>
                          <SelectItem value="docker-compose">Docker Compose</SelectItem>
                          <SelectItem value="nixpacks">Nixpacks</SelectItem>
                        </SelectContent>
                      </SelectRoot>
                    </div>
                    {parseBuilderValue(form.gitBuilder).type === 'dockerfile' && (
                      <div className="form-group">
                        <label className="form-label">Dockerfile Content (If not in repository)</label>
                        <CodeEditor
                          value={form.dockerfileContent}
                          onChange={val => setForm(f => ({ ...f, dockerfileContent: val }))}
                          language="docker"
                          placeholder={`FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nCMD ["python", "app.py"]`}
                          style={{ height: '220px' }}
                        />
                      </div>
                    )}
                    {parseBuilderValue(form.gitBuilder).type === 'docker-compose' && (
                      <div className="form-group">
                        <label className="form-label">Docker Compose Definition (docker-compose.yml)</label>
                        <CodeEditor
                          value={form.dockerComposeContent}
                          onChange={val => setForm(f => ({ ...f, dockerComposeContent: val }))}
                          language="yaml"
                          placeholder={`version: '3.8'\nservices:\n  web:\n    build: .\n    ports:\n      - "80:80"`}
                          style={{ height: '220px' }}
                        />
                      </div>
                    )}
                    {['node', 'python', 'go', 'php'].includes(parseBuilderValue(form.gitBuilder).type) && (
                      <div className="form-group">
                        <label className="form-label">Runtime Version</label>
                        <SelectRoot value={form.gitBuilder} onValueChange={val => setForm(f => ({ ...f, gitBuilder: val }))}>
                          <SelectTrigger style={{ width: '100%' }} />
                          <SelectContent>
                            {RUNTIME_VERSIONS[parseBuilderValue(form.gitBuilder).type].map(v => (
                              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </SelectRoot>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">App Directory</label>
                        <input className="form-input" placeholder="Blank for repo root, or backend" value={form.appDirectory} onChange={set('appDirectory')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Run File</label>
                        <input className="form-input" placeholder="e.g. main.py, app.py, server.js" value={form.runFile} onChange={set('runFile')} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      {parseBuilderValue(form.gitBuilder).type === 'python' && (
                        <div className="form-group">
                          <label className="form-label">Requirements File</label>
                          <input className="form-input" placeholder="requirements.txt" value={form.requirementsFile} onChange={set('requirementsFile')} />
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label">Start Command Override</label>
                        <input className="form-input" placeholder="Blank auto-runs the selected file" value={form.startCommand} onChange={set('startCommand')} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Install Command Override</label>
                      <input className="form-input" placeholder="Blank installs dependencies" value={form.installCommand} onChange={set('installCommand')} />
                    </div>
                    {parseBuilderValue(form.gitBuilder).type === 'python' && (
                      <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                          <input type="checkbox" checked={form.useVenv} onChange={e => setForm(f => ({ ...f, useVenv: e.target.checked }))} />
                          Generate Python virtual environment inside the container
                        </label>
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Docker Run Arguments</label>
                      <input
                        className="form-input"
                        value={form.dockerArgs}
                        onChange={set('dockerArgs')}
                        placeholder="e.g. --privileged --device /dev/i2c-1"
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}
                      />
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Extra flags for <code>docker run</code>. Use for hardware access, custom networks, etc.</p>
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">Environment Variables (Optional, KEY=value, one per line)</label>
                  <textarea
                    className="form-input"
                    style={{ minHeight: '100px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}
                    placeholder="DATABASE_URL=postgres://user:pass@host:5432/db&#10;PORT=8000"
                    value={form.envText}
                    onChange={set('envText')}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(79,110,247,0.06)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(79,110,247,0.1)' }}>
                  <span style={{ fontSize: '1.1rem' }}>ðŸ’¾</span>
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
                      {(DB_VERSIONS[getDbKey(dbType)] || [dbType]).map(v => (
                        <SelectItem key={v} value={v}>
                          {v.includes(':') ? `${v.split(':')[0].toUpperCase()} ${v.split(':')[1]}` : (v.includes('/') ? v.split('/')[1].toUpperCase() : v.toUpperCase())}
                        </SelectItem>
                      ))}
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

            {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>âš ï¸ {error}</p>}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <Button variant="soft" color="gray" onClick={() => setStep('type')}>Back</Button>
              <Button variant="solid" onClick={submit} loading={loading}>
                Deploy Now
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

//  Env Vars Editor â”€
function EnvVarsPanel({ serviceId }) {
  const [vars, setVars] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [show, setShow] = useState({});
  const [saved, setSaved] = useState(null);
  const [isBulk, setIsBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    servicesApi.getEnvVars(serviceId).then(setVars).catch(() => { });
  }, [serviceId]);

  const add = async () => {
    if (!newKey) return;
    await servicesApi.upsertEnvVar(serviceId, newKey, newVal);
    setVars(v => [...v.filter(x => x.key !== newKey), { key: newKey, value: newVal }]);
    setSaved(newKey); setTimeout(() => setSaved(null), 2000);
    setNewKey(''); setNewVal('');
  };

  const remove = async (key) => {
    await servicesApi.deleteEnvVar(serviceId, key);
    setVars(v => v.filter(x => x.key !== key));
  };

  const copy = (val) => navigator.clipboard.writeText(val);

  const handleToggleBulk = () => {
    if (!isBulk) {
      const text = vars.map(ev => `${ev.key}=${ev.value}`).join('\n');
      setBulkText(text);
      setError('');
    }
    setIsBulk(!isBulk);
  };

  const saveBulk = async () => {
    setLoading(true);
    setError('');
    try {
      const parsed = parseBulkEnv(bulkText);
      const parsedKeys = parsed.map(x => x.key);

      // Upsert all parsed keys
      for (const item of parsed) {
        await servicesApi.upsertEnvVar(serviceId, item.key, item.value);
      }

      // Delete any keys that are not in the new bulk list
      const toDelete = vars.filter(v => !parsedKeys.includes(v.key));
      for (const item of toDelete) {
        await servicesApi.deleteEnvVar(serviceId, item.key);
      }

      const updated = await servicesApi.getEnvVars(serviceId);
      setVars(updated);
      setIsBulk(false);
      setSaved('bulk');
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setError(e.message || 'Failed to save environment variables');
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Environment Variables</h4>
        <Button variant="outline" size="sm" onClick={handleToggleBulk}>
          {isBulk ? 'Cancel Bulk' : 'Bulk Import / Edit'}
        </Button>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: '1rem' }}>âš ï¸ {error}</p>}

      {isBulk ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            className="form-input"
            style={{ minHeight: '200px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem', width: '100%', boxSizing: 'border-box' }}
            placeholder="KEY=value&#10;PORT=8000"
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            disabled={loading}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="soft" color="gray" size="sm" onClick={() => setIsBulk(false)} disabled={loading}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={saveBulk} loading={loading}>
              Save Variables
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
            <table className="data-table">
              <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
              <tbody>
                {vars.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No environment variables</td></tr>
                )}
                {vars.map(ev => (
                  <tr key={ev.key}>
                    <td><code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>{ev.key}</code></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                          {show[ev.key] ? ev.value : '••••••••'}
                        </code>
                        <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28 }} onClick={() => setShow(s => ({ ...s, [ev.key]: !s[ev.key] }))} icon={show[ev.key] ? EyeOff : Eye} />
                        <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28 }} onClick={() => copy(ev.value)} icon={Copy} />
                      </div>
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28, color: 'var(--red)' }} onClick={() => remove(ev.key)} icon={Trash2} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="KEY" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace' }} />
            <input className="form-input" placeholder="value" value={newVal} onChange={e => setNewVal(e.target.value)} style={{ flex: 2 }} />
            <Button variant="primary" size="sm" onClick={add} icon={saved ? Check : Plus}>
              {saved ? ' Saved' : ' Add'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

//  Deployments Panel â”€
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
    running: 'âœ… Running',
    completed: 'âœ… Completed',
    building: 'ðŸ”¨ Building...',
    deploying: 'ðŸš€ Deploying...',
    error: 'âŒ Failed',
    idle: 'ðŸ’¤ Idle',
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
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 16 }}>⚙️</span>
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
              background: statusColor[d.status] || 'var(--text-muted)',
              flexShrink: 0,
              boxShadow: (d.status === 'building' || d.status === 'deploying') ? `0 0 6px ${statusColor[d.status]}` : 'none',
            }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
              {statusLabel[d.status] || d.status}
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
                  {d.log.split('\n').map((line, i) => {
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
function ServiceCard({ svc, onDeploy, onDelete }) {
  const [deploying, setDeploying] = useState(false);
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)', creating: 'var(--yellow)', oom_killed: 'var(--red)', crashed: 'var(--red)' };

  const handleDeploy = async (e) => {
    e.stopPropagation();
    setDeploying(true);
    try { await onDeploy(svc.id); } finally { setDeploying(false); }
  };

  return (
    <div className="card hover-glow" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{svc.name}</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[svc.status] || 'var(--text-muted)', boxShadow: `0 0 6px ${statusColor[svc.status] || 'transparent'}` }} title={svc.status} />
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

// Container Logs Panel
function ContainerLogsPanel({ serviceId }) {
  const [logs, setLogs] = useState('Fetching container logs...');

  const fetchLogs = useCallback(async () => {
    try {
      const res = await servicesApi.getLogs(serviceId);
      setLogs(res.logs || 'No runtime logs found. Container might be stopped or starting.');
    } catch (err) {
      setLogs(`Error: ${err.message}`);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Runtime Container Logs</span>
        <Button variant="ghost" size="sm" onClick={fetchLogs} icon={RefreshCw}>Refresh</Button>
      </div>
      <pre style={{
        background: '#0d1117',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1rem',
        fontSize: '0.875rem',
        lineHeight: 1.6,
        color: '#e2e8f0',
        overflow: 'auto',
        maxHeight: 320,
        fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
        whiteSpace: 'pre-wrap',
      }}>
        {logs}
      </pre>
    </div>
  );
}

//  Webhook Panel 
function WebhookPanel({ serviceId }) {
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${window.location.origin}/api/webhooks/${serviceId}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Automatic Deployments Webhook</h4>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Configure a webhook in your repository provider to trigger automatic builds and deployments on every Git push event.
        </p>
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
        <h5 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ðŸ› ï¸</span> How to configure GitHub Webhooks
        </h5>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Go to your repository on <strong>GitHub</strong>.</li>
          <li>Navigate to <strong>Settings</strong> &rarr; <strong>Webhooks</strong> in the sidebar.</li>
          <li>Click the <strong>Add webhook</strong> button on the right.</li>
          <li>Paste the Payload URL copied above into the <strong>Payload URL</strong> input field.</li>
          <li>Set Content type to <strong>application/json</strong>.</li>
          <li>Set triggering events to <strong>Just the push event</strong>.</li>
          <li>Click the green <strong>Add webhook</strong> button to save.</li>
        </ol>
      </div>
    </div>
  );
}

// Settings Panel 
function SettingsPanel({ service, project, domains = [], onUpdate }) {
  const toast = useToast();
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description || '');
  const [image, setImage] = useState(service.image || '');
  const [port, setPort] = useState(service.port || '');
  const [gitUrl, setGitUrl] = useState(service.git_repo_url || '');
  const [branch, setBranch] = useState(service.git_branch || 'main');
  const [gitBuilder, setGitBuilder] = useState(service.git_builder || 'auto');
  const [appDirectory, setAppDirectory] = useState(service.app_directory || '');
  const [runFile, setRunFile] = useState(service.run_file || '');
  const [requirementsFile, setRequirementsFile] = useState(service.requirements_file || 'requirements.txt');
  const [useVenv, setUseVenv] = useState(service.use_venv !== false);
  const [startCommand, setStartCommand] = useState(service.start_command || '');
  const [installCommand, setInstallCommand] = useState(service.install_command || '');
  const [dockerArgs, setDockerArgs] = useState(service.docker_args || '');
  const [gitToken, setGitToken] = useState(service.git_token || '');
  const [sshKey, setSshKey] = useState(service.ssh_key || '');
  const [dockerfileContent, setDockerfileContent] = useState(service.dockerfile_content || '');
  const [dockerComposeContent, setDockerComposeContent] = useState(service.docker_compose_content || '');
  const [dbUser, setDbUser] = useState(service.db_user || '');
  const [dbPassword, setDbPassword] = useState(service.db_password || '');
  const [dbName, setDbName] = useState(service.db_name || '');
  const [resourceTier, setResourceTier] = useState(service.resource_tier || 'micro');
  const [customMemory, setCustomMemory] = useState(service.custom_memory || 0);
  const [customCPU, setCustomCPU] = useState(service.custom_cpu || 0);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Domains & Direction handling
  const [domainVal, setDomainVal] = useState('');
  const [direction, setDirection] = useState('both');

  useEffect(() => {
    setName(service.name);
    setDescription(service.description || '');
    setImage(service.image || '');
    setPort(service.port || '');
    setGitUrl(service.git_repo_url || '');
    setBranch(service.git_branch || 'main');
    setGitBuilder(service.git_builder || 'auto');
    setAppDirectory(service.app_directory || '');
    setRunFile(service.run_file || '');
    setRequirementsFile(service.requirements_file || 'requirements.txt');
    setUseVenv(service.use_venv !== false);
    setStartCommand(service.start_command || '');
    setInstallCommand(service.install_command || '');
    setDockerArgs(service.docker_args || '');
    setGitToken(service.git_token || '');
    setSshKey(service.ssh_key || '');
    setDockerfileContent(service.dockerfile_content || '');
    setDockerComposeContent(service.docker_compose_content || '');
    setDbUser(service.db_user || '');
    setDbPassword(service.db_password || '');
    setDbName(service.db_name || '');
    setResourceTier(service.resource_tier || 'micro');
    setCustomMemory(service.custom_memory || 0);
    setCustomCPU(service.custom_cpu || 0);

    const matched = domains.find(d => d.service === service.name && d.project === project?.name);
    setDomainVal(matched ? matched.domain : '');
    setDirection(matched && matched.direction ? matched.direction : 'both');
  }, [service, domains, project]);

  const handleGenerateDomain = () => {
    const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const host = window.location.hostname;
    const cleanHost = host.split(':')[0];
    setDomainVal(`http://${randomStr}.${cleanHost}.sslip.io`);
  };

  const handleSetDirection = async () => {
    const cleanNewDomain = domainVal.trim().replace(/^https?:\/\//, '');
    if (!cleanNewDomain) {
      setError('Please specify a domain before setting direction');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const matched = domains.find(d => d.service === service.name && d.project === project?.name);
      if (matched) {
        await domainsApi.update(matched.id, {
          domain: cleanNewDomain,
          service: service.name,
          project: project?.name || 'Production',
          direction: direction
        });
      } else {
        await domainsApi.create({
          domain: cleanNewDomain,
          service: service.name,
          project: project?.name || 'Production',
          direction: direction
        });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      setError(err.message || 'Failed to set direction');
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await servicesApi.update(service.id, {
        name: name.trim(),
        description: description.trim(),
        image: image.trim(),
        port: Number(port) || 0,
        git_repo_url: gitUrl.trim(),
        git_branch: branch.trim(),
        git_builder: gitBuilder,
        app_directory: appDirectory.trim(),
        run_file: runFile.trim(),
        requirements_file: requirementsFile.trim() || 'requirements.txt',
        use_venv: !!useVenv,
        start_command: startCommand.trim(),
        install_command: installCommand.trim(),
        docker_args: dockerArgs.trim(),
        git_token: gitToken.trim(),
        ssh_key: sshKey.trim(),
        dockerfile_content: dockerfileContent,
        docker_compose_content: dockerComposeContent,
        db_user: dbUser.trim(),
        db_password: dbPassword.trim(),
        db_name: dbName.trim(),
        tier_name: resourceTier,
        custom_memory: Number(customMemory),
        custom_cpu: Number(customCPU),
      });

      // Update domain and direction in domains_v2 if modified
      const matched = domains.find(d => d.service === service.name && d.project === project?.name);
      const cleanNewDomain = domainVal.trim().replace(/^https?:\/\//, ''); // strip protocol
      const cleanOldDomain = matched ? matched.domain : '';

      if (cleanNewDomain !== cleanOldDomain) {
        if (matched) {
          await domainsApi.delete(matched.id);
        }
        if (cleanNewDomain) {
          await domainsApi.create({
            domain: cleanNewDomain,
            service: service.name,
            project: project?.name || 'Production',
            direction: direction
          });
        }
      } else if (matched && matched.direction !== direction) {
        await domainsApi.update(matched.id, {
          domain: cleanNewDomain,
          service: service.name,
          project: project?.name || 'Production',
          direction: direction
        });
      }

      setSuccess(true);
      toast.success('Settings saved successfully!');
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      const errorMsg = err.message || 'Failed to save settings';
      setError(errorMsg);
      toast.error(errorMsg);
    }
    setSaving(false);
  };

  const isBuiltApp = !!(service.git_repo_url || service.local_path);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
      <div className="form-group">
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Resource Name</label>
        <input className="form-input form-input-sm" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          Resource Tier
          <Tooltip content="Choose a predefined resource plan or select Custom to set your own limits">
            <Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
          </Tooltip>
        </label>
        <select className="form-input form-input-sm" value={resourceTier} onChange={e => setResourceTier(e.target.value)}>
          <option value="nano">Nano (128MB / 0.25 CPU)</option>
          <option value="micro">Micro (256MB / 0.5 CPU) - Default</option>
          <option value="standard">Standard (512MB / 1.0 CPU)</option>
          <option value="large">Large (1GB / 2.0 CPU)</option>
          <option value="unlimited">Unlimited (No Limits)</option>
          <option value="custom">Custom (Set Your Own Limits)</option>
        </select>
      </div>

      {resourceTier === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 8 }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              Memory Limit (MB)
              <Tooltip content="Maximum memory the container can use. 512 MB = 0.5 GB">
                <Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
              </Tooltip>
            </label>
            <input
              type="number"
              className="form-input form-input-sm"
              value={customMemory ? customMemory / (1024 * 1024) : ''}
              onChange={e => setCustomMemory(Number(e.target.value) * 1024 * 1024)}
              placeholder="e.g., 512"
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              CPU Limit (Cores)
              <Tooltip content="Maximum CPU cores the container can use. 1.0 = 1 full core, 0.5 = half a core">
                <Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
              </Tooltip>
            </label>
            <input
              type="number"
              step="0.25"
              className="form-input form-input-sm"
              value={customCPU || ''}
              onChange={e => setCustomCPU(Number(e.target.value))}
              placeholder="e.g., 1.5"
            />
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Description</label>
        <input className="form-input form-input-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="A short description of this service" />
      </div>

      {service.type === 'database' ? (
        <>
          <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)', borderRadius: 8, padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            If you change the values here, please sync it here, otherwise automations (like backups) won't work.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Username</label>
              <input className="form-input form-input-sm" value={dbUser} onChange={e => setDbUser(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Password</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="form-input form-input-sm"
                  type={showPassword ? "text" : "password"}
                  value={dbPassword}
                  onChange={e => setDbPassword(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button variant="ghost" size="sm" type="button" onClick={() => setShowPassword(!showPassword)} style={{ height: 32, width: 32, padding: 0 }}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Initial Database</label>
            <input className="form-input form-input-sm" value={dbName} onChange={e => setDbName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Database Engine</label>
            <input className="form-input form-input-sm" value={image} onChange={e => setImage(e.target.value)} placeholder="e.g. postgres, redis, mysql" />
          </div>
        </>
      ) : (
        <>
          {isBuiltApp ? (
            <>
              {service.git_repo_url ? (
                <>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Source URL</label>
                    <input className="form-input form-input-sm" value={gitUrl} onChange={e => setGitUrl(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Branch</label>
                    <input className="form-input form-input-sm" value={branch} onChange={e => setBranch(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>GitHub Access Token (PAT)</label>
                    <input className="form-input form-input-sm" type="password" value={gitToken} onChange={e => setGitToken(e.target.value)} placeholder="Leave blank to keep unchanged" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>SSH Private Key (Deploy Key)</label>
                    <textarea
                      className="form-input form-input-sm"
                      style={{ fontFamily: 'monospace', height: '80px', fontSize: '0.82rem' }}
                      value={sshKey}
                      onChange={e => setSshKey(e.target.value)}
                      placeholder="Leave blank to keep unchanged"
                    />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Server Folder Path</label>
                  <input className="form-input form-input-sm" value={service.local_path || ''} readOnly disabled style={{ opacity: 0.7 }} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Build Type / Runtime</label>
                <select
                  className="form-input form-input-sm"
                  value={parseBuilderValue(gitBuilder).type}
                  onChange={e => {
                    const val = e.target.value;
                    let finalVal = val;
                    if (val === 'node') finalVal = 'node:20-alpine';
                    else if (val === 'python') finalVal = 'python:3.11-slim';
                    else if (val === 'go') finalVal = 'golang:1.22-alpine';
                    else if (val === 'php') finalVal = 'php:8.2-apache';
                    setGitBuilder(finalVal);
                    if (val === 'dockerfile' || val === 'docker-compose') {
                      setUseVenv(false);
                    }
                  }}
                >
                  <option value="auto">Auto-detect (Recommended)</option>
                  <option value="node">Node.js</option>
                  <option value="go">Go (Golang)</option>
                  <option value="python">Python</option>
                  <option value="php">PHP</option>
                  <option value="static">HTML / Static Website</option>
                  <option value="dockerfile">Dockerfile</option>
                  <option value="docker-compose">Docker Compose</option>
                  <option value="nixpacks">Nixpacks</option>
                </select>
              </div>

              {parseBuilderValue(gitBuilder).type === 'dockerfile' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Dockerfile Content</label>
                  <CodeEditor
                    value={dockerfileContent}
                    onChange={val => setDockerfileContent(val)}
                    language="docker"
                    placeholder={`FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nCMD ["python", "app.py"]`}
                    style={{ height: '180px' }}
                  />
                </div>
              )}

              {parseBuilderValue(gitBuilder).type === 'docker-compose' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Docker Compose Definition (docker-compose.yml)</label>
                  <CodeEditor
                    value={dockerComposeContent}
                    onChange={val => setDockerComposeContent(val)}
                    language="yaml"
                    placeholder={`version: '3.8'\nservices:\n  web:\n    build: .\n    ports:\n      - "80:80"`}
                    style={{ height: '180px' }}
                  />
                </div>
              )}

              {['node', 'python', 'go', 'php'].includes(parseBuilderValue(gitBuilder).type) && (
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Runtime Version</label>
                  <select
                    className="form-input form-input-sm"
                    value={gitBuilder}
                    onChange={e => setGitBuilder(e.target.value)}
                  >
                    {RUNTIME_VERSIONS[parseBuilderValue(gitBuilder).type].map(v => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ background: 'rgba(79,110,247,0.06)', border: '1px solid rgba(79,110,247,0.18)', borderRadius: 8, padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Changing runtime fields affects the next deploy. Use App Directory when the app lives inside a subfolder, and Run File for Python files like main.py.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>App Directory</label>
                  <input className="form-input form-input-sm" value={appDirectory} onChange={e => setAppDirectory(e.target.value)} placeholder="Blank for source root" />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Run File</label>
                  <input className="form-input form-input-sm" value={runFile} onChange={e => setRunFile(e.target.value)} placeholder="ecopulse.py" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {parseBuilderValue(gitBuilder).type === 'python' && (
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Requirements File</label>
                    <input className="form-input form-input-sm" value={requirementsFile} onChange={e => setRequirementsFile(e.target.value)} placeholder="requirements.txt" />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Command Override</label>
                  <input className="form-input form-input-sm" value={startCommand} onChange={e => setStartCommand(e.target.value)} placeholder="python ecopulse.py" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Install Command Override</label>
                <input className="form-input form-input-sm" value={installCommand} onChange={e => setInstallCommand(e.target.value)} placeholder="pip install --no-cache-dir -r requirements.txt" />
              </div>
              {parseBuilderValue(gitBuilder).type === 'python' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={useVenv} onChange={e => setUseVenv(e.target.checked)} />
                  Generate Python virtual environment during build
                </label>
              )}
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Docker Run Arguments</label>
                <input
                  className="form-input form-input-sm"
                  value={dockerArgs}
                  onChange={e => setDockerArgs(e.target.value)}
                  placeholder="e.g. --privileged --device /dev/i2c-1 --network host"
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem' }}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Extra flags appended to <code>docker run</code> on each deploy. Useful for device access, network modes, etc.</p>
              </div>
              {service.git_repo_url?.startsWith('file://') && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="outline" color="amber" size="sm"
                    onClick={async () => {
                      const localPath = service.git_repo_url.replace('file://', '');
                      const builderType = parseBuilderValue(gitBuilder).type;
                      const baseImage = gitBuilder.includes(':') ? gitBuilder : (
                        builderType === 'python' ? 'python:3.11-slim' :
                          builderType === 'node' ? 'node:22-alpine' :
                            builderType === 'go' ? 'golang:1.22-alpine' :
                              builderType === 'php' ? 'php:8.2-apache' : 'ubuntu:22.04'
                      );
                      const runCmd = startCommand.trim() || (
                        builderType === 'python' ? `python ${runFile || 'app.py'}` :
                          builderType === 'node' ? 'npm start' :
                            builderType === 'go' ? 'go run .' :
                              builderType === 'php' ? 'apache2-foreground' : './start.sh'
                      );
                      const installCmd = installCommand.trim() || (
                        builderType === 'python' ? 'pip install -r requirements.txt' :
                          builderType === 'node' ? 'npm install --production' :
                            builderType === 'go' ? 'go mod download' : ''
                      );
                      const portLine = service.port > 0 ? `EXPOSE ${service.port}\nENV PORT=${service.port}` : '';
                      const installLine = installCmd ? `RUN ${installCmd}` : '';
                      const content = [
                        `FROM ${baseImage}`,
                        'WORKDIR /app',
                        'COPY . .',
                        installLine,
                        portLine,
                        `CMD ["sh", "-c", "${runCmd}"]`,
                      ].filter(Boolean).join('\n');
                      try {
                        await filesApi.save(localPath + '/Dockerfile', content);
                        toast.success('Dockerfile created successfully');
                      } catch (e) { toast.error('Failed to create Dockerfile: ' + e.message); }
                    }}
                  >
                    ðŸ“„ Initialize Dockerfile Template
                  </Button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Creates a starter Dockerfile in the project folder</span>
                </div>
              )}
            </>
          ) : (
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Docker Image</label>
              <input className="form-input form-input-sm" value={image} onChange={e => setImage(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Port</label>
            <input className="form-input form-input-sm" value={port} onChange={e => setPort(e.target.value)} placeholder="80" />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              Domains
              <span style={{ cursor: 'help', color: 'var(--text-muted)' }} title="Add custom domains. Point your DNS A record to your server IP.">â„¹ï¸</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input form-input-sm"
                value={domainVal}
                onChange={e => setDomainVal(e.target.value)}
                placeholder="e.g. app.yourdomain.com"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleGenerateDomain}
                style={{ border: '1px solid var(--border)', height: 32, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              >
                Generate Domain
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              Direction *
              <span style={{ cursor: 'help', color: 'var(--text-muted)' }} title="Select how requests to www and non-www subdomains are handled.">â„¹ï¸</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="form-input form-input-sm"
                value={direction}
                onChange={e => setDirection(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="both">Allow www & non-www.</option>
                <option value="www">Redirect to www</option>
                <option value="non-www">Redirect to non-www</option>
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleSetDirection}
                style={{ border: '1px solid var(--border)', height: 32, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              >
                Set Direction
              </button>
            </div>
          </div>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            <strong>Note:</strong> After changing domains, you must click <strong>Deploy</strong> for the reverse proxy routing and SSL rules to take effect.
          </div>
        </>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>âš ï¸ {error}</div>}
      {success && <div style={{ color: 'var(--green)', fontSize: '0.75rem' }}>âœ“ Settings saved successfully!</div>}

      <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} loading={saving} style={{ marginTop: 6, alignSelf: 'flex-end' }}>
        Save Settings
      </Button>
    </div>
  );
}

//  Backup & Restore Panel 
function BackupRestorePanel({ service }) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupFile, setBackupFile] = useState('');
  const toast = useToast();

  const handleBackup = async () => {
    try {
      setLoading(true);
      const res = await servicesApi.backup(service.id);
      toast.success('Backup created: ' + res.file);
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
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={14} color="var(--accent)" /> Manual Logical Backup
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Trigger a backup directly inside the container and save it to the persistent host volume. Database services run a logical dump, Apps run a tar archive.</p>
        <Button variant="primary" onClick={handleBackup} loading={loading} disabled={loading} style={{ marginTop: 12 }}>
          Create Backup
        </Button>
      </div>

      <div className="card" style={{ padding: '1.25rem', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Upload size={14} /> Import Backup
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Restore a backup file from the persistent host volume into the database. <strong>Warning: This will drop the current database content!</strong></p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input className="form-input form-input-sm" placeholder="backup_file.sql" value={backupFile} onChange={e => setBackupFile(e.target.value)} style={{ flex: 1 }} />
          <Button variant="danger" size="sm" onClick={handleImport} loading={importing} disabled={importing || !backupFile}>
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
        const urlStr = connString.replace('mongodb://', 'http://').replace('postgres://', 'http://').replace('mysql://', 'http://').replace('clickhouse://', 'http://');
        const parsed = new URL(urlStr);
        host = 'localhost';
        port = parseInt(parsed.port, 10) || port;
        username = parsed.username || 'nanofly';
        password = parsed.password || '';
        dbName = parsed.pathname ? parsed.pathname.replace('/', '') : dbName;
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

//  Resource Limits Panel 
function ResourceLimitsPanel({ service, onUpdate }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [resourceTier, setResourceTier] = useState(service.resource_tier || 'micro');
  const [customMemory, setCustomMemory] = useState(service.custom_memory || 0);
  const [customCPU, setCustomCPU] = useState(service.custom_cpu || 0);

  useEffect(() => {
    setResourceTier(service.resource_tier || 'micro');
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
      toast.success('Resource limits saved successfully!');
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
  const [activeTab, setActiveTab] = useState('deployments');
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
  const [projectMetrics, setProjectMetrics] = useState({});
  const [loadingMetrics, setLoadingMetrics] = useState(false);

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

  const fetchProjectMetrics = useCallback(async () => {
    if (services.length === 0) return;
    setLoadingMetrics(true);
    const metricsMap = {};
    for (const svc of services) {
      try {
        const m = await servicesApi.getMetrics(svc.id);
        metricsMap[svc.id] = m;
      } catch (e) {
        metricsMap[svc.id] = null;
      }
    }
    setProjectMetrics(metricsMap);
    setLoadingMetrics(false);
  }, [services]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => { fetchProjectMetrics(); const t = setInterval(fetchProjectMetrics, 3000); return () => clearInterval(t); }, [fetchProjectMetrics]);

  const handleDeploy = async (svcId) => {
    const svc = services.find(s => s.id === svcId);
    setLoadingStates(prev => ({ ...prev, redeploying: svcId }));
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
    setLoadingStates(prev => ({ ...prev, stopping: stoppingSvc.id }));
    toast.promise(
      (async () => {
        await servicesApi.stop(stoppingSvc.id);
        await load();
      })(),
      {
        loading: 'Stopping service...',
        success: 'Service stopped successfully!',
        error: (err) => err.message || 'Failed to stop service',
      }
    ).finally(() => {
      setLoadingStates(prev => ({ ...prev, stopping: null }));
      setStoppingSvc(null);
    });
  };

  const handleRestart = async (svcId) => {
    setLoadingStates(prev => ({ ...prev, restarting: svcId }));
    toast.promise(
      (async () => {
        await servicesApi.restart(svcId);
        setActiveTab('logs');
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
    setLoadingStates(prev => ({ ...prev, deleting: deletingSvc.id }));
    toast.promise(
      (async () => {
        await servicesApi.delete(deletingSvc.id);
        setServices(s => s.filter(x => x.id !== deletingSvc.id));
        if (activeSvc === deletingSvc.id) setActiveSvc(null);
        setDeletingSvc(null);
      })(),
      {
        loading: 'Deleting service...',
        success: 'Service deleted successfully!',
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

  const apps = services.filter(s => s.type === 'app');
  const dbs = services.filter(s => s.type === 'database');
  const selectedSvc = services.find(s => s.id === activeSvc);
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', stopped: 'var(--text-muted)', idle: 'var(--text-muted)', creating: 'var(--yellow)', oom_killed: 'var(--red)', crashed: 'var(--red)' };

  if (loading) return <div className="page-content"><div className="spinner" /></div>;

  if (activeSvc && selectedSvc) {
    const matchedDomain = domains.find(d => d.service === selectedSvc.name && d.project === project?.name);
    const serviceUrl = matchedDomain
      ? (matchedDomain.domain.startsWith('http') ? matchedDomain.domain : `http://${matchedDomain.domain}`)
      : (selectedSvc.port > 0 && selectedSvc.type === 'app' ? `http://${window.location.hostname}:${selectedSvc.port}` : null);

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
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[selectedSvc.status] || 'var(--text-muted)' }} />
              <span style={{ fontSize: '1.05rem', color: statusColor[selectedSvc.status] || 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>{selectedSvc.status}</span>
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
              {selectedSvc.port > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '20px' }}>
                  <Globe size={14} color="var(--green)" /> :{selectedSvc.port}
                </span>
              )}
              {serviceUrl && (
                <a href={serviceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(79,110,247,0.1)', color: 'var(--accent)', padding: '3px 10px', borderRadius: '20px', textDecoration: 'none', fontWeight: 500, border: '1px solid rgba(79,110,247,0.2)' }}>
                  <ExternalLink size={13} /> {serviceUrl}
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
              disabled={loadingStates.redeploying !== null || loadingStates.restarting !== null || loadingStates.stopping !== null || loadingStates.deleting !== null}
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
              disabled={loadingStates.redeploying !== null || loadingStates.restarting !== null || loadingStates.stopping !== null || loadingStates.deleting !== null}
            >
              Restart
            </Button>
            {selectedSvc.status === 'running' && (
              <Button
                variant="outline"
                color="red"
                size="md"
                onClick={() => handleStop(selectedSvc.id)}
                icon={X}
                loading={loadingStates.stopping === selectedSvc.id}
                disabled={loadingStates.redeploying !== null || loadingStates.restarting !== null || loadingStates.stopping !== null || loadingStates.deleting !== null}
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
              disabled={loadingStates.redeploying !== null || loadingStates.restarting !== null || loadingStates.stopping !== null || loadingStates.deleting !== null}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Full-width Details Panel */}
        <div className="card hover-glow" style={{ padding: '1.5rem', minHeight: '400px' }}>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            items={[
              ...(selectedSvc.type === 'database' ? [{ id: 'connection', label: 'Connection Details', icon: Key }] : []),
              ...(selectedSvc.type !== 'database' ? [{ id: 'deployments', label: 'Deployments' }] : []),
              { id: 'logs', label: 'Logs' },
              ...(selectedSvc.type !== 'database' ? [{ id: 'terminal', label: 'Terminal', icon: TerminalSquare }] : []),
              { id: 'monitoring', label: 'Monitoring', icon: Cpu },
              { id: 'resources', label: 'Resource Limits', icon: Sliders },
              ...(selectedSvc.git_repo_url && !selectedSvc.git_repo_url.startsWith('file://') ? [{ id: 'webhooks', label: 'Webhooks' }] : []),
              ...(selectedSvc.git_repo_url?.startsWith('file://') ? [{ id: 'files', label: 'Source Files', icon: Folder }] : []),
              ...(selectedSvc.type !== 'database' ? [{ id: 'envvars', label: 'Environment Variables' }] : []),
              { id: 'backup', label: 'Backup & Restore', icon: Database },
              { id: 'settings', label: 'Settings', icon: Settings },
            ]}
          >
            <TabsContent value="connection">
              <ConnectionDetailsPanel service={selectedSvc} />
            </TabsContent>
            <TabsContent value="deployments">
              <DeploymentsPanel serviceId={activeSvc} />
            </TabsContent>
            <TabsContent value="logs">
              <ContainerLogsPanel serviceId={activeSvc} />
            </TabsContent>
            <TabsContent value="terminal">
              <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading terminal...</div>}>
                <ContainerTerminalPanel service={selectedSvc} />
              </Suspense>
            </TabsContent>
            <TabsContent value="monitoring">
              <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading monitoring charts...</div>}>
                <MonitoringPanel serviceId={activeSvc} />
              </Suspense>
            </TabsContent>
            <TabsContent value="resources">
              <ResourceLimitsPanel service={selectedSvc} onUpdate={load} />
            </TabsContent>
            {selectedSvc.git_repo_url && !selectedSvc.git_repo_url.startsWith('file://') && (
              <TabsContent value="webhooks">
                <WebhookPanel serviceId={activeSvc} />
              </TabsContent>
            )}
            {selectedSvc.git_repo_url?.startsWith('file://') && (
              <TabsContent value="files">
                <SourceFilesPanel service={selectedSvc} />
              </TabsContent>
            )}
            <TabsContent value="settings">
              <SettingsPanel service={selectedSvc} project={project} domains={domains} onUpdate={load} />
            </TabsContent>
            <TabsContent value="backup">
              <BackupRestorePanel service={selectedSvc} />
            </TabsContent>
            <TabsContent value="envvars">
              <EnvVarsPanel serviceId={activeSvc} />
            </TabsContent>
          </Tabs>
        </div>
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
                {loadingMetrics ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> : (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} className="pulse" />
                )}
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
                  {services.map(svc => {
                    const m = projectMetrics[svc.id];
                    const isRunning = svc.status === 'running';
                    return (
                      <tr
                        key={svc.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                          setActiveSvc(svc.id);
                          setActiveTab(svc.type === 'database' ? 'connection' : 'deployments');
                        }}
                      >
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ServiceLogo type={svc.type} name={svc.name} image={svc.image} builder={svc.git_builder} size={20} />
                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{svc.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {svc.type === 'database' ? 'Database' : 'Application'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[svc.status] || 'var(--text-muted)' }} />
                            <span style={{ fontSize: '0.8rem', color: statusColor[svc.status] || 'var(--text-muted)', textTransform: 'capitalize' }}>
                              {svc.status}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {isRunning && m ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${Math.min(m.cpu_percent, 100)}%`,
                                  height: '100%',
                                  background: m.cpu_percent > 80 ? 'var(--red)' : m.cpu_percent > 50 ? 'var(--yellow)' : 'var(--green)',
                                  borderRadius: 3
                                }} />
                              </div>
                              <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{m.cpu_percent.toFixed(1)}%</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {isRunning && m ? (
                            <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{m.memory_usage}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {isRunning && m ? (
                            <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{m.disk_usage || '0 B'}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {isRunning && m ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                              <span style={{ color: 'var(--green)' }}>↓ {m.network_in}</span>
                              <span style={{ color: 'var(--blue)' }}>↑ {m.network_out}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                          )}
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
              {apps.length > 0 && (
                <>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Applications</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {apps.map(s => (
                      <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('deployments'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
                        <ServiceCard svc={s} onDeploy={handleDeploy} onDelete={handleDelete} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {dbs.length > 0 && (
                <>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Databases</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    {dbs.map(s => (
                      <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('connection'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
                        <ServiceCard svc={s} onDeploy={handleDeploy} onDelete={handleDelete} />
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


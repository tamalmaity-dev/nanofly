import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { servicesApi, projectsApi } from '../api/client';
import { Plus, Play, Trash2, RefreshCw, ChevronRight, GitBranch, Package, Database, Globe, Settings, Eye, EyeOff, Copy, X, Check } from 'lucide-react';

const DB_VERSIONS = {
  postgres: ['postgres:18', 'postgres:17', 'postgres:16', 'postgres:15', 'postgres:14', 'postgres:13'],
  mysql: ['mysql:8.3', 'mysql:8.0'],
  mariadb: ['mariadb:11', 'mariadb:10'],
  redis: ['redis:7', 'redis:6'],
  mongo: ['mongo:7', 'mongo:6', 'mongo:5'],
  keydb: ['keydb'],
  dragonfly: ['dragonfly'],
  clickhouse: ['clickhouse'],
};

// ── Add Service Modal ─────────────────────────────────────────────────────────
function AddServiceModal({ projectId, onClose, onCreated }) {
  const [step, setStep] = useState('type'); // type | config
  const [type, setType] = useState('app'); // app | database
  const [subType, setSubType] = useState('docker'); // docker | github
  const [dbType, setDbType] = useState('postgres:18');
  const [isPrivate, setIsPrivate] = useState(false);
  const [form, setForm] = useState({ name: '', image: '', port: '', gitUrl: '', branch: 'main', token: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setLoading(true); setError('');
    try {
      let svc;
      if (type === 'database') {
        svc = await servicesApi.createDB(projectId, { name: form.name.trim(), db_type: dbType });
      } else if (subType === 'github') {
        svc = await servicesApi.createApp(projectId, { 
          name: form.name.trim(), 
          git_repo_url: form.gitUrl.trim(), 
          git_branch: form.branch.trim() || 'main', 
          git_token: form.token.trim(), 
          port: Number(form.port) || 0 
        });
      } else {
        svc = await servicesApi.createApp(projectId, { 
          name: form.name.trim(), 
          image: form.image.trim(), 
          port: Number(form.port) || 0 
        });
      }
      onCreated(svc);
    } catch (e) { setError(e.message || 'Failed to create resource'); }
    setLoading(false);
  };

  const handleSelectResource = (resource) => {
    if (resource.type === 'app') {
      setType('app');
      setSubType(resource.subType);
      setIsPrivate(resource.isPrivate || false);
      setForm(f => ({
        ...f,
        name: resource.defaultName || '',
        image: resource.defaultImage || '',
        port: resource.defaultPort || '',
      }));
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
      icon: '🌐',
      defaultName: 'public-app'
    },
    {
      id: 'git-private-app',
      type: 'app',
      subType: 'github',
      isPrivate: true,
      title: 'Private Repository (GitHub App)',
      desc: 'Deploy public & private repositories through GitHub Apps integrations.',
      icon: '🔑',
      defaultName: 'private-app'
    },
    {
      id: 'git-private-key',
      type: 'app',
      subType: 'github',
      isPrivate: true,
      title: 'Private Repository (Deploy Key)',
      desc: 'Deploy private repositories securely using a standalone SSH deploy key.',
      icon: '🔒',
      defaultName: 'secure-app'
    },
    {
      id: 'dockerfile',
      type: 'app',
      subType: 'docker',
      title: 'Dockerfile',
      desc: 'Deploy a custom Dockerfile build configuration directly without Git setup.',
      icon: '📄',
      defaultName: 'docker-app',
      defaultImage: 'nginx:alpine'
    },
    {
      id: 'docker-compose',
      type: 'app',
      subType: 'docker',
      title: 'Docker Compose Empty',
      desc: 'Deploy complex application stacks easily with custom multi-container Compose definitions.',
      icon: '🎛️',
      defaultName: 'compose-app'
    },
    {
      id: 'docker-image',
      type: 'app',
      subType: 'docker',
      title: 'Docker Image',
      desc: 'Deploy an existing compiled Docker image from Docker Hub or a custom registry.',
      icon: '🐳',
      titleSuffix: 'Image',
      defaultName: 'web-image',
      defaultImage: 'nginx:alpine'
    }
  ];

  const DB_RESOURCES = [
    { dbType: 'postgres', title: 'PostgreSQL', desc: 'Object-relational database known for robustness and standards compliance.', icon: '🐘' },
    { dbType: 'mysql', title: 'MySQL', desc: 'Popular open-source relational database management system.', icon: '🐬' },
    { dbType: 'mariadb', title: 'MariaDB', desc: 'Commercially supported fork of MySQL relational database system.', icon: '🌊' },
    { dbType: 'redis', title: 'Redis', desc: 'Fast, in-memory key-value data store used as database, cache, or broker.', icon: '🔴' },
    { dbType: 'keydb', title: 'KeyDB', desc: 'High-performance, multithreaded alternative to Redis core.', icon: '⚡' },
    { dbType: 'dragonfly', title: 'Dragonfly', desc: 'Modern in-memory database built for high-throughput memory efficiency.', icon: '🐉' },
    { dbType: 'mongo', title: 'MongoDB', desc: 'Flexible NoSQL document-oriented database for scalable data storage.', icon: '🍃' },
    { dbType: 'clickhouse', title: 'ClickHouse', desc: 'Column-oriented DBMS optimized for real-time analytical queries.', icon: '📊' }
  ];

  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="modal-content fade-in" style={{ maxWidth: 840, width: '90%', padding: '1.5rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
              New Resource <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>Environment: production</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>Deploy applications, databases, or third-party services on your server.</p>
          </div>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>

        {step === 'type' ? (
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 6 }}>
            {/* Apps Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>Applications</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {APP_RESOURCES.map(r => (
                  <div 
                    key={r.id} 
                    onClick={() => handleSelectResource(r)}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    className="hover-glow"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '1.25rem' }}>{r.icon}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{r.title}</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* DB Section */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>Databases</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {DB_RESOURCES.map(r => (
                  <div 
                    key={r.dbType} 
                    onClick={() => handleSelectResource({ type: 'database', dbType: r.dbType })}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    className="hover-glow"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '1.25rem' }}>{r.icon}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{r.title}</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.desc}</p>
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
                  <span style={{ fontSize: '1.1rem' }}>⚙️</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Configuring {subType === 'github' ? 'Git Application' : 'Docker Application'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Setup the name and deployment parameters for the container.
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Service Name *</label>
                  <input className="form-input" placeholder="e.g. production-api" value={form.name} onChange={set('name')} autoFocus />
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
                      <div className="form-group">
                        <label className="form-label">Personal Access Token (GitHub Token)</label>
                        <input className="form-input" type="password" placeholder="ghp_xxxxxxxxxxxx" value={form.token} onChange={set('token')} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Exposed Container Port</label>
                      <input className="form-input" placeholder="e.g. 3000" value={form.port} onChange={set('port')} />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(79,110,247,0.06)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(79,110,247,0.1)' }}>
                  <span style={{ fontSize: '1.1rem' }}>💾</span>
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
                  <select className="form-input" value={dbType} onChange={e => setDbType(e.target.value)}>
                    {(DB_VERSIONS[dbType.split(':')[0]] || [dbType]).map(v => (
                      <option key={v} value={v}>
                        {v.includes(':') ? `${v.split(':')[0].toUpperCase()} ${v.split(':')[1]}` : v.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Database Instance Name *</label>
                  <input className="form-input" placeholder={`my-${dbType.split(':')[0]}`} value={form.name} onChange={set('name')} autoFocus />
                </div>
              </div>
            )}

            {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ {error}</p>}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setStep('type')}>Back</button>
              <button className="btn btn-primary" onClick={submit} disabled={loading}>
                {loading ? 'Creating...' : `Deploy Now`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Env Vars Editor ───────────────────────────────────────────────────────────
function EnvVarsPanel({ serviceId }) {
  const [vars, setVars] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [show, setShow] = useState({});
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    servicesApi.getEnvVars(serviceId).then(setVars).catch(() => {});
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

  return (
    <div>
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
                    <button className="btn btn-ghost" style={{ padding: 3 }} onClick={() => setShow(s => ({ ...s, [ev.key]: !s[ev.key] }))}>
                      {show[ev.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: 3 }} onClick={() => copy(ev.value)}><Copy size={12} /></button>
                  </div>
                </td>
                <td>
                  <button className="btn btn-ghost" style={{ padding: 3, color: 'var(--red)' }} onClick={() => remove(ev.key)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="KEY" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace' }} />
        <input className="form-input" placeholder="value" value={newVal} onChange={e => setNewVal(e.target.value)} style={{ flex: 2 }} />
        <button className="btn btn-primary btn-sm" onClick={add}>
          {saved ? <><Check size={14} /> Saved</> : <><Plus size={14} /> Add</>}
        </button>
      </div>
    </div>
  );
}

// ── Deployments Panel ─────────────────────────────────────────────────────────
function DeploymentsPanel({ serviceId }) {
  const [deps, setDeps] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    servicesApi.deployments(serviceId).then(setDeps).catch(() => {});
    const t = setInterval(() => servicesApi.deployments(serviceId).then(setDeps).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [serviceId]);

  const statusColor = { running: 'var(--green)', building: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)' };

  return (
    <div>
      {deps.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No deployments yet. Click <strong>Deploy</strong> to start.
        </div>
      )}
      {deps.map(d => (
        <div key={d.id} className="card" style={{ marginBottom: '0.75rem', padding: '1rem', cursor: 'pointer' }} onClick={() => setOpen(open === d.id ? null : d.id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[d.status] || 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500, flex: 1 }}>{d.status}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{new Date(d.started_at).toLocaleString()}</span>
            <ChevronRight size={14} color="var(--text-muted)" style={{ transform: open === d.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {open === d.id && d.log && (
            <pre style={{ marginTop: '0.75rem', background: '#0d1117', borderRadius: 8, padding: '0.75rem', fontSize: '0.8rem', color: '#e2e8f0', overflow: 'auto', maxHeight: 300, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>
              {d.log}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Service Card ──────────────────────────────────────────────────────────────
function ServiceCard({ svc, onDeploy, onDelete }) {
  const [deploying, setDeploying] = useState(false);
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)', creating: 'var(--yellow)' };

  const handleDeploy = async (e) => {
    e.stopPropagation();
    setDeploying(true);
    try { await onDeploy(svc.id); } finally { setDeploying(false); }
  };

  return (
    <div className="card hover-glow" style={{ padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {svc.type === 'database' ? <Database size={18} color="var(--accent)" /> : <Package size={18} color="var(--accent)" />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{svc.name}</span>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[svc.status] || 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.8rem', color: statusColor[svc.status] || 'var(--text-muted)', textTransform: 'capitalize' }}>{svc.status}</span>
            {svc.type === 'database' && <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{svc.image || 'database'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: '0.8125rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {svc.git_repo_url && <span><GitBranch size={11} style={{ display: 'inline' }} /> {svc.git_repo_url.replace('https://github.com/', '')}</span>}
            {svc.port > 0    && <span><Globe size={11} style={{ display: 'inline' }} /> :{svc.port}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={handleDeploy} disabled={deploying}>
            {deploying ? <RefreshCw size={13} className="spin" /> : <Play size={13} />} {svc.type === 'database' ? 'Recreate' : 'Deploy'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); onDelete(svc.id); }}><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
}

// ── Container Logs Panel ──────────────────────────────────────────────────────
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
        <button className="btn btn-ghost btn-sm" onClick={fetchLogs}><RefreshCw size={12} /> Refresh</button>
      </div>
      <pre style={{
        background: '#0d1117',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.75rem',
        fontSize: '0.8rem',
        color: '#e2e8f0',
        overflow: 'auto',
        maxHeight: 320,
        fontFamily: 'JetBrains Mono, monospace',
        whiteSpace: 'pre-wrap',
      }}>
        {logs}
      </pre>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({ service, onUpdate }) {
  const [name, setName] = useState(service.name);
  const [image, setImage] = useState(service.image || '');
  const [port, setPort] = useState(service.port || '');
  const [gitUrl, setGitUrl] = useState(service.git_repo_url || '');
  const [branch, setBranch] = useState(service.git_branch || 'main');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setName(service.name);
    setImage(service.image || '');
    setPort(service.port || '');
    setGitUrl(service.git_repo_url || '');
    setBranch(service.git_branch || 'main');
  }, [service]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await servicesApi.update(service.id, {
        name: name.trim(),
        image: image.trim(),
        port: Number(port) || 0,
        git_repo_url: gitUrl.trim(),
        git_branch: branch.trim(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    }
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
      <div className="form-group">
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Resource Name</label>
        <input className="form-input form-input-sm" value={name} onChange={e => setName(e.target.value)} />
      </div>

      {service.type === 'database' ? (
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Database Engine</label>
          <input className="form-input form-input-sm" value={image} onChange={e => setImage(e.target.value)} placeholder="e.g. postgres, redis, mysql" />
        </div>
      ) : (
        <>
          {gitUrl ? (
            <>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Git Repository URL</label>
                <input className="form-input form-input-sm" value={gitUrl} onChange={e => setGitUrl(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Branch</label>
                <input className="form-input form-input-sm" value={branch} onChange={e => setBranch(e.target.value)} />
              </div>
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
        </>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>⚠️ {error}</div>}
      {success && <div style={{ color: 'var(--green)', fontSize: '0.75rem' }}>✓ Settings saved successfully!</div>}

      <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ marginTop: 6, alignSelf: 'flex-end' }}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

// ── Main ProjectDetail ────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject]   = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('deployments');
  const [activeSvc, setActiveSvc] = useState(null);

  const load = useCallback(async () => {
    try {
      const [proj, svcs] = await Promise.all([
        projectsApi.get(id),
        servicesApi.listByProject(id),
      ]);
      setProject(proj?.data || proj);
      setServices(svcs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const handleDeploy = async (svcId) => {
    await servicesApi.deploy(svcId);
    setTimeout(load, 500);
  };

  const handleDelete = async (svcId) => {
    if (!confirm('Delete this service? This will stop and remove its container.')) return;
    await servicesApi.delete(svcId);
    setServices(s => s.filter(x => x.id !== svcId));
    if (activeSvc === svcId) setActiveSvc(null);
  };

  const handleCreated = (svc) => {
    setServices(s => [svc, ...s]);
    setShowModal(false);
    setActiveSvc(svc.id);
    setActiveTab('deployments');
  };

  const apps = services.filter(s => s.type === 'app');
  const dbs  = services.filter(s => s.type === 'database');
  const selectedSvc = services.find(s => s.id === activeSvc);
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)', creating: 'var(--yellow)' };

  if (loading) return <div className="page-content"><div className="spinner" /></div>;

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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Resource</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Applications', val: apps.length,  icon: Package,  color: 'var(--accent)' },
          { label: 'Databases',    val: dbs.length,   icon: Database, color: 'var(--blue)' },
          { label: 'Running',      val: services.filter(s => s.status === 'running').length, icon: Play, color: 'var(--green)' },
        ].map(st => (
          <div key={st.label} className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${st.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <st.icon size={18} color={st.color} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{st.val}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: activeSvc ? '1fr 380px' : '1fr', gap: '1rem' }}>
        {/* Left: service list */}
        <div>
          {apps.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Applications</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {dbs.map(s => (
                  <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('deployments'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
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
              <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={15} /> Add Resource</button>
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {activeSvc && selectedSvc && (
          <div className="card" style={{ padding: '1.25rem', height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>{selectedSvc.name}</span>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[selectedSvc.status] || 'var(--text-muted)' }} />
                  <span style={{ fontSize: '0.75rem', color: statusColor[selectedSvc.status] || 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>{selectedSvc.status}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Type: {selectedSvc.type === 'database' ? `${selectedSvc.image || 'Database'}` : 'Application'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-primary btn-sm" onClick={() => { handleDeploy(selectedSvc.id); setActiveTab('deployments'); }}>
                  <Play size={12} style={{ marginRight: 4 }} /> Deploy
                </button>
                <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setActiveSvc(null)}><X size={15} /></button>
              </div>
            </div>

            <div className="tabs">
              <button className={`tab-btn ${activeTab === 'deployments' ? 'active' : ''}`} onClick={() => setActiveTab('deployments')}>Deployments</button>
              <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Logs</button>
              <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><Settings size={12} style={{ marginRight: 4 }} />Settings</button>
              <button className={`tab-btn ${activeTab === 'envvars' ? 'active' : ''}`} onClick={() => setActiveTab('envvars')}>Env Vars</button>
            </div>

            {activeTab === 'deployments' && <DeploymentsPanel serviceId={activeSvc} />}
            {activeTab === 'logs'        && <ContainerLogsPanel serviceId={activeSvc} />}
            {activeTab === 'settings'    && <SettingsPanel service={selectedSvc} onUpdate={load} />}
            {activeTab === 'envvars'     && <EnvVarsPanel serviceId={activeSvc} />}
          </div>
        )}
      </div>

      {showModal && <AddServiceModal projectId={id} onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}

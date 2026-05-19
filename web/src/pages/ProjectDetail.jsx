import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { servicesApi, projectsApi } from '../api/client';
import { Plus, Play, Trash2, RefreshCw, ChevronRight, GitBranch, Package, Database, Globe, Settings, Eye, EyeOff, Copy, X, Check } from 'lucide-react';

// ── Add Service Modal ─────────────────────────────────────────────────────────
function AddServiceModal({ projectId, onClose, onCreated }) {
  const [step, setStep] = useState('type'); // type | config
  const [type, setType] = useState('app');
  const [subType, setSubType] = useState('docker'); // docker | github
  const [dbType, setDbType] = useState('postgres');
  const [form, setForm] = useState({ name: '', image: '', port: '', gitUrl: '', branch: 'main', token: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name) { setError('Name is required'); return; }
    setLoading(true); setError('');
    try {
      let svc;
      if (type === 'database') {
        svc = await servicesApi.createDB(projectId, { name: form.name, db_type: dbType });
      } else if (subType === 'github') {
        svc = await servicesApi.createApp(projectId, { name: form.name, git_repo_url: form.gitUrl, git_branch: form.branch, git_token: form.token, port: Number(form.port) || 0 });
      } else {
        svc = await servicesApi.createApp(projectId, { name: form.name, image: form.image, port: Number(form.port) || 0 });
      }
      onCreated(svc);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const DB_TYPES = [
    { id: 'postgres', icon: '🐘', label: 'PostgreSQL' },
    { id: 'mysql',    icon: '🐬', label: 'MySQL' },
    { id: 'redis',    icon: '🔴', label: 'Redis' },
    { id: 'mongo',    icon: '🍃', label: 'MongoDB' },
  ];

  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="modal-content fade-in" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 className="modal-title">Add New Resource</h3>
            <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {step === 'type' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { id: 'app',      icon: Package,  label: 'Application', desc: 'Docker image or GitHub repo' },
                { id: 'database', icon: Database, label: 'Database',    desc: 'Managed Postgres, MySQL, Redis' },
              ].map(t => (
                <div key={t.id} className={`db-type-card ${type === t.id ? 'selected' : ''}`} onClick={() => setType(t.id)} style={{ padding: '1.25rem', gap: 10 }}>
                  <t.icon size={24} color={type === t.id ? 'var(--accent)' : 'var(--text-muted)'} />
                  <div className="db-type-name">{t.label}</div>
                  <div className="db-type-desc">{t.desc}</div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setStep('config')}>Continue <ChevronRight size={15} /></button>
            </div>
          </>
        ) : (
          <>
            {type === 'app' && (
              <>
                <div className="tabs" style={{ marginBottom: '1rem' }}>
                  <button className={`tab-btn ${subType === 'docker' ? 'active' : ''}`} onClick={() => setSubType('docker')}><Package size={13} style={{ marginRight: 6 }} />Docker Image</button>
                  <button className={`tab-btn ${subType === 'github' ? 'active' : ''}`} onClick={() => setSubType('github')}><GitBranch size={13} style={{ marginRight: 6 }} />GitHub Repo</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Service Name *</label>
                  <input className="form-input" placeholder="my-app" value={form.name} onChange={set('name')} autoFocus />
                </div>
                {subType === 'docker' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Docker Image</label>
                      <input className="form-input" placeholder="nginx:alpine" value={form.image} onChange={set('image')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Host Port</label>
                      <input className="form-input" placeholder="3000" value={form.port} onChange={set('port')} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Repository URL</label>
                      <input className="form-input" placeholder="https://github.com/user/repo" value={form.gitUrl} onChange={set('gitUrl')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Branch</label>
                      <input className="form-input" placeholder="main" value={form.branch} onChange={set('branch')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">GitHub Token (for private repos)</label>
                      <input className="form-input" type="password" placeholder="ghp_xxxxxxxxxxxx" value={form.token} onChange={set('token')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Exposed Port</label>
                      <input className="form-input" placeholder="3000" value={form.port} onChange={set('port')} />
                    </div>
                  </>
                )}
              </>
            )}

            {type === 'database' && (
              <>
                <div className="db-type-grid">
                  {DB_TYPES.map(t => (
                    <div key={t.id} className={`db-type-card ${dbType === t.id ? 'selected' : ''}`} onClick={() => setDbType(t.id)}>
                      <div className="db-type-icon">{t.icon}</div>
                      <div className="db-type-name">{t.label}</div>
                    </div>
                  ))}
                </div>
                <div className="form-group">
                  <label className="form-label">Instance Name *</label>
                  <input className="form-input" placeholder={`my-${dbType}`} value={form.name} onChange={set('name')} autoFocus />
                </div>
              </>
            )}

            {error && <p style={{ color: 'var(--red)', fontSize: '0.875rem', marginBottom: 8 }}>{error}</p>}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setStep('type')}>Back</button>
              <button className="btn btn-primary" onClick={submit} disabled={loading}>
                {loading ? 'Creating…' : `Create ${type === 'database' ? dbType : 'Service'}`}
              </button>
            </div>
          </>
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

  const handleDeploy = async () => {
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
            {svc.type === 'database' && <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{svc.type}</span>}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: '0.8125rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {svc.git_repo_url && <span><GitBranch size={11} style={{ display: 'inline' }} /> {svc.git_repo_url.replace('https://github.com/', '')}</span>}
            {svc.port > 0    && <span><Globe size={11} style={{ display: 'inline' }} /> :{svc.port}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {svc.type !== 'database' && (
            <button className="btn btn-primary btn-sm" onClick={handleDeploy} disabled={deploying}>
              {deploying ? <RefreshCw size={13} className="spin" /> : <Play size={13} />} Deploy
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onDelete(svc.id)}><Trash2 size={13} /></button>
        </div>
      </div>
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
  const [activeTab, setActiveTab] = useState('services');
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
    setActiveTab('services');
  };

  const apps = services.filter(s => s.type === 'app');
  const dbs  = services.filter(s => s.type === 'database');
  const selectedSvc = services.find(s => s.id === activeSvc);

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
                  <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('services'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
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
                  <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('envvars'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedSvc.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{selectedSvc.type}</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setActiveSvc(null)}><X size={15} /></button>
            </div>

            <div className="tabs">
              {selectedSvc.type !== 'database' && <button className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>Deployments</button>}
              <button className={`tab-btn ${activeTab === 'envvars' ? 'active' : ''}`} onClick={() => setActiveTab('envvars')}><Settings size={12} style={{ marginRight: 4 }} />Env Vars</button>
            </div>

            {activeTab === 'services' && <DeploymentsPanel serviceId={activeSvc} />}
            {activeTab === 'envvars'  && <EnvVarsPanel serviceId={activeSvc} />}
          </div>
        )}
      </div>

      {showModal && <AddServiceModal projectId={id} onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Database, Plus, RefreshCw, Copy, Eye, EyeOff, Trash2, X } from 'lucide-react';
import { servicesApi, projectsApi } from '../api/client';

const DB_TYPES = [
  {
    id: 'postgres', icon: '🐘', name: 'PostgreSQL', port: 5432,
    versions: ['postgres:18', 'postgres:17', 'postgres:16', 'postgres:15', 'postgres:14', 'postgres:13'],
    defaultVersion: 'postgres:18',
  },
  {
    id: 'mysql', icon: '🐬', name: 'MySQL', port: 3306,
    versions: ['mysql:8.3', 'mysql:8.0'],
    defaultVersion: 'mysql:8.3',
  },
  {
    id: 'mariadb', icon: '🦭', name: 'MariaDB', port: 3306,
    versions: ['mariadb:11', 'mariadb:10'],
    defaultVersion: 'mariadb:11',
  },
  {
    id: 'redis', icon: '🔴', name: 'Redis', port: 6379,
    versions: ['redis:7', 'redis:6'],
    defaultVersion: 'redis:7',
  },
  {
    id: 'mongo', icon: '🍃', name: 'MongoDB', port: 27017,
    versions: ['mongo:7', 'mongo:6', 'mongo:5'],
    defaultVersion: 'mongo:7',
  },
  {
    id: 'keydb', icon: '⚡', name: 'KeyDB', port: 6379,
    versions: ['keydb'],
    defaultVersion: 'keydb',
  },
  {
    id: 'clickhouse', icon: '🏠', name: 'ClickHouse', port: 8123,
    versions: ['clickhouse'],
    defaultVersion: 'clickhouse',
  },
];

function CreateModal({ projects, onClose, onCreated }) {
  const [selectedType, setSelectedType] = useState(DB_TYPES[0]);
  const [version, setVersion]           = useState(DB_TYPES[0].defaultVersion);
  const [name,    setName]              = useState('');
  const [projId,  setProjId]            = useState(projects[0]?.id || '');
  const [loading, setLoading]           = useState(false);
  const [error,   setError]             = useState('');

  const selectType = (t) => {
    setSelectedType(t);
    setVersion(t.defaultVersion);
  };

  const submit = async () => {
    if (!name || !projId) { setError('Name and project are required'); return; }
    setLoading(true); setError('');
    try {
      const svc = await servicesApi.createDB(projId, { name, db_type: version });
      onCreated(svc);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="modal-content fade-in" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h3 className="modal-title">Create Database</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={15} /></button>
        </div>

        {/* Type grid */}
        <div className="db-type-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px,1fr))', marginBottom: '1rem' }}>
          {DB_TYPES.map(t => (
            <div key={t.id} className={`db-type-card ${selectedType.id === t.id ? 'selected' : ''}`} onClick={() => selectType(t)}>
              <div className="db-type-icon" style={{ fontSize: '1.5rem' }}>{t.icon}</div>
              <div className="db-type-name" style={{ fontSize: '0.8rem' }}>{t.name}</div>
            </div>
          ))}
        </div>

        {/* Version */}
        {selectedType.versions.length > 1 && (
          <div className="form-group">
            <label className="form-label">Version</label>
            <select className="form-input" value={version} onChange={e => setVersion(e.target.value)}>
              {selectedType.versions.map(v => (
                <option key={v} value={v}>{v.replace(`${selectedType.id}:`, '')}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Instance Name</label>
          <input className="form-input" placeholder={`my-${selectedType.id}`} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>

        <div className="form-group">
          <label className="form-label">Project</label>
          <select className="form-input" value={projId} onChange={e => setProjId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Summary */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Image: </strong>
          <code style={{ fontFamily: 'JetBrains Mono,monospace' }}>{version}</code>
          <span style={{ marginLeft: 12 }}>Port: {selectedType.port}</span>
          <span style={{ marginLeft: 12 }}>Auto-credentials: ✓</span>
        </div>

        {error && <p style={{ color: 'var(--red)', fontSize: '0.875rem' }}>{error}</p>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !projId}>
            {loading ? 'Creating…' : `Create ${selectedType.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}


// connection string
function ConnString({ value }) {
  const [show, setShow] = useState(false);
  if (!value) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Generating…</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
        {show ? value : '••••••••••••••••••••••••••'}
      </code>
      <button className="btn btn-ghost" style={{ padding: 3 }} onClick={() => setShow(s => !s)}>
        {show ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button className="btn btn-ghost" style={{ padding: 3 }} onClick={() => navigator.clipboard.writeText(value)}>
        <Copy size={12} />
      </button>
    </div>
  );
}

export default function Databases() {
  const [dbs,       setDbs]       = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [envMap,    setEnvMap]    = useState({});   // svcId → CONNECTION_STRING
  const [showModal, setShowModal] = useState(false);
  const [loading,   setLoading]   = useState(true);

  const dbTypeInfo = id => DB_TYPES.find(t => t.id === id) || { icon: '🗄️', name: id };

  const load = async () => {
    try {
      const projs = await projectsApi.list();
      const projList = (projs?.data || projs || []);
      setProjects(projList);

      // Fetch services for every project, keep only databases
      const all = await Promise.all(projList.map(p =>
        servicesApi.listByProject(p.id).then(svcs => (svcs || []).filter(s => s.type === 'database')).catch(() => [])
      ));
      setDbs(all.flat());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Fetch connection strings (env vars) for each db
  useEffect(() => {
    dbs.forEach(db => {
      servicesApi.getEnvVars(db.id).then(vars => {
        const cs = vars.find(v => v.key === 'CONNECTION_STRING');
        if (cs) setEnvMap(m => ({ ...m, [db.id]: cs.value }));
      }).catch(() => {});
    });
  }, [dbs]);

  useEffect(() => { load(); }, []);

  const handleCreated = (svc) => { setDbs(d => [svc, ...d]); setShowModal(false); };

  const handleDelete = async (id) => {
    if (!confirm('Delete this database? The container and data will be removed.')) return;
    await servicesApi.delete(id);
    setDbs(d => d.filter(x => x.id !== id));
  };

  const statusBadge = s => {
    const map = { running: 'badge-green', creating: 'badge-yellow', error: 'badge-red', stopped: 'badge-gray' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>● {s}</span>;
  };

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Databases</h1>
          <p className="page-subtitle">Managed database containers across all projects.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={16} /></button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Database</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" /></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Project</th><th>Status</th><th>Port</th><th>Connection String</th><th></th></tr>
            </thead>
            <tbody>
              {dbs.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No databases yet. Click <strong>New Database</strong> to create one.
                </td></tr>
              ) : dbs.map(db => {
                const typeId = (db.image || '').split(':')[0] || (db.name?.includes('redis') ? 'redis' : db.name?.includes('mysql') ? 'mysql' : db.name?.includes('mongo') ? 'mongo' : 'postgres');
                const info = dbTypeInfo(typeId);
                return (
                  <tr key={db.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1.25rem' }}>{info.icon}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{db.name}</span>
                      </div>
                    </td>
                    <td><span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{typeId}</span></td>
                    <td>{projects.find(p => p.id === db.project_id)?.name || db.project_id}</td>
                    <td>{statusBadge(db.status)}</td>
                    <td><code style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.8125rem' }}>{db.port > 0 ? db.port : '—'}</code></td>
                    <td><ConnString value={envMap[db.id]} /></td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: 6, color: 'var(--red)' }} onClick={() => handleDelete(db.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <CreateModal projects={projects} onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}

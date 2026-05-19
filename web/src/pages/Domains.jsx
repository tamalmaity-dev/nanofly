import { useState } from 'react';
import { Globe, Plus, ShieldCheck, ShieldAlert, Clock, RefreshCw, Trash2 } from 'lucide-react';

const SAMPLE_DOMAINS = [
  { id: 1, domain: 'app.example.com',  service: 'my-app',    ssl: 'active',  project: 'Production' },
  { id: 2, domain: 'blog.example.com', service: 'blog-api',  ssl: 'pending', project: 'Production' },
  { id: 3, domain: 'staging.test.io',  service: 'staging',   ssl: 'active',  project: 'Staging' },
];

function SSLBadge({ status }) {
  if (status === 'active')  return <span className="badge badge-green"><ShieldCheck size={11} /> Active</span>;
  if (status === 'pending') return <span className="badge badge-yellow"><Clock size={11} /> Pending</span>;
  return <span className="badge badge-red"><ShieldAlert size={11} /> Error</span>;
}

function AddDomainModal({ onClose }) {
  const [domain, setDomain] = useState('');
  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="modal-content fade-in" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Custom Domain</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>NanoFly will auto-provision HTTPS via Let's Encrypt + Caddy.</p>
        </div>
        <div className="form-group">
          <label className="form-label">Domain Name</label>
          <input className="form-input" placeholder="e.g. app.yourdomain.com" value={domain} onChange={e => setDomain(e.target.value)} autoFocus />
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>DNS Setup Required:</strong> Point your domain's <code>A</code> record to this server's IP address before adding it here.
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <div data-tooltip="Caddy integration coming in Phase 4">
            <button className="btn btn-primary" disabled style={{ opacity: 0.6 }}><Plus size={16} /> Add Domain (Phase 4)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Domains() {
  const [showModal, setShowModal] = useState(false);
  const [domains] = useState(SAMPLE_DOMAINS);

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Domains & HTTPS</h1>
          <p className="page-subtitle">Automatic SSL certificates via Let's Encrypt + Caddy.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost"><RefreshCw size={16} /></button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Domain</button>
        </div>
      </div>

      {/* Info card */}
      <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 'var(--radius)', padding: '0.875rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldCheck size={18} color="var(--accent)" />
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Caddy is configured as the reverse proxy. Certificates renew automatically 30 days before expiry.
        </span>
        <span className="badge badge-yellow" style={{ marginLeft: 'auto', flexShrink: 0 }}>Phase 4</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Service</th>
              <th>Project</th>
              <th>SSL Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {domains.map(d => (
              <tr key={d.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Globe size={15} color="var(--accent)" />
                    <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{d.domain}</a>
                  </div>
                </td>
                <td><code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>{d.service}</code></td>
                <td>{d.project}</td>
                <td><SSLBadge status={d.ssl} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm"><RefreshCw size={13} /></button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <AddDomainModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

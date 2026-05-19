// src/pages/Domains.jsx — Real domain management with DNS verification
import { useState, useEffect, useCallback } from 'react';
import { Globe, Plus, ShieldCheck, ShieldAlert, Clock, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { domainsApi } from '../api/client';

function SSLBadge({ status }) {
  if (status === 'active')  return <span className="badge badge-green"><ShieldCheck size={11} /> Active</span>;
  if (status === 'pending') return <span className="badge badge-yellow"><Clock size={11} /> Pending</span>;
  return <span className="badge badge-red"><ShieldAlert size={11} /> Error</span>;
}

function AddDomainModal({ onClose, onAdded }) {
  const [domain, setDomain]   = useState('');
  const [service, setService] = useState('');
  const [project, setProject] = useState('');
  const [direction, setDirection] = useState('both');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await domainsApi.create({ domain: domain.trim(), service, project, direction });
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="modal-content fade-in" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Custom Domain</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Domain Name</label>
            <input className="form-input" placeholder="e.g. app.yourdomain.com" value={domain} onChange={e => setDomain(e.target.value)} autoFocus required />
          </div>
          <div className="form-group">
            <label className="form-label">Service (optional)</label>
            <input className="form-input" placeholder="e.g. my-app" value={service} onChange={e => setService(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Project (optional)</label>
            <input className="form-input" placeholder="e.g. Production" value={project} onChange={e => setProject(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Direction</label>
            <select className="form-input" value={direction} onChange={e => setDirection(e.target.value)}>
              <option value="both">Allow www & non-www.</option>
              <option value="www">Redirect to www</option>
              <option value="non-www">Redirect to non-www</option>
            </select>
          </div>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>DNS Setup Required:</strong> Point your domain's <code>A</code> record to this server's IP address before adding it here.
          </div>
          {error && (
            <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: '0.75rem', display: 'flex', gap: 6, alignItems: 'center' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !domain.trim()}>
              {loading ? <Loader2 size={14} className="spin" /> : <Plus size={16} />} Add Domain
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Domains() {
  const [showModal, setShowModal] = useState(false);
  const [domains, setDomains]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [deleting, setDeleting]   = useState(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await domainsApi.list();
      setDomains(res.data || res || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this domain?')) return;
    setDeleting(id);
    try {
      await domainsApi.delete(id);
      await fetchDomains();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleVerify = async (id) => {
    try {
      const res = await domainsApi.verify(id);
      if (res.data?.verified) {
        alert(`✅ DNS verified! Domain points to this server.`);
      } else {
        alert(`❌ DNS not verified.\n\nDomain IPs: ${res.data?.domain_ips?.join(', ')}\nServer IPs: ${res.data?.server_ips?.join(', ')}\n\nUpdate your DNS A record to point to this server.`);
      }
      await fetchDomains();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="page-content fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <Loader2 size={32} className="spin" color="var(--primary)" />
      </div>
    );
  }

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Domains & HTTPS</h1>
          <p className="page-subtitle">Manage custom domains and SSL certificates.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={fetchDomains}><RefreshCw size={16} /></button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Domain</button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--red)' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {domains.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Globe size={48} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.5rem' }}>No domains configured</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Add a custom domain to point traffic to your services.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Your First Domain
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Service</th>
                <th>Project</th>
                <th>Direction</th>
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
                  <td><code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>{d.service || '—'}</code></td>
                  <td>{d.project || '—'}</td>
                  <td>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {d.direction === 'both' ? 'Both' : d.direction === 'www' ? 'www only' : 'non-www only'}
                    </span>
                  </td>
                  <td><SSLBadge status={d.tls_status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" title="Verify DNS" onClick={() => handleVerify(d.id)}>
                        <CheckCircle2 size={13} />
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} title="Delete"
                        disabled={deleting === d.id} onClick={() => handleDelete(d.id)}>
                        {deleting === d.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <AddDomainModal onClose={() => setShowModal(false)} onAdded={fetchDomains} />}
    </div>
  );
}

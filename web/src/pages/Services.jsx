// src/pages/Services.jsx — Real systemd service management
import { useState, useEffect, useCallback } from 'react';
import { Server, Play, Square, RefreshCw, Search, AlertCircle, Loader2 } from 'lucide-react';
import { systemdApi } from '../api/client';

function StatusBadge({ status }) {
  if (status === 'running') return <span className="badge badge-green">● running</span>;
  if (status === 'failed')  return <span className="badge badge-red">● failed</span>;
  return <span className="badge badge-gray">○ stopped</span>;
}

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [acting, setActing]     = useState(null); // service being acted on

  const fetchServices = useCallback(async () => {
    try {
      const res = await systemdApi.list();
      setServices(res.data || res || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchServices]);

  const handleAction = async (name, action) => {
    setActing(name);
    try {
      await systemdApi[action](name);
      await new Promise(r => setTimeout(r, 1000)); // wait for systemd
      await fetchServices();
    } catch (err) {
      setError(`Failed to ${action} ${name}: ${err.message}`);
    } finally {
      setActing(null);
    }
  };

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  );

  const running = services.filter(s => s.status === 'running').length;
  const stopped = services.filter(s => s.status === 'stopped').length;
  const failed  = services.filter(s => s.status === 'failed').length;

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
          <h1 className="page-title">System Services</h1>
          <p className="page-subtitle">Manage systemd services on this server.</p>
        </div>
        <button className="btn btn-ghost" onClick={fetchServices} style={{ border: '1px solid var(--border)' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--red)' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={14} color="var(--text-muted)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {running} Running · {stopped} Stopped{failed > 0 ? ` · ${failed} Failed` : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.875rem', width: 160 }}
              placeholder="Filter services…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Service</th><th>Status</th><th>PID</th><th>Memory</th><th>Since</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Server size={14} color="var(--text-muted)" />
                    <div>
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</code>
                      {s.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.description}</div>}
                    </div>
                  </div>
                </td>
                <td><StatusBadge status={s.status} /></td>
                <td><code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>{s.pid || '—'}</code></td>
                <td>{s.memory || '—'}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{s.since || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" title="Start" disabled={s.status === 'running' || acting === s.name}
                      onClick={() => handleAction(s.name, 'start')}>
                      {acting === s.name ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
                    </button>
                    <button className="btn btn-ghost btn-sm" title="Stop" disabled={s.status === 'stopped' || acting === s.name}
                      onClick={() => handleAction(s.name, 'stop')}>
                      <Square size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" title="Restart" disabled={acting === s.name}
                      onClick={() => handleAction(s.name, 'restart')}>
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

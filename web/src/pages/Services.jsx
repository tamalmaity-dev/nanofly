import { useState } from 'react';
import { Server, Play, Square, RefreshCw, Search } from 'lucide-react';

const SERVICES = [
  { name: 'nginx',         status: 'running',  pid: 1234, cpu: '0.1%', mem: '4.2 MB',  since: '5 days ago' },
  { name: 'ssh',           status: 'running',  pid: 892,  cpu: '0.0%', mem: '2.1 MB',  since: '5 days ago' },
  { name: 'docker',        status: 'running',  pid: 1103, cpu: '0.3%', mem: '82.4 MB', since: '5 days ago' },
  { name: 'cron',          status: 'running',  pid: 1044, cpu: '0.0%', mem: '1.2 MB',  since: '5 days ago' },
  { name: 'ufw',           status: 'running',  pid: 744,  cpu: '0.0%', mem: '0.8 MB',  since: '5 days ago' },
  { name: 'snapd',         status: 'stopped',  pid: null, cpu: '—',    mem: '—',       since: '—' },
  { name: 'avahi-daemon',  status: 'stopped',  pid: null, cpu: '—',    mem: '—',       since: '—' },
  { name: 'bluetooth',     status: 'stopped',  pid: null, cpu: '—',    mem: '—',       since: '—' },
];

function StatusBadge({ status }) {
  return status === 'running'
    ? <span className="badge badge-green">● running</span>
    : <span className="badge badge-gray">○ stopped</span>;
}

export default function Services() {
  const [search, setSearch] = useState('');
  const filtered = SERVICES.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Services</h1>
          <p className="page-subtitle">Manage systemd services. Live control in Phase 6.</p>
        </div>
        <span className="badge badge-gray" style={{ padding: '6px 12px' }}>systemd · Phase 6</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={14} color="var(--text-muted)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {SERVICES.filter(s => s.status === 'running').length} Running · {SERVICES.filter(s => s.status === 'stopped').length} Stopped
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.875rem', width: 160 }}
              placeholder="Filter services…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Service</th><th>Status</th><th>PID</th><th>CPU</th><th>Memory</th><th>Since</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Server size={14} color="var(--text-muted)" />
                    <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</code>
                  </div>
                </td>
                <td><StatusBadge status={s.status} /></td>
                <td><code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>{s.pid || '—'}</code></td>
                <td>{s.cpu}</td>
                <td>{s.mem}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.since}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" title="Start" disabled={s.status === 'running'}><Play size={13} /></button>
                    <button className="btn btn-ghost btn-sm" title="Stop" disabled={s.status === 'stopped'}><Square size={13} /></button>
                    <button className="btn btn-ghost btn-sm" title="Restart"><RefreshCw size={13} /></button>
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

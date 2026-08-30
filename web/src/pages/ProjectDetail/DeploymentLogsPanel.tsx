// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { servicesApi } from '../../api/client';
import { timeAgo } from '../../utils/formatters';

function formatDuration(startedAt, finishedAt) {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function DeploymentLogPre({ logText, logRef }) {
  return (
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
      {logText}
    </pre>
  );
}

const STATUS_COLORS = {
  running: 'var(--green)',
  completed: 'var(--green)',
  building: 'var(--yellow)',
  deploying: 'var(--yellow)',
  error: 'var(--red)',
  cancelled: 'var(--text-muted)',
  idle: 'var(--text-muted)',
};

const STATUS_LABELS = {
  running: 'Success',
  completed: 'Success',
  building: 'Building',
  deploying: 'Deploying',
  error: 'Failed',
  cancelled: 'Cancelled',
  idle: 'Idle',
};

export function DeploymentLogsPanel({ serviceId }) {
  const [deps, setDeps] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const logRef = useCallback(node => {
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  const fetchDeps = useCallback(() => {
    servicesApi.deployments(serviceId).then(d => {
      setDeps(d || []);
      if (d && d.length > 0 && open === null) setOpen(d[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [serviceId, open]);

  useEffect(() => {
    fetchDeps();
    const interval = setInterval(() => {
      servicesApi.deployments(serviceId).then(d => setDeps(d || [])).catch(() => {});
    }, 1500);
    return () => clearInterval(interval);
  }, [serviceId]);

  const isBuilding = deps.some(d => d.status === 'building' || d.status === 'deploying');
  const buildingDep = deps.find(d => d.status === 'building' || d.status === 'deploying');
  const [cancelling, setCancelling] = useState(false);
  const handleCancel = async () => {
    if (!buildingDep) return;
    setCancelling(true);
    try {
      await servicesApi.cancelDeployment(serviceId, buildingDep.id);
    } catch (e) {
      console.error('Cancel failed', e);
    } finally {
      setCancelling(false);
      setTimeout(fetchDeps, 500);
    }
  };

  const filtered = deps.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (d.commit_sha || '').toLowerCase().includes(q) ||
      (d.commit_msg || '').toLowerCase().includes(q) ||
      (d.trigger || '').toLowerCase().includes(q) ||
      (d.status || '').toLowerCase().includes(q)
    );
  });

  const getStatusColor = (status) => STATUS_COLORS[status] || 'var(--text-muted)';
  const getStatusLabel = (status) => STATUS_LABELS[status] || status;
  const getSourceLabel = (trigger) => trigger === 'webhook' ? 'Webhook' : 'Manual';

  const selected = deps.find(d => d.id === open);

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
          fontSize: '0.9rem',
          color: '#f59e0b',
        }}>
          <span className="spinner" style={{ width: 16, height: 16 }} />
          <strong>Build in progress</strong> — logs are updating live…
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              marginLeft: 'auto',
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.5)',
              background: cancelling ? 'var(--bg-base)' : 'rgba(239,68,68,0.12)',
              color: 'var(--red)',
              fontSize: '0.8rem',
              cursor: cancelling ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
          >
            {cancelling ? 'Cancelling…' : 'Cancel Build'}
          </button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Search deployments..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ width: '100%', fontSize: '0.85rem' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No deployments yet. Click <strong>Redeploy</strong> to start.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
                {['Status', 'Source', 'Commit', 'Started', 'Duration', 'Server'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr
                  key={d.id}
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: open === d.id ? 'rgba(79,110,247,0.06)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: getStatusColor(d.status), flexShrink: 0 }} />
                      {getStatusLabel(d.status)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {getSourceLabel(d.trigger)}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem', maxWidth: 280 }}>
                    {d.commit_sha ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)', fontSize: '0.75rem' }}>
                          {d.commit_sha.slice(0, 7)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.commit_msg || '—'}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {d.started_at ? timeAgo(d.started_at) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {formatDuration(d.started_at, d.finished_at)}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    localhost
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden', border: '1px solid var(--accent)' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Deployment log — {getStatusLabel(selected.status)} ({getSourceLabel(selected.trigger)})
          </div>
          {selected.log ? (
            <DeploymentLogPre logText={selected.log} logRef={logRef} />
          ) : (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              {(selected.status === 'building' || selected.status === 'deploying') ? 'Starting build, logs will appear shortly...' : 'No log output.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

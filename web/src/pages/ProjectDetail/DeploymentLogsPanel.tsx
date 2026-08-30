// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { servicesApi } from '../../api/client';
import { timeAgo } from '../../utils/formatters';

function formatDuration(startedAt, finishedAt) {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getFullYear()}-${months[d.getMonth()]}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const STATUS_COLORS = {
  running: '#22c55e',
  completed: '#22c55e',
  building: '#eab308',
  deploying: '#eab308',
  error: '#ef4444',
  cancelled: '#6b7280',
  idle: '#6b7280',
};

const STATUS_LABELS = {
  running: 'Success',
  completed: 'Success',
  building: 'Building',
  deploying: 'Building',
  error: 'Failed',
  cancelled: 'Cancelled',
  idle: 'Idle',
};

const TRIGGER_LABELS = {
  webhook: 'Webhook',
  manual: 'Manual',
  github_app: 'GitHub App',
};

export function DeploymentLogsPanel({ serviceId }) {
  const [deps, setDeps] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [logFilter, setLogFilter] = useState('');
  const [page, setPage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const pageSize = 10;
  const logRef = useRef(null);
  const elapsedRef = useRef(null);
  const stickToBottomRef = useRef(true);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const handleLogScroll = useCallback(() => {
    if (!logRef.current) return;
    const distanceFromBottom = logRef.current.scrollHeight - logRef.current.scrollTop - logRef.current.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 48;
  }, []);

  // Elapsed timer for active builds
  useEffect(() => {
    const buildingDep = deps.find(d => d.status === 'building' || d.status === 'deploying');
    if (buildingDep) {
      const startMs = new Date(buildingDep.started_at).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
      tick();
      elapsedRef.current = setInterval(tick, 1000);
      return () => clearInterval(elapsedRef.current);
    } else {
      setElapsed(0);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
  }, [deps]);

  const fetchDeps = useCallback(() => {
    servicesApi.deployments(serviceId, false).then(d => {
      const newDeps = d || [];
      setDeps(previous => newDeps.map(next => {
        const previousDep = previous.find(item => item.id === next.id);
        return previousDep?.log ? { ...next, log: previousDep.log } : next;
      }));
      if (newDeps.length > 0) setOpen(current => current === null ? newDeps[0].id : current);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [serviceId]);

  useEffect(() => {
    fetchDeps();
    const interval = setInterval(() => {
      servicesApi.deployments(serviceId, false).then(d => {
        const newDeps = d || [];
        setDeps(previous => newDeps.map(next => {
          const previousDep = previous.find(item => item.id === next.id);
          return previousDep?.log ? { ...next, log: previousDep.log } : next;
        }));
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(interval);
  }, [serviceId, fetchDeps]);

  // Fetch only the selected deployment's full log. The list endpoint stays
  // lightweight, so live polling does not repeatedly transfer every history log.
  const selectedStatus = deps.find(d => d.id === open)?.status;
  useEffect(() => {
    if (!open) return undefined;
    let disposed = false;
    const loadSelected = () => {
      servicesApi.deployment(serviceId, open).then(deployment => {
        if (disposed || !deployment) return;
        setDeps(previous => previous.map(item => item.id === open ? { ...item, ...deployment } : item));
      }).catch(() => {});
    };
    loadSelected();
    const interval = selectedStatus === 'building' || selectedStatus === 'deploying'
      ? setInterval(loadSelected, 1000)
      : undefined;
    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
    };
  }, [serviceId, open, selectedStatus]);

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
  }, [deps, open, scrollToBottom]);

  const isBuilding = deps.some(d => d.status === 'building' || d.status === 'deploying');
  const buildingDep = deps.find(d => d.status === 'building' || d.status === 'deploying');

  const handleCancel = async () => {
    if (!buildingDep) return;
    if (!window.confirm('Cancel this build? The current deployment will be marked as cancelled.')) return;
    setCancelling(true);
    setCancelError('');
    try {
      await servicesApi.cancelDeployment(serviceId, buildingDep.id);
    } catch (e) {
      console.error('Cancel failed', e);
      setCancelError(e?.message || 'Could not cancel the build.');
    } finally {
      setCancelling(false);
      setTimeout(fetchDeps, 500);
    }
  };

  const handleCopy = (text) => navigator.clipboard.writeText(text).catch(() => {});
  const handleDownload = (text, name) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'deploy.log';
    a.click();
    URL.revokeObjectURL(url);
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const selected = deps.find(d => d.id === open);
  const isSelectedBuilding = selected && (selected.status === 'building' || selected.status === 'deploying');
  const isFinished = selected && (selected.status === 'running' || selected.status === 'completed' || selected.status === 'error' || selected.status === 'cancelled');

  // Format log text with timestamps
  const formatLogLine = (line) => {
    // Already has timestamp prefix
    if (line && line.length > 11 && line[4] === '-' && (line[7] === '-' || line[3] === '-')) {
      return line;
    }
    return line;
  };

  return (
    <div>
      {/* Build in progress banner */}
      {isBuilding && (
        <div style={{
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: 8,
          padding: '0.6rem 1rem',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '0.85rem',
          color: '#eab308',
        }}>
          <span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#eab308' }} />
          <strong>Build in progress</strong>
          <span style={{ color: 'var(--text-muted)' }}>— logs update live</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {elapsed > 0 ? `Elapsed: ${formatDuration(buildingDep?.started_at, null)}` : ''}
          </span>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.12)',
              color: '#f87171',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: cancelling ? 'wait' : 'pointer',
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            {cancelling ? 'Cancelling…' : 'Cancel Build'}
          </button>
        </div>
      )}
      {cancelError && (
        <div style={{ color: '#f87171', fontSize: '0.78rem', margin: '-0.35rem 0 0.75rem' }} role="alert">
          {cancelError}
        </div>
      )}

      {/* Search and controls */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="Search deployments..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-base)',
            color: 'var(--text-primary)',
            fontSize: '0.84rem',
            outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8 }}>
          No deployments yet. Click <strong>Redeploy</strong> to start.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
                {['Status', 'Source', 'Commit', 'Started', 'Duration'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map(d => (
                <tr
                  key={d.id}
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: open === d.id ? 'rgba(124,58,237,0.08)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: getStatusColor(d.status) + '18',
                      border: `1px solid ${getStatusColor(d.status)}40`,
                      color: getStatusColor(d.status),
                      fontSize: '0.74rem',
                      fontWeight: 600,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: getStatusColor(d.status), flexShrink: 0 }} />
                      {getStatusLabel(d.status)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {TRIGGER_LABELS[d.trigger] || d.trigger || 'Manual'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.82rem', maxWidth: 280 }}>
                    {d.commit_sha ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)', fontSize: '0.74rem', fontWeight: 600 }}>
                          {d.commit_sha.slice(0, 7)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                          {d.commit_msg || '—'}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {d.started_at ? timeAgo(d.started_at) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatDuration(d.started_at, d.finished_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-base)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>{filtered.length === 0 ? '0 of 0' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}`}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: page === 0 ? 'transparent' : 'var(--bg-card)', color: 'var(--text-secondary)', cursor: page === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: page === 0 ? 0.4 : 1 }}
              >
                ←
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: page >= totalPages - 1 ? 'transparent' : 'var(--bg-card)', color: 'var(--text-secondary)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: page >= totalPages - 1 ? 0.4 : 1 }}
              >
                →
              </button>
            </span>
          </div>
        </div>
      )}

      {/* Log viewer */}
      {selected && (
        <div style={{ marginTop: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid #2a1a3a', background: '#1a1025' }}>
          {/* Log toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 10px',
            background: '#231230',
            borderBottom: '1px solid #2a1a3a',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button title="Scroll to top" onClick={() => { if (logRef.current) logRef.current.scrollTop = 0; }} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #3a2550', background: '#2a1a3a', color: '#c4b5e0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>↑</button>
              <button title="Scroll to bottom" onClick={scrollToBottom} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #3a2550', background: '#2a1a3a', color: '#c4b5e0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>↓</button>
              <button title="Copy logs" onClick={() => handleCopy(selected.log || '')} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #3a2550', background: '#2a1a3a', color: '#c4b5e0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>⧉</button>
              <button title="Download logs" onClick={() => handleDownload(selected.log || '', `deploy-${selected.id.slice(0,7)}.log`)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #3a2550', background: '#2a1a3a', color: '#c4b5e0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>⭳</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 6 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: isSelectedBuilding ? 'rgba(234,179,8,0.15)' : isFinished ? (selected.status === 'error' ? 'rgba(239,68,68,0.15)' : selected.status === 'cancelled' ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.15)') : 'rgba(107,114,128,0.15)',
                border: `1px solid ${isSelectedBuilding ? 'rgba(234,179,8,0.3)' : isFinished ? (selected.status === 'error' ? 'rgba(239,68,68,0.3)' : selected.status === 'cancelled' ? 'rgba(107,114,128,0.3)' : 'rgba(34,197,94,0.3)') : 'rgba(107,114,128,0.3)'}`,
                color: isSelectedBuilding ? '#eab308' : isFinished ? (selected.status === 'error' ? '#ef4444' : selected.status === 'cancelled' ? '#9ca3af' : '#22c55e') : '#9ca3af',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSelectedBuilding ? '#eab308' : isFinished ? (selected.status === 'error' ? '#ef4444' : selected.status === 'cancelled' ? '#9ca3af' : '#22c55e') : '#9ca3af', display: 'inline-block', animation: isSelectedBuilding ? 'pulse 1.5s infinite' : 'none' }} />
                {isSelectedBuilding ? 'Building' : isFinished ? (selected.status === 'error' ? 'Failed' : selected.status === 'cancelled' ? 'Cancelled' : 'Finished') : selected.status}
              </span>
              {selected.started_at && (
                <span style={{ fontSize: '0.71rem', color: '#8b7ab0', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatTimestamp(selected.started_at)} · {formatDuration(selected.started_at, selected.finished_at)}
                </span>
              )}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              {isSelectedBuilding && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.12)',
                    color: '#f87171',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: cancelling ? 'wait' : 'pointer',
                    opacity: cancelling ? 0.6 : 1,
                  }}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel Build'}
                </button>
              )}
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Find in logs"
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                  style={{
                    padding: '5px 28px 5px 28px',
                    borderRadius: 6,
                    border: '1px solid #3a2550',
                    background: '#1a1025',
                    color: '#e0d4f5',
                    fontSize: '0.74rem',
                    width: 160,
                    outline: 'none',
                  }}
                />
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#6b5a8a', fontSize: '0.8rem' }}>⌕</span>
                {logFilter && (
                  <button
                    onClick={() => setLogFilter('')}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8b7ab0', cursor: 'pointer', fontSize: '0.9rem' }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Log content */}
          {selected.log ? (
            <pre
              ref={logRef}
              onScroll={handleLogScroll}
              style={{
                margin: 0,
                background: '#1a1025',
                padding: '12px 16px',
                fontSize: '0.74rem',
                color: '#e879a0',
                overflow: 'auto',
                maxHeight: 500,
                fontFamily: 'JetBrains Mono, Consolas, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.65,
              }}
            >
              {(() => {
                const text = logFilter
                  ? selected.log.split('\n').filter(l => l.toLowerCase().includes(logFilter.toLowerCase())).join('\n')
                  : selected.log;
                return text;
              })()}
            </pre>
          ) : (
            <div style={{ padding: '1.5rem', color: '#8b7ab0', fontSize: '0.82rem', textAlign: 'center', background: '#1a1025' }}>
              {isSelectedBuilding ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderTopColor: '#eab308' }} />
                  Starting build, logs will appear shortly…
                </span>
              ) : 'No log output.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getStatusColor(status) {
  return STATUS_COLORS[status] || '#6b7280';
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

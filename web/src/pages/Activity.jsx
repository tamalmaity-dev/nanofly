// src/pages/Activity.jsx — Real activity log from database
import { useState, useEffect, useCallback } from 'react';
import { Activity, ShieldCheck, GitBranch, LogIn, Settings, Trash2, Plus, Server, Globe, RefreshCw, Loader2 } from 'lucide-react';
import { activityApi } from '../api/client';
import { Button } from '../components/ui';

const TYPE_CONFIG = {
  login:    { icon: LogIn,       color: 'var(--blue)',       label: 'Auth' },
  project:  { icon: Plus,        color: 'var(--green)',      label: 'Project' },
  setup:    { icon: ShieldCheck, color: 'var(--accent)',     label: 'Setup' },
  deploy:   { icon: GitBranch,   color: 'var(--yellow)',     label: 'Deploy' },
  settings: { icon: Settings,    color: 'var(--text-muted)', label: 'Settings' },
  delete:   { icon: Trash2,      color: 'var(--red)',        label: 'Delete' },
  service:  { icon: Server,      color: 'var(--green)',      label: 'Service' },
  domain:   { icon: Globe,       color: 'var(--accent)',     label: 'Domain' },
  info:     { icon: Activity,    color: 'var(--text-muted)', label: 'Info' },
};

function timeAgo(dateStr) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export default function ActivityLog() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await activityApi.list();
      setEvents(res.data || res || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

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
          <h1 className="page-title">Activity Log</h1>
          <p className="page-subtitle">Audit trail of all deployments, logins and configuration changes.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="ghost" onClick={fetchActivity} style={{ border: '1px solid var(--border)' }} icon={RefreshCw}>
            Refresh
          </Button>
          <Activity size={20} color="var(--text-muted)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{events.length} events</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Activity size={48} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.5rem' }}>No activity yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Events will appear here as you use NanoFly — logins, deployments, and configuration changes.
          </p>
        </div>
      ) : (
        <div className="card">
          {events.map((e, idx) => {
            const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG.info;
            const Icon = cfg.icon;
            return (
              <div key={e.id} className="activity-item">
                <div className="activity-dot-col">
                  <div className="activity-dot" style={{ background: cfg.color }} />
                  {idx < events.length - 1 && <div className="activity-line" />}
                </div>
                <div className="activity-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={13} color={cfg.color} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="activity-title">{e.title}</div>
                      <div className="activity-meta">{e.meta || e.user_email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{cfg.label}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{timeAgo(e.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

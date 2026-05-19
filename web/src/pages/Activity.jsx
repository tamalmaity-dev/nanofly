import { Activity, ShieldCheck, GitBranch, LogIn, Settings, Trash2, Plus } from 'lucide-react';

const EVENTS = [
  { id: 1, type: 'login',    icon: LogIn,       color: 'var(--blue)',   title: 'Admin logged in', meta: 'Tamal · dev.tamal@gmail.com', time: '2 minutes ago' },
  { id: 2, type: 'project',  icon: Plus,        color: 'var(--green)',  title: 'Project "Nano Fly" created', meta: 'by Tamal', time: '5 minutes ago' },
  { id: 3, type: 'setup',    icon: ShieldCheck, color: 'var(--accent)', title: 'Initial admin account created', meta: 'Setup wizard completed', time: '8 minutes ago' },
  { id: 4, type: 'deploy',   icon: GitBranch,   color: 'var(--yellow)', title: 'Deployment triggered', meta: 'Branch: main · Commit: a3f92b1', time: '1 hour ago' },
  { id: 5, type: 'settings', icon: Settings,    color: 'var(--text-muted)', title: 'Settings updated', meta: 'SMTP configuration changed', time: '2 hours ago' },
  { id: 6, type: 'delete',   icon: Trash2,      color: 'var(--red)',    title: 'Service "old-app" deleted', meta: 'by Tamal', time: '1 day ago' },
];

const TYPE_LABELS = { login: 'Auth', project: 'Project', setup: 'Setup', deploy: 'Deploy', settings: 'Settings', delete: 'Delete' };

export default function ActivityLog() {
  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity Log</h1>
          <p className="page-subtitle">Audit trail of all deployments, logins and configuration changes.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Activity size={20} color="var(--text-muted)" style={{ alignSelf: 'center' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{EVENTS.length} events</span>
        </div>
      </div>

      <div className="card">
        {EVENTS.map((e, idx) => {
          const Icon = e.icon;
          return (
            <div key={e.id} className="activity-item">
              <div className="activity-dot-col">
                <div className="activity-dot" style={{ background: e.color }} />
                {idx < EVENTS.length - 1 && <div className="activity-line" />}
              </div>
              <div className="activity-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={13} color={e.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="activity-title">{e.title}</div>
                    <div className="activity-meta">{e.meta}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{TYPE_LABELS[e.type]}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{e.time}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

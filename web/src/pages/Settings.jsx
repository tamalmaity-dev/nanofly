import { useState, useEffect } from 'react';
import { useAuth } from '../store/auth';
import { Save, Key, Bell, Shield, User, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { updateApi } from '../api/client';

const TABS = [
  { id: 'general',  label: 'General',      icon: User },
  { id: 'security', label: 'Security',     icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api',      label: 'API Keys',     icon: Key },
  { id: 'updates',  label: 'Updates',      icon: RefreshCw },
];

function Toggle({ defaultChecked = false }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={() => setChecked(c => !c)} />
      <span className="toggle-slider" />
    </label>
  );
}

function GeneralTab({ user }) {
  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Panel Information</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Panel Name</div>
            <div className="settings-row-desc">Shown in browser tab and email notifications</div>
          </div>
          <input className="form-input" style={{ maxWidth: 240 }} defaultValue="NanoFly Panel" />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Panel URL</div>
            <div className="settings-row-desc">The public URL of this panel</div>
          </div>
          <input className="form-input" style={{ maxWidth: 240 }} placeholder="https://panel.yourdomain.com" />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Your Profile</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Display Name</div>
          </div>
          <input className="form-input" style={{ maxWidth: 240 }} defaultValue={user?.name || 'Admin'} />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Email Address</div>
          </div>
          <input className="form-input" style={{ maxWidth: 240 }} defaultValue={user?.email} />
        </div>
      </div>

      <button className="btn btn-primary"><Save size={15} /> Save Changes</button>
    </div>
  );
}

function SecurityTab() {
  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Authentication</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Change Password</div>
            <div className="settings-row-desc">Use a strong password of at least 12 characters</div>
          </div>
          <button className="btn btn-ghost" style={{ border: '1px solid var(--border)' }}>Change Password</button>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">JWT Session Duration</div>
            <div className="settings-row-desc">How long login sessions last</div>
          </div>
          <select className="form-input" style={{ maxWidth: 180 }}>
            <option>24 hours</option>
            <option>7 days</option>
            <option>30 days</option>
          </select>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">Access Control</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Require HTTPS</div>
            <div className="settings-row-desc">Redirect all HTTP traffic to HTTPS</div>
          </div>
          <Toggle defaultChecked={true} />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Login Rate Limiting</div>
            <div className="settings-row-desc">Block IPs after 5 failed login attempts</div>
          </div>
          <Toggle defaultChecked={true} />
        </div>
      </div>
      <button className="btn btn-primary"><Save size={15} /> Save Changes</button>
    </div>
  );
}

function NotificationsTab() {
  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">SMTP Email</div>
        <div className="settings-row">
          <div><div className="settings-row-label">SMTP Host</div></div>
          <input className="form-input" style={{ maxWidth: 240 }} placeholder="smtp.gmail.com" />
        </div>
        <div className="settings-row">
          <div><div className="settings-row-label">SMTP Port</div></div>
          <input className="form-input" style={{ maxWidth: 120 }} placeholder="587" />
        </div>
        <div className="settings-row">
          <div><div className="settings-row-label">Username</div></div>
          <input className="form-input" style={{ maxWidth: 240 }} placeholder="you@gmail.com" />
        </div>
        <div className="settings-row">
          <div><div className="settings-row-label">Password</div></div>
          <input type="password" className="form-input" style={{ maxWidth: 240 }} placeholder="App password" />
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">Alert Events</div>
        {[
          { label: 'Deployment failed', desc: 'Email when a deployment fails' },
          { label: 'High CPU usage', desc: 'Alert when CPU > 90% for 5 minutes' },
          { label: 'Disk space warning', desc: 'Alert when disk usage > 85%' },
          { label: 'New login', desc: 'Email on every admin login' },
        ].map(row => (
          <div className="settings-row" key={row.label}>
            <div>
              <div className="settings-row-label">{row.label}</div>
              <div className="settings-row-desc">{row.desc}</div>
            </div>
            <Toggle />
          </div>
        ))}
      </div>
      <button className="btn btn-primary"><Save size={15} /> Save Settings</button>
    </div>
  );
}

function ApiKeysTab() {
  return (
    <div>
      <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 'var(--radius)', padding: '0.875rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        <Key size={14} style={{ display: 'inline', marginRight: 6 }} />
        API keys allow external tools to interact with NanoFly over HTTP. Treat them like passwords.
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
          <Key size={32} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: '0.875rem' }}>No API keys yet</span>
          <button className="btn btn-primary btn-sm"><Key size={14} /> Generate API Key</button>
        </div>
      </div>
    </div>
  );
}

function UpdatesTab() {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [info, setInfo] = useState(null);
  const [updateLog, setUpdateLog] = useState('');
  const [updateStatus, setUpdateStatus] = useState('idle');

  const checkUpdates = async (silent = false) => {
    if (!silent) setChecking(true);
    try {
      const data = await updateApi.check();
      setInfo(data);
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  const pollHealthAndReload = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        window.location.reload();
      } else {
        setTimeout(pollHealthAndReload, 1500);
      }
    } catch (e) {
      setTimeout(pollHealthAndReload, 1500);
    }
  };

  const checkStatus = async (isUpdating = false) => {
    try {
      const data = await updateApi.log();
      setUpdateStatus(data.status);
      setUpdateLog(data.log || '');
      
      if (data.status === 'pull' || data.status === 'build_front' || data.status === 'build_back') {
        setUpdating(true);
        setTimeout(() => checkStatus(true), 2000);
      } else if (data.status === 'done') {
        setUpdating(true);
        setUpdateStatus('restarting');
        setUpdateLog(prev => prev + `\n[System] Reconnecting to the new panel version...`);
        setTimeout(pollHealthAndReload, 3500);
      } else {
        setUpdating(false);
      }
    } catch (err) {
      if (isUpdating) {
        setUpdateStatus('restarting');
        setUpdateLog(prev => prev + `\n[System] Connection lost. Reconnecting...`);
        setTimeout(pollHealthAndReload, 2000);
      } else {
        console.error(err);
        setUpdating(false);
      }
    }
  };

  const applyUpdate = async () => {
    setUpdating(true);
    setUpdateStatus('pull');
    setUpdateLog('Initializing update...\n');
    try {
      await updateApi.apply();
      setTimeout(() => checkStatus(true), 1000);
    } catch (err) {
      setUpdateLog(prev => prev + `\nError initiating update: ${err.message}`);
      setUpdating(false);
      setUpdateStatus('error');
    }
  };

  useEffect(() => {
    checkUpdates();
    checkStatus();
  }, []);

  return (
    <div className="fade-in">
      <div className="settings-section">
        <div className="settings-section-title">NanoFly System Updates</div>
        <div className="settings-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="settings-row-label">Current Version / Commit</div>
            <div className="settings-row-desc" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
              {info?.current_commit || '0.1.0'}
            </div>
          </div>
          <div>
            <div className="settings-row-label">Latest Available</div>
            <div className="settings-row-desc" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
              {info?.latest_commit || '0.1.0'}
            </div>
          </div>
          <button 
            className="btn btn-ghost" 
            style={{ border: '1px solid var(--border)' }}
            onClick={() => checkUpdates()}
            disabled={checking || updating}
          >
            <RefreshCw size={14} className={checking ? 'spin' : ''} /> Check
          </button>
        </div>

        {info?.has_update && (
          <div className="card" style={{ background: 'rgba(79,110,247,0.06)', border: '1px solid rgba(79,110,247,0.15)', marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <AlertCircle size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>New Update Available</h4>
                <p style={{ margin: '0.25rem 0 0.75rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {info.latest_message} (Released {info.latest_date ? new Date(info.latest_date).toLocaleDateString() : ''})
                </p>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={applyUpdate}
                  disabled={updating}
                >
                  <RefreshCw size={12} className={updating ? 'spin' : ''} /> Install Update Now
                </button>
              </div>
            </div>
          </div>
        )}

        {!info?.has_update && info && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '1rem 0 1.5rem 0', color: 'var(--success)', fontSize: '0.9rem' }}>
            <CheckCircle2 size={16} />
            <span>Your panel is up to date!</span>
          </div>
        )}
      </div>

      {(updating || updateLog) && (
        <div className="settings-section">
          <div className="settings-section-title">Update Status: <span style={{ textTransform: 'capitalize', color: updateStatus === 'error' ? 'var(--danger)' : updateStatus === 'done' ? 'var(--success)' : 'var(--primary)' }}>{updateStatus.replace('_', ' ')}</span></div>
          <pre 
            style={{
              background: '#0d1117',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '1rem',
              color: '#c9d1d9',
              fontFamily: 'monospace',
              fontSize: '0.825rem',
              maxHeight: '300px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {updateLog}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('general');
  const { user } = useAuth();

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Panel configuration and preferences.</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={14} style={{ display: 'inline', marginRight: 6 }} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'general'       && <GeneralTab user={user} />}
      {tab === 'security'      && <SecurityTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'api'           && <ApiKeysTab />}
      {tab === 'updates'       && <UpdatesTab />}
    </div>
  );
}

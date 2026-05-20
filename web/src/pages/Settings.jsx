import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import {
  AlertCircle, Archive, Bell, CheckCircle2, Download, Key, RefreshCw,
  Save, Shield, Trash2, User
} from 'lucide-react';
import { backupsApi, settingsApi, updateApi } from '../api/client';

const TABS = [
  { id: 'general', label: 'General', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
];

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} />
      <span className="toggle-slider" />
    </label>
  );
}

function Field({ label, desc, children }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{label}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function SaveBar({ saving, saved, onSave }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
      <button className="btn btn-primary" onClick={onSave} disabled={saving}>
        <Save size={15} /> {saving ? 'Saving...' : 'Save Settings'}
      </button>
      {saved && <span style={{ color: 'var(--green)', fontSize: '0.85rem' }}>Saved</span>}
    </div>
  );
}

function GeneralTab({ settings, setSetting, onSave, saving, saved, user }) {
  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Panel Information</div>
        <Field label="Panel Name" desc="Shown in the browser tab and notifications">
          <input className="form-input" style={{ maxWidth: 280 }} value={settings['panel.name'] || ''} onChange={e => setSetting('panel.name', e.target.value)} />
        </Field>
        <Field label="Panel URL" desc="The public URL of this NanoFly panel">
          <input className="form-input" style={{ maxWidth: 280 }} placeholder="https://panel.yourdomain.com" value={settings['panel.url'] || ''} onChange={e => setSetting('panel.url', e.target.value)} />
        </Field>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">Current Admin</div>
        <Field label="Display Name">
          <input className="form-input" style={{ maxWidth: 280 }} value={user?.name || 'Admin'} disabled />
        </Field>
        <Field label="Email Address">
          <input className="form-input" style={{ maxWidth: 280 }} value={user?.email || ''} disabled />
        </Field>
      </div>
      <SaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}

function SecurityTab({ settings, setSetting, onSave, saving, saved }) {
  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Authentication</div>
        <Field label="JWT Session Duration" desc="Stored for panel auth policy">
          <select className="form-input" style={{ maxWidth: 180 }} value={settings['security.session_duration'] || '24h'} onChange={e => setSetting('security.session_duration', e.target.value)}>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
        </Field>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">Access Control</div>
        <Field label="Require HTTPS" desc="Remember this policy for reverse proxy hardening">
          <Toggle checked={settings['security.require_https']} onChange={v => setSetting('security.require_https', v)} />
        </Field>
        <Field label="Login Rate Limiting" desc="Remember this policy for auth hardening">
          <Toggle checked={settings['security.rate_limit']} onChange={v => setSetting('security.rate_limit', v)} />
        </Field>
      </div>
      <SaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}

function NotificationsTab({ settings, setSetting, onSave, saving, saved }) {
  const events = [
    ['notifications.deploy_failed', 'Deployment failed', 'Email when a deployment fails'],
    ['notifications.high_cpu', 'High CPU usage', 'Alert when CPU stays high'],
    ['notifications.disk_warning', 'Disk space warning', 'Alert when disk usage is high'],
    ['notifications.new_login', 'New login', 'Email on every admin login'],
  ];
  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">SMTP Email</div>
        <Field label="SMTP Host"><input className="form-input" style={{ maxWidth: 280 }} value={settings['notifications.smtp_host'] || ''} onChange={e => setSetting('notifications.smtp_host', e.target.value)} /></Field>
        <Field label="SMTP Port"><input className="form-input" style={{ maxWidth: 120 }} value={settings['notifications.smtp_port'] || ''} onChange={e => setSetting('notifications.smtp_port', e.target.value)} /></Field>
        <Field label="Username"><input className="form-input" style={{ maxWidth: 280 }} value={settings['notifications.smtp_user'] || ''} onChange={e => setSetting('notifications.smtp_user', e.target.value)} /></Field>
        <Field label="Password"><input type="password" className="form-input" style={{ maxWidth: 280 }} value={settings['notifications.smtp_pass'] || ''} onChange={e => setSetting('notifications.smtp_pass', e.target.value)} /></Field>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">Alert Events</div>
        {events.map(([key, label, desc]) => (
          <Field key={key} label={label} desc={desc}>
            <Toggle checked={settings[key]} onChange={v => setSetting(key, v)} />
          </Field>
        ))}
      </div>
      <SaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}

function ApiKeysTab() {
  return (
    <div>
      <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 'var(--radius)', padding: '0.875rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        <Key size={14} style={{ display: 'inline', marginRight: 6 }} />
        API key storage is reserved for the next auth hardening pass.
      </div>
    </div>
  );
}

function BackupsTab({ settings, setSetting, onSave, saving, saved }) {
  const [backups, setBackups] = useState([]);
  const [manualName, setManualName] = useState(settings['backup.name_prefix'] || 'nanofly');
  const [manualDesc, setManualDesc] = useState('Manual NanoFly backup');
  const [busy, setBusy] = useState(false);

  const load = async () => setBackups(await backupsApi.list());
  useEffect(() => { load().catch(() => {}); }, []);

  const create = async () => {
    setBusy(true);
    try {
      await backupsApi.create({ name: manualName, description: manualDesc, type: 'manual' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (file) => {
    if (!confirm(`Delete backup ${file}?`)) return;
    await backupsApi.delete(file);
    await load();
  };

  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Automatic Backups</div>
        <Field label="Enable Auto Backup" desc="Runs once per day at the configured server time">
          <Toggle checked={settings['backup.auto_enabled']} onChange={v => setSetting('backup.auto_enabled', v)} />
        </Field>
        <Field label="Backup Time" desc="24-hour server time">
          <input type="time" className="form-input" style={{ maxWidth: 160 }} value={settings['backup.time'] || '02:00'} onChange={e => setSetting('backup.time', e.target.value)} />
        </Field>
        <Field label="Retention Count" desc="Old successful backups are pruned after this count">
          <input className="form-input" style={{ maxWidth: 120 }} value={settings['backup.retention'] || '14'} onChange={e => setSetting('backup.retention', e.target.value)} />
        </Field>
        <Field label="Scheduled Backup Name">
          <input className="form-input" style={{ maxWidth: 280 }} value={settings['backup.name_prefix'] || ''} onChange={e => setSetting('backup.name_prefix', e.target.value)} />
        </Field>
        <Field label="Scheduled Description">
          <input className="form-input" style={{ maxWidth: 360 }} value={settings['backup.description'] || ''} onChange={e => setSetting('backup.description', e.target.value)} />
        </Field>
        <SaveBar saving={saving} saved={saved} onSave={onSave} />
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Manual Backup</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr auto', gap: 10, alignItems: 'center' }}>
          <input className="form-input" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="backup-name" />
          <input className="form-input" value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="Description" />
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            <Archive size={15} /> {busy ? 'Creating...' : 'Run Backup'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Backup List</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Status</th><th>Type</th><th>Size</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {backups.length === 0 && <tr><td colSpan="6">No backups yet</td></tr>}
              {backups.map(b => (
                <tr key={b.file}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.description}</div>
                  </td>
                  <td><span className={`badge ${b.status === 'success' ? 'badge-green' : 'badge-red'}`}>{b.status}</span></td>
                  <td><span className="badge badge-gray">{b.type}</span></td>
                  <td>{b.size_human || '-'}</td>
                  <td>{b.created_at ? new Date(b.created_at).toLocaleString() : '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {b.status === 'success' && (
                      <a className="btn btn-ghost btn-sm" href={backupsApi.download(b.file)}>
                        <Download size={14} />
                      </a>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(b.file)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

  const checkUpdates = async () => {
    setChecking(true);
    try { setInfo(await updateApi.check()); } finally { setChecking(false); }
  };

  const pollHealthAndReload = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) window.location.reload();
      else setTimeout(pollHealthAndReload, 1500);
    } catch { setTimeout(pollHealthAndReload, 1500); }
  };

  const checkStatus = async (isUpdating = false) => {
    try {
      const data = await updateApi.log();
      setUpdateStatus(data.status);
      setUpdateLog(data.log || '');
      if (['downloading', 'extracting', 'installing'].includes(data.status)) {
        setUpdating(true);
        setTimeout(() => checkStatus(true), 1500);
      } else if (data.status === 'done') {
        setUpdating(true);
        setUpdateStatus('restarting');
        setTimeout(pollHealthAndReload, 3500);
      } else if (data.status === 'error' || isUpdating) {
        setUpdating(false);
      }
    } catch {
      if (isUpdating) setTimeout(pollHealthAndReload, 2000);
      else setUpdating(false);
    }
  };

  const applyUpdate = async () => {
    setUpdating(true);
    setUpdateStatus('downloading');
    setUpdateLog('');
    try {
      await updateApi.apply();
      setTimeout(() => checkStatus(true), 1000);
    } catch (err) {
      setUpdateLog(`Error: ${err.message}`);
      setUpdating(false);
      setUpdateStatus('error');
    }
  };

  useEffect(() => { checkUpdates(); checkStatus(); }, []);

  return (
    <div className="fade-in">
      <div className="settings-section">
        <div className="settings-section-title">NanoFly System Updates</div>
        <div className="settings-row" style={{ alignItems: 'flex-start' }}>
          <div><div className="settings-row-label">Current Version</div><div className="settings-row-desc" style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{info?.current_version || 'dev'}</div></div>
          <div><div className="settings-row-label">Latest Available</div><div className="settings-row-desc" style={{ fontFamily: 'monospace' }}>{info?.latest_version || 'dev'}</div></div>
          <button className="btn btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={checkUpdates} disabled={checking || updating}>
            <RefreshCw size={14} className={checking ? 'spin' : ''} /> Check
          </button>
        </div>
        {info?.has_update && !updating && (
          <div className="card" style={{ background: 'rgba(79,110,247,0.06)', border: '1px solid rgba(79,110,247,0.15)', marginBottom: '1.5rem', padding: '1.25rem' }}>
            <AlertCircle size={18} style={{ color: 'var(--accent)', marginRight: 8 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{info.message || 'A new update is available.'}</span>
            <button className="btn btn-primary btn-sm" onClick={applyUpdate} disabled={updating} style={{ marginLeft: 12 }}>
              <RefreshCw size={12} /> Install
            </button>
          </div>
        )}
        {!info?.has_update && info && !updating && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '1rem 0', color: 'var(--green)', fontSize: '0.9rem' }}>
            <CheckCircle2 size={16} /> Up to date
          </div>
        )}
      </div>
      {(updating || updateStatus === 'error') && (
        <pre style={{ background: '#0d1117', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', color: '#c9d1d9', fontSize: '0.8rem', maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {updateLog || 'Waiting for update process...'}
        </pre>
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('general');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    settingsApi.get().then(setSettings).finally(() => setLoading(false));
  }, []);

  const setSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await settingsApi.save(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-content"><div className="spinner" /></div>;
  }

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Panel configuration, backups, and update management.</p>
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

      {tab === 'general' && <GeneralTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} user={user} />}
      {tab === 'security' && <SecurityTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} />}
      {tab === 'notifications' && <NotificationsTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} />}
      {tab === 'api' && <ApiKeysTab />}
      {tab === 'backups' && <BackupsTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} />}
      {tab === 'updates' && <UpdatesTab />}
    </div>
  );
}

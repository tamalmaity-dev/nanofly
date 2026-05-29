import React, { useEffect, useState, Fragment } from 'react';
import { useAuth } from '../store/auth';
import {
  AlertCircle, Archive, Bell, CheckCircle2, Download, Key, RefreshCw,
  Save, Shield, Trash2, User, Check, HardDrive, GitBranch
} from 'lucide-react';
import { backupsApi, settingsApi, updateApi } from '../api/client';

const TABS = [
  { id: 'general', label: 'General', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'system', label: 'System', icon: HardDrive },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
];

import { Field, SaveBar, Switch, Tabs, TabsContent, SelectRoot, SelectTrigger, SelectContent, SelectItem, Button, useToast } from '../components/ui';

function Toggle({ checked, onChange }) {
  return (
    <Switch
      checked={checked === 'true'}
      onCheckedChange={checkedState => onChange(checkedState ? 'true' : 'false')}
    />
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
          <SelectRoot value={settings['security.session_duration'] || '24h'} onValueChange={val => setSetting('security.session_duration', val)}>
            <SelectTrigger style={{ width: 180 }} />
            <SelectContent>
              <SelectItem value="24h">24 hours</SelectItem>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
            </SelectContent>
          </SelectRoot>
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
            <Toggle
              checked={
                key === 'notifications.deploy_failed' ? settings['notifications.deploy_failed'] :
                key === 'notifications.high_cpu' ? settings['notifications.high_cpu'] :
                key === 'notifications.disk_warning' ? settings['notifications.disk_warning'] :
                key === 'notifications.new_login' ? settings['notifications.new_login'] :
                undefined
              }
              onChange={v => {
                if (
                  key === 'notifications.deploy_failed' ||
                  key === 'notifications.high_cpu' ||
                  key === 'notifications.disk_warning' ||
                  key === 'notifications.new_login'
                ) {
                  setSetting(key, v);
                }
              }}
            />
          </Field>
        ))}
      </div>
      <SaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}

function SystemTab() {
  const toast = useToast();
  const [rebooting, setRebooting] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneOptions, setPruneOptions] = useState({
    containers: true,
    images: true,
    volumes: true,
    networks: true,
  });

  const handlePrune = async () => {
    const selectedKeys = Object.keys(pruneOptions).filter(k => pruneOptions[k]);
    if (selectedKeys.length === 0) {
      toast.error("Please select at least one resource category to prune.");
      return;
    }

    if (!confirm(`Are you sure you want to prune the selected Docker resources (${selectedKeys.join(', ')})? This will free up disk space by cleaning up selected unused items.`)) {
      return;
    }
    setPruning(true);
    try {
      const res = await settingsApi.prune(pruneOptions);
      const details = [
        res.containers_deleted ? `${res.containers_deleted} container(s)` : '',
        res.images_deleted ? `${res.images_deleted} image(s)` : '',
        res.volumes_deleted ? `${res.volumes_deleted} volume(s)` : '',
        res.networks_deleted ? `${res.networks_deleted} network(s)` : '',
      ].filter(Boolean).join(', ');
      const detailsStr = details ? ` (${details})` : '';
      toast.success(`Storage cleanup complete! Reclaimed ${res.reclaimed_human || '0 B'}${detailsStr}.`);
    } catch (err) {
      toast.error(err.message || "Failed to prune Docker resources");
    } finally {
      setPruning(false);
    }
  };

  const handleReboot = async () => {
    if (!confirm("Are you sure you want to reboot the NanoFlY Server? This will temporarily interrupt all running services and proxy routing.")) {
      return;
    }
    setRebooting(true);
    try {
      await settingsApi.reboot();
      toast.success("Reboot command sent! The VPS/Server is rebooting...");
      setTimeout(pollHealthAndReload, 5000);
    } catch (err) {
      toast.error(err.message || "Failed to reboot server");
      setRebooting(false);
    }
  };

  const pollHealthAndReload = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        window.location.reload();
      } else {
        setTimeout(pollHealthAndReload, 2000);
      }
    } catch {
      setTimeout(pollHealthAndReload, 2000);
    }
  };

  return (
    <div className="fade-in">
      <div className="settings-section">
        <div className="settings-section-title">Host Requirements</div>

        <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontWeight: 600, marginBottom: '0.5rem' }}>
            <AlertCircle size={18} />
            Important: Required Ports
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            NanoFly manages its own Reverse Proxy (Traefik) to provide automatic SSL and custom domain routing.
            <strong> Do not install Nginx, Apache, or another reverse proxy on this server.</strong>
            <br /><br />
            The following ports must be completely free and unblocked on your firewall:
            <ul style={{ margin: '0.5rem 0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li><strong>Port 80 (TCP):</strong> Required for HTTP traffic and Let's Encrypt verification.</li>
              <li><strong>Port 443 (TCP):</strong> Required for secure HTTPS traffic.</li>
            </ul>
          </div>
        </div>

        <Field label="Proxy Engine">
          <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} /> Traefik (Running)
          </div>
        </Field>
      </div>

      <div className="settings-section" style={{ marginTop: '2rem' }}>
        <div className="settings-section-title">Docker Cleanup</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Select the unused Docker resources to clean up. Pruning unreferenced items safely reclaims disk space.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { id: 'containers', label: 'Stopped Containers', desc: 'Remove stopped app and database containers.' },
            { id: 'images', label: 'Unused Images', desc: 'Remove dangling and unreferenced Docker images.' },
            { id: 'volumes', label: 'Unused Volumes', desc: 'Remove volumes not attached to any container.' },
            { id: 'networks', label: 'Unused Networks', desc: 'Remove Docker networks not in use.' },
          ].map(opt => {
            const checked = pruneOptions[opt.id];
            return (
              <div
                key={opt.id}
                onClick={() => setPruneOptions(prev => ({ ...prev, [opt.id]: !prev[opt.id] }))}
                style={{
                  display: 'flex',
                  gap: '0.875rem',
                  padding: '1.125rem',
                  background: checked ? 'rgba(79, 110, 247, 0.05)' : 'var(--bg-elevated)',
                  border: checked ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  transition: 'all var(--transition)',
                }}
                className="prune-option-card"
              >
                <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', marginTop: '2px' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}} // parent click toggles it
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {opt.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Field label="Clean Storage Cache" desc="Prune selected Docker resource categories to reclaim host system storage space.">
          <Button
            variant="outline"
            onClick={handlePrune}
            loading={pruning}
            icon={Trash2}
          >
            Clean Storage Cache
          </Button>
        </Field>
      </div>

      <div className="settings-section" style={{ marginTop: '2rem' }}>
        <div className="settings-section-title" style={{ color: 'var(--red)' }}>Danger Zone</div>
        <Field label="Reboot VPS / Server" desc="Gracefully restart the host virtual private server. Active deployments, web sockets, and proxy routing will be temporarily offline.">
          <Button
            variant="danger"
            onClick={handleReboot}
            loading={rebooting}
            icon={RefreshCw}
          >
            Reboot Server
          </Button>
        </Field>
      </div>
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
  const toast = useToast();
  const [backups, setBackups] = useState([]);
  const [manualName, setManualName] = useState(settings['backup.name_prefix'] || 'nanofly');
  const [manualDesc, setManualDesc] = useState('Manual NanoFly backup');
  const [busy, setBusy] = useState(false);

  const load = async () => setBackups(await backupsApi.list());
  useEffect(() => { load().catch(() => { }); }, []);

  const create = async () => {
    setBusy(true);
    try {
      await backupsApi.create({ name: manualName, description: manualDesc, type: 'manual' });
      toast.success('Backup created successfully!');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to create backup');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (file) => {
    if (!confirm(`Delete backup ${file}?`)) return;
    try {
      await backupsApi.delete(file);
      toast.success('Backup deleted successfully');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete backup');
    }
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
          <Button variant="primary" onClick={create} loading={busy} icon={Archive}>
            Run Backup
          </Button>
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
                    <Button variant="ghost" size="sm" style={{ color: 'var(--red)' }} onClick={() => remove(b.file)} icon={Trash2} />
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

function UpdateProgressSteps({ status, log }) {
  const steps = [
    { key: 'downloading', label: 'Downloading Update', desc: 'Fetching target release archives from GitHub.' },
    { key: 'extracting', label: 'Extracting Files', desc: 'Decompressing package contents locally.' },
    { key: 'installing', label: 'Installing Assets', desc: 'Replacing system binaries and running database checks.' },
    { key: 'restarting', label: 'Restarting Service', desc: 'Re-initializing the NanoFly application daemon.' }
  ];

  const getStepState = (stepKey, index) => {
    const statusOrder = ['idle', 'downloading', 'extracting', 'installing', 'restarting', 'done'];
    const currentIndex = statusOrder.indexOf(status);
    const stepIndex = statusOrder.indexOf(stepKey);

    if (status === 'error' && currentIndex <= stepIndex) {
      return 'error';
    }
    if (status === 'done') {
      return 'completed';
    }
    if (stepKey === status) {
      return 'active';
    }
    if (currentIndex > stepIndex) {
      return 'completed';
    }
    return 'pending';
  };

  return (
    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Update Progress</div>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem 1.25rem', overflowX: 'auto' }}>
        {steps.map((s, idx) => {
          const state = getStepState(s.key, idx);
          return (
            <Fragment key={s.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: state === 'pending' ? 0.45 : 1 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: state === 'completed' ? 'var(--green)' :
                    state === 'active' ? 'var(--accent)' :
                      state === 'error' ? 'var(--red)' : 'var(--bg-base)',
                  border: `1.5px solid ${state === 'pending' ? 'var(--border)' : 'transparent'}`,
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  boxShadow: state === 'active' ? '0 0 0 3px rgba(79, 110, 247, 0.25)' : 'none',
                  transition: 'all 0.3s ease',
                  flexShrink: 0
                }}>
                  {state === 'completed' ? <Check size={14} strokeWidth={3} /> :
                    state === 'active' ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} /> :
                      state === 'error' ? '!' : idx + 1}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: state === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {s.key === 'downloading' ? 'Download' : s.key === 'extracting' ? 'Extract' : s.key === 'installing' ? 'Install' : 'Restart'}
                  </div>
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div style={{
                  flex: 1,
                  height: 2,
                  background: state === 'completed' ? 'var(--green)' : 'var(--border)',
                  minWidth: 16,
                  marginLeft: 8,
                  marginRight: 8
                }} />
              )}
            </Fragment>
          );
        })}
      </div>
      {log && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Update Logs</div>
          <pre style={{
            background: '#0d1117',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            color: '#e2e8f0',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            maxHeight: 200,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace'
          }}>
            {log}
          </pre>
        </div>
      )}
    </div>
  );
}

function UpdatesTab({ settings, setSetting, onSave, saving, saved }) {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [info, setInfo] = useState(null);
  const [updateLog, setUpdateLog] = useState('');
  const [updateStatus, setUpdateStatus] = useState('idle');

  const checkUpdates = async (channelOverride) => {
    setChecking(true);
    try {
      const activeChannel = channelOverride !== undefined ? channelOverride : (settings['updates.channel'] || 'stable');
      setInfo(await updateApi.check(activeChannel));
    } finally {
      setChecking(false);
    }
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

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    checkUpdates(settings['updates.channel'] || 'stable');
  }, [settings['updates.channel']]);

  return (
    <div className="fade-in">
      <div className="settings-section">
        <div className="settings-section-title">Update Channel</div>
        <Field label="Release Channel" desc="Stable receives fully tested versions. Beta receives pre-releases.">
          <SelectRoot
            value={settings['updates.channel'] || 'stable'}
            onValueChange={val => {
              setSetting('updates.channel', val);
              settingsApi.save({ ...settings, 'updates.channel': val }).catch(() => {});
            }}
            disabled={updating}
          >
            <SelectTrigger style={{ width: 180 }} />
            <SelectContent>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="beta">Beta Channel</SelectItem>
            </SelectContent>
          </SelectRoot>
        </Field>
        <SaveBar saving={saving} saved={saved} onSave={onSave} />
      </div>

      <div className="settings-section">
        <div className="settings-section-title">NanoFly System Updates</div>
        {info?.error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius)',
            padding: '0.875rem 1.25rem',
            marginTop: '1rem',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertCircle size={16} />
            {info.error}
          </div>
        )}
        <div className="settings-row" style={{ alignItems: 'flex-start' }}>
          <div><div className="settings-row-label">Current Version</div><div className="settings-row-desc" style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{info?.current_version || 'dev'}</div></div>
          <div><div className="settings-row-label">Latest Available</div><div className="settings-row-desc" style={{ fontFamily: 'monospace' }}>{info?.latest_version || 'dev'}</div></div>
          <Button variant="ghost" style={{ border: '1px solid var(--border)' }} onClick={() => checkUpdates()} loading={checking} disabled={updating} icon={RefreshCw}>
            Check
          </Button>
        </div>

        {info?.has_update && !updating && (
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(79, 110, 247, 0.08) 0%, rgba(165, 180, 252, 0.03) 100%)',
            border: '1px solid rgba(79, 110, 247, 0.25)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1.5rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>New Version Available!</div>
              <span className="badge badge-blue" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                {info.prerelease ? 'Beta' : 'Stable'}
              </span>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              A new update is available for NanoFly. We recommend updating to keep your panel secure and up-to-date with the latest features.
            </div>

            <div style={{ display: 'flex', gap: 16, background: 'var(--bg-base)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', maxWidth: 'fit-content' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Release</span>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--accent)' }}>{info.latest_version}</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Published Date</span>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{info.published_at ? new Date(info.published_at).toLocaleDateString() : 'N/A'}</div>
              </div>
            </div>

            {info.message && (
              <div style={{ marginTop: '0.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Release Notes:</div>
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius)',
                  maxHeight: 150,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>{info.message}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: '0.5rem' }}>
              <Button variant="primary" onClick={applyUpdate} loading={updating} icon={RefreshCw}>
                Start Automatic Update
              </Button>
            </div>
          </div>
        )}

        {!info?.has_update && info && !updating && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '1rem 0', color: 'var(--green)', fontSize: '0.9rem' }}>
            <CheckCircle2 size={16} /> Up to date
          </div>
        )}
      </div>

      {(updating || updateStatus === 'error') && (
        <UpdateProgressSteps status={updateStatus} log={updateLog} />
      )}
    </div>
  );
}



export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && TABS.some(t => t.id === hash)) return hash;
    return 'general';
  });
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    settingsApi.get().then(setSettings).finally(() => setLoading(false));

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && TABS.some(t => t.id === hash)) {
        setTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
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
      toast.success('Settings saved successfully!');
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
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

      <Tabs value={tab} onValueChange={setTab} items={TABS}>
        <TabsContent value="general">
          <GeneralTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} user={user} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} />
        </TabsContent>
        <TabsContent value="api">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="backups">
          <BackupsTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} />
        </TabsContent>
        <TabsContent value="system">
          <SystemTab />
        </TabsContent>
        <TabsContent value="updates">
          <UpdatesTab settings={settings} setSetting={setSetting} onSave={save} saving={saving} saved={saved} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

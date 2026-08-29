// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, GitBranch, Search, ExternalLink,
  RefreshCw, Info, Loader2, Package, FolderGit2, Globe,
} from 'lucide-react';
import { githubApi } from '../../../api/client';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';

const STEPS = [
  { key: 'app', label: 'GitHub App', desc: 'Choose or create an app' },
  { key: 'install', label: 'Installation', desc: 'Install on GitHub' },
  { key: 'repo', label: 'Repository', desc: 'Select repository' },
  { key: 'config', label: 'Configuration', desc: 'Build settings' },
];

function StepIndicator({ current, steps }) {
  const idx = steps.findIndex(s => s.key === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 }}>
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 600,
                background: done ? 'var(--green)' : active ? 'rgba(79,110,247,0.15)' : 'var(--bg-highlight)',
                color: done ? '#fff' : active ? 'var(--blue)' : 'var(--text-muted)',
                border: active ? '2px solid var(--blue)' : done ? 'none' : '1px solid var(--border)',
                transition: 'all 0.2s',
              }}>
                {done ? <Check size={14} /> : i + 1}
              </div>
              <div style={{
                fontSize: '0.7rem', marginTop: 4, fontWeight: active ? 600 : 400,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                textAlign: 'center',
              }}>
                {s.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                height: 2, flex: 1, margin: '0 -4px', marginTop: -14,
                background: done ? 'var(--green)' : 'var(--border)',
                borderRadius: 1,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function GitHubAppWizard({ onComplete, onCancel }) {
  const toast = useToast();
  const [step, setStep] = useState('app');
  const [githubApps, setGithubApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [creatingApp, setCreatingApp] = useState(false);

  useEffect(() => {
    setLoadingApps(true);
    githubApi.listApps()
      .then(apps => setGithubApps(apps || []))
      .catch(() => setGithubApps([]))
      .finally(() => setLoadingApps(false));
  }, []);

  const installedApps = useMemo(
    () => githubApps.filter(a => a.installation_id !== 0),
    [githubApps],
  );

  const uninstalledApps = useMemo(
    () => githubApps.filter(a => a.installation_id === 0),
    [githubApps],
  );

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter(r => r.full_name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
  }, [repos, repoSearch]);

  const loadRepos = (appId) => {
    setLoadingRepos(true);
    githubApi.listRepos(appId)
      .then(r => setRepos(r || []))
      .catch(err => {
        toast.error(err.message || 'Failed to load repositories');
        setRepos([]);
      })
      .finally(() => setLoadingRepos(false));
  };

  const handleSelectExistingApp = (app) => {
    if (app.installation_id === 0) {
      setSelectedApp(app);
      setStep('install');
      return;
    }
    setSelectedApp(app);
    loadRepos(app.id);
    setStep('repo');
  };

  const handleCreateApp = () => {
    if (!newAppName.trim()) return;
    setCreatingApp(true);
    fetch('/api/v1/github/app/manifest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('nanofly_token')}`,
      },
      body: JSON.stringify({
        name: newAppName.trim(),
        host: window.location.origin,
      }),
    })
      .then(r => r.text())
      .then(html => {
        document.open();
        document.write(html);
        document.close();
      })
      .catch(() => {
        toast.error('Failed to create GitHub App');
        setCreatingApp(false);
      });
  };

  const handleInstallClick = () => {
    if (!selectedApp) return;
    window.open(
      `https://github.com/apps/${selectedApp.name}/installations/new`,
      '_blank',
    );
  };

  const handleRefreshInstallation = () => {
    if (!selectedApp) return;
    githubApi.getApp(selectedApp.id).then(updated => {
      setSelectedApp(updated);
      if (updated.installation_id !== 0) {
        toast.success('GitHub App is now installed!');
        loadRepos(updated.id);
        setStep('repo');
      } else {
        toast.info('App not yet installed. Please install it on GitHub first.');
      }
    }).catch(() => toast.error('Failed to check installation status'));
  };

  const handleRepoSelect = (repo) => {
    setSelectedRepo(repo);
  };

  const handleRepoConfirm = () => {
    if (!selectedRepo || !selectedApp) return;
    onComplete({
      githubAppId: String(selectedApp.id),
      gitUrl: selectedRepo.clone_url,
      repoFullName: selectedRepo.full_name,
      defaultBranch: selectedRepo.default_branch || 'main',
    });
  };

  const renderStepApp = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Choose a GitHub App
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Select an existing app or create a new one to deploy private repositories.
        </p>
      </div>

      {loadingApps ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={20} className="spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : installedApps.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Installed Apps
          </div>
          {installedApps.map(app => (
            <div
              key={app.id}
              className="card hover-glow"
              onClick={() => handleSelectExistingApp(app)}
              style={{
                cursor: 'pointer', padding: '0.85rem 1rem',
                display: 'flex', alignItems: 'center', gap: 12,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(16,185,129,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={16} color="var(--green)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{app.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Installed and ready</div>
              </div>
              <ArrowRight size={16} color="var(--text-muted)" />
            </div>
          ))}
        </div>
      ) : null}

      {uninstalledApps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pending Installation
          </div>
          {uninstalledApps.map(app => (
            <div
              key={app.id}
              className="card"
              onClick={() => handleSelectExistingApp(app)}
              style={{
                cursor: 'pointer', padding: '0.85rem 1rem',
                display: 'flex', alignItems: 'center', gap: 12,
                border: '1px solid rgba(234,179,8,0.3)',
                background: 'rgba(234,179,8,0.04)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(234,179,8,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Info size={16} color="var(--yellow, #eab308)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{app.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--yellow, #eab308)', marginTop: 2 }}>Needs installation</div>
              </div>
              <ArrowRight size={16} color="var(--text-muted)" />
            </div>
          ))}
        </div>
      )}

      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Create New App
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">GitHub App Name</label>
          <input
            className="form-input"
            placeholder="e.g. nanofly-production"
            value={newAppName}
            onChange={e => setNewAppName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateApp()}
          />
        </div>
        <Button
          variant="primary"
          onClick={handleCreateApp}
          loading={creatingApp}
          disabled={!newAppName.trim() || creatingApp}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Create App on GitHub
          <ExternalLink size={14} />
        </Button>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          You will be redirected to GitHub to create the app. After creating, come back and install it.
        </div>
      </div>
    </div>
  );

  const renderStepInstall = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Install {selectedApp?.name}
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Install this GitHub App on your account or organization to grant repository access.
        </p>
      </div>

      <div style={{
        padding: '1.25rem', borderRadius: 'var(--radius)',
        background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'rgba(234,179,8,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Info size={18} color="var(--yellow, #eab308)" />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Installation Required</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>This app has not been installed yet</div>
          </div>
        </div>

        <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Click the button below to open GitHub</li>
          <li>Select the user or organization to install on</li>
          <li>Choose which repositories to grant access to</li>
          <li>Click "Install" on GitHub</li>
          <li>Return here and click "Check Installation"</li>
        </ol>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={handleInstallClick} icon={ExternalLink}>
            Install on GitHub
          </Button>
          <Button variant="ghost" onClick={handleRefreshInstallation} icon={RefreshCw}>
            Check Installation
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Button variant="ghost" size="sm" onClick={() => { setSelectedApp(null); setStep('app'); }} icon={ArrowLeft}>
          Back
        </Button>
      </div>
    </div>
  );

  const renderStepRepo = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Select Repository
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Choose which repository to deploy from <strong>{selectedApp?.name}</strong>.
        </p>
      </div>

      <div className="form-group" style={{ margin: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              placeholder="Search repositories..."
              value={repoSearch}
              onChange={e => setRepoSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => loadRepos(selectedApp.id)} icon={RefreshCw} />
          <a
            href="https://github.com/settings/installations"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ border: '1px solid var(--border)', fontSize: '0.78rem', padding: '4px 10px', textDecoration: 'none', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4, height: 32 }}
          >
            Manage <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {loadingRepos ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Loader2 size={16} className="spin" /> Loading repositories...
        </div>
      ) : filteredRepos.length === 0 ? (
        <div style={{
          padding: '2rem', textAlign: 'center', borderRadius: 'var(--radius)',
          border: '1px dashed var(--border)', background: 'var(--bg-highlight)',
        }}>
          <FolderGit2 size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
            {repos.length === 0 ? 'No repositories found. Make sure the app is installed on your repositories.' : 'No repositories match your search.'}
          </p>
        </div>
      ) : (
        <div style={{
          maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6,
          border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 4,
        }}>
          {filteredRepos.map(r => {
            const isSelected = selectedRepo?.full_name === r.full_name;
            return (
              <div
                key={r.full_name}
                onClick={() => handleRepoSelect(r)}
                style={{
                  cursor: 'pointer', padding: '0.65rem 0.85rem',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  display: 'flex', alignItems: 'center', gap: 10,
                  border: isSelected ? '1px solid var(--blue)' : '1px solid transparent',
                  background: isSelected ? 'rgba(79,110,247,0.08)' : 'transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-highlight)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isSelected ? 'var(--blue)' : 'var(--border)',
                  border: isSelected ? 'none' : '1px solid var(--text-muted)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.full_name}
                  </div>
                  {r.description && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <Button variant="ghost" size="sm" onClick={() => { setSelectedRepo(null); setRepoSearch(''); setStep(selectedApp?.installation_id === 0 ? 'install' : 'app'); }} icon={ArrowLeft}>
          Back
        </Button>
        <Button variant="primary" disabled={!selectedRepo} onClick={() => setStep('config')}>
          Continue
          <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );

  const renderStepConfig = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Configure Deployment
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Repository: <strong style={{ color: 'var(--blue)' }}>{selectedRepo?.full_name}</strong>
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
        padding: '1rem', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', background: 'var(--bg-highlight)',
      }}>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Package size={16} color="var(--blue)" />
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Repository Info</span>
        </div>
        <InfoRow label="Repository" value={selectedRepo?.full_name || '—'} />
        <InfoRow label="Default Branch" value={selectedRepo?.default_branch || 'main'} />
        <InfoRow label="Clone URL" value={selectedRepo?.clone_url || '—'} mono />
      </div>

      <div style={{
        padding: '1rem', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', background: 'var(--bg-highlight)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={16} color="var(--blue)" />
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Deploy Settings</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Additional configuration will be available after creating the service. You can adjust the build method, branch, port, and environment variables from the service settings.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <Button variant="ghost" size="sm" onClick={() => setStep('repo')} icon={ArrowLeft}>
          Back
        </Button>
        <Button variant="primary" onClick={handleRepoConfirm}>
          Create Service
          <Check size={14} />
        </Button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <StepIndicator current={step} steps={STEPS} />

      {step === 'app' && renderStepApp()}
      {step === 'install' && renderStepInstall()}
      {step === 'repo' && renderStepRepo()}
      {step === 'config' && renderStepConfig()}
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: '0.8rem', color: 'var(--text-secondary)',
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  );
}

export default GitHubAppWizard;

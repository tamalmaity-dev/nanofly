// @ts-nocheck
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { githubApi, servicesApi } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { SelectRoot, SelectTrigger, SelectContent, SelectItem } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { markPendingRedeploy } from '../../utils/servicePending';

const PENDING_REPO = 'github-app://pending';

function ConfigSection({ title, desc, children }) {
  return (
    <div style={{
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginBottom: '1rem',
    }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h4>
        {desc && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function GitSourcePanel({ service, onUpdate }) {
  const toast = useToast();
  const [githubApps, setGithubApps] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [githubAppId, setGithubAppId] = useState(service.github_app_id || '');
  const [gitUrl, setGitUrl] = useState(
    service.git_repo_url === PENDING_REPO ? '' : (service.git_repo_url || '')
  );
  const [branch, setBranch] = useState(service.git_branch || 'main');

  const webhookUrl = `${window.location.origin}/api/webhooks/github`;
  const pendingRepo = !gitUrl || service.git_repo_url === PENDING_REPO;

  useEffect(() => {
    githubApi.listApps().then(apps => setGithubApps(apps || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setGithubAppId(service.github_app_id || '');
    setGitUrl(service.git_repo_url === PENDING_REPO ? '' : (service.git_repo_url || ''));
    setBranch(service.git_branch || 'main');
  }, [service]);

  useEffect(() => {
    if (!githubAppId) {
      setRepos([]);
      return;
    }
    setLoadingRepos(true);
    githubApi.listRepos(githubAppId)
      .then(r => setRepos(r || []))
      .catch(() => setRepos([]))
      .finally(() => setLoadingRepos(false));
  }, [githubAppId]);

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!githubAppId && !gitUrl.trim()) {
      toast.error('Select a GitHub App or enter a repository URL');
      return;
    }
    setSaving(true);
    try {
      const repoUrl = gitUrl.trim() || PENDING_REPO;
      const payload = {
        git_repo_url: repoUrl,
        git_branch: branch.trim() || 'main',
      };
      if (githubAppId) payload.github_app_id = githubAppId;
      await servicesApi.update(service.id, payload);
      markPendingRedeploy(service.id);
      toast.info('Git source saved — Redeploy to apply changes');
      onUpdate();
    } catch (e) {
      toast.error(e.message || 'Failed to save git source');
    }
    setSaving(false);
  };

  return (
    <div>
      <ConfigSection
        title="Git repository"
        desc="Connect a GitHub App for managed webhooks or enter a repository URL manually."
      >
        <div className="form-group">
          <label className="form-label">Branch</label>
          <input className="form-input" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" />
        </div>

        <div className="form-group">
          <label className="form-label">GitHub App <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          {githubApps.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No GitHub App is configured. You can <Link to="/sources">add one in Sources</Link>, or use a repository URL below.
            </p>
          ) : (
            <SelectRoot value={githubAppId || undefined} onValueChange={setGithubAppId}>
              <SelectTrigger style={{ width: '100%' }} placeholder="Select app..." />
              <SelectContent>
                {githubApps.map(app => (
                  <SelectItem key={app.id} value={String(app.id)}>{app.name}</SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          )}
        </div>

        {githubAppId && (
          <div className="form-group">
            <label className="form-label">Repository</label>
            {loadingRepos ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Loading repositories...
              </div>
            ) : repos.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                No repositories found. Make sure the app is installed on your repositories.
              </div>
            ) : (
              <SelectRoot value={gitUrl || '__auto-link__'} onValueChange={val => setGitUrl(val === '__auto-link__' ? '' : val)}>
                <SelectTrigger style={{ width: '100%' }} placeholder="Select repository..." />
                <SelectContent>
                  <SelectItem value="__auto-link__">-- Webhook push to deploy (Auto-link) --</SelectItem>
                  {repos.map(r => (
                    <SelectItem key={r.full_name} value={r.clone_url}>{r.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            )}
          </div>
        )}

        {!githubAppId && (
          <div className="form-group">
            <label className="form-label">Repository URL</label>
            <input className="form-input" value={gitUrl} onChange={e => setGitUrl(e.target.value)} placeholder="https://github.com/owner/repository.git" />
          </div>
        )}

        {pendingRepo && (
          <div style={{ padding: '0.75rem', background: 'rgba(79,110,247,0.06)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Waiting for the first push to link this service to a repository.
          </div>
        )}
      </ConfigSection>

      <ConfigSection title="Webhook" desc="Set this URL on your GitHub App (Sources page). Pushes trigger deploy automatically.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input readOnly className="form-input" value={webhookUrl} style={{ fontFamily: 'monospace', fontSize: '0.8rem', flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={copyWebhook} icon={copied ? Check : Copy} style={{ height: 38, width: 38 }} />
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Open <strong>Sources</strong> and edit your GitHub App.</li>
          <li>Set the app webhook URL to the value above (Push events).</li>
          <li>Install the app on your organization or repositories.</li>
          <li>Push to a linked branch — NanoFly deploys automatically.</li>
        </ol>
      </ConfigSection>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
          Save Git Source
        </Button>
      </div>
    </div>
  );
}

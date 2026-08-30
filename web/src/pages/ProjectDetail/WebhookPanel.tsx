// @ts-nocheck
import { useState } from 'react';
import { Check, Copy, ExternalLink, GitBranch, Info, Webhook } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';

export function WebhookPanel({ service }) {
  const [copied, setCopied] = useState(false);
  const isGitHubApp = !!service?.github_app_id;
  const hasRepository = !!service?.git_repo_url && service.git_repo_url !== 'github-app://pending';
  const webhookUrl = isGitHubApp
    ? `${window.location.origin}/api/webhooks/github`
    : `${window.location.origin}/api/webhooks/${service.id}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Webhooks</h3>
          <p style={{ margin: '5px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Deploy this service automatically when a push reaches its configured branch.
          </p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 999, fontSize: '0.72rem', color: 'var(--green)', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <Webhook size={13} /> {isGitHubApp ? 'GitHub App managed' : 'Manual webhook'}
        </span>
      </div>

      <div className="card" style={{ padding: '1rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>Deploy webhook URL</label>
          <Button type="button" variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={copyToClipboard}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <input readOnly className="form-input" value={webhookUrl} style={{ fontFamily: 'monospace', fontSize: '0.78rem' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: '1rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>
            <GitBranch size={15} style={{ color: 'var(--accent)' }} /> Source status
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Branch: </span>{service.git_branch || 'main'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Repository: </span>{hasRepository ? service.git_repo_url.replace(/^https?:\/\//, '') : 'Waiting for repository link'}</div>
          </div>
        </div>
        <div className="card" style={{ padding: '1rem', background: 'rgba(79,110,247,0.05)', border: '1px solid rgba(79,110,247,0.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>
            <Info size={15} /> {isGitHubApp ? 'GitHub App setup' : 'Manual setup'}
          </div>
          {isGitHubApp ? (
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              <li>Open <Link to="/sources" style={{ color: 'var(--accent)' }}>Sources</Link> and edit the GitHub App.</li>
              <li>Set the app webhook URL above and enable push events.</li>
              <li>Install the app on the required repositories.</li>
            </ol>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              <li>Open repository settings on GitHub.</li>
              <li>Add the URL above as an application/json push webhook.</li>
              <li>Push to the configured branch to deploy.</li>
            </ol>
          )}
        </div>
      </div>

      <a href={isGitHubApp ? 'https://github.com/settings/apps' : (hasRepository ? service.git_repo_url : 'https://github.com/settings/webhooks')} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}>
        Open provider settings <ExternalLink size={13} />
      </a>
    </div>
  );
}

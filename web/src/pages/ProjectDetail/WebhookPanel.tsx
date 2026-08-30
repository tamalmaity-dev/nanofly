// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, GitBranch, Info, RefreshCw, Send, Webhook } from 'lucide-react';
import { Link } from 'react-router-dom';
import { servicesApi } from '../../api/client';
import { Button } from '../../components/ui';

const STATUS_COLORS: Record<string, string> = {
  received: 'rgba(59,130,246,0.15)',
  deploy_triggered: 'rgba(34,197,94,0.15)',
  failed: 'rgba(239,68,68,0.15)',
  no_match: 'rgba(234,179,8,0.15)',
  triggered: 'rgba(139,92,246,0.15)',
};
const STATUS_TEXT: Record<string, string> = {
  received: 'var(--blue)',
  deploy_triggered: 'var(--green)',
  failed: 'var(--red)',
  no_match: 'var(--yellow)',
  triggered: 'var(--purple)',
};

export function WebhookPanel({ service }) {
  const [copied, setCopied] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
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

  const fetchDeliveries = useCallback(async () => {
    setLoadingLog(true);
    try {
      const data = await servicesApi.webhookLog(service.id);
      setDeliveries(Array.isArray(data) ? data : []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingLog(false);
    }
  }, [service.id]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await servicesApi.webhookTest(service.id);
      setTestResult({ ok: true, msg: 'Deployment triggered' });
      fetchDeliveries();
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || 'Failed' });
    } finally {
      setTesting(false);
    }
  };

  const fmtTime = (t: string) => {
    if (!t) return '';
    try {
      const d = new Date(t);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return t; }
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
          <div style={{ display: 'flex', gap: 6 }}>
            <Button type="button" variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={copyToClipboard}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button type="button" variant="ghost" size="sm" icon={Send} onClick={handleTest} disabled={testing} loading={testing}>
              Test
            </Button>
          </div>
        </div>
        <input readOnly className="form-input" value={webhookUrl} style={{ fontFamily: 'monospace', fontSize: '0.78rem' }} />
        {testResult && (
          <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
            {testResult.msg}
          </p>
        )}
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

      {/* Recent Deliveries */}
      <div className="card" style={{ padding: '1rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>Recent Deliveries</h4>
          <Button type="button" variant="ghost" size="sm" icon={RefreshCw} onClick={fetchDeliveries} loading={loadingLog}>
            Refresh
          </Button>
        </div>
        {deliveries.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            No webhook deliveries yet. Push to your repo or click Test to see activity here.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {deliveries.map((d: any) => (
              <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 100px', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-base-alt, rgba(255,255,255,0.03))', border: '1px solid var(--border)', fontSize: '0.76rem' }}>
                <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmtTime(d.created_at)}</span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.source === 'github-app' ? 'GitHub App' : d.source === 'per-service' ? 'Per-service' : d.source}
                  {d.branch ? ` \u00b7 ${d.branch}` : ''}
                  {d.commit_sha ? ` \u00b7 ${d.commit_sha.slice(0, 7)}` : ''}
                </span>
                <span style={{
                  padding: '2px 7px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 600, textAlign: 'center',
                  color: STATUS_TEXT[d.status] || 'var(--text-muted)',
                  background: STATUS_COLORS[d.status] || 'rgba(255,255,255,0.05)',
                }}>
                  {d.status.replace('_', ' ')}
                </span>
                <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.message || d.remote_addr || ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <a href={isGitHubApp ? 'https://github.com/settings/apps' : (hasRepository ? service.git_repo_url : 'https://github.com/settings/webhooks')} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}>
        Open provider settings <ExternalLink size={13} />
      </a>
    </div>
  );
}

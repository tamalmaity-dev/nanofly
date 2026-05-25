import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Trash2, Eye, EyeOff, Check, GitBranch, ArrowLeft, Copy, Globe, Key, Link2, Shield, ExternalLink } from 'lucide-react';
import { githubApi } from '../api/client';
import { Button, Tooltip, useToast } from '../components/ui';

export default function SourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    githubApi.getApp(id)
      .then(setApp)
      .catch(e => {
        toast.error('Failed to load GitHub App: ' + e.message);
        navigate('/sources');
      })
      .finally(() => setLoading(false));
  }, [id, navigate, toast]);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
    toast.success(`${label} copied to clipboard!`);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this GitHub App? Repositories relying on it will fail to deploy.')) return;
    setDeleting(true);
    try {
      await githubApi.deleteApp(id);
      toast.success('GitHub App deleted successfully');
      navigate('/sources');
    } catch (e) {
      toast.error(e.message || 'Failed to delete app');
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <div className="spinner" />
    </div>
  );
  
  if (!app) return null;

  const webhookUrl = `${window.location.origin}/api/webhooks/github`;
  const callbackUrl = `${window.location.origin}/api/v1/github/app/callback`;

  return (
    <div className="page-content fade-in">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/sources" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', marginRight: '0.5rem' }}>
            <ArrowLeft size={18} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: 40, height: 40, borderRadius: 10, 
              background: 'var(--bg-elevated)', display: 'flex', 
              alignItems: 'center', justifyContent: 'center' 
            }}>
              <GitBranch size={22} color="var(--text-primary)" />
            </div>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>{app.name}</h1>
              <p className="page-subtitle" style={{ margin: 0 }}>GitHub App Integration</p>
            </div>
          </div>
        </div>
        <Button variant="ghost" color="red" icon={Trash2} onClick={handleDelete} loading={deleting}>
          Delete
        </Button>
      </div>

      {/* Status Card */}
      <div className="card" style={{ 
        padding: '1.25rem', 
        marginBottom: '1.5rem',
        background: app.installation_id === 0 
          ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.06) 0%, rgba(234, 179, 8, 0.03) 100%)' 
          : 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(16, 185, 129, 0.03) 100%)',
        borderColor: app.installation_id === 0 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(16, 185, 129, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: 32, height: 32, borderRadius: '50%', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: app.installation_id === 0 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(16, 185, 129, 0.15)'
            }}>
              {app.installation_id === 0 ? 
                <Shield size={16} color="#eab308" /> : 
                <Check size={16} color="#10b981" />
              }
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {app.installation_id === 0 ? 'Installation Required' : 'Connected & Ready'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {app.installation_id === 0 
                  ? 'Install the app on your GitHub account to use it' 
                  : 'Installation ID: ' + app.installation_id
                }
              </div>
            </div>
          </div>
          
          {app.installation_id === 0 ? (
            <a 
              href={`https://github.com/apps/${app.name}/installations/new`}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <Button variant="primary" icon={ExternalLink}>
                Install on GitHub
              </Button>
            </a>
          ) : (
            <a 
              href={`https://github.com/apps/${app.name}`}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <Button variant="ghost" icon={ExternalLink}>
                Manage on GitHub
              </Button>
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Webhook Configuration */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link2 size={16} />
            Webhook Configuration
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Webhook URL</div>
              <div style={{ 
                display: 'flex', gap: 8, background: 'var(--bg-elevated)', 
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                padding: '8px 10px', alignItems: 'center'
              }}>
                <code style={{ 
                  flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)', 
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {webhookUrl}
                </code>
                <Tooltip content={copied === 'webhook' ? 'Copied!' : 'Copy to clipboard'}>
                  <Button 
                    variant="ghost" size="sm" 
                    onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                    icon={copied === 'webhook' ? Check : Copy}
                  />
                </Tooltip>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Callback URL</div>
              <div style={{ 
                display: 'flex', gap: 8, background: 'var(--bg-elevated)', 
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                padding: '8px 10px', alignItems: 'center'
              }}>
                <code style={{ 
                  flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)', 
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {callbackUrl}
                </code>
                <Tooltip content={copied === 'callback' ? 'Copied!' : 'Copy to clipboard'}>
                  <Button 
                    variant="ghost" size="sm" 
                    onClick={() => copyToClipboard(callbackUrl, 'callback')}
                    icon={copied === 'callback' ? Check : Copy}
                  />
                </Tooltip>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Webhook Secret</div>
              <div style={{ 
                display: 'flex', gap: 8, background: 'var(--bg-elevated)', 
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                padding: '8px 10px', alignItems: 'center', position: 'relative'
              }}>
                <code style={{ 
                  flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)', 
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {showWebhookSecret ? app.webhook_secret : '••••••••••••••••••••••'}
                </code>
                <Tooltip content={copied === 'webhook-secret' ? 'Copied!' : 'Copy to clipboard'}>
                  <Button 
                    variant="ghost" size="sm" 
                    onClick={() => copyToClipboard(app.webhook_secret, 'webhook-secret')}
                    icon={copied === 'webhook-secret' ? Check : Copy}
                  />
                </Tooltip>
                <Button 
                  variant="ghost" size="sm" 
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  icon={showWebhookSecret ? EyeOff : Eye}
                />
              </div>
            </div>
          </div>
        </div>

        {/* App Credentials */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Key size={16} />
            App Credentials
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>App ID</div>
              <div style={{ 
                display: 'flex', gap: 8, background: 'var(--bg-elevated)', 
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                padding: '8px 10px', alignItems: 'center'
              }}>
                <code style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {app.app_id}
                </code>
                <Tooltip content={copied === 'app-id' ? 'Copied!' : 'Copy to clipboard'}>
                  <Button 
                    variant="ghost" size="sm" 
                    onClick={() => copyToClipboard(String(app.app_id), 'app-id')}
                    icon={copied === 'app-id' ? Check : Copy}
                  />
                </Tooltip>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Client ID</div>
              <div style={{ 
                display: 'flex', gap: 8, background: 'var(--bg-elevated)', 
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                padding: '8px 10px', alignItems: 'center'
              }}>
                <code style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {app.client_id}
                </code>
                <Tooltip content={copied === 'client-id' ? 'Copied!' : 'Copy to clipboard'}>
                  <Button 
                    variant="ghost" size="sm" 
                    onClick={() => copyToClipboard(app.client_id, 'client-id')}
                    icon={copied === 'client-id' ? Check : Copy}
                  />
                </Tooltip>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Client Secret</div>
              <div style={{ 
                display: 'flex', gap: 8, background: 'var(--bg-elevated)', 
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                padding: '8px 10px', alignItems: 'center', position: 'relative'
              }}>
                <code style={{ 
                  flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)', 
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {showClientSecret ? app.client_secret : '••••••••••••••••••••••'}
                </code>
                <Tooltip content={copied === 'client-secret' ? 'Copied!' : 'Copy to clipboard'}>
                  <Button 
                    variant="ghost" size="sm" 
                    onClick={() => copyToClipboard(app.client_secret, 'client-secret')}
                    icon={copied === 'client-secret' ? Check : Copy}
                  />
                </Tooltip>
                <Button 
                  variant="ghost" size="sm" 
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  icon={showClientSecret ? EyeOff : Eye}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Private Key Section */}
      <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
        <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={16} />
          Private Key (PEM)
        </div>
        
        <div style={{ position: 'relative' }}>
          <div style={{ 
            background: '#0d1117', border: '1px solid var(--border)', 
            borderRadius: 'var(--radius)', padding: '1rem', 
            maxHeight: showPrivateKey ? '400px' : '120px', 
            overflow: 'auto', transition: 'max-height 0.3s ease'
          }}>
            <pre style={{ 
              margin: 0, fontFamily: 'JetBrains Mono, monospace', 
              fontSize: '0.78rem', color: '#e2e8f0', whiteSpace: 'pre-wrap'
            }}>
              {showPrivateKey ? app.private_key : '•••••••••••••••••••••••••••••••••••••••••••••\n•••••••••••••••••••••••••••••••••••••••••••••\n•••••••••••••••••••••••••••••••••••••••••••••'}
            </pre>
          </div>
          <div style={{ 
            position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4
          }}>
            <Tooltip content={copied === 'private-key' ? 'Copied!' : 'Copy to clipboard'}>
              <Button 
                variant="ghost" size="sm" 
                onClick={() => copyToClipboard(app.private_key, 'private-key')}
                icon={copied === 'private-key' ? Check : Copy}
              />
            </Tooltip>
            <Button 
              variant="ghost" size="sm" 
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              icon={showPrivateKey ? EyeOff : Eye}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

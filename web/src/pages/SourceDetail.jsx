import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Trash2, Eye, EyeOff, Check, GitBranch } from 'lucide-react';
import { githubApi } from '../api/client';
import { Button } from '../components/ui';

export default function SourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    githubApi.getApp(id)
      .then(setApp)
      .catch(e => {
        alert('Failed to load GitHub App: ' + e.message);
        navigate('/sources');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this GitHub App? Repositories relying on it will fail to deploy.')) return;
    setDeleting(true);
    try {
      await githubApi.deleteApp(id);
      navigate('/sources');
    } catch (e) {
      alert(e.message || 'Failed to delete app');
      setDeleting(false);
    }
  };

  if (loading) return <div className="page-content"><div className="spinner" /></div>;
  if (!app) return null;

  return (
    <div className="page-content fade-in">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <GitBranch size={28} />
            GitHub App
          </h1>
          <Button variant="ghost" color="red" icon={Trash2} onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
        <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>Your Private GitHub App for private repositories.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 900 }}>
        <div className="form-group">
          <label className="form-label">App Name</label>
          <input className="form-input" value={app.name} readOnly disabled style={{ opacity: 0.8 }} />
        </div>

        <div className="form-group">
          <label className="form-label">Organization</label>
          <input className="form-input" placeholder="If empty, personal user will be used" disabled style={{ opacity: 0.8 }} />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={app.system_wide} disabled style={{ opacity: 0.8 }} />
            System Wide?
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">HTML Url</label>
            <input className="form-input" value="https://github.com" disabled style={{ opacity: 0.8 }} />
          </div>
          <div className="form-group">
            <label className="form-label">API Url</label>
            <input className="form-input" value="https://api.github.com" disabled style={{ opacity: 0.8 }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">User *</label>
            <input className="form-input" value="git" disabled style={{ opacity: 0.8 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Port *</label>
            <input className="form-input" value="22" disabled style={{ opacity: 0.8 }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">App Id *</label>
            <input className="form-input" value={app.app_id} disabled style={{ opacity: 0.8 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Installation Id *</label>
            {app.installation_id === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input className="form-input" value="Not installed" disabled style={{ opacity: 0.8, color: 'var(--warning)', flex: 1 }} />
                <a 
                  href={`https://github.com/apps/${app.name}/installations/new`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Button variant="primary" icon={Check}>Install</Button>
                </a>
              </div>
            ) : (
              <input className="form-input" value={app.installation_id} disabled style={{ opacity: 0.8 }} />
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Client Id *</label>
            <input className="form-input" value={app.client_id} disabled style={{ opacity: 0.8 }} />
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Client Secret *</label>
            <div style={{ display: 'flex' }}>
              <input 
                className="form-input" 
                type={showClientSecret ? "text" : "password"} 
                value={app.client_secret || '••••••••••••••••'} 
                disabled 
                style={{ opacity: 0.8, paddingRight: 40 }} 
              />
              <button 
                type="button"
                onClick={() => setShowClientSecret(!showClientSecret)}
                style={{ position: 'absolute', right: 10, bottom: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {showClientSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Webhook Secret *</label>
            <div style={{ display: 'flex' }}>
              <input 
                className="form-input" 
                type={showWebhookSecret ? "text" : "password"} 
                value={app.webhook_secret || '••••••••••••••••'} 
                disabled 
                style={{ opacity: 0.8, paddingRight: 40 }} 
              />
              <button 
                type="button"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                style={{ position: 'absolute', right: 10, bottom: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {showWebhookSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Private Key *</label>
          <textarea 
            className="form-input" 
            value={app.private_key} 
            disabled 
            style={{ opacity: 0.8, height: 200, fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} 
          />
        </div>

      </div>
    </div>
  );
}

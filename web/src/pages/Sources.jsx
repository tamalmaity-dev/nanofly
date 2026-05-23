import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, GitBranch, Key, Activity, Settings, ArrowRight } from 'lucide-react';
import { githubApi } from '../api/client';
import { Button } from '../components/ui';
import { Modal } from '../components/ui/Modal';

const ADJECTIVES = ['happy', 'sad', 'angry', 'stupid', 'clever', 'fast', 'slow', 'brave', 'cowardly', 'sneaky', 'loud', 'quiet', 'bright', 'dark', 'shiny', 'dull', 'sharp', 'smooth', 'rough', 'soft', 'hard'];
const ANIMALS = ['frog', 'seal', 'dog', 'cat', 'bird', 'fish', 'lion', 'tiger', 'bear', 'wolf', 'fox', 'deer', 'rabbit', 'mouse', 'rat', 'snake', 'lizard', 'turtle', 'spider', 'ant'];

function generateRandomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const randStr = Math.random().toString(36).substring(2, 12);
  return `${adj}-${animal}-${randStr}`;
}

export default function Sources() {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  // New app modal
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [systemWide, setSystemWide] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = () => {
    setLoading(true);
    githubApi.listApps()
      .then(setApps)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const openNewModal = () => {
    setNewName(generateRandomName());
    setNewOrg('');
    setSystemWide(false);
    setShowModal(true);
  };

  const createManifest = () => {
    if (!newName.trim()) return alert('Please enter a name for the app');
    setCreating(true);
    
    fetch('/api/v1/github/app/manifest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('nanofly_token')}`
      },
      body: JSON.stringify({
        name: newName,
        system_wide: systemWide,
        host: window.location.origin
      })
    })
    .then(res => res.text())
    .then(html => {
      document.open();
      document.write(html);
      document.close();
    })
    .catch(e => {
      alert('Error initiating GitHub App creation');
      setCreating(false);
    });
  };

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sources</h1>
          <p className="page-subtitle">Git sources and GitHub Apps for your applications.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openNewModal}>
          Add
        </Button>
      </div>

      {loading ? (
        <div className="spinner" style={{ margin: '3rem auto' }} />
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><GitBranch size={32} /></div>
          <h3>No Sources Configured</h3>
          <p>Connect a GitHub App to deploy your private repositories seamlessly without manual tokens.</p>
          <Button variant="primary" icon={Plus} onClick={openNewModal} style={{ marginTop: '1rem' }}>
            Add GitHub App
          </Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
          {apps.map(app => (
            <div 
              key={app.id}
              className="card hover-glow"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              onClick={() => navigate(`/sources/${app.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: 40, height: 40, borderRadius: 8, background: 'var(--bg-highlight)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  <GitBranch size={20} color="var(--text-primary)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {app.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Key size={12} />
                    App ID: {app.app_id}
                  </div>
                </div>
              </div>

              {app.installation_id === 0 ? (
                <div style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 500, marginTop: 'auto' }}>
                  Configuration is not finished.
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'auto' }}>
                  Installed. Ready for deployments.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onOpenChange={setShowModal} title="New GitHub App" description="This is required if you would like to get full integration with GitHub." maxWidth={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Name *</label>
              <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Organization (on GitHub)</label>
              <input className="form-input" value={newOrg} onChange={e => setNewOrg(e.target.value)} placeholder="If empty, your GitHub user will be used." />
            </div>
          </div>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={systemWide} onChange={e => setSystemWide(e.target.checked)} />
            System Wide
          </label>

          <div style={{ padding: '1rem', background: 'var(--bg-highlight)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ fontWeight: 600 }}>Self-hosted / Enterprise GitHub</span>
              <ArrowRight size={16} />
            </div>
          </div>

          <Button variant="primary" style={{ width: '100%', justifyContent: 'center' }} onClick={createManifest} loading={creating}>
            Continue
          </Button>
        </div>
      </Modal>
    </div>
  );
}

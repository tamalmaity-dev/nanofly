import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Trash2, LayoutGrid, LayoutList, MoreVertical } from 'lucide-react';
import { projectsApi } from '../api/client';

// ── Create Project Modal ────────────────────────────────────────────────────────
function CreateProjectModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const p = await projectsApi.create({ name, description: desc });
      onSuccess(p);
    } catch (err) {
      setError(err.message || 'Failed to create project');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">New Project</h3>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Project Name</label>
            <input
              className="form-input"
              placeholder="e.g. Production App"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description (Optional)</label>
            <textarea
              className="form-input"
              placeholder="What is this project for?"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
          <div className="modal-footer" style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Projects Page ──────────────────────────────────────────────────────────
export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode]   = useState('grid'); // grid or list

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await projectsApi.list();
      setProjects(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation(); // prevent clicking the card
    if (!window.confirm('Are you sure you want to delete this project? All associated apps and databases will be destroyed.')) return;
    try {
      await projectsApi.delete(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Logical environments for your apps and databases.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="btn-group" style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: 2, border: '1px solid var(--border)' }}>
            <button className={`btn btn-ghost ${viewMode === 'grid' ? 'active' : ''}`} style={{ padding: '6px' }} onClick={() => setViewMode('grid')}><LayoutGrid size={16} /></button>
            <button className={`btn btn-ghost ${viewMode === 'list' ? 'active' : ''}`} style={{ padding: '6px' }} onClick={() => setViewMode('list')}><LayoutList size={16} /></button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><FolderOpen size={32} /></div>
          <h3>No projects found</h3>
          <p>Get started by creating your first project environment.</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowModal(true)}>
            Create Project
          </button>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? "projects-grid" : "projects-list"}>
          {projects.map(p => (
            <div 
              key={p.id} 
              className="card project-card hover-glow fade-in" 
              onClick={() => navigate(`/projects/${p.id}`)}
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="project-icon" style={{ 
                    width: 36, height: 36, borderRadius: 'var(--radius-sm)', 
                    background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--accent)', border: '1px solid var(--border)' 
                  }}>
                    <FolderOpen size={18} />
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</h3>
                </div>
                <div className="dropdown">
                  <button className="btn btn-ghost" style={{ padding: 4 }} onClick={e => e.stopPropagation()}>
                    <MoreVertical size={16} color="var(--text-muted)" />
                  </button>
                  <div className="dropdown-menu">
                    <button className="dropdown-item danger" onClick={e => handleDelete(e, p.id)}>
                      <Trash2 size={14} /> Delete Project
                    </button>
                  </div>
                </div>
              </div>
              
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flex: 1, marginBottom: '1.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.description || 'No description provided.'}
              </p>
              
              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>0</span> Apps
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>0</span> Databases
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CreateProjectModal 
          onClose={() => setShowModal(false)} 
          onSuccess={(newProject) => {
            setShowModal(false);
            setProjects([newProject, ...projects]);
            // Optional: immediately navigate to the new project
            // navigate(`/projects/${newProject.id}`);
          }} 
        />
      )}
    </div>
  );
}

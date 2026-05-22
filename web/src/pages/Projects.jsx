import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Trash2, LayoutGrid, LayoutList, MoreVertical } from 'lucide-react';
import { projectsApi } from '../api/client';
import { Modal, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui';

// ── Create Project Modal ────────────────────────────────────────────────────────
function CreateProjectModal({ open, onOpenChange, onSuccess }) {
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
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New Project"
      maxWidth={460}
    >
      <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!name.trim()}>
            Create Project
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main Projects Page ──────────────────────────────────────────────────────────
export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // grid or list

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
          <Button variant="primary" onClick={() => setShowModal(true)} icon={Plus}>
            New Project
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><FolderOpen size={32} /></div>
          <h3>No projects found</h3>
          <p>Get started by creating your first project environment.</p>
          <Button variant="primary" style={{ marginTop: '1rem' }} onClick={() => setShowModal(true)}>
            Create Project
          </Button>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={e => e.stopPropagation()} icon={MoreVertical} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent onClick={e => e.stopPropagation()}>
                    <DropdownMenuItem variant="danger" onClick={e => handleDelete(e, p.id)}>
                      <Trash2 size={14} style={{ marginRight: 6 }} /> Delete Project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

      <CreateProjectModal
        open={showModal}
        onOpenChange={setShowModal}
        onSuccess={(newProject) => {
          setShowModal(false);
          setProjects([newProject, ...projects]);
        }}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Trash2, LayoutGrid, LayoutList, MoreVertical } from 'lucide-react';
import { projectsApi } from '../api/client';
import { Modal, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, useToast } from '../components/ui';

// ── Create Project Modal ────────────────────────────────────────────────────────
function CreateProjectModal({ open, onOpenChange, onSuccess }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const p = await projectsApi.create({ name, description: desc });
      toast.success('Project created successfully!');
      onSuccess(p);
    } catch (err) {
      const msg = err.message || 'Failed to create project';
      setError(msg);
      toast.error(msg);
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
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <Button variant="soft" color="gray" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="solid" loading={loading} disabled={!name.trim()}>
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
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  const [deletingProject, setDeletingProject] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

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

  const handleDeleteClick = (e, p) => {
    e.stopPropagation(); // prevent clicking the card
    setDeletingProject(p);
    setDeleteConfirmName('');
  };

  const confirmDelete = async () => {
    if (!deletingProject) return;
    try {
      await projectsApi.delete(deletingProject.id);
      setProjects(prev => prev.filter(p => p.id !== deletingProject.id));
      setDeletingProject(null);
      toast.success('Project deleted successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to delete project');
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
        <div className={viewMode === 'grid' ? "projects-grid fade-in" : "projects-list fade-in"}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card project-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="skeleton-circle" style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)' }}></div>
                  <div className="skeleton-text" style={{ width: 120, height: 20 }}></div>
                </div>
              </div>
              <div className="skeleton-text" style={{ width: '80%', height: 14, marginTop: 8 }}></div>
              <div style={{ marginTop: 'auto', display: 'flex', gap: 12, paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                <div className="skeleton-text" style={{ width: 60, height: 16 }}></div>
                <div className="skeleton-text" style={{ width: 60, height: 16 }}></div>
              </div>
            </div>
          ))}
        </div>
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
                    <DropdownMenuItem color="red" onClick={e => handleDeleteClick(e, p)}>
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
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{p.apps_count || 0}</span> Apps
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{p.db_count || 0}</span> Databases
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

      {/* Delete Project Modal */}
      <Modal open={!!deletingProject} onClose={() => setDeletingProject(null)} title="Delete Project">
        <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <p style={{ color: 'var(--red)', marginBottom: 12 }}>
            <strong>Warning:</strong> Deleting a project removes its logical environment. You must delete all underlying applications and databases first before you can delete this project.
          </p>
          <p style={{ marginBottom: 8 }}>
            Please type <strong>{deletingProject?.name}</strong> to confirm.
          </p>
          <input
            className="form-input"
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={deletingProject?.name}
            style={{ width: '100%' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
            <Button variant="ghost" onClick={() => setDeletingProject(null)}>Cancel</Button>
            <Button
              variant="solid"
              style={{ background: 'var(--red)', color: '#fff' }}
              onClick={confirmDelete}
              disabled={deleteConfirmName !== deletingProject?.name}
            >
              I understand, delete project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// web/src/pages/FileManager.jsx — File Manager dashboard interface
import { useState, useEffect } from 'react';
import {
  Folder, File, FileText, FileCode, Plus, Trash2, Save,
  ArrowLeft, Edit3, Search, X, FolderPlus, FilePlus, ChevronRight
} from 'lucide-react';
import { filesApi } from '../api/client';

export default function FileManager() {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Selected file details
  const [selectedFile, setSelectedFile] = useState(null); // { path: string, content: string, originalContent: string }
  const [editorLoading, setEditorLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editorError, setEditorError] = useState('');

  // Modals / Inputs
  const [showCreateModal, setShowCreateModal] = useState(null); // 'file' | 'folder' | null
  const [newItemName, setNewItemName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  const loadDirectory = async (path) => {
    setLoading(true);
    setError('');
    try {
      const res = await filesApi.list(path);
      if (res) {
        setItems(res.items || []);
        setCurrentPath(res.current_path || '');
      }
    } catch (err) {
      setError(err.message || 'Failed to read directory');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFile = async (item) => {
    setEditorError('');
    setEditorLoading(true);
    try {
      const res = await filesApi.view(item.path);
      if (res) {
        setSelectedFile({
          path: item.path,
          name: item.name,
          content: res.content,
          originalContent: res.content,
          size: item.size_human
        });
      }
    } catch (err) {
      setEditorError(err.message || 'Failed to open file');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    setSaveLoading(true);
    setEditorError('');
    try {
      await filesApi.save(selectedFile.path, selectedFile.content);
      setSelectedFile(prev => ({
        ...prev,
        originalContent: prev.content
      }));
      // Reload directory in case size changed
      loadDirectory(currentPath);
    } catch (err) {
      setEditorError(err.message || 'Failed to save file');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim() || !showCreateModal) return;
    setCreateLoading(true);
    setCreateError('');
    const fullPath = currentPath ? `${currentPath}/${newItemName}` : newItemName;
    const isDir = showCreateModal === 'folder';

    try {
      await filesApi.create(fullPath, isDir);
      setNewItemName('');
      setShowCreateModal(null);
      loadDirectory(currentPath);
    } catch (err) {
      setCreateError(err.message || 'Failed to create item');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteItem = async (item, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;
    try {
      await filesApi.delete(item.path);
      if (selectedFile?.path === item.path) {
        setSelectedFile(null);
      }
      loadDirectory(currentPath);
    } catch (err) {
      alert(err.message || 'Failed to delete item');
    }
  };

  // Breadcrumbs parsing
  const getBreadcrumbs = () => {
    if (!currentPath) return [{ name: 'Root', path: '' }];
    // Normalize path separators
    const normalized = currentPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    const crumbs = [{ name: 'Root', path: '' }];
    let accum = '';
    parts.forEach((part, idx) => {
      // For Windows drive letters, preserve absolute root path correctly
      if (idx === 0 && part.endsWith(':')) {
        accum = part + '/';
      } else {
        accum = accum ? `${accum}/${part}` : part;
      }
      crumbs.push({ name: part, path: accum });
    });
    return crumbs;
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const getFileIcon = (item) => {
    if (item.is_dir) return <Folder size={18} style={{ color: '#eab308' }} />;
    const ext = item.name.split('.').pop().toLowerCase();
    if (['go', 'js', 'jsx', 'ts', 'tsx', 'py', 'php', 'html', 'css', 'json', 'sh', 'yaml', 'yml'].includes(ext)) {
      return <FileCode size={18} style={{ color: '#3b82f6' }} />;
    }
    if (['md', 'txt', 'log', 'conf', 'env'].includes(ext)) {
      return <FileText size={18} style={{ color: '#10b981' }} />;
    }
    return <File size={18} style={{ color: 'var(--text-muted)' }} />;
  };

  const isModified = selectedFile && selectedFile.content !== selectedFile.originalContent;

  return (
    <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', padding: '1.5rem' }}>
      
      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem', flexShrink: 0 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>File Manager</h1>
          <p className="page-subtitle">Inspect, edit, and manage files on your NanoFly server</p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal('folder')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FolderPlus size={14} /> New Folder
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal('file')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FilePlus size={14} /> New File
          </button>
        </div>
      </div>

      {/* Path Breadcrumbs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0.625rem 1rem',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        fontSize: '0.875rem',
        flexShrink: 0
      }}>
        {getBreadcrumbs().map((crumb, idx) => (
          <div key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {idx > 0 && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
            <span
              onClick={() => setCurrentPath(crumb.path)}
              style={{
                cursor: 'pointer',
                color: idx === getBreadcrumbs().length - 1 ? 'var(--text-primary)' : 'var(--accent)',
                fontWeight: idx === getBreadcrumbs().length - 1 ? 600 : 500,
                transition: 'color 0.15s'
              }}
              onMouseEnter={e => idx !== getBreadcrumbs().length - 1 && (e.target.style.color = 'var(--accent-hover)')}
              onMouseLeave={e => idx !== getBreadcrumbs().length - 1 && (e.target.style.color = 'var(--accent)')}
            >
              {crumb.name}
            </span>
          </div>
        ))}
      </div>

      {/* Main Split Layout */}
      <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0 }}>
        
        {/* Left Side: Directory Explorer */}
        <div className="card" style={{
          flex: 1.2,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem',
          minWidth: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)'
        }}>
          {/* Search bar */}
          <div className="form-group" style={{ marginBottom: '1rem', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 36 }}
                placeholder="Filter files by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Directory Content Table/List */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {error && (
              <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>
            )}

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                <div className="spinner" style={{ width: 20, height: 20, borderTopColor: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Reading folder...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8 }}>
                <Folder size={32} style={{ opacity: 0.4 }} />
                <span style={{ fontSize: '0.875rem' }}>Empty directory or no search matches</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Back Link if not at Root */}
                {currentPath && (
                  <div
                    onClick={() => {
                      const normalized = currentPath.replace(/\\/g, '/');
                      const idx = normalized.lastIndexOf('/');
                      if (idx === -1) {
                        setCurrentPath('');
                      } else {
                        setCurrentPath(normalized.substring(0, idx));
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <ArrowLeft size={16} />
                    <span>.. (Parent Directory)</span>
                  </div>
                )}

                {/* Items */}
                {filteredItems.map(item => (
                  <div
                    key={item.path}
                    onClick={() => {
                      if (item.is_dir) {
                        setCurrentPath(item.path);
                      } else {
                        handleOpenFile(item);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      transition: 'background 0.2s, border-color 0.2s',
                      background: selectedFile?.path === item.path ? 'rgba(79, 110, 247, 0.08)' : 'transparent',
                      border: '1px solid',
                      borderColor: selectedFile?.path === item.path ? 'rgba(79, 110, 247, 0.2)' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (selectedFile?.path !== item.path) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (selectedFile?.path !== item.path) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {getFileIcon(item)}
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: item.is_dir ? 600 : 400,
                        color: 'var(--text-primary)'
                      }}>
                        {item.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                      {!item.is_dir && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {item.size_human}
                        </span>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)', padding: 4 }}
                        onClick={(e) => handleDeleteItem(item, e)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: File Editor or Detail view */}
        <div className="card" style={{
          flex: 1.8,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem',
          minWidth: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)'
        }}>
          {selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Editor Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '0.75rem',
                marginBottom: '1rem',
                flexShrink: 0
              }}>
                <div>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {selectedFile.name}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Size: {selectedFile.size} · {isModified ? <span style={{ color: 'var(--yellow)', fontWeight: 500 }}>Modified</span> : 'Saved'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedFile(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <X size={14} /> Close
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!isModified || saveLoading}
                    onClick={handleSaveFile}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Save size={14} />
                    {saveLoading ? 'Saving...' : 'Save File'}
                  </button>
                </div>
              </div>

              {editorError && (
                <div className="auth-error" style={{ marginBottom: '1rem', flexShrink: 0 }}>{editorError}</div>
              )}

              {/* Text Area Code Editor */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <textarea
                  value={selectedFile.content}
                  onChange={e => setSelectedFile(prev => ({ ...prev, content: e.target.value }))}
                  style={{
                    width: '100%',
                    height: '100%',
                    resize: 'none',
                    background: '#0d1117',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: '#e2e8f0',
                    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    padding: '1rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          ) : editorLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderTopColor: 'var(--accent)' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading file contents...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12 }}>
              <File size={40} style={{ opacity: 0.3 }} />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No File Selected</h3>
                <p style={{ fontSize: '0.78rem', maxWidth: 280 }}>Select a file from the explorer list on the left to edit or preview its content.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create File / Folder Modal */}
      {showCreateModal && (
        <div className="modal-overlay fade-in" onClick={() => setShowCreateModal(null)}>
          <div className="modal-content fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">New {showCreateModal === 'folder' ? 'Folder' : 'File'}</h3>
            </div>
            <form onSubmit={handleCreateItem}>
              {createError && (
                <div className="auth-error" style={{ marginBottom: 12 }}>{createError}</div>
              )}
              <div className="form-group">
                <label className="form-label">{showCreateModal === 'folder' ? 'Folder Name' : 'File Name'}</label>
                <input
                  className="form-input"
                  placeholder={showCreateModal === 'folder' ? 'e.g. src' : 'e.g. index.js'}
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer" style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={createLoading || !newItemName.trim()}>
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

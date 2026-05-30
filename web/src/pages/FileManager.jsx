// web/src/pages/FileManager.jsx — File Manager dashboard interface
import { useState, useEffect, useRef } from 'react';
import {
  Folder, File, FileText, FileCode, Trash2, Save,
  ArrowLeft, Search, X, FolderPlus, FilePlus, ChevronRight, Copy, Upload,
  LayoutGrid, LayoutList, AlertTriangle, HardDrive
} from 'lucide-react';
import { filesApi } from '../api/client';
import { Modal, Button, useToast } from '../components/ui';
import CodeEditor from '../components/CodeEditor';

function ImageViewer({ file }) {
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.25));
  const handleRotate = () => setRotate(prev => (prev + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotate(0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '1rem', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <Button variant="ghost" size="sm" onClick={handleZoomIn}>Zoom In (+)</Button>
        <Button variant="ghost" size="sm" onClick={handleZoomOut}>Zoom Out (-)</Button>
        <Button variant="ghost" size="sm" onClick={handleRotate}>Rotate (90°)</Button>
        <Button variant="ghost" size="sm" onClick={handleReset}>Reset</Button>
      </div>
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle, rgba(20,20,30,1) 0%, rgba(10,10,15,1) 100%)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        position: 'relative',
        padding: '2rem',
        minHeight: 0
      }}>
        <img
          src={file.rawUrl}
          alt={file.name}
          style={{
            maxHeight: '100%',
            maxWidth: '100%',
            objectFit: 'contain',
            transform: `scale(${scale}) rotate(${rotate}deg)`,
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}
        />
      </div>
    </div>
  );
}

function AudioPlayer({ file }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, rgba(30,30,45,1) 0%, rgba(15,15,25,1) 100%)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      padding: '3rem 2rem',
      gap: '2rem',
      height: '100%'
    }}>
      <div style={{
        width: '150px',
        height: '150px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, #222 20%, #000 70%)',
        boxShadow: '0 15px 40px rgba(0,0,0,0.6), inset 0 0 20px rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        animation: isPlaying ? 'spin 6s linear infinite' : 'none',
        border: '8px solid #1a1a24'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '0.6rem',
          fontWeight: 'bold',
          textAlign: 'center',
          boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        }}>
          NanoFly
        </div>
        <div style={{ position: 'absolute', width: '120px', height: '120px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'absolute', width: '80px', height: '80px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.03)' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{file.name}</h4>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{file.size} · Audio Stream</p>
      </div>

      <div style={{ display: 'flex', gap: '4px', height: '24px', alignItems: 'center', margin: '4px 0' }}>
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            style={{
              width: '4px',
              height: isPlaying ? '100%' : '20%',
              backgroundColor: 'var(--accent)',
              borderRadius: '2px',
              animation: isPlaying ? 'pulse-bar 1s ease-in-out infinite alternate' : 'none',
              animationDelay: `${i * 0.08}s`
            }}
          />
        ))}
      </div>

      <audio
        ref={audioRef}
        src={file.rawUrl}
        controls
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        style={{
          width: '100%',
          maxWidth: '400px',
          outline: 'none',
          borderRadius: '30px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        }}
      />

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes pulse-bar { 0% { height: 20%; } 100% { height: 100%; } }
      `}</style>
    </div>
  );
}

function VideoPlayer({ file }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'radial-gradient(circle, rgba(20,20,30,1) 0%, rgba(10,10,15,1) 100%)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      padding: '1.5rem',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      minHeight: 0,
      height: '100%'
    }}>
      <video
        src={file.rawUrl}
        controls
        style={{
          maxWidth: '100%',
          maxHeight: '85%',
          borderRadius: '8px',
          boxShadow: '0 15px 35px rgba(0,0,0,0.6)',
          outline: 'none',
          backgroundColor: '#000'
        }}
      />
      <div style={{ textAlign: 'center' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{file.name}</h4>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{file.size} · Video Stream</p>
      </div>
    </div>
  );
}

function PdfReader({ file }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
      overflow: 'hidden',
      height: '100%'
    }}>
      <iframe
        src={file.rawUrl}
        title={file.name}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#fff'
        }}
      />
    </div>
  );
}

export default function FileManager() {
  const toast = useToast();
  const [currentPath, setCurrentPath] = useState('/');
  const [rootPath, setRootPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [drives, setDrives] = useState([]);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

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
        setRootPath(res.root_path || '');
        setCurrentPath(res.current_path || '');
      }
      const dr = await filesApi.drives().catch(() => null);
      if (dr) {
        setDrives(dr);
      }
    } catch (err) {
      setError(err.message || 'Failed to read directory');
    } finally {
      setLoading(false);
    }
  };

  const getMediaType = (filename) => {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
    if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    return null;
  };

  const handleOpenFile = async (item) => {
    const mediaType = getMediaType(item.name);
    if (mediaType) {
      const token = localStorage.getItem('nanofly_token');
      const rawUrl = `/api/v1/files/raw?path=${encodeURIComponent(item.path)}&token=${token}`;
      setSelectedFile({
        path: item.path,
        name: item.name,
        size: item.size_human,
        isMedia: true,
        mediaType,
        rawUrl
      });
      return;
    }

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
      toast.error(err.message || 'Failed to delete item');
    }
  };

  const copyPath = async (path, e) => {
    e?.stopPropagation();
    const text = path || '';
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setUploadStatus('Path copied');
      setTimeout(() => setUploadStatus(''), 1600);
    } catch {
      window.prompt('Copy path', text);
      setUploadStatus('Copy path opened');
    }
  };

  const handleUpload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setUploadLoading(true);
    setUploadStatus('');
    setError('');

    const formData = new FormData();
    formData.append('path', currentPath || rootPath || '');
    files.forEach(file => {
      formData.append('files', file, file.webkitRelativePath || file.name);
    });

    try {
      const res = await filesApi.upload(formData);
      const count = res?.count || files.length;
      setUploadStatus(`${count} item${count === 1 ? '' : 's'} uploaded`);
      loadDirectory(currentPath);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  // Breadcrumbs parsing
  const getBreadcrumbs = () => {
    const root = (rootPath || currentPath || '').replace(/\\/g, '/');
    const current = (currentPath || root).replace(/\\/g, '/');
    const crumbs = [{ name: 'Root', path: root }];
    if (!root || current === root) return crumbs;

    if (current.startsWith(`${root}/`)) {
      let accum = root;
      current.slice(root.length + 1).split('/').filter(Boolean).forEach(part => {
        accum = `${accum}/${part}`;
        crumbs.push({ name: part, path: accum });
      });
      return crumbs;
    }

    let accum = current.startsWith('/') ? '' : '';
    current.split('/').filter(Boolean).forEach(part => {
      accum = accum ? `${accum}/${part}` : current.startsWith('/') ? `/${part}` : part;
      crumbs.push({ name: part, path: accum });
    });
    return crumbs;
  };

  const getParentPath = () => {
    const current = (currentPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const root = (rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!current || current === root) return '';
    const idx = current.lastIndexOf('/');
    if (idx <= 0) return root || '';
    const parent = current.substring(0, idx);
    return root && parent.length < root.length ? root : parent;
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const protectedPath = (() => {
    const path = (currentPath || '').replace(/\\/g, '/');
    return ['/', '/bin', '/boot', '/dev', '/etc', '/lib', '/opt/nanofly', '/proc', '/root', '/sbin', '/sys', '/usr', '/var'].some(p => path === p || path.startsWith(`${p}/`));
  })();

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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <Button variant="secondary" size="sm" loading={uploadLoading} onClick={() => fileInputRef.current?.click()} icon={Upload}>
            Upload Files
          </Button>
          <Button variant="secondary" size="sm" loading={uploadLoading} onClick={() => folderInputRef.current?.click()} icon={Upload}>
            Upload Folder
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowCreateModal('folder')} icon={FolderPlus}>
            New Folder
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal('file')} icon={FilePlus}>
            New File
          </Button>
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
        <Button variant="ghost" size="sm" style={{ marginLeft: 'auto', padding: '4px 8px' }} onClick={(e) => copyPath(currentPath || rootPath, e)} icon={Copy}>
          Copy Path
        </Button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: '1rem',
        color: 'var(--text-muted)',
        fontSize: '0.78rem',
        flexShrink: 0,
        minWidth: 0
      }}>
        <span style={{ flexShrink: 0 }}>Location</span>
        <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
          {currentPath || rootPath || 'Loading...'}
        </code>
        {uploadStatus && <span style={{ marginLeft: 'auto', color: uploadStatus.includes('failed') ? 'var(--red)' : 'var(--green)' }}>{uploadStatus}</span>}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        border: protectedPath ? '1px solid rgba(245,158,11,0.32)' : '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: protectedPath ? 'rgba(245,158,11,0.08)' : 'rgba(79,110,247,0.06)',
        color: protectedPath ? '#f59e0b' : 'var(--text-secondary)',
        fontSize: '0.82rem',
        flexShrink: 0
      }}>
        <AlertTriangle size={16} />
        <span>{protectedPath ? 'This location may contain system files. Editing or deleting here can break NanoFly or the server.' : 'App folders are safer to edit here. Keep a backup before changing production files.'}</span>
      </div>

      {/* Main Split Layout */}
      <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0 }}>

        {/* Drives Sidebar */}
        {drives.length > 0 && (
          <div className="card" style={{
            width: '220px',
            display: 'flex',
            flexDirection: 'column',
            padding: '1rem',
            gap: '0.875rem',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            flexShrink: 0,
            overflowY: 'auto'
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              Drives & Mounts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {drives.map(drive => {
                const normalize = p => (p || '').replace(/\\/g, '/').replace(/\/+$/, '');
                const normCurrent = normalize(currentPath);
                const normDrive = normalize(drive.path);

                const isOtherDriveActive = drives.some(d => {
                  const normD = normalize(d.path);
                  return normD !== '' && normD !== '/' && normD !== normDrive && normCurrent.startsWith(normD);
                });

                const isDriveActive = (normDrive === '' || normDrive === '/') ? !isOtherDriveActive : (normCurrent === normDrive || normCurrent.startsWith(normDrive + '/'));

                return (
                  <div
                    key={drive.path}
                    onClick={() => setCurrentPath(drive.path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      background: isDriveActive ? 'rgba(79, 110, 247, 0.08)' : 'transparent',
                      border: '1px solid',
                      borderColor: isDriveActive ? 'rgba(79, 110, 247, 0.25)' : 'transparent',
                      transition: 'all var(--transition)'
                    }}
                    className="drive-item-card"
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '28px',
                      width: '28px',
                      borderRadius: 'var(--radius-sm)',
                      background: isDriveActive ? 'var(--accent)' : 'var(--bg-base)',
                      color: isDriveActive ? '#fff' : 'var(--accent)',
                      flexShrink: 0
                    }}>
                      <HardDrive size={15} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={drive.name}>
                        {drive.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        {drive.free_human} free
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="Filter files by name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 3 }}>
                <button className={`btn btn-ghost btn-sm ${viewMode === 'list' ? 'active' : ''}`} title="List view" onClick={() => setViewMode('list')} style={{ padding: 6, color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)' }}>
                  <LayoutList size={15} />
                </button>
                <button className={`btn btn-ghost btn-sm ${viewMode === 'grid' ? 'active' : ''}`} title="Grid view" onClick={() => setViewMode('grid')} style={{ padding: 6, color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)' }}>
                  <LayoutGrid size={15} />
                </button>
              </div>
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
              <div style={{
                display: viewMode === 'grid' ? 'grid' : 'flex',
                gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(138px, 1fr))' : undefined,
                flexDirection: viewMode === 'grid' ? undefined : 'column',
                gap: viewMode === 'grid' ? 10 : 4
              }}>
                {/* Back Link if not at Root */}
                {getParentPath() && (
                  <div
                    onClick={() => setCurrentPath(getParentPath())}
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
                      flexDirection: viewMode === 'grid' ? 'column' : 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: viewMode === 'grid' ? '0.9rem 0.75rem' : '0.625rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      minHeight: viewMode === 'grid' ? 118 : undefined,
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
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexDirection: viewMode === 'grid' ? 'column' : 'row',
                      gap: viewMode === 'grid' ? 8 : 10,
                      minWidth: 0,
                      width: viewMode === 'grid' ? '100%' : undefined,
                      textAlign: viewMode === 'grid' ? 'center' : 'left'
                    }}>
                      <span style={{ transform: viewMode === 'grid' ? 'scale(1.45)' : 'none', marginBottom: viewMode === 'grid' ? 4 : 0 }}>{getFileIcon(item)}</span>
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: item.is_dir ? 600 : 400,
                        color: 'var(--text-primary)',
                        maxWidth: '100%'
                      }}>
                        {item.name}
                      </span>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: viewMode === 'grid' ? 'center' : 'flex-end',
                      gap: viewMode === 'grid' ? 8 : 16,
                      flexShrink: 0,
                      width: viewMode === 'grid' ? '100%' : undefined,
                      marginTop: viewMode === 'grid' ? 10 : 0
                    }}>
                      {!item.is_dir && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {item.size_human}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--text-muted)', padding: 4 }}
                        onClick={(e) => copyPath(item.path, e)}
                        title="Copy path"
                        icon={Copy}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--red)', padding: 4 }}
                        onClick={(e) => handleDeleteItem(item, e)}
                        icon={Trash2}
                      />
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

                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>
                    {selectedFile.path}
                  </code>
                  <Button variant="ghost" size="sm" style={{ padding: 3 }} onClick={(e) => copyPath(selectedFile.path, e)} title="Copy file path" icon={Copy} />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                    icon={X}
                  >
                    Close
                  </Button>
                  {!selectedFile.isMedia && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!isModified}
                      loading={saveLoading}
                      onClick={handleSaveFile}
                      icon={Save}
                    >
                      Save File
                    </Button>
                  )}
                </div>
              </div>

              {editorError && (
                <div className="auth-error" style={{ marginBottom: '1rem', flexShrink: 0 }}>{editorError}</div>
              )}

              {/* Text Area Code Editor or Media Previews */}
              {selectedFile.isMedia ? (
                selectedFile.mediaType === 'image' ? (
                  <ImageViewer file={selectedFile} />
                ) : selectedFile.mediaType === 'audio' ? (
                  <AudioPlayer file={selectedFile} />
                ) : selectedFile.mediaType === 'video' ? (
                  <VideoPlayer file={selectedFile} />
                ) : selectedFile.mediaType === 'pdf' ? (
                  <PdfReader file={selectedFile} />
                ) : null
              ) : (
                <CodeEditor
                  value={selectedFile.content}
                  onChange={val => setSelectedFile(prev => ({ ...prev, content: val }))}
                  language={selectedFile?.name?.endsWith('.json') ? 'javascript' : selectedFile?.name?.endsWith('.py') ? 'python' : selectedFile?.name?.endsWith('.yaml') || selectedFile?.name?.endsWith('.yml') ? 'yaml' : selectedFile?.name?.includes('Dockerfile') ? 'docker' : 'javascript'}
                />
              )}
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
      <Modal
        open={!!showCreateModal}
        onOpenChange={(open) => {
          if (!open) setShowCreateModal(null);
        }}
        title={`New ${showCreateModal === 'folder' ? 'Folder' : 'File'}`}
        maxWidth={400}
      >
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
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <Button variant="soft" color="gray" onClick={() => setShowCreateModal(null)}>Cancel</Button>
            <Button type="submit" variant="solid" loading={createLoading} disabled={!newItemName.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

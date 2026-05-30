// web/src/pages/FileManager.jsx — File Manager dashboard interface
import { useState, useEffect, useRef } from 'react';
import {
  Folder, File, FileText, FileCode, Trash2, Save,
  ArrowLeft, Search, X, FolderPlus, FilePlus, ChevronRight, Copy, Upload,
  LayoutGrid, LayoutList, AlertTriangle, HardDrive, Archive, FolderArchive,
  Download, RefreshCw
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
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', background: '#171924', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
        <Button variant="ghost" size="sm" style={{ border: '1px solid var(--border)', background: '#121420' }} onClick={handleZoomIn}>Zoom In (+)</Button>
        <Button variant="ghost" size="sm" style={{ border: '1px solid var(--border)', background: '#121420' }} onClick={handleZoomOut}>Zoom Out (-)</Button>
        <Button variant="ghost" size="sm" style={{ border: '1px solid var(--border)', background: '#121420' }} onClick={handleRotate}>Rotate (90°)</Button>
        <Button variant="ghost" size="sm" style={{ border: '1px solid var(--border)', background: '#121420' }} onClick={handleReset}>Reset</Button>
      </div>
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#090a0f',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        position: 'relative',
        padding: '1rem',
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
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
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
      background: '#121420',
      borderRadius: '4px',
      border: '1px solid var(--border)',
      padding: '2.5rem 1.5rem',
      gap: '1.5rem',
      height: '100%'
    }}>
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, #252836 20%, #0d0e15 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        animation: isPlaying ? 'spin 6s linear infinite' : 'none',
        border: '6px solid #1c1d29'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '0.55rem',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          NanoFly
        </div>
        <div style={{ position: 'absolute', width: '100px', height: '100px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.02)' }} />
        <div style={{ position: 'absolute', width: '70px', height: '70px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.02)' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{file.name}</h4>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{file.size} · Audio Stream</p>
      </div>

      <div style={{ display: 'flex', gap: '3px', height: '20px', alignItems: 'center', margin: '2px 0' }}>
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            style={{
              width: '3px',
              height: isPlaying ? '100%' : '20%',
              backgroundColor: 'var(--accent)',
              borderRadius: '1px',
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
          maxWidth: '360px',
          outline: 'none',
          borderRadius: '4px',
          background: '#171924'
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
      background: '#090a0f',
      borderRadius: '4px',
      border: '1px solid var(--border)',
      padding: '1rem',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.875rem',
      minHeight: 0,
      height: '100%'
    }}>
      <video
        src={file.rawUrl}
        controls
        style={{
          maxWidth: '100%',
          maxHeight: '85%',
          borderRadius: '4px',
          outline: 'none',
          backgroundColor: '#000'
        }}
      />
      <div style={{ textAlign: 'center' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{file.name}</h4>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{file.size} · Video Stream</p>
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
      borderRadius: '4px',
      border: '1px solid var(--border)',
      background: '#121420',
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

function FileOverview({ file, onUnzip, onDownload, onLoadAnyway, zipLoading }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '2rem',
      backgroundColor: '#121420',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      textAlign: 'center',
      gap: '1.25rem',
      color: 'var(--text-primary)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '56px',
        height: '56px',
        borderRadius: '4px',
        backgroundColor: '#1a1d2e',
        color: file.isZip ? '#eab308' : '#3b82f6',
        border: '1px solid var(--border)'
      }}>
        <Archive size={28} />
      </div>

      <div style={{ maxWidth: '100%' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', wordBreak: 'break-all' }}>
          {file.name}
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {file.size} · {file.isZip ? 'ZIP Archive' : 'Large File'}
        </p>
        <code style={{
          display: 'block',
          marginTop: '8px',
          padding: '4px 8px',
          backgroundColor: '#0a0b0e',
          color: 'var(--text-secondary)',
          borderRadius: '3px',
          fontSize: '0.7rem',
          wordBreak: 'break-all',
          border: '1px solid var(--border)',
          fontFamily: 'monospace'
        }}>
          {file.path}
        </code>
      </div>

      <div style={{
        padding: '10px',
        backgroundColor: '#1a1d2e',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.4,
        maxWidth: '340px'
      }}>
        {file.isZip ? (
          "This ZIP archive can be extracted directly on the server, or downloaded to your local computer."
        ) : (
          "This file is large. Loading it with syntax highlighting might crash or slow down your browser. You can download it or load it as plain text."
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {file.isZip && (
          <Button
            variant="primary"
            onClick={onUnzip}
            loading={zipLoading}
            icon={FolderArchive}
          >
            Extract Archive
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={onDownload}
          icon={Download}
        >
          Download File
        </Button>
        {!file.isZip && (
          <Button
            variant="ghost"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', backgroundColor: '#1a1d2e' }}
            onClick={onLoadAnyway}
          >
            Load as Text Anyway
          </Button>
        )}
      </div>
    </div>
  );
}

export default function FileManager() {
  const toast = useToast();

  const getQueryPath = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('path') || localStorage.getItem('nanofly_filemanager_path') || '/';
  };

  const [currentPath, setCurrentPath] = useState(getQueryPath);
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
  const [selectedFile, setSelectedFile] = useState(null); 
  const [editorLoading, setEditorLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [zipLoading, setZipLoading] = useState(false);

  // Modals / Inputs
  const [showCreateModal, setShowCreateModal] = useState(null); // 'file' | 'folder' | null
  const [newItemName, setNewItemName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Sync currentPath to URL search params & localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (currentPath) {
      params.set('path', currentPath);
      localStorage.setItem('nanofly_filemanager_path', currentPath);
    } else {
      params.delete('path');
    }
    const newSearch = params.toString() ? `?${params.toString()}` : '';
    if (window.location.search !== newSearch) {
      window.history.replaceState(null, '', window.location.pathname + newSearch);
    }
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
        sizeBytes: item.size,
        isMedia: true,
        mediaType,
        rawUrl
      });
      return;
    }

    const isZip = item.name.endsWith('.zip');
    // If it's a ZIP or larger than 2 MB, intercept with overview details card to prevent freezing
    if (isZip || item.size > 2 * 1024 * 1024) {
      setSelectedFile({
        path: item.path,
        name: item.name,
        size: item.size_human,
        sizeBytes: item.size,
        isOverview: true,
        isZip
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
          size: item.size_human,
          sizeBytes: item.size,
          isPlaintextFallback: item.size > 500 * 1024 // bypass heavy highlight rendering for files > 500 KB
        });
      }
    } catch (err) {
      setEditorError(err.message || 'Failed to open file');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleLoadAnyway = async (file) => {
    setEditorError('');
    setEditorLoading(true);
    try {
      const res = await filesApi.view(file.path);
      if (res) {
        setSelectedFile({
          path: file.path,
          name: file.name,
          content: res.content,
          originalContent: res.content,
          size: file.size,
          sizeBytes: file.sizeBytes,
          isPlaintextFallback: true
        });
      }
    } catch (err) {
      setEditorError(err.message || 'Failed to open file');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleDownloadFile = (file) => {
    const token = localStorage.getItem('nanofly_token');
    const rawUrl = `/api/v1/files/raw?path=${encodeURIComponent(file.path)}&token=${token}`;
    window.open(rawUrl, '_blank');
  };

  const handleZipItem = async (item, e) => {
    e?.stopPropagation();
    setZipLoading(true);
    try {
      await filesApi.zip(item.path);
      toast.success(`Successfully zipped ${item.name}`);
      loadDirectory(currentPath);
    } catch (err) {
      toast.error(err.message || 'Failed to compress item');
    } finally {
      setZipLoading(false);
    }
  };

  const handleUnzipItem = async (item, e) => {
    e?.stopPropagation();
    setZipLoading(true);
    try {
      await filesApi.unzip(item.path);
      toast.success(`Successfully extracted archive ${item.name}`);
      loadDirectory(currentPath);
    } catch (err) {
      toast.error(err.message || 'Failed to extract archive');
    } finally {
      setZipLoading(false);
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

    let accum = '';
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
    if (item.is_dir) return <Folder size={16} style={{ color: '#eab308' }} />;
    const ext = item.name.split('.').pop().toLowerCase();
    if (ext === 'zip') return <Archive size={16} style={{ color: '#eab308' }} />;
    if (['go', 'js', 'jsx', 'ts', 'tsx', 'py', 'php', 'html', 'css', 'json', 'sh', 'yaml', 'yml'].includes(ext)) {
      return <FileCode size={16} style={{ color: '#3b82f6' }} />;
    }
    if (['md', 'txt', 'log', 'conf', 'env'].includes(ext)) {
      return <FileText size={16} style={{ color: '#10b981' }} />;
    }
    return <File size={16} style={{ color: 'var(--text-muted)' }} />;
  };

  const isModified = selectedFile && selectedFile.content !== selectedFile.originalContent;

  return (
    <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', padding: '1rem', backgroundColor: '#090a0f' }}>

      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: '1rem', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2, fontSize: '1.25rem' }}>File Manager</h1>
          <p className="page-subtitle" style={{ fontSize: '0.78rem' }}>Inspect, edit, and manage files on your NanoFly server</p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <Button variant="secondary" size="sm" loading={uploadLoading} style={{ background: '#121420', border: '1px solid var(--border)' }} onClick={() => fileInputRef.current?.click()} icon={Upload}>
            Upload Files
          </Button>
          <Button variant="secondary" size="sm" loading={uploadLoading} style={{ background: '#121420', border: '1px solid var(--border)' }} onClick={() => folderInputRef.current?.click()} icon={Upload}>
            Upload Folder
          </Button>
          <Button variant="secondary" size="sm" style={{ background: '#121420', border: '1px solid var(--border)' }} onClick={() => setShowCreateModal('folder')} icon={FolderPlus}>
            New Folder
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal('file')} icon={FilePlus}>
            New File
          </Button>
        </div>
      </div>

      {/* Breadcrumbs and Actions Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0.5rem 0.75rem',
        background: '#121420',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        marginBottom: '0.75rem',
        flexWrap: 'wrap',
        fontSize: '0.82rem',
        flexShrink: 0
      }}>
        {getBreadcrumbs().map((crumb, idx) => (
          <div key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {idx > 0 && <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
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
        <Button variant="ghost" size="sm" style={{ marginLeft: 'auto', padding: '2px 6px', border: '1px solid var(--border)', background: '#171924' }} onClick={(e) => copyPath(currentPath || rootPath, e)} icon={Copy}>
          Copy Path
        </Button>
      </div>

      {/* Warning banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: '0.75rem',
        padding: '0.5rem 0.75rem',
        border: protectedPath ? '1px solid #d97706' : '1px solid var(--border)',
        borderRadius: '4px',
        background: protectedPath ? '#1e1b12' : '#10111a',
        color: protectedPath ? '#f59e0b' : 'var(--text-secondary)',
        fontSize: '0.76rem',
        flexShrink: 0
      }}>
        <AlertTriangle size={14} style={{ color: protectedPath ? '#f59e0b' : 'var(--accent)' }} />
        <span>{protectedPath ? 'System files alert: Editing or deleting here can break NanoFly or the server.' : 'Safe workspace: Use directory storage to edit configuration and project files.'}</span>
        {uploadStatus && <span style={{ marginLeft: 'auto', color: uploadStatus.includes('failed') ? 'var(--red)' : 'var(--green)' }}>{uploadStatus}</span>}
      </div>

      {/* Main Double Panel Layout */}
      <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minHeight: 0 }}>

        {/* Drives Sidebar */}
        {drives.length > 0 && (
          <div style={{
            width: '180px',
            display: 'flex',
            flexDirection: 'column',
            padding: '0.75rem',
            gap: '0.5rem',
            background: '#121420',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            flexShrink: 0,
            overflowY: 'auto'
          }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              Drives & Mounts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                      gap: '8px',
                      padding: '8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: isDriveActive ? '#1a1d2e' : 'transparent',
                      border: '1px solid',
                      borderColor: isDriveActive ? 'var(--accent)' : 'transparent',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '24px',
                      width: '24px',
                      borderRadius: '3px',
                      background: isDriveActive ? 'var(--accent)' : '#1a1d2e',
                      color: isDriveActive ? '#fff' : 'var(--accent)',
                      flexShrink: 0
                    }}>
                      <HardDrive size={13} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={drive.name}>
                        {drive.name}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                        {drive.free_human} free
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Directory Explorer Pane */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '0.875rem',
          minWidth: 0,
          background: '#121420',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          position: 'relative'
        }}>
          {/* Search bar & view toggle */}
          <div style={{ marginBottom: '0.75rem', flexShrink: 0, display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 30, height: '32px', fontSize: '0.8rem', background: '#0a0b10', border: '1px solid var(--border)', borderRadius: '4px' }}
                placeholder="Filter files..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 2, background: '#0a0b10', border: '1px solid var(--border)', borderRadius: '4px', padding: 2 }}>
              <button className={`btn btn-ghost btn-sm ${viewMode === 'list' ? 'active' : ''}`} title="List view" onClick={() => setViewMode('list')} style={{ padding: 4, height: 26, width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)' }}>
                <LayoutList size={13} />
              </button>
              <button className={`btn btn-ghost btn-sm ${viewMode === 'grid' ? 'active' : ''}`} title="Grid view" onClick={() => setViewMode('grid')} style={{ padding: 4, height: 26, width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)' }}>
                <LayoutGrid size={13} />
              </button>
            </div>
          </div>

          {/* Directory Content list */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {error && (
              <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>
            )}

            {filteredItems.length === 0 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 6 }}>
                <Folder size={28} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: '0.78rem' }}>No matches found</span>
              </div>
            )}

            <div style={{
              display: viewMode === 'grid' ? 'grid' : 'flex',
              gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(118px, 1fr))' : undefined,
              flexDirection: viewMode === 'grid' ? undefined : 'column',
              gap: viewMode === 'grid' ? 6 : 2
            }}>
              {/* Back Link */}
              {getParentPath() && (
                <div
                  onClick={() => setCurrentPath(getParentPath())}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    border: '1px solid transparent',
                    background: '#181a26'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                >
                  <ArrowLeft size={13} />
                  <span>.. (Parent Directory)</span>
                </div>
              )}

              {/* File/Folder Items */}
              {filteredItems.map(item => {
                const isZip = item.name.endsWith('.zip');
                const isItemActive = selectedFile?.path === item.path;

                return (
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
                      padding: viewMode === 'grid' ? '8px' : '4px 8px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      minHeight: viewMode === 'grid' ? 96 : undefined,
                      transition: 'background 0.1s, border-color 0.1s',
                      background: isItemActive ? '#1a1d2e' : 'transparent',
                      border: '1px solid',
                      borderColor: isItemActive ? 'var(--accent)' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (!isItemActive) {
                        e.currentTarget.style.background = '#181a26';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isItemActive) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexDirection: viewMode === 'grid' ? 'column' : 'row',
                      gap: viewMode === 'grid' ? 6 : 8,
                      minWidth: 0,
                      width: viewMode === 'grid' ? '100%' : undefined,
                      textAlign: viewMode === 'grid' ? 'center' : 'left'
                    }}>
                      <span style={{ transform: viewMode === 'grid' ? 'scale(1.2)' : 'none', marginBottom: viewMode === 'grid' ? 2 : 0 }}>{getFileIcon(item)}</span>
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
                      gap: viewMode === 'grid' ? 4 : 8,
                      flexShrink: 0,
                      width: viewMode === 'grid' ? '100%' : undefined,
                      marginTop: viewMode === 'grid' ? 6 : 0
                    }}>
                      {!item.is_dir && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {item.size_human}
                        </span>
                      )}

                      {/* Zip / Extract Actions */}
                      {isZip ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: '#eab308', padding: 2, height: 20, width: 20 }}
                          onClick={(e) => handleUnzipItem(item, e)}
                          title="Extract ZIP"
                          icon={FolderArchive}
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: 'var(--accent)', padding: 2, height: 20, width: 20 }}
                          onClick={(e) => handleZipItem(item, e)}
                          title="Compress to ZIP"
                          icon={Archive}
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--text-muted)', padding: 2, height: 20, width: 20 }}
                        onClick={(e) => copyPath(item.path, e)}
                        title="Copy path"
                        icon={Copy}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--red)', padding: 2, height: 20, width: 20 }}
                        onClick={(e) => handleDeleteItem(item, e)}
                        title="Delete"
                        icon={Trash2}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Directory Fetch Loader */}
          {loading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(18, 20, 32, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              zIndex: 10,
              borderRadius: '4px'
            }}>
              <div className="spinner" style={{ width: 18, height: 18, borderTopColor: 'var(--accent)' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Loading folder...</span>
            </div>
          )}
        </div>

        {/* Right Side: File Editor & Detail View */}
        <div style={{
          flex: 1.5,
          display: 'flex',
          flexDirection: 'column',
          padding: '0.875rem',
          minWidth: 0,
          background: '#121420',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          position: 'relative'
        }}>
          {selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

              {/* Editor Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '0.5rem',
                marginBottom: '0.75rem',
                flexShrink: 0
              }}>
                <div>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {selectedFile.name}
                  </h3>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Size: {selectedFile.size} · {selectedFile.isOverview ? 'Archive/Big file' : isModified ? <span style={{ color: 'var(--yellow)', fontWeight: 500 }}>Modified</span> : 'Saved'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ border: '1px solid var(--border)', background: '#171924', padding: '2px 8px', height: 26 }}
                    onClick={() => setSelectedFile(null)}
                    icon={X}
                  >
                    Close
                  </Button>
                  {!selectedFile.isMedia && !selectedFile.isOverview && (
                    <Button
                      variant="primary"
                      size="sm"
                      style={{ padding: '2px 8px', height: 26 }}
                      disabled={!isModified}
                      loading={saveLoading}
                      onClick={handleSaveFile}
                      icon={Save}
                    >
                      Save
                    </Button>
                  )}
                </div>
              </div>

              {editorError && (
                <div className="auth-error" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>{editorError}</div>
              )}

              {/* Loader for loading file content */}
              {editorLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(18, 20, 32, 0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                  zIndex: 10,
                  borderRadius: '4px'
                }}>
                  <div className="spinner" style={{ width: 22, height: 22, borderTopColor: 'var(--accent)' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading file content...</span>
                </div>
              )}

              {/* Content area: Previews, Editor or plain textarea */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {selectedFile.isOverview ? (
                  <FileOverview
                    file={selectedFile}
                    onUnzip={() => handleUnzipItem(selectedFile)}
                    onDownload={() => handleDownloadFile(selectedFile)}
                    onLoadAnyway={() => handleLoadAnyway(selectedFile)}
                    zipLoading={zipLoading}
                  />
                ) : selectedFile.isMedia ? (
                  selectedFile.mediaType === 'image' ? (
                    <ImageViewer file={selectedFile} />
                  ) : selectedFile.mediaType === 'audio' ? (
                    <AudioPlayer file={selectedFile} />
                  ) : selectedFile.mediaType === 'video' ? (
                    <VideoPlayer file={selectedFile} />
                  ) : selectedFile.mediaType === 'pdf' ? (
                    <PdfReader file={selectedFile} />
                  ) : null
                ) : selectedFile.isPlaintextFallback ? (
                  <textarea
                    value={selectedFile.content}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedFile(prev => ({ ...prev, content: val }));
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      backgroundColor: '#0a0b10',
                      color: '#c9d1d9',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '10px',
                      outline: 'none',
                      resize: 'none',
                      lineHeight: '1.45'
                    }}
                  />
                ) : (
                  <CodeEditor
                    value={selectedFile.content}
                    onChange={val => setSelectedFile(prev => ({ ...prev, content: val }))}
                    language={selectedFile?.name?.endsWith('.json') ? 'javascript' : selectedFile?.name?.endsWith('.py') ? 'python' : selectedFile?.name?.endsWith('.yaml') || selectedFile?.name?.endsWith('.yml') ? 'yaml' : selectedFile?.name?.includes('Dockerfile') ? 'docker' : 'javascript'}
                  />
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 10 }}>
              <File size={32} style={{ opacity: 0.25 }} />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>No File Selected</h3>
                <p style={{ fontSize: '0.74rem', maxWidth: 220, margin: '0 auto' }}>Select a file from the explorer list on the left to edit or preview.</p>
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

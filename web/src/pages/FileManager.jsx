// web/src/pages/FileManager.jsx — File Manager dashboard interface
import { useState, useEffect, useRef } from 'react';
import {
  Folder, File, FileText, FileCode, Trash2, Save,
  ArrowLeft, Search, X, FolderPlus, FilePlus, ChevronRight, Copy, Upload,
  LayoutGrid, LayoutList, AlertTriangle, HardDrive, Archive, FolderArchive,
  Download, RefreshCw, Edit2, Loader2
} from 'lucide-react';
import { filesApi } from '../api/client';
import { Modal, Button, useToast } from '../components/ui';
import CodeEditor from '../components/CodeEditor';

function ImageViewer({ file }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mediaLoading, setMediaLoading] = useState(true);

  // CSS Image Filters
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [invert, setInvert] = useState(false);
  const [rotate, setRotate] = useState(0);

  const containerRef = useRef(null);

  useEffect(() => {
    setMediaLoading(true);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setBrightness(100);
    setContrast(100);
    setGrayscale(0);
    setSepia(0);
    setInvert(false);
    setRotate(0);
  }, [file.path]);

  // Handle Mouse wheel 
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 0.12;
    let nextScale = scale + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
    nextScale = Math.max(0.2, Math.min(nextScale, 6));
    setScale(nextScale);
    if (nextScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setBrightness(100);
    setContrast(100);
    setGrayscale(0);
    setSepia(0);
    setInvert(false);
    setRotate(0);
  };

  const filterStyle = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%) sepia(${sepia}%) invert(${invert ? 100 : 0}%)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '0.75rem', height: '100%' }}>
      {/* Editor Controls Bar */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: 'var(--bg-elevated)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)'
      }}>
        {/* Sliders Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px 16px'
        }}>
          {/* Brightness */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 40px', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 500 }}>Brightness</span>
            <input
              type="range"
              min="0"
              max="200"
              value={brightness}
              onChange={e => setBrightness(Number(e.target.value))}
              style={{ width: '100%', height: '4px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '0.72rem', textAlign: 'right', fontFamily: 'monospace' }}>{brightness}%</span>
          </div>

          {/* Contrast */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 40px', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 500 }}>Contrast</span>
            <input
              type="range"
              min="0"
              max="200"
              value={contrast}
              onChange={e => setContrast(Number(e.target.value))}
              style={{ width: '100%', height: '4px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '0.72rem', textAlign: 'right', fontFamily: 'monospace' }}>{contrast}%</span>
          </div>

          {/* Grayscale */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 40px', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 500 }}>Grayscale</span>
            <input
              type="range"
              min="0"
              max="100"
              value={grayscale}
              onChange={e => setGrayscale(Number(e.target.value))}
              style={{ width: '100%', height: '4px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '0.72rem', textAlign: 'right', fontFamily: 'monospace' }}>{grayscale}%</span>
          </div>

          {/* Sepia */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 40px', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 500 }}>Sepia</span>
            <input
              type="range"
              min="0"
              max="100"
              value={sepia}
              onChange={e => setSepia(Number(e.target.value))}
              style={{ width: '100%', height: '4px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '0.72rem', textAlign: 'right', fontFamily: 'monospace' }}>{sepia}%</span>
          </div>
        </div>

        {/* Separator / Divider */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

        {/* Actions Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={invert}
                onChange={e => setInvert(e.target.checked)}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span>Invert Colors</span>
            </label>
          </div>

          {/* Zoom & Reset Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '4px' }}>Zoom</span>
              <Button
                variant="ghost"
                size="sm"
                style={{ height: '20px', width: '20px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setScale(s => Math.max(0.2, s - 0.25))}
                title="Zoom Out"
              >
                -
              </Button>
              <input
                type="range"
                min="20"
                max="600"
                value={Math.round(scale * 100)}
                onChange={e => setScale(Number(e.target.value) / 100)}
                style={{ width: '80px', height: '4px', cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              <Button
                variant="ghost"
                size="sm"
                style={{ height: '20px', width: '20px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setScale(s => Math.min(6, s + 0.25))}
                title="Zoom In"
              >
                +
              </Button>
              <span style={{ minWidth: '36px', fontSize: '0.72rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                {Math.round(scale * 100)}%
              </span>
            </div>

            <Button
              variant="secondary"
              size="sm"
              style={{ height: '28px', fontSize: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              onClick={() => setRotate(r => (r + 90) % 360)}
            >
              Rotate 90°
            </Button>
            <Button
              variant="secondary"
              size="sm"
              style={{ height: '28px', fontSize: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              onClick={handleReset}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Editor Canvas Area */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          position: 'relative',
          padding: '1rem',
          minHeight: 0,
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          border: '1px solid var(--border)'
        }}
      >
        {mediaLoading && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'var(--bg-base)',
            zIndex: 10
          }}>
            <Loader2 className="spin" size={24} style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Fetching image...</span>
          </div>
        )}
        <img
          src={file.rawUrl}
          alt={file.name}
          draggable="false"
          onLoad={() => setMediaLoading(false)}
          onError={() => setMediaLoading(false)}
          style={{
            maxHeight: '98%',
            maxWidth: '98%',
            objectFit: 'contain',
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotate}deg)`,
            filter: filterStyle,
            transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            userSelect: 'none',
            pointerEvents: 'none',
            display: mediaLoading ? 'none' : 'block'
          }}
        />
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: '3px 6px',
          borderRadius: '3px',
          fontSize: '0.62rem',
          pointerEvents: 'none',
          fontFamily: 'sans-serif',
          zIndex: 11
        }}>
          Scroll wheel / Pinch to zoom · Drag to pan
        </div>
      </div>
    </div>
  );
}

function AudioPlayer({ file }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const audioRef = useRef(null);

  useEffect(() => {
    setMediaLoading(true);
    setIsPlaying(false);
  }, [file.path]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      borderRadius: 'var(--radius-sm)',
      padding: '2.5rem 1.5rem',
      gap: '1.5rem',
      height: '100%',
      position: 'relative',
      border: '1px solid var(--border)'
    }}>
      {mediaLoading && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          background: 'var(--bg-base)',
          borderRadius: 'var(--radius-sm)',
          zIndex: 10
        }}>
          <Loader2 className="spin" size={24} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Loading audio...</span>
        </div>
      )}

      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--bg-elevated) 20%, var(--bg-base) 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        animation: isPlaying ? 'spin 6s linear infinite' : 'none',
        border: '6px solid var(--border)'
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
        onCanPlay={() => setMediaLoading(false)}
        onError={() => setMediaLoading(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        style={{
          width: '100%',
          maxWidth: '360px',
          outline: 'none',
          borderRadius: '4px'
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
  const [mediaLoading, setMediaLoading] = useState(true);

  useEffect(() => {
    setMediaLoading(true);
  }, [file.path]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      borderRadius: 'var(--radius-sm)',
      padding: '1rem',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.875rem',
      minHeight: 0,
      height: '100%',
      position: 'relative',
      border: '1px solid var(--border)'
    }}>
      {mediaLoading && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          background: 'var(--bg-base)',
          borderRadius: 'var(--radius-sm)',
          zIndex: 10
        }}>
          <Loader2 className="spin" size={24} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Loading video...</span>
        </div>
      )}
      <video
        src={file.rawUrl}
        controls
        onCanPlay={() => setMediaLoading(false)}
        onError={() => setMediaLoading(false)}
        style={{
          maxWidth: '100%',
          maxHeight: '90%',
          borderRadius: '4px',
          outline: 'none',
          backgroundColor: '#000',
          display: mediaLoading ? 'none' : 'block'
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
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-base)',
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
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-sm)',
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
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--bg-elevated)',
        color: file.isZip ? 'var(--yellow)' : 'var(--accent)',
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
          backgroundColor: 'var(--bg-base)',
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
        backgroundColor: 'var(--bg-base)',
        borderRadius: 'var(--radius-sm)',
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
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}
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

  // Sorting variables
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'size' | 'date'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Selected file details
  const [selectedFile, setSelectedFile] = useState(null); 
  const [editorLoading, setEditorLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [zipLoading, setZipLoading] = useState(false);

  // Modals / Inputs
  const [showCreateModal, setShowCreateModal] = useState(null); // 'file' | 'folder' | null
  const [showRenameModal, setShowRenameModal] = useState(null); // item object or null
  const [newItemName, setNewItemName] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [renameError, setRenameError] = useState('');

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
    
    // Support all audio formats
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'mp2', 'mid', 'midi'].includes(ext)) {
      return 'audio';
    }
    // Support all video formats
    if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'm4v', '3gp'].includes(ext)) {
      return 'video';
    }
    // Support all image formats
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'heic', 'avif'].includes(ext)) {
      return 'image';
    }
    // Support PDF
    if (ext === 'pdf') {
      return 'pdf';
    }
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

    const isZip = item.name.endsWith('.zip') || item.name.endsWith('.tar') || item.name.endsWith('.gz') || item.name.endsWith('.rar');
    if (isZip || item.size > 2 * 1024 * 1024) {
      setSelectedFile({
        path: item.path,
        name: item.name,
        size: item.size_human,
        sizeBytes: item.size,
        isOverview: true,
        isZip: item.name.endsWith('.zip')
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
          isPlaintextFallback: item.size > 500 * 1024
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

  const handleRenameItem = async (e) => {
    e.preventDefault();
    if (!renameNewName.trim() || !showRenameModal) return;
    setRenameLoading(true);
    setRenameError('');
    
    const itemPath = showRenameModal.path;
    const lastSlash = itemPath.replace(/\\/g, '/').lastIndexOf('/');
    let parentDir = '';
    if (lastSlash >= 0) {
      parentDir = itemPath.substring(0, lastSlash);
    }
    const newPath = parentDir ? `${parentDir}/${renameNewName.trim()}` : renameNewName.trim();

    try {
      await filesApi.rename(showRenameModal.path, newPath);
      toast.success(`Successfully renamed to ${renameNewName.trim()}`);
      if (selectedFile?.path === showRenameModal.path) {
        setSelectedFile(null);
      }
      setRenameNewName('');
      setShowRenameModal(null);
      loadDirectory(currentPath);
    } catch (err) {
      setRenameError(err.message || 'Failed to rename');
    } finally {
      setRenameLoading(false);
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

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  // Folder-First multi-metric sorting
  const sortedItems = [...filteredItems].sort((a, b) => {
    // Keep folders on top
    if (a.is_dir && !b.is_dir) return -1;
    if (!a.is_dir && b.is_dir) return 1;

    let valA = '';
    let valB = '';

    if (sortBy === 'size') {
      valA = a.size || 0;
      valB = b.size || 0;
    } else if (sortBy === 'date') {
      valA = new Date(a.mod_time).getTime();
      valB = new Date(b.mod_time).getTime();
    } else {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const protectedPath = (() => {
    const path = (currentPath || '').replace(/\\/g, '/');
    return ['/', '/bin', '/boot', '/dev', '/etc', '/lib', '/opt/nanofly', '/proc', '/root', '/sbin', '/sys', '/usr', '/var'].some(p => path === p || path.startsWith(`${p}/`));
  })();

  const getFileIcon = (item) => {
    if (item.is_dir) return <Folder size={16} style={{ color: 'var(--yellow)' }} />;
    const ext = item.name.split('.').pop().toLowerCase();
    if (ext === 'zip' || ext === 'rar' || ext === 'tar' || ext === 'gz') {
      return <Archive size={16} style={{ color: 'var(--yellow)' }} />;
    }
    if (['go', 'js', 'jsx', 'ts', 'tsx', 'py', 'php', 'html', 'css', 'json', 'sh', 'yaml', 'yml'].includes(ext)) {
      return <FileCode size={16} style={{ color: 'var(--accent)' }} />;
    }
    if (['md', 'txt', 'log', 'conf', 'env'].includes(ext)) {
      return <FileText size={16} style={{ color: 'var(--green)' }} />;
    }
    return <File size={16} style={{ color: 'var(--text-muted)' }} />;
  };

  const isModified = selectedFile && selectedFile.content !== selectedFile.originalContent;

  return (
    <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', padding: '1rem', backgroundColor: 'var(--bg-base)' }}>

      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: '0.75rem', flexShrink: 0, paddingBottom: '0.5rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2, fontSize: '1.25rem', color: 'var(--text-primary)' }}>File Manager</h1>
          <p className="page-subtitle" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Inspect, edit, and manage files on your NanoFly server</p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <Button variant="secondary" size="sm" loading={uploadLoading} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => fileInputRef.current?.click()} icon={Upload}>
            Upload Files
          </Button>
          <Button variant="secondary" size="sm" loading={uploadLoading} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => folderInputRef.current?.click()} icon={Upload}>
            Upload Folder
          </Button>
          <Button variant="secondary" size="sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => setShowCreateModal('folder')} icon={FolderPlus}>
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
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        marginBottom: '0.5rem',
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
        <Button variant="ghost" size="sm" style={{ marginLeft: 'auto', padding: '2px 6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }} onClick={(e) => copyPath(currentPath || rootPath, e)} icon={Copy}>
          Copy Path
        </Button>
      </div>

      {/* Warning banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: '0.5rem',
        padding: '0.4rem 0.75rem',
        border: protectedPath ? '1px solid var(--red)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: protectedPath ? 'var(--red-dim)' : 'var(--bg-surface)',
        color: protectedPath ? 'var(--red)' : 'var(--text-secondary)',
        fontSize: '0.76rem',
        flexShrink: 0
      }}>
        <AlertTriangle size={14} style={{ color: protectedPath ? 'var(--red)' : 'var(--accent)' }} />
        <span>{protectedPath ? 'System files alert: Editing or deleting here can break NanoFly or the server.' : 'Safe workspace: Use directory storage to edit configuration and project files.'}</span>
        {uploadStatus && <span style={{ marginLeft: 'auto', color: uploadStatus.includes('failed') ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{uploadStatus}</span>}
      </div>

      {/* Unified Borderless Columns Layout */}
      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflowX: 'auto'
      }}>

        {/* Column 1: Drives Sidebar */}
        {drives.length > 0 && (
          <div style={{
            width: '180px',
            minWidth: '180px',
            display: 'flex',
            flexDirection: 'column',
            padding: '0.75rem',
            gap: '0.5rem',
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border)',
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
                      padding: '8px 6px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: isDriveActive ? 'var(--bg-elevated)' : 'transparent',
                      border: '1px solid',
                      borderColor: isDriveActive ? 'var(--accent)' : 'transparent',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '22px',
                      width: '22px',
                      borderRadius: '3px',
                      background: isDriveActive ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: isDriveActive ? '#fff' : 'var(--accent)',
                      flexShrink: 0
                    }}>
                      <HardDrive size={12} />
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

        {/* Column 2: Directory Explorer */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={e => e.preventDefault()}
          style={{
            flex: 1.2,
            display: 'flex',
            flexDirection: 'column',
            padding: '0.75rem',
            minWidth: '300px',
            flexShrink: 0,
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border)',
            position: 'relative'
          }}
        >
          {/* Search bar, sorting & view toggle */}
          <div style={{ marginBottom: '0.6rem', flexShrink: 0, display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 30, height: '30px', fontSize: '0.8rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}
                placeholder="Filter files..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Sorting controls */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '4px', padding: 2 }}>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  fontSize: '0.72rem',
                  outline: 'none',
                  cursor: 'pointer',
                  padding: '0 4px',
                  fontWeight: 500
                }}
              >
                <option value="name" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>Sort by Name</option>
                <option value="size" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>Sort by Size</option>
                <option value="date" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>Sort by Date</option>
              </select>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                style={{ padding: '0 6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}
                title="Toggle order"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '4px', padding: 2 }}>
              <button className={`btn btn-ghost btn-sm ${viewMode === 'list' ? 'active' : ''}`} title="List view" onClick={() => setViewMode('list')} style={{ padding: 4, height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)' }}>
                <LayoutList size={13} />
              </button>
              <button className={`btn btn-ghost btn-sm ${viewMode === 'grid' ? 'active' : ''}`} title="Grid view" onClick={() => setViewMode('grid')} style={{ padding: 4, height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)' }}>
                <LayoutGrid size={13} />
              </button>
            </div>
          </div>

          {/* Directory Content list */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {error && (
              <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>
            )}

            {sortedItems.length === 0 && !loading && (
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
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    border: '1px solid transparent',
                    background: 'var(--bg-elevated)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                >
                  <ArrowLeft size={13} style={{ color: 'var(--text-secondary)' }} />
                  <span>.. (Parent Directory)</span>
                </div>
              )}

              {/* Items */}
              {sortedItems.map(item => {
                const isZip = item.name.endsWith('.zip') || item.name.endsWith('.tar') || item.name.endsWith('.gz') || item.name.endsWith('.rar');
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
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      minHeight: viewMode === 'grid' ? 96 : undefined,
                      transition: 'background 0.1s, border-color 0.1s',
                      background: isItemActive ? 'var(--bg-elevated)' : 'transparent',
                      border: '1px solid',
                      borderColor: isItemActive ? 'var(--accent)' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (!isItemActive) {
                        e.currentTarget.style.background = 'var(--bg-elevated)';
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

                      {/* Compress / Extract Actions */}
                      {isZip ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: 'var(--yellow)', padding: 2, height: 20, width: 20 }}
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

                      {/* Rename action button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--text-muted)', padding: 2, height: 20, width: 20 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowRenameModal(item);
                          setRenameNewName(item.name);
                        }}
                        title="Rename"
                        icon={Edit2}
                      />

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
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'var(--bg-surface)',
              opacity: 0.9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              zIndex: 10
            }}>
              <div className="spinner" style={{ width: 18, height: 18, borderTopColor: 'var(--accent)' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Loading folder...</span>
            </div>
          )}

          {/* Drag & Drop Upload Zone Overlay */}
          {isDragging && (
            <div
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: 'var(--accent)',
                zIndex: 20
              }}
              onDragLeave={handleDragLeave}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload size={36} className="spin" style={{ animationDuration: '3s' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Drop files here to upload to this directory</span>
            </div>
          )}
        </div>

        {/* Column 3: Workbench Editor & Previews */}
        <div style={{
          flex: 1.5,
          display: 'flex',
          flexDirection: 'column',
          padding: '0.875rem',
          minWidth: '450px',
          flexShrink: 0,
          background: 'var(--bg-surface)',
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
                    style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', padding: '2px 8px', height: 26 }}
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
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: 'var(--bg-surface)',
                  opacity: 0.9,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                  zIndex: 10
                }}>
                  <div className="spinner" style={{ width: 22, height: 22, borderTopColor: 'var(--accent)' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading file content...</span>
                </div>
              )}

              {/* Content workbench area: Previews, Editor or plain textarea */}
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
                      backgroundColor: 'var(--bg-base)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
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

      {/* Rename File / Folder Modal */}
      <Modal
        open={!!showRenameModal}
        onOpenChange={(open) => {
          if (!open) setShowRenameModal(null);
        }}
        title="Rename Item"
        maxWidth={400}
      >
        <form onSubmit={handleRenameItem}>
          {renameError && (
            <div className="auth-error" style={{ marginBottom: 12 }}>{renameError}</div>
          )}
          <div className="form-group">
            <label className="form-label">New Name</label>
            <input
              className="form-input"
              placeholder="Enter new name"
              value={renameNewName}
              onChange={e => setRenameNewName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <Button variant="soft" color="gray" onClick={() => setShowRenameModal(null)}>Cancel</Button>
            <Button type="submit" variant="solid" loading={renameLoading} disabled={!renameNewName.trim() || renameNewName.trim() === showRenameModal?.name}>
              Rename
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

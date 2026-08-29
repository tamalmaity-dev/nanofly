// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, HardDrive, FileText, Folder, Database, Info, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Button, Modal } from '../ui';
import { servicesApi } from '../../api/client';
import { markPendingRedeploy } from '../../utils/servicePending';
import { useToast } from '../ui';

function parseVolumes(raw) {
  if (!raw || raw === '[]') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeVolumes(volumes) {
  return JSON.stringify(volumes);
}

const MOUNT_TYPES = [
  { id: 'volume', label: 'Volume Mount', desc: 'Docker managed volume', icon: Database, iconColor: '#8b5cf6' },
  { id: 'file', label: 'File Mount', desc: 'Bind mount a single file', icon: FileText, iconColor: '#3b82f6' },
  { id: 'directory', label: 'Directory Mount', desc: 'Bind mount a directory', icon: Folder, iconColor: '#eab308' },
];

function getMountTypeMeta(type) {
  return MOUNT_TYPES.find(t => t.id === type) || MOUNT_TYPES[0];
}

function getDefaultPath(type) {
  switch (type) {
    case 'volume': return '/data';
    case 'file': return '/app/config.yaml';
    case 'directory': return '/app/data';
    default: return '/data';
  }
}

export default function VolumesPanel({ service, onUpdate }) {
  const toast = useToast();
  const [volumes, setVolumes] = useState(() => parseVolumes(service.volumes));
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('volume');
  const [form, setForm] = useState({ name: '', host_path: '', container_path: '', readonly: false });
  const dropdownRef = useRef(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setVolumes(parseVolumes(service.volumes));
  }, [service.volumes]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  const openAddModal = (type) => {
    setModalType(type);
    setForm({
      name: '',
      host_path: '',
      container_path: getDefaultPath(type),
      readonly: false,
    });
    setShowDropdown(false);
    setModalOpen(true);
  };

  const handleAdd = () => {
    if (!form.container_path.trim()) {
      toast.error('Destination Path is required');
      return;
    }
    if (modalType !== 'volume' && !form.host_path.trim()) {
      toast.error('Source Path is required');
      return;
    }
    if (modalType === 'volume' && !form.name.trim()) {
      toast.error('Volume Name is required');
      return;
    }
    setVolumes(prev => [
      ...prev,
      {
        name: form.name.trim() || `pv-${Date.now()}`,
        type: modalType,
        host_path: form.host_path.trim(),
        container_path: form.container_path.trim(),
        readonly: form.readonly,
      },
    ]);
    setModalOpen(false);
  };

  const handleRemove = (index) => {
    setVolumes(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await servicesApi.update(service.id, {
        volumes: serializeVolumes(volumes),
      });
      markPendingRedeploy(service.id);
      toast.success('Storage configuration saved. Redeploy to apply.');
      onUpdate?.();
    } catch (err) {
      toast.error(err.message || 'Failed to save storage');
    }
    setSaving(false);
  };

  const getMountDisplayInfo = (vol) => {
    const meta = getMountTypeMeta(vol.type);
    if (vol.type === 'volume') {
      return { label: vol.name || 'unnamed', sub: vol.container_path };
    }
    return { label: vol.host_path, sub: vol.container_path };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header with Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Storages
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Info size={12} />
            </span>
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Persistent storage to preserve data between deployments.
          </p>
        </div>

        {/* Add Dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDropdown(!showDropdown)}
            icon={Plus}
            style={{ gap: 4 }}
          >
            Add
            <ChevronDown size={14} style={{ marginLeft: 2, transition: 'transform 0.2s', transform: showDropdown ? 'rotate(180deg)' : 'none' }} />
          </Button>

          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 4,
              minWidth: 220,
              zIndex: 50,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}>
              {MOUNT_TYPES.map(mt => {
                const Icon = mt.icon;
                return (
                  <div
                    key={mt.id}
                    onClick={() => openAddModal(mt.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-base)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: `${mt.iconColor}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={14} color={mt.iconColor} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{mt.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{mt.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Instruction Guide */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}>
        <div
          onClick={() => setGuideOpen(!guideOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} color="var(--accent)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              How does Persistent Storage work?
            </span>
          </div>
          <ChevronRight
            size={16}
            style={{
              color: 'var(--text-muted)',
              transition: 'transform 0.2s',
              transform: guideOpen ? 'rotate(90deg)' : 'none',
            }}
          />
        </div>

        {guideOpen && (
          <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 14 }}>

              {/* What is Persistent Storage */}
              <div>
                <h5 style={{ margin: '0 0 6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  What is Persistent Storage?
                </h5>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  By default, files inside a container are <strong>lost</strong> when the container is recreated during redeployment.
                  Persistent storage lets you keep important data — like configuration files, uploads, or databases — safe on the server
                  by linking a host path or Docker volume to a path inside the container.
                </p>
              </div>

              {/* Mount Types */}
              <div>
                <h5 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Mount Types
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Volume Mount */}
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Database size={14} color="#8b5cf6" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Volume Mount</div>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Docker manages the storage location automatically. Data persists across container restarts and redeployments.
                        Use this when you don't need to access the files directly from the host server.
                      </p>
                    </div>
                  </div>

                  {/* File Mount */}
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <FileText size={14} color="#3b82f6" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>File Mount</div>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Maps a single file from the server into the container. Great for config files like{' '}
                        <code style={{ fontSize: '0.75rem', background: 'rgba(79,110,247,0.1)', padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace' }}>
                          /home/user/config.yaml → /app/config.yaml
                        </code>
                      </p>
                    </div>
                  </div>

                  {/* Directory Mount */}
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(234,179,8,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Folder size={14} color="#eab308" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Directory Mount</div>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Maps an entire folder from the server into the container. Useful for data directories, uploads, or logs like{' '}
                        <code style={{ fontSize: '0.75rem', background: 'rgba(79,110,247,0.1)', padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace' }}>
                          /srv/data → /app/data
                        </code>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Common Examples */}
              <div>
                <h5 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Common Use Cases
                </h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { src: '/home/ntrip-caster/config.yaml', dest: '/app/config.yaml', label: 'App config file' },
                    { src: '/srv/certs', dest: '/etc/letsencrypt', label: 'SSL certificates' },
                    { src: '/var/log/myapp', dest: '/app/logs', label: 'Application logs' },
                    { src: '/srv/uploads', dest: '/app/public/uploads', label: 'User uploads' },
                  ].map((ex, i) => (
                    <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.75rem' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{ex.label}</div>
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)', fontSize: '0.72rem', wordBreak: 'break-all' }}>
                        {ex.src} <span style={{ color: 'var(--text-muted)' }}>→</span> {ex.dest}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Important Note */}
              <div style={{
                padding: '10px 12px',
                background: 'rgba(245, 158, 11, 0.06)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: 6,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}>
                <AlertCircle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: '#f59e0b' }}>Note:</strong> After saving, you must <strong>Redeploy</strong> the service for volume changes to take effect.
                  The current running container will continue using the old configuration until then.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Volumes list */}
      {volumes.length === 0 ? (
        <div style={{
          padding: '2.5rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
        }}>
          <HardDrive size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: 4 }}>No storage found.</div>
          <div style={{ fontSize: '0.8rem' }}>Click <strong>Add</strong> to mount a volume, file, or directory.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Source Path</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Destination Path</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', width: 80 }}>Mode</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((vol, idx) => {
                const meta = getMountTypeMeta(vol.type);
                const Icon = meta.icon;
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {vol.name || `pv-${idx}`}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: `${meta.iconColor}15`,
                        color: meta.iconColor,
                      }}>
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace', color: vol.type === 'volume' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {vol.type === 'volume' ? '—' : vol.host_path}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>
                      {vol.container_path}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
                      {vol.readonly ? (
                        <span style={{ color: 'var(--yellow)', fontSize: '0.75rem', fontWeight: 500 }}>Read-only</span>
                      ) : (
                        <span style={{ color: 'var(--green)', fontSize: '0.75rem', fontWeight: 500 }}>Read/Write</span>
                      )}
                    </td>
                    <td style={{ padding: '6px 14px', textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ padding: 3, minWidth: 28, height: 28, color: 'var(--red)' }}
                        onClick={() => handleRemove(idx)}
                        icon={Trash2}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Save button */}
      {volumes.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving} icon={Save}>
            Save Storage
          </Button>
        </div>
      )}

      {/* Add Volume Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={`Add ${getMountTypeMeta(modalType).label}`}
        maxWidth={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {modalType === 'volume'
              ? 'Docker Volumes mounted to the container.'
              : modalType === 'file'
                ? 'Bind mount a single file from the host.'
                : 'Bind mount a directory from the host.'}
          </p>

          {modalType === 'volume' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Name <span style={{ color: 'var(--red)' }}>*</span>
                <span title="A unique name for this Docker volume" style={{ cursor: 'help', color: 'var(--text-muted)', fontSize: '0.75rem' }}>(i)</span>
              </label>
              <input
                className="form-input"
                placeholder="pv-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
          )}

          {modalType !== 'volume' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Source Path <span title="Absolute path on the host machine" style={{ cursor: 'help', color: 'var(--text-muted)', fontSize: '0.75rem' }}>(i)</span>
              </label>
              <input
                className="form-input"
                placeholder={modalType === 'file' ? '/home/user/config.yaml' : '/home/user/data'}
                value={form.host_path}
                onChange={e => setForm(f => ({ ...f, host_path: e.target.value }))}
                autoFocus
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Destination Path <span style={{ color: 'var(--red)' }}>*</span>
              <span title="Absolute path inside the container" style={{ cursor: 'help', color: 'var(--text-muted)', fontSize: '0.75rem' }}>(i)</span>
            </label>
            <input
              className="form-input"
              placeholder={modalType === 'file' ? '/app/config.yaml' : '/app/data'}
              value={form.container_path}
              onChange={e => setForm(f => ({ ...f, container_path: e.target.value }))}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.readonly}
              onChange={e => setForm(f => ({ ...f, readonly: e.target.checked }))}
            />
            Read-only mount
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

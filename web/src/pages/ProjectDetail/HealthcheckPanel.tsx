// @ts-nocheck
import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { servicesApi } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { markPendingRedeploy } from '../../utils/servicePending';

export function HealthcheckPanel({ service, onUpdate }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(!!service.healthcheck_enabled);
  const [path, setPath] = useState(service.healthcheck_path || '/');
  const [port, setPort] = useState(service.healthcheck_port ? String(service.healthcheck_port) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(!!service.healthcheck_enabled);
    setPath(service.healthcheck_path || '/');
    setPort(service.healthcheck_port ? String(service.healthcheck_port) : '');
  }, [service]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await servicesApi.update(service.id, {
        healthcheck_enabled: enabled,
        healthcheck_path: path.trim() || '/',
        healthcheck_port: Number(port) || 0,
      });
      markPendingRedeploy(service.id);
      toast.info('Healthcheck settings saved');
      onUpdate();
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 600 }}>Healthcheck</h4>
        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Configure HTTP healthcheck settings. These are stored for future use.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 16 }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Enable healthcheck
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Path</label>
            <input className="form-input" value={path} onChange={e => setPath(e.target.value)} placeholder="/" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Port</label>
            <input className="form-input" value={port} onChange={e => setPort(e.target.value)} placeholder={service.port || '3000'} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button variant="primary" icon={Save} onClick={handleSave} loading={saving}>
          Save
        </Button>
      </div>
    </div>
  );
}

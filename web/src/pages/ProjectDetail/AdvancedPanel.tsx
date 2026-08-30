// @ts-nocheck
import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { servicesApi } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { markPendingRedeploy } from '../../utils/servicePending';

export function AdvancedPanel({ service, onUpdate }) {
  const toast = useToast();
  const [dockerArgs, setDockerArgs] = useState(service.docker_args || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDockerArgs(service.docker_args || '');
  }, [service]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await servicesApi.update(service.id, { docker_args: dockerArgs.trim() });
      markPendingRedeploy(service.id);
      toast.info('Advanced settings saved — Redeploy to apply changes');
      onUpdate();
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 600 }}>Docker run arguments</h4>
        <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Extra Docker flags for hardware or networking.
        </p>
        <input
          className="form-input"
          value={dockerArgs}
          onChange={e => setDockerArgs(e.target.value)}
          placeholder="--network host"
          style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button variant="primary" icon={Save} onClick={handleSave} loading={saving}>
          Save
        </Button>
      </div>
    </div>
  );
}

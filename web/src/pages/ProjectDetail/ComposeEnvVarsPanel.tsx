// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Check, FileCode } from 'lucide-react';
import { servicesApi } from '../../api/client';
import { Button } from '../../components/ui';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

export function ComposeEnvVarsPanel({ service, onUpdate }) {
  const [vars, setVars] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const svcName = (() => {
    try {
      const parsed = yamlLoad(service.docker_compose_content || '');
      return parsed?.services ? Object.keys(parsed.services)[0] : null;
    } catch { return null; }
  })();

  useEffect(() => {
    try {
      const parsed = yamlLoad(service.docker_compose_content || '');
      const firstSvc = parsed?.services ? parsed.services[Object.keys(parsed.services)[0]] : null;
      const env = firstSvc?.environment;
      const list = [];
      if (Array.isArray(env)) {
        for (const e of env) {
          const s = String(e);
          const eq = s.indexOf('=');
          if (eq > 0) list.push({ key: s.slice(0, eq), value: s.slice(eq + 1) });
        }
      } else if (env && typeof env === 'object') {
        for (const [k, v] of Object.entries(env)) list.push({ key: k, value: String(v) });
      }
      setVars(list);
    } catch {
      setVars([]);
    }
  }, [service.docker_compose_content]);

  const saveToCompose = async (nextVars) => {
    setSaving(true);
    setError('');
    try {
      const parsed = yamlLoad(service.docker_compose_content || '');
      if (!parsed?.services || !svcName) throw new Error('Invalid compose file');
      // Update environment as list of KEY=VAL
      parsed.services[svcName].environment = nextVars.map(v => `${v.key}=${v.value}`);
      const newYaml = yamlDump(parsed);
      await servicesApi.update(service.id, { docker_compose_content: newYaml });
      setVars(nextVars);
      onUpdate?.();
    } catch (e) {
      setError(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const add = async () => {
    if (!newKey.trim()) return;
    const next = [...vars, { key: newKey.trim(), value: newVal }];
    await saveToCompose(next);
    setNewKey(''); setNewVal('');
  };

  const remove = async (key) => {
    const next = vars.filter(v => v.key !== key);
    await saveToCompose(next);
  };

  return (
    <div>
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.20)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: '0.82rem', color: '#93c5fd', marginBottom: 16 }}>
        Editing here updates your <code style={{ background: 'var(--bg-base)', padding: '1px 5px', borderRadius: 4 }}>docker-compose.yml</code> — redeploy to apply.
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 12 }}>{error}</p>}

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}><th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Key</th><th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Value</th><th style={{ width: 40 }}></th></tr></thead>
          <tbody>
            {vars.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No environment variables</td></tr>
            )}
            {vars.map(ev => (
              <tr key={ev.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>{ev.key}</td>
                <td style={{ padding: '10px 12px', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{ev.value}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28, color: 'var(--red)' }} onClick={() => remove(ev.key)} icon={Trash2} disabled={saving} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="KEY" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace' }} />
        <input className="form-input" placeholder="value" value={newVal} onChange={e => setNewVal(e.target.value)} style={{ flex: 2 }} />
        <Button variant="primary" size="sm" onClick={add} icon={Plus} loading={saving} disabled={saving || !newKey.trim()}>
          Add
        </Button>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
        Changes are saved to your compose file. Click <strong>Redeploy</strong> to recreate the stack.
      </p>
    </div>
  );
}

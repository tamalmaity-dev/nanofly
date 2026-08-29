// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Trash2, Copy, Eye, EyeOff, Plus, Check } from 'lucide-react';
import { servicesApi } from '../../api/client';
import { Button } from '../../components/ui';
import { markPendingRedeploy } from '../../utils/servicePending';

const parseBulkEnv = (text) => {
  if (!text) return [];
  const lines = text.split('\n');
  const parsed = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) parsed.push({ key, value });
  }
  return parsed;
};

export function EnvVarsPanel({ serviceId }) {
  const [vars, setVars] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [show, setShow] = useState({});
  const [saved, setSaved] = useState(null);
  const [isBulk, setIsBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    servicesApi.getEnvVars(serviceId).then(setVars).catch(() => { });
  }, [serviceId]);

  const add = async () => {
    if (!newKey) return;
    await servicesApi.upsertEnvVar(serviceId, newKey, newVal);
    setVars(v => [...v.filter(x => x.key !== newKey), { key: newKey, value: newVal }]);
    setSaved(newKey);
    markPendingRedeploy(serviceId);
    setTimeout(() => setSaved(null), 2000);
    setNewKey(''); setNewVal('');
  };

  const remove = async (key) => {
    await servicesApi.deleteEnvVar(serviceId, key);
    setVars(v => v.filter(x => x.key !== key));
  };

  const copy = (val) => navigator.clipboard.writeText(val);

  const handleToggleBulk = () => {
    if (!isBulk) {
      const text = vars.map(ev => `${ev.key}=${ev.value}`).join('\n');
      setBulkText(text);
      setError('');
    }
    setIsBulk(!isBulk);
  };

  const saveBulk = async () => {
    setLoading(true);
    setError('');
    try {
      const parsed = parseBulkEnv(bulkText);
      const parsedKeys = parsed.map(x => x.key);
      for (const item of parsed) {
        await servicesApi.upsertEnvVar(serviceId, item.key, item.value);
      }
      const toDelete = vars.filter(v => !parsedKeys.includes(v.key));
      for (const item of toDelete) {
        await servicesApi.deleteEnvVar(serviceId, item.key);
      }
      const updated = await servicesApi.getEnvVars(serviceId);
      setVars(updated);
      setIsBulk(false);
      setSaved('bulk');
      markPendingRedeploy(serviceId);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setError(e.message || 'Failed to save environment variables');
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Environment Variables</h4>
        <Button variant="outline" size="sm" onClick={handleToggleBulk}>
          {isBulk ? 'Cancel Bulk' : 'Bulk Import / Edit'}
        </Button>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: '1rem' }}>⚠ {error}</p>}

      {isBulk ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            className="form-input"
            style={{ minHeight: '200px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem', width: '100%', boxSizing: 'border-box' }}
            placeholder="KEY=value&#10;PORT=8000"
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            disabled={loading}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="soft" color="gray" size="sm" onClick={() => setIsBulk(false)} disabled={loading}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={saveBulk} loading={loading}>
              Save Variables
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
            <table className="data-table">
              <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
              <tbody>
                {vars.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No environment variables</td></tr>
                )}
                {vars.map(ev => {
                  const isShown = Object.prototype.hasOwnProperty.call(show, ev.key) && show[ev.key];
                  return (
                    <tr key={ev.key}>
                      <td><code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>{ev.key}</code></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                            {isShown ? ev.value : '••••••••'}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ padding: 3, minWidth: 28, height: 28 }}
                            onClick={() => {
                              if (ev.key !== '__proto__' && ev.key !== 'constructor') {
                                setShow(s => ({ ...s, [ev.key]: !isShown }));
                              }
                            }}
                            icon={isShown ? EyeOff : Eye}
                          />
                          <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28 }} onClick={() => copy(ev.value)} icon={Copy} />
                        </div>
                      </td>
                      <td>
                        <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28, color: 'var(--red)' }} onClick={() => remove(ev.key)} icon={Trash2} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="KEY" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace' }} />
            <input className="form-input" placeholder="value" value={newVal} onChange={e => setNewVal(e.target.value)} style={{ flex: 2 }} />
            <Button variant="primary" size="sm" onClick={add} icon={saved ? Check : Plus}>
              {saved ? ' Saved' : ' Add'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

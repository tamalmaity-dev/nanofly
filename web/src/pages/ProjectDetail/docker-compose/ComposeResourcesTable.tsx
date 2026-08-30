// @ts-nocheck
import React from 'react';
import { Package } from 'lucide-react';
import { parseComposeResources } from './composeUtils';

export function ComposeResourcesTable({ composeYaml, status }) {
  const resources = parseComposeResources(composeYaml || '');
  if (resources.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
        No services defined
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Resource</th>
            <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Image</th>
            <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {resources.map(r => (
            <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 14px', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={14} /> {r.name}
              </td>
              <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>{r.image}</td>
              <td style={{ padding: '10px 14px' }}>
                <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 999, background: status === 'running' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: status === 'running' ? '#22c55e' : '#ef4444' }}>{status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

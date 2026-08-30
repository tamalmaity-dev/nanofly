// @ts-nocheck
import { Server } from 'lucide-react';

export function ServersPanel() {
  return (
    <div>
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={16} /> Deployment destination
        </h4>
        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          NanoFly runs on a single host. All deployments target this server.
        </p>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Server</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 14px', fontSize: '0.85rem', fontWeight: 500 }}>localhost</td>
              <td style={{ padding: '10px 14px', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                  Active
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

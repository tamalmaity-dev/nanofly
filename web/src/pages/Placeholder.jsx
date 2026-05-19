// src/pages/Placeholder.jsx — Coming soon page for unbuilt sections
import { Construction } from 'lucide-react';

export default function Placeholder({ title, description, phase }) {
  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
        <span className="badge badge-yellow">Phase {phase}</span>
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '4rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        textAlign: 'center',
      }}>
        <Construction size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
        <div>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Coming in Phase {phase}</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 400, fontSize: '0.9rem' }}>{description}</p>
        </div>
        <span className="badge badge-gray" style={{ marginTop: '0.5rem', padding: '4px 12px', fontSize: '0.8rem' }}>
          🔨 Under Construction
        </span>
      </div>
    </div>
  );
}

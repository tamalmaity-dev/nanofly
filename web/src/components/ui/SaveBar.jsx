import React from 'react';
import { Save } from 'lucide-react';

export function SaveBar({ saving, saved, onSave }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
      <button className="btn btn-primary" onClick={onSave} disabled={saving}>
        <Save size={15} /> {saving ? 'Saving...' : 'Save Settings'}
      </button>
      {saved && <span style={{ color: 'var(--green)', fontSize: '0.85rem' }}>Saved</span>}
    </div>
  );
}

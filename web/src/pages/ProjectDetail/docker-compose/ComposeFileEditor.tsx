// @ts-nocheck
import React from 'react';
import CodeEditor from '../../../components/CodeEditor';
import { Button } from '../../../components/ui';

export function ComposeFileEditor({ value, onChange, height = 260, readOnly = false }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <CodeEditor value={value || ''} onChange={onChange} language="yaml" style={{ height }} readOnly={readOnly} />
    </div>
  );
}

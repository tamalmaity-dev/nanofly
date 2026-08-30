// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Code, FileText, RefreshCw, Save, Play } from 'lucide-react';
import { servicesApi } from '../../api/client';
import { Button, useToast } from '../../components/ui';

const THEMES = ['Tomorrow', 'Monokai', 'Dracula', 'GitHub', 'Nord'];

const THEME_STYLES: Record<string, { bg: string; text: string; gutter: string; border: string }> = {
  Tomorrow: { bg: '#ffffff', text: '#333333', gutter: '#999999', border: '#e0e0e0' },
  Monokai: { bg: '#272822', text: '#f8f8f2', gutter: '#75715e', border: '#3e3d32' },
  Dracula: { bg: '#282a36', text: '#f8f8f2', border: '#44475a' },
  GitHub: { bg: '#f6f8fa', text: '#24292e', gutter: '#6a737d', border: '#e1e4e8' },
  Nord: { bg: '#2e3440', text: '#d8dee9', gutter: '#4c566a', border: '#3b4252' },
};

export function ComposePanel({ service }) {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const [theme, setTheme] = useState('Monokai');

  const isCompose = service?.builder === 'docker-compose';
  const hasChanges = content !== original;

  const fetchCompose = useCallback(async () => {
    if (!service?.id) return;
    setLoading(true);
    try {
      const data = await servicesApi.getCompose(service.id) as any;
      const c = data?.content || '';
      setContent(c);
      setOriginal(c);
    } catch {
      setContent('');
      setOriginal('');
    } finally {
      setLoading(false);
    }
  }, [service?.id]);

  useEffect(() => { fetchCompose(); }, [fetchCompose]);

  const handleValidate = async () => {
    setValidating(true);
    setValidation(null);
    try {
      const data = await servicesApi.validateCompose(service.id, content) as any;
      setValidation(data);
    } catch (e: any) {
      setValidation({ valid: false, message: e?.message || 'Validation failed' });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await servicesApi.saveCompose(service.id, content);
      setOriginal(content);
      setEditing(false);
      toast.success('Compose file saved. Service is redeploying...');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save compose file');
    } finally {
      setSaving(false);
    }
  };

  const ts = THEME_STYLES[theme] || THEME_STYLES.Monokai;

  if (!isCompose) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Compose</h3>
        <div className="card" style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-base)', border: '1px dashed var(--border)' }}>
          <Code size={30} style={{ color: 'var(--text-muted)', opacity: 0.55, marginBottom: 10 }} />
          <h4 style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Not a Compose service</h4>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>This service uses a different builder. Compose file editing is only available for Docker Compose services.</p>
        </div>
      </div>
    );
  }

  const lineCount = (content || '').split('\n').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Compose</h3>
          <p style={{ margin: '5px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            View and edit the Docker Compose file for this service.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={theme} onChange={e => setTheme(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>
            {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {!editing ? (
            <Button type="button" variant="primary" size="sm" icon={Code} onClick={() => setEditing(true)}>
              Edit Compose file
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setContent(original); setEditing(false); setValidation(null); }}>
                Cancel
              </Button>
              <Button type="button" variant="outline" size="sm" icon={Play} loading={validating} onClick={handleValidate}>
                Validate
              </Button>
              <Button type="button" variant="primary" size="sm" icon={Save} loading={saving} disabled={!hasChanges} onClick={handleSave}>
                Save & Redeploy
              </Button>
            </>
          )}
        </div>
      </div>

      {validation && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8,
          background: validation.valid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${validation.valid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          fontSize: '0.82rem', color: validation.valid ? 'var(--green)' : 'var(--red)',
        }}>
          {validation.valid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {validation.message}
        </div>
      )}

      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${ts.border}` }}>
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: editing ? 'rgba(79,110,247,0.08)' : 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${ts.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <FileText size={13} />
            docker-compose.yml
            {hasChanges && <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>* unsaved</span>}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{lineCount} lines</span>
        </div>

        {/* Editor */}
        <div style={{ display: 'flex', background: ts.bg, minHeight: 400, maxHeight: 600 }}>
          {/* Line numbers */}
          <div style={{ padding: '12px 0', minWidth: 48, textAlign: 'right', userSelect: 'none', borderRight: `1px solid ${ts.border}` }}>
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} style={{ padding: '0 10px 0 6px', fontSize: '0.78rem', lineHeight: '1.6', color: ts.gutter || '#999', fontFamily: 'monospace' }}>
                {i + 1}
              </div>
            ))}
          </div>

          {/* Content */}
          {editing ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, padding: '12px', margin: 0, border: 'none', outline: 'none', resize: 'none',
                background: ts.bg, color: ts.text, fontSize: '0.82rem', lineHeight: '1.6',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                tabSize: 2, minHeight: 400, maxHeight: 600,
              }}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const value = ta.value;
                  setContent(value.substring(0, start) + '  ' + value.substring(end));
                  requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
                }
              }}
            />
          ) : (
            <pre style={{
              flex: 1, padding: '12px', margin: 0, overflow: 'auto',
              background: 'transparent', color: ts.text, fontSize: '0.82rem', lineHeight: '1.6',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              whiteSpace: 'pre', tabSize: 2,
            }}>
              {content || '(empty)'}
            </pre>
          )}
        </div>
      </div>

      {editing && (
        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Press <kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '0.7rem' }}>Tab</kbd> for 2-space indentation. Changes are saved to the database and trigger an automatic redeploy.
        </p>
      )}
    </div>
  );
}

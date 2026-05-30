import React, { useState, useEffect, useRef } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism-tomorrow.css';

const SimpleCodeEditor = typeof Editor === 'function' ? Editor : (Editor.default || Editor);

export default function CodeEditor({ value, onChange, placeholder, style, readOnly = false, language = 'javascript' }) {
  const gutterRef = useRef(null);
  const [lineCount, setLineCount] = useState(1);
  const [editorTheme, setEditorTheme] = useState(() => {
    return localStorage.getItem('nanofly_editor_theme') || 'tomorrow';
  });
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('nanofly_editor_dark');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    const lines = value ? value.split('\n').length : 1;
    setLineCount(Math.max(lines, 1));
  }, [value]);

  useEffect(() => {
    localStorage.setItem('nanofly_editor_theme', editorTheme);
  }, [editorTheme]);

  useEffect(() => {
    localStorage.setItem('nanofly_editor_dark', String(isDark));
  }, [isDark]);

  const handleScroll = (e) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  const getGrammar = (lang) => {
    if (!lang) return Prism.languages.javascript;
    lang = lang.toLowerCase();
    switch(lang) {
      case 'bash': case 'sh': return Prism.languages.bash || Prism.languages.javascript;
      case 'yaml': case 'yml': return Prism.languages.yaml || Prism.languages.javascript;
      case 'docker': case 'dockerfile': return Prism.languages.docker || Prism.languages.javascript;
      case 'python': case 'py': return Prism.languages.python || Prism.languages.javascript;
      case 'html': case 'xml': case 'markup': return Prism.languages.markup || Prism.languages.javascript;
      default: return Prism.languages.javascript;
    }
  };

  const highlight = code => {
    try {
      const grammar = getGrammar(language);
      return Prism.highlight(code || '', grammar, language || 'javascript');
    } catch (e) {
      console.warn("Prism highlighting failed, using raw fallback:", e);
      return code || '';
    }
  };

  const getThemeBackground = () => {
    switch(editorTheme) {
      case 'dracula': return '#282a36';
      case 'monokai': return '#272822';
      case 'github-light': return '#ffffff';
      default: return isDark ? '#111520' : '#ffffff';
    }
  };

  const getThemeTextColor = () => {
    switch(editorTheme) {
      case 'dracula':
      case 'monokai':
        return '#f8f8f2';
      case 'github-light':
        return '#24292e';
      default:
        return isDark ? '#f8fafc' : '#0f172a';
    }
  };

  const getGutterBackground = () => {
    if (!isDark) return '#f1f5f9';
    switch(editorTheme) {
      case 'dracula': return '#191a21';
      case 'monokai': return '#1e1f1c';
      default: return '#181d2b';
    }
  };

  const getGutterTextColor = () => {
    return isDark ? '#64748b' : '#94a3b8';
  };

  const getEditorBorderColor = () => {
    return isDark ? '#252d40' : '#e2e8f0';
  };

  const customStyles = `
    .code-editor-textarea, .code-editor-pre {
      white-space: pre !important;
      overflow-wrap: normal !important;
      word-break: normal !important;
      background: transparent !important;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
    
    .code-editor-textarea,
    .code-editor-textarea:focus, 
    .code-editor-textarea:active, 
    .code-editor-textarea:focus-visible {
      outline: 0 !important;
      outline: none !important;
      border: 0 !important;
      border-style: none !important;
      box-shadow: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }

    .code-editor-container:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }

    pre[class*="language-"], code[class*="language-"] {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      outline: none !important;
    }

    .editor-theme-tomorrow.theme-mode-dark .token.comment { color: #6a9955 !important; font-style: italic; }
    .editor-theme-tomorrow.theme-mode-dark .token.punctuation { color: #cbd5e1 !important; }
    .editor-theme-tomorrow.theme-mode-dark .token.property, .editor-theme-tomorrow.theme-mode-dark .token.tag, .editor-theme-tomorrow.theme-mode-dark .token.number { color: #4ade80 !important; }
    .editor-theme-tomorrow.theme-mode-dark .token.string { color: #f472b6 !important; }
    .editor-theme-tomorrow.theme-mode-dark .token.keyword { color: #60a5fa !important; font-weight: bold; }
    .editor-theme-tomorrow.theme-mode-dark .token.function { color: #facc15 !important; }
    .editor-theme-tomorrow.theme-mode-dark .token.class-name { color: #38bdf8 !important; }

    .editor-theme-tomorrow.theme-mode-light .token.comment { color: #008000 !important; font-style: italic; }
    .editor-theme-tomorrow.theme-mode-light .token.punctuation { color: #334155 !important; }
    .editor-theme-tomorrow.theme-mode-light .token.property, .editor-theme-tomorrow.theme-mode-light .token.number { color: #098658 !important; }
    .editor-theme-tomorrow.theme-mode-light .token.string { color: #a31515 !important; }
    .editor-theme-tomorrow.theme-mode-light .token.keyword { color: #0000ff !important; font-weight: bold; }
    .editor-theme-tomorrow.theme-mode-light .token.function { color: #795e26 !important; }
    .editor-theme-tomorrow.theme-mode-light .token.class-name { color: #267f99 !important; }

    .editor-theme-dracula .token.comment { color: #6272a4 !important; font-style: italic; }
    .editor-theme-dracula .token.punctuation { color: #f8f8f2 !important; }
    .editor-theme-dracula .token.property, .editor-theme-dracula .token.tag { color: #ff79c6 !important; }
    .editor-theme-dracula .token.number { color: #bd93f9 !important; }
    .editor-theme-dracula .token.string { color: #f1fa8c !important; }
    .editor-theme-dracula .token.keyword { color: #ff79c6 !important; font-weight: bold; }
    .editor-theme-dracula .token.function { color: #50fa7b !important; }
    .editor-theme-dracula .token.class-name { color: #8be9fd !important; }
    
    .editor-theme-monokai .token.comment { color: #75715e !important; font-style: italic; }
    .editor-theme-monokai .token.punctuation { color: #f8f8f2 !important; }
    .editor-theme-monokai .token.property, .editor-theme-monokai .token.tag { color: #f92672 !important; }
    .editor-theme-monokai .token.number { color: #ae81ff !important; }
    .editor-theme-monokai .token.string { color: #e6db74 !important; }
    .editor-theme-monokai .token.keyword { color: #f92672 !important; font-weight: bold; }
    .editor-theme-monokai .token.function { color: #a6e22e !important; }
    .editor-theme-monokai .token.class-name { color: #66d9ef !important; }

    .editor-theme-github-light .token.comment { color: #6a737d !important; font-style: italic; }
    .editor-theme-github-light .token.punctuation { color: #24292e !important; }
    .editor-theme-github-light .token.property, .editor-theme-github-light .token.tag { color: #22863a !important; }
    .editor-theme-github-light .token.number { color: #005cc5 !important; }
    .editor-theme-github-light .token.string { color: #032f62 !important; }
    .editor-theme-github-light .token.keyword { color: #d73a49 !important; font-weight: bold; }
    .editor-theme-github-light .token.function { color: #6f42c1 !important; }
    .editor-theme-github-light .token.class-name { color: #e36209 !important; }
  `;

  return (
    <div 
      className="code-editor-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Consolas, Fira Code, Monaco, "Andale Mono", monospace',
        background: getThemeBackground(),
        border: `1px solid ${getEditorBorderColor()}`,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        height: '100%',
        width: '100%',
        ...style
      }}
    >
      <style>{customStyles}</style>

      {/* Editor Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 12px',
        background: isDark ? '#181d2b' : '#f1f5f9',
        borderBottom: `1px solid ${getEditorBorderColor()}`,
        fontSize: '0.78rem',
        color: isDark ? '#cbd5e1' : '#334155',
        flexShrink: 0,
        userSelect: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 500 }}>Theme:</span>
          <select
            value={editorTheme}
            onChange={e => {
              const theme = e.target.value;
              setEditorTheme(theme);
              if (theme === 'github-light') {
                setIsDark(false);
              } else {
                setIsDark(true);
              }
            }}
            style={{
              background: isDark ? '#111520' : '#ffffff',
              color: isDark ? '#f8fafc' : '#0f172a',
              border: `1px solid ${getEditorBorderColor()}`,
              borderRadius: '3px',
              padding: '2px 6px',
              outline: 'none',
              cursor: 'pointer',
              fontSize: '0.72rem'
            }}
          >
            <option value="tomorrow">Tomorrow</option>
            <option value="dracula">Dracula</option>
            <option value="monokai">Monokai</option>
            <option value="github-light">GitHub Light</option>
          </select>
        </div>

        <button
          onClick={() => {
            const nextDark = !isDark;
            setIsDark(nextDark);
            if (editorTheme === 'github-light' && nextDark) {
              setEditorTheme('tomorrow');
            } else if (editorTheme !== 'github-light' && !nextDark) {
              setEditorTheme('github-light');
            }
          }}
          style={{
            background: isDark ? '#111520' : '#ffffff',
            color: isDark ? '#f8fafc' : '#0f172a',
            border: `1px solid ${getEditorBorderColor()}`,
            borderRadius: '3px',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '0.72rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {isDark ? '☀️ Light Editor' : '🌙 Dark Editor'}
        </button>
      </div>
      
      <div 
        className={`editor-theme-${editorTheme} theme-mode-${isDark ? 'dark' : 'light'}`}
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0
        }}
      >
        <div 
          ref={gutterRef}
          style={{
            width: '48px',
            padding: '10px 0',
            background: getGutterBackground(),
            borderRight: `1px solid ${getEditorBorderColor()}`,
            color: getGutterTextColor(),
            textAlign: 'right',
            paddingRight: '12px',
            userSelect: 'none',
            overflow: 'hidden',
            flexShrink: 0,
            fontFamily: 'inherit'
          }}
        >
          {lineNumbers.map(ln => (
            <div key={ln} style={{ height: '20px', lineHeight: '20px' }}>{ln}</div>
          ))}
        </div>
        
        <div 
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflow: 'auto',
            position: 'relative'
          }}
        >
          <SimpleCodeEditor
            value={value || ''}
            onValueChange={val => onChange && onChange(val)}
            highlight={highlight}
            padding={10}
            placeholder={placeholder}
            readOnly={readOnly}
            preClassName="code-editor-pre"
            textareaClassName="code-editor-textarea"
            style={{
              fontFamily: 'inherit',
              fontSize: '14px',
              lineHeight: '20px',
              minHeight: '100%',
              minWidth: '100%',
              width: 'max-content',
              color: getThemeTextColor(),
              outline: 'none',
              border: 'none',
              boxShadow: 'none'
            }}
          />
        </div>
      </div>
    </div>
  );
}
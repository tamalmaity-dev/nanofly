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

  useEffect(() => {
    const lines = value ? value.split('\n').length : 1;
    setLineCount(Math.max(lines, 1));
  }, [value]);

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

  const customStyles = `
    .code-editor-textarea, .code-editor-pre {
      white-space: pre !important;
      overflow-wrap: normal !important;
      word-break: normal !important;
      background: transparent !important;
    }
    
    /* Dark Theme Syntax Highlighting Tokens (Default) */
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6a9955 !important; font-style: italic; }
    .token.punctuation { color: #cbd5e1 !important; }
    .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #4ade80 !important; }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #f472b6 !important; }
    .token.operator, .token.entity, .token.url { color: #cbd5e1 !important; }
    .token.atrule, .token.attr-value, .token.keyword { color: #60a5fa !important; font-weight: bold; }
    .token.function, .token.class-name { color: #facc15 !important; }
    .token.regex, .token.important, .token.variable { color: #38bdf8 !important; }

    /* Light Theme Syntax Highlighting Tokens */
    [data-theme="light"] .token.comment { color: #008000 !important; }
    [data-theme="light"] .token.punctuation { color: #334155 !important; }
    [data-theme="light"] .token.property, [data-theme="light"] .token.number, [data-theme="light"] .token.boolean { color: #098658 !important; }
    [data-theme="light"] .token.string, [data-theme="light"] .token.char { color: #a31515 !important; }
    [data-theme="light"] .token.keyword, [data-theme="light"] .token.atrule { color: #0000ff !important; font-weight: bold; }
    [data-theme="light"] .token.function { color: #795e26 !important; }
    [data-theme="light"] .token.variable, [data-theme="light"] .token.class-name { color: #267f99 !important; }
    [data-theme="light"] .token.operator { color: #000000 !important; }
    pre[class*="language-"], code[class*="language-"] {
      background: transparent !important;
    }
  `;

  return (
    <div style={{
      display: 'flex',
      fontFamily: 'Consolas, Fira Code, Monaco, "Andale Mono", monospace',
      fontSize: '14px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      height: '100%',
      width: '100%',
      ...style
    }}>
      <style>{customStyles}</style>
      
      <div 
        ref={gutterRef}
        style={{
          width: '48px',
          padding: '10px 0',
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border)',
          color: 'var(--text-muted)',
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
            fontSize: 'inherit',
            lineHeight: '20px',
            minHeight: '100%',
            minWidth: '100%',
            width: 'max-content',
            color: 'var(--text-primary)',
            outline: 'none'
          }}
        />
      </div>
    </div>
  );
}
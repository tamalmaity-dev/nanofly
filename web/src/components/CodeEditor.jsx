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
      case 'bash': case 'sh': return Prism.languages.bash;
      case 'yaml': case 'yml': return Prism.languages.yaml;
      case 'docker': case 'dockerfile': return Prism.languages.docker;
      case 'python': case 'py': return Prism.languages.python;
      case 'html': case 'xml': case 'markup': return Prism.languages.markup;
      case 'javascript': case 'js': case 'jsx': default: return Prism.languages.javascript;
    }
  };

  const highlight = code => Prism.highlight(code, getGrammar(language), language || 'javascript');

  return (
    <div style={{
      display: 'flex',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      fontSize: '0.85rem',
      lineHeight: '1.5',
      background: '#1d1f21',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      height: '100%',
      width: '100%',
      ...style
    }}>
      <div 
        ref={gutterRef}
        style={{
          width: '45px',
          padding: '10px 0',
          background: '#151515',
          borderRight: '1px solid #333',
          color: '#666',
          textAlign: 'right',
          paddingRight: '10px',
          userSelect: 'none',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        {lineNumbers.map(ln => (
          <div key={ln}>{ln}</div>
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
        <Editor
          value={value || ''}
          onValueChange={val => onChange && onChange(val)}
          highlight={highlight}
          padding={10}
          placeholder={placeholder}
          readOnly={readOnly}
          textareaClassName="code-editor-textarea"
          style={{
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: '1.5',
            minHeight: '100%',
            color: '#c5c8c6',
            outline: 'none'
          }}
        />
      </div>
    </div>
  );
}
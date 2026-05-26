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
    }
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6a9955 !important; font-style: italic; }
    .token.punctuation { color: #d4d4d4 !important; }
    .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #b5cea8 !important; }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #ce9178 !important; }
    .token.operator, .token.entity, .token.url, .language-css .token.string, .style .token.string { color: #d4d4d4 !important; }
    .token.atrule, .token.attr-value, .token.keyword { color: #569cd6 !important; font-weight: bold; }
    .token.function, .token.class-name { color: #dcdcaa !important; }
    .token.regex, .token.important, .token.variable { color: #9cdcfe !important; }
  `;

  return (
    <div style={{
      display: 'flex',
      fontFamily: 'Consolas, Fira Code, Monaco, "Andale Mono", monospace',
      fontSize: '13px',
      background: '#1e1e1e',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      overflow: 'hidden',
      height: '100%',
      width: '100%',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      ...style
    }}>
      <style>{customStyles}</style>
      
      <div 
        ref={gutterRef}
        style={{
          width: '48px',
          padding: '10px 0',
          background: '#1e1e1e',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          color: '#858585',
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
        <Editor
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
            color: '#d4d4d4',
            outline: 'none'
          }}
        />
      </div>
    </div>
  );
}
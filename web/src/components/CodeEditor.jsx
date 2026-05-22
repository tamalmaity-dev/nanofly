function CodeEditor({ value, onChange, placeholder, style, readOnly = false }) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const [lineCount, setLineCount] = useState(1);

  useEffect(() => {
    const lines = value ? value.split('\n').length : 1;
    setLineCount(lines);
  }, [value]);

  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div style={{
      display: 'flex',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      fontSize: '0.82rem',
      lineHeight: '1.5',
      background: 'var(--bg-base)',
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
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border)',
          color: 'var(--text-muted)',
          textAlign: 'right',
          paddingRight: '10px',
          userSelect: 'none',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch'
        }}
      >
        {lineNumbers.map(ln => (
          <div key={ln} style={{ height: '1.5em' }}>{ln}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={handleScroll}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck="false"
        style={{
          flex: 1,
          padding: '10px',
          background: 'transparent',
          color: 'var(--text-primary)',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          whiteSpace: 'pre',
          overflow: 'auto'
        }}
      />
    </div>
  );
}
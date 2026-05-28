import { useState, useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Button } from '../ui';
import { terminalWsUrl } from '../../api/client';
export default // Container Terminal Panel 

function ContainerTerminalPanel({ service }) {
  const containerRef = useRef(null);
  const xtermRef    = useRef(null);
  const fitRef      = useRef(null);
  const wsRef       = useRef(null);
  const [status, setStatus] = useState('connecting'); // connecting | open | closed | error
  const [reconnectCount, setReconnectCount] = useState(0);

  // 
  const suffix = service.id && service.id.length >= 8 ? `-${service.id.substring(0, 8)}` : '';
  const containerName = service.type === 'database'
    ? `nf-db-${service.name}${suffix}`
    : `nf-app-${service.name}${suffix}`;

  useEffect(() => {
    //  1. Create xterm instance   
    const term = new XTerm({
      theme: {
        background: '#0c0c0c',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.2)',
        black: '#000000',
        red: '#ef4444',
        green: '#4af626',
        yellow: '#eab308',
        blue: '#00d2ff',
        magenta: '#d8b4fe',
        cyan: '#00ffff',
        white: '#cccccc',
        brightBlack: '#64748b',
        brightRed: '#ef4444',
        brightGreen: '#4af626',
        brightYellow: '#eab308',
        brightBlue: '#00d2ff',
        brightMagenta: '#d8b4fe',
        brightCyan: '#00ffff',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.6,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowTransparency: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current   = fit;

    // 2. Open WebSocket 
    const wsUrl = terminalWsUrl('container', containerName);
    const ws    = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    };

    ws.onmessage = (e) => {
      const data = e.data instanceof ArrayBuffer
        ? new Uint8Array(e.data)
        : e.data;
      term.write(data);
    };

    ws.onerror = () => setStatus('error');
    ws.onclose = () => setStatus('closed');

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      const { cols, rows } = term;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [containerName, reconnectCount]);

  const reconnect = () => {
    setStatus('connecting');
    setReconnectCount(c => c + 1);
  };

  const statusColor = { open: '#22c55e', connecting: '#eab308', closed: '#ef4444', error: '#ef4444' }[status];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Interactive Console: <code style={{ fontFamily: 'JetBrains Mono', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 4 }}>{containerName}</code>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
            <span style={{ fontSize: '0.75rem', color: statusColor, textTransform: 'capitalize' }}>{status}</span>
          </div>
          {(status === 'closed' || status === 'error') && (
            <Button variant="ghost" size="sm" onClick={reconnect}>Reconnect</Button>
          )}
        </div>
      </div>
      <div 
        ref={containerRef} 
        style={{ 
          height: 400, 
          background: '#0c0c0c', 
          borderRadius: 'var(--radius)', 
          padding: '0.75rem',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }} 
      />
    </div>
  );
}



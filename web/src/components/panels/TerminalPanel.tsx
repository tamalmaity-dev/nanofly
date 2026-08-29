// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Button } from '../ui';
import { terminalWsUrl } from '../../api/client';

const MAX_RECONNECT_ATTEMPTS = 50;
const BASE_RECONNECT_DELAY = 1000; // 1s

export default // Container Terminal Panel 

function ContainerTerminalPanel({ service }) {
  const containerRef = useRef(null);
  const xtermRef    = useRef(null);
  const fitRef      = useRef(null);
  const wsRef       = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const [status, setStatus] = useState('connecting'); // connecting | open | closed | error
  const [reconnectCount, setReconnectCount] = useState(0);

  const isCompose = service.git_builder === 'docker-compose' || !!service.docker_compose_content;
  // For compose, the actual container is nf-<ID>_<svc>_1; let the backend resolve via label.
  // We pass the service ID as container hint so the backend can find it.
  const suffix = service.id && service.id.length >= 8 ? `-${service.id.substring(0, 8)}` : '';
  const containerName = isCompose
    ? service.id
    : service.type === 'database'
      ? `nf-db-${service.name}${suffix}`
      : `nf-app-${service.name}${suffix}`;

  const connect = useCallback(() => {
    // Clean up previous connection
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('connecting');

    //  1. Create xterm instance (only once)
    if (!xtermRef.current) {
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

      term.onData(data => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(new TextEncoder().encode(data));
        }
      });

      const ro = new ResizeObserver(() => {
        fit.fit();
        const { cols, rows } = term;
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
      ro.observe(containerRef.current);
    }

    // 2. Open WebSocket 
    const wsUrl = terminalWsUrl('container', containerName);
    const ws    = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      reconnectAttempts.current = 0;
      const { cols, rows } = xtermRef.current;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    };

    ws.onmessage = (e) => {
      const data = e.data instanceof ArrayBuffer
        ? new Uint8Array(e.data)
        : e.data;
      xtermRef.current?.write(data);
    };

    ws.onerror = () => setStatus('error');

    ws.onclose = () => {
      setStatus('closed');
      // Auto-reconnect with exponential backoff
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(() => connect(), delay);
      }
    };
  }, [containerName]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [connect]);

  const reconnect = () => {
    reconnectAttempts.current = 0;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    setReconnectCount(c => c + 1);
    connect();
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



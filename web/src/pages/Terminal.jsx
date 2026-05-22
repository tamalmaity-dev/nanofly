// Real xterm.js terminal connected to the Go PTY backend via WebSocket
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { terminalWsUrl } from '../api/client';
import { Box, Maximize2, Minimize2, Server, TerminalSquare, Wifi, WifiOff } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

export default function Terminal() {
  const containerRef = useRef(null);
  const xtermRef    = useRef(null);
  const fitRef      = useRef(null);
  const wsRef       = useRef(null);
  const [status, setStatus]       = useState('connecting'); // connecting | open | closed | error
  const [fullscreen, setFullscreen] = useState(false);
  const [osInfo, setOsInfo]       = useState(null);
  const [target, setTarget]       = useState({ type: 'host', container: '' });

  useEffect(() => {
    // ── 1. Check terminal status from server ──────────────────────────────
    fetch('/api/v1/terminal/status', {
      headers: { Authorization: `Bearer ${localStorage.getItem('nanofly_token')}` }
    })
      .then(r => r.json())
      .then(d => setOsInfo(d?.data || d))
      .catch(() => {});

    // ── 2. Create xterm instance ──────────────────────────────────────────
    const term = new XTerm({
      theme: {
        background: '#0d1117',
        foreground: '#e2e8f0',
        cursor: '#22f7a8',
        selectionBackground: '#2d4a74',
        black: '#0b1020',
        red: '#ff5c7a',
        green: '#22f7a8',
        yellow: '#ffd166',
        blue: '#5b8cff',
        magenta: '#c084fc',
        cyan: '#38d9ff',
        white: '#e2e8f0',
        brightBlack: '#556070',
        brightRed: '#ff7b93',
        brightGreen: '#69f0bd',
        brightYellow: '#ffe08a',
        brightBlue: '#82a8ff',
        brightMagenta: '#d8b4fe',
        brightCyan: '#7de7ff',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.6,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowTransparency: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current   = fit;

    // ── 3. Open WebSocket ─────────────────────────────────────────────────
    const wsUrl = terminalWsUrl(target.type, target.container);
    const ws    = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      // Send initial resize
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

    // Terminal → WS (stdin)
    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    // Resize observer → fit + send resize event
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
  }, [target]);

  // Re-fit when fullscreen toggles
  useEffect(() => {
    setTimeout(() => fitRef.current?.fit(), 100);
  }, [fullscreen]);

  const reconnect = () => window.location.reload();
  const containers = osInfo?.containers || [];
  const activeContainer = containers.find(c => c.id === target.container);

  const StatusIcon = status === 'open' ? Wifi : WifiOff;
  const statusColor = { open: '#22c55e', connecting: '#eab308', closed: '#ef4444', error: '#ef4444' }[status];

  return (
    <div className={`page-content fade-in ${fullscreen ? 'fullscreen-page' : ''}`}
      style={fullscreen ? { position: 'fixed', inset: 0, zIndex: 90, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', padding: '1rem' } : {}}>

      <div className="page-header" style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TerminalSquare size={20} color="var(--accent)" />
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Web Terminal</h1>
            {osInfo && (
              <p className="page-subtitle" style={{ marginTop: 2 }}>
                {osInfo.shell} · {osInfo.os}
                {!osInfo.available && ' · PTY not available on Windows dev machine'}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <StatusIcon size={13} color={statusColor} />
            <span style={{ fontSize: '0.8125rem', color: statusColor, textTransform: 'capitalize' }}>{status}</span>
          </div>
          {status === 'closed' || status === 'error' ? (
            <button className="btn btn-ghost btn-sm" onClick={reconnect}>Reconnect</button>
          ) : null}
          <select
            className="form-input terminal-target-select"
            value={target.type === 'container' ? `container:${target.container}` : 'host'}
            onChange={e => {
              const value = e.target.value;
              if (value === 'host') {
                setTarget({ type: 'host', container: '' });
              } else {
                setTarget({ type: 'container', container: value.replace('container:', '') });
              }
            }}
          >
            <option value="host">Host Root Terminal</option>
            {containers.map(c => (
              <option key={c.id} value={`container:${c.id}`}>
                {c.name || c.id} ({c.id})
              </option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={() => setFullscreen(f => !f)}>
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Terminal window */}
      <div className="terminal-window" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="terminal-titlebar">
          <div className="terminal-dot" style={{ background: '#ff5f56' }} />
          <div className="terminal-dot" style={{ background: '#ffbd2e' }} />
          <div className="terminal-dot" style={{ background: '#27c93f' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-secondary)', marginLeft: 8 }}>
            {target.type === 'container' ? <Box size={13} /> : <Server size={13} />}
            {target.type === 'container'
              ? `${activeContainer?.name || 'container'} (${target.container})`
              : 'Host Root /'}
          </span>
          {status === 'connecting' && (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Connecting…
            </span>
          )}
        </div>

        {/* xterm container */}
        <div
          ref={containerRef}
          style={{ flex: 1, padding: '6px', overflow: 'hidden', background: '#0d1117' }}
          onClick={() => xtermRef.current?.focus()}
        />
      </div>

      {/* Info footer */}
      {!fullscreen && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>💡 This is a real PTY shell running on the server</span>
          <span>·</span>
          <span>Press <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Ctrl+C</kbd> to interrupt a process</span>
          <span>·</span>
          <span>Use <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>↑ ↓</kbd> for command history</span>
        </div>
      )}
    </div>
  );
}

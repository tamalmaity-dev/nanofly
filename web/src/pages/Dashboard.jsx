// src/pages/Dashboard.jsx — Live server overview with real metrics
import { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, MemoryStick, HardDrive, Thermometer, Wifi, Clock, Server, ArrowUpCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { connectMetricsWS, metricsApi, updateApi } from '../api/client';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function colorClass(pct) {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warning';
  return '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSpeed(kbps) {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  }
  return `${kbps.toFixed(1)} KB/s`;
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ type, icon: Icon, label, value, unit, sub, pct, cpuPercents }) {
  const fill = Math.min(100, Math.max(0, pct || 0));
  return (
    <div className={`stat-card ${type} fade-in`}>
      <div className="stat-header">
        <span className="stat-label">{label}</span>
        <div className={`stat-icon ${type}`}><Icon size={18} /></div>
      </div>
      <div>
        <div className="stat-value">
          {value}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>{unit}</span>
        </div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      <div className="progress-bar">
        <div
          className={`progress-fill ${type} ${colorClass(fill)}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      {type === 'cpu' && cpuPercents && cpuPercents.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '4px 8px',
          marginTop: '0.75rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border)'
        }}>
          {cpuPercents.map((p, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.675rem', color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'monospace', minWidth: 16 }}>C{idx}</span>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${p}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
              <span style={{ fontFamily: 'monospace', minWidth: 26, textAlign: 'right' }}>{p.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mini Chart Tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: '0.8125rem',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => {
        let displayVal = '';
        if (p.unit === 'KB/s') {
          displayVal = formatSpeed(p.value);
        } else {
          displayVal = `${p.value?.toFixed(1)}%`;
        }
        return (
          <div key={p.name} style={{ color: p.stroke, display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 2 }}>
            <span>{p.name}:</span>
            <strong>{displayVal}</strong>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics]   = useState(null);
  const [history, setHistory]   = useState([]); // [{t, cpu, ram, rx, tx}]
  const [connected, setConnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const wsRef = useRef(null);
  const lastNetRef = useRef(null);

  const handleSnapshot = useCallback((snap) => {
    setMetrics(snap);
    setConnected(true);
    setHistory(prev => {
      const now = Date.now();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      let rxSpeed = 0; // KB/s
      let txSpeed = 0; // KB/s
      
      if (lastNetRef.current && snap.network) {
        const deltaSec = (now - lastNetRef.current.time) / 1000;
        if (deltaSec > 0) {
          const rxDelta = (snap.network.bytes_recv || 0) - lastNetRef.current.rx;
          const txDelta = (snap.network.bytes_sent || 0) - lastNetRef.current.tx;
          if (rxDelta >= 0) rxSpeed = (rxDelta / 1024) / deltaSec;
          if (txDelta >= 0) txSpeed = (txDelta / 1024) / deltaSec;
        }
      }
      
      if (snap.network) {
        lastNetRef.current = {
          time: now,
          rx: snap.network.bytes_recv || 0,
          tx: snap.network.bytes_sent || 0,
        };
      }

      const point = {
        t:   timeStr,
        cpu: snap.cpu?.usage_percent || 0,
        ram: snap.memory?.usage_percent || 0,
        rx:  rxSpeed,
        tx:  txSpeed,
      };
      const next = [...prev, point];
      return next.length > 30 ? next.slice(-30) : next; // keep last 30 points
    });
  }, []);

  useEffect(() => {
    // Try to get an immediate snapshot first so the UI isn't blank
    metricsApi.snapshot().then(handleSnapshot).catch(() => {});

    // Check for updates
    updateApi.check().then(res => {
      if (res?.has_update) {
        setUpdateInfo({
          hasUpdate: true,
          latestVersion: res.latest_version,
          currentVersion: res.current_version,
        });
      }
    }).catch(() => {});

    // Then open WebSocket for live updates
    const connect = () => {
      wsRef.current = connectMetricsWS(
        handleSnapshot,
        () => {
          setConnected(false);
          // Auto-reconnect after 3s
          setTimeout(connect, 3000);
        }
      );
    };
    connect();

    return () => { wsRef.current?.close(); };
  }, [handleSnapshot]);

  const m = metrics;
  const cpu  = m?.cpu?.usage_percent  || 0;
  const ram  = m?.memory?.usage_percent || 0;
  const disk = m?.disk?.usage_percent  || 0;
  const temp = m?.temperature?.[0]?.temperature || null;
  const latestPoint = history[history.length - 1] || {};
  const rxNow = latestPoint.rx || 0;
  const txNow = latestPoint.tx || 0;

  return (
    <div className="page-content fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Server Overview</h1>
          <p className="page-subtitle">
            {m?.system?.hostname || 'Loading…'}
            {m?.system?.os && ` · ${m.system.os} ${m.system.arch}`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={connected ? 'live-dot' : ''} style={!connected ? { width:8, height:8, borderRadius:'50%', background:'var(--text-muted)' } : {}} />
          <span style={{ fontSize: '0.8125rem', color: connected ? 'var(--green)' : 'var(--text-muted)' }}>
            {connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      </div>

      {/* Update Banner */}
      {updateInfo?.hasUpdate && !updateDismissed && (
        <div className="fade-in" style={{
          background: 'linear-gradient(135deg, rgba(79, 110, 247, 0.15) 0%, rgba(124, 143, 249, 0.05) 100%)',
          border: '1px solid rgba(79, 110, 247, 0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36,
              background: 'rgba(79, 110, 247, 0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0
            }}>
              <ArrowUpCircle size={20} className="pulse" />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                New Update Available!
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                NanoFly is running <strong style={{ color: 'var(--text-secondary)' }}>{updateInfo.currentVersion}</strong>. Upgrading to <strong style={{ color: 'var(--accent)' }}>{updateInfo.latestVersion}</strong> is recommended.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/settings')}
              style={{ padding: '6px 16px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Update Now
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setUpdateDismissed(true)}
              style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="stats-grid">
        <StatCard
          type="cpu" icon={Cpu} label="CPU Usage"
          value={cpu.toFixed(1)} unit="%" pct={cpu}
          sub={`${m?.cpu?.core_count || '—'} cores`}
          cpuPercents={m?.cpu?.percents}
        />
        <StatCard
          type="memory" icon={MemoryStick} label="Memory"
          value={ram.toFixed(1)} unit="%" pct={ram}
          sub={`${m?.memory?.used_human || '—'} / ${m?.memory?.total_human || '—'}`}
        />
        <StatCard
          type="disk" icon={HardDrive} label="Disk"
          value={disk.toFixed(1)} unit="%" pct={disk}
          sub={`${m?.disk?.used_human || '—'} / ${m?.disk?.total_human || '—'}`}
        />
        {temp !== null ? (
          <StatCard
            type="temp" icon={Thermometer} label="Temperature"
            value={temp.toFixed(1)} unit="°C" pct={(temp / 100) * 100}
            sub={temp >= 80 ? '⚠️ Hot!' : temp >= 60 ? 'Warm' : 'Normal'}
          />
        ) : (
          <div className="stat-card temp fade-in" style={{ justifyContent: 'center', alignItems: 'center', minHeight: 140 }}>
            <Thermometer size={24} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
              Temp sensor<br/>not available
            </span>
          </div>
        )}
      </div>

      {/* Live Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">
            <Cpu size={14} />
            CPU History
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
              <defs>
                <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4f6ef7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4f6ef7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0,100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="cpu" name="CPU" stroke="#4f6ef7" strokeWidth={2} fill="url(#gradCpu)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">
            <MemoryStick size={14} />
            Memory History
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
              <defs>
                <linearGradient id="gradRam" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0,100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="ram" name="RAM" stroke="#a855f7" strokeWidth={2} fill="url(#gradRam)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">
            <Wifi size={14} />
            Network Traffic History
            <span className="net-pill rx">RX {formatSpeed(rxNow)}</span>
            <span className="net-pill tx">TX {formatSpeed(txNow)}</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
              <defs>
                <linearGradient id="gradRx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradTx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1024 ? `${(v/1024).toFixed(0)}M` : `${v.toFixed(0)}K`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="rx" name="Download (RX)" unit="KB/s" stroke="#10b981" strokeWidth={2} fill="url(#gradRx)" dot={false} />
              <Area type="monotone" dataKey="tx" name="Upload (TX)" unit="KB/s" stroke="#3b82f6" strokeWidth={2} fill="url(#gradTx)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* System Info */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="section-title">
          <Server size={14} />
          System Information
        </div>
        <div className="sysinfo-grid">
          {[
            { k: 'Hostname',           v: m?.system?.hostname },
            { k: 'OS',                 v: m?.system?.os },
            { k: 'Platform',           v: m?.system?.platform },
            { k: 'Arch',               v: m?.system?.arch },
            { k: 'RX Current',         v: formatSpeed(rxNow) },
            { k: 'TX Current',         v: formatSpeed(txNow) },
            { k: 'Uptime',             v: fmtUptime(m?.system?.uptime_sec) },
            { k: 'CPU Load (1m)',      v: m?.cpu?.load_avg_1 !== undefined ? m.cpu.load_avg_1.toFixed(2) : '—' },
            { k: 'CPU Load (5m)',      v: m?.cpu?.load_avg_5 !== undefined ? m.cpu.load_avg_5.toFixed(2) : '—' },
            { k: 'CPU Load (15m)',     v: m?.cpu?.load_avg_15 !== undefined ? m.cpu.load_avg_15.toFixed(2) : '—' },
            { k: 'Running Containers', v: m?.system?.docker_count !== undefined ? m.system.docker_count : '—' },
            { k: 'Total Processes',    v: m?.system?.process_count || '—' },
            { k: 'Net Tx (Total)',     v: m?.network?.bytes_sent ? `${(m.network.bytes_sent / 1e6).toFixed(1)} MB` : '—' },
            { k: 'Net Rx (Total)',     v: m?.network?.bytes_recv ? `${(m.network.bytes_recv / 1e6).toFixed(1)} MB` : '—' },
            { k: 'CPU Cores',          v: m?.cpu?.core_count },
          ].map(({ k, v }) => (
            <div key={k} className="sysinfo-item">
              <span className="sysinfo-key">{k}</span>
              <span className="sysinfo-val">{v || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Network Interfaces */}
      {m?.network?.interfaces && m.network.interfaces.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1.25rem' }}>
            <Wifi size={14} />
            Network Interfaces and Connections
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {m.network.interfaces.map(ifi => {
              const isUp = ifi.flags?.includes('up');
              const isLoopback = ifi.flags?.includes('loopback');
              
              return (
                <div key={ifi.name} style={{
                  padding: '1.25rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Status Indicator Bar */}
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: isUp ? 'var(--green)' : 'var(--text-muted)',
                  }} />

                  {/* Header info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{ifi.name}</strong>
                      {isLoopback && (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                          loopback
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: isUp ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      color: isUp ? 'var(--green)' : 'var(--text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: isUp ? 'var(--green)' : 'var(--text-muted)' }} />
                      {isUp ? 'Active' : 'Down'}
                    </span>
                  </div>

                  {/* IP Addresses */}
                  <div style={{ paddingLeft: 6 }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>IP Addresses</div>
                    {ifi.ips && ifi.ips.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {ifi.ips.map(ip => (
                          <code key={ip} style={{ fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(79,110,247,0.05)', padding: '2px 6px', borderRadius: 4, width: 'fit-content', fontFamily: 'monospace' }}>
                            {ip}
                          </code>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No IPs assigned</span>
                    )}
                  </div>

                  {/* Network stats (Bytes / Packets) */}
                  <div style={{
                    marginLeft: 6,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '0.6rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid rgba(255,255,255,0.03)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Received (RX)</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {ifi.bytes_recv ? (ifi.bytes_recv / 1e6).toFixed(1) : '0.0'} MB
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {ifi.packets_recv || 0} pkts
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Transmitted (TX)</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {ifi.bytes_sent ? (ifi.bytes_sent / 1e6).toFixed(1) : '0.0'} MB
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {ifi.packets_sent || 0} pkts
                      </div>
                    </div>
                  </div>

                  {/* Metadata: MAC & MTU */}
                  <div style={{ marginLeft: 6, display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.5rem' }}>
                    <span>MAC: <strong style={{ color: 'var(--text-secondary)' }}>{ifi.mac || '—'}</strong></span>
                    <span>MTU: <strong style={{ color: 'var(--text-secondary)' }}>{ifi.mtu || '—'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// src/pages/Dashboard.jsx — Live server overview with real metrics
import { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, MemoryStick, HardDrive, Thermometer, Wifi, Clock, Server } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { connectMetricsWS, metricsApi } from '../api/client';

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

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ type, icon: Icon, label, value, unit, sub, pct }) {
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
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.stroke }}>
          {p.name}: <strong>{p.value?.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [metrics, setMetrics]   = useState(null);
  const [history, setHistory]   = useState([]); // [{t, cpu, ram}]
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  const handleSnapshot = useCallback((snap) => {
    setMetrics(snap);
    setConnected(true);
    setHistory(prev => {
      const point = {
        t:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu: snap.cpu?.usage_percent || 0,
        ram: snap.memory?.usage_percent || 0,
      };
      const next = [...prev, point];
      return next.length > 30 ? next.slice(-30) : next; // keep last 30 points
    });
  }, []);

  useEffect(() => {
    // Try to get an immediate snapshot first so the UI isn't blank
    metricsApi.snapshot().then(handleSnapshot).catch(() => {});

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

      {/* Stat Cards */}
      <div className="stats-grid">
        <StatCard
          type="cpu" icon={Cpu} label="CPU Usage"
          value={cpu.toFixed(1)} unit="%" pct={cpu}
          sub={`${m?.cpu?.core_count || '—'} cores`}
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
      </div>

      {/* System Info */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="section-title">
          <Server size={14} />
          System Information
        </div>
        <div className="sysinfo-grid">
          {[
            { k: 'Hostname',  v: m?.system?.hostname },
            { k: 'OS',        v: m?.system?.os },
            { k: 'Platform',  v: m?.system?.platform },
            { k: 'Arch',      v: m?.system?.arch },
            { k: 'Uptime',    v: fmtUptime(m?.system?.uptime_sec) },
            { k: 'Net ↑',     v: m?.network?.bytes_sent ? `${(m.network.bytes_sent / 1e6).toFixed(1)} MB` : '—' },
            { k: 'Net ↓',     v: m?.network?.bytes_recv ? `${(m.network.bytes_recv / 1e6).toFixed(1)} MB` : '—' },
            { k: 'CPU Cores', v: m?.cpu?.core_count },
          ].map(({ k, v }) => (
            <div key={k} className="sysinfo-item">
              <span className="sysinfo-key">{k}</span>
              <span className="sysinfo-val">{v || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Cpu, MemoryStick, HardDrive, Activity, Globe } from 'lucide-react';
import { servicesApi } from '../../api/client';

function parseMemToMB(memStr) {
  if (!memStr || memStr === '0 B') return 0;
  const parts = memStr.split(' ');
  const val = parseFloat(parts[0]) || 0;
  const unit = (parts[1] || 'B').toLowerCase();
  if (unit.includes('g')) return val * 1024;
  if (unit.includes('m')) return val;
  if (unit.includes('k')) return val / 1024;
  return val / (1024 * 1024);
}

function getCpuColor(val) {
  if (val > 80) return 'var(--red)';
  if (val > 50) return 'var(--yellow)';
  return 'var(--green)';
}

export default function MonitoringPanel({ serviceId, initialMetrics }) {
  const [metrics, setMetrics] = useState(() => ({
    cpu_percent: initialMetrics?.cpu_percent ?? 0,
    memory_usage: initialMetrics?.memory_usage ?? '0 B',
    network_in: '0 B',
    network_out: '0 B',
    disk_usage: '0 B',
  }));
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(!initialMetrics?.cpu_percent && !initialMetrics?.memory_usage);
  const [error, setError] = useState(null);

  const memMB = useMemo(() => parseMemToMB(metrics.memory_usage), [metrics.memory_usage]);

  useEffect(() => {
    let active = true;
    let isFirstFetch = !initialMetrics?.cpu_percent && !initialMetrics?.memory_usage;

    const fetchMetrics = async () => {
      try {
        const data = await servicesApi.getMetrics(serviceId);
        if (!active) return;

        const safeData = {
          cpu_percent: data?.cpu_percent ?? 0,
          memory_usage: data?.memory_usage ?? '0 B',
          network_in: data?.network_in ?? '0 B',
          network_out: data?.network_out ?? '0 B',
          disk_usage: data?.disk_usage ?? '0 B',
        };

        setMetrics(safeData);
        setError(null);
        if (isFirstFetch) {
          setLoading(false);
          isFirstFetch = false;
        }

        const newPoint = {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          cpu: safeData.cpu_percent,
          memory: parseMemToMB(safeData.memory_usage),
        };

        setHistory(prev => [...prev, newPoint].slice(-40));
      } catch (err) {
        if (active && isFirstFetch) {
          setError(err.message);
          setLoading(false);
          isFirstFetch = false;
        }
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [serviceId, initialMetrics?.cpu_percent, initialMetrics?.memory_usage]);

  if (loading && history.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {[Cpu, MemoryStick, HardDrive, Globe].map((Icon, i) => (
            <div key={i} className="card" style={{ padding: '1.25rem', opacity: 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 80, height: 12, background: 'var(--border)', borderRadius: 4 }} />
                <Icon size={18} color="var(--text-muted)" />
              </div>
              <div style={{ width: '60%', height: 28, background: 'var(--border)', borderRadius: 6 }} />
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px', width: 28, height: 28 }} />
          Loading live metrics...
        </div>
      </div>
    );
  }

  const chartData = history.length > 0 ? history : [{ time: '—', cpu: metrics.cpu_percent, memory: memMB }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Live Resource Usage</h3>
        <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} className="pulse" />
          Live · 4s refresh
        </span>
      </div>

      {error && (
        <div style={{ color: 'var(--amber)', background: 'rgba(245, 158, 11, 0.08)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.85rem' }}>
          <Activity size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          Metrics may be delayed: {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard
          label="CPU"
          icon={Cpu}
          accent="#3b82f6"
          value={`${metrics.cpu_percent.toFixed(1)}%`}
          barPct={Math.min(metrics.cpu_percent, 100)}
          barColor={getCpuColor(metrics.cpu_percent)}
        />
        <StatCard
          label="Memory"
          icon={MemoryStick}
          accent="#8b5cf6"
          value={metrics.memory_usage}
          sub={`${memMB.toFixed(1)} MB`}
          barPct={Math.min(memMB / 512 * 100, 100)}
          barColor="#8b5cf6"
        />
        <StatCard
          label="Disk I/O"
          icon={HardDrive}
          accent="#f59e0b"
          value={metrics.disk_usage}
        />
        <StatCard
          label="Network"
          icon={Globe}
          accent="#22c55e"
          value={`↓ ${metrics.network_in}`}
          sub={`↑ ${metrics.network_out}`}
        />
      </div>

      {/* Combined CPU + Memory chart */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600 }}>CPU & Memory Trends</h4>
        <div style={{ height: 240, minHeight: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" minTickGap={40} />
              <YAxis yAxisId="cpu" domain={[0, 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="%" width={42} />
              <YAxis yAxisId="mem" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit=" MB" width={48} />
              <RechartsTooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.8rem' }}
                formatter={(val, name) => [
                  name === 'cpu' ? `${Number(val).toFixed(1)}%` : `${Number(val).toFixed(1)} MB`,
                  name === 'cpu' ? 'CPU' : 'Memory',
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              <Line yAxisId="cpu" type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="mem" type="monotone" dataKey="memory" name="Memory" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Side-by-side area charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <MiniAreaChart title="CPU History" dataKey="cpu" color="#3b82f6" data={chartData} unit="%" formatter={v => `${v.toFixed(1)}%`} />
        <MiniAreaChart title="Memory History" dataKey="memory" color="#8b5cf6" data={chartData} unit=" MB" formatter={v => `${v.toFixed(1)} MB`} />
      </div>
    </div>
  );
}

function StatCard({ label, icon: Icon, accent, value, sub, barPct, barColor }) {
  return (
    <div
      className="card"
      style={{
        padding: '1.25rem',
        background: `linear-gradient(135deg, ${accent}12 0%, transparent 100%)`,
        border: `1px solid ${accent}30`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <Icon size={18} color={accent} />
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      {barPct != null && (
        <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${barPct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
        </div>
      )}
    </div>
  );
}

function MiniAreaChart({ title, dataKey, color, data, formatter }) {
  const gradId = `grad-${dataKey}`;
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis hide domain={[0, 'auto']} />
            <RechartsTooltip
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.78rem' }}
              formatter={(val) => [formatter(Number(val)), title.split(' ')[0]]}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradId})`} strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

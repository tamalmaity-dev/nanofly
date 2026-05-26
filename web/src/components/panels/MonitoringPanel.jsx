import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Cpu, MemoryStick, HardDrive, Activity, Globe } from 'lucide-react';
import { servicesApi, metricsApi } from '../../api/client';

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

  const [fixing, setFixing] = useState(false);
  const [fixSuccess, setFixSuccess] = useState(null);
  const [fixError, setFixError] = useState(null);

  const memMB = useMemo(() => parseMemToMB(metrics.memory_usage), [metrics.memory_usage]);

  // Fix cgroups API call to enable memory and cpu metrics reporting
  const handleFixCgroups = async () => {
    setFixing(true);
    setFixError(null);
    setFixSuccess(null);
    try {
      const res = await metricsApi.fixCgroups();
      setFixSuccess(res.message || 'Successfully updated configuration. A system reboot is required.');
    } catch (err) {
      setFixError(err.message || 'Failed to update configuration automatically.');
    } finally {
      setFixing(false);
    }
  };

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
  const isCgroupsIssue = parseMemToMB(metrics.memory_usage) === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Live Resource Usage</h3>
        <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} className="pulse" />
          Live · 4s refresh
        </span>
      </div>

      {isCgroupsIssue && (
        <div
          className="card animate-fade-in"
          style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.45) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', flexShrink: 0 }}>
              <Activity size={18} color="#ef4444" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f3f4f6' }}>Memory & CPU Metrics Reporting Disabled</h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Docker is unable to report resource usage on this host system. This usually happens on Linux servers (e.g. Raspberry Pi, Ubuntu, Debian) when cgroups memory limits are disabled in the kernel configuration.
              </p>
            </div>
          </div>
          
          {fixSuccess ? (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', fontSize: '0.8rem', fontWeight: 500 }}>
              ✓ {fixSuccess}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem' }}>
              <button
                className="btn btn-red"
                onClick={handleFixCgroups}
                disabled={fixing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {fixing ? (
                  <span className="spinner" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: '4px' }} />
                ) : null}
                Enable Real Metrics (Auto Config)
              </button>
              
              {fixError && (
                <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 500 }}>
                  ⚠ {fixError}
                </span>
              )}
            </div>
          )}
        </div>
      )}

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
      <div className="card" style={{ padding: '1.5rem', background: 'rgba(30, 41, 59, 0.2)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '12px', backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>CPU & Memory Trends</h4>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#3b82f6', fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /> CPU
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8b5cf6', fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} /> Memory
            </span>
          </div>
        </div>
        <div style={{ height: 240, minHeight: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.03)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" minTickGap={40} tickLine={false} axisLine={false} />
              <YAxis yAxisId="cpu" domain={[0, 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="%" width={42} tickLine={false} axisLine={false} />
              <YAxis yAxisId="mem" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit=" MB" width={48} tickLine={false} axisLine={false} />
              <RechartsTooltip
                contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, fontSize: '0.8rem', backdropFilter: 'blur(8px)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                formatter={(val, name) => [
                  name === 'CPU' ? `${Number(val).toFixed(1)}%` : `${Number(val).toFixed(1)} MB`,
                  name === 'CPU' ? 'CPU Usage' : 'Memory Usage',
                ]}
              />
              <Line yAxisId="cpu" type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
              <Line yAxisId="mem" type="monotone" dataKey="memory" name="Memory" stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
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
        padding: '1.5rem 1.25rem',
        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.25) 0%, rgba(15, 23, 42, 0.45) 100%)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${accent}20`,
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
        borderRadius: '12px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = `${accent}50`;
        e.currentTarget.style.boxShadow = `0 12px 30px ${accent}15, inset 0 1px 0 rgba(255, 255, 255, 0.06)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.borderColor = `${accent}20`;
        e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)';
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '8px', background: `${accent}12`, border: `1px solid ${accent}25` }}>
          <Icon size={16} color={accent} />
        </div>
      </div>
      <div style={{ fontSize: '1.85rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{sub}</div>}
      {barPct != null && (
        <div style={{ width: '100%', height: 4, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
          <div style={{ width: `${barPct}%`, height: '100%', background: `linear-gradient(90deg, ${barColor}88, ${barColor})`, borderRadius: 2, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        </div>
      )}
    </div>
  );
}

function MiniAreaChart({ title, dataKey, color, data, formatter }) {
  const gradId = `grad-${dataKey}`;
  return (
    <div className="card" style={{ padding: '1.25rem', background: 'rgba(30, 41, 59, 0.2)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '12px', backdropFilter: 'blur(8px)' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.03)" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis hide domain={[0, 'auto']} />
            <RechartsTooltip
              contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, fontSize: '0.78rem', backdropFilter: 'blur(8px)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
              formatter={(val) => [formatter(Number(val)), title.split(' ')[0]]}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradId})`} strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

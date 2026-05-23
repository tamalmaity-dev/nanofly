import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { Cpu, MemoryStick, HardDrive, Activity, Globe } from 'lucide-react';
import { servicesApi } from '../../api/client';

export default function MonitoringPanel({ serviceId }) {
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchMetrics = async () => {
      try {
        const data = await servicesApi.getMetrics(serviceId);
        if (active) {
          setMetrics(data);
          setError(null);
          setLoading(false);

          setHistory(prev => {
            let memVal = 0;
            if (data?.memory_usage) {
              const parts = data.memory_usage.split(' ');
              const val = parseFloat(parts[0]) || 0;
              const unit = parts[1] || 'B';
              if (unit.toLowerCase().includes('g')) memVal = val * 1024;
              else if (unit.toLowerCase().includes('m')) memVal = val;
              else if (unit.toLowerCase().includes('k')) memVal = val / 1024;
              else memVal = val / (1024 * 1024);
            }
            const newPoint = {
              time: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
              cpu: data?.cpu_percent ?? 0,
              memory: memVal,
            };
            return [...prev, newPoint].slice(-30);
          });
        }
      } catch (err) {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [serviceId]);

  if (loading && !metrics) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: 16 }}>
        <div className="spinner" style={{ borderTopColor: 'var(--accent)', width: 32, height: 32 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Loading live metrics...</span>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Activity size={18} color="var(--red)" />
          <strong style={{ color: 'var(--red)' }}>Error Loading Metrics</strong>
        </div>
        {error}. Ensure your container is running.
      </div>
    );
  }

  const cpu = metrics?.cpu_percent ?? 0;
  const memory = metrics?.memory_usage ?? '0 B';
  const netIn = metrics?.network_in ?? '0 B';
  const netOut = metrics?.network_out ?? '0 B';
  const disk = metrics?.disk_usage ?? '0 B';

  const getCpuColor = (val) => {
    if (val > 80) return 'var(--red)';
    if (val > 50) return 'var(--yellow)';
    return 'var(--green)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Live Resource Usage</h3>
        <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', padding: '4px 10px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} className="pulse" />
          Live
        </span>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* CPU Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(59, 130, 246, 0.02) 100%)', border: '1px solid rgba(59, 130, 246, 0.15)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CPU Usage</span>
            <Cpu size={18} color="#3b82f6" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {cpu.toFixed(1)}
            </span>
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>%</span>
          </div>
          <div style={{
            width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginTop: 8
          }}>
            <div style={{
              width: `${Math.min(cpu, 100)}%`,
              height: '100%',
              background: getCpuColor(cpu),
              borderRadius: 4,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Memory Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(139, 92, 246, 0.02) 100%)', border: '1px solid rgba(139, 92, 246, 0.15)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Memory Usage</span>
            <MemoryStick size={18} color="#8b5cf6" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {memory}
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Current memory consumption
          </div>
        </div>

        {/* Disk Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(245, 158, 11, 0.02) 100%)', border: '1px solid rgba(245, 158, 11, 0.15)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Disk Usage</span>
            <HardDrive size={18} color="#f59e0b" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {disk}
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Container disk space used
          </div>
        </div>

        {/* Network Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.02) 100%)', border: '1px solid rgba(34, 197, 94, 0.15)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Network I/O</span>
            <Globe size={18} color="#22c55e" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incoming</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
                ↓ {netIn}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outgoing</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }}>
                ↑ {netOut}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>History & Trends</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* CPU Chart */}
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CPU History
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    hide
                  />
                  <YAxis
                    domain={[0, 'dataMax + 10']}
                    hide
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      padding: '8px 12px'
                    }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                    formatter={(val) => [`${val.toFixed(2)}%`, 'CPU']}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#cpuGradient)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Memory Chart */}
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Memory History
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    hide
                  />
                  <YAxis
                    domain={[0, 'dataMax + 50']}
                    hide
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      padding: '8px 12px'
                    }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                    formatter={(val) => [`${val.toFixed(1)} MB`, 'Memory']}
                  />
                  <Area
                    type="monotone"
                    dataKey="memory"
                    stroke="#8b5cf6"
                    fillOpacity={1}
                    fill="url(#memGradient)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

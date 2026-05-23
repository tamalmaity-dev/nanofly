import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Cpu, MemoryStick, HardDrive, Activity, Globe } from 'lucide-react';
import { servicesApi } from '../../api/client';

export default function MonitoringPanel({ serviceId }) {
  const [metrics, setMetrics] = useState({
    cpu_percent: 0,
    memory_usage: '0 B',
    network_in: '0 B',
    network_out: '0 B',
    disk_usage: '0 B'
  });
  const [history, setHistory] = useState([{ time: '00:00:00', cpu: 0, memory: 0 }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let isFirstFetch = true;

    const fetchMetrics = async () => {
      try {
        const data = await servicesApi.getMetrics(serviceId);
        if (active) {
          const safeData = {
            cpu_percent: data?.cpu_percent ?? 0,
            memory_usage: data?.memory_usage ?? '0 B',
            network_in: data?.network_in ?? '0 B',
            network_out: data?.network_out ?? '0 B',
            disk_usage: data?.disk_usage ?? '0 B'
          };

          setMetrics(safeData);
          setError(null);

          if (isFirstFetch) {
            setLoading(false);
            isFirstFetch = false;
          }

          let memVal = 0;
          if (safeData.memory_usage) {
            const parts = safeData.memory_usage.split(' ');
            const val = parseFloat(parts[0]) || 0;
            const unit = parts[1] || 'B';
            if (unit.toLowerCase().includes('g')) memVal = val * 1024;
            else if (unit.toLowerCase().includes('m')) memVal = val;
            else if (unit.toLowerCase().includes('k')) memVal = val / 1024;
            else memVal = val / (1024 * 1024);
          }

          const newPoint = {
            time: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
            cpu: safeData.cpu_percent ?? 0,
            memory: memVal,
          };

          setHistory(prev => {
            if (prev.length === 1 && prev[0].time === '00:00:00') {
              return [newPoint];
            }
            return [...prev, newPoint].slice(-30);
          });
        }
      } catch (err) {
        if (active) {
          if (isFirstFetch) {
            setError(err.message);
            setLoading(false);
            isFirstFetch = false;
          }
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

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: 16 }}>
        <div className="spinner" style={{ borderTopColor: 'var(--accent)', width: 32, height: 32 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Loading live metrics...</span>
      </div>
    );
  }

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

      {error && (
        <div style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Activity size={16} color="var(--red)" />
            <strong style={{ color: 'var(--red)' }}>Note</strong>
          </div>
          {error}. Showing last known metrics.
        </div>
      )}

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
              {metrics.cpu_percent.toFixed(1)}
            </span>
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>%</span>
          </div>
          <div style={{
            width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginTop: 8
          }}>
            <div style={{
              width: `${Math.min(metrics.cpu_percent, 100)}%`,
              height: '100%',
              background: getCpuColor(metrics.cpu_percent),
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
              {metrics.memory_usage}
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
              {metrics.disk_usage}
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
                ↓ {metrics.network_in}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outgoing</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }}>
                ↑ {metrics.network_out}
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
            <div style={{ height: 180, minHeight: 180, minWidth: 200 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
                <AreaChart data={history.length > 0 ? history : [{ time: '00:00:00', cpu: 0, memory: 0 }]}>
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
                    domain={[0, history.length > 0 ? 'dataMax + 10' : 100]}
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
                    formatter={(val) => [`${typeof val === 'number' ? val.toFixed(2) : '0.00'}%`, 'CPU']}
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
            <div style={{ height: 180, minHeight: 180, minWidth: 200 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
                <AreaChart data={history.length > 0 ? history : [{ time: '00:00:00', cpu: 0, memory: 0 }]}>
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
                    domain={[0, history.length > 0 ? 'dataMax + 50' : 1000]}
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
                    formatter={(val) => [`${typeof val === 'number' ? val.toFixed(1) : '0.0'} MB`, 'Memory']}
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

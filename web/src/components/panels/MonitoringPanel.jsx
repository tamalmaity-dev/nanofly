import { useState, useEffect} from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Cpu, MemoryStick, HardDrive, Activity } from 'lucide-react';
import { servicesApi } from '../../api/client';
export default

// Monitoring Panel - Live Container Resource Usage
function MonitoringPanel({ serviceId }) {
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
            return [...prev, newPoint].slice(-20);
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
    const interval = setInterval(fetchMetrics, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [serviceId]);

  if (loading && !metrics) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: 12 }}>
        <div className="spinner" style={{ borderTopColor: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '1.05rem' }}>Loading live metrics...</span>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.875rem' }}>
        âš ï¸ {error}. Ensure your container is running.
      </div>
    );
  }

  const cpu = metrics?.cpu_percent ?? 0;
  const memory = metrics?.memory_usage ?? '0 B';
  const netIn = metrics?.network_in ?? '0 B';
  const netOut = metrics?.network_out ?? '0 B';

  const getCpuColor = (val) => {
    if (val > 80) return 'var(--red)';
    if (val > 50) return 'var(--yellow)';
    return 'var(--green)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Live Container Resource Usage</h4>
        <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} className="pulse" />
          Updating live
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* CPU Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>CPU USAGE</span>
            <Cpu size={16} color="var(--accent)" />
          </div>
          <div>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {cpu.toFixed(2)}%
            </span>
          </div>
          <div style={{ height: 50, width: 'calc(100% + 20px)', marginTop: 'auto', marginLeft: -10, marginBottom: -10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={getCpuColor(cpu)} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={getCpuColor(cpu)} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <YAxis domain={[0, 'dataMax + 10']} hide />
                <ChartTooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.75rem', padding: '4px 8px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  labelStyle={{ display: 'none' }}
                  formatter={(val) => [`${val.toFixed(2)}%`, 'CPU']}
                />
                <Area type="monotone" dataKey="cpu" stroke={getCpuColor(cpu)} fillOpacity={1} fill="url(#colorCpu)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Memory Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>MEMORY USAGE</span>
            <MemoryStick size={16} color="var(--accent)" />
          </div>
          <div>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {memory}
            </span>
          </div>
          <div style={{ height: 50, width: 'calc(100% + 20px)', marginTop: 'auto', marginLeft: -10, marginBottom: -10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <YAxis domain={[0, 'dataMax + 10']} hide />
                <ChartTooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.75rem', padding: '4px 8px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  labelStyle={{ display: 'none' }}
                  formatter={(val) => [`${val.toFixed(1)} MB`, 'Memory']}
                />
                <Area type="monotone" dataKey="memory" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorMem)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Network Card */}
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>NETWORK I/O</span>
            <Globe size={16} color="var(--accent)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>INCOMING</span>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--green)', fontFamily: 'monospace', marginTop: 2 }}>
                â†“ {netIn}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>OUTGOING</span>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', marginTop: 2 }}>
                â†‘ {netOut}
              </span>
            </div>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Cumulative network traffic.
          </div>
        </div>
      </div>
    </div>
  );
}

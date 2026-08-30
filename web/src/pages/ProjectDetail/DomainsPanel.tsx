// @ts-nocheck
import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Globe, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { domainsApi } from '../../api/client';
import { Button, SelectContent, SelectItem, SelectRoot, SelectTrigger, useToast } from '../../components/ui';

const PROTOCOLS = [
  { value: 'https', label: 'https' },
  { value: 'http', label: 'http' },
];

const DIRECTIONS = [
  { value: 'both', label: 'Allow www and non-www' },
  { value: 'www', label: 'Redirect to www' },
  { value: 'non-www', label: 'Redirect to non-www' },
];

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split(/[/?#]/, 1)[0]
    .replace(/\.$/, '');
}

function isValidDomain(value) {
  return value.length > 0 && value.includes('.') && !/[\s<>"'`;$|\\]/.test(value);
}

function statusFor(domain, verification) {
  if (verification?.verified || domain.tls_status === 'active') return { label: 'DNS verified', color: 'var(--green)', background: 'rgba(34,197,94,0.1)', icon: CheckCircle2 };
  if (verification?.error) return { label: 'DNS error', color: 'var(--red)', background: 'rgba(239,68,68,0.1)', icon: AlertCircle };
  return { label: 'DNS pending', color: 'var(--yellow)', background: 'rgba(245,158,11,0.1)', icon: Clock3 };
}

export function DomainsPanel({ service, project, domains = [], onUpdate }) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [domain, setDomain] = useState('');
  const [protocol, setProtocol] = useState('https');
  const [port, setPort] = useState('');
  const [path, setPath] = useState('');
  const [direction, setDirection] = useState('both');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [checking, setChecking] = useState({});
  const [verification, setVerification] = useState({});

  const serviceDomains = useMemo(
    () => domains.filter(item => item.service === service.name && item.project === project?.name),
    [domains, project?.name, service.name],
  );

  const resetForm = () => {
    setDomain('');
    setProtocol('https');
    setPort('');
    setPath('');
    setDirection('both');
  };

  const handleGenerateDomain = () => {
    const host = window.location.hostname.split(':')[0];
    const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
    const generated = `${randomStr}.${host}.sslip.io`;
    setDomain(generated);
  };

  const refresh = async () => {
    if (onUpdate) await onUpdate();
  };

  const addDomain = async (event) => {
    event.preventDefault();
    const cleaned = normalizeDomain(domain);
    if (!isValidDomain(cleaned)) {
      toast.error('Enter a valid hostname, for example app.example.com');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        domain: cleaned,
        protocol,
        port: port ? parseInt(port, 10) : 0,
        path: path.trim(),
        service: service.name,
        project: project?.name || 'Production',
        direction,
      };
      await domainsApi.create(payload);
      resetForm();
      setShowAdd(false);
      toast.success('Domain added. Verify DNS before deploying it.');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not add domain');
    } finally {
      setSaving(false);
    }
  };

  const verifyDomain = async (item) => {
    setChecking(previous => ({ ...previous, [item.id]: true }));
    try {
      const response = await domainsApi.verify(item.id);
      const result = response?.data || response || {};
      setVerification(previous => ({ ...previous, [item.id]: result }));
      if (result.verified) toast.success(`${item.domain} DNS is verified`);
      else toast.error(result.error || `${item.domain} does not point to this server yet`);
      await refresh();
    } catch (error) {
      setVerification(previous => ({ ...previous, [item.id]: { error: error.message } }));
      toast.error(error.message || 'DNS verification failed');
    } finally {
      setChecking(previous => ({ ...previous, [item.id]: false }));
    }
  };

  const updateDirection = async (item, nextDirection) => {
    try {
      const payload: any = {
        domain: item.domain,
        protocol: item.protocol || 'https',
        port: item.port || 0,
        path: item.path || '',
        service: service.name,
        project: project?.name || 'Production',
        direction: nextDirection,
      };
      await domainsApi.update(item.id, payload);
      toast.success('Routing direction updated');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not update routing direction');
    }
  };

  const deleteDomain = async (item) => {
    if (!window.confirm(`Remove ${item.domain} from this service?`)) return;
    setDeleting(item.id);
    try {
      await domainsApi.delete(item.id);
      toast.success('Domain removed');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not remove domain');
    } finally {
      setDeleting('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Domains</h3>
          <p style={{ margin: '5px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Route public traffic to <strong style={{ color: 'var(--text-secondary)' }}>{service.name}</strong> through Traefik and managed TLS.
          </p>
        </div>
        <Button type="button" variant="primary" size="sm" icon={showAdd ? X : Plus} onClick={() => { setShowAdd(p => !p); if (showAdd) resetForm(); }}>
          {showAdd ? 'Close' : 'Add'}
        </Button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Add domain</h4>
          <form onSubmit={addDomain} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Row 1: Protocol + Domain + Port */}
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px', gap: 10, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Protocol</label>
                <SelectRoot value={protocol} onValueChange={setProtocol}>
                  <SelectTrigger style={{ width: '100%' }} />
                  <SelectContent>{PROTOCOLS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </SelectRoot>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Domain <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="form-input" value={domain} onChange={event => setDomain(event.target.value)} placeholder="app.example.com" autoFocus style={{ width: '100%' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Port</label>
                <input className="form-input" type="number" min="0" max="65535" value={port} onChange={event => setPort(event.target.value)} placeholder={protocol === 'https' ? '443' : '80'} style={{ width: '100%' }} />
              </div>
            </div>

            {/* Row 2: Path */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Path</label>
              <input className="form-input" value={path} onChange={event => setPath(event.target.value)} placeholder="/api/v3" style={{ width: '100%' }} />
              <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Optional path, query, or fragment appended after the domain and port.</p>
            </div>

            {/* Row 3: Direction + buttons */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, minWidth: 200, flex: 1 }}>
                <label className="form-label">Routing direction</label>
                <SelectRoot value={direction} onValueChange={setDirection}>
                  <SelectTrigger style={{ width: '100%' }} />
                  <SelectContent>{DIRECTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </SelectRoot>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <Button type="button" variant="outline" size="sm" onClick={handleGenerateDomain} style={{ whiteSpace: 'nowrap', height: 36 }}>
                  Generate domain
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={saving} disabled={saving} style={{ height: 36 }}>
                  Save
                </Button>
              </div>
            </div>
          </form>
          <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Point the domain A/AAAA record to this server. Cloudflare proxy domains are supported. Use Generate for instant <code style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: 3 }}>sslip.io</code> domain.
          </div>
        </div>
      )}

      {serviceDomains.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: 'var(--bg-base)', border: '1px dashed var(--border)' }}>
          <Globe size={30} style={{ color: 'var(--text-muted)', opacity: 0.55, marginBottom: 10 }} />
          <h4 style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>No domains configured</h4>
          <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Add a hostname to make this service publicly reachable.</p>
          {!showAdd && <Button type="button" variant="outline" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>Add your first domain</Button>}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <ShieldCheck size={15} style={{ color: 'var(--accent)' }} />
            {serviceDomains.length} configured domain{serviceDomains.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {serviceDomains.map(item => {
              const result = verification[item.id];
              const status = statusFor(item, result);
              const StatusIcon = status.icon;
              const displayPort = item.port || (item.protocol === 'http' ? 80 : 443);
              const displayPath = item.path ? item.path : '';
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) auto minmax(140px, 0.8fr) auto', gap: 12, alignItems: 'center', padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Globe size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <a href={`${item.protocol || 'https'}://${item.domain}${displayPath}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.domain}</a>
                        <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(79,110,247,0.1)', color: 'var(--accent)', fontWeight: 600 }}>{item.protocol || 'https'}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Port {displayPort}{displayPath ? ` \u00b7 ${displayPath}` : ''}
                      </span>
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content', color: status.color, fontSize: '0.72rem', fontWeight: 600, padding: '4px 8px', borderRadius: 999, background: status.background }}>
                    <StatusIcon size={12} /> {status.label}
                  </span>
                  <SelectRoot value={item.direction || 'both'} onValueChange={value => updateDirection(item, value)}>
                    <SelectTrigger style={{ width: '100%' }} />
                    <SelectContent>{DIRECTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </SelectRoot>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <Button type="button" variant="ghost" size="sm" title="Recheck DNS" icon={RefreshCw} loading={!!checking[item.id]} onClick={() => verifyDomain(item)} />
                    <Button type="button" variant="ghost" size="sm" title="Remove domain" icon={Trash2} loading={deleting === item.id} onClick={() => deleteDomain(item)} style={{ color: 'var(--red)' }} />
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

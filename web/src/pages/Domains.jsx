// src/pages/Domains.jsx — Real domain management with DNS verification
import { useState, useEffect, useCallback } from 'react';
import { Globe, Plus, ShieldCheck, ShieldAlert, Clock, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { domainsApi } from '../api/client';
import { Modal, Button, StatusBadge, SelectRoot, SelectTrigger, SelectContent, SelectItem, useToast } from '../components/ui';
// Using shared StatusBadge component

function AddDomainModal({ open, onOpenChange, onAdded }) {
  const [domain, setDomain] = useState('');
  const [service, setService] = useState('');
  const [project, setProject] = useState('');
  const [direction, setDirection] = useState('both');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await domainsApi.create({ domain: domain.trim(), service, project, direction });
      onAdded();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add Custom Domain"
      maxWidth={460}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Domain Name</label>
          <input className="form-input" placeholder="e.g. app.yourdomain.com" value={domain} onChange={e => setDomain(e.target.value)} autoFocus required />
        </div>
        <div className="form-group">
          <label className="form-label">Service (optional)</label>
          <input className="form-input" placeholder="e.g. my-app" value={service} onChange={e => setService(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Project (optional)</label>
          <input className="form-input" placeholder="e.g. Production" value={project} onChange={e => setProject(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Direction</label>
          <SelectRoot value={direction} onValueChange={setDirection}>
            <SelectTrigger style={{ width: '100%' }} />
            <SelectContent>
              <SelectItem value="both">Allow www & non-www.</SelectItem>
              <SelectItem value="www">Redirect to www</SelectItem>
              <SelectItem value="non-www">Redirect to non-www</SelectItem>
            </SelectContent>
          </SelectRoot>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>DNS Setup Required:</strong> Point your domain's <code>A</code> record to this server's IP address before adding it here.
        </div>
        {error && (
          <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: '0.75rem', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <Button variant="soft" color="gray" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="solid" loading={loading} icon={Plus}>
            Add Domain
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Domains() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [verificationResults, setVerificationResults] = useState({});
  const [verifying, setVerifying] = useState({});

  const verifyDomain = useCallback(async (id, silent = false) => {
    setVerifying(prev => ({ ...prev, [id]: true }));
    try {
      const res = await domainsApi.verify(id);
      const verified = res?.verified ?? res?.data?.verified;
      const domainIPs = res?.domain_ips ?? res?.data?.domain_ips;
      const serverIPs = res?.server_ips ?? res?.data?.server_ips;
      const errorMsg = res?.error ?? res?.data?.error;

      setVerificationResults(prev => ({
        ...prev,
        [id]: {
          verified,
          domainIPs,
          serverIPs,
          error: errorMsg
        }
      }));

      if (!silent) {
        if (verified) {
          toast.success('DNS verified! Domain is correctly pointing to this server.');
        } else if (errorMsg) {
          toast.error(`DNS lookup failed: ${errorMsg}`);
        } else {
          toast.error('DNS verification failed. See routing details under the domain.');
        }
      }
    } catch (err) {
      setVerificationResults(prev => ({
        ...prev,
        [id]: {
          verified: false,
          error: err.message
        }
      }));
      if (!silent) {
        toast.error(err.message || 'Failed to verify DNS');
      }
    } finally {
      setVerifying(prev => ({ ...prev, [id]: false }));
    }
  }, [toast]);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await domainsApi.list();
      const list = res.data || res || [];
      setDomains(list);
      setError(null);
      
      // Auto-trigger background verify for each domain
      list.forEach(d => {
        verifyDomain(d.id, true);
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [verifyDomain]);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  // delete domain
  const handleDelete = async (id) => {
    if (!confirm('Delete this domain?')) return;
    setDeleting(id);
    try {
      await domainsApi.delete(id);
      await fetchDomains();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="page-content fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <Loader2 size={32} className="spin" color="var(--primary)" />
      </div>
    );
  }

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Domains & HTTPS</h1>
          <p className="page-subtitle">Manage custom domains and SSL certificates.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            radius="small"
            variant="solid"
            onClick={fetchDomains}
            icon={RefreshCw}
          >
            Refresh
          </Button>
          <Button
            radius="small"
            variant="solid"
            onClick={() => setShowModal(true)}
            icon={Plus}
          >
            Add Domain
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--red)' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {domains.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Globe size={48} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.5rem' }}>No domains configured</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Add a custom domain to point traffic to your services.
          </p>
          <Button variant="primary" onClick={() => setShowModal(true)} icon={Plus}>
            Add Your First Domain
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {domains.map(d => {
            const v = verificationResults[d.id];
            const isChecking = verifying[d.id];
            
            return (
              <div
                key={d.id}
                className="card fade-in"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '1.25rem',
                  gap: '1rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'rgba(79, 110, 247, 0.1)',
                      color: 'var(--accent)'
                    }}>
                      <Globe size={18} />
                    </div>
                    <div>
                      <a
                        href={`https://${d.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {d.domain}
                      </a>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Configured {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Badges and Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: d.tls_status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(235, 166, 90, 0.1)',
                      color: d.tls_status === 'active' ? 'var(--green)' : '#e5a556',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      {d.tls_status === 'active' ? <ShieldCheck size={12} /> : <Clock size={12} />}
                      SSL: {d.tls_status}
                    </span>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Verify DNS"
                        loading={isChecking}
                        onClick={() => verifyDomain(d.id, false)}
                        icon={RefreshCw}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--red)' }}
                        title="Delete"
                        loading={deleting === d.id}
                        onClick={() => handleDelete(d.id)}
                        icon={Trash2}
                      />
                    </div>
                  </div>
                </div>

                {/* Info Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(255,255,255,0.01)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(255,255,255,0.02)',
                  fontSize: '0.8125rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Target Service:</span>{' '}
                    <code style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{d.service || '—'}</code>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Project:</span>{' '}
                    <strong style={{ color: 'var(--text-secondary)' }}>{d.project || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Redirection Rule:</span>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {d.direction === 'both' ? 'Both (www & non-www)' : d.direction === 'www' ? 'www only' : 'non-www only'}
                    </span>
                  </div>
                </div>

                {/* DNS Diagnostics Box */}
                <div style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid',
                  fontSize: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  backgroundColor: isChecking
                    ? 'rgba(255,255,255,0.02)'
                    : v?.verified
                    ? 'rgba(16, 185, 129, 0.04)'
                    : 'rgba(239, 68, 68, 0.04)',
                  borderColor: isChecking
                    ? 'var(--border)'
                    : v?.verified
                    ? 'rgba(16, 185, 129, 0.2)'
                    : 'rgba(239, 68, 68, 0.2)',
                  color: isChecking
                    ? 'var(--text-muted)'
                    : v?.verified
                    ? 'var(--green)'
                    : 'var(--red)'
                }}>
                  {isChecking ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={14} className="spin" />
                      <span>Checking DNS propagation and records...</span>
                    </div>
                  ) : v?.verified ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' }}>
                        <CheckCircle2 size={16} /> DNS Routing Verified
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', paddingLeft: '24px' }}>
                        This domain's A-record is correctly pointed to your server IP ({v.serverIPs?.join(', ')}). Traefik has provisioned and is serving the Let's Encrypt SSL certificate.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold', color: 'var(--red)' }}>
                        <AlertCircle size={16} /> DNS Verification Failed
                      </div>
                      
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {v?.error ? (
                          <div>Reason: <strong style={{ color: 'var(--text-primary)' }}>{v.error}</strong></div>
                        ) : (
                          <>
                            <div>
                              Domain resolves to: <code style={{ color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '2px 6px', borderRadius: 4 }}>{v?.domainIPs?.join(', ') || 'no IP resolved'}</code>
                            </div>
                            <div>
                              Expected server IPs: <code style={{ color: 'var(--green)', background: 'rgba(16,185,129,0.08)', padding: '2px 6px', borderRadius: 4 }}>{v?.serverIPs?.join(', ') || 'none'}</code>
                            </div>
                          </>
                        )}
                      </div>

                      {/* What to do next instructions */}
                      <div style={{
                        marginTop: '6px',
                        padding: '10px 12px',
                        backgroundColor: 'rgba(239, 68, 68, 0.06)',
                        borderRadius: 'var(--radius)',
                        borderLeft: '3px solid var(--red)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        lineHeight: '1.4'
                      }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>What to do next:</div>
                        <ol style={{ paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <li>Log in to your domain registrar / DNS manager (e.g. Cloudflare, Namecheap, GoDaddy).</li>
                          <li>Go to the DNS settings and add or update an <strong>A record</strong>:
                            <div style={{ margin: '4px 0', fontSize: '0.75rem', background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: 4, fontFamily: 'monospace' }}>
                              Type: A | Name: {d.domain.split('.')[0] === '@' ? '@' : d.domain.split('.')[0]} | Value: {v?.serverIPs?.[0] || 'your_server_ip'}
                            </div>
                          </li>
                          <li>If you are using Cloudflare, turn <strong>OFF</strong> the proxy (Grey Cloud icon) to allow Traefik to obtain the SSL certificate.</li>
                          <li>Once updated, click the <strong>Refresh/Verify DNS</strong> button above to re-verify.</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddDomainModal open={showModal} onOpenChange={setShowModal} onAdded={fetchDomains} />
    </div>
  );
}

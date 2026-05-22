// src/pages/Setup.jsx — First-run setup wizard
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { setupApi } from '../api/client';
import { Button } from '../components/ui';

export default function Setup() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep]         = useState(1); // 1 = welcome, 2 = account
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [form, setForm]         = useState({ email: '', name: '', password: '', confirm: '' });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setLoading(true);
    try {
      const res = await setupApi.init({ email: form.email, name: form.name, password: form.password });
      login(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card fade-in" style={{ maxWidth: step === 2 ? 680 : 450, transition: 'max-width 0.3s ease' }}>

        {/* Logo */}
        <div className="auth-logo" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '2rem' }}>
          <img
            src="/logo.png"
            alt="NanoFly Logo"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              objectFit: 'contain',
              flexShrink: 0
            }}
          />
          <span className="auth-logo-name" style={{
            fontSize: '1.75rem',
            fontWeight: '800',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0
          }}>NanoFly</span>
        </div>

        {/* Steps */}
        <div className="setup-steps">
          {['Welcome', 'Account', 'Done'].map((label, i) => {
            const n = i + 1;
            const done   = step > n;
            const active = step === n;
            return (
              <div key={label} className={`setup-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <div className="step-circle">{done ? '✓' : n}</div>
                <span className="step-label">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="fade-in">
            <h2 className="auth-title">Welcome to NanoFly</h2>
            <p className="auth-subtitle">
              Your lightweight self-hosted server control panel. Let's get you set up in under a minute.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '1.5rem 0' }}>
              {[
                { icon: '📊', label: 'Real-time CPU, RAM, Disk & Temperature' },
                { icon: '🐳', label: 'Deploy apps with Docker, one click' },
                { icon: '🔐', label: 'Auto-HTTPS with Let\'s Encrypt via Caddy' },
                { icon: '🔗', label: 'GitHub webhooks & auto-deploy on push' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: '1.1rem' }}>{f.icon}</span>
                  {f.label}
                </div>
              ))}
            </div>

            <Button className="btn-full btn-lg" variant="primary" onClick={() => setStep(2)}>
              Get Started →
            </Button>
          </div>
        )}

        {/* Step 2 — Create admin account */}
        {step === 2 && (
          <div className="fade-in">
            <h2 className="auth-title">Create Admin Account</h2>
            <p className="auth-subtitle">This is the owner account for your NanoFly panel.</p>

            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: '1.25rem',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: '0.8125rem',
              color: '#f87171',
              lineHeight: 1.4
            }}>
              <span style={{ fontSize: '1rem', marginTop: -1 }}>⚠️</span>
              <div>
                <strong style={{ color: '#ef4444', display: 'block', marginBottom: 2 }}>Crucial Security Notice</strong>
                Make sure to write down your password or save it securely. NanoFly stores passwords using secure cryptographic hashes; if you lose it, it is impossible to recover.
              </div>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Your Name</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Alex"
                      value={form.name}
                      onChange={set('name')}
                      autoFocus
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Email Address</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={set('email')}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Password</label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder="At least 8 characters"
                      value={form.password}
                      onChange={set('password')}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Confirm Password</label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder="Repeat your password"
                      value={form.confirm}
                      onChange={set('confirm')}
                      required
                    />
                  </div>
                </div>
              </div>

              <Button className="btn-full btn-lg" variant="primary" type="submit" loading={loading}>
                Create Account & Enter Panel →
              </Button>
            </form>

            <Button
              className="btn-full"
              variant="ghost"
              style={{ marginTop: '0.5rem' }}
              onClick={() => setStep(1)}
            >
              ← Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

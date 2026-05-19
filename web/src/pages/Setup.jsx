// src/pages/Setup.jsx — First-run setup wizard
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { setupApi } from '../api/client';

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
      <div className="auth-card fade-in" style={{ maxWidth: 480 }}>

        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🚀</div>
          <span className="auth-logo-name">NanoFly</span>
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

            <button className="btn btn-primary btn-full btn-lg" onClick={() => setStep(2)}>
              Get Started →
            </button>
          </div>
        )}

        {/* Step 2 — Create admin account */}
        {step === 2 && (
          <div className="fade-in">
            <h2 className="auth-title">Create Admin Account</h2>
            <p className="auth-subtitle">This is the owner account for your NanoFly panel.</p>

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Your Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Alex"
                  value={form.name}
                  onChange={set('name')}
                  autoFocus
                />
              </div>
              <div className="form-group">
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
              <div className="form-group">
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
              <div className="form-group">
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

              <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
                {loading ? <><div className="spinner" /> Creating Account…</> : 'Create Account & Enter Panel →'}
              </button>
            </form>

            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: '0.5rem' }}
              onClick={() => setStep(1)}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

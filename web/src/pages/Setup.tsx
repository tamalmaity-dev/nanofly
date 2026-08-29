// @ts-nocheck
// src/pages/Setup.jsx — First-run setup wizard
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { setupApi } from '../api/client';
import { Button } from '../components/ui';
import {
  ArrowRight, ArrowLeft, Check, AlertCircle, Terminal,
  Activity, Container, Shield, Webhook, Eye, EyeOff
} from 'lucide-react';

const FEATURES = [
  { icon: Activity,   label: 'Real-time CPU, RAM, Disk & Temperature' },
  { icon: Container,  label: 'Deploy apps with Docker, one click' },
  { icon: Shield,     label: 'Auto-HTTPS with Let\'s Encrypt via Caddy' },
  { icon: Webhook,    label: 'GitHub webhooks & auto-deploy on push' },
];

function pwStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { score, label: 'Weak', color: '#ef4444' };
  if (score <= 3) return { score, label: 'Fair', color: '#f59e0b' };
  if (score <= 4) return { score, label: 'Strong', color: '#22c55e' };
  return { score, label: 'Very Strong', color: '#10b981' };
}

export default function Setup() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm]         = useState({ email: '', name: '', password: '', confirm: '' });
  const [version, setVersion]   = useState('');

  useEffect(() => {
    setupApi.status()
      .then(res => { if (res?.version) setVersion(res.version); })
      .catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const strength = pwStrength(form.password);

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
      {/* Animated background elements */}
      <div className="auth-bg-orb auth-bg-orb--1" />
      <div className="auth-bg-orb auth-bg-orb--2" />
      <div className="auth-bg-orb auth-bg-orb--3" />

      <div className="auth-card auth-card--elevated fade-in" style={{
        maxWidth: step === 2 ? 520 : 450,
        transition: 'max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>

        {/* Logo */}
        <div className="auth-header">
          <div className="auth-logo-ring">
            <img src="/logo.png" alt="NanoFly" className="auth-logo-img" />
          </div>
          <h1 className="auth-brand">NanoFly</h1>
          <p className="auth-tagline">Let's get you set up in under a minute</p>
        </div>

        {/* Steps */}
        <div className="auth-steps">
          {['Welcome', 'Account'].map((label, i) => {
            const n = i + 1;
            const done   = step > n;
            const active = step === n;
            return (
              <div key={label} className={`auth-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <div className="auth-step-dot">
                  {done ? <Check size={14} /> : n}
                </div>
                <span className="auth-step-label">{label}</span>
              </div>
            );
          })}
          <div className={`auth-step-line ${step > 1 ? 'filled' : ''}`} />
        </div>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="fade-in">
            <h2 className="auth-title">Welcome to NanoFly</h2>
            <p className="auth-subtitle">
              Your lightweight self-hosted server control panel.
            </p>

            <div className="auth-features">
              {FEATURES.map(f => (
                <div key={f.label} className="auth-feature">
                  <div className="auth-feature-icon">
                    <f.icon size={16} />
                  </div>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>

            <Button className="auth-submit" variant="primary" onClick={() => setStep(2)}>
              Get Started
              <ArrowRight size={16} />
            </Button>
          </div>
        )}

        {/* Step 2 — Create admin account */}
        {step === 2 && (
          <div className="fade-in">
            <h2 className="auth-title">Create Admin Account</h2>
            <p className="auth-subtitle">This is the owner account for your NanoFly panel.</p>

            <div className="auth-alert auth-alert--warning">
              <AlertCircle size={16} />
              <div>
                <strong>Security Notice</strong>
                <span>Save your password securely. NanoFly uses cryptographic hashes — passwords cannot be recovered.</span>
              </div>
            </div>

            {error && (
              <div className="auth-alert auth-alert--error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleCreate}>
              <div className="auth-field-row">
                <div className="auth-field">
                  <label className="auth-label">Your Name</label>
                  <input
                    className="auth-input"
                    placeholder="e.g. Alex"
                    value={form.name}
                    onChange={set('name')}
                    autoFocus
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Email Address</label>
                  <input
                    className="auth-input"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={set('email')}
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label">Password</label>
                <div className="auth-input-wrap">
                  <input
                    className="auth-input auth-input--pw"
                    type={showPw ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={set('password')}
                    required
                  />
                  <button
                    type="button"
                    className="auth-pw-toggle"
                    onClick={() => setShowPw(!showPw)}
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.password && (
                  <div className="auth-pw-strength">
                    <div className="auth-pw-bar">
                      <div
                        className="auth-pw-fill"
                        style={{
                          width: `${(strength.score / 5) * 100}%`,
                          background: strength.color
                        }}
                      />
                    </div>
                    <span className="auth-pw-label" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="auth-field">
                <label className="auth-label">Confirm Password</label>
                <div className="auth-input-wrap">
                  <input
                    className="auth-input auth-input--pw"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat your password"
                    value={form.confirm}
                    onChange={set('confirm')}
                    required
                  />
                  <button
                    type="button"
                    className="auth-pw-toggle"
                    onClick={() => setShowConfirm(!showConfirm)}
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.confirm && form.password !== form.confirm && (
                  <span className="auth-field-hint auth-field-hint--error">Passwords do not match</span>
                )}
              </div>

              <Button className="auth-submit" variant="primary" type="submit" loading={loading}>
                Create Account & Enter Panel
                <ArrowRight size={16} />
              </Button>
            </form>

            <button className="auth-back" onClick={() => setStep(1)} type="button">
              <ArrowLeft size={14} />
              Back
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="auth-footer">
          <Terminal size={12} />
          <span>{version || 'NanoFly'}</span>
        </div>
      </div>
    </div>
  );
}

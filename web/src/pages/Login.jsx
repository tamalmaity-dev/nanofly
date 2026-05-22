// src/pages/Login.jsx — Login page
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { authApi, setupApi } from '../api/client';
import { Button } from '../components/ui';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    setupApi.status()
      .then(res => {
        if (res && res.version) {
          setVersion(res.version);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      login(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">

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

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem', borderRadius: 'var(--radius)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label id="label-email" className="form-label" htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              placeholder="admin@nanofly.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label id="label-password" className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button
            id="login-submit"
            className="btn-full btn-lg"
            variant="primary"
            type="submit"
            loading={loading}
            style={{ marginTop: '0.5rem' }}
          >
            Sign In →
          </Button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          NanoFly Panel · <span style={{ color: 'var(--accent)' }}>{version || 'v0.3.6-beta'}</span>
        </p>
      </div>
    </div>
  );
}

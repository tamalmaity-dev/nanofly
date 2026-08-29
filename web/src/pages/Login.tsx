// @ts-nocheck
// src/pages/Login.jsx — Login page
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { authApi, setupApi } from '../api/client';
import { Button } from '../components/ui';
import { Eye, EyeOff, AlertCircle, ArrowRight, Terminal } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [version, setVersion]   = useState('');

  useEffect(() => {
    setupApi.status()
      .then(res => { if (res?.version) setVersion(res.version); })
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
      {/* Animated background elements */}
      <div className="auth-bg-orb auth-bg-orb--1" />
      <div className="auth-bg-orb auth-bg-orb--2" />
      <div className="auth-bg-orb auth-bg-orb--3" />

      <div className="auth-card auth-card--elevated fade-in">

        {/* Logo */}
        <div className="auth-header">
          <div className="auth-logo-ring">
            <img src="/logo.png" alt="NanoFly" className="auth-logo-img" />
          </div>
          <h1 className="auth-brand">NanoFly</h1>
          <p className="auth-tagline">A self-hosted server control panel</p>
        </div>

        {/* Error */}
        {error && (
          <div className="auth-alert auth-alert--error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="auth-input"
              type="email"
              placeholder="admin@nanofly.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="login-password">Password</label>
            <div className="auth-input-wrap">
              <input
                id="login-password"
                className="auth-input auth-input--pw"
                type={showPw ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
          </div>

          <Button
            id="login-submit"
            className="auth-submit"
            variant="primary"
            type="submit"
            loading={loading}
          >
            Sign In
            <ArrowRight size={16} />
          </Button>
        </form>

        {/* Footer */}
        <div className="auth-footer">
          <Terminal size={12} />
          <span>{version || 'NanoFly'}</span>
        </div>
      </div>
    </div>
  );
}

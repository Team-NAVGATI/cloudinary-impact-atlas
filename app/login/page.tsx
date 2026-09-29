'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performLogin = async (loginEmail: string, loginPass: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in.');
      }

      // Hard redirect ensures cookies are flushed and middleware recognizes session
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  const loginAsAdmin = async () => {
    setEmail('greenearth_admin@test.org');
    setPassword('Password123!');
    await performLogin('greenearth_admin@test.org', 'Password123!');
  };

  const loginAsMember = async () => {
    setEmail('member@greenearth.org');
    setPassword('Password123!');
    await performLogin('member@greenearth.org', 'Password123!');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0f0d',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#e6ede9',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#131b17',
          border: '1px solid #1f2e27',
          borderRadius: '16px',
          padding: '2.5rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '0.4rem 0.9rem',
              backgroundColor: '#1b382b',
              color: '#34d399',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '9999px',
              marginBottom: '0.8rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Sustainability Intelligence
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: '#f3f4f6' }}>
            Media Mind Login
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Sign in to access your organization's dashboard
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '0.8rem 1rem',
              backgroundColor: '#451a1a',
              border: '1px solid #7f1d1d',
              color: '#fca5a5',
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
            }}
          >
            {error}
          </div>
        )}

        {/* 1-Click Quick Demo Sign-In Buttons */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9ca3af',
              fontWeight: 600,
              marginBottom: '0.75rem',
              textAlign: 'center',
            }}
          >
            Instant 1-Click Demo Logins
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              disabled={loading}
              onClick={loginAsAdmin}
              style={{
                padding: '0.75rem',
                backgroundColor: '#1b382b',
                border: '1px solid #059669',
                color: '#34d399',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {loading && email === 'greenearth_admin@test.org' ? 'Signing in...' : '⚡ Demo ADMIN'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={loginAsMember}
              style={{
                padding: '0.75rem',
                backgroundColor: '#1e293b',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {loading && email === 'member@greenearth.org' ? 'Signing in...' : '⚡ Demo MEMBER'}
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '1.5rem 0',
            color: '#4b5563',
          }}
        >
          <div style={{ flex: 1, height: '1px', backgroundColor: '#1f2e27' }} />
          <span style={{ padding: '0 0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
            or enter credentials manually
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#1f2e27' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: '#d1d5db',
                marginBottom: '0.4rem',
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@organization.org"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: '#1b2520',
                border: '1px solid #2d3f35',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: '#d1d5db',
                marginBottom: '0.4rem',
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: '#1b2520',
                border: '1px solid #2d3f35',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              backgroundColor: loading ? '#059669' : '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

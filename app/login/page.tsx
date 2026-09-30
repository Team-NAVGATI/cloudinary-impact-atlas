'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, fieldClass, Label, Notice } from '@/components/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'form' | 'demo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch('/api/auth/demo')
      .then((r) => r.json())
      .then((j) => setDemo(Boolean(j.enabled)))
      .catch(() => setDemo(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading('form');
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not sign in.');
      window.location.href = '/studio';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setLoading(null);
    }
  }

  async function demoLogin() {
    setLoading('demo');
    setError(null);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      if (!res.ok) throw new Error('The demo account is not available right now.');
      window.location.href = '/studio';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setLoading(null);
    }
  }

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 inline-block font-semibold tracking-tight">
          Impact Atlas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-[13px] text-muted">Use the account your organisation gave you.</p>

        <form onSubmit={submit} className="mt-6 space-y-4 rounded-card border border-line bg-surface p-5">
          <div>
            <Label htmlFor="email">Email</Label>
            <input id="email" type="email" required autoComplete="email" inputMode="email" className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <input id="password" type="password" required autoComplete="current-password" className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="primary" className="w-full" disabled={loading !== null}>
            {loading === 'form' ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {demo && (
          <div className="mt-4 rounded-card border border-line bg-surface p-4">
            <p className="text-[13px] text-muted">Reviewing this project? Open it with the shared demo account.</p>
            <Button className="mt-3 w-full" onClick={demoLogin} disabled={loading !== null}>
              {loading === 'demo' ? 'Opening…' : 'Open the demo'}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

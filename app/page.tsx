export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Sustainability Media Intelligence Platform</h1>
      <p>Backend foundation initialized.</p>
      <p>
        Health endpoint: <a href="/api/health"><code>/api/health</code></a>
      </p>
      <p>
        Database health endpoint: <a href="/api/health/db"><code>/api/health/db</code></a>
      </p>
      <p>
        Auth Me endpoint: <a href="/api/auth/me"><code>/api/auth/me</code></a>
      </p>
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
        <a
          href="/login"
          style={{
            padding: '0.6rem 1.2rem',
            backgroundColor: '#10b981',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: 600,
          }}
        >
          Go to Login
        </a>
        <a
          href="/dashboard"
          style={{
            padding: '0.6rem 1.2rem',
            backgroundColor: '#1f2937',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: 600,
          }}
        >
          Go to Dashboard (Protected)
        </a>
      </div>
    </main>
  );
}

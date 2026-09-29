import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import MediaUploadTest from '@/components/MediaUploadTest';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 1. Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  // 2. Fetch organization membership (supporting ADMIN and MEMBER)
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  let organizationName = 'No Organization';
  let organizationType = 'N/A';

  if (membership?.organization_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, type')
      .eq('id', membership.organization_id)
      .maybeSingle();

    if (org) {
      organizationName = org.name;
      organizationType = org.type;
    }
  }

  const role = membership?.role || 'MEMBER';
  const organizationId = membership?.organization_id || 'Not Assigned';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0f0d',
        color: '#e5e7eb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Navigation */}
      <header
        style={{
          borderBottom: '1px solid #1f2e27',
          backgroundColor: '#111814',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 10px #10b981',
            }}
          />
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f9fafb' }}>
            Media Mind
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              backgroundColor: '#1b382b',
              color: '#34d399',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            {organizationName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1000px', margin: '2.5rem auto', padding: '0 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: '#f9fafb' }}>
            Organization Dashboard
          </h1>
          <p style={{ color: '#9ca3af', marginTop: '0.5rem' }}>
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}. Here is your active session context.
          </p>
        </div>

        {/* Access Metrics Card Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
            marginBottom: '2rem',
          }}
        >
          {/* User ID Card */}
          <div
            style={{
              backgroundColor: '#131b17',
              border: '1px solid #1f2e27',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              User ID
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                color: '#34d399',
                marginTop: '0.5rem',
                wordBreak: 'break-all',
              }}
            >
              {user.id}
            </div>
          </div>

          {/* Organization ID Card */}
          <div
            style={{
              backgroundColor: '#131b17',
              border: '1px solid #1f2e27',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Organization ID
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                color: '#60a5fa',
                marginTop: '0.5rem',
                wordBreak: 'break-all',
              }}
            >
              {organizationId}
            </div>
          </div>

          {/* Role Card */}
          <div
            style={{
              backgroundColor: '#131b17',
              border: '1px solid #1f2e27',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Membership Role
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  backgroundColor: role === 'ADMIN' ? '#831843' : '#1e3a8a',
                  color: role === 'ADMIN' ? '#fbcfe8' : '#bfdbfe',
                }}
              >
                {role}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                ({role === 'ADMIN' ? 'Full administrative privileges' : 'Standard member access'})
              </span>
            </div>
          </div>
        </div>

        {/* Phase 3: Media Upload Pipeline Test Component */}
        <MediaUploadTest />

        {/* Detailed Session Inspection */}
        <section
          style={{
            backgroundColor: '#131b17',
            border: '1px solid #1f2e27',
            borderRadius: '12px',
            padding: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 1rem 0', color: '#f3f4f6' }}>
            Current Authenticated State
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #1f2e27' }}>
                <td style={{ padding: '0.75rem 0', color: '#9ca3af', width: '220px' }}>Email:</td>
                <td style={{ padding: '0.75rem 0', color: '#f3f4f6' }}>{user.email}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #1f2e27' }}>
                <td style={{ padding: '0.75rem 0', color: '#9ca3af' }}>Full Name:</td>
                <td style={{ padding: '0.75rem 0', color: '#f3f4f6' }}>{profile?.full_name || 'Not set'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #1f2e27' }}>
                <td style={{ padding: '0.75rem 0', color: '#9ca3af' }}>Organization Name:</td>
                <td style={{ padding: '0.75rem 0', color: '#f3f4f6' }}>{organizationName}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #1f2e27' }}>
                <td style={{ padding: '0.75rem 0', color: '#9ca3af' }}>Organization Type:</td>
                <td style={{ padding: '0.75rem 0', color: '#f3f4f6' }}>{organizationType}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem 0', color: '#9ca3af' }}>Auth Provider:</td>
                <td style={{ padding: '0.75rem 0', color: '#f3f4f6' }}>{user.app_metadata?.provider || 'email'}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

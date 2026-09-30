import { Panel } from '@/components/ui';

/** Shown instead of a crash when migration 5 has not been applied yet. */
export function SetupNeeded({ detail }: { detail?: string }) {
  return (
    <Panel className="p-6">
      <h1 className="text-lg font-semibold">One setup step left</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted text-pretty">
        The database is missing the Flood-Watch tables. Open the Supabase dashboard, go to SQL Editor, paste the contents of{' '}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">supabase/migrations/20260929000005_flood_watch.sql</code>, and press Run.
        Then reload this page.
      </p>
      {detail && <p className="mt-3 font-mono text-xs text-muted">{detail}</p>}
    </Panel>
  );
}

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface DbHealthSuccessResponse {
  status: 'ok';
  database: 'connected';
}

interface DbHealthErrorResponse {
  status: 'error';
  database: 'disconnected';
  error: string;
}

export async function GET(): Promise<NextResponse<DbHealthSuccessResponse | DbHealthErrorResponse>> {
  try {
    const supabase = await createServerSupabaseClient();

    // Perform a real Supabase / PostgreSQL database operation.
    // listBuckets queries PostgreSQL's storage.buckets system table.
    const { error: storageError } = await supabase.storage.listBuckets();

    if (storageError) {
      // Fallback check against PostgREST schema cache to verify DB connectivity
      const { error: restError } = await supabase.from('organizations').select('id').limit(1);

      if (restError) {
        return NextResponse.json(
          {
            status: 'error',
            database: 'disconnected',
            error: storageError.message || restError?.message || 'Database connection check failed',
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database connection error';
    return NextResponse.json(
      {
        status: 'error',
        database: 'disconnected',
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

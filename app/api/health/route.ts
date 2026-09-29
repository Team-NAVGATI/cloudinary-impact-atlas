import { NextResponse } from 'next/server';

interface HealthResponse {
  status: 'ok';
  service: string;
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const service = process.env.SERVICE_NAME || 'sustainability-media-api';

  return NextResponse.json({
    status: 'ok',
    service,
  });
}

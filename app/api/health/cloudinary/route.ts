import { NextResponse } from 'next/server';
import { isCloudinaryConfigured } from '@/lib/cloudinary/server';

export async function GET() {
  const configured = isCloudinaryConfigured();

  if (!configured) {
    return NextResponse.json(
      {
        status: 'error',
        cloudinary: 'missing_configuration',
        message: 'Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are not fully configured.',
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    cloudinary: 'configured',
  });
}

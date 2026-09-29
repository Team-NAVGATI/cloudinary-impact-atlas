import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';

export interface CloudinarySignatureResult {
  signature: string;
  timestamp: number;
  cloud_name: string;
  api_key: string;
  folder: string;
  public_id: string;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export function getCloudinaryConfig() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      'Cloudinary configuration is incomplete. Please ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in .env.local.'
    );
  }

  cloudinary.config({
    cloud_name,
    api_key,
    api_secret,
    secure: true,
  });

  return { cloud_name, api_key, api_secret };
}

/**
 * Generates signed parameters for direct browser-to-Cloudinary upload.
 * The secret key is used ONLY on the server to compute the SHA signature.
 */
export function generateUploadSignature(
  organizationId: string
): CloudinarySignatureResult {
  const { cloud_name, api_key, api_secret } = getCloudinaryConfig();

  const timestamp = Math.round(Date.now() / 1000);
  const uniqueId = crypto.randomUUID();
  const folder = `organizations/${organizationId}/media`;
  const public_id = `asset_${uniqueId}`;

  // Cloudinary signature signs parameters in alphabetical order
  const paramsToSign = {
    folder,
    public_id,
    timestamp,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, api_secret);

  return {
    signature,
    timestamp,
    cloud_name,
    api_key,
    folder,
    public_id,
  };
}

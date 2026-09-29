export const MEDIA_LIMITS = {
  // 10 MB for images
  IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  // 100 MB for videos
  VIDEO_MAX_BYTES: 100 * 1024 * 1024,
  ALLOWED_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  ALLOWED_VIDEO_MIME_TYPES: ['video/mp4'] as const,
  ALLOWED_RESOURCE_TYPES: ['image', 'video'] as const,
} as const;

export const ALLOWED_MIME_TYPES = [
  ...MEDIA_LIMITS.ALLOWED_IMAGE_MIME_TYPES,
  ...MEDIA_LIMITS.ALLOWED_VIDEO_MIME_TYPES,
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
export type AllowedResourceType = (typeof MEDIA_LIMITS.ALLOWED_RESOURCE_TYPES)[number];

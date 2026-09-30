import { z } from 'zod';
import { ALLOWED_MIME_TYPES, MEDIA_LIMITS } from '@/lib/constants/media';

export const createMediaAssetSchema = z
  .object({
    cloudinary_public_id: z
      .string()
      .min(1, 'cloudinary_public_id cannot be empty'),
    cloudinary_url: z
      .string()
      .url('cloudinary_url must be a valid URL')
      .refine(
        (url) => url.startsWith('https://res.cloudinary.com/'),
        'cloudinary_url must originate from https://res.cloudinary.com/'
      ),
    resource_type: z.enum(['image', 'video']),
    cloudinary_asset_id: z.string().max(64).nullable().optional(),
    version: z.number().int().positive().nullable().optional(),
    etag: z.string().max(64).nullable().optional(),
    zone_id: z.string().uuid().nullable().optional(),
    phase: z.enum(['BASELINE', 'BEFORE', 'DURING', 'AFTER']).optional(),
    title: z.string().max(200).nullable().optional(),
    original_filename: z
      .string()
      .min(1, 'original_filename cannot be empty'),
    mime_type: z
      .string()
      .nullable()
      .optional()
      .refine(
        (val) => !val || (ALLOWED_MIME_TYPES as readonly string[]).includes(val),
        `Unsupported MIME type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`
      ),
    file_size: z
      .number()
      .positive('file_size must be a positive number')
      .nullable()
      .optional(),
    width: z
      .number()
      .positive('width must be positive')
      .nullable()
      .optional(),
    height: z
      .number()
      .positive('height must be positive')
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.file_size) {
      if (data.resource_type === 'image' && data.file_size > MEDIA_LIMITS.IMAGE_MAX_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Image exceeds maximum allowed size of ${MEDIA_LIMITS.IMAGE_MAX_BYTES / (1024 * 1024)} MB`,
          path: ['file_size'],
        });
      } else if (data.resource_type === 'video' && data.file_size > MEDIA_LIMITS.VIDEO_MAX_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Video exceeds maximum allowed size of ${MEDIA_LIMITS.VIDEO_MAX_BYTES / (1024 * 1024)} MB`,
          path: ['file_size'],
        });
      }
    }
  });

export type CreateMediaAssetInput = z.infer<typeof createMediaAssetSchema>;

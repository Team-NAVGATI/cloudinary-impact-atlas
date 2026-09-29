'use client';

import { useState, useRef, useEffect } from 'react';
import { ALLOWED_MIME_TYPES, MEDIA_LIMITS } from '@/lib/constants/media';

interface MediaAssetRecord {
  id: string;
  original_filename: string;
  cloudinary_public_id: string;
  cloudinary_url: string;
  resource_type: string;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  status: string;
  project_id: string | null;
  created_at: string;
}

export default function MediaUploadTest() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [latestSavedRecord, setLatestSavedRecord] = useState<MediaAssetRecord | null>(null);
  const [recentAssets, setRecentAssets] = useState<MediaAssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState<boolean>(false);

  // Fetch recent assets from PostgreSQL
  const fetchRecentAssets = async () => {
    setLoadingAssets(true);
    try {
      const res = await fetch('/api/media');
      const json = await res.json();
      if (json.success) {
        setRecentAssets(json.data);
      }
    } catch (err) {
      console.error('Failed to load assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    fetchRecentAssets();
  }, []);

  // Helper to resolve MIME type with fallback to extension
  const getFileMimeType = (file: File): string => {
    if (file.type && (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      return file.type;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.mp4')) return 'video/mp4';
    return file.type || '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    setErrorDetails(null);
    setStatusMessage(null);
    setLatestSavedRecord(null);

    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const detectedMime = getFileMimeType(file);

    // 1. Validate file type
    const isAllowedType = (ALLOWED_MIME_TYPES as readonly string[]).includes(detectedMime);
    if (!isAllowedType) {
      setValidationError(
        `Unsupported file type (${file.type || 'unknown'}). Allowed formats: JPG, PNG, WEBP, MP4.`
      );
      setSelectedFile(null);
      return;
    }

    // 2. Validate file size
    const isVideo = detectedMime.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4');
    const maxSize = isVideo ? MEDIA_LIMITS.VIDEO_MAX_BYTES : MEDIA_LIMITS.IMAGE_MAX_BYTES;
    const maxLabel = isVideo ? '100 MB' : '10 MB';

    if (file.size > maxSize) {
      const currentMB = (file.size / (1024 * 1024)).toFixed(2);
      setValidationError(
        `File too large (${currentMB} MB). Maximum allowed size for ${isVideo ? 'video' : 'images'} is ${maxLabel}.`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // Automatically trigger upload on file selection for seamless UX
    startUpload(file, detectedMime);
  };

  const startUpload = async (fileToUpload?: File, resolvedMime?: string) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    const mime = resolvedMime || getFileMimeType(file);
    const isVideo = mime.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4');
    const resourceType = isVideo ? 'video' : 'image';

    setIsUploading(true);
    setUploadProgress(5);
    setErrorDetails(null);
    setValidationError(null);
    setStatusMessage('Step 1/3: Requesting signed upload authorization from Next.js API...');

    try {
      // Step 1: Request upload signature
      console.log('[Upload] Requesting upload signature for org...');
      const sigRes = await fetch('/api/cloudinary/signature', {
        method: 'POST',
      });
      const sigJson = await sigRes.json();

      if (!sigRes.ok || !sigJson.success) {
        throw new Error(
          sigJson.error?.message || `Signature error (HTTP ${sigRes.status}): Failed to authenticate upload`
        );
      }

      const { signature, timestamp, cloud_name, api_key, folder, public_id } = sigJson.data;
      console.log('[Upload] Signature received:', { cloud_name, folder, public_id });

      // Step 2: Direct browser upload to Cloudinary
      setUploadProgress(15);
      setStatusMessage(`Step 2/3: Uploading ${file.name} directly to Cloudinary CDN (${cloud_name})...`);

      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', api_key);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);
      formData.append('folder', folder);
      formData.append('public_id', public_id);

      // Perform XHR to support upload progress tracking
      const cloudinaryData = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', cloudinaryUrl);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = 15 + Math.round((event.loaded / event.total) * 75);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              reject(new Error('Invalid JSON response received from Cloudinary CDN'));
            }
          } else {
            let errorMsg = `Cloudinary CDN error (HTTP ${xhr.status})`;
            try {
              const errObj = JSON.parse(xhr.responseText);
              if (errObj.error?.message) {
                errorMsg = `Cloudinary: ${errObj.error.message}`;
              }
            } catch {}
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => reject(new Error('Network error or CORS issue connecting to Cloudinary CDN'));
        xhr.send(formData);
      });

      console.log('[Upload] Cloudinary upload successful:', cloudinaryData);

      // Step 3: Send metadata to Next.js API to create media_assets row in PostgreSQL
      setUploadProgress(95);
      setStatusMessage('Step 3/3: Registering media metadata in PostgreSQL database...');

      const payload = {
        cloudinary_public_id: cloudinaryData.public_id,
        cloudinary_url: cloudinaryData.secure_url || cloudinaryData.url,
        resource_type: resourceType,
        original_filename: file.name,
        mime_type: mime || null,
        file_size: cloudinaryData.bytes || file.size,
        width: cloudinaryData.width || null,
        height: cloudinaryData.height || null,
      };

      const mediaRes = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const mediaJson = await mediaRes.json();

      if (!mediaRes.ok || !mediaJson.success) {
        throw new Error(
          mediaJson.error?.message || `Database error (HTTP ${mediaRes.status}): Failed to persist media asset.`
        );
      }

      setUploadProgress(100);
      setStatusMessage(`✓ Upload complete! Media record ${mediaJson.data.id} successfully saved to database.`);
      setLatestSavedRecord(mediaJson.data);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchRecentAssets();
    } catch (err) {
      console.error('[Upload Flow Error]:', err);
      setErrorDetails(err instanceof Error ? err.message : 'Unknown upload error occurred.');
      setStatusMessage(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = () => {
    startUpload();
  };

  return (
    <div
      style={{
        backgroundColor: '#131b17',
        border: '1px solid #1f2e27',
        borderRadius: '12px',
        padding: '1.75rem',
        marginBottom: '2rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f3f4f6', margin: 0 }}>
            Phase 3: Direct Cloudinary Media Upload Pipeline
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.25rem', margin: 0 }}>
            Upload directly from browser to Cloudinary CDN with server-signed tokens. PostgreSQL stores metadata and asset references.
          </p>
        </div>
        <button
          onClick={fetchRecentAssets}
          disabled={loadingAssets}
          style={{
            padding: '0.4rem 0.8rem',
            backgroundColor: '#1b2520',
            border: '1px solid #2d3f35',
            color: '#34d399',
            borderRadius: '6px',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          {loadingAssets ? 'Refreshing...' : '↻ Refresh List'}
        </button>
      </div>

      {/* Upload Box */}
      <div
        style={{
          border: '2px dashed #2d3f35',
          borderRadius: '8px',
          padding: '1.5rem',
          textAlign: 'center',
          backgroundColor: '#0f1713',
          marginBottom: '1.25rem',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4"
          onChange={handleFileChange}
          disabled={isUploading}
          style={{ display: 'none' }}
          id="media-file-input"
        />

        <label
          htmlFor="media-file-input"
          style={{
            display: 'inline-block',
            padding: '0.6rem 1.25rem',
            backgroundColor: '#1b382b',
            border: '1px solid #059669',
            color: '#34d399',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            marginBottom: '0.75rem',
          }}
        >
          {selectedFile ? 'Change Selected Media' : 'Select Image or MP4 Video'}
        </label>

        <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
          Supported: <strong>JPEG, PNG, WEBP</strong> (up to 10 MB) • <strong>MP4</strong> (up to 100 MB)
        </div>

        {selectedFile && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#14201a',
              border: '1px solid #1f382a',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.875rem' }}>
                {selectedFile.name}
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Unknown MIME'}
              </div>
            </div>

            <button
              onClick={handleUpload}
              disabled={isUploading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: isUploading ? '#059669' : '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isUploading ? 'not-allowed' : 'pointer',
              }}
            >
              {isUploading ? 'Uploading...' : 'Start Secure Upload'}
            </button>
          </div>
        )}
      </div>

      {/* Validation or API Errors */}
      {validationError && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#451a1a',
            border: '1px solid #7f1d1d',
            color: '#fca5a5',
            borderRadius: '6px',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}
        >
          ⚠️ {validationError}
        </div>
      )}

      {errorDetails && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#451a1a',
            border: '1px solid #7f1d1d',
            color: '#fca5a5',
            borderRadius: '6px',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}
        >
          ❌ Upload Error: {errorDetails}
        </div>
      )}

      {/* Progress & Status */}
      {isUploading && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            <span>{statusMessage}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: '#1f2e27', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${uploadProgress}%`,
                height: '100%',
                backgroundColor: '#10b981',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        </div>
      )}

      {!isUploading && statusMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#064e3b',
            border: '1px solid #059669',
            color: '#a7f3d0',
            borderRadius: '6px',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}
        >
          ✓ {statusMessage}
        </div>
      )}

      {/* Latest Saved PostgreSQL Record Display */}
      {latestSavedRecord && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: '#0e1612',
            border: '1px solid #1b382b',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#34d399', marginBottom: '0.5rem' }}>
            Saved PostgreSQL Record (`media_assets`):
          </div>
          <pre
            style={{
              backgroundColor: '#060a08',
              padding: '0.75rem',
              borderRadius: '6px',
              color: '#d1fae5',
              fontSize: '0.8rem',
              overflowX: 'auto',
              margin: 0,
            }}
          >
            {JSON.stringify(latestSavedRecord, null, 2)}
          </pre>
        </div>
      )}

      {/* Recent Assets in Organization */}
      <div style={{ marginTop: '2rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#e5e7eb', marginBottom: '0.75rem' }}>
          Organization Media Assets (Stored in PostgreSQL)
        </h3>

        {recentAssets.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: '0.85rem', fontStyle: 'italic' }}>
            No media assets uploaded yet. Use the upload box above to test.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {recentAssets.map((asset) => (
              <div
                key={asset.id}
                style={{
                  backgroundColor: '#0f1713',
                  border: '1px solid #1f2e27',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        backgroundColor: '#1b382b',
                        color: '#34d399',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {asset.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {asset.resource_type.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: '0.25rem' }}>
                    {asset.original_filename}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', wordBreak: 'break-all', marginBottom: '0.5rem' }}>
                    <code>{asset.cloudinary_public_id}</code>
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem', borderTop: '1px solid #1f2e27', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                    {asset.file_size ? `${(asset.file_size / 1024).toFixed(1)} KB` : 'N/A'}
                  </span>
                  <a
                    href={asset.cloudinary_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '0.75rem',
                      color: '#60a5fa',
                      textDecoration: 'underline',
                    }}
                  >
                    Open Cloudinary URL ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

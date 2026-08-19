/** Upload limits and content-type policy, shared by client and server. */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '10 MB';

export const PDF_MIME_TYPES = ['application/pdf'] as const;

/**
 * Deliberately excludes image/svg+xml: an SVG is a document that can carry
 * script, and these files are served from the app's own origin, so allowing
 * SVG would hand any uploader stored XSS.
 */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

/** `accept` attribute values for the two file inputs. */
export const PDF_ACCEPT = PDF_MIME_TYPES.join(',');
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(',');

/** Canonical extension per accepted type. Uploaded filenames are never used to
 *  build a path, so this map is the only source of extensions on disk. */
export const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Absolute origin to embed in the QR code.
 *
 * Prefers NEXT_PUBLIC_SITE_URL because a QR code is scanned from a *different*
 * device — "localhost" would point the phone at itself. Falls back to the
 * request's forwarded/Host header so a deploy works before anyone sets the env
 * var.
 *
 * Keep this in sync with the port the dev server actually binds: the origin is
 * baked into the QR image at generation time, so a code generated against the
 * wrong port stays broken after the fact.
 */
export function resolveSiteUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const headers = request.headers;
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return '';

  const proto = headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

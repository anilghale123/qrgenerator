/**
 * The three kinds of content a share can hold.
 *
 * Stored as a plain string on the Mongo document. Mongo has no enum type, so
 * this union plus isShareType() below is what keeps a malformed record from
 * reaching the viewer.
 */
export const SHARE_TYPES = ['PDF', 'IMAGE', 'URL'] as const;

export type ShareType = (typeof SHARE_TYPES)[number];

export function isShareType(value: unknown): value is ShareType {
  return typeof value === 'string' && (SHARE_TYPES as readonly string[]).includes(value);
}

/** Shape returned by POST /api/shares on success. */
export type CreateShareResponse = {
  /** Short URL-safe public identity; the QR encodes a URL ending in this. */
  slug: string;
  type: ShareType;
  /** Absolute URL encoded into the QR code, e.g. https://host/v/abc123. */
  viewUrl: string;
  /** PNG data URL of the QR code, ready to drop into <img src> or a download. */
  qrDataUrl: string;
  /** Human label for the confirmation screen ("invoice.pdf" or the URL host). */
  label: string;
};

export type ApiError = { error: string };

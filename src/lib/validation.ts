import {
  IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  PDF_MIME_TYPES,
  formatBytes,
} from '@/lib/config';

export type Valid<T> = { ok: true; value: T };
export type Invalid = { ok: false; error: string };
export type Result<T> = Valid<T> | Invalid;

const ok = <T,>(value: T): Valid<T> => ({ ok: true, value });
const fail = (error: string): Invalid => ({ ok: false, error });

/* -------------------------------------------------------------------------- */
/* URLs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Accepts a user-typed URL and returns its normalised absolute form.
 *
 * Only http(s) survives: the stored value is later placed in an href, so
 * javascript:, data: and file: schemes would turn a share link into a script
 * injection or a local-file probe.
 */
export function validateUrl(raw: string): Result<string> {
  const trimmed = raw.trim();
  if (!trimmed) return fail('Enter a URL to share.');

  // Be forgiving about the scheme the way a browser address bar is — someone
  // pasting "example.com" means https.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return fail("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail('Only http:// and https:// links can be shared.');
  }
  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    return fail('Enter a full URL, including the domain (e.g. example.com/page).');
  }

  return ok(parsed.toString());
}

/* -------------------------------------------------------------------------- */
/* Files                                                                      */
/* -------------------------------------------------------------------------- */

export type UploadKind = 'PDF' | 'IMAGE';

function allowedMimes(kind: UploadKind): readonly string[] {
  return kind === 'PDF' ? PDF_MIME_TYPES : IMAGE_MIME_TYPES;
}

/**
 * Content-type sniffing from magic bytes.
 *
 * The browser-supplied `File.type` is attacker-controlled — it is whatever the
 * client claims — so it is checked against what the bytes actually are before
 * anything is written to disk. Returns null when the format is not one we
 * accept, which is itself a rejection.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  const startsWith = (...signature: number[]) =>
    signature.length <= bytes.length && signature.every((byte, i) => bytes[i] === byte);

  const asciiAt = (offset: number, text: string) =>
    offset + text.length <= bytes.length &&
    [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));

  if (asciiAt(0, '%PDF-')) return 'application/pdf';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (asciiAt(0, 'GIF87a') || asciiAt(0, 'GIF89a')) return 'image/gif';
  if (asciiAt(0, 'RIFF') && asciiAt(8, 'WEBP')) return 'image/webp';
  // ISO-BMFF container: the brand at offset 8 distinguishes AVIF from HEIC/MP4.
  if (asciiAt(4, 'ftyp') && (asciiAt(8, 'avif') || asciiAt(8, 'avis'))) return 'image/avif';

  return null;
}

export type ValidatedUpload = {
  bytes: Uint8Array;
  /** The sniffed type — never the client-declared one. */
  mimeType: string;
  originalName: string;
  size: number;
};

/** Size and declared-type checks that can run in the browser before upload. */
export function validateFileMetadata(
  file: { name: string; size: number; type: string },
  kind: UploadKind,
): Result<null> {
  if (file.size === 0) return fail('That file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(`That file is ${formatBytes(file.size)}. The limit is ${MAX_UPLOAD_LABEL}.`);
  }
  if (file.type && !allowedMimes(kind).includes(file.type)) {
    return fail(
      kind === 'PDF' ? 'Only PDF files can be uploaded here.' : 'That image format is not supported.',
    );
  }
  return ok(null);
}

/** Full server-side validation, including the magic-byte check. */
export async function validateUpload(file: File, kind: UploadKind): Promise<Result<ValidatedUpload>> {
  const metadata = validateFileMetadata(file, kind);
  if (!metadata.ok) return metadata;

  const bytes = new Uint8Array(await file.arrayBuffer());

  // arrayBuffer() is the authoritative size; File.size arrived over the wire.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return fail(`That file is ${formatBytes(bytes.byteLength)}. The limit is ${MAX_UPLOAD_LABEL}.`);
  }

  const sniffed = sniffMimeType(bytes);
  if (!sniffed || !allowedMimes(kind).includes(sniffed)) {
    return fail(
      kind === 'PDF'
        ? "That file isn't a PDF."
        : "That file isn't a supported image (PNG, JPEG, WebP, GIF or AVIF).",
    );
  }

  return ok({
    bytes,
    mimeType: sniffed,
    originalName: sanitizeDisplayName(file.name),
    size: bytes.byteLength,
  });
}

/**
 * Cleans a filename for *display and download only*. Path separators and
 * control characters are stripped so the value is safe to echo into HTML and
 * into a Content-Disposition header; it is never used to build a storage path.
 */
export function sanitizeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // Drop C0/DEL control characters and the double quote — either would let a
  // filename break out of a Content-Disposition header value. Filtered by code
  // point rather than with a regex literal so this source file stays free of
  // raw control bytes.
  const cleaned = Array.from(base)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f && char !== '"';
    })
    .join('')
    .trim();

  return (cleaned || 'file').slice(0, 120);
}

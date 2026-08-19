/**
 * The seam between the app and wherever uploaded bytes actually live.
 *
 * SHARED CLOUD — the Cloudinary account backing this app is also used by the
 * "midas" project. Everything this app writes goes under CLOUDINARY_FOLDER, and
 * assertInScopedFolder() below is the chokepoint every destructive call must
 * pass through first.
 */

/** Cloudinary's storage classes. PDFs go to `raw`, pictures to `image`. */
export type ResourceType = 'raw' | 'image' | 'video';

export type PutObjectInput = {
  data: Uint8Array;
  /** Validated, sniffed content type — never the client-declared one. */
  mimeType: string;
  /** Caller-supplied basename, in practice the share slug. */
  keyHint: string;
};

export type StoredObject = {
  /** Fully-qualified Cloudinary public_id, always inside the scoped folder. */
  publicId: string;
  resourceType: ResourceType;
  /** Absolute https delivery URL as returned by Cloudinary. */
  secureUrl: string;
  /** Byte count Cloudinary recorded, used to cross-check our own count. */
  bytes: number;
};

/** The folder every asset this app owns lives under. Never empty. */
export function scopedFolder(): string {
  const folder = process.env.CLOUDINARY_FOLDER?.trim().replace(/^\/+|\/+$/g, '');
  if (!folder) {
    throw new Error(
      'CLOUDINARY_FOLDER is not set. It is required: this Cloudinary account is shared with ' +
        'another project, and the folder is what keeps the two apart.',
    );
  }
  return folder;
}

/**
 * The isolation guard. Throws unless `publicId` sits inside the scoped folder.
 *
 * Call this before every destroy/delete_resources. The shared account means a
 * public_id from outside the folder is by definition another project's asset,
 * and deleting it is unrecoverable — Cloudinary has no trash for API deletes.
 */
export function assertInScopedFolder(publicId: string): void {
  const prefix = `${scopedFolder()}/`;

  if (typeof publicId !== 'string' || !publicId.startsWith(prefix)) {
    throw new Error(
      `Refusing to touch Cloudinary asset ${JSON.stringify(publicId)}: it is outside ` +
        `${JSON.stringify(prefix)}. This account is shared with the midas project.`,
    );
  }
  // `qr-generator/../midas/secret` normalises to another folder on some paths.
  if (publicId.includes('..')) {
    throw new Error(`Refusing to touch Cloudinary asset with a traversal segment: ${JSON.stringify(publicId)}`);
  }
  // A bare prefix means the folder itself, not an asset in it.
  if (publicId.length <= prefix.length) {
    throw new Error(`Refusing to touch the folder itself: ${JSON.stringify(publicId)}`);
  }
}

const SAFE_SLUG = /^[A-Za-z0-9._-]+$/;

/** Guards the caller-supplied basename before it becomes part of a public_id. */
export function assertSafeKey(key: string): void {
  if (!SAFE_SLUG.test(key) || key.includes('..')) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}

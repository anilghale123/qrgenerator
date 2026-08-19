import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { EXTENSION_BY_MIME } from '@/lib/config';
import {
  assertInScopedFolder,
  assertSafeKey,
  scopedFolder,
  type PutObjectInput,
  type ResourceType,
  type StoredObject,
} from './types';

/**
 * Cloudinary storage driver.
 *
 * SHARED ACCOUNT — see ./types.ts. Every write lands under scopedFolder() and
 * every delete goes through assertInScopedFolder().
 *
 * PDF DELIVERY GOTCHA: Cloudinary blocks delivery of PDF and ZIP files by
 * default on many accounts. If an upload succeeds but fetching secureUrl
 * returns 401/403, enable Dashboard → Settings → Security → "Allow delivery of
 * PDF and ZIP files". Uploading PDFs as `raw` (below) rather than `image`
 * avoids the image-pipeline side of that restriction, but the account-level
 * switch still governs delivery.
 */

let configured = false;

function configure(): void {
  if (configured) return;

  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and ' +
        'CLOUDINARY_API_SECRET in .env.local (see .env.example).',
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

/** The configured SDK. Exported so the verify script can call api.ping(). */
export function cloudinaryClient(): typeof cloudinary {
  configure();
  return cloudinary;
}

/**
 * PDFs are stored as `raw` — an opaque file Cloudinary serves back byte for
 * byte. Storing them as `image` would route them through the image pipeline,
 * which is both unnecessary here and the part of Cloudinary that the PDF
 * delivery restriction clamps down on hardest.
 */
export function resourceTypeFor(mimeType: string): ResourceType {
  return mimeType.startsWith('image/') ? 'image' : 'raw';
}

/**
 * Uploads bytes into the scoped folder.
 *
 * The extension is kept in the public_id for raw assets so the delivery URL
 * ends in .pdf — browsers and iOS in particular decide how to handle a
 * response partly on the URL, and a extensionless raw URL gets treated as an
 * arbitrary download.
 */
export async function putObject({ data, mimeType, keyHint }: PutObjectInput): Promise<StoredObject> {
  configure();
  assertSafeKey(keyHint);

  const folder = scopedFolder();
  const resourceType = resourceTypeFor(mimeType);
  const extension = EXTENSION_BY_MIME[mimeType] ?? '';
  // Cloudinary strips a known extension from an `image` public_id and tracks
  // format separately, but keeps it verbatim for `raw`.
  const publicId = resourceType === 'raw' ? `${keyHint}${extension}` : keyHint;

  const response = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        use_filename: false,
        unique_filename: false,
        overwrite: false,
        access_mode: 'public',
        type: 'upload',
      },
      (error, result) => {
        if (error) reject(error);
        else if (!result) reject(new Error('Cloudinary returned no result for the upload.'));
        else resolve(result);
      },
    );
    stream.end(Buffer.from(data));
  });

  // Trust but verify: if Cloudinary ever hands back an id outside our folder,
  // persisting it would create a row whose delete path is permanently blocked
  // by the guard. Better to fail the upload now.
  assertInScopedFolder(response.public_id);

  return {
    publicId: response.public_id,
    resourceType: (response.resource_type as ResourceType) ?? resourceType,
    secureUrl: response.secure_url,
    bytes: response.bytes,
  };
}

/**
 * Best-effort delete. Refuses anything outside the scoped folder, and treats
 * an already-gone asset as success.
 *
 * The guard throws rather than returning false: a caller asking to delete an
 * out-of-folder public_id has a bug, and swallowing it would let a loop over
 * bad ids look like it worked.
 */
export async function removeObject(publicId: string, resourceType: ResourceType): Promise<void> {
  configure();
  assertInScopedFolder(publicId);

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });

  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Cloudinary refused to delete ${publicId}: ${result.result}`);
  }
}

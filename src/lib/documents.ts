import type { Collection } from 'mongodb';
import { getDb } from '@/lib/db';
import { looksLikeSlug } from '@/lib/ids';
import { isShareType, type ShareType } from '@/lib/types';
import type { ResourceType } from '@/lib/storage';

/** Collection name inside the qrgen database. */
export const DOCUMENTS_COLLECTION = 'documents';

/**
 * One shared item: an uploaded PDF, an uploaded image, or a URL.
 *
 * `slug` is the public identity — it is what the QR code encodes and what
 * /v/[slug] looks up — so it is unique and indexed. Mongo's own _id is never
 * exposed: an ObjectId is semi-sequential and would make shares enumerable.
 */
export type DocumentRecord = {
  slug: string;
  /** "PDF" | "IMAGE" | "URL" — see src/lib/types.ts. */
  type: ShareType;

  /** Set when type === "URL"; null otherwise. */
  targetUrl: string | null;

  // --- Set when type === "PDF" | "IMAGE"; null for URL shares -------------
  /** Cloudinary public_id, always inside CLOUDINARY_FOLDER. */
  publicId: string | null;
  resourceType: ResourceType | null;
  /** Absolute https delivery URL from Cloudinary. */
  secureUrl: string | null;
  /** Filename as the uploader had it, used for the download affordance. */
  originalName: string | null;
  mimeType: string | null;
  size: number | null;

  createdAt: Date;
  /** Null means "never expires". The viewer treats a past date as a 404. */
  expiresAt: Date | null;
  viewCount: number;
};

export async function documents(): Promise<Collection<DocumentRecord>> {
  const db = await getDb();
  const collection = db.collection<DocumentRecord>(DOCUMENTS_COLLECTION);
  await ensureIndexes(collection);
  return collection;
}

/**
 * Index creation is idempotent but not free, so it runs once per process and
 * the result is cached on globalThis to survive Next.js hot reloads.
 */
const globalForIndexes = globalThis as unknown as { _qrgenIndexes?: Promise<void> };

function ensureIndexes(collection: Collection<DocumentRecord>): Promise<void> {
  if (!globalForIndexes._qrgenIndexes) {
    globalForIndexes._qrgenIndexes = collection
      .createIndexes([
        // The lookup every scanned QR performs, and the uniqueness that makes
        // a slug collision a write error instead of a silent overwrite.
        { key: { slug: 1 }, name: 'slug_unique', unique: true },
        { key: { createdAt: -1 }, name: 'createdAt_desc' },
        // Plain index, deliberately NOT a TTL index: Mongo's TTL monitor would
        // delete the row without telling anyone, orphaning the Cloudinary
        // asset it points at. Expiry is enforced in loadDocument() instead.
        { key: { expiresAt: 1 }, name: 'expiresAt_asc' },
      ])
      .then(() => undefined)
      .catch((error) => {
        globalForIndexes._qrgenIndexes = undefined;
        throw error;
      });
  }
  return globalForIndexes._qrgenIndexes;
}

export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/**
 * Loads a document for the viewer page.
 *
 * Returns null for missing, malformed, expired and structurally broken records
 * alike: the viewer shows one friendly "link not available" page for all of
 * them rather than telling a stranger which of those it was.
 */
export async function loadDocument(slug: string): Promise<DocumentRecord | null> {
  if (!looksLikeSlug(slug)) return null;

  const collection = await documents();
  const record = await collection.findOne({ slug }, { projection: { _id: 0 } });

  if (!record) return null;
  if (!isShareType(record.type)) return null;
  if (isExpired(record.expiresAt)) return null;
  if (record.type === 'URL' ? !record.targetUrl : !record.secureUrl) return null;

  return record;
}

export async function createDocument(record: DocumentRecord): Promise<void> {
  const collection = await documents();
  await collection.insertOne(record);
}

/**
 * Bumps the view counter. Deliberately swallows failures — a counter is not
 * worth failing a page render over — and is never awaited on the critical path
 * by callers that care about latency.
 */
export async function recordView(slug: string): Promise<void> {
  try {
    const collection = await documents();
    await collection.updateOne({ slug }, { $inc: { viewCount: 1 } });
  } catch {
    // Document vanished between load and update, or the DB is briefly down.
  }
}

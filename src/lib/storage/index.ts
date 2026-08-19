/**
 * The single place the application chooses where uploads live.
 *
 * Cloudinary is the only driver — see ./cloudinary.ts for the shared-account
 * isolation rules that any replacement would also have to honour.
 */
export { cloudinaryClient, putObject, removeObject, resourceTypeFor } from './cloudinary';
export { assertInScopedFolder, assertSafeKey, scopedFolder } from './types';
export type { PutObjectInput, ResourceType, StoredObject } from './types';

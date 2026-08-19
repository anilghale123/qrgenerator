import { MongoClient, type Db } from 'mongodb';

/**
 * MongoDB connection.
 *
 * SHARED CLUSTER — this Atlas cluster is also used by the "midas" project, so
 * database isolation is a correctness requirement, not a convention. Three
 * things enforce it, in order of how early they fail:
 *
 *   1. MONGODB_URI deliberately carries no database in its path. There is
 *      therefore no "default" database to fall into: every handle comes from
 *      db(), which names the database explicitly.
 *   2. assertUriHasNoDatabase() rejects a URI that grew a path segment, which
 *      is the most likely way this config drifts (someone copies a full
 *      connection string from the Atlas UI, which includes /midas).
 *   3. resolveDatabaseName() refuses to return midas — or an admin/system
 *      database — whatever the env says.
 *
 * A misconfiguration here fails loudly at connect time. It never silently
 * writes into the other project.
 */

/** Databases this app must never open, whatever MONGODB_DB_NAME claims. */
const FORBIDDEN_DATABASES = new Set(['midas', 'admin', 'local', 'config']);

/** Returns the database named in a connection string's path, or '' if none. */
export function databaseInUriPath(uri: string): string {
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const slash = afterScheme.indexOf('/');
  if (slash === -1) return '';

  const path = afterScheme.slice(slash + 1);
  const query = path.indexOf('?');
  return decodeURIComponent(query === -1 ? path : path.slice(0, query));
}

function assertUriHasNoDatabase(uri: string): void {
  const inPath = databaseInUriPath(uri);
  if (inPath) {
    throw new Error(
      `MONGODB_URI must not name a database in its path (found ${JSON.stringify(inPath)}). ` +
        'This cluster is shared with the midas project; the database is selected explicitly ' +
        'via MONGODB_DB_NAME so a pasted connection string cannot repoint this app.',
    );
  }
}

export function resolveDatabaseName(): string {
  const name = process.env.MONGODB_DB_NAME?.trim();
  if (!name) {
    throw new Error('MONGODB_DB_NAME is not set. Copy .env.example to .env.local and try again.');
  }
  if (FORBIDDEN_DATABASES.has(name.toLowerCase())) {
    throw new Error(
      `Refusing to use the ${JSON.stringify(name)} database. This cluster is shared with another ` +
        'project — set MONGODB_DB_NAME to this app\'s own database (qrgen).',
    );
  }
  return name;
}

function resolveUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env.local and try again.');
  }
  assertUriHasNoDatabase(uri);
  return uri;
}

function createClientPromise(): Promise<MongoClient> {
  return new MongoClient(resolveUri(), {
    // Fail fast instead of hanging: a bad Atlas IP allowlist entry is the most
    // common failure here, and the default 30s server-selection timeout makes
    // that look like a frozen page rather than a config error.
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    // The dev cluster is small and shared. A modest pool keeps this app from
    // monopolising connections the other project also needs.
    maxPoolSize: 10,
    retryWrites: true,
  }).connect();
}

/**
 * Next.js hot-reloads server modules on every edit. Without this cache each
 * reload would open another connection pool against the shared cluster and
 * exhaust its connection limit within a few minutes of editing.
 *
 * The *promise* is cached rather than the resolved client so that concurrent
 * first requests share one in-flight connect() instead of racing to open
 * several pools.
 */
const globalForMongo = globalThis as unknown as { _mongoClientPromise?: Promise<MongoClient> };

export function getClientPromise(): Promise<MongoClient> {
  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = createClientPromise().catch((error) => {
      // Drop the rejected promise so the next request retries instead of
      // replaying the original failure until the process restarts.
      globalForMongo._mongoClientPromise = undefined;
      throw error;
    });
  }
  return globalForMongo._mongoClientPromise;
}

/** The one database this app may touch. Named explicitly — never from the URI. */
export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(resolveDatabaseName());
}

/** Closes the pool. For scripts and tests only — the app keeps it open. */
export async function closeDb(): Promise<void> {
  const pending = globalForMongo._mongoClientPromise;
  if (!pending) return;
  globalForMongo._mongoClientPromise = undefined;
  const client = await pending.catch(() => null);
  await client?.close();
}

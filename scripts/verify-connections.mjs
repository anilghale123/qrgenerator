/**
 * Connection smoke test for the shared dev accounts.
 *
 * Run with: npm run verify:connections
 *
 * Deliberately standalone — it imports no app code, so it proves the
 * credentials and the isolation rules independently of whether the app
 * compiles. It mirrors src/lib/db.ts and src/lib/storage/ rather than importing
 * them (the app's .ts modules are ESM-syntax under a commonjs package, which
 * Node cannot load directly).
 *
 * Everything it creates, it deletes.
 */
import { MongoClient } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';

const FORBIDDEN_DATABASES = new Set(['midas', 'admin', 'local', 'config']);

let failures = 0;
const pass = (m) => console.log(`  [32mPASS[0m ${m}`);
const fail = (m) => {
  failures += 1;
  console.log(`  [31mFAIL[0m ${m}`);
};
const info = (m) => console.log(`  [90m-[0m ${m}`);
const section = (m) => console.log(`\n[1m${m}[0m`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set (expected in .env.local)`);
  return value;
}

/** Mirrors databaseInUriPath() in src/lib/db.ts. */
function databaseInUriPath(uri) {
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const slash = afterScheme.indexOf('/');
  if (slash === -1) return '';
  const path = afterScheme.slice(slash + 1);
  const query = path.indexOf('?');
  return decodeURIComponent(query === -1 ? path : path.slice(0, query));
}

/** Mirrors assertInScopedFolder() in src/lib/storage/types.ts. */
function assertInScopedFolder(publicId, folder) {
  const prefix = `${folder}/`;
  if (!publicId.startsWith(prefix)) throw new Error(`outside ${prefix}: ${publicId}`);
  if (publicId.includes('..')) throw new Error(`traversal segment: ${publicId}`);
  if (publicId.length <= prefix.length) throw new Error(`folder itself: ${publicId}`);
}

/* ---------------------------------------------------------------- config -- */

section('Configuration');

const uri = required('MONGODB_URI');
const dbName = required('MONGODB_DB_NAME');
const folder = required('CLOUDINARY_FOLDER').replace(/^\/+|\/+$/g, '');

const inPath = databaseInUriPath(uri);
if (inPath) fail(`MONGODB_URI names a database in its path (${inPath}) - it must not`);
else pass('MONGODB_URI carries no database in its path');

if (FORBIDDEN_DATABASES.has(dbName.toLowerCase())) fail(`MONGODB_DB_NAME is a forbidden database: ${dbName}`);
else pass(`MONGODB_DB_NAME is ${JSON.stringify(dbName)}`);

info(`Cloudinary folder scope: ${folder}/`);

/* ----------------------------------------------------------------- mongo -- */

section('MongoDB');

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000 });
let mongoOk = false;

try {
  await client.connect();
  pass('connected to the Atlas cluster');

  // The database name is passed explicitly here - never taken from the URI.
  const db = client.db(dbName);
  if (db.databaseName !== dbName) fail(`driver selected ${db.databaseName}, expected ${dbName}`);
  else pass(`driver selected database ${JSON.stringify(db.databaseName)} via the explicit dbName argument`);

  const collection = db.collection('__connection_check');
  const marker = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { insertedId } = await collection.insertOne({ marker, createdAt: new Date() });
  pass(`insert  -> _id ${insertedId}`);

  const found = await collection.findOne({ _id: insertedId });
  if (found?.marker === marker) pass(`read    -> marker matches (${marker})`);
  else fail('read back the wrong document');

  const { deletedCount } = await collection.deleteOne({ _id: insertedId });
  if (deletedCount === 1) pass('delete  -> throwaway document removed');
  else fail(`delete removed ${deletedCount} documents`);

  await collection.drop().catch(() => {});

  // Isolation evidence: show which databases this app can see, and prove the
  // throwaway document did NOT land in midas.
  const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
  const names = databases.map((d) => d.name);
  info(`databases visible on the cluster: ${names.join(', ')}`);

  if (names.includes('midas')) {
    const strayInMidas = await client.db('midas').collection('__connection_check').countDocuments();
    if (strayInMidas === 0) pass('midas has no __connection_check collection - nothing was written there');
    else fail(`midas contains ${strayInMidas} __connection_check documents`);
  } else {
    info('midas database not present on this cluster (nothing to collide with)');
  }

  const qrgenCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  info(`collections in ${dbName}: ${qrgenCollections.map((c) => c.name).join(', ') || '(none yet)'}`);

  mongoOk = true;
} catch (error) {
  fail(`MongoDB: ${error.message}`);
} finally {
  await client.close().catch(() => {});
}

/* ------------------------------------------------------------ cloudinary -- */

section('Cloudinary');

cloudinary.config({
  cloud_name: required('CLOUDINARY_CLOUD_NAME'),
  api_key: required('CLOUDINARY_API_KEY'),
  api_secret: required('CLOUDINARY_API_SECRET'),
  secure: true,
});

let uploaded = null;

try {
  const ping = await cloudinary.api.ping();
  if (ping.status === 'ok') pass(`api.ping() -> ${ping.status}`);
  else fail(`api.ping() -> ${JSON.stringify(ping)}`);
} catch (error) {
  fail(`api.ping(): ${error.message ?? error.error?.message}`);
}

// The delete guard must reject anything outside the scoped folder.
for (const bad of ['midas/invoice', 'invoice', `${folder}/../midas/x`, folder]) {
  try {
    assertInScopedFolder(bad, folder);
    fail(`guard ALLOWED an out-of-scope public_id: ${JSON.stringify(bad)}`);
  } catch {
    pass(`guard rejects ${JSON.stringify(bad)}`);
  }
}

try {
  // A minimal but structurally valid PDF, enough to exercise raw upload and
  // delivery without shipping a fixture file.
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
      'trailer<</Root 1 0 R/Size 4>>\n%%EOF\n',
    'utf8',
  );
  const publicId = `verify-${Date.now()}.pdf`;

  uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'raw',
        use_filename: false,
        unique_filename: false,
        overwrite: false,
        access_mode: 'public',
        type: 'upload',
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(pdf);
  });

  assertInScopedFolder(uploaded.public_id, folder);
  pass(`upload  -> ${uploaded.public_id} (${uploaded.bytes} bytes, resource_type=${uploaded.resource_type})`);

  // THE KNOWN GOTCHA: Cloudinary blocks PDF/ZIP delivery by default on many
  // accounts. Upload succeeding tells us nothing about whether a phone can
  // actually fetch the file, so fetch it for real.
  const response = await fetch(uploaded.secure_url);
  if (response.ok) {
    pass(`delivery -> HTTP ${response.status} for ${uploaded.secure_url}`);
  } else {
    fail(
      `delivery -> HTTP ${response.status} for ${uploaded.secure_url}\n` +
        '         Cloudinary is blocking PDF delivery on this account. Enable\n' +
        '         Dashboard > Settings > Security > "Allow delivery of PDF and ZIP files".',
    );
  }
} catch (error) {
  fail(`Cloudinary upload/delivery: ${error.message ?? JSON.stringify(error)}`);
} finally {
  if (uploaded?.public_id) {
    try {
      assertInScopedFolder(uploaded.public_id, folder);
      const result = await cloudinary.uploader.destroy(uploaded.public_id, {
        resource_type: uploaded.resource_type,
        invalidate: true,
      });
      if (result.result === 'ok') pass(`cleanup -> destroyed ${uploaded.public_id}`);
      else fail(`cleanup -> destroy returned ${result.result}`);
    } catch (error) {
      fail(`cleanup: ${error.message}`);
    }
  }
}

/* ---------------------------------------------------------------- result -- */

section(failures === 0 ? '[32mAll checks passed[0m' : `[31m${failures} check(s) failed[0m`);
if (!mongoOk) info('MongoDB did not complete - check the Atlas IP allowlist for this machine.');
process.exit(failures === 0 ? 0 : 1);

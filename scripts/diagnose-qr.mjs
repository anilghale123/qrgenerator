/**
 * Diagnose why a QR link returns "link isn't available".
 *
 * Usage: node --env-file=.env.local scripts/diagnose-qr.mjs <slug>
 * Example: node --env-file=.env.local scripts/diagnose-qr.mjs abc123defgh
 */
import { MongoClient } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';

const slug = process.argv[2];
if (!slug) {
  console.log('Usage: node --env-file=.env.local scripts/diagnose-qr.mjs <slug>');
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB_NAME);

console.log(`\n📋 Diagnosing QR: ${slug}\n`);

// 1. Check Mongo
const doc = await db.collection('documents').findOne({ slug });
if (!doc) {
  console.log('❌ Document not found in MongoDB');
  console.log('   → The QR link was either never created or has been manually deleted');
  await client.close();
  process.exit(0);
}

console.log('✓ Document found in MongoDB');
console.log(`  type: ${doc.type}`);
console.log(`  created: ${doc.createdAt.toISOString()}`);
console.log(`  expiresAt: ${doc.expiresAt ? doc.expiresAt.toISOString() : '(never)'}`);

// 2. Check expiry
if (doc.expiresAt && doc.expiresAt < new Date()) {
  console.log('⚠️  Document has expired');
  console.log(`   → expiresAt was ${doc.expiresAt.toISOString()}`);
  console.log('   → Set expiresAt to null to un-expire, or delete and re-create');
}

// 3. Check content fields
if (doc.type === 'URL') {
  if (!doc.targetUrl) {
    console.log('❌ No targetUrl stored (corruption?)');
  } else {
    console.log(`✓ targetUrl: ${doc.targetUrl}`);
  }
} else if (doc.type === 'PDF' || doc.type === 'IMAGE') {
  console.log(`✓ File type: ${doc.type}`);

  if (!doc.secureUrl) {
    console.log('❌ secureUrl is null or missing');
    console.log('   → File metadata is corrupted or was cleared');
  } else {
    console.log(`  secureUrl: ${doc.secureUrl.slice(0, 90)}...`);

    if (!doc.publicId) {
      console.log('  ⚠️  publicId is missing (should not happen)');
    } else {
      console.log(`  publicId: ${doc.publicId}`);

      // 4. Check Cloudinary
      try {
        const asset = await cloudinary.api.resource(doc.publicId, {
          resource_type: doc.resourceType,
        });
        console.log(`  ✓ Asset exists in Cloudinary (${asset.bytes} bytes)`);

        // 5. Check delivery
        const response = await fetch(doc.secureUrl);
        if (response.ok) {
          console.log(`  ✓ Asset delivers (HTTP ${response.status})`);
        } else {
          console.log(`  ❌ Asset returns HTTP ${response.status}`);
          if (response.status === 401 || response.status === 403) {
            console.log('     → Cloudinary is blocking delivery (PDF/ZIP setting?)');
            console.log('     → Fix: Dashboard → Settings → Security → allow PDF/ZIP');
          }
        }
      } catch (error) {
        console.log(`  ❌ Asset NOT found in Cloudinary`);
        console.log(`     → Error: ${error.message}`);
        console.log(`     → The file was deleted or the publicId is wrong`);
      }
    }
  }
}

console.log('');
await client.close();

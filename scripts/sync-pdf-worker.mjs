/**
 * Copies the pdf.js worker out of node_modules into public/.
 *
 * react-pdf renders on a worker thread, and the worker build must match the
 * pdfjs-dist version exactly or it throws a version-mismatch at run time.
 * Copying on every dev/build (see package.json scripts) keeps the served file
 * pinned to whatever is installed, so a dependency bump can't leave a stale
 * worker behind. public/pdf.worker.min.mjs is gitignored for the same reason:
 * it is a build artifact, not source.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const source = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build', 'pdf.worker.min.mjs');
const destination = path.join(process.cwd(), 'public', 'pdf.worker.min.mjs');

await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);

console.log(`pdf.js worker synced -> public/pdf.worker.min.mjs (pdfjs-dist ${require('pdfjs-dist/package.json').version})`);

# QR Share

Upload a PDF or a photo, or paste a URL, and get a QR code that opens that
content in this app. Scanning the code lands on `/v/{slug}`, which renders the
PDF inline, shows the image, or hands off to the link.

## Stack

| Concern    | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Framework  | Next.js 15 (App Router) + TypeScript                                |
| Styling    | Tailwind CSS v4 (PostCSS plugin, no config file needed)             |
| Database   | MongoDB Atlas via the official `mongodb` driver                     |
| Storage    | Cloudinary, scoped to one folder                                    |
| QR codes   | `qrcode`, rendered server-side to a PNG data URL                    |
| Slugs      | `nanoid`, 10 chars from an unambiguous 32-char alphabet (~50 bits)  |
| PDF viewer | `react-pdf` / pdf.js canvas render, with a download fallback        |

## ⚠️ Shared dev accounts

The MongoDB cluster and the Cloudinary cloud are **shared with a separate
project ("midas")**. Both are development accounts. Two isolation rules keep the
projects apart, and both are enforced in code rather than by convention:

1. **Mongo — separate database.** Same cluster, but this app only ever touches
   the database named by `MONGODB_DB_NAME` (`qrgen`). `MONGODB_URI` deliberately
   carries **no database in its path**, so there is no default database to fall
   into; `src/lib/db.ts` passes the name explicitly to `client.db()` and refuses
   to open `midas`, `admin`, `local` or `config`.
2. **Cloudinary — scoped folder.** Every upload goes under `CLOUDINARY_FOLDER`
   (`qr-generator/`). `assertInScopedFolder()` in `src/lib/storage/types.ts`
   gates every `destroy` call, so this app cannot delete another project's
   assets even if handed their `public_id`.

**These credentials are for development only.** Do not reuse them for a
production deploy — provision this project its own cluster and cloud first. All
`.env*` files except `.env.example` are gitignored.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the credentials
npm run verify:connections   # proves both accounts work before you build on them
npm run dev                  # http://localhost:3000
```

`verify:connections` connects to Mongo, round-trips a throwaway document through
`qrgen`, confirms nothing landed in `midas`, pings the Cloudinary API, exercises
the delete guard, and uploads-fetches-deletes a test PDF. It cleans up after
itself and exits non-zero on any failure.

### Scanning from a phone

`NEXT_PUBLIC_SITE_URL` is baked into the QR code **at generation time** — a code
made against the wrong origin stays broken, so fix this before generating codes
you intend to keep. It defaults to `http://localhost:3000`, which a phone cannot
reach; point it at your machine's LAN address and restart:

```
NEXT_PUBLIC_SITE_URL="http://192.168.1.20:3000"
```

If it is unset entirely, the server falls back to the request's `Host` header.

## Scripts

| Script                       | Does                                             |
| ---------------------------- | ------------------------------------------------ |
| `npm run dev`                | Sync the pdf.js worker, then run the dev server  |
| `npm run build`              | Sync the pdf.js worker, then `next build`        |
| `npm start`                  | Serve the production build                       |
| `npm run typecheck`          | `tsc --noEmit`                                   |
| `npm run verify:connections` | Smoke-test Mongo + Cloudinary (see above)        |
| `npm run sync:pdf-worker`    | Copy the pdf.js worker into `public/`            |

## How it fits together

```
src/
  app/
    page.tsx                 upload flow (renders UploadPanel)
    api/shares/route.ts      POST: validate → Cloudinary → Mongo → render QR
    v/[slug]/page.tsx        viewer: PDF | image | URL hand-off
    v/[slug]/not-found.tsx   friendly page for dead links
    view/[id]/page.tsx       308 redirect for links minted before the rename
  components/                UploadPanel, FileDropzone, ShareResult, CopyButton,
                             PdfViewer (+ PdfViewerClient wrapper)
  lib/
    config.ts                limits, accepted MIME types, site-URL resolution
    validation.ts            URL parsing + magic-byte content sniffing
    ids.ts                   slug generation
    qr.ts                    QR rendering
    db.ts                    cached Mongo client + database isolation guards
    documents.ts             the documents collection: load, create, count views
    storage/                 Cloudinary driver + the folder isolation guard
scripts/
  verify-connections.mjs     credential/isolation smoke test
  sync-pdf-worker.mjs        copies pdf.worker.min.mjs into public/
```

### Data model

One document per share in `qrgen.documents` (shape in `src/lib/documents.ts`).
`slug` is the public identity — what the QR encodes and what `/v/{slug}` looks
up — and carries a **unique** index. Mongo's `_id` is never exposed: an ObjectId
is semi-sequential, which would make shares enumerable.

`type` is `"PDF" | "IMAGE" | "URL"` as a plain string; the union lives in
`src/lib/types.ts` and `isShareType()` is what keeps a malformed record from
reaching the viewer. URL shares populate `targetUrl`; file shares populate
`publicId`/`resourceType`/`secureUrl`/`originalName`/`mimeType`/`size`.
`expiresAt` is nullable (null = never) and `viewCount` increments on each view.

`expiresAt` has a plain index, deliberately **not** a TTL index: Mongo's TTL
monitor would delete the document without telling anyone, orphaning the
Cloudinary asset it points at. Expiry is enforced in `loadDocument()` instead.
Nothing currently *writes* `expiresAt`, so adding an expiry picker to the upload
form is the only work left to make expiring links a feature.

## Decisions worth knowing

**PDFs are stored as Cloudinary `raw`, not `image`.** Storing them as `image`
would route them through the image pipeline, which is unnecessary here and is
the part of Cloudinary that PDF delivery restrictions clamp down on hardest. The
extension is kept in the `public_id` for raw assets so the delivery URL ends in
`.pdf` — iOS in particular decides how to handle a response partly from the URL.

**The viewer draws to a canvas instead of using `<iframe>`/`<object>`.** iOS
Safari does not reliably render a PDF inline from either: it commonly shows a
blank box, or the first page with no way to scroll. Since a QR code is
overwhelmingly scanned on a phone, the built-in viewers are exactly the case we
cannot depend on. `PdfViewer` renders one page at a time via pdf.js — react-pdf
does not virtualise, so rendering every page of a long document would hold a
full-resolution canvas per page and kill the tab on a mid-range phone. The plain
"Open / Download PDF" link is always present, not just as a fallback.

**URL shares ask before redirecting.** A QR code shows the scanner nothing about
where it leads, so `/v/{slug}` displays the destination host and a "Continue to
link" button rather than bouncing them to a third-party site they never agreed
to visit. It also keeps the view counter honest.

**Uploads are validated by their bytes, not their headers.** `File.type` is
whatever the client claims, so `validateUpload` sniffs magic bytes and stores
the sniffed type. SVG is rejected outright, since an SVG can carry script.

**Share links are unguessable, not private.** ~50 bits of entropy in the slug
keeps them from being enumerated, but anyone holding a link can view the
content.

**The QR stays dark-on-white in dark mode.** Scanners need the light quiet zone;
inverting it makes some phone cameras fail.

## Known gotcha: Cloudinary blocks PDF delivery by default

Most Cloudinary accounts ship with PDF and ZIP **delivery** disabled. The upload
succeeds and the asset is visible in the dashboard, but fetching its
`secure_url` returns **401**, and the in-page viewer falls back to its error
state.

Fix it in the dashboard — there is no code workaround short of proxying every
file through this server, which is not implemented on purpose:

> **Cloudinary Dashboard → Settings → Security → enable "Allow delivery of PDF
> and ZIP files"**

`npm run verify:connections` fetches a freshly uploaded PDF specifically to
catch this, and names the setting in its failure output.

## Going to production

**Provision separate accounts first.** The credentials in `.env.local` are dev
accounts shared with another project; a production deploy must not touch them.
Once this app has its own cluster and cloud, only `.env.local` changes — the
code already reads everything from the environment.

Then note that:

- `NEXT_PUBLIC_SITE_URL` must be the real domain **before** any QR is generated.
- Cloudinary assets are `access_mode: public`, so share expiry is not enforced
  on the file itself: anyone holding a `secure_url` keeps access after the
  share expires. Switch to authenticated/signed delivery if that matters.
- Nothing garbage-collects orphaned Cloudinary assets beyond the rollback in the
  create route.

## Environment notes

- **`mongodb` is in `serverExternalPackages`** (`next.config.ts`): it pulls in
  optional dependencies a bundler cannot statically resolve.
- **The pdf.js worker is a build artifact.** `scripts/sync-pdf-worker.mjs` copies
  it from `node_modules` into `public/` on every dev/build so it stays pinned to
  the installed `pdfjs-dist`; a mismatch is a hard runtime error. It is
  gitignored for that reason.
- **`sharp`'s install script is blocked by npm 12** (`allowScripts`). It is an
  optional Next.js image-optimisation dependency that this app never uses — the
  viewer serves images with a plain `<img>` from Cloudinary — so the warning is
  safe to ignore. Approve it with `npm install-scripts approve sharp` only if
  you start using `next/image` optimisation.
- **TypeScript is pinned to `~5.9`.** TypeScript 7 breaks Next.js 15's config
  loader (`Cannot read properties of undefined (reading 'fileExists')`).

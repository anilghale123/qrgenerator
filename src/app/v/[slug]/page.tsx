import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PdfViewer from '@/components/PdfViewerClient';
import { formatBytes } from '@/lib/config';
import { loadDocument, recordView } from '@/lib/documents';

// Every visit reads the database and bumps a counter, so this page must never
// be cached or prerendered.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shared document',
  // Share links are unguessable but not secret. Keeping crawlers out stops
  // shared content from ending up in a search index.
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ slug: string }> };

export default async function ViewPage({ params }: PageProps) {
  const { slug } = await params;

  const record = await loadDocument(slug);
  if (!record) notFound();

  await recordView(record.slug);

  return (
    // max-w-3xl and generous touch targets: this page is reached by scanning a
    // QR code, so a phone is the primary target, not a fallback.
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={record.originalName ?? undefined}>
            {record.originalName ?? 'Shared link'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shared {record.createdAt.toLocaleDateString()}
            {record.size ? ` · ${formatBytes(record.size)}` : ''}
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Create your own
        </Link>
      </header>

      {record.type === 'PDF' ? (
        <PdfViewer url={record.secureUrl!} name={record.originalName ?? 'document.pdf'} />
      ) : null}
      {record.type === 'IMAGE' ? (
        <ImageView url={record.secureUrl!} name={record.originalName ?? 'image'} />
      ) : null}
      {record.type === 'URL' ? <UrlView target={record.targetUrl!} /> : null}
    </main>
  );
}

function ImageView({ url, name }: { url: string; name: string }) {
  return (
    <div className="flex flex-col gap-3">
      {/*
        Plain <img>, not next/image: the source is arbitrary user content of
        unknown dimensions on a third-party CDN that already serves it
        optimised, so the Next optimiser would add a hop and a sharp dependency
        for no benefit.
      */}
      <img
        src={url}
        alt={name}
        className="mx-auto max-h-[80vh] w-full rounded-xl border border-slate-200 bg-white object-contain dark:border-slate-800 dark:bg-slate-900"
      />
      <a
        href={url}
        download={name}
        className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Download
      </a>
    </div>
  );
}

/**
 * UX DECISION — manual hand-off, not an automatic redirect.
 *
 * A QR code gives the scanner no preview of where it leads, so bouncing them
 * straight to a third-party site means they land somewhere they never agreed to
 * go. Showing the destination first is also what makes the counter honest.
 */
function UrlView({ target }: { target: string }) {
  const host = safeHost(target);

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span aria-hidden className="text-3xl">
        🔗
      </span>
      <div className="flex w-full flex-col gap-1">
        <p className="text-sm text-slate-600 dark:text-slate-400">This QR code leads to</p>
        <p className="text-lg font-semibold break-all">{host}</p>
        <p className="text-xs break-all text-slate-500 dark:text-slate-500">{target}</p>
      </div>
      <a
        href={target}
        // noreferrer also implies noopener, so the destination cannot reach
        // back into this tab via window.opener.
        rel="noreferrer nofollow"
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 sm:w-auto sm:px-8"
      >
        Continue to link
      </a>
      <p className="text-xs text-slate-500 dark:text-slate-500">
        Only continue if you trust whoever shared this code.
      </p>
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

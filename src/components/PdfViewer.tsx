'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/**
 * In-page PDF viewer built on pdf.js canvas rendering.
 *
 * WHY NOT <iframe>/<object>: iOS Safari does not reliably render a PDF inline
 * from either — it commonly shows a blank box, or only the first page with no
 * way to scroll. Since a QR code is overwhelmingly scanned on a phone, the
 * built-in viewers are exactly the case we cannot depend on. pdf.js draws to a
 * canvas we control, which behaves the same everywhere.
 *
 * The plain "Open / Download" link is always rendered, never only as a
 * fallback: it is the escape hatch when rendering fails *and* the way someone
 * saves the file.
 */

// Served from public/, kept in lockstep with the installed pdfjs-dist by
// scripts/sync-pdf-worker.mjs. A version mismatch here is a hard runtime error.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

type Props = {
  url: string;
  name: string;
};

export default function PdfViewer({ url, name }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [failed, setFailed] = useState(false);

  // Render at the container's real pixel width so the page fills a phone screen
  // without the user pinch-zooming. Re-measured on rotate and resize.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => setWidth(element.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onLoad = useCallback(({ numPages }: { numPages: number }) => {
    setPageCount(numPages);
    setPageNumber((current) => Math.min(current, numPages));
    setFailed(false);
  }, []);

  const goTo = useCallback(
    (delta: number) => {
      setPageNumber((current) => Math.min(Math.max(current + delta, 1), pageCount || 1));
      // Jump back to the top of the canvas — without this, paging forward on a
      // phone leaves you halfway down the new page.
      containerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [pageCount],
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="min-h-[60vh] w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800"
      >
        {failed ? (
          <ViewerError url={url} />
        ) : (
          <Document
            file={url}
            onLoadSuccess={onLoad}
            onLoadError={() => setFailed(true)}
            onSourceError={() => setFailed(true)}
            loading={<Placeholder>Loading document…</Placeholder>}
            error={<ViewerError url={url} />}
            className="flex justify-center"
          >
            {/*
              One page at a time rather than a continuous scroll: react-pdf does
              not virtualise, so rendering every page of a long document would
              hold a full-resolution canvas per page in memory — which is what
              actually kills the tab on a mid-range phone.
            */}
            {width > 0 ? (
              <Page
                pageNumber={pageNumber}
                width={width}
                // Match the screen's pixel density so text is not soft on a
                // phone's 2x/3x display.
                devicePixelRatio={typeof window === 'undefined' ? 1 : window.devicePixelRatio}
                renderAnnotationLayer
                renderTextLayer
                loading={<Placeholder>Rendering page…</Placeholder>}
              />
            ) : null}
          </Document>
        )}
      </div>

      {pageCount > 1 && !failed ? (
        <nav className="flex items-center justify-center gap-4" aria-label="Page navigation">
          <button
            type="button"
            onClick={() => goTo(-1)}
            disabled={pageNumber <= 1}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40 dark:border-slate-700"
          >
            Previous
          </button>
          <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400" aria-live="polite">
            Page {pageNumber} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goTo(1)}
            disabled={pageNumber >= pageCount}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40 dark:border-slate-700"
          >
            Next
          </button>
        </nav>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open PDF
        </a>
        <a
          href={url}
          download={name}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Download
        </a>
      </div>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8 text-sm text-slate-500 dark:text-slate-400">
      {children}
    </div>
  );
}

/**
 * Shown when pdf.js cannot fetch or parse the file.
 *
 * The overwhelmingly common cause in this app is Cloudinary's account-level
 * "Allow delivery of PDF and ZIP files" setting being off, which turns the
 * delivery URL into a 401/403. The copy stays user-facing; the operator-facing
 * hint is in the README and the server logs.
 */
function ViewerError({ url }: { url: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-slate-600 dark:text-slate-400">This PDF couldn&rsquo;t be displayed here.</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Open the PDF directly
      </a>
    </div>
  );
}

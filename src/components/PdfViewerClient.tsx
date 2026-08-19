'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only wrapper around PdfViewer.
 *
 * pdf.js reaches for browser globals (DOMMatrix, canvas, Path2D) at module
 * scope, so it cannot be evaluated during SSR. `ssr: false` is only permitted
 * inside a Client Component, which is the entire reason this one-line file
 * exists between the server page and the viewer.
 */
const PdfViewer = dynamic(() => import('./PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      Loading viewer…
    </div>
  ),
});

export default PdfViewer;

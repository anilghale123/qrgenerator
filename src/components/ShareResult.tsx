'use client';

import { CopyButton } from '@/components/CopyButton';
import { qrFileName } from '@/lib/qr';
import type { CreateShareResponse } from '@/lib/types';

type Props = {
  result: CreateShareResponse;
  onReset: () => void;
};

const TYPE_LABEL: Record<CreateShareResponse['type'], string> = {
  PDF: 'PDF',
  IMAGE: 'Photo',
  URL: 'Link',
};

export function ShareResult({ result, onReset }: Props) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {TYPE_LABEL[result.type]} ready to share
        </span>
        <p className="mt-2 max-w-full truncate text-sm text-slate-600 dark:text-slate-400" title={result.label}>
          {result.label}
        </p>
      </div>

      {/*
        The QR keeps its white plate in dark mode on purpose: scanners need the
        light quiet zone around the code, and inverting it makes some phone
        cameras fail. Rendered with <img> rather than next/image because the
        source is a data URL that needs no optimisation.
      */}
      <img
        src={result.qrDataUrl}
        alt={`QR code linking to ${result.viewUrl}`}
        width={256}
        height={256}
        className="h-56 w-56 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:h-64 sm:w-64 dark:ring-slate-700"
      />

      <div className="flex w-full flex-col gap-2">
        <label htmlFor="share-link" className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Shareable link
        </label>
        <div className="flex gap-2">
          <input
            id="share-link"
            readOnly
            value={result.viewUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <CopyButton value={result.viewUrl} />
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <a
          href={result.qrDataUrl}
          download={qrFileName(result.slug)}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-500"
        >
          Download QR (PNG)
        </a>
        <a
          href={result.viewUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Open viewer
        </a>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline dark:text-slate-400"
      >
        Share something else
      </button>
    </div>
  );
}

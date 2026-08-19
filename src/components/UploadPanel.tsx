'use client';

import { useState } from 'react';
import { FileDropzone } from '@/components/FileDropzone';
import { ShareResult } from '@/components/ShareResult';
import { compressPdfClient } from '@/lib/compress-client';
import type { ApiError, CreateShareResponse } from '@/lib/types';
import { validateUrl } from '@/lib/validation';

/** Tab identity doubles as the `mode` field the API switches on. */
const TABS = [
  { id: 'pdf', label: 'Upload PDF' },
  { id: 'image', label: 'Upload photo' },
  { id: 'url', label: 'Paste URL' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function UploadPanel() {
  const [tab, setTab] = useState<TabId>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateShareResponse | null>(null);

  function switchTab(next: TabId) {
    setTab(next);
    // Carrying a staged file or a typed URL across tabs would let someone
    // submit input they can no longer see.
    setFile(null);
    setUrl('');
    setError('');
  }

  function reset() {
    setResult(null);
    setFile(null);
    setUrl('');
    setError('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const body = new FormData();
    body.set('mode', tab);

    if (tab === 'url') {
      const validated = validateUrl(url);
      if (!validated.ok) {
        setError(validated.error);
        return;
      }
      body.set('url', validated.value);
    } else {
      if (!file) {
        setError(tab === 'pdf' ? 'Choose a PDF first.' : 'Choose a photo first.');
        return;
      }

      // Compress PDFs before upload to stay under Vercel's 4.5 MB request limit
      const fileToUpload = tab === 'pdf' ? await compressPdfClient(file) : file;
      body.set('file', fileToUpload);
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/shares', { method: 'POST', body });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiError | null;
        setError(payload?.error ?? `Upload failed (${response.status}).`);
        return;
      }

      setResult((await response.json()) as CreateShareResponse);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ShareResult result={result} onReset={reset} />;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div role="tablist" aria-label="What do you want to share?" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
        {TABS.map((entry) => {
          const selected = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => switchTab(entry.id)}
              disabled={submitting}
              className={[
                'rounded-lg px-2 py-2 text-sm font-medium transition-colors disabled:opacity-60',
                selected
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
              ].join(' ')}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {tab === 'url' ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="url-input" className="text-sm font-medium">
            Link to share
          </label>
          <input
            id="url-input"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="example.com/page"
            value={url}
            disabled={submitting}
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError('');
            }}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The QR points at this app, which then forwards to your link &mdash; so you can see how
            many times it was opened.
          </p>
        </div>
      ) : (
        <FileDropzone
          kind={tab === 'pdf' ? 'PDF' : 'IMAGE'}
          file={file}
          onSelect={setFile}
          onReject={setError}
          disabled={submitting}
        />
      )}

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Generating…' : 'Generate QR code'}
      </button>
    </form>
  );
}

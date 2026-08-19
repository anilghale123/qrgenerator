'use client';

import { useId, useRef, useState, useEffect } from 'react';
import { IMAGE_ACCEPT, PDF_ACCEPT, MAX_UPLOAD_LABEL, formatBytes } from '@/lib/config';
import { compressPdfClient } from '@/lib/compress-client';
import { validateFileMetadata, type UploadKind } from '@/lib/validation';

type Props = {
  kind: UploadKind;
  file: File | null;
  onSelect: (file: File | null) => void;
  onReject: (message: string) => void;
  disabled?: boolean;
};

/**
 * Drag-and-drop plus click-to-browse.
 *
 * The same validateFileMetadata used by the API runs here too, purely so an
 * obviously-wrong file fails instantly instead of after a 10MB upload. The
 * server repeats every check — this is a convenience, not a control.
 */
export function FileDropzone({ kind, file, onSelect, onReject, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setDraggingOver] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const inputId = useId();

  // Compress PDF when selected (for PDFs only)
  useEffect(() => {
    if (!file || kind !== 'PDF') {
      setCompressedSize(null);
      return;
    }

    setIsCompressing(true);
    compressPdfClient(file)
      .then((compressed) => {
        setCompressedSize(compressed.size);
      })
      .catch(() => {
        setCompressedSize(null);
      })
      .finally(() => {
        setIsCompressing(false);
      });
  }, [file, kind]);

  const accept = kind === 'PDF' ? PDF_ACCEPT : IMAGE_ACCEPT;
  const noun = kind === 'PDF' ? 'PDF' : 'image';

  function handleCandidate(candidate: File | undefined) {
    if (!candidate) return;

    const result = validateFileMetadata(candidate, kind);
    if (!result.ok) {
      onReject(result.error);
      onSelect(null);
      return;
    }

    onReject('');
    onSelect(candidate);
  }

  function clear() {
    onSelect(null);
    onReject('');
    // Without this, re-picking the same file fires no change event.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDraggingOver(true);
        }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDraggingOver(false);
          if (disabled) return;
          handleCandidate(event.dataTransfer.files[0]);
        }}
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDraggingOver
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
            : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-slate-900',
          disabled ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <span aria-hidden className="text-2xl">
          {kind === 'PDF' ? '📄' : '🖼️'}
        </span>
        <span className="text-sm font-medium">
          Drop {kind === 'PDF' ? 'a PDF' : 'a photo'} here, or <span className="text-indigo-600 dark:text-indigo-400">browse</span>
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {kind === 'PDF' ? 'PDF only' : 'PNG, JPEG, WebP, GIF or AVIF'} &middot; up to {MAX_UPLOAD_LABEL}
        </span>

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => handleCandidate(event.target.files?.[0])}
        />
      </label>

      {file ? (
        <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={file.name}>
              {file.name}
            </span>
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              className="ml-2 shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Remove
            </button>
          </div>

          {/* Show compression info for PDFs */}
          {kind === 'PDF' && (
            <div className="space-y-2 rounded bg-white p-2 text-xs dark:bg-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Original:</span>
                <span className="font-mono font-semibold">{formatBytes(file.size)}</span>
              </div>

              {isCompressing ? (
                <div className="text-slate-600 dark:text-slate-400">Compressing...</div>
              ) : compressedSize ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Compressed:</span>
                    <span className="font-mono font-semibold">{formatBytes(compressedSize)}</span>
                  </div>
                  <div className="flex justify-between rounded bg-green-100 px-2 py-1 text-green-900 dark:bg-green-900 dark:text-green-100">
                    <span>Reduction:</span>
                    <span className="font-semibold">
                      {((100 - (compressedSize / file.size) * 100).toFixed(1))}%
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* For images, just show size */}
          {kind !== 'PDF' && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {formatBytes(file.size)}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

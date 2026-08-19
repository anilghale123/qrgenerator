'use client';

import { useState } from 'react';
import { compressPdfClient } from '@/lib/compress-client';
import { formatBytes } from '@/lib/config';

export default function DebugCompressionPage() {
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setOriginalSize(file.size);
    setCompressedSize(null);
    setIsCompressing(true);

    try {
      const compressed = await compressPdfClient(file);
      setCompressedSize(compressed.size);
    } catch (error) {
      console.error('Compression failed:', error);
      setCompressedSize(null);
    } finally {
      setIsCompressing(false);
    }
  }

  const reduction = originalSize && compressedSize
    ? (100 - (compressedSize / originalSize) * 100).toFixed(1)
    : null;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">PDF Compression Demo</h1>

      <div className="rounded-lg border border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900">
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-medium">Select a PDF to test compression:</span>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="block w-full"
          />
        </label>

        {fileName && (
          <div className="space-y-4">
            <div className="rounded-lg bg-white p-4 dark:bg-slate-800">
              <p className="mb-2 font-medium">{fileName}</p>

              {isCompressing ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">Compressing...</p>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-600 dark:text-slate-400">Original:</p>
                      <p className="font-mono font-semibold">
                        {originalSize ? formatBytes(originalSize) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-600 dark:text-slate-400">Compressed:</p>
                      <p className="font-mono font-semibold">
                        {compressedSize ? formatBytes(compressedSize) : '-'}
                      </p>
                    </div>
                  </div>

                  {reduction !== null && (
                    <div className="rounded bg-indigo-100 p-3 dark:bg-indigo-900">
                      <p className="font-semibold text-indigo-900 dark:text-indigo-100">
                        ✓ Reduction: {reduction}%
                      </p>
                      <p className="text-sm text-indigo-800 dark:text-indigo-200">
                        This compressed file will upload to the server successfully, even if the original was over 4.5 MB.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-900 dark:text-blue-100">
              <p className="font-semibold">How compression works:</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Compression happens in your browser (client-side)</li>
                <li>Metadata and stream encoding are optimized</li>
                <li>Compressed file is sent to the server</li>
                <li>Server also compresses as a failsafe</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
        This page is for testing. In production, compression happens automatically when you upload a PDF.
      </p>
    </main>
  );
}

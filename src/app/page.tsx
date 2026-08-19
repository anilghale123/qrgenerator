import { UploadPanel } from '@/components/UploadPanel';
import { MAX_UPLOAD_LABEL } from '@/lib/config';

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Share anything with a QR code
        </h1>
        <p className="text-pretty text-slate-600 dark:text-slate-400">
          Upload a PDF or a photo, or paste a link. You&rsquo;ll get a QR code that opens it on any
          phone &mdash; up to {MAX_UPLOAD_LABEL} per file.
        </p>
      </header>

      <UploadPanel />

      <footer className="text-center text-xs text-slate-500 dark:text-slate-500">
        Anyone with the link or QR code can view the content. Don&rsquo;t share anything sensitive.
      </footer>
    </main>
  );
}

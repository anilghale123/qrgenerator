import Link from 'next/link';

/**
 * One page for every failure mode — missing, malformed and expired alike.
 * Distinguishing them would tell a stranger holding a guessed slug whether it
 * ever existed.
 */
export default function ShareNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span aria-hidden className="text-4xl">
        🔍
      </span>
      <h1 className="text-xl font-semibold">This link isn&rsquo;t available</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The QR code may have expired, or the share was removed.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Create your own
      </Link>
    </main>
  );
}

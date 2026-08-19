'use client';

import { useEffect, useState } from 'react';

type Props = {
  value: string;
  className?: string;
};

export function CopyButton({ value, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      // Requires a secure context; localhost counts, plain-HTTP LAN IPs do not,
      // which is exactly when someone is testing with a phone — hence the
      // execCommand fallback below.
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      const scratch = document.createElement('textarea');
      scratch.value = value;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      try {
        setCopied(document.execCommand('copy'));
      } catch {
        setCopied(false);
      }
      document.body.removeChild(scratch);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ||
        'shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
      }
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

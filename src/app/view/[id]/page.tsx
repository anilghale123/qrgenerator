import { permanentRedirect } from 'next/navigation';

/**
 * Compatibility redirect for links minted before the route moved to /v/[slug].
 *
 * QR codes are printed, pasted into documents and stuck on walls — a code
 * generated against the old path cannot be re-issued, so this route has to keep
 * answering. 308 rather than 302 so scanners and caches learn the new location.
 */
export default async function LegacyViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/v/${id}`);
}

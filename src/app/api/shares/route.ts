import { NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/config';
import { createDocument, type DocumentRecord } from '@/lib/documents';
import { newSlug } from '@/lib/ids';
import { renderQrPngDataUrl } from '@/lib/qr';
import { putObject, removeObject } from '@/lib/storage';
import type { ApiError, CreateShareResponse, ShareType } from '@/lib/types';
import { validateUpload, validateUrl, type UploadKind } from '@/lib/validation';

// The Cloudinary SDK and the Mongo driver both need real Node APIs.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Form `mode` values accepted from the upload UI. */
const FILE_MODES: Record<string, UploadKind> = {
  pdf: 'PDF',
  image: 'IMAGE',
};

function errorResponse(message: string, status: number) {
  return NextResponse.json<ApiError>({ error: message }, { status });
}

/** Compact label for the confirmation screen: "invoice.pdf" or "example.com/pricing". */
function labelForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.host}${path}`.slice(0, 80);
  } catch {
    return url.slice(0, 80);
  }
}

/** Field defaults shared by every document, so no branch can forget one. */
function baseRecord(slug: string, type: ShareType): DocumentRecord {
  return {
    slug,
    type,
    targetUrl: null,
    publicId: null,
    resourceType: null,
    secureUrl: null,
    originalName: null,
    mimeType: null,
    size: null,
    createdAt: new Date(),
    expiresAt: null,
    viewCount: 0,
  };
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('Could not read the submitted form.', 400);
  }

  const mode = String(formData.get('mode') ?? '');
  const slug = newSlug();
  const siteUrl = resolveSiteUrl(request);
  if (!siteUrl) {
    return errorResponse('Server could not determine its own address. Set NEXT_PUBLIC_SITE_URL.', 500);
  }

  let type: ShareType;
  let label: string;

  if (mode === 'url') {
    const validated = validateUrl(String(formData.get('url') ?? ''));
    if (!validated.ok) return errorResponse(validated.error, 400);

    type = 'URL';
    label = labelForUrl(validated.value);
    await createDocument({ ...baseRecord(slug, type), targetUrl: validated.value });
  } else if (mode in FILE_MODES) {
    const kind = FILE_MODES[mode];
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return errorResponse('No file was received.', 400);
    }

    const validated = await validateUpload(file, kind);
    if (!validated.ok) {
      // 413 specifically for size so the client can distinguish it; everything
      // else is a plain rejection.
      const status = validated.error.includes('limit is') ? 413 : 400;
      return errorResponse(validated.error, status);
    }

    const { bytes, mimeType, originalName, size } = validated.value;
    const stored = await putObject({ data: bytes, mimeType, keyHint: slug });

    try {
      await createDocument({
        ...baseRecord(slug, kind),
        publicId: stored.publicId,
        resourceType: stored.resourceType,
        secureUrl: stored.secureUrl,
        originalName,
        mimeType,
        size,
      });
    } catch (error) {
      // The asset is already in Cloudinary; without this it would linger in the
      // shared account with nothing pointing at it. Safe by construction — the
      // public_id came from putObject, which asserts it is inside our folder.
      await removeObject(stored.publicId, stored.resourceType).catch(() => {});
      throw error;
    }

    type = kind;
    label = originalName;
  } else {
    return errorResponse('Choose a PDF, a photo, or a URL to share.', 400);
  }

  const viewUrl = `${siteUrl}/v/${slug}`;
  const qrDataUrl = await renderQrPngDataUrl(viewUrl);

  return NextResponse.json<CreateShareResponse>({ slug, type, viewUrl, qrDataUrl, label }, { status: 201 });
}

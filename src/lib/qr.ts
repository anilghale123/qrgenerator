import QRCode from 'qrcode';

/**
 * Renders a share URL as a PNG data URL.
 *
 * Colours are hard-coded dark-on-white rather than themed: scanners rely on
 * contrast and on the light quiet zone, so a QR that followed the page into
 * dark mode would become slower to read — or unreadable — on some phones.
 * Error-correction level M tolerates a printed code getting scuffed while
 * keeping the modules large enough to scan from a screen.
 */
export function renderQrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 512,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/** Filename offered when the user downloads the QR image. */
export function qrFileName(slug: string): string {
  return `qr-${slug}.png`;
}

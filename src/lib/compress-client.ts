import { PDFDocument } from 'pdf-lib';

/**
 * Compress a PDF in the browser before upload.
 *
 * Removes metadata and re-encodes streams to reduce file size, keeping it under
 * Vercel's 4.5 MB request limit. Runs on the client so large files are compressed
 * before they reach the network.
 *
 * Returns a new File object with the compressed bytes.
 * If compression fails, returns the original file (best effort).
 */
export async function compressPdfClient(file: File): Promise<File> {
  // Only compress PDFs
  if (file.type !== 'application/pdf') {
    return file;
  }

  try {
    const bytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(bytes);

    // Remove metadata that adds weight without affecting viewing
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setProducer('qrgen');
    doc.setCreator('');

    // Re-encode the PDF, which often results in a more compact representation
    const compressed = await doc.save();

    // Return as a new File with the same name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new File([compressed as any], file.name, { type: file.type });
  } catch (error) {
    // If compression fails, just return the original file
    console.warn('PDF compression failed, uploading original:', error);
    return file;
  }
}

/**
 * Text extraction for memo files. PDF and DOCX libraries are lazy-loaded so they never weigh on first paint.
 * Extraction only produces text; it never classifies or attaches anything.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // Text extraction only: no rendering, no scripting, no font loading.
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, enableXfa: false });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let last: number | null = null;
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5] as number;
      if (last !== null && Math.abs(y - last) > 2) text += '\n';
      text += item.str;
      if (item.hasEOL) text += '\n';
      last = y;
    }
    pages.push(text);
  }
  await task.destroy();
  return pages.join('\n\n');
}

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth');
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return res.value;
}

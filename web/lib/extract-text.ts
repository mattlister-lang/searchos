import "server-only";

/**
 * The one text-extraction implementation (engineering.md §2 — never a second
 * copy). Used by uploadDocument (document.parsed_text at upload) and by the
 * CV-first creation flow (I1), which feeds the same text to Claude for
 * structured extraction. Pure JS, no AI spend.
 */
export async function extractText(file: File): Promise<string | null> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await pdfText(doc, { mergePages: true });
      return text?.trim() || null;
    }
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return value?.trim() || null;
    }
    if (file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
      return buffer.toString("utf8").trim() || null;
    }
    return null; // unknown format: file is stored, text extraction skipped
  } catch {
    return null; // parse failure never blocks the upload
  }
}

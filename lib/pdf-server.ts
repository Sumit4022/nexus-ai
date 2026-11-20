// Register PDF.js's worker handler in this Node process up front. PDF.js uses
// this handler for server-side parsing, avoiding a browser URL or a dynamic
// worker import that Next.js may try to resolve as an application route.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PDF_PAGES = 500;

export interface ExtractedPdf {
    text: string;
    pageCount: number;
    pagesWithoutText: number[];
}

/** Server-side text extraction using PDF.js's packaged Node worker. */
export async function extractPdfText(file: File, signal?: AbortSignal): Promise<ExtractedPdf> {
    const maxFileSize = 20 * 1024 * 1024;
    if (file.size === 0) throw new Error("The selected PDF is empty.");
    if (file.size > maxFileSize) throw new Error("The PDF must be 20 MB or smaller.");

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new Error("Please select a valid PDF file.");

    const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;

    try {
        if (pdf.numPages > MAX_PDF_PAGES) {
            throw new Error(`This PDF has ${pdf.numPages} pages. The current limit is ${MAX_PDF_PAGES} pages.`);
        }

        const pages: string[] = [];
        const pagesWithoutText: number[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            const pageText = content.items
                .filter((item): item is typeof item & { str: string } => "str" in item && typeof item.str === "string")
                .map((item) => item.str)
                .join(" ");

            if (!pageText.trim()) pagesWithoutText.push(pageNumber);
            pages.push(`Page ${pageNumber}\n${pageText}`);
        }

        return {
            text: pagesWithoutText.length === pdf.numPages ? "" : pages.join("\n\n").trim(),
            pageCount: pdf.numPages,
            pagesWithoutText,
        };
    } finally {
        await loadingTask.destroy();
    }
}

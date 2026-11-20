import {
    GlobalWorkerOptions,
    getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

export const MAX_PDF_PAGES = 500;

export interface ExtractedPdf {
    text: string;
    pageCount: number;
    pagesWithoutText: number[];
}

export type RenderedPdfPage = {
    pageNumber: number;
    image: File;
}

export async function extractPdfText(file: File, signal?: AbortSignal): Promise<ExtractedPdf> {
    const MAX_FILE_SIZE = 20 * 1024 * 1024;

    if (file.size === 0) {
        throw new Error("The selected PDF is empty.");
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error("The PDF must be 20 MB or smaller.");
    }

    const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
        throw new Error("Please select a valid PDF file.");
    }

    const buffer = await file.arrayBuffer();

    const loadingTask = getDocument({
        data: new Uint8Array(buffer),
    });

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
                .filter(
                    (item): item is typeof item & { str: string } =>
                        "str" in item && typeof item.str === "string"
                )
                .map((item) => item.str)
                .join(" ");

            if (!pageText.trim()) pagesWithoutText.push(pageNumber);

            pages.push(`Page ${pageNumber}\n${pageText}`);
        }

        const text = pagesWithoutText.length === pdf.numPages ? "" : pages.join("\n\n").trim();

        return {
            text,
            pageCount: pdf.numPages,
            pagesWithoutText,
        };
    } finally {
        await loadingTask.destroy();
    }
}

export async function* renderPdfPagesForOcr(
    file: File,
    pageNumbers: number[],
    signal: AbortSignal,
): AsyncGenerator<RenderedPdfPage> {
    const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;

    try {
        for (const pageNumber of pageNumbers) {
            if (signal.aborted) throw new DOMException("Request cancelled", "AbortError");
            if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) continue;

            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = Math.min(1.5, 1200 / baseViewport.width, 1600 / baseViewport.height);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Could not prepare a scanned PDF page for OCR.");

            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not encode a scanned PDF page.")), "image/jpeg", 0.68);
            });
            const image = new File([blob], `page-${pageNumber}.jpg`, { type: "image/jpeg" });
            canvas.width = 0;
            canvas.height = 0;
            yield { pageNumber, image };
        }
    } finally {
        await loadingTask.destroy();
    }
}

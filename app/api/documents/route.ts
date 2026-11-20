import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { extractExcelContent } from "@/lib/extractors/excel";
import { extractPdfText } from "@/lib/pdf-server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 300_000;
const MAX_OCR_PAYLOAD_SIZE = 2 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + MAX_OCR_PAYLOAD_SIZE + 128 * 1024;
const MAX_DOCUMENT_PAGE_SIZE = 100;
const MAX_OCR_PAGES = 20;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "csv", "xlsx"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedClient() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return { supabase, user: error ? null : user };
}

export async function GET(request: Request) {
    try {
        const { supabase, user } = await authenticatedClient();
        if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

        const searchParams = new URL(request.url).searchParams;
        const page = Number(searchParams.get("page") ?? "1");
        const pageSize = Number(searchParams.get("limit") ?? "50");
        const searchTerm = (searchParams.get("q") ?? "").trim();
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_DOCUMENT_PAGE_SIZE) {
            return NextResponse.json({ error: `Page must be positive and limit must be between 1 and ${MAX_DOCUMENT_PAGE_SIZE}.` }, { status: 400 });
        }
        if (searchTerm.length > 100) return NextResponse.json({ error: "Keep document search under 100 characters." }, { status: 400 });

        let documentQuery = supabase
            .from("knowledge_documents")
            .select("id, name, mime_type, created_at", { count: "exact" })
            .eq("user_id", user.id);
        if (searchTerm) {
            const escapedSearch = searchTerm.replace(/[\\%_]/g, "\\$&");
            documentQuery = documentQuery.ilike("name", `%${escapedSearch}%`);
        }
        const { data, count, error } = await documentQuery
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range((page - 1) * pageSize, page * pageSize - 1);
        if (error) throw error;
        const totalCount = count ?? 0;
        return NextResponse.json({
            documents: data ?? [],
            page,
            pageSize,
            totalCount,
            hasMore: page * pageSize < totalCount,
        }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Could not list knowledge documents:", error);
        return NextResponse.json({ error: "Could not load documents. Apply the knowledge database migration and try again." }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { supabase, user } = await authenticatedClient();
        if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
        const contentLength = Number(request.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
            return NextResponse.json({ error: "The PDF and its OCR text exceed the upload size limit." }, { status: 413 });
        }
        const form = await request.formData();
        const value = form.get("file");
        if (!(value instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
        if (value.size === 0) return NextResponse.json({ error: "The selected file is empty." }, { status: 400 });
        if (value.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });

        const extension = value.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXTENSIONS.has(extension)) {
            return NextResponse.json({ error: "Supported formats: PDF, DOCX, TXT, MD, CSV, and XLSX." }, { status: 415 });
        }

        const buffer = Buffer.from(await value.arrayBuffer());
        let content: string;
        let usedOcr = false;
        try {
            if (extension === "pdf") {
                const extracted = await extractPdfText(value, request.signal);
                content = extracted.text;
                if (extracted.pagesWithoutText.length > 0) {
                    if (extracted.pagesWithoutText.length > MAX_OCR_PAGES) {
                        return NextResponse.json({ error: `This PDF has ${extracted.pagesWithoutText.length} scanned pages. OCR supports up to ${MAX_OCR_PAGES} scanned pages per upload; split the PDF and retry.` }, { status: 413 });
                    }
                    const submittedPages = form.get("ocrPages");
                    let ocrPages: unknown = null;
                    if (typeof submittedPages === "string") {
                        if (new TextEncoder().encode(submittedPages).byteLength > MAX_OCR_PAYLOAD_SIZE) {
                            return NextResponse.json({ error: "The OCR text exceeds the upload size limit." }, { status: 413 });
                        }
                        try { ocrPages = JSON.parse(submittedPages); } catch { /* Return a clear validation error below. */ }
                    }
                    if (!Array.isArray(ocrPages) || ocrPages.length !== extracted.pagesWithoutText.length) {
                        return NextResponse.json({ error: "This PDF contains scanned pages. Enable OCR in the upload flow and retry." }, { status: 422 });
                    }
                    const recognizedPages = new Map<number, string>();
                    for (const item of ocrPages) {
                        if (!item || typeof item !== "object") return NextResponse.json({ error: "The scanned page text is invalid." }, { status: 400 });
                        const page = item as Record<string, unknown>;
                        if (!Number.isInteger(page.pageNumber) || typeof page.text !== "string" || !page.text.trim() || page.text.length > 20_000) {
                            return NextResponse.json({ error: "The scanned page text is invalid." }, { status: 400 });
                        }
                        recognizedPages.set(page.pageNumber as number, page.text.trim());
                    }
                    if (extracted.pagesWithoutText.some((pageNumber) => !recognizedPages.has(pageNumber))) {
                        return NextResponse.json({ error: "OCR is missing one or more scanned pages. Retry the upload." }, { status: 422 });
                    }
                    content = [
                        content,
                        ...extracted.pagesWithoutText.map((pageNumber) => `[Page ${pageNumber} — OCR]\n${recognizedPages.get(pageNumber)}`),
                    ].filter(Boolean).join("\n\n");
                    usedOcr = true;
                }
            } else if (extension === "docx") {
                content = (await mammoth.extractRawText({ buffer })).value;
            } else if (extension === "xlsx") {
                content = await extractExcelContent(buffer);
            } else {
                content = buffer.toString("utf8");
            }
        } catch (error) {
            if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
                return new Response(null, { status: 499 });
            }
            console.error("Document text extraction failed:", error);
            if (error instanceof Error && /current limit is \d+ pages/i.test(error.message)) {
                return NextResponse.json({ error: error.message }, { status: 413 });
            }
            return NextResponse.json({ error: "Could not read this file. Make sure it is a valid, unencrypted document. Scanned PDFs need OCR before their text can be searched." }, { status: 422 });
        }
        content = content.replace(/\u0000/g, "").trim();
        if (!content) return NextResponse.json({ error: "No readable text was found in this file." }, { status: 422 });
        const truncated = content.length > MAX_TEXT_LENGTH;
        if (truncated) {
            const marker = "\n[Document text truncated at 300,000 characters.]";
            content = `${content.slice(0, MAX_TEXT_LENGTH - marker.length)}${marker}`;
        }

        const { data, error } = await supabase.from("knowledge_documents").insert({
            user_id: user.id,
            name: value.name.slice(0, 255),
            mime_type: value.type || "application/octet-stream",
            content,
        }).select("id, name, mime_type, created_at").single();
        if (error) throw error;
        return NextResponse.json({ document: data, truncated, ocr: usedOcr }, { status: 201 });
    } catch (error) {
        console.error("Could not save knowledge document:", error);
        return NextResponse.json({ error: "Could not save this document. Check your storage setup and try again." }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { supabase, user } = await authenticatedClient();
        if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "The request body must contain valid JSON." }, { status: 400 });
        }
        const id = body && typeof body === "object" && "id" in body ? body.id : null;
        if (typeof id !== "string" || !UUID_REGEX.test(id)) return NextResponse.json({ error: "A valid document ID is required." }, { status: 400 });
        const { error } = await supabase.from("knowledge_documents").delete().eq("id", id).eq("user_id", user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Could not delete knowledge document:", error);
        return NextResponse.json({ error: "Could not delete the document." }, { status: 500 });
    }
}

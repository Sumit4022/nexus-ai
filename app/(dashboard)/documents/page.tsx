"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { extractPdfText, renderPdfPagesForOcr } from "@/lib/pdf";

type DocumentItem = { id: string; name: string; mime_type: string; created_at: string };
const DOCUMENT_PAGE_SIZE = 50;
const MAX_OCR_PAGES = 20;

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<DocumentItem[]>([]);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const uploadControllerRef = useRef<AbortController | null>(null);

    const loadDocuments = useCallback(async (search = "") => {
        setLoading(true); setError("");
        try {
            const params = new URLSearchParams({ page: "1", limit: String(DOCUMENT_PAGE_SIZE) });
            if (search) params.set("q", search);
            const response = await fetch(`/api/documents?${params}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not load documents.");
            setDocuments(Array.isArray(data.documents) ? data.documents : []);
            setTotalCount(typeof data.totalCount === "number" ? data.totalCount : 0);
            setPage(typeof data.page === "number" ? data.page : 1);
            setHasMore(data.hasMore === true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load documents.");
        } finally { setLoading(false); }
    }, []);

    async function loadMoreDocuments() {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        setError("");
        try {
            const nextPage = page + 1;
            const params = new URLSearchParams({ page: String(nextPage), limit: String(DOCUMENT_PAGE_SIZE) });
            if (activeSearch) params.set("q", activeSearch);
            const response = await fetch(`/api/documents?${params}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.documents)) throw new Error(data.error || "Could not load more documents.");
            setDocuments((current) => {
                const currentIds = new Set(current.map((document) => document.id));
                return [...current, ...data.documents.filter((document: DocumentItem) => !currentIds.has(document.id))];
            });
            setPage(typeof data.page === "number" ? data.page : nextPage);
            setTotalCount(typeof data.totalCount === "number" ? data.totalCount : totalCount);
            setHasMore(data.hasMore === true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load more documents.");
        } finally { setLoadingMore(false); }
    }

    useEffect(() => {
        const timer = window.setTimeout(() => { void loadDocuments(); }, 0);
        return () => window.clearTimeout(timer);
    }, [loadDocuments]);

    async function upload(event: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        await processFiles(files);
    }

    async function processFiles(files: File[]) {
        if (!files.length) return;
        setSearchInput(""); setActiveSearch("");
        setBusy(true); setError(""); setNotice("");
        const controller = new AbortController();
        uploadControllerRef.current = controller;
        const failures: string[] = [];
        const truncatedFiles: string[] = [];
        const ocrFiles: string[] = [];
        let uploaded = 0;
        let stopped = false;
        try {
            for (const [index, file] of files.entries()) {
                setUploadProgress(`Adding ${index + 1} of ${files.length}: ${file.name}`);
                try {
                    const form = new FormData(); form.set("file", file);
                    if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
                        const pdf = await extractPdfText(file, controller.signal);
                        if (pdf.pagesWithoutText.length > MAX_OCR_PAGES) {
                            throw new Error(`This PDF has ${pdf.pagesWithoutText.length} scanned pages. OCR supports up to ${MAX_OCR_PAGES} scanned pages per upload; split the PDF and retry.`);
                        }
                        if (pdf.pagesWithoutText.length > 0) {
                            const ocrPages: Array<{ pageNumber: number; text: string }> = [];
                            let pageIndex = 0;
                            for await (const renderedPage of renderPdfPagesForOcr(file, pdf.pagesWithoutText, controller.signal)) {
                                pageIndex += 1;
                                setUploadProgress(`Reading scanned page ${pageIndex} of ${pdf.pagesWithoutText.length}: ${file.name}`);
                                const ocrForm = new FormData();
                                ocrForm.set("image", renderedPage.image);
                                ocrForm.set("pageNumber", String(renderedPage.pageNumber));
                                const ocrResponse = await fetch("/api/documents/ocr-page", {
                                    method: "POST", body: ocrForm, signal: controller.signal,
                                });
                                const ocrData = await ocrResponse.json().catch(() => ({}));
                                if (!ocrResponse.ok) throw new Error(ocrData.error || `Could not read scanned page ${renderedPage.pageNumber}.`);
                                ocrPages.push({ pageNumber: renderedPage.pageNumber, text: ocrData.text });
                            }
                            form.set("ocrPages", JSON.stringify(ocrPages));
                        }
                    }
                    const response = await fetch("/api/documents", { method: "POST", body: form, signal: controller.signal });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Upload failed.");
                    uploaded += 1;
                    if (data.truncated) truncatedFiles.push(data.document?.name ?? file.name);
                    if (data.ocr) ocrFiles.push(data.document?.name ?? file.name);
                } catch (cause) {
                    if (cause instanceof DOMException && cause.name === "AbortError") {
                        stopped = true;
                        break;
                    }
                    failures.push(`${file.name}: ${cause instanceof Error ? cause.message : "Upload failed."}`);
                }
            }
            await loadDocuments("");
            if (uploaded) {
                const summary = `${uploaded} ${uploaded === 1 ? "document was" : "documents were"} added to your knowledge base.`;
                const details = [
                    truncatedFiles.length ? `Searchable text was shortened for: ${truncatedFiles.join(", ")}.` : "",
                    ocrFiles.length ? `Scanned pages were read with OCR in: ${ocrFiles.join(", ")}.` : "",
                ].filter(Boolean).join(" ");
                setNotice(`${summary}${details ? ` ${details}` : ""}`);
            }
            const uploadErrors = [
                ...failures,
                ...(stopped ? ["Upload stopped. Any files already completed were saved."] : []),
            ];
            if (uploadErrors.length) setError(uploadErrors.join(" "));
        } finally {
            if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
            setBusy(false); setUploadProgress("");
        }
    }

    async function remove(id: string) {
        if (!window.confirm("Delete this document from your knowledge base?")) return;
        setError("");
        try {
            const response = await fetch("/api/documents", {
                method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not delete document.");
            await loadDocuments(activeSearch);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete document."); }
    }

    function searchDocuments(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const search = searchInput.trim();
        setActiveSearch(search);
        void loadDocuments(search);
    }

    function clearSearch() {
        setSearchInput("");
        setActiveSearch("");
        void loadDocuments("");
    }

    return <main className="mx-auto max-w-6xl px-5 py-9 text-white sm:px-8 sm:py-10">
        <p className="eyebrow text-[10px] font-semibold uppercase">KNOWLEDGE BASE</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Documents</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Upload files to make their text searchable by your Knowledge Agent. Files are private to your account.</p>

        <section
            aria-label="Add documents"
            onDragEnter={(event) => {
                event.preventDefault();
                if (!busy) setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setIsDragging(false);
            }}
            onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (!busy) void processFiles(Array.from(event.dataTransfer.files));
            }}
            className={`mt-8 rounded-2xl border border-dashed p-8 text-center transition-colors ${isDragging ? "border-violet-300/60 bg-violet-400/[.08]" : "border-white/15 bg-white/[0.02]"}`}
        >
            <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx" className="hidden" onChange={upload} />
            <div className="text-3xl">📄</div>
            <h2 className="mt-3 font-medium">Add a document</h2>
            <p className="mt-2 text-sm text-gray-500">Choose files or drag them here. PDF, DOCX, TXT, Markdown, CSV, or Excel; maximum 10 MB per file. Scanned PDFs support OCR for up to {MAX_OCR_PAGES} pages.</p>
            <button type="button" onClick={() => busy ? uploadControllerRef.current?.abort() : inputRef.current?.click()}
                className="mt-5 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-200 disabled:opacity-50">
                {busy ? "Stop processing" : "Choose files"}
            </button>
            {uploadProgress && <p role="status" className="mt-3 text-xs text-violet-300">{uploadProgress}</p>}
        </section>

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-200">{notice}</p>}
        <div className="mt-8 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your documents</h2>
            <Link href="/agents/knowledge" className="text-sm text-violet-300 hover:text-violet-200">Ask Knowledge Agent →</Link>
        </div>
        <form onSubmit={searchDocuments} className="mt-4 flex gap-2">
            <label className="min-w-0 flex-1">
                <span className="sr-only">Search documents by file name</span>
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} placeholder="Search your documents by name…" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-violet-400/50" />
            </label>
            <button type="submit" disabled={loading} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50">Search</button>
            {activeSearch && <button type="button" onClick={clearSearch} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-400 hover:bg-white/5">Clear</button>}
        </form>
        {totalCount !== null && <p className="mt-2 text-xs text-gray-500">Showing {documents.length} of {totalCount} documents</p>}
        {loading ? <p className="mt-4 text-sm text-gray-500">Loading documents…</p> : documents.length === 0 ?
            <p className="mt-4 rounded-xl border border-white/10 p-5 text-sm text-gray-500">{activeSearch ? `No documents match “${activeSearch}”.` : "No documents yet. Upload a file to start building your knowledge base."}</p> :
            <ul className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
                {documents.map((document) => <li key={document.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{document.name}</p>
                        <p className="mt-1 text-xs text-gray-500">{new Date(document.created_at).toLocaleString()} · {document.mime_type}</p></div>
                    <button type="button" onClick={() => void remove(document.id)} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">Delete</button>
                </li>)}
            </ul>}
        {!loading && hasMore && <button type="button" onClick={() => void loadMoreDocuments()} disabled={loadingMore} className="mt-4 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 disabled:opacity-50">{loadingMore ? "Loading more documents…" : "Load more documents"}</button>}
    </main>;
}

"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { linkSourceCitations } from "@/lib/citations";
import { readAgentStream } from "@/lib/agent-stream";
import { activateAgentConversationId, getActiveAgentConversationId, getAgentConversationId, loadAgentConversation, saveAgentConversation, type AgentMessage } from "@/lib/agent-history";
import ResponseDownloads from "@/components/response-downloads";

type Source = { number: number; id: string; name: string; excerpt?: string };
type LibraryDocument = { id: string; name: string; mime_type: string; created_at: string };
const LIBRARY_PAGE_SIZE = 50;
const MAX_FOCUSED_DOCUMENTS = 20;

function documentKind(name: string, mimeType: string) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf" || mimeType === "application/pdf") return "PDF";
    if (["xlsx", "csv"].includes(extension)) return "DATA";
    if (extension === "docx") return "DOC";
    return "TEXT";
}

export default function KnowledgeAgentPage() {
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [sources, setSources] = useState<Source[]>([]);
    const [error, setError] = useState("");
    const [saveNotice, setSaveNotice] = useState("");
    const [loading, setLoading] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreFailed, setRestoreFailed] = useState(false);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [libraryDocuments, setLibraryDocuments] = useState<LibraryDocument[]>([]);
    const [libraryTotal, setLibraryTotal] = useState(0);
    const [libraryPage, setLibraryPage] = useState(1);
    const [libraryHasMore, setLibraryHasMore] = useState(false);
    const [libraryLoading, setLibraryLoading] = useState(true);
    const [libraryLoadingMore, setLibraryLoadingMore] = useState(false);
    const [libraryError, setLibraryError] = useState("");
    const [librarySearch, setLibrarySearch] = useState("");
    const [librarySearchInput, setLibrarySearchInput] = useState("");
    const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
    const requestController = useRef<AbortController | null>(null);
    const libraryRequestId = useRef(0);

    const loadLibrary = useCallback(async (search = "", page = 1, append = false) => {
        const requestId = ++libraryRequestId.current;
        if (append) setLibraryLoadingMore(true);
        else setLibraryLoading(true);
        setLibraryError("");
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(LIBRARY_PAGE_SIZE) });
            if (search) params.set("q", search);
            const response = await fetch(`/api/documents?${params}`, { cache: "no-store" });
            const data: unknown = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
                    ? data.error
                    : "Could not load your document library.";
                throw new Error(message);
            }
            if (requestId !== libraryRequestId.current) return;
            const result = data as { documents?: unknown; totalCount?: unknown; page?: unknown; hasMore?: unknown };
            const nextDocuments = Array.isArray(result.documents)
                ? result.documents.filter((item): item is LibraryDocument => Boolean(item) && typeof item === "object"
                    && "id" in item && typeof item.id === "string"
                    && "name" in item && typeof item.name === "string"
                    && "mime_type" in item && typeof item.mime_type === "string"
                    && "created_at" in item && typeof item.created_at === "string")
                : [];
            setLibraryDocuments((current) => append ? [...current, ...nextDocuments.filter((item) => !current.some((loaded) => loaded.id === item.id))] : nextDocuments);
            setLibraryTotal(typeof result.totalCount === "number" ? result.totalCount : nextDocuments.length);
            setLibraryPage(typeof result.page === "number" ? result.page : page);
            setLibraryHasMore(result.hasMore === true);
        } catch (cause) {
            if (requestId === libraryRequestId.current) setLibraryError(cause instanceof Error ? cause.message : "Could not load your document library.");
        } finally {
            if (requestId === libraryRequestId.current) {
                setLibraryLoading(false);
                setLibraryLoadingMore(false);
            }
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void loadLibrary(); }, 0);
        return () => window.clearTimeout(timer);
    }, [loadLibrary]);

    function submitLibrarySearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const search = librarySearchInput.trim();
        setLibrarySearch(search);
        void loadLibrary(search, 1, false);
    }

    function clearLibrarySearch() {
        setLibrarySearch("");
        setLibrarySearchInput("");
        void loadLibrary("", 1, false);
    }

    function toggleDocument(document: LibraryDocument) {
        if (selectedDocumentIds.includes(document.id)) {
            setSelectedDocumentIds((current) => current.filter((id) => id !== document.id));
            setLibraryError("");
            return;
        }
        if (selectedDocumentIds.length >= MAX_FOCUSED_DOCUMENTS) {
            setLibraryError(`Select up to ${MAX_FOCUSED_DOCUMENTS} documents for a focused answer.`);
            return;
        }
        setSelectedDocumentIds((current) => [...current, document.id]);
        setLibraryError("");
    }

    function fillPrompt(prompt: string) {
        setQuestion(prompt);
        document.getElementById("knowledge-question")?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("knowledge-question")?.focus();
    }

    useEffect(() => () => requestController.current?.abort(), []);

    useEffect(() => {
        const chatId = new URLSearchParams(window.location.search).get("chat")
            ?? getActiveAgentConversationId("knowledge");
        if (!chatId) return;
        let active = true;
        const timer = window.setTimeout(() => {
            setIsRestoring(true);
            void loadAgentConversation("knowledge", chatId).then((loaded) => {
                if (!active) return;
                if (!loaded) {
                    setError("This knowledge conversation could not be restored. Check that it is still available in your account history.");
                    setRestoreFailed(true);
                    return;
                }
                activateAgentConversationId("knowledge", chatId);
                setMessages(loaded);
                const savedAnswer = [...loaded].reverse().find((message) => message.role === "assistant")?.content ?? "";
                const [restoredAnswer, sourceText = ""] = savedAnswer.split("\n\nSources:\n");
                setAnswer(restoredAnswer);
                setSources(sourceText.split("\n").flatMap((line) => {
                    const match = line.match(/^\[(\d+)\]\s+(.+)$/);
                    return match ? [{ number: Number(match[1]), id: `saved-${match[1]}`, name: match[2] }] : [];
                }));
            }).catch((cause) => {
                if (active) {
                    setError(cause instanceof Error ? cause.message : "Could not restore the knowledge chat.");
                    setRestoreFailed(true);
                }
            }).finally(() => {
                if (active) setIsRestoring(false);
            });
        }, 0);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, []);

    async function ask(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!question.trim() || loading || isRestoring || restoreFailed) return;
        setLoading(true); setError(""); setSaveNotice(""); setAnswer(""); setSources([]);
        const controller = new AbortController();
        requestController.current = controller;
        let streamedAnswer = "";
        try {
            const response = await fetch("/api/knowledge", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: question.trim(), history: messages, documentIds: selectedDocumentIds }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Knowledge search failed.");
            }
            let completedAnswer = "";
            let responseSources: Source[] = [];
            const finalData = await readAgentStream(response, {
                onMetadata: (data) => {
                    if (Array.isArray(data.sources)) {
                        responseSources = data.sources as Source[];
                        setSources(responseSources);
                    }
                },
                onChunk: (chunk) => {
                    streamedAnswer += chunk;
                    setAnswer(streamedAnswer);
                },
            });
            completedAnswer = typeof finalData.answer === "string" ? finalData.answer : streamedAnswer.trim();
            if (!completedAnswer) throw new Error("The model returned an empty answer.");
            setAnswer(completedAnswer);
            const focusedDocumentNames = selectedDocumentIds.length
                ? libraryDocuments.filter((document) => selectedDocumentIds.includes(document.id)).map((document) => document.name)
                : [];
            const nextMessages: AgentMessage[] = [...messages,
            { role: "user", content: `${question.trim()}${focusedDocumentNames.length ? `\n\nFocused documents: ${focusedDocumentNames.join(", ")}` : ""}` },
            { role: "assistant", content: `${completedAnswer}\n\nSources:\n${responseSources.map((source) => `[${source.number}] ${source.name}`).join("\n")}` },
            ];
            setMessages(nextMessages);
            const saveError = await saveAgentConversation("knowledge", getAgentConversationId("knowledge"), nextMessages);
            if (saveError) setSaveNotice(`Answer generated, but chat history was not saved: ${saveError}`);
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") {
                setError(streamedAnswer ? "Answer generation stopped. The partial answer was not saved to chat history." : "Search stopped.");
                return;
            }
            setError(cause instanceof Error ? cause.message : "Knowledge search failed.");
        } finally {
            if (requestController.current === controller) requestController.current = null;
            setLoading(false);
        }
    }

    function newConversation() {
        requestController.current?.abort();
        getAgentConversationId("knowledge", true);
        setMessages([]); setAnswer(""); setSources([]); setError(""); setSaveNotice(""); setQuestion("");
        setRestoreFailed(false);
    }

    return (
        <main className="mx-auto max-w-6xl px-5 py-9 text-white sm:px-8 sm:py-10">
            <p className="eyebrow text-[10px] font-semibold uppercase">AI AGENT</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Knowledge Agent</h1>
            <p className="mt-2 text-sm leading-6 text-gray-400">Ask questions across the documents in your personal knowledge base.</p>

            <div className="mt-8 flex justify-end"><button type="button" onClick={newConversation} disabled={isRestoring || loading} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50">New chat</button></div>
            <form onSubmit={ask} className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <label htmlFor="knowledge-question" className="mb-2 block text-sm font-medium text-gray-200">Ask your knowledge base</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <textarea id="knowledge-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1500} disabled={isRestoring || restoreFailed || loading}
                        rows={3} placeholder="Ask, summarize, compare, explain, extract action items, or create a study guide…"
                        className="min-w-0 flex-1 resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 outline-none placeholder:text-gray-600 focus:border-violet-400/50 disabled:opacity-60" />
                    <button type="submit" disabled={!question.trim() || loading || isRestoring || restoreFailed}
                        className="self-stretch rounded-xl bg-violet-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50 sm:self-end">
                        {loading ? "Working…" : "Ask"}
                    </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">Answers cite your files. You can also ask general questions; the agent labels context that isn’t in your documents.</p>
            </form>

            <section className="mt-5" aria-label="Knowledge question starters">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Try asking</p>
                <div className="flex flex-wrap gap-2">
                    {[
                        "Summarize all my documents and organize them by topic.",
                        "What kinds of work or projects are described in my files?",
                        "Compare the main ideas across my documents.",
                        "Find key dates, decisions, people, and action items.",
                    ].map((prompt) => <button key={prompt} type="button" onClick={() => fillPrompt(prompt)} disabled={loading || isRestoring} className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-xs text-gray-300 transition hover:border-violet-400/30 hover:bg-violet-400/[0.06] hover:text-white disabled:opacity-50">{prompt}</button>)}
                </div>
            </section>

            <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="knowledge-library-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-violet-300">Your private library</p>
                        <h2 id="knowledge-library-title" className="mt-1 text-lg font-semibold text-white">Documents</h2>
                        <p className="mt-1 text-sm text-gray-400">{libraryTotal} {libraryTotal === 1 ? "document" : "documents"} {librarySearch ? "match your search" : "in your library"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1.5 text-xs ${selectedDocumentIds.length ? "bg-violet-400/10 text-violet-200" : "bg-emerald-400/10 text-emerald-200"}`}>
                            {selectedDocumentIds.length ? `${selectedDocumentIds.length} focused` : "All documents"}
                        </span>
                        {selectedDocumentIds.length > 0 && <button type="button" onClick={() => setSelectedDocumentIds([])} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5">Clear focus</button>}
                        <button type="button" onClick={() => void loadLibrary(librarySearch, 1, false)} disabled={libraryLoading} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-50">{libraryLoading ? "Refreshing…" : "Refresh"}</button>
                        <Link href="/documents" className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-200">Add documents</Link>
                    </div>
                </div>

                <form onSubmit={submitLibrarySearch} className="mt-4 flex gap-2">
                    <label className="min-w-0 flex-1">
                        <span className="sr-only">Search your library by file name</span>
                        <input value={librarySearchInput} onChange={(event) => setLibrarySearchInput(event.target.value)} maxLength={100} placeholder="Find a document by name…" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-500 focus:border-violet-400/50" />
                    </label>
                    <button type="submit" disabled={libraryLoading} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50">Find</button>
                    {librarySearch && <button type="button" onClick={clearLibrarySearch} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm text-gray-400 hover:bg-white/5">Clear</button>}
                </form>

                {selectedDocumentIds.length === 0
                    ? <p className="mt-3 text-xs text-gray-500">By default, questions search across your whole library. Choose files below to focus an answer.</p>
                    : <p className="mt-3 text-xs text-violet-200">Questions will use only the focused documents. Select up to {MAX_FOCUSED_DOCUMENTS} files.</p>}

                {libraryError && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{libraryError}</p>}
                {libraryLoading
                    ? <p role="status" className="mt-4 text-sm text-gray-500">Loading your documents…</p>
                    : libraryDocuments.length === 0
                        ? <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center">
                            <p className="text-sm text-gray-300">{librarySearch ? `No documents match “${librarySearch}”.` : "Your knowledge library is empty."}</p>
                            {!librarySearch && <p className="mt-1 text-xs text-gray-500">Upload reports, notes, spreadsheets, or PDFs to give the agent something to work with.</p>}
                            {!librarySearch && <Link href="/documents" className="mt-3 inline-flex rounded-lg bg-violet-500 px-4 py-2 text-xs font-medium text-white hover:bg-violet-400">Upload your first document</Link>}
                        </div>
                        : <>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {libraryDocuments.map((document) => {
                                    const selected = selectedDocumentIds.includes(document.id);
                                    return <article key={document.id} className={`rounded-xl border p-4 transition ${selected ? "border-violet-400/40 bg-violet-400/[0.06]" : "border-white/10 bg-black/10 hover:border-white/20"}`}>
                                        <div className="flex items-start gap-3">
                                            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-[10px] font-bold tracking-wide text-violet-200">{documentKind(document.name, document.mime_type)}</span>
                                            <div className="min-w-0 flex-1">
                                                <h3 title={document.name} className="truncate text-sm font-medium text-gray-100">{document.name}</h3>
                                                <p className="mt-1 text-xs text-gray-500">{new Date(document.created_at).toLocaleDateString()} · {document.mime_type === "application/octet-stream" ? documentKind(document.name, document.mime_type) : document.mime_type}</p>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => toggleDocument(document)} aria-pressed={selected} className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs transition ${selected ? "border-violet-400/30 bg-violet-400/10 text-violet-100" : "border-white/10 text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}>
                                            {selected ? "✓ Focused for questions" : "Focus questions on this file"}
                                        </button>
                                    </article>;
                                })}
                            </div>
                            <p className="mt-3 text-xs text-gray-500">Showing {libraryDocuments.length} of {libraryTotal} documents</p>
                            {libraryHasMore && <button type="button" onClick={() => void loadLibrary(librarySearch, libraryPage + 1, true)} disabled={libraryLoadingMore} className="mt-3 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 disabled:opacity-50">{libraryLoadingMore ? "Loading more files…" : "Show more documents"}</button>}
                        </>}
            </section>

            {isRestoring && <p role="status" className="mt-5 text-sm text-gray-400">Restoring your saved knowledge chat…</p>}

            {loading && <div role="status" className="mt-5 flex items-center justify-between gap-3 text-sm text-gray-400"><span>Searching your documents and preparing an answer…</span><button type="button" onClick={() => requestController.current?.abort()} className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10">Stop search</button></div>}
            {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
            {saveNotice && <p role="status" className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">{saveNotice}</p>}
            {messages.slice(0, -2).map((message, index) => <div key={`${index}-${message.role}`} className={`mt-4 rounded-xl p-4 text-sm leading-6 ${message.role === "user" ? "ml-8 bg-violet-500/10 text-violet-100" : "mr-8 border border-white/10 bg-white/[0.03] text-gray-300"}`}>
                <p className="mb-1 text-xs font-medium uppercase text-gray-500">{message.role === "user" ? "You" : "Knowledge Agent"}</p>
                <p className="whitespace-pre-wrap">{message.content}</p>
            </div>)}
            {answer && <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="space-y-4 text-sm leading-7 text-gray-300"><ReactMarkdown components={{
                    a: ({ href, children }) => <a href={href} target={href?.startsWith("#knowledge-source-") ? undefined : "_blank"} rel={href?.startsWith("#knowledge-source-") ? undefined : "noopener noreferrer"} className="text-violet-300 underline underline-offset-2 hover:text-violet-200">{children}</a>,
                }}>{linkSourceCitations(answer, sources.map((source) => source.number), "knowledge")}</ReactMarkdown></div>
                <ResponseDownloads prompt={messages.filter((message) => message.role === "user").at(-1)?.content ?? ""} content={`${answer}${sources.length ? `\n\n## Sources\n${sources.map((source) => `- ${source.name}`).join("\n")}` : ""}`} title="Knowledge answer" />
                {sources.length > 0 && <div className="mt-6 border-t border-white/10 pt-4">
                    <h2 className="text-sm font-semibold text-white">Sources used</h2>
                    <ul className="mt-3 space-y-2">{sources.map((source) => <li key={`${source.id}-${source.number}`} id={`knowledge-source-${source.number}`} className="scroll-mt-6 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-violet-200">[{source.number}] {source.name}</span>
                            <a href="/documents" className="text-xs text-violet-300 underline underline-offset-2 hover:text-violet-200">Manage documents</a>
                        </div>
                        {source.excerpt
                            ? <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">View supporting excerpt</summary>
                                <p className="mt-2 whitespace-pre-wrap border-l-2 border-violet-400/50 pl-3 text-xs leading-6 text-gray-400">{source.excerpt}{source.excerpt.length >= 2_000 ? "…" : ""}</p>
                            </details>
                            : <p className="mt-2 text-xs text-gray-500">Open a new answer to view its supporting excerpt. This older saved chat keeps its original citation.</p>}
                    </li>)}</ul>
                </div>}
            </section>}
            <p className="mt-5 text-xs text-gray-500">Your documents are private to your account. <Link href="/documents" className="text-violet-300 underline">Manage documents</Link>.</p>
        </main>
    );
}

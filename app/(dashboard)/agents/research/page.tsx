"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { linkSourceCitations } from "@/lib/citations";
import { readAgentStream } from "@/lib/agent-stream";
import { activateAgentConversationId, getActiveAgentConversationId, getAgentConversationId, loadAgentConversationData, saveAgentConversation, type AgentMessage } from "@/lib/agent-history";
import ResponseDownloads from "@/components/response-downloads";

type ResearchSource = {
    number: number;
    title: string;
    url: string;
    publishedDate: string | null;
    content: string;
};

type ResearchResult = {
    query: string;
    answer: string;
    sources: ResearchSource[];
    depth?: string;
    outputComplete?: boolean;
};

type ResearchAttachment = {
    name: string;
    content: string;
};

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: SpeechRecognitionResultLike }>;
};
type SpeechRecognitionLike = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
};
type SpeechRecognitionWindow = Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const RESEARCH_DEPTHS = ["Low", "Medium", "High", "Very high"] as const;
const RESEARCH_DEPTH_DESCRIPTIONS = [
    "Quick scan · about 300–500 words",
    "Developed report · about 800–1,200 words",
    "Detailed report · about 1,600–2,300 words",
    "Long-form report · about 3,000–4,000 words; may take a few minutes",
];
const RESEARCH_WORD_TARGETS = [
    { min: 300, max: 500 },
    { min: 800, max: 1_200 },
    { min: 1_600, max: 2_300 },
    { min: 3_000, max: 4_000 },
] as const;
const MAX_RESEARCH_FILES = 5;
const MAX_RESEARCH_FILE_SIZE = 5 * 1024 * 1024;
const MAX_RESEARCH_ATTACHMENT_TEXT = 22_000;

function isResearchResult(value: unknown): value is ResearchResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.query === "string"
        && typeof candidate.answer === "string"
        && Array.isArray(candidate.sources)
        && candidate.sources.every((source) => {
            if (!source || typeof source !== "object") return false;
            const item = source as Record<string, unknown>;
            if (typeof item.url !== "string" || typeof item.title !== "string" || typeof item.number !== "number") return false;
            try {
                const url = new URL(item.url);
                return (url.protocol === "https:" || url.protocol === "http:")
                    && (item.publishedDate === null || typeof item.publishedDate === "string")
                    && typeof item.content === "string";
            } catch {
                return false;
            }
        });
}

function countWords(text: string): number {
    return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export default function ResearchAgentPage() {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<ResearchResult | null>(null);
    const [error, setError] = useState("");
    const [saveNotice, setSaveNotice] = useState("");
    const [restoreNotice, setRestoreNotice] = useState("");
    const [fileNotice, setFileNotice] = useState("");
    const [isResearching, setIsResearching] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreFailed, setRestoreFailed] = useState(false);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [researchResults, setResearchResults] = useState<ResearchResult[]>([]);
    const [attachments, setAttachments] = useState<ResearchAttachment[]>([]);
    const [isReadingFiles, setIsReadingFiles] = useState(false);
    const [depth, setDepth] = useState(1);
    const [autoIncreaseDepth, setAutoIncreaseDepth] = useState(true);
    const [depthNotice, setDepthNotice] = useState("");
    const [isListening, setIsListening] = useState(false);
    const requestController = useRef<AbortController | null>(null);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => () => {
        requestController.current?.abort();
        recognitionRef.current?.abort();
    }, []);

    useEffect(() => {
        const requestedChatId = new URLSearchParams(window.location.search).get("chat");
        const chatId = requestedChatId ?? getActiveAgentConversationId("research");
        const isExplicitRestore = requestedChatId !== null;
        if (!chatId) return;
        let active = true;
        const timer = window.setTimeout(() => {
            setIsRestoring(true);
            void loadAgentConversationData("research", chatId).then((loaded) => {
                if (!active) return;
                if (!loaded) {
                    if (!isExplicitRestore) {
                        getAgentConversationId("research", true);
                        setRestoreNotice("Your previous research chat is no longer in history. A fresh research chat is ready.");
                        setRestoreFailed(false);
                    } else {
                        setError("This saved research chat is no longer available. Start a new research chat to continue.");
                        setRestoreFailed(true);
                    }
                    return;
                }
                activateAgentConversationId("research", chatId);
                setMessages(loaded.messages);
                const storedResearch = loaded.metadata.research;
                if (storedResearch && typeof storedResearch === "object") {
                    const savedDepth = "depth" in storedResearch && typeof storedResearch.depth === "string"
                        ? RESEARCH_DEPTHS.findIndex((level) => level.toLowerCase() === storedResearch.depth)
                        : -1;
                    if (savedDepth >= 0) setDepth(savedDepth);
                    if ("autoIncreaseDepth" in storedResearch && typeof storedResearch.autoIncreaseDepth === "boolean") {
                        setAutoIncreaseDepth(storedResearch.autoIncreaseDepth);
                    }
                }
                const storedResults = storedResearch && typeof storedResearch === "object" && "results" in storedResearch && Array.isArray(storedResearch.results)
                    ? storedResearch.results.filter(isResearchResult)
                    : [];
                setResearchResults(storedResults);
                if (storedResults.length) {
                    setResult(storedResults[storedResults.length - 1]);
                    return;
                }

                const question = [...loaded.messages].reverse().find((message) => message.role === "user")?.content ?? "Saved research";
                const savedAnswer = [...loaded.messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
                const [answer, sourceText = ""] = savedAnswer.split("\n\nSources\n");
                const sources = sourceText.split("\n").flatMap((line) => {
                    const match = line.match(/^\[(\d+)\]\s+(.+?)\s+—\s+(https?:\/\/\S+)$/);
                    if (!match) return [];
                    return [{ number: Number(match[1]), title: match[2], url: match[3], publishedDate: null, content: "" }];
                });
                const legacyResult = { query: question, answer, sources };
                setResult(legacyResult);
                setResearchResults(legacyResult.sources.length || legacyResult.answer ? [legacyResult] : []);
            }).catch((cause) => {
                if (active) {
                    setError(cause instanceof Error ? cause.message : "Could not restore the research chat.");
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

    async function handleResearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmedQuery = query.trim();

        if (!trimmedQuery || isResearching || isRestoring || restoreFailed) return;

        recognitionRef.current?.stop();
        setIsListening(false);
        setIsResearching(true);
        setError("");
        setSaveNotice("");
        setResult(null);
        let streamedAnswer = "";
        const controller = new AbortController();
        requestController.current = controller;

        try {
            const response = await fetch("/api/research", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: trimmedQuery,
                    history: messages,
                    attachments,
                    depth: RESEARCH_DEPTHS[depth].toLowerCase(),
                    autoIncreaseDepth,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const data: unknown = await response.json().catch(() => ({}));
                const message = typeof data === "object" && data !== null
                    ? (data as { error?: unknown }).error
                    : null;
                throw new Error(
                    typeof message === "string"
                        ? message
                        : "Research failed. Please try again.",
                );
            }

            let responseQuery = trimmedQuery;
            let responseSources: ResearchSource[] = [];
            let effectiveDepth = RESEARCH_DEPTHS[depth].toLowerCase();
            const finalData = await readAgentStream(response, {
                onMetadata: (data) => {
                    if (typeof data.query === "string") responseQuery = data.query;
                    if (Array.isArray(data.sources)) responseSources = data.sources as ResearchSource[];
                    if (typeof data.depth === "string" && RESEARCH_DEPTHS.some((level) => level.toLowerCase() === data.depth)) {
                        effectiveDepth = data.depth;
                    }
                    if (typeof data.depth === "string") {
                        const autoIncreased = data.autoIncreased === true;
                        setDepthNotice(autoIncreased
                            ? `Automatically increased to ${data.depth} for this more involved research request.`
                            : `Research depth: ${data.depth}.`);
                    }
                    setResult({ query: responseQuery, answer: streamedAnswer, sources: responseSources, depth: effectiveDepth });
                },
                onChunk: (chunk) => {
                    streamedAnswer += chunk;
                    setResult({ query: responseQuery, answer: streamedAnswer, sources: responseSources, depth: effectiveDepth });
                },
            });
            const researchResult: ResearchResult = {
                query: responseQuery,
                answer: typeof finalData.answer === "string" ? finalData.answer : streamedAnswer.trim(),
                sources: responseSources,
                depth: effectiveDepth,
                outputComplete: finalData.outputComplete !== false,
            };
            if (!researchResult.answer) throw new Error("The research model returned an empty answer. Please try again.");
            setResult(researchResult);
            const sourceList = researchResult.sources.map((source) => `[${source.number}] ${source.title} — ${source.url}`).join("\n");
            const nextMessages: AgentMessage[] = [
                ...messages,
                {
                    role: "user",
                    content: `${trimmedQuery}${attachments.length ? `\n\nFiles reviewed: ${attachments.map((file) => file.name).join(", ")}` : ""}`,
                },
                { role: "assistant", content: `${researchResult.answer}\n\nSources\n${sourceList}` },
            ];
            const nextResearchResults = [...researchResults, researchResult].slice(-8);
            setMessages(nextMessages);
            setResearchResults(nextResearchResults);
            const saveError = await saveAgentConversation("research", getAgentConversationId("research"), nextMessages, {
                research: {
                    results: nextResearchResults,
                    depth: RESEARCH_DEPTHS[depth].toLowerCase(),
                    effectiveDepth,
                    autoIncreaseDepth,
                },
            });
            if (saveError) setSaveNotice(`Research completed, but chat history was not saved: ${saveError}`);
        } catch (requestError) {
            if (requestError instanceof DOMException && requestError.name === "AbortError") {
                setError(streamedAnswer ? "Research stopped. The partial report was not saved to chat history." : "Research stopped.");
                return;
            }
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Research failed. Please try again.",
            );
        } finally {
            if (requestController.current === controller) requestController.current = null;
            setIsResearching(false);
        }
    }

    function startNewResearch() {
        requestController.current?.abort();
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        setIsListening(false);
        getAgentConversationId("research", true);
        setQuery("");
        setResult(null);
        setMessages([]);
        setResearchResults([]);
        setError("");
        setSaveNotice("");
        setRestoreNotice("");
        setDepthNotice("");
        setFileNotice("");
        setAttachments([]);
        setRestoreFailed(false);
        if (new URLSearchParams(window.location.search).has("chat")) {
            window.history.replaceState(null, "", window.location.pathname);
        }
    }

    async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
        const selected = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (!selected.length) return;
        setError("");

        const remainingSlots = MAX_RESEARCH_FILES - attachments.length;
        if (selected.length > remainingSlots) {
            setError(`You can attach up to ${MAX_RESEARCH_FILES} files to one research request.`);
            return;
        }
        for (const file of selected) {
            const supported = /\.(pdf|txt|md|pptx)$/i.test(file.name);
            if (!supported) {
                setError(`${file.name}: choose a PDF, TXT, Markdown, or PowerPoint (.pptx) file.`);
                return;
            }
            if (file.size === 0 || file.size > MAX_RESEARCH_FILE_SIZE) {
                setError(`${file.name}: files must be non-empty and 5 MB or smaller.`);
                return;
            }
        }

        setIsReadingFiles(true);
        try {
            const extracted = await Promise.all(selected.map(async (file) => {
                const form = new FormData();
                form.set("file", file);
                const response = await fetch("/api/attachments/extract", { method: "POST", body: form });
                const data: unknown = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
                        ? data.error
                        : "Could not read this file.";
                    throw new Error(`${file.name}: ${message}`);
                }
                const content = typeof data === "object" && data !== null && "content" in data && typeof data.content === "string"
                    ? data.content
                    : "";
                if (!content.trim()) throw new Error(`${file.name}: no readable text was found.`);
                return { name: file.name, content };
            }));

            const currentCharacters = attachments.reduce((total, item) => total + item.content.length, 0);
            let remainingCharacters = MAX_RESEARCH_ATTACHMENT_TEXT - currentCharacters;
            const fitted: ResearchAttachment[] = [];
            for (const item of extracted) {
                if (remainingCharacters <= 0) break;
                const content = item.content.slice(0, remainingCharacters);
                fitted.push({ name: item.name, content });
                remainingCharacters -= content.length;
            }
            setAttachments((current) => [...current, ...fitted]);
            if (fitted.length < extracted.length || remainingCharacters === 0) {
                setFileNotice("Some attached text was shortened to fit the research context limit.");
            } else {
                setFileNotice("");
            }
        } catch (fileError) {
            setError(fileError instanceof Error ? fileError.message : "Could not read the selected files.");
        } finally {
            setIsReadingFiles(false);
        }
    }

    function toggleListening() {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const speechWindow = window as SpeechRecognitionWindow;
        const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
        if (!Recognition) {
            setError("Voice input is not supported in this browser. Try the latest version of Chrome.");
            return;
        }

        try {
            const recognition = new Recognition();
            const startingQuery = query.trimEnd();
            recognition.lang = "en-IN";
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                    .map((item) => item[0].transcript)
                    .join(" ")
                    .trim();
                if (transcript) setQuery(`${startingQuery}${startingQuery ? " " : ""}${transcript}`.slice(0, 800));
            };
            recognition.onerror = (event) => {
                setIsListening(false);
                if (event.error === "not-allowed") setError("Microphone permission was denied. Allow microphone access in your browser settings.");
                else if (event.error !== "aborted" && event.error !== "no-speech") setError(`Voice input failed (${event.error}). Please try again.`);
            };
            recognition.onend = () => {
                setIsListening(false);
                if (recognitionRef.current === recognition) recognitionRef.current = null;
            };
            recognitionRef.current = recognition;
            recognition.start();
            setIsListening(true);
            setError("");
        } catch {
            recognitionRef.current = null;
            setIsListening(false);
            setError("Could not start the microphone. Please try again.");
        }
    }

    return (
        <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow text-[10px] font-semibold uppercase">AI AGENT</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Research Agent</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                        Research any question and get a sourced report sized to your selected depth.
                    </p>
                </div>
                <button type="button" onClick={startNewResearch} disabled={isResearching || isRestoring || isReadingFiles} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-50">
                    + New research
                </button>
            </div>

            <form
                onSubmit={handleResearch}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
                <label htmlFor="research-query" className="text-sm font-medium">
                    What would you like to research?
                </label>
                <textarea
                    id="research-query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    maxLength={800}
                    rows={4}
                    disabled={isResearching || isRestoring || restoreFailed || isReadingFiles}
                    placeholder="Example: What are the latest advances in battery recycling?"
                    className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-400/50 disabled:opacity-60"
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.md,.markdown,.pptx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        multiple
                        className="hidden"
                        onChange={handleFilesSelected}
                        disabled={isResearching || isRestoring || isReadingFiles || attachments.length >= MAX_RESEARCH_FILES}
                    />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isResearching || isRestoring || isReadingFiles || attachments.length >= MAX_RESEARCH_FILES} className="rounded-lg border border-white/10 px-3.5 py-2 text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-50">
                        + Add files
                    </button>
                    <button type="button" onClick={toggleListening} disabled={isResearching || isRestoring || isReadingFiles} aria-pressed={isListening} className={`rounded-lg border px-3.5 py-2 text-sm transition disabled:opacity-50 ${isListening ? "border-red-400/40 bg-red-400/10 text-red-200" : "border-white/10 text-gray-200 hover:bg-white/5"}`}>
                        {isListening ? "Stop microphone" : "🎙 Use microphone"}
                    </button>
                    {isReadingFiles && <span role="status" className="text-xs text-violet-200">Reading files…</span>}
                    <span className="text-xs text-gray-500">PDF, TXT, Markdown, PPTX · up to 5 files, 5 MB each</span>
                </div>

                {attachments.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Files attached for research">
                        {attachments.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/5 px-3 py-1.5 text-xs text-violet-100">
                                <span className="max-w-56 truncate">{file.name}</span>
                        <button type="button" onClick={() => { setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index)); setFileNotice(""); }} aria-label={`Remove ${file.name}`} disabled={isResearching || isReadingFiles} className="text-violet-300 hover:text-white disabled:opacity-50">×</button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <label htmlFor="research-depth" className="text-sm font-medium">Research depth</label>
                        <span className="rounded-full bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-200">{RESEARCH_DEPTHS[depth]}</span>
                    </div>
                    <input
                        id="research-depth"
                        type="range"
                        min={0}
                        max={3}
                        step={1}
                        value={depth}
                        onChange={(event) => setDepth(Number(event.target.value))}
                        disabled={isResearching || isRestoring}
                        aria-valuetext={RESEARCH_DEPTHS[depth]}
                        className="mt-3 w-full accent-violet-400 disabled:opacity-50"
                    />
                    <div className="flex justify-between text-[11px] text-gray-500" aria-hidden="true">
                        {RESEARCH_DEPTHS.map((level) => <span key={level}>{level}</span>)}
                    </div>
                    <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-gray-400">
                        <input type="checkbox" checked={autoIncreaseDepth} onChange={(event) => setAutoIncreaseDepth(event.target.checked)} disabled={isResearching || isRestoring} className="mt-0.5 accent-violet-400" />
                        <span>Automatically increase depth for complex questions and attached documents</span>
                    </label>
                    <p className="mt-3 text-xs text-gray-500">{RESEARCH_DEPTH_DESCRIPTIONS[depth]}</p>
                    {depthNotice && <p className="mt-3 text-xs text-violet-200">{depthNotice}</p>}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">
                        Uses live web sources and cites evidence from your attached files.
                    </p>
                    <button
                        type="submit"
                        disabled={!query.trim() || isResearching || isRestoring || restoreFailed || isReadingFiles}
                        className="rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isResearching ? "Researching…" : "Start research"}
                    </button>
                </div>
            </form>

            {isRestoring && <p role="status" className="mt-5 text-sm text-gray-400">Restoring your saved research chat…</p>}

            {restoreNotice && <p role="status" className="mt-5 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] p-4 text-sm text-violet-100">{restoreNotice}</p>}

            {error && (
                <div
                    role="alert"
                    className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
                >
                    {error}
                </div>
            )}

            {fileNotice && <p role="status" className="mt-3 text-xs text-amber-200">{fileNotice}</p>}
            {saveNotice && <p role="status" className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">{saveNotice}</p>}

            {isResearching && (
                <div
                    role="status"
                    className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-gray-300"
                >
                    Searching for useful sources and preparing your {RESEARCH_DEPTHS[depth].toLowerCase()}-depth report ({RESEARCH_DEPTH_DESCRIPTIONS[depth].split("·")[1]?.trim()}).
                    <button type="button" onClick={() => requestController.current?.abort()} className="ml-3 rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10">
                        Stop research
                    </button>
                </div>
            )}

            {messages.slice(0, -2).map((message, index) => (
                <div key={`${index}-${message.role}`} className={`mt-4 rounded-xl p-4 text-sm leading-6 ${message.role === "user" ? "ml-8 bg-violet-500/10 text-violet-100" : "mr-8 border border-white/10 bg-white/[0.03] text-gray-300"}`}>
                    <p className="mb-1 text-xs font-medium uppercase text-gray-500">{message.role === "user" ? "You" : "Research Agent"}</p>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
            ))}

            {result && (
                <section className="mt-8 space-y-6" aria-labelledby="research-result-title">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-violet-300">
                                    {result.depth === "very high" ? "In-depth research report" : result.depth === "high" ? "Detailed research report" : "Research report"}
                                </p>
                                <h2 id="research-result-title" className="mt-2 text-xl font-semibold">
                                    {result.query}
                                </h2>
                                {(() => {
                                    const resultDepthIndex = Math.max(0, RESEARCH_DEPTHS.findIndex((level) => level.toLowerCase() === result.depth));
                                    const target = RESEARCH_WORD_TARGETS[resultDepthIndex];
                                    const wordCount = countWords(result.answer);
                                    return (
                                        <div className="mt-2 text-sm" aria-live="polite">
                                            <p className="text-gray-400">
                                                {wordCount.toLocaleString()} words · {RESEARCH_DEPTHS[resultDepthIndex]} depth target: {target.min.toLocaleString()}–{target.max.toLocaleString()} words
                                            </p>
                                            {!isResearching && wordCount < target.min && (
                                                <p className="mt-1 text-amber-300">The model stopped before reaching the requested length. Try again or choose a shorter depth.</p>
                                            )}
                                            {!isResearching && wordCount > target.max && (
                                                <p className="mt-1 text-amber-300">This run exceeded the selected depth’s word range. Start a new research to retry at the same depth.</p>
                                            )}
                                            {!isResearching && result.outputComplete === false && (
                                                <p className="mt-1 text-amber-300">The model reached its response limit before finishing the report. The answer may be incomplete.</p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="mt-6 space-y-4 text-sm leading-7 text-gray-300">
                            <ReactMarkdown components={{
                                h1: ({ children }) => <h1 className="text-2xl font-semibold text-white">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-xl font-semibold text-white">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-lg font-semibold text-white">{children}</h3>,
                                p: ({ children }) => <p>{children}</p>,
                                ul: ({ children }) => <ul className="list-disc space-y-1 pl-6 marker:text-violet-300">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6 marker:text-violet-300">{children}</ol>,
                                li: ({ children }) => <li className="pl-1">{children}</li>,
                                a: ({ href, children }) => (
                                    <a href={href} target={href?.startsWith("#research-source-") ? undefined : "_blank"} rel={href?.startsWith("#research-source-") ? undefined : "noopener noreferrer"} className="text-violet-300 underline underline-offset-2 hover:text-violet-200">
                                        {children}
                                    </a>
                                ),
                                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                blockquote: ({ children }) => (
                                    <blockquote className="border-l-2 border-violet-400 pl-4 text-gray-400">
                                        {children}
                                    </blockquote>
                                ),
                                code: ({ children }) => (
                                    <code className="rounded bg-white/10 px-1.5 py-0.5 text-violet-200">
                                        {children}
                                    </code>
                                ),
                            }}>{linkSourceCitations(result.answer, result.sources.map((source) => source.number), "research")}</ReactMarkdown>
                        </div>
                        <ResponseDownloads prompt={result.query} title={result.query} content={`${result.answer}\n\n## Sources\n${result.sources.map((source) => `- ${source.title}: ${source.url}`).join("\n")}`} />
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <h2 className="text-lg font-semibold">Sources</h2>
                        <ol className="mt-4 space-y-3">
                            {result.sources.map((source) => (
                                <li
                                    key={`${source.number}-${source.url}`}
                                    id={`research-source-${source.number}`}
                                    className="scroll-mt-6 rounded-xl border border-white/10 bg-black/20 p-4"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-200">
                                            {source.number}
                                        </span>
                                        <div className="min-w-0">
                                            <a
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-medium text-violet-300 hover:text-violet-200 hover:underline"
                                            >
                                                {source.title}
                                            </a>
                                            {source.publishedDate && (
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Published: {source.publishedDate}
                                                </p>
                                            )}
                                            <p className="mt-2 text-sm leading-6 text-gray-400">
                                                {source.content}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>
            )}
        </div>
    );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type AgentModelStatus = { model: string; installed: boolean };
type SettingsStatus = {
    ollama: "connected" | "unavailable";
    models: string[];
    webSearchConfigured: boolean;
    message: string;
    storage?: {
        chatHistoryReady: boolean;
        attachmentContextReady: boolean;
        documentsReady: boolean;
        knowledgeSearchReady: boolean;
        atomicSaveReady: boolean;
    };
    agents?: {
        coding: AgentModelStatus;
        pdf: AgentModelStatus;
        knowledge: AgentModelStatus;
        research: AgentModelStatus;
        vision: AgentModelStatus;
        researchSearchConfigured: boolean;
    };
};

const DATABASE_MIGRATIONS = [
    "20261101000000_chat_schema.sql",
    "20261102000000_knowledge_documents.sql",
    "20261103000000_conversation_metadata.sql",
    "20261103000100_message_context.sql",
    "20261103000200_atomic_conversation_saves.sql",
    "20261104000000_knowledge_full_text_search.sql",
    "20261105000000_conversation_conflict_indexes.sql",
    "20261106000000_repair_conversation_save_indexes.sql",
];

export default function SettingsPage() {
    const [status, setStatus] = useState<SettingsStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(async () => {
        setLoading(true); setError("");
        try {
            const response = await fetch("/api/settings", { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not load settings.");
            setStatus(data);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load settings."); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    return <main className="mx-auto max-w-6xl px-5 py-9 text-white sm:px-8 sm:py-10">
        <p className="eyebrow text-[10px] font-semibold uppercase">CONFIGURATION</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Check the services your agents need. Private keys stay on the server.</p>
        <div className="mt-8 flex items-center justify-between">
            <h2 className="text-lg font-semibold">AI services</h2>
            <button onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50">{loading ? "Checking…" : "Refresh status"}</button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        <section className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between"><h3 className="font-medium">Ollama model service</h3>
                    <span className={status?.ollama === "connected" ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{status?.ollama === "connected" ? "Connected" : loading ? "Checking" : "Unavailable"}</span></div>
                <p className="mt-2 text-sm text-gray-400">{status?.message ?? "Checking whether the model service can be reached…"}</p>
                {status?.models && status.models.length > 0 && <div className="mt-4"><p className="text-xs uppercase text-gray-500">Installed models</p><ul className="mt-2 space-y-1">{status.models.map((model) => <li key={model} className="text-sm text-gray-300">{model}</li>)}</ul></div>}
                <p className="mt-3 text-xs text-gray-500">Configure OLLAMA_BASE_URL in the server environment when Ollama is not on this machine.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between"><h3 className="font-medium">Web research</h3>
                    <span className={status?.webSearchConfigured ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{status?.webSearchConfigured ? "Configured" : loading ? "Checking" : "Needs setup"}</span></div>
                <p className="mt-2 text-sm text-gray-400">Research Agent uses Tavily for live web search. The API key is checked on the server and is never shown here.</p>
                <p className="mt-3 text-xs text-gray-500">Set TAVILY_API_KEY in your private .env.local file, then restart the server.</p>
            </div>
        </section>
        {status?.agents && <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-semibold">Agent readiness</h2>
            <p className="mt-1 text-sm text-gray-400">Each agent needs its configured Ollama model. Research also needs Tavily. The vision model supports PDF charts and scanned pages, OCR in Documents, and Coding image attachments.</p>
            <ul className="mt-4 divide-y divide-white/10">
                {([
                    ["Coding Agent", status.agents.coding],
                    ["PDF Agent", status.agents.pdf],
                    ["Knowledge Agent", status.agents.knowledge],
                    ["Research Agent", status.agents.research],
                    ["PDF visual analysis and OCR", status.agents.vision],
                ] as const).map(([label, agent]) => {
                    const searchMissing = label === "Research Agent" && !status.agents?.researchSearchConfigured;
                    const ready = agent.installed && !searchMissing;
                    return <li key={label} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div><p className="text-sm text-gray-200">{label}</p><p className="mt-1 text-xs text-gray-500">{agent.model}{searchMissing ? " · Tavily key missing" : ""}</p></div>
                        <span className={ready ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{ready ? "Ready" : agent.installed && searchMissing ? "Needs Tavily setup" : "Model not installed"}</span>
                    </li>;
                })}
            </ul>
        </section>}
        {status?.storage && <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-semibold">Account storage</h2>
            <p className="mt-1 text-sm text-gray-400">These checks verify the storage tables, save function, and unique indexes your account history needs.</p>
            {Object.values(status.storage).some((ready) => !ready) && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[.05] p-4">
                <p className="text-sm font-medium text-amber-100">Finish the Supabase database setup</p>
                <p className="mt-1 text-sm leading-6 text-gray-400">The storage checks are unavailable. Apply every migration below in order from your Supabase SQL Editor, then refresh this page. This enables chat history, document uploads, Knowledge search, and reliable saves.</p>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-amber-200/20 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-200/[.08]">Open Supabase dashboard ↗</a>
                <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-gray-300">Migration order</summary>
                    <ol className="mt-2 list-inside list-decimal space-y-1.5 text-xs text-gray-400">
                        {DATABASE_MIGRATIONS.map((migration) => <li key={migration}><code className="break-all">{migration}</code></li>)}
                    </ol>
                    <p className="mt-3 text-xs leading-5 text-gray-500">Run each SQL file from <code>supabase/migrations</code> in the project root, following this order.</p>
                </details>
            </div>}
            <ul className="mt-4 divide-y divide-white/10">
                {([
                    ["Chat history", status.storage.chatHistoryReady],
                    ["Attachment context for Coding follow-ups", status.storage.attachmentContextReady],
                    ["Knowledge document library", status.storage.documentsReady],
                    ["Indexed Knowledge search", status.storage.knowledgeSearchReady],
                    ["Reliable transactional chat saves", status.storage.atomicSaveReady],
                ] as const).map(([label, ready]) => <li key={label} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="text-sm text-gray-200">{label}</span>
                    <span className={ready ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{ready ? "Ready" : "Unavailable — check Supabase migrations"}</span>
                </li>)}
            </ul>
        </section>}
        <div className="mt-6 rounded-xl border border-white/10 p-5 text-sm text-gray-400">
            <h2 className="font-medium text-white">Personal knowledge</h2>
            <p className="mt-2">Manage uploaded files in <a href="/documents" className="text-violet-300 underline">Documents</a>. Your files are scoped to your signed-in account.</p>
        </div>
    </main>;
}

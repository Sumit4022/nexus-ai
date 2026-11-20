"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PDF_CONVERSATIONS_STORAGE_KEY } from "@/lib/agent-history";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type AgentType = "coding" | "pdf" | "research" | "knowledge";
type AgentFilter = AgentType;

type Conversation = {
  id: string;
  title: string;
  agent: AgentType;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

const AGENT_INFO: Record<AgentType, { label: string; icon: string; description: string; accent: string; badge: string }> = {
  coding: { label: "Chat Agent", icon: "</>", description: "Coding, debugging, and implementation chats", accent: "text-cyan-200", badge: "bg-cyan-400/10 text-cyan-200 ring-cyan-300/15" },
  pdf: { label: "PDF Agent", icon: "▤", description: "Conversations about your PDFs and documents", accent: "text-amber-200", badge: "bg-amber-400/10 text-amber-200 ring-amber-300/15" },
  research: { label: "Research Agent", icon: "⌕", description: "Web research and sourced reports", accent: "text-violet-200", badge: "bg-violet-400/10 text-violet-200 ring-violet-300/15" },
  knowledge: { label: "Knowledge Agent", icon: "✳", description: "Answers from your personal knowledge library", accent: "text-emerald-200", badge: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/15" },
};

const AGENT_ORDER: AgentType[] = ["coding", "research", "pdf", "knowledge"];

function normalizeConversation(value: unknown): Conversation {
  if (!value || typeof value !== "object") {
    throw new Error("The server returned an invalid conversation.");
  }
  const conversation = value as Record<string, unknown>;
  const agent = ["coding", "pdf", "research", "knowledge"].includes(String(conversation.agent))
    ? conversation.agent as AgentType
    : "coding";
  const messages: Message[] = Array.isArray(conversation.messages)
    ? conversation.messages.filter((message): message is Message =>
        Boolean(message) && typeof message === "object" &&
        ((message as Record<string, unknown>).role === "user" ||
          (message as Record<string, unknown>).role === "assistant") &&
        typeof (message as Record<string, unknown>).content === "string"
      )
    : [];
  const createdAt = typeof conversation.createdAt === "string"
    ? conversation.createdAt
    : typeof conversation.created_at === "string" ? conversation.created_at : "";
  return {
    id: typeof conversation.id === "string" ? conversation.id : crypto.randomUUID(),
    title: typeof conversation.title === "string" ? conversation.title : "Untitled conversation",
    agent,
    messages,
    createdAt,
    updatedAt: typeof conversation.updatedAt === "string"
      ? conversation.updatedAt
      : typeof conversation.updated_at === "string" ? conversation.updated_at : createdAt,
  };
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("coding");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadHistory() {
      try {
        setError(null);

        const response = await fetch("/api/conversations?page=1&limit=50", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to load conversations (${response.status}).`
          );
        }

        const data: { conversations?: unknown; page?: unknown; totalCount?: unknown; hasMore?: unknown } = await response.json();

        if (!Array.isArray(data.conversations)) {
          throw new Error("The server returned an invalid conversation list.");
        }

        const loadedConversations = data.conversations.map(normalizeConversation);

        if (!cancelled) {
          setConversations(loadedConversations);
          setPage(typeof data.page === "number" ? data.page : 1);
          setTotalCount(typeof data.totalCount === "number" ? data.totalCount : loadedConversations.length);
          setHasMore(data.hasMore === true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load conversation history:", err);

          setError(
            err instanceof Error
              ? err.message
              : "Something went wrong while loading history."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  async function loadMoreConversations() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const response = await fetch(`/api/conversations?page=${nextPage}&limit=50`, { cache: "no-store" });
      const data: { conversations?: unknown; page?: unknown; totalCount?: unknown; hasMore?: unknown } = await response.json();
      if (!response.ok || !Array.isArray(data.conversations)) {
        throw new Error("Could not load more conversations. Please retry.");
      }
      const nextConversations = data.conversations.map(normalizeConversation);
      setConversations((current) => {
        const currentIds = new Set(current.map((conversation) => conversation.id));
        return [...current, ...nextConversations.filter((conversation) => !currentIds.has(conversation.id))];
      });
      setPage(typeof data.page === "number" ? data.page : nextPage);
      setTotalCount(typeof data.totalCount === "number" ? data.totalCount : totalCount);
      setHasMore(data.hasMore === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more conversations.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this conversation?"
    );

    if (!confirmed) return;

    try {
      setDeletingId(id);
      setError(null);

      const response = await fetch(
        `/api/conversations?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));

        throw new Error(
          result.error || "Failed to delete conversation."
        );
      }

      const deletedConversation = conversations.find((conversation) => conversation.id === id);
      if (deletedConversation?.agent === "pdf") {
        try {
          const savedPdfChats: unknown = JSON.parse(localStorage.getItem(PDF_CONVERSATIONS_STORAGE_KEY) || "[]");
          if (Array.isArray(savedPdfChats)) {
            const matchingChat = savedPdfChats.find((chat) => chat && typeof chat === "object" &&
              ((chat as Record<string, unknown>).id === id || (chat as Record<string, unknown>).historyId === id)) as Record<string, unknown> | undefined;
            localStorage.setItem(PDF_CONVERSATIONS_STORAGE_KEY, JSON.stringify(
              savedPdfChats.filter((chat) => chat && typeof chat === "object" &&
                (chat as Record<string, unknown>).id !== id &&
                (chat as Record<string, unknown>).historyId !== id)
            ));
            const activeId = localStorage.getItem("nexus-ai-pdf-active-conversation");
            if (matchingChat && (activeId === matchingChat.id || activeId === matchingChat.historyId)) {
              localStorage.removeItem("nexus-ai-pdf-active-conversation");
            }
          }
        } catch (storageError) {
          console.warn("Could not remove the local PDF copy of this conversation:", storageError);
        }
      } else if (deletedConversation?.agent === "coding") {
        try {
          const savedCodingChats: unknown = JSON.parse(localStorage.getItem("nexus-ai-chat-history") || "[]");
          if (Array.isArray(savedCodingChats)) {
            localStorage.setItem("nexus-ai-chat-history", JSON.stringify(
              savedCodingChats.filter((chat) => !chat || typeof chat !== "object" ||
                (chat as Record<string, unknown>).id !== id)
            ));
          }
          const currentChat: unknown = JSON.parse(localStorage.getItem("nexus-ai-current-chat") || "null");
          if (Array.isArray(currentChat) || (currentChat && typeof currentChat === "object" && (currentChat as Record<string, unknown>).id === id)) {
            localStorage.removeItem("nexus-ai-current-chat");
          }
        } catch (storageError) {
          console.warn("Could not remove the local Coding conversation copy:", storageError);
        }
      } else if (deletedConversation) {
        const activeKey = `nexus-ai-${deletedConversation.agent}-active-conversation`;
        if (localStorage.getItem(activeKey) === id) localStorage.removeItem(activeKey);
      }

      setConversations((current) =>
        current.filter((conversation) => conversation.id !== id)
      );
      setTotalCount((current) => current === null ? null : Math.max(0, current - 1));
    } catch (err) {
      console.error("Failed to delete conversation:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while deleting the conversation."
      );
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(dateString: string) {
    if (!dateString) return "Date unavailable";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getPreview(conversation: Conversation) {
    const firstUserMessage = [...conversation.messages].reverse().find(
      (message) => message.role === "user"
    );

    if (!firstUserMessage) {
      return "No messages yet.";
    }

    return firstUserMessage.content || "No message content.";
  }

  const filteredConversations = conversations.filter((conversation) => {
    const searchableText = [
      conversation.title,
      AGENT_INFO[conversation.agent].label,
      ...conversation.messages.slice(-6).map((message) => message.content),
    ].join(" ").toLowerCase();
    return conversation.agent === agentFilter
      && searchableText.includes(search.trim().toLowerCase());
  });

  const agentCounts = conversations.reduce<Record<AgentType, number>>((counts, conversation) => {
    counts[conversation.agent] += 1;
    return counts;
  }, { coding: 0, pdf: 0, research: 0, knowledge: 0 });
  const selectedAgent = AGENT_INFO[agentFilter];

  return (
    <main className="mx-auto max-w-6xl px-5 py-9 text-white sm:px-8 sm:py-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow text-[10px] font-semibold uppercase">Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">History</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Choose an agent to see only its conversations. Your chats stay organized in separate views.</p>
          {isLoaded && <p className="mt-2 text-xs text-gray-600">Loaded {conversations.length}{totalCount !== null ? ` of ${totalCount}` : ""} total chats.</p>}
        </div>
        {isLoaded && <div className={`rounded-2xl border border-white/10 px-5 py-3 ${selectedAgent.badge}`}>
          <p className="text-2xl font-semibold tabular-nums">{agentCounts[agentFilter]}</p>
          <p className="text-xs opacity-75">{selectedAgent.label} chats loaded</p>
        </div>}
      </header>

      {error && <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()} className="shrink-0 rounded-lg border border-red-400/20 px-3 py-1.5 transition hover:bg-red-500/10">Retry</button>
      </div>}

      {!isLoaded && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-gray-500">Loading conversations…</div>}

      {isLoaded && <>
        <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-2 sm:grid-cols-4" aria-label="History by agent">
          {AGENT_ORDER.map((agent) => {
            const info = AGENT_INFO[agent];
            const active = agentFilter === agent;
            return <button key={agent} type="button" aria-pressed={active} onClick={() => { setAgentFilter(agent); setSearch(""); }}
              className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition sm:px-4 ${active ? `border-white/10 ${info.badge} shadow-lg shadow-black/10` : "border-transparent text-gray-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-gray-200"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/15 text-sm font-semibold ${info.accent}`}>{info.icon}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold sm:text-sm">{info.label}</span><span className="mt-0.5 block text-[10px] text-gray-500">{agentCounts[agent]} loaded</span></span>
            </button>;
          })}
        </nav>

        <section className="mt-6" aria-labelledby="selected-agent-history">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${selectedAgent.badge} text-lg font-semibold`}>{selectedAgent.icon}</div>
              <div>
                <h2 id="selected-agent-history" className="text-lg font-semibold">{selectedAgent.label} history</h2>
                <p className="mt-0.5 text-xs text-gray-500">{selectedAgent.description}</p>
              </div>
            </div>
            <Link href={`/agents/${agentFilter}`} className="rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-violet-400">New {selectedAgent.label} chat</Link>
          </div>

          <label className="relative block">
            <span className="sr-only">Search {selectedAgent.label} conversations</span>
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${selectedAgent.label} chats by title or message…`}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-gray-500 focus:border-violet-400/50" />
          </label>

          {filteredConversations.length === 0
            ? <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center sm:p-10">
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${selectedAgent.badge} text-xl`}>{selectedAgent.icon}</div>
              <h3 className="mt-4 font-semibold text-white">{search ? "No chats match your search" : `No ${selectedAgent.label} chats here yet`}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">{search ? "Try another title or phrase, or clear the search." : hasMore ? "Older conversations may be further down your history. Load more to find them." : `Start a conversation with the ${selectedAgent.label} and it will appear in this view.`}</p>
              {search
                ? <button type="button" onClick={() => setSearch("")} className="mt-4 text-xs text-violet-300 hover:text-violet-200">Clear search</button>
                : <Link href={`/agents/${agentFilter}`} className="mt-4 inline-flex rounded-xl border border-white/10 px-4 py-2.5 text-xs text-gray-200 transition hover:bg-white/5">Open {selectedAgent.label}</Link>}
            </div>
            : <>
              <p className="mt-3 text-xs text-gray-600">Showing {filteredConversations.length} {filteredConversations.length === 1 ? "chat" : "chats"} in {selectedAgent.label}.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {filteredConversations.map((conversation) => <article key={conversation.id} className="group relative rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.045] to-white/[0.018] p-4 transition hover:-translate-y-0.5 hover:border-violet-300/25 hover:shadow-xl hover:shadow-black/20 sm:p-5">
                  <Link href={`/agents/${conversation.agent}?chat=${encodeURIComponent(conversation.id)}`} className="block min-w-0 pr-14">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${selectedAgent.badge}`}>{selectedAgent.label}</span>
                    <h3 className="mt-3 truncate text-sm font-semibold text-white" title={conversation.title}>{conversation.title}</h3>
                    <p className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-gray-400">{getPreview(conversation)}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
                      <span>Updated {formatDate(conversation.updatedAt)}</span><span aria-hidden="true" className="text-gray-700">·</span>
                      <span>{conversation.messages.length} {conversation.messages.length === 1 ? "message" : "messages"}</span>
                    </div>
                  </Link>
                  <button type="button" disabled={deletingId === conversation.id} onClick={() => handleDelete(conversation.id)} aria-label={`Delete ${conversation.title}`}
                    className="absolute right-4 top-4 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-gray-500 transition hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
                    {deletingId === conversation.id ? "Deleting…" : "Delete"}
                  </button>
                </article>)}
              </div>
            </>}
        </section>

        {hasMore && <button type="button" onClick={() => void loadMoreConversations()} disabled={loadingMore} className="mt-7 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 disabled:opacity-50">{loadingMore ? "Loading more chats…" : `Load more history${totalCount !== null ? ` · ${Math.max(0, totalCount - conversations.length)} older chats` : ""}`}</button>}
      </>}
    </main>
  );
}

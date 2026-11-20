"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Conversation = { id: string; title: string; agent: string; updatedAt?: string; updated_at?: string };

const agents = [
  { href: "/agents/coding", icon: "⌘", tone: "from-sky-400/20 to-indigo-500/5", color: "text-sky-200", label: "Coding", description: "Build, debug, and review code", tag: "DEVELOP" },
  { href: "/agents/pdf", icon: "▤", tone: "from-rose-400/20 to-orange-500/5", color: "text-rose-200", label: "PDF Analyst", description: "Explore reports and long documents", tag: "ANALYZE" },
  { href: "/agents/research", icon: "⌕", tone: "from-amber-300/20 to-orange-500/5", color: "text-amber-100", label: "Research", description: "Find answers with live citations", tag: "DISCOVER" },
  { href: "/agents/knowledge", icon: "◈", tone: "from-emerald-300/20 to-teal-500/5", color: "text-emerald-200", label: "Knowledge", description: "Ask questions across your files", tag: "RETRIEVE" },
];

function relativeDate(value?: string) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationCount, setConversationCount] = useState<number | null>(null);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [conversationResponse, documentResponse] = await Promise.all([
        fetch("/api/conversations?page=1&limit=5", { cache: "no-store" }),
        fetch("/api/documents?page=1&limit=1", { cache: "no-store" }),
      ]);
      if (conversationResponse.ok) {
        const data = await conversationResponse.json();
        const list = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(list);
        setConversationCount(typeof data.totalCount === "number" ? data.totalCount : list.length);
      } else setHistoryAvailable(false);
      if (documentResponse.ok) {
        const data = await documentResponse.json();
        setDocumentCount(typeof data.totalCount === "number" ? data.totalCount : 0);
      }
    } catch {
      setHistoryAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <main className="mx-auto max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
    <section className="dashboard-hero relative overflow-hidden rounded-[28px] border border-violet-200/[.13] bg-[#11101a] px-6 py-8 shadow-[0_30px_90px_rgba(0,0,0,.22)] sm:px-10 sm:py-11">
      <div className="dashboard-hero-orb pointer-events-none absolute -right-12 -top-32 h-80 w-80 rounded-full bg-violet-500/20 blur-[90px]" />
      <div className="dashboard-hero-orb pointer-events-none absolute bottom-[-100px] right-[28%] h-48 w-48 rounded-full bg-indigo-500/10 blur-[70px]" />
      <div className="relative max-w-2xl">
        <p className="eyebrow text-[10px] font-semibold uppercase">Your private AI studio</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-.035em] sm:text-[42px] sm:leading-[1.12]">Make room for <span className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-indigo-200 bg-clip-text text-transparent">better thinking.</span></h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-gray-400 sm:text-[15px]">One calm workspace for building with code, understanding documents, and finding answers worth trusting.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/agents" className="rounded-xl bg-violet-300 px-5 py-3 text-sm font-semibold text-[#171322] shadow-lg shadow-violet-950/30 transition hover:bg-violet-200">Explore your agents <span aria-hidden="true">↗</span></Link>
          <Link href="/documents" className="rounded-xl border border-white/[.12] bg-white/[.035] px-5 py-3 text-sm font-medium text-gray-200 transition hover:bg-white/[.08]">Add a document</Link>
        </div>
      </div>
      <div className="relative mt-8 grid grid-cols-2 gap-3 border-t border-white/[.08] pt-5 sm:absolute sm:bottom-8 sm:right-9 sm:mt-0 sm:w-52 sm:grid-cols-1 sm:border-0 sm:pt-0">
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><p className="text-[10px] uppercase tracking-[.15em] text-gray-500">Specialist agents</p><p className="mt-1.5 text-2xl font-semibold">04</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><p className="text-[10px] uppercase tracking-[.15em] text-gray-500">Your documents</p><p className="mt-1.5 text-2xl font-semibold">{documentCount ?? "—"}</p></div>
      </div>
    </section>

    <section className="mt-10 sm:mt-12">
      <div className="mb-4 flex items-end justify-between gap-3"><div><p className="eyebrow text-[10px] font-semibold uppercase">Made for the work</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Choose your starting point</h2></div><Link href="/agents" className="text-xs font-medium text-violet-300 transition hover:text-violet-200">All agents <span aria-hidden="true">↗</span></Link></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {agents.map((agent, index) => <Link key={agent.href} href={agent.href} className="dashboard-agent-card surface-card-hover group surface-card relative overflow-hidden rounded-2xl p-5 transition duration-200 hover:-translate-y-1 hover:border-violet-200/20 hover:bg-white/[.065]">
          <div className={`pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-gradient-to-br ${agent.tone} blur-2xl transition duration-300 group-hover:scale-125`} />
          <div className="relative flex items-center justify-between"><span className={`flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[.08] bg-white/[.045] text-2xl ${agent.color}`}>{agent.icon}</span><span className="text-[9px] font-semibold tracking-[.15em] text-gray-600">0{index + 1} / {agent.tag}</span></div>
          <h3 className="relative mt-5 text-[15px] font-semibold text-gray-100">{agent.label}</h3><p className="relative mt-1.5 text-xs leading-5 text-gray-500">{agent.description}</p>
          <span className="relative mt-5 inline-flex items-center gap-2 text-xs font-medium text-violet-300">Open agent <span className="transition group-hover:translate-x-1">→</span></span>
        </Link>)}
      </div>
    </section>

    <section className="mt-10 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="surface-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="eyebrow text-[10px] font-semibold uppercase">Pick up where you left off</p><div className="mt-2 flex items-baseline gap-2"><h2 className="text-lg font-semibold">Recent conversations</h2>{conversationCount !== null && historyAvailable && <span className="text-[11px] text-gray-600">{conversationCount} saved</span>}</div></div><Link href="/history" className="text-xs text-gray-500 transition hover:text-violet-300">View history →</Link></div>
        {loading ? <p role="status" className="mt-6 text-sm text-gray-500">Loading conversations…</p> : !historyAvailable ? <p className="mt-6 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm text-gray-400">Conversation storage is unavailable. Check the Supabase setup in Settings.</p> : conversations.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-white/[.1] px-4 py-7 text-center"><p className="text-sm font-medium text-gray-300">Your next idea starts here.</p><p className="mt-1 text-xs text-gray-500">Start a conversation and it will be waiting here.</p></div> : <ul className="mt-4 divide-y divide-white/[.07]">{conversations.map((conversation) => <li key={conversation.id}><Link href={`/agents/${conversation.agent}?chat=${encodeURIComponent(conversation.id)}`} className="group flex items-center gap-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-400/[.09] text-sm text-violet-200">✦</span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-gray-200 transition group-hover:text-violet-200">{conversation.title || "Untitled conversation"}</span><span className="mt-1 block text-[11px] capitalize text-gray-600">{conversation.agent} agent</span></span><span className="shrink-0 text-[11px] text-gray-600">{relativeDate(conversation.updatedAt ?? conversation.updated_at)}</span></Link></li>)}</ul>}
      </div>
      <div className="surface-card flex flex-col justify-between rounded-2xl p-5 sm:p-6">
        <div><p className="eyebrow text-[10px] font-semibold uppercase">Personal knowledge</p><h2 className="mt-2 text-lg font-semibold">Give your AI context.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">Keep your notes and reference files close. Knowledge Agent can search your private library when you need an answer grounded in your own material.</p></div>
        <div className="mt-6 flex items-center justify-between rounded-xl border border-white/[.07] bg-black/20 p-4"><div><p className="text-xl font-semibold">{documentCount ?? "—"}</p><p className="mt-1 text-[11px] text-gray-600">documents indexed</p></div><Link href="/documents" className="rounded-lg border border-white/[.1] px-3.5 py-2 text-xs font-medium text-gray-300 transition hover:border-violet-300/25 hover:text-violet-200">Open library →</Link></div>
      </div>
    </section>
  </main>;
}

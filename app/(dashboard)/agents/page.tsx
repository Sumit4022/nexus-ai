import Link from "next/link";

const agents = [
  { href: "/agents/coding", number: "01", icon: "⌘", name: "Coding Agent", category: "DEVELOPMENT", description: "Move from rough idea to working code. Generate features, explain unfamiliar systems, debug errors, and review changes with focused coding modes.", examples: ["Build a feature", "Debug an error", "Review code"], color: "text-sky-200", glow: "from-sky-400/20" },
  { href: "/agents/pdf", number: "02", icon: "▤", name: "PDF Analyst", category: "DOCUMENT ANALYSIS", description: "Ask precise questions about reports and long documents. Explore page content, inspect charts, and get answers anchored to the source.", examples: ["Summarize a report", "Find a key detail", "Read a chart"], color: "text-rose-200", glow: "from-rose-400/20" },
  { href: "/agents/research", number: "03", icon: "⌕", name: "Research Agent", category: "WEB RESEARCH", description: "Investigate a question with live web search, then turn the results into a concise brief with linked citations you can follow.", examples: ["Compare approaches", "Research a topic", "Trace sources"], color: "text-amber-100", glow: "from-amber-300/20" },
  { href: "/agents/knowledge", number: "04", icon: "◈", name: "Knowledge Agent", category: "PERSONAL KNOWLEDGE", description: "Search your own document library using indexed retrieval. Answers cite the passages that support them, with your files kept private to your account.", examples: ["Search your notes", "Ask across files", "Find a passage"], color: "text-emerald-200", glow: "from-emerald-300/20" },
];

export default function AgentsPage() {
  return <main className="mx-auto max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
    <div className="mb-8 max-w-2xl"><p className="eyebrow text-[10px] font-semibold uppercase">Specialists, working together</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Meet your agents</h1><p className="mt-3 text-sm leading-6 text-gray-500 sm:text-[15px]">Each agent is tuned for a different kind of thinking, with the right tools and context for the task in front of you.</p></div>
    <div className="agent-showcase-grid grid gap-4 lg:grid-cols-2">
      {agents.map((agent) => <Link key={agent.href} href={agent.href} className="agent-showcase-card group surface-card relative overflow-hidden rounded-[22px] p-6 transition duration-200 hover:-translate-y-1 hover:border-violet-200/20 sm:p-7">
        <div className={`pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gradient-to-br ${agent.glow} to-transparent blur-3xl transition group-hover:scale-125`} />
        <div className="relative flex items-start justify-between gap-4"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[.09] bg-white/[.04] text-2xl ${agent.color}`}>{agent.icon}</span><span className="text-[10px] font-semibold tracking-[.16em] text-gray-600">{agent.number} / {agent.category}</span></div>
        <h2 className="relative mt-5 text-xl font-semibold tracking-tight">{agent.name}</h2><p className="relative mt-2 max-w-xl text-sm leading-6 text-gray-500">{agent.description}</p>
        <div className="relative mt-5 flex flex-wrap gap-2">{agent.examples.map((example) => <span key={example} className="rounded-full border border-white/[.07] bg-black/10 px-3 py-1.5 text-[11px] text-gray-500">{example}</span>)}</div>
        <span className="relative mt-6 inline-flex items-center gap-2 text-xs font-semibold text-violet-300">Open agent <span className="transition group-hover:translate-x-1">→</span></span>
      </Link>)}
    </div>
    <p className="mt-8 text-center text-xs text-gray-600">Your workspace is private. Each agent uses only the services configured for your account.</p>
  </main>;
}

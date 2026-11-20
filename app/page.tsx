import Link from "next/link";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";

const capabilities = [
  { href: "/agents/coding", symbol: "⌘", title: "Build with code", text: "From a blank file to a careful review, keep your engineering work moving.", tone: "text-sky-200" },
  { href: "/agents/pdf", symbol: "▤", title: "Understand documents", text: "Ask questions about reports, papers, and the details inside PDFs.", tone: "text-rose-200" },
  { href: "/agents/research", symbol: "⌕", title: "Research with sources", text: "Turn live web results into clear answers with citations to explore.", tone: "text-amber-100" },
  { href: "/agents/knowledge", symbol: "◈", title: "Find what you know", text: "Search a private library of notes and files with cited passages.", tone: "text-emerald-200" },
];

export default function Home() {
  return <main className="app-shell pb-16 text-white md:pb-0"><div className="flex min-h-screen"><Sidebar /><section className="min-w-0 flex-1"><Topbar />
    <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
      <section className="relative overflow-hidden rounded-[30px] border border-violet-200/[.13] bg-[#11101a] px-6 py-10 sm:px-12 sm:py-14">
        <div className="pointer-events-none absolute -right-10 -top-36 h-[420px] w-[420px] rounded-full bg-violet-500/[.19] blur-[100px]" />
        <div className="pointer-events-none absolute bottom-[-140px] left-[36%] h-64 w-64 rounded-full bg-indigo-500/[.13] blur-[90px]" />
        <div className="relative max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full border border-violet-300/[.14] bg-violet-300/[.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-violet-200"><span className="h-1.5 w-1.5 rounded-full bg-violet-300" /> A quieter kind of AI workspace</div>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.06] tracking-[-.045em] sm:text-6xl">Bring your work<br className="hidden sm:block" /> into <span className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-indigo-200 bg-clip-text text-transparent">focus.</span></h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-gray-400 sm:text-base sm:leading-7">Four specialist AI agents. One private workspace. Build software, understand your documents, research with citations, and find answers across your own knowledge.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/dashboard" className="rounded-xl bg-violet-300 px-5 py-3 text-sm font-semibold text-[#171322] shadow-lg shadow-violet-950/30 transition hover:bg-violet-200">Enter your workspace <span aria-hidden="true">↗</span></Link><Link href="/agents" className="rounded-xl border border-white/[.12] bg-white/[.035] px-5 py-3 text-sm font-medium text-gray-200 transition hover:bg-white/[.08]">Meet the agents</Link></div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/[.08] pt-5 text-[11px] text-gray-500"><span><b className="mr-2 text-violet-200">✳</b>Purpose-built agents</span><span><b className="mr-2 text-violet-200">◈</b>Private document library</span><span><b className="mr-2 text-violet-200">↗</b>Answers with sources</span></div>
        </div>
      </section>
      <section className="mt-10 sm:mt-12"><div className="mb-4"><p className="eyebrow text-[10px] font-semibold uppercase">A tool for every kind of thinking</p><h2 className="mt-2 text-xl font-semibold tracking-tight">What are you working on?</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{capabilities.map((item, i) => <Link href={item.href} key={item.href} className="group surface-card rounded-2xl p-5 transition duration-200 hover:-translate-y-1 hover:border-violet-200/20"><div className="flex items-center justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.04] text-xl ${item.tone}`}>{item.symbol}</span><span className="text-[10px] tracking-[.14em] text-gray-600">0{i + 1}</span></div><h3 className="mt-5 text-sm font-semibold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-gray-500">{item.text}</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-violet-300">Get started <span className="transition group-hover:translate-x-1">→</span></span></Link>)}</div>
      </section>
    </div>
  </section></div></main>;
}

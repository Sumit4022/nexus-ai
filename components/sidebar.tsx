"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UiIcon, { type IconName } from "@/components/ui-icon";

const navigation = [
  { href: "/dashboard", icon: "home", label: "Overview" },
  { href: "/agents", icon: "sparkles", label: "AI Agents" },
  { href: "/documents", icon: "file", label: "Documents" },
  { href: "/history", icon: "clock", label: "History" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] md:sticky md:top-0 md:flex md:h-screen md:w-[260px] md:shrink-0 md:flex-col md:border-r md:border-t-0 md:px-4 md:py-6">
      <Link href="/dashboard" className="mb-10 hidden items-center gap-3 px-3 md:flex">
        <span className="brand-mark flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-semibold text-white">N</span>
        <span>
          <span className="block text-[15px] font-semibold tracking-[.16em] text-white">NEXUS<span className="text-violet-300"> AI</span></span>
          <span className="mt-0.5 block text-[11px] text-gray-500">Your intelligent workspace</span>
        </span>
      </Link>

      <p className="mb-3 hidden px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-gray-600 md:block">Workspace</p>
      <nav aria-label="Main navigation" className="flex items-stretch justify-around gap-1 px-2 py-2 md:flex-col md:gap-1.5 md:px-0 md:py-0">
        {navigation.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={`group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] transition md:flex-none md:flex-row md:justify-start md:gap-3 md:px-3 md:py-3 md:text-[13px] ${active ? "bg-violet-400/[.12] font-medium text-violet-100 ring-1 ring-inset ring-violet-300/[.12]" : "text-gray-500 hover:bg-white/[.045] hover:text-gray-200"}`}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition md:h-8 md:w-8 ${active ? "bg-violet-300/[.12] text-violet-200" : "text-gray-500 group-hover:bg-white/[.05] group-hover:text-gray-200"}`}><UiIcon name={item.icon as IconName} className="h-[18px] w-[18px]" /></span>
              <span className="truncate text-[10px] md:text-[13px]">{item.label}</span>
              {active && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-violet-300 md:block" />}
            </Link>
          );
        })}
      </nav>

      <Link href="/agents/coding" className="sidebar-cta mt-6 hidden items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition md:flex">
        <UiIcon name="plus" className="h-4 w-4" /> Start a conversation
      </Link>

      <div className="sidebar-note mt-auto hidden rounded-2xl p-4 md:block">
        <div className="flex items-center gap-2 text-xs font-medium text-violet-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />Private by design</div>
        <p className="mt-2 text-[11px] leading-5 text-gray-500">Your agents, documents, and conversations live in your own workspace.</p>
      </div>
    </aside>
  );
}

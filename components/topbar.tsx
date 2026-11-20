"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import UiIcon from "@/components/ui-icon";

export default function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [initial, setInitial] = useState("?");
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    function syncUser(user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]) {
      const name = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
      const firstCharacter = (name || user?.email || "?").trim().charAt(0).toUpperCase();
      if (active) {
        setIsSignedIn(Boolean(user));
        setEmail(user?.email ?? "");
        setDisplayName(name);
        setInitial(firstCharacter || "?");
      }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => syncUser(session?.user ?? null));
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      syncUser(user);
    }).catch(() => undefined);
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutside(event: MouseEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const pageTitle = pathname === "/" ? "Home"
    : pathname === "/dashboard" ? "Dashboard"
      : pathname === "/agents" ? "Agents"
        : pathname.startsWith("/agents/coding") ? "Coding Agent"
          : pathname.startsWith("/agents/pdf") ? "PDF Agent"
            : pathname.startsWith("/agents/research") ? "Research Agent"
              : pathname.startsWith("/agents/knowledge") ? "Knowledge Agent"
                : pathname === "/documents" ? "Documents"
                  : pathname === "/history" ? "History"
        : pathname === "/settings" ? "Settings"
          : pathname.startsWith("/account/edit") ? "Edit account details"
            : pathname === "/account" ? "Your account"
                      : "Workspace";

  async function handleSignOut() {
    setSigningOut(true);
    setError("");

    let signOutError: { message: string } | null = null;
    try {
      const supabase = createClient();
      ({ error: signOutError } = await supabase.auth.signOut());
    } catch {
      signOutError = { message: "Could not reach the authentication service. Try again." };
    }

    if (signOutError) {
      setError(signOutError.message);
      setSigningOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="app-topbar sticky top-0 z-40 flex h-[70px] items-center justify-between border-b border-white/[0.07] px-5 sm:px-8">
      <div className="flex items-center gap-3">
        <span className="hidden h-8 w-1 rounded-full bg-gradient-to-b from-violet-300 to-indigo-500 sm:block" />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[.18em] text-gray-600">Workspace</p>
          <h2 className="mt-0.5 text-sm font-medium text-gray-100">{pageTitle}</h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/agents"
          title="Browse agents"
          className="topbar-agents-link inline-flex items-center gap-2 rounded-xl border border-white/[.09] bg-white/[.025] px-3.5 py-2 text-sm text-gray-300 transition hover:border-violet-300/20 hover:bg-violet-300/[.07] hover:text-violet-100"
        >
          <UiIcon name="sparkles" className="h-4 w-4 text-violet-300" /><span className="hidden sm:inline">Explore agents</span>
        </Link>

        {isSignedIn ? <div ref={menuRef} className="relative">
          <button type="button" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-xl border border-transparent py-1 pl-2 pr-1 transition hover:border-white/10 hover:bg-white/[.04] sm:gap-3 sm:pl-3">
            <span className="hidden max-w-40 truncate text-xs text-gray-400 sm:block">{displayName || email}</span>
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-violet-950/30">{initial}</span>
            <UiIcon name="chevron" className={`hidden h-4 w-4 text-gray-500 transition sm:block ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          {menuOpen && <div role="menu" aria-label="Account options" className="account-menu absolute right-0 top-[calc(100%+12px)] z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#12121a] shadow-2xl shadow-black/50">
            <div className="border-b border-white/[.08] px-4 py-4">
              <p className="text-sm font-semibold text-white">{displayName || "Your account"}</p>
              <p className="mt-1 truncate text-xs text-gray-500">{email}</p>
            </div>
            <div className="p-2">
              <Link role="menuitem" href="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 transition hover:bg-white/[.06]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-300/[.08] text-violet-200"><UiIcon name="user" className="h-[18px] w-[18px]" /></span><span><span className="block">Your account</span><span className="mt-0.5 block text-xs text-gray-500">Profile and sign-in details</span></span>
              </Link>
              <Link role="menuitem" href="/account/edit" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 transition hover:bg-white/[.06]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-300/[.08] text-violet-200"><UiIcon name="edit" className="h-[18px] w-[18px]" /></span><span><span className="block">Edit account details</span><span className="mt-0.5 block text-xs text-gray-500">Name, email, and password</span></span>
              </Link>
              <Link role="menuitem" href="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 transition hover:bg-white/[.06]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-300/[.08] text-violet-200"><UiIcon name="settings" className="h-[18px] w-[18px]" /></span><span><span className="block">Settings</span><span className="mt-0.5 block text-xs text-gray-500">Services and workspace</span></span>
              </Link>
            </div>
            {error && <p role="alert" className="mx-3 mb-2 rounded-lg border border-red-500/20 bg-red-500/[.08] px-3 py-2 text-xs text-red-300">Sign out failed: {error}</p>}
            <div className="border-t border-white/[.08] p-2">
              <button role="menuitem" type="button" onClick={handleSignOut} disabled={signingOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-200 transition hover:bg-red-500/[.08] disabled:opacity-50">
                <UiIcon name="logout" className="h-4 w-4" />{signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>}
        </div> : <Link href="/login" className="rounded-xl border border-white/[.09] px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-white/[.06]">Sign in</Link>}
      </div>
    </header>
  );
}

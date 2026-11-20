"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
    const [user, setUser] = useState<{ email: string; name: string; createdAt: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        void createClient().auth.getUser().then(({ data, error: authError }) => {
            if (!active) return;
            if (authError || !data.user) setError("Your account could not be loaded. Please sign in again.");
            else setUser({ email: data.user.email ?? "", name: typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : "", createdAt: data.user.created_at });
            setLoading(false);
        }).catch(() => {
            if (active) { setError("Your account could not be loaded. Please try again."); setLoading(false); }
        });
        return () => { active = false; };
    }, []);

    return <main className="mx-auto max-w-5xl px-5 py-10 text-white sm:px-8">
        <p className="text-xs font-medium uppercase tracking-[.18em] text-violet-300">ACCOUNT</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-3xl font-semibold tracking-tight">Your account</h1><p className="mt-2 text-sm text-gray-400">A quick overview of your profile and sign-in details.</p></div>
            <Link href="/account/edit" className="rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-semibold text-[#171322] transition hover:bg-violet-200">Edit account details →</Link>
        </div>
        {error && <p role="alert" className="mt-6 rounded-xl border border-red-400/25 bg-red-500/[.08] px-4 py-3 text-sm text-red-200">{error}</p>}
        {loading ? <div className="surface-card mt-8 rounded-2xl p-6 text-sm text-gray-400">Loading your account…</div> : user && <>
            <section className="surface-card mt-8 rounded-2xl p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-5">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-600 text-2xl font-semibold">{(user.name || user.email || "?").trim().charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-[.15em] text-violet-300">Personal profile</p><h2 className="mt-1 truncate text-xl font-semibold">{user.name || "Welcome to NEXUS AI"}</h2><p className="mt-1 truncate text-sm text-gray-400">{user.email}</p></div>
                </div>
            </section>
            <section className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="surface-card rounded-2xl p-5"><p className="text-xs uppercase tracking-wide text-gray-500">Email address</p><p className="mt-2 break-all text-sm text-gray-200">{user.email}</p><p className="mt-2 text-xs text-gray-500">Used to sign in and receive account updates.</p></div>
                <div className="surface-card rounded-2xl p-5"><p className="text-xs uppercase tracking-wide text-gray-500">Member since</p><p className="mt-2 text-sm text-gray-200">{user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}</p><p className="mt-2 text-xs text-gray-500">Your personal workspace is ready.</p></div>
            </section>
        </>}
    </main>;
}

"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    async function sendResetLink(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true); setError(""); setSent(false);
        try {
            const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
            });
            if (resetError) throw resetError;
            setSent(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not send a reset link. Please try again.");
        } finally { setLoading(false); }
    }

    return <main className="auth-page flex min-h-screen items-center justify-center px-5 py-10 text-white">
        <div className="w-full max-w-md">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xl font-semibold tracking-[.12em]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 text-sm tracking-normal">N</span>NEXUS<span className="text-violet-300"> AI</span></Link>
            <section className="auth-panel rounded-[24px] p-7 sm:p-9">
                <p className="eyebrow text-[10px] font-semibold uppercase">ACCOUNT RECOVERY</p>
                <h1 className="mt-3 text-3xl font-semibold">Reset your password</h1>
                <p className="mt-2 text-sm leading-6 text-gray-400">Enter the email address for your account. We’ll send you a secure link to choose a new password.</p>
                {sent ? <div role="status" className="mt-7 rounded-xl border border-emerald-400/20 bg-emerald-500/[.07] p-4 text-sm leading-6 text-emerald-100">If an account uses <span className="font-medium">{email}</span>, a password reset link is on its way. Check your inbox and spam folder.</div> : <form onSubmit={sendResetLink} className="mt-7 space-y-5">
                    <label htmlFor="recovery-email" className="block text-sm text-gray-300">Email address<input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-white/[.1] bg-black/25 px-4 py-3.5 text-sm outline-none transition placeholder:text-gray-600 focus:border-violet-300/60" /></label>
                    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                    <button type="submit" disabled={loading} className="w-full rounded-xl bg-violet-300 px-4 py-3.5 text-sm font-semibold text-[#171322] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Sending link…" : "Send reset link"}</button>
                </form>}
                <p className="mt-6 text-center text-sm text-gray-400"><Link href="/login" className="font-medium text-violet-300 hover:text-violet-200">← Back to sign in</Link></p>
            </section>
        </div>
    </main>;
}

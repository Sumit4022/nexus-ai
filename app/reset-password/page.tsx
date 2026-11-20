"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [checking, setChecking] = useState(true);
    const [hasRecoverySession, setHasRecoverySession] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        void createClient().auth.getSession().then(({ data }) => {
            if (active) { setHasRecoverySession(Boolean(data.session)); setChecking(false); }
        }).catch(() => {
            if (active) { setHasRecoverySession(false); setChecking(false); }
        });
        return () => { active = false; };
    }, []);

    async function updatePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setError("");
        if (password.length < 8) { setError("Choose a password with at least 8 characters."); return; }
        if (password !== confirmPassword) { setError("The passwords do not match."); return; }
        setSaving(true);
        try {
            const { error: updateError } = await createClient().auth.updateUser({ password });
            if (updateError) throw updateError;
            await createClient().auth.signOut();
            router.replace("/login?password_reset=success");
            router.refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not update your password. Request a new reset link and try again.");
        } finally { setSaving(false); }
    }

    return <main className="auth-page flex min-h-screen items-center justify-center px-5 py-10 text-white">
        <div className="w-full max-w-md">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xl font-semibold tracking-[.12em]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 text-sm tracking-normal">N</span>NEXUS<span className="text-violet-300"> AI</span></Link>
            <section className="auth-panel rounded-[24px] p-7 sm:p-9">
                <p className="eyebrow text-[10px] font-semibold uppercase">ACCOUNT RECOVERY</p>
                <h1 className="mt-3 text-3xl font-semibold">Choose a new password</h1>
                {checking ? <p className="mt-3 text-sm text-gray-400">Checking your secure reset link…</p> : !hasRecoverySession ? <>
                    <p className="mt-3 text-sm leading-6 text-gray-400">This reset link is invalid or has expired. Request a fresh link to continue.</p>
                    <Link href="/forgot-password" className="mt-6 block rounded-xl bg-violet-300 px-4 py-3.5 text-center text-sm font-semibold text-[#171322] transition hover:bg-violet-200">Request another reset link</Link>
                </> : <>
                    <p className="mt-2 text-sm text-gray-400">Choose a new password with at least 8 characters.</p>
                    <form onSubmit={updatePassword} className="mt-7 space-y-5">
                        <label className="block text-sm text-gray-300">New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.1] bg-black/25 px-4 py-3.5 text-sm outline-none transition focus:border-violet-300/60" /></label>
                        <label className="block text-sm text-gray-300">Confirm new password<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.1] bg-black/25 px-4 py-3.5 text-sm outline-none transition focus:border-violet-300/60" /></label>
                        {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                        <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-300 px-4 py-3.5 text-sm font-semibold text-[#171322] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Updating password…" : "Update password"}</button>
                    </form>
                </>}
                <p className="mt-6 text-center text-sm text-gray-400"><Link href="/login" className="font-medium text-violet-300 hover:text-violet-200">← Back to sign in</Link></p>
            </section>
        </div>
    </main>;
}

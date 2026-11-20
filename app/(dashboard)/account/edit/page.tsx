"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const inputClass = "mt-2 w-full rounded-xl border border-white/[.1] bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-300/60";

export default function EditAccountPage() {
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        let active = true;
        void createClient().auth.getUser().then(({ data, error: authError }) => {
            if (!active) return;
            if (authError || !data.user) setError("Your account could not be loaded. Please sign in again.");
            else {
                setEmail(data.user.email ?? "");
                setName(typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : "");
            }
            setLoading(false);
        }).catch(() => {
            if (active) { setError("Your account could not be loaded. Please try again."); setLoading(false); }
        });
        return () => { active = false; };
    }, []);

    async function saveProfile(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setError(""); setSuccess(""); setSavingProfile(true);
        try {
            const { error: updateError } = await createClient().auth.updateUser({ email: email.trim(), data: { full_name: name.trim() } });
            if (updateError) throw updateError;
            setSuccess("Your profile was saved. If you changed your email, follow the confirmation link sent to the new address.");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your profile. Please try again."); }
        finally { setSavingProfile(false); }
    }

    async function savePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setError(""); setSuccess("");
        if (newPassword.length < 8) { setError("Choose a password with at least 8 characters."); return; }
        if (newPassword !== confirmPassword) { setError("The passwords do not match."); return; }
        setSavingPassword(true);
        try {
            const { error: updateError } = await createClient().auth.updateUser({ password: newPassword });
            if (updateError) throw updateError;
            setNewPassword(""); setConfirmPassword(""); setSuccess("Your password has been updated.");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update your password. Please try again."); }
        finally { setSavingPassword(false); }
    }

    return <main className="mx-auto max-w-4xl px-5 py-10 text-white sm:px-8">
        <Link href="/account" className="text-sm text-violet-300 hover:text-violet-200">← Your account</Link>
        <p className="mt-7 text-xs font-medium uppercase tracking-[.18em] text-violet-300">ACCOUNT SETTINGS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Edit account details</h1>
        <p className="mt-2 text-sm text-gray-400">Update your profile information and sign-in password.</p>
        {error && <p role="alert" className="mt-6 rounded-xl border border-red-400/25 bg-red-500/[.08] px-4 py-3 text-sm text-red-200">{error}</p>}
        {success && <p role="status" className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-500/[.07] px-4 py-3 text-sm text-emerald-200">{success}</p>}
        {loading ? <div className="surface-card mt-8 rounded-2xl p-6 text-sm text-gray-400">Loading your details…</div> : <>
            <section className="surface-card mt-7 rounded-2xl p-5 sm:p-7">
                <h2 className="text-lg font-semibold">Profile information</h2>
                <p className="mt-1 text-sm text-gray-400">Your display name appears in the account menu. Email changes may need confirmation.</p>
                <form onSubmit={saveProfile} className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm text-gray-300">Full name<input className={inputClass} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" maxLength={80} /></label>
                    <label className="block text-sm text-gray-300">Email address<input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                    <div className="sm:col-span-2"><button type="submit" disabled={savingProfile} className="rounded-xl bg-violet-300 px-5 py-3 text-sm font-semibold text-[#171322] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60">{savingProfile ? "Saving…" : "Save profile"}</button></div>
                </form>
            </section>
            <section id="password" className="surface-card mt-5 scroll-mt-24 rounded-2xl p-5 sm:p-7">
                <h2 className="text-lg font-semibold">Change password</h2><p className="mt-1 text-sm text-gray-400">Choose a password with at least 8 characters.</p>
                <form onSubmit={savePassword} className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm text-gray-300">New password<input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" /></label>
                    <label className="block text-sm text-gray-300">Confirm new password<input className={inputClass} type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></label>
                    <div className="sm:col-span-2"><button type="submit" disabled={savingPassword} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-gray-200 transition hover:bg-white/[.05] disabled:cursor-not-allowed disabled:opacity-60">{savingPassword ? "Updating…" : "Update password"}</button></div>
                </form>
            </section>
        </>}
    </main>;
}

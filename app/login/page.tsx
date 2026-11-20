"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const passwordResetSucceeded = searchParams.get("password_reset") === "success";

    async function handleLogin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setLoading(true);
        setError("");

        try {
            const supabase = createClient();

            const { error: loginError } =
                await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

            if (loginError) {
                setError(
                    "Unable to sign in. Check your email and password."
                );
                return;
            }

            const requestedPath = searchParams.get("next");

            // Only allow local application paths.
            const destination =
                requestedPath &&
                    requestedPath.startsWith("/") &&
                    !requestedPath.startsWith("//") &&
                    !requestedPath.startsWith("/login") &&
                    !requestedPath.startsWith("/signup")
                    ? requestedPath
                    : "/dashboard";

            router.replace(destination);
            router.refresh();
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="auth-page flex min-h-screen items-center justify-center px-5 py-10 text-white">
            <div className="w-full max-w-md">
                <Link
                    href="/"
                className="mb-8 inline-flex items-center gap-2 text-xl font-semibold tracking-[.12em]"
                >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 text-sm tracking-normal">N</span>NEXUS<span className="text-violet-300"> AI</span>
                </Link>

                <div className="auth-panel rounded-[24px] p-7 sm:p-9">
                    <p className="eyebrow text-[10px] font-semibold uppercase">
                        YOUR AI WORKSPACE
                    </p>

                    <h1 className="mt-3 text-3xl font-semibold">
                        Welcome back
                    </h1>

                    <p className="mt-2 text-sm text-gray-400">
                        Sign in to continue working with your AI agents.
                    </p>

                    {passwordResetSucceeded && <p role="status" className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-500/[.07] p-3 text-sm text-emerald-200">Your password was updated. Sign in with your new password.</p>}

                    <form onSubmit={handleLogin} className="mt-8 space-y-5">
                        <div>
                            <label
                                htmlFor="email"
                                className="mb-2 block text-sm text-gray-300"
                            >
                                Email address
                            </label>

                        <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@example.com"
                                className="w-full rounded-xl border border-white/[.1] bg-black/25 px-4 py-3.5 text-sm outline-none transition placeholder:text-gray-700 focus:border-violet-300/60 focus:bg-black/35"
                            />
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label htmlFor="password" className="block text-sm text-gray-300">Password</label>
                                <Link href="/forgot-password" className="text-xs font-medium text-violet-300 transition hover:text-violet-200">Forgot password?</Link>
                            </div>

                            <input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="Enter your password"
                                className="w-full rounded-xl border border-white/[.1] bg-black/25 px-4 py-3.5 text-sm outline-none transition placeholder:text-gray-700 focus:border-violet-300/60 focus:bg-black/35"
                            />
                        </div>

                        {error && (
                            <p
                                role="alert"
                                className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-violet-300 px-4 py-3.5 text-sm font-semibold text-[#171322] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? "Signing in..." : "Sign in"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-400">
                        New to NEXUS AI?{" "}
                        <Link
                            href="/signup"
                            className="font-medium text-violet-400 hover:text-violet-300"
                        >
                            Create an account
                        </Link>
                    </p>
                </div>

                <p className="mt-6 text-center text-xs text-gray-600">
                    Your workspace, your knowledge, your AI.
                </p>
            </div>
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
                    Loading...
                </main>
            }
        >
            <LoginForm />
        </Suspense>
    );
}

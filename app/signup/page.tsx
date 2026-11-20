"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function handleSignup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setSuccess("");

        if (password.length < 8) {
            setError("Your password must contain at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("The passwords do not match.");
            return;
        }

        setLoading(true);

        try {
            const supabase = createClient();

            const { data, error: signupError } =
                await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                });

            if (signupError) {
                setError(signupError.message);
                return;
            }

            if (data.session) {
                router.replace("/dashboard");
                router.refresh();
                return;
            }

            setSuccess(
                "Your account has been created. Check your email to confirm your address before signing in."
            );
        } catch {
            setError("Unable to create your account. Please try again.");
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
                        GET STARTED
                    </p>

                    <h1 className="mt-3 text-3xl font-semibold">
                        Create your account
                    </h1>

                    <p className="mt-2 text-sm text-gray-400">
                        Build your personal AI workspace.
                    </p>

                    <form onSubmit={handleSignup} className="mt-8 space-y-5">
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
                            <label
                                htmlFor="password"
                                className="mb-2 block text-sm text-gray-300"
                            >
                                Password
                            </label>

                            <input
                                id="password"
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                required
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="At least 8 characters"
                                className="w-full rounded-xl border border-white/[.1] bg-black/25 px-4 py-3.5 text-sm outline-none transition placeholder:text-gray-700 focus:border-violet-300/60 focus:bg-black/35"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="confirm-password"
                                className="mb-2 block text-sm text-gray-300"
                            >
                                Confirm password
                            </label>

                            <input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirmPassword}
                                onChange={(event) =>
                                    setConfirmPassword(event.target.value)
                                }
                                placeholder="Enter your password again"
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

                        {success && (
                            <p
                                role="status"
                                className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-300"
                            >
                                {success}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-violet-300 px-4 py-3.5 text-sm font-semibold text-[#171322] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? "Creating account..." : "Create account"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-400">
                        Already have an account?{" "}
                        <Link
                            href="/login"
                            className="font-medium text-violet-400 hover:text-violet-300"
                        >
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    );
}

"use client";

import { useState } from "react";
import { downloadPdf, downloadPptx, downloadText, hasCodeBlock, requestedDownloadFormat, safeFilename, type DownloadFormat } from "@/lib/file-exports";

const formats: { type: DownloadFormat; label: string; icon: string }[] = [
    { type: "pdf", label: "PDF", icon: "▤" },
    { type: "pptx", label: "PowerPoint", icon: "▧" },
    { type: "txt", label: "Text", icon: "≡" },
    { type: "code", label: "Code file", icon: "‹/›" },
];

export default function ResponseDownloads({ prompt, content, title }: { prompt: string; content: string; title?: string }) {
    const [busy, setBusy] = useState<DownloadFormat | null>(null);
    const [error, setError] = useState("");
    if (!content.trim()) return null;
    const requested = requestedDownloadFormat(prompt);
    const canDownloadCode = hasCodeBlock(content) || requested === "code";
    const filename = safeFilename(title || prompt.split(/[.!?\n]/)[0] || "nexus-answer");

    async function download(format: DownloadFormat) {
        setBusy(format); setError("");
        try {
            if (format === "pdf") downloadPdf(filename, title || prompt || "NEXUS AI response", content);
            else if (format === "pptx") await downloadPptx(filename, title || prompt || "NEXUS AI response", content);
            else if (format === "code") downloadText(filename, content, "code");
            else downloadText(filename, content, "txt");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not create this download.");
        } finally { setBusy(null); }
    }

    return <div className="mt-4 border-t border-white/[.07] pt-3">
        <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">{requested ? "Download requested file" : "Download answer"}</span>
            {formats.filter((item) => item.type !== "code" || canDownloadCode).map((item) => {
                const active = requested === item.type;
                return <button key={item.type} type="button" onClick={() => void download(item.type)} disabled={busy !== null} aria-label={`Download as ${item.label}`}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-60 ${active ? "border-violet-300/25 bg-violet-300/[.12] text-violet-100" : "border-white/[.08] bg-white/[.025] text-gray-400 hover:border-violet-300/20 hover:bg-violet-300/[.06] hover:text-gray-100"}`}>
                    <span aria-hidden="true">{item.icon}</span>{busy === item.type ? "Preparing…" : item.label}
                </button>;
            })}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </div>;
}

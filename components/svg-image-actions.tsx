"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { saveBlob, safeFilename } from "@/lib/file-exports";

const allowedElements = new Set(["svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "lineargradient", "radialgradient", "stop", "text", "tspan", "title", "desc", "clippath", "mask", "symbol", "use"]);
const allowedAttributes = new Set(["xmlns", "viewbox", "width", "height", "fill", "stroke", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "transform", "fill-opacity", "fill-rule", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity", "id", "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "font-size", "font-weight", "font-family", "text-anchor", "dominant-baseline", "preserveaspectratio", "clip-path", "mask", "href", "xlink:href"]);

function sanitizeSvg(markup: string) {
    const document = new DOMParser().parseFromString(markup, "image/svg+xml");
    const root = document.documentElement;
    if (root.localName.toLowerCase() !== "svg" || document.querySelector("parsererror")) throw new Error("This SVG code is incomplete. Ask the Coding Agent to create a complete SVG illustration.");
    for (const element of Array.from(root.querySelectorAll("*"))) {
        if (!allowedElements.has(element.localName.toLowerCase())) { element.remove(); continue; }
        for (const attribute of Array.from(element.attributes)) {
            const key = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (!allowedAttributes.has(key) || key.startsWith("on") || /javascript:|data:|https?:|\/\//i.test(value) || (/url\(/i.test(value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(value))) {
                element.removeAttribute(attribute.name);
            }
        }
    }
    if (!root.getAttribute("viewBox")) root.setAttribute("viewBox", "0 0 1024 768");
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(root);
}

export default function SvgImageActions({ source, name = "nexus-illustration" }: { source: string; name?: string }) {
    const [safeMarkup, setSafeMarkup] = useState("");
    const [sanitizeError, setSanitizeError] = useState("");
    const [error, setError] = useState("");
    const [savingPng, setSavingPng] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            try { setSafeMarkup(sanitizeSvg(source)); setSanitizeError(""); }
            catch (cause) { setSafeMarkup(""); setSanitizeError(cause instanceof Error ? cause.message : "Could not preview this SVG."); }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [source]);

    function saveSvg() {
        if (safeMarkup) saveBlob(new Blob([safeMarkup], { type: "image/svg+xml;charset=utf-8" }), `${safeFilename(name)}.svg`);
    }

    async function savePng() {
        if (!safeMarkup) return;
        setSavingPng(true); setError("");
        const sourceUrl = URL.createObjectURL(new Blob([safeMarkup], { type: "image/svg+xml;charset=utf-8" }));
        try {
            const image = new window.Image();
            image.src = sourceUrl;
            await image.decode();
            const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 768;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Your browser could not prepare the PNG download.");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not make the PNG file.")), "image/png"));
            saveBlob(blob, `${safeFilename(name)}.png`);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the PNG image."); }
        finally { URL.revokeObjectURL(sourceUrl); setSavingPng(false); }
    }

    return <div className="border-b border-white/[.08] bg-violet-300/[.025] px-4 py-3">
        {safeMarkup && <div className="mb-3 overflow-hidden rounded-lg border border-white/[.08] bg-[#10111a] p-2"><Image unoptimized src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeMarkup)}`} alt="Generated vector illustration" width={960} height={640} className="mx-auto max-h-[360px] w-full object-contain" /></div>}
        <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[10px] text-gray-500">Vector illustration</span><button type="button" onClick={saveSvg} disabled={!safeMarkup} className="rounded-lg border border-violet-300/20 bg-violet-300/[.07] px-2.5 py-1.5 text-[11px] font-medium text-violet-100 transition hover:bg-violet-300/[.12] disabled:opacity-40">Download SVG</button><button type="button" onClick={() => void savePng()} disabled={!safeMarkup || savingPng} className="rounded-lg border border-white/[.09] px-2.5 py-1.5 text-[11px] font-medium text-gray-300 transition hover:bg-white/[.06] disabled:opacity-40">{savingPng ? "Preparing PNG…" : "Download PNG"}</button></div>
        {(sanitizeError || error) && <p role="alert" className="mt-2 text-xs text-amber-200">{sanitizeError || error}</p>}
    </div>;
}

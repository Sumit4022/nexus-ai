import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOllamaBaseUrl, getOllamaModel, getOllamaVisionModel } from "@/lib/ollama";
import { getTavilyApiKey } from "@/lib/tavily";

export const runtime = "nodejs";

export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const baseUrl = getOllamaBaseUrl();
    const webSearchConfigured = Boolean(getTavilyApiKey());
    const requiredModels = {
        coding: getOllamaModel("NEXUS_CODING_MODEL"),
        pdf: getOllamaModel("NEXUS_PDF_MODEL"),
        knowledge: getOllamaModel("NEXUS_KNOWLEDGE_MODEL"),
        research: getOllamaModel("NEXUS_RESEARCH_MODEL"),
        vision: getOllamaVisionModel(),
    };
    const getAgentReadiness = (models: string[]) => ({
        ...Object.fromEntries(Object.entries(requiredModels).map(([agent, model]) => [
            agent,
            { model, installed: models.some((installed) => installed === model || installed.startsWith(`${model}:`)) },
        ])),
        researchSearchConfigured: webSearchConfigured,
    });
    const { data: storageData, error: storageError } = await supabase.rpc("nexus_ai_storage_status");
    const storageValues = storageData && typeof storageData === "object"
        ? storageData as Record<string, unknown>
        : {};
    const storage = {
        chatHistoryReady: !storageError && storageValues.chatHistoryReady === true,
        attachmentContextReady: !storageError && storageValues.attachmentContextReady === true,
        documentsReady: !storageError && storageValues.documentsReady === true,
        knowledgeSearchReady: !storageError && storageValues.knowledgeSearchReady === true,
        atomicSaveReady: !storageError && storageValues.atomicSaveReady === true,
    };
    try {
        const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
        if (!response.ok) return NextResponse.json({ ollama: "unavailable", models: [], webSearchConfigured, agents: getAgentReadiness([]), storage, message: "Ollama returned an error. Check its address and status." });
        const body: unknown = await response.json();
        const models = typeof body === "object" && body !== null && "models" in body && Array.isArray(body.models)
            ? body.models.map((model: { name?: unknown }) => typeof model.name === "string" ? model.name : "").filter(Boolean)
            : [];
        return NextResponse.json({ ollama: "connected", models, webSearchConfigured, agents: getAgentReadiness(models), storage, message: "Ollama is reachable from this server." });
    } catch {
        return NextResponse.json({ ollama: "unavailable", models: [], webSearchConfigured, agents: getAgentReadiness([]), storage, message: "Ollama is not reachable. Start it locally or check OLLAMA_BASE_URL." });
    }
}

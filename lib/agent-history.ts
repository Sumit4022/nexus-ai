export type ChatAgent = "research" | "knowledge" | "pdf";
export type AgentMessage = { role: "user" | "assistant"; content: string };
export type SavedAgentConversation = { messages: AgentMessage[]; metadata: Record<string, unknown> };
export const PDF_CONVERSATIONS_STORAGE_KEY = "nexus-pdf-conversations-v1";
const CONVERSATION_SAVE_TIMEOUT_MS = 30_000;

export function getAgentConversationId(agent: ChatAgent, reset = false) {
    const key = `nexus-ai-${agent}-active-conversation`;
    if (reset) {
        const newId = crypto.randomUUID();
        localStorage.setItem(key, newId);
        return newId;
    }
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    localStorage.setItem(key, newId);
    return newId;
}

export function getActiveAgentConversationId(agent: ChatAgent) {
    return localStorage.getItem(`nexus-ai-${agent}-active-conversation`);
}

export function activateAgentConversationId(agent: ChatAgent, id: string) {
    localStorage.setItem(`nexus-ai-${agent}-active-conversation`, id);
}

export async function loadAgentConversationData(agent: ChatAgent, id: string): Promise<SavedAgentConversation | null> {
    const response = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) {
        if (response.status === 401) throw new Error("Please sign in to restore this conversation.");
        throw new Error(`Could not load this conversation from your account history (${response.status}).`);
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("conversations" in data) || !Array.isArray(data.conversations)) return null;
    const conversation = data.conversations.find((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const value = item as Record<string, unknown>;
        return value.id === id && value.agent === agent;
    }) as Record<string, unknown> | undefined;
    if (!conversation || !Array.isArray(conversation.messages)) return null;
    const messages = conversation.messages.flatMap((item: unknown) => {
        if (!item || typeof item !== "object") return [];
        const message = item as Record<string, unknown>;
        if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") return [];
        return [{ role: message.role as AgentMessage["role"], content: message.content }];
    });
    return {
        messages,
        metadata: conversation.metadata && typeof conversation.metadata === "object"
            ? conversation.metadata as Record<string, unknown>
            : {},
    };
}

export async function loadAgentConversation(agent: ChatAgent, id: string): Promise<AgentMessage[] | null> {
    return (await loadAgentConversationData(agent, id))?.messages ?? null;
}

export async function saveAgentConversation(
    agent: ChatAgent,
    id: string,
    messages: AgentMessage[],
    metadata?: Record<string, unknown>,
): Promise<string | null> {
    try {
        const response = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id,
                title: messages.find((message) => message.role === "user")?.content.slice(0, 200) || "New conversation",
                agent,
                messages,
                ...(metadata ? { metadata } : {}),
            }),
            signal: AbortSignal.timeout(CONVERSATION_SAVE_TIMEOUT_MS),
        });
        if (!response.ok) {
            const data: unknown = await response.json();
            const message = typeof data === "object" && data !== null && "error" in data
                && typeof data.error === "string" ? data.error : "Could not save this conversation.";
            return message;
        }
        return null;
    } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") {
            return "Saving to account history timed out. The answer is visible here, but it may not appear in History; check your connection and retry.";
        }
        return "Could not save this conversation. Check your connection and Supabase setup.";
    }
}

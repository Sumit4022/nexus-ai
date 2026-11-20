export type AgentStreamHandlers = {
    onMetadata?: (data: Record<string, unknown>) => void;
    onChunk: (text: string) => void;
};

export async function readAgentStream(response: Response, handlers: AgentStreamHandlers) {
    if (!response.body) throw new Error("The AI returned no response stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData: Record<string, unknown> = {};
    let completed = false;

    function processLine(line: string) {
        if (!line.trim()) return;
        const event: unknown = JSON.parse(line);
        if (!event || typeof event !== "object") throw new Error("The AI returned an invalid response stream.");
        const item = event as Record<string, unknown>;
        if (item.type === "metadata" && item.data && typeof item.data === "object") {
            handlers.onMetadata?.(item.data as Record<string, unknown>);
        } else if (item.type === "chunk" && typeof item.text === "string") {
            handlers.onChunk(item.text);
        } else if (item.type === "done") {
            finalData = item.data && typeof item.data === "object" ? item.data as Record<string, unknown> : {};
            completed = true;
        } else if (item.type === "error") {
            throw new Error(typeof item.error === "string" ? item.error : "The AI response failed.");
        }
    }

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) processLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) processLine(buffer);
        if (!completed) throw new Error("The AI response ended before completion.");
        return finalData;
    } finally {
        try { reader.releaseLock(); } catch { /* The reader may already be released. */ }
    }
}

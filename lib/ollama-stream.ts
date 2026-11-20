type OllamaStreamMessage = {
    message?: { content?: unknown };
    error?: unknown;
    done?: boolean;
    done_reason?: unknown;
};

type AgentStreamEvent =
    | { type: "metadata"; data: Record<string, unknown> }
    | { type: "chunk"; text: string }
    | { type: "done"; data: Record<string, unknown> }
    | { type: "error"; error: string };

type StreamContinuation = {
    targetWords: number;
    minimumWords: number;
    maximumWords: number;
    maxAttempts: number;
    generate: (answer: string, attempt: number, wordsNeeded: number, previousTurnWasLimited: boolean) => Promise<Response | null>;
};

function countWords(text: string): number {
    return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function createOllamaAgentStream(
    response: Response,
    metadata: Record<string, unknown>,
    requestSignal: AbortSignal,
    modelSignal: AbortSignal,
    finalMetadata: (answer: string) => Record<string, unknown> = () => ({}),
    onFinish: () => void = () => {},
    continuation?: StreamContinuation,
) {
    if (!response.body) return Response.json({ error: "The model returned no response stream." }, { status: 502 });

    const encoder = new TextEncoder();
    let cancelled = false;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const cancelOnRequestAbort = () => {
        cancelled = true;
        void activeReader?.cancel(requestSignal.reason).catch(() => {});
    };
    requestSignal.addEventListener("abort", cancelOnRequestAbort, { once: true });

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let answer = "";
            let lastOutputWasLimited = false;
            const emit = (event: AgentStreamEvent) => {
                if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            };
            const processLine = (line: string) => {
                if (!line.trim()) return;
                const item = JSON.parse(line) as OllamaStreamMessage;
                if (typeof item.error === "string") throw new Error("Model stream error");
                if (item.done_reason === "length") lastOutputWasLimited = true;
                const content = item.message?.content;
                if (typeof content === "string" && content) {
                    answer += content;
                    emit({ type: "chunk", text: content });
                }
            };

            try {
                emit({ type: "metadata", data: metadata });
                let currentResponse: Response | null = response;
                let continuationAttempts = 0;
                while (currentResponse && !cancelled) {
                    if (!currentResponse.body) throw new Error("Model returned no response stream");
                    activeReader = currentResponse.body.getReader();
                    let buffer = "";
                    lastOutputWasLimited = false;
                    const streamDecoder = new TextDecoder();
                    try {
                        while (true) {
                            const { done, value } = await activeReader.read();
                            if (done) break;
                            buffer += streamDecoder.decode(value, { stream: true });
                            const lines = buffer.split("\n");
                            buffer = lines.pop() ?? "";
                            for (const line of lines) processLine(line);
                        }
                        buffer += streamDecoder.decode();
                        if (buffer.trim()) processLine(buffer);
                    } finally {
                        try { activeReader.releaseLock(); } catch { /* The model stream may already be closed. */ }
                        activeReader = null;
                    }

                    const words = countWords(answer);
                    const needsMoreWords = continuation ? words < continuation.targetWords : false;
                    const tooCloseToMaximum = continuation !== undefined
                        && lastOutputWasLimited
                        && words >= continuation.maximumWords - 50;
                    if (!continuation || (!needsMoreWords && !lastOutputWasLimited) || tooCloseToMaximum || continuationAttempts >= continuation.maxAttempts) break;
                    const wordsNeeded = lastOutputWasLimited && words >= continuation.minimumWords
                        ? Math.max(40, Math.min(120, continuation.maximumWords - words - 20))
                        : continuation.targetWords - words;
                    const nextResponse = await continuation.generate(answer, continuationAttempts + 1, wordsNeeded, lastOutputWasLimited);
                    if (!nextResponse?.ok || !nextResponse.body) break;
                    continuationAttempts += 1;
                    answer += "\n\n";
                    emit({ type: "chunk", text: "\n\n" });
                    currentResponse = nextResponse;
                }
                if (!answer.trim()) throw new Error("Model returned an empty answer");
                const finalWordCount = countWords(answer);
                emit({ type: "done", data: {
                    ...finalMetadata(answer.trim()),
                    wordCount: finalWordCount,
                    wordTargetMet: finalWordCount >= (continuation?.minimumWords ?? 0)
                        && finalWordCount <= (continuation?.maximumWords ?? Number.POSITIVE_INFINITY),
                    outputComplete: !lastOutputWasLimited,
                } });
                if (!cancelled) controller.close();
            } catch {
                if (!cancelled && !requestSignal.aborted) {
                    const timedOut = modelSignal.aborted && modelSignal.reason instanceof DOMException && modelSignal.reason.name === "TimeoutError";
                    emit({
                        type: "error",
                        error: timedOut
                            ? "The AI took too long to respond. Try again."
                            : "The AI response stopped before it finished. Please try again.",
                    });
                    controller.close();
                }
            } finally {
                if (cancelled || requestSignal.aborted) {
                    try { controller.close(); } catch { /* The client may already have cancelled the stream. */ }
                }
                requestSignal.removeEventListener("abort", cancelOnRequestAbort);
                onFinish();
                try { activeReader?.releaseLock(); } catch { /* The stream may already be closed. */ }
            }
        },
        async cancel(reason) {
            cancelled = true;
            requestSignal.removeEventListener("abort", cancelOnRequestAbort);
            onFinish();
            try { await activeReader?.cancel(reason); } catch { /* The upstream stream may already be closed. */ }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

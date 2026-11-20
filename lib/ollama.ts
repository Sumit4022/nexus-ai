const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_CHAT_MODEL = "qwen2.5-coder:7b";
const DEFAULT_VISION_MODEL = "qwen2.5vl:3b";

export function getOllamaChatUrl() {
    return `${getOllamaBaseUrl()}/api/chat`;
}

export function getOllamaBaseUrl() {
    return (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
}

export function getOllamaModel(environmentKey: string, fallback = DEFAULT_CHAT_MODEL) {
    return process.env[environmentKey] || process.env.OLLAMA_MODEL || fallback;
}

export function getOllamaVisionModel() {
    return process.env.NEXUS_VISION_MODEL || process.env.OLLAMA_VISION_MODEL || DEFAULT_VISION_MODEL;
}

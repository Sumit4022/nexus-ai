export function getTavilyApiKey(): string | null {
    const value = process.env.TAVILY_API_KEY?.trim();
    if (!value) return null;

    const placeholder = /^(?:your[_-].*|replace[_-]?me|placeholder|<.*>)$/i;
    return placeholder.test(value) ? null : value;
}

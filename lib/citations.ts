/** Link valid [n] source references to source cards without rewriting code. */
export function linkSourceCitations(
    markdown: string,
    sourceNumbers: number[],
    prefix: string,
) {
    const availableSources = new Set(sourceNumbers);

    return markdown
        .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
        .map((part, index) => {
            if (index % 2 === 1) return part;

            return part.replace(/(?<!\\)\[(\d+)\](?!\s*\()/g, (reference, numberText: string) => {
                const number = Number(numberText);
                return availableSources.has(number)
                    ? `[${number}](#${prefix}-source-${number})`
                    : reference;
            });
        })
        .join("");
}

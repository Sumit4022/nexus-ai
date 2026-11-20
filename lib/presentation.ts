import { inflateRawSync } from "node:zlib";

const MAX_PRESENTATION_TEXT = 24_000;
const MAX_PRESENTATION_SLIDES = 100;
const MAX_EXPANDED_SLIDE_XML = 500_000;
const MAX_EXPANDED_PRESENTATION_XML = 3_000_000;

function decodeXml(value: string) {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** Extract visible text from the slide XML entries in a modern PPTX ZIP file. */
export function extractPresentationText(buffer: Buffer) {
    let endRecord = -1;
    const minOffset = Math.max(0, buffer.length - 65_557);
    for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            endRecord = offset;
            break;
        }
    }
    if (endRecord < 0) throw new Error("This PowerPoint file is invalid or uses an unsupported format.");

    const entryCount = buffer.readUInt16LE(endRecord + 10);
    let entryOffset = buffer.readUInt32LE(endRecord + 16);
    const slides: Array<{ number: number; text: string }> = [];
    let expandedBytes = 0;

    for (let index = 0; index < entryCount; index++) {
        if (buffer.readUInt32LE(entryOffset) !== 0x02014b50) break;
        const method = buffer.readUInt16LE(entryOffset + 10);
        const compressedSize = buffer.readUInt32LE(entryOffset + 20);
        const nameLength = buffer.readUInt16LE(entryOffset + 28);
        const extraLength = buffer.readUInt16LE(entryOffset + 30);
        const commentLength = buffer.readUInt16LE(entryOffset + 32);
        const localOffset = buffer.readUInt32LE(entryOffset + 42);
        const name = buffer.subarray(entryOffset + 46, entryOffset + 46 + nameLength).toString("utf8");
        entryOffset += 46 + nameLength + extraLength + commentLength;

        const slideMatch = name.match(/^ppt\/slides\/slide(\d+)\.xml$/);
        if (!slideMatch) continue;
        if (slides.length >= MAX_PRESENTATION_SLIDES) {
            throw new Error(`This presentation has more than ${MAX_PRESENTATION_SLIDES} slides. Split it into smaller files and try again.`);
        }
        if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("This PowerPoint slide could not be read.");
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
        const xml = method === 0
            ? compressed.toString("utf8")
            : method === 8
                ? inflateRawSync(compressed, { maxOutputLength: MAX_EXPANDED_SLIDE_XML }).toString("utf8")
                : "";
        const slideBytes = Buffer.byteLength(xml, "utf8");
        if (slideBytes > MAX_EXPANDED_SLIDE_XML) {
            throw new Error("This presentation contains a slide that exceeds the reading limit.");
        }
        expandedBytes += slideBytes;
        if (expandedBytes > MAX_EXPANDED_PRESENTATION_XML) {
            throw new Error("This presentation expands beyond the reading limit. Split it into smaller files and try again.");
        }
        const text = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
            .map((match) => decodeXml(match[1]).trim())
            .filter(Boolean)
            .join(" ");
        slides.push({ number: Number(slideMatch[1]), text });
    }

    const content = slides
        .sort((left, right) => left.number - right.number)
        .filter((slide) => slide.text)
        .map((slide) => `Slide ${slide.number}\n${slide.text}`)
        .join("\n\n");

    if (!content) throw new Error("No readable slide text was found in this PowerPoint file.");
    return content.slice(0, MAX_PRESENTATION_TEXT);
}

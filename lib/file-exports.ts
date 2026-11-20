import JSZip from "jszip";

export type DownloadFormat = "pdf" | "pptx" | "txt" | "code";

export function requestedDownloadFormat(prompt: string): DownloadFormat | null {
    const text = prompt.toLowerCase();
    if (/\b(pptx?|powerpoint|slides?|presentation)\b/.test(text)) return "pptx";
    if (/\b(pdf|printable document)\b/.test(text)) return "pdf";
    if (/\b(txt|plain text file|text file)\b/.test(text)) return "txt";
    if (/\b(code file|source file|download(?:able)? code|save (?:this|it) as code)\b|\.(py|ts|tsx|js|jsx|html|css|json|sql|sh|java|go|rs)\b/.test(text)) return "code";
    return null;
}

export function hasCodeBlock(content: string) {
    return /```[^\n]*\n[\s\S]*?```/.test(content);
}

export function codeFileContent(content: string) {
    const blocks = [...content.matchAll(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g)];
    return blocks.length ? blocks.map((block) => block[2].trimEnd()).join("\n\n") : content.trim();
}

export function codeExtension(content: string) {
    const language = /```([\w+#.-]+)/.exec(content)?.[1]?.toLowerCase();
    const extensions: Record<string, string> = {
        typescript: "ts", ts: "ts", tsx: "tsx", javascript: "js", js: "js", jsx: "jsx",
        python: "py", py: "py", html: "html", css: "css", json: "json", sql: "sql",
        bash: "sh", sh: "sh", shell: "sh", java: "java", csharp: "cs", "c#": "cs",
        cpp: "cpp", "c++": "cpp", c: "c", go: "go", rust: "rs", rustlang: "rs",
        ruby: "rb", php: "php", yaml: "yml", yml: "yml", xml: "xml", svg: "svg",
    };
    return language ? extensions[language] || "txt" : "txt";
}

export function safeFilename(value: string) {
    return value.trim().replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "nexus-answer";
}

export function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function pdfSafeText(text: string) {
    return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
        .replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function markdownText(line: string) {
    return line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`~]/g, "").trim();
}

export function downloadText(filename: string, content: string, format: "txt" | "code" = "txt") {
    const extension = format === "code" ? codeExtension(content) : "txt";
    saveBlob(new Blob([format === "code" ? codeFileContent(content) : content], { type: "text/plain;charset=utf-8" }), `${safeFilename(filename)}.${extension}`);
}

export function downloadPdf(filename: string, title: string, content: string) {
    const lines: { text: string; heading: boolean }[] = [];
    for (const original of content.split(/\r?\n/)) {
        const line = original.trim();
        if (!line) { lines.push({ text: "", heading: false }); continue; }
        const heading = /^(#{1,3})\s+(.+)$/.exec(line);
        const bullet = /^[-*+]\s+(.+)$/.exec(line);
        const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
        const body = markdownText(heading?.[2] ?? bullet?.[1] ?? ordered?.[1] ?? line);
        lines.push({ text: `${bullet || ordered ? "• " : ""}${body}`, heading: Boolean(heading) });
    }
    const pageLines: { text: string; heading: boolean }[][] = [];
    let page: { text: string; heading: boolean }[] = [];
    let used = 0;
    for (const line of lines) {
        const maxChars = line.heading ? 62 : 88;
        const words = line.text.split(/\s+/);
        let row = "";
        const wrapped: string[] = [];
        for (const word of words) {
            if (row && `${row} ${word}`.length > maxChars) { wrapped.push(row); row = word; }
            else row = row ? `${row} ${word}` : word;
        }
        if (row || !line.text) wrapped.push(row);
        for (const text of wrapped) {
            const pageLimit = pageLines.length === 0 ? 40 : 45;
            if (used >= pageLimit) { pageLines.push(page); page = []; used = 0; }
            page.push({ text, heading: line.heading }); used += line.heading ? 2 : 1;
        }
    }
    if (page.length || !pageLines.length) pageLines.push(page);

    const objects: string[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    const pageRefs: number[] = [];
    pageLines.forEach((contentLines, index) => {
        const pageObject = 5 + index * 2;
        const streamObject = pageObject + 1;
        pageRefs.push(pageObject);
        let commands = `0.45 0.32 0.82 RG 50 790 m 545 790 l S\nBT /F2 9 Tf 0.45 0.32 0.82 rg 50 806 Td (NEXUS AI  /  ${pdfSafeText(title).slice(0, 52)}) Tj ET\n`;
        let y = 758;
        if (index === 0) {
            commands += `BT /F2 22 Tf 0.12 0.12 0.18 rg 50 ${y} Td (${pdfSafeText(title).slice(0, 72)}) Tj ET\n`;
            y -= 34;
        }
        for (const line of contentLines) {
            if (!line.text) { y -= 8; continue; }
            const font = line.heading ? "F2" : "F1";
            const size = line.heading ? 13 : 10;
            commands += `BT /${font} ${size} Tf 0.16 0.16 0.21 rg 50 ${y} Td (${pdfSafeText(line.text)}) Tj ET\n`;
            y -= line.heading ? 24 : 16;
        }
        commands += `BT /F1 8 Tf 0.5 0.5 0.55 rg 50 28 Td (Created with NEXUS AI) Tj ET\nBT /F1 8 Tf 0.5 0.5 0.55 rg 520 28 Td (${index + 1} / ${pageLines.length}) Tj ET\n`;
        const length = new TextEncoder().encode(commands).length;
        objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObject} 0 R >>`;
        objects[streamObject] = `<< /Length ${length} >>\nstream\n${commands}endstream`;
    });
    objects[2] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
    let output = "%PDF-1.4\n%NEXUS\n";
    const offsets = [0];
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = new TextEncoder().encode(output).length;
        output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = new TextEncoder().encode(output).length;
    output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    saveBlob(new Blob([output], { type: "application/pdf" }), `${safeFilename(filename)}.pdf`);
}

const EMU = 914400;
const xmlEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function presentationSections(title: string, content: string) {
    const sections: { title: string; bullets: string[] }[] = [];
    let current: { title: string; bullets: string[] } | undefined;
    for (const line of content.split(/\r?\n/)) {
        const heading = /^#{1,3}\s+(.+)$/.exec(line.trim());
        if (heading) {
            if (!sections.length && /^presentation\s*:/i.test(heading[1])) continue;
            current = { title: markdownText(heading[1]), bullets: [] }; sections.push(current);
        } else if (line.trim()) {
            if (!current) { current = { title: "Key ideas", bullets: [] }; sections.push(current); }
            current.bullets.push(markdownText(line.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "")));
        }
    }
    return sections.length ? sections : [{ title, bullets: content.split(/\r?\n/).filter(Boolean).map(markdownText) }];
}

function runXml(text: string, size: number, color: string, bold = false) {
    return `<a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t xml:space="preserve">${xmlEscape(text)}</a:t></a:r>`;
}

function textShape(id: number, text: string, x: number, y: number, w: number, h: number, size: number, color: string, bold = false, bullet = false) {
    const paragraphs = text.split("\n").map((line) => `<a:p>${bullet ? '<a:pPr marL="285750" indent="-190500"><a:buChar char="•"/></a:pPr>' : ""}${runXml(line, size, color, bold)}<a:endParaRPr lang="en-US" sz="${size}"/></a:p>`).join("");
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x * EMU)}" y="${Math.round(y * EMU)}"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function slideXml(title: string, bullets: string[], index: number, cover = false) {
    const shapes = cover
        ? `${textShape(2, "NEXUS AI  /  PRESENTATION", 0.8, 1.5, 11.5, 0.4, 1200, "BDAAFF", true)}${textShape(3, title, 0.8, 2.4, 11.6, 1.5, 3400, "F7F5FF", true)}${textShape(4, bullets.join("\n"), 0.85, 4.25, 11, 1.2, 1500, "B8B7C4")}`
        : `${textShape(2, title, 0.8, 0.58, 11.6, 0.65, 2600, "F7F5FF", true)}${textShape(3, bullets.length ? bullets.map((line) => `•  ${line}`).join("\n") : "Add key ideas for this section.", 0.95, 1.7, 11.1, 4.85, 1800, "D9D8E2")}${textShape(4, `NEXUS AI  ·  ${index}`, 10.3, 7.08, 2.2, 0.2, 800, "888696")}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${cover ? "0B0C13" : "10111A"}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export async function downloadPptx(filename: string, title: string, content: string) {
    const sections = presentationSections(title, content);
    const zip = new JSZip();
    const slideCount = sections.length + 1;
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`);
    zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    zip.folder("docProps")?.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>NEXUS AI</dc:creator></cp:coreProperties>`);
    zip.folder("docProps")?.file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>NEXUS AI</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides></Properties>`);
    const ppt = zip.folder("ppt");
    const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
    ppt?.file("presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${relationships}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    ppt?.folder("_rels")?.file("presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}slideMaster" Target="slideMasters/slideMaster1.xml"/>${Array.from({ length: slideCount }, (_, i) => `<Relationship Id="rId${i + 2}" Type="${relationships}slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`);
    ppt?.folder("slideMasters")?.file("slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${relationships}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
    ppt?.folder("slideMasters")?.folder("_rels")?.file("slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${relationships}theme" Target="../theme/theme1.xml"/></Relationships>`);
    ppt?.folder("slideLayouts")?.file("slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${relationships}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    ppt?.folder("slideLayouts")?.folder("_rels")?.file("slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
    ppt?.folder("theme")?.file("theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="NEXUS"><a:themeElements><a:clrScheme name="NEXUS"><a:dk1><a:srgbClr val="10111A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="33303F"/></a:dk2><a:lt2><a:srgbClr val="F7F5FF"/></a:lt2><a:accent1><a:srgbClr val="9878FF"/></a:accent1><a:accent2><a:srgbClr val="54B6D1"/></a:accent2><a:accent3><a:srgbClr val="E890A9"/></a:accent3><a:accent4><a:srgbClr val="53C6A0"/></a:accent4><a:accent5><a:srgbClr val="F2B966"/></a:accent5><a:accent6><a:srgbClr val="6F75D8"/></a:accent6><a:hlink><a:srgbClr val="9878FF"/></a:hlink><a:folHlink><a:srgbClr val="9878FF"/></a:folHlink></a:clrScheme><a:fontScheme name="NEXUS"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="NEXUS"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`);
    const slideFolder = ppt?.folder("slides");
    const slideRels = slideFolder?.folder("_rels");
    slideFolder?.file("slide1.xml", slideXml(title, sections[0]?.bullets.slice(0, 3) ?? [], 0, true));
    slideRels?.file("slide1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
    sections.forEach((section, index) => {
        slideFolder?.file(`slide${index + 2}.xml`, slideXml(section.title, section.bullets.slice(0, 7), index + 1));
        slideRels?.file(`slide${index + 2}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
    });
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    saveBlob(blob, `${safeFilename(filename)}.pptx`);
}

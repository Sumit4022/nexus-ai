"use client";

import {
  GlobalWorkerOptions,
  getDocument,
  OPS,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  isValidElement,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ComponentPropsWithoutRef,
  FormEvent,
  ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { extractPdfText, MAX_PDF_PAGES, renderPdfPagesForOcr } from "@/lib/pdf";
import { readAgentStream } from "@/lib/agent-stream";
import { loadAgentConversationData, PDF_CONVERSATIONS_STORAGE_KEY, saveAgentConversation, type AgentMessage } from "@/lib/agent-history";
import "highlight.js/styles/github-dark.css";
import ResponseDownloads from "@/components/response-downloads";

GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const STORAGE_KEY = PDF_CONVERSATIONS_STORAGE_KEY;
const MAX_SAVED_CHATS = 20;
const MAX_PAGE_IMAGES = 6;
const MAX_GENERAL_PAGE_IMAGES = 4;
const IMAGE_OPERATORS = new Set([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
]);
const VECTOR_GRAPHIC_OPERATORS = new Set([
  OPS.constructPath,
  OPS.stroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getCurrentTimestamp() {
  return Date.now();
}

// Microphone / speech recognition types
type SpeechRecognitionResultLike = {
  transcript: string;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: SpeechRecognitionResultLike;
  }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type AnswerItem = {
  question: string;
  answer: string;
  sourcePages?: number[];
  visualPagesAnalyzed?: number[];
  visualScanFailedPages?: number[];
};

function extractCitedPdfPages(answer: string) {
  return [...new Set(
    Array.from(answer.matchAll(/\[\s*Page\s+(\d+)\s*\]/gi), (match) => Number(match[1]))
      .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
  )].sort((a, b) => a - b);
}

type PdfConversation = {
  id: string;
  historyId?: string;
  title: string;
  fileName: string;
  fileSize: number;
  extractedText: string;
  pageCount: number;
  messages: AnswerItem[];
  createdAt: number;
  updatedAt: number;
};

type PageImage = {
  pageNumber: number;
  image: string;
};

type PdfPageInfo = {
  pageNumber: number;
  text: string;
  hasVisualContent: boolean;
};

function makeId() {
  return crypto.randomUUID();
}

function getTextFromReactNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextFromReactNode).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getTextFromReactNode(node.props.children);
  }

  return "";
}

/**
 * Select pages likely to contain relevant visual information.
 *
 * Text-rich documents use question keyword matching.
 * Scanned documents use evenly spaced pages so that pages
 * near the end of a long PDF are not always ignored.
 */
async function renderRelevantPdfPages(
  file: File,
  question: string,
  signal: AbortSignal
): Promise<PageImage[]> {
  const buffer = await file.arrayBuffer();

  if (signal.aborted) {
    throw new DOMException("Request cancelled", "AbortError");
  }

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
  });
  const visualQuestion = /\b(charts?|graphs?|plots?|figures?|diagrams?|images?|pictures?|visuals?|illustrations?|maps?|tables?|scans?|scanned|axis|axes|legends?|trends?|bar graphs?|line graphs?)\b/i.test(question);
  const maxSelectedPages = visualQuestion ? MAX_PAGE_IMAGES : MAX_GENERAL_PAGE_IMAGES;
  const requestedPages = [...question.matchAll(/\b(?:page|pg\.?|p\.?)\s*(\d{1,3})\b/gi)]
    .map((match) => Number(match[1]));

  try {
    const pdf = await loadingTask.promise;
    const pages: PdfPageInfo[] = [];

    // Inspect page text so we can select useful pages.
    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      if (signal.aborted) {
        throw new DOMException("Request cancelled", "AbortError");
      }

      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let hasVisualContent = false;
      if (visualQuestion) {
        const operators = await page.getOperatorList();
        const graphicOperatorCount = operators.fnArray.filter((operator) => VECTOR_GRAPHIC_OPERATORS.has(operator)).length;
        hasVisualContent = operators.fnArray.some((operator) => IMAGE_OPERATORS.has(operator)) || graphicOperatorCount >= 14;
      }

      const text = content.items
        .filter(
          (item): item is typeof item & { str: string } =>
            "str" in item && typeof item.str === "string"
        )
        .map((item) => item.str)
        .join(" ");

      pages.push({ pageNumber, text, hasVisualContent });
    }

    if (pages.length === 0) return [];

    const queryTerms = [
      ...new Set(
        question
          .toLowerCase()
          .match(/[a-z0-9]{3,}/g) ?? []
      ),
    ];
    const visualTerms = visualQuestion
      ? ["chart", "graph", "figure", "diagram", "plot", "table", "axis", "legend", "trend", "image", "visual"]
      : [];
    const allQueryTerms = [...new Set([...queryTerms, ...visualTerms])];

    const hasSubstantialText = pages.some(
      (page) => page.text.trim().length > 80
    );

    let selectedPages: PdfPageInfo[];

    if (!hasSubstantialText) {
      // Scanned PDFs: sample across the entire document.
      const explicitlyRequested = pages.filter((page) => requestedPages.includes(page.pageNumber));
      if (explicitlyRequested.length > 0) {
        selectedPages = explicitlyRequested.slice(0, maxSelectedPages);
      } else {
        const sampleCount = Math.min(maxSelectedPages, pages.length);
        const indices = Array.from(
          { length: sampleCount },
          (_, index) => sampleCount === 1 ? 0 : Math.round((index * (pages.length - 1)) / (sampleCount - 1))
        );
        selectedPages = indices.map((index) => pages[index]);
      }
    } else {
      // Text-rich PDFs: use the question to rank likely pages.
      const ranked = pages
        .map((page) => {
          const lowerText = page.text.toLowerCase();
          let score = 0;

          for (const term of allQueryTerms) {
            if (lowerText.includes(term)) {
              score += 3;
            }
          }

          if (requestedPages.includes(page.pageNumber)) score += 100;
          if (visualQuestion && page.hasVisualContent) score += 12;
          if (visualQuestion && /\b(charts?|graphs?|figures?|diagrams?|plots?|axis|axes|legends?|tables?)\b/i.test(page.text)) score += 8;

          // Pages with little selectable text may contain
          // scanned figures, images, or diagrams.
          if (page.text.trim().length < 120) {
            score += 2;
          }

          return { page, score };
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.page.pageNumber - b.page.pageNumber
        );

      if (ranked[0]?.score === 0) {
        // If keywords give no signal, sample across the PDF.
        const sampleCount = Math.min(
          maxSelectedPages,
          pages.length
        );

        const indices = Array.from(
          { length: sampleCount },
          (_, index) =>
            sampleCount === 1
              ? 0
              : Math.round(
                (index * (pages.length - 1)) /
                (sampleCount - 1)
              )
        );

        selectedPages = indices.map(
          (index) => pages[index]
        );
      } else {
        selectedPages = ranked
          .slice(0, maxSelectedPages)
          .map((item) => item.page);
      }
    }

    const images: PageImage[] = [];

    for (const selectedPage of selectedPages) {
      if (signal.aborted) {
        throw new DOMException("Request cancelled", "AbortError");
      }

      const page = await pdf.getPage(
        selectedPage.pageNumber
      );

      const baseViewport = page.getViewport({ scale: 1 });

      // Limit image dimensions to keep local inference manageable.
      const scale = Math.min(1.5, 1200 / baseViewport.width, 1600 / baseViewport.height);

      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error(
          "Could not prepare a PDF page for visual analysis."
        );
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      const image = canvas.toDataURL(
        "image/jpeg",
        0.7
      );

      images.push({
        pageNumber: selectedPage.pageNumber,
        image,
      });

      // Release canvas memory after encoding the image.
      canvas.width = 0;
      canvas.height = 0;
    }

    return images;
  } finally {
    await loadingTask.destroy();
  }
}

async function getPdfPageCount(file: File): Promise<number> {
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });

  try {
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

function CodeBlock({
  language,
  code,
  highlightedContent,
}: {
  language: string;
  code: string;
  highlightedContent: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 bg-[#101014]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <span className="text-xs font-medium text-gray-400">
          {language || "Code"}
        </span>

        <button
          type="button"
          onClick={copyCode}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-gray-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Copy code"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      <pre className="overflow-x-auto p-4 text-sm leading-6 text-gray-200">
        <code className="hljs font-mono">
          {highlightedContent}
        </code>
      </pre>
    </div>
  );
}

function MarkdownAnswer({ content }: { content: string }) {
  return (
    <div className="break-words text-sm leading-7 text-gray-300 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-white [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-violet-400 [&_blockquote]:pl-4 [&_blockquote]:text-gray-400 [&_a]:text-violet-300 [&_a]:underline [&_hr]:my-5 [&_hr]:border-white/10">
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({
            className,
            children,
            ...props
          }: ComponentPropsWithoutRef<"code">) => {
            const code = getTextFromReactNode(children).replace(
              /\n$/,
              ""
            );

            const languageMatch = /language-([\w+#.-]+)/.exec(
              className || ""
            );

            const isBlock =
              Boolean(languageMatch) || code.includes("\n");

            if (!isBlock) {
              return (
                <code
                  {...props}
                  className="rounded-md border border-white/10 bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.9em] text-violet-200"
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                language={languageMatch?.[1] || "Code"}
                code={code}
                highlightedContent={children as ReactNode}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function PdfAgentPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Microphone state
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isListening, setIsListening] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [extractedText, setExtractedText] = useState("");
  const [pageCount, setPageCount] = useState(0);

  const [question, setQuestion] = useState("");
  const [answerHistory, setAnswerHistory] = useState<AnswerItem[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");

  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [scanEveryPage, setScanEveryPage] = useState(false);
  const [visualScanProgress, setVisualScanProgress] = useState("");
  const [documentTruncated, setDocumentTruncated] = useState(false);

  const [conversations, setConversations] = useState<PdfConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const historyRestoreAttemptedRef = useRef(false);

  const hasDocument = Boolean(fileName && pageCount > 0);

  // Stop the microphone when this page unmounts.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  // Start microphone speech recognition.
  function startListening() {
    setError("");

    const speechWindow = window as SpeechRecognitionWindow;

    const Recognition =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        "Speech recognition is not supported in this browser. Try the latest version of Chrome."
      );
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    try {
      const recognition = new Recognition();

      recognition.lang = "en-IN";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let transcript = "";

        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        setQuestion(transcript.trimStart().slice(0, 2000));
      };

      recognition.onerror = (event) => {
        setIsListening(false);

        if (event.error === "not-allowed") {
          setError(
            "Microphone permission was denied. Allow microphone access in your browser settings and try again."
          );
        } else if (event.error === "no-speech") {
          setError(
            "No speech detected. Please try speaking again."
          );
        } else if (event.error !== "aborted") {
          setError(
            `Speech recognition failed (${event.error}). Please try again.`
          );
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();

      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setIsListening(false);

      setError(
        "Could not start the microphone. Please try again."
      );
    }
  }

  // Stop recording without submitting the question.
  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed: unknown = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (item): item is PdfConversation => {
              if (!item || typeof item !== "object") {
                return false;
              }

              const chat = item as Record<string, unknown>;

              return (
                typeof chat.id === "string" &&
                typeof chat.title === "string" &&
                typeof chat.fileName === "string" &&
                typeof chat.extractedText === "string" &&
                Array.isArray(chat.messages) &&
                typeof chat.updatedAt === "number" &&
                chat.messages.every(
                  (message: unknown) =>
                    Boolean(message) &&
                    typeof message === "object" &&
                    typeof (message as AnswerItem).question === "string" &&
                    typeof (message as AnswerItem).answer === "string" &&
                    ((message as AnswerItem).sourcePages === undefined ||
                      (Array.isArray((message as AnswerItem).sourcePages) &&
                        (message as AnswerItem).sourcePages!.every((page) => Number.isInteger(page) && page > 0 && page <= MAX_PDF_PAGES)))
                )
              );
            }
          );

          queueMicrotask(() => setConversations(
            valid
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, MAX_SAVED_CHATS)
          ));
        }
      }
    } catch {
      queueMicrotask(() => setStorageNotice(
        "Saved chats could not be read. Your browser storage may be unavailable."
      ));
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(conversations)
      );
    } catch {
      queueMicrotask(() => setStorageNotice(
        "Browser storage is full. Your current chat may work, but recent changes might not survive a refresh. Try deleting older saved chats."
      ));
    }
  }, [conversations, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded || historyRestoreAttemptedRef.current) return;
    const historyId = new URLSearchParams(window.location.search).get("chat");
    if (!historyId) return;
    historyRestoreAttemptedRef.current = true;
    const timer = window.setTimeout(() => {
      const savedChat = conversations.find((chat) => chat.id === historyId || chat.historyId === historyId);
      if (savedChat) {
        setActiveConversationId(savedChat.id);
        setSelectedFile(null);
        setFileName(savedChat.fileName);
        setFileSize(savedChat.fileSize || 0);
        setExtractedText(savedChat.extractedText);
        setPageCount(savedChat.pageCount || 0);
        setAnswerHistory(savedChat.messages);
        return;
      }
      void loadAgentConversationData("pdf", historyId).then((saved) => {
        const pdf = saved?.metadata.pdf;
        if (!saved || !pdf || typeof pdf !== "object") {
          setStorageNotice("The saved PDF conversation has no restorable document context.");
          return;
        }
        const data = pdf as Record<string, unknown>;
        if (typeof data.extractedText !== "string" || !data.extractedText) {
          setStorageNotice("The saved PDF conversation has no extracted text to continue from.");
          return;
        }
        const importedMessages: AnswerItem[] = [];
        for (let index = 0; index < saved.messages.length - 1; index += 2) {
          const question = saved.messages[index];
          const answer = saved.messages[index + 1];
          if (question.role === "user" && answer.role === "assistant") {
            importedMessages.push({
              question: question.content,
              answer: answer.content,
              sourcePages: extractCitedPdfPages(answer.content),
            });
          }
        }
        const restored: PdfConversation = {
          id: historyId,
          historyId,
          title: importedMessages[0]?.question.slice(0, 70) || "Saved PDF conversation",
          fileName: typeof data.fileName === "string" ? data.fileName : "Saved PDF",
          fileSize: typeof data.fileSize === "number" ? data.fileSize : 0,
          extractedText: data.extractedText,
          pageCount: typeof data.pageCount === "number" ? data.pageCount : 0,
          messages: importedMessages,
          createdAt: getCurrentTimestamp(),
          updatedAt: getCurrentTimestamp(),
        };
        setConversations((previous) => [restored, ...previous.filter((chat) => chat.id !== historyId)].slice(0, MAX_SAVED_CHATS));
        setActiveConversationId(restored.id);
        setSelectedFile(null);
        setFileName(restored.fileName);
        setFileSize(restored.fileSize);
        setExtractedText(restored.extractedText);
        setPageCount(restored.pageCount);
        setAnswerHistory(restored.messages);
        if (data.textTruncated === true) setStorageNotice("This PDF's extracted text was shortened for account sync. Re-upload the original PDF for full context.");
      }).catch(() => setStorageNotice("Could not load the PDF conversation from account history."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageLoaded, conversations]);

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function clearCurrentChat() {
    if (isAsking || isExtracting) return;

    stopListening();

    setActiveConversationId(null);
    setSelectedFile(null);
    setFileName("");
    setFileSize(0);
    setExtractedText("");
    setPageCount(0);
    setQuestion("");
    setAnswerHistory([]);
    setError("");
    setDocumentTruncated(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleFile(file?: File) {
    if (!file || isAsking || isExtracting) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setError("Please select a valid PDF file.");
      return;
    }

    if (file.size === 0) {
      setError("This file is empty. Please choose another PDF.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("The PDF must be 20 MB or smaller.");
      return;
    }

    stopListening();

    setError("");
    setStorageNotice("");
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setExtractedText("");
    setPageCount(0);
    setQuestion("");
    setAnswerHistory([]);
    setActiveConversationId(null);
    setDocumentTruncated(false);
    setIsExtracting(true);

    try {
      try {
        const result = await extractPdfText(file);

        setExtractedText(result.text);
        setPageCount(result.pageCount);
      } catch (extractError) {
        // A scanned PDF may have no selectable text.
        // Keep the PDF usable so its page images can be analyzed.
        const message =
          extractError instanceof Error
            ? extractError.message
            : "";

        if (
          !message.toLowerCase().includes("no readable text")
        ) {
          throw extractError;
        }

        const count = await getPdfPageCount(file);
        if (count > MAX_PDF_PAGES) {
          throw new Error(`This PDF has ${count} pages. The current limit is ${MAX_PDF_PAGES} pages.`);
        }

        setExtractedText("");
        setPageCount(count);
      }
    } catch (err) {
      setSelectedFile(null);
      setFileName("");
      setFileSize(0);
      setExtractedText("");
      setPageCount(0);

      setError(
        err instanceof Error
          ? err.message
          : "Could not read this PDF. Please try another file."
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isListening) {
      stopListening();
    }

    const currentQuestion = question.trim();

    if (
      !hasDocument ||
      (!extractedText && !selectedFile) ||
      !currentQuestion ||
      isAsking ||
      isExtracting
    ) {
      return;
    }

    setError("");
    setStorageNotice("");
    setStreamingAnswer("");
    setVisualScanProgress("");
    setIsAsking(true);

    const conversationId = activeConversationId || makeId();
    const previousHistory = answerHistory;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedAnswer = "";

    try {
      // Render page images when the original PDF is available.
      // Saved conversations retain extracted text, not the PDF bytes.
      let pageImages: PageImage[] = [];
      let visualContext = "";
      let visualPageNumbers: number[] = [];
      const visualScanFailedPages: number[] = [];

      if (selectedFile) {
        if (scanEveryPage) {
          const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
          const analyses: string[] = [];
          let scannedPage = 0;
          for await (const renderedPage of renderPdfPagesForOcr(selectedFile, pageNumbers, controller.signal)) {
            scannedPage += 1;
            setVisualScanProgress(`Checking page ${scannedPage} of ${pageCount} with the local vision model…`);
            try {
              const form = new FormData();
              form.set("image", renderedPage.image);
              form.set("pageNumber", String(renderedPage.pageNumber));
              const pageResponse = await fetch("/api/documents/ocr-page", {
                method: "POST",
                body: form,
                signal: controller.signal,
              });
              const pageData = await pageResponse.json().catch(() => ({}));
              if (!pageResponse.ok) throw new Error(typeof pageData.error === "string" ? pageData.error : "Could not analyze this page.");
              visualPageNumbers.push(renderedPage.pageNumber);
              if (typeof pageData.text === "string" && pageData.text.trim()) {
                analyses.push(`[Visual analysis of PDF page ${renderedPage.pageNumber}]\n${pageData.text.trim().slice(0, 3_000)}`);
              }
            } catch (pageError) {
              if (pageError instanceof DOMException && pageError.name === "AbortError") throw pageError;
              visualScanFailedPages.push(renderedPage.pageNumber);
            }
          }
          visualContext = analyses.join("\n\n");
          setVisualScanProgress(`Checked all ${visualPageNumbers.length} pages. Preparing your answer…`);
        } else {
          pageImages = await renderRelevantPdfPages(
            selectedFile,
            currentQuestion,
            controller.signal
          );
          visualPageNumbers = pageImages.map((page) => page.pageNumber);
        }
      }

      if (controller.signal.aborted) {
        throw new DOMException("Request cancelled", "AbortError");
      }

      const history = previousHistory.flatMap((item) => [
        {
          role: "user" as const,
          content: item.question,
        },
        {
          role: "assistant" as const,
          content: item.answer,
        },
      ]);

      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          documentText: extractedText,
          pageImages,
          visualContext,
          visualPages: visualPageNumbers,
          visualScanFailedPages,
          question: currentQuestion,
          history,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to get an answer.");
      }

      let streamMetadata: Record<string, unknown> = {};
      let finalMetadata: Record<string, unknown> = {};
      const streamResult = await readAgentStream(response, {
        onMetadata: (data) => { streamMetadata = data; },
        onChunk: (chunk) => {
          accumulatedAnswer += chunk;
          setStreamingAnswer(accumulatedAnswer);
        },
      });
      finalMetadata = streamResult;
      const answer = accumulatedAnswer.trim();
      if (!answer) throw new Error("The AI returned an empty answer. Please try again.");

      const nextHistory: AnswerItem[] = [
        ...previousHistory,
        {
          question: currentQuestion,
          answer,
          sourcePages: Array.isArray(finalMetadata.sourcePages)
            ? finalMetadata.sourcePages.filter((page): page is number => Number.isInteger(page) && page > 0)
            : extractCitedPdfPages(answer),
          visualPagesAnalyzed: Array.isArray(streamMetadata.visualPages)
            ? streamMetadata.visualPages.filter((page): page is number => Number.isInteger(page) && page > 0)
            : [],
          visualScanFailedPages: Array.isArray(streamMetadata.visualScanFailedPages)
            ? streamMetadata.visualScanFailedPages.filter((page): page is number => Number.isInteger(page) && page > 0)
            : [],
        },
      ];

      const now = getCurrentTimestamp();

      const existingChat = conversations.find(
        (chat) => chat.id === conversationId
      );
      const historyId = existingChat?.historyId || (UUID_REGEX.test(conversationId) ? conversationId : crypto.randomUUID());

      const nextChat: PdfConversation = {
        id: conversationId,
        historyId,
        title:
          existingChat?.title ||
          currentQuestion.replace(/\s+/g, " ").slice(0, 70),
        fileName: fileName || "Saved PDF",
        fileSize,
        extractedText,
        pageCount,
        messages: nextHistory,
        createdAt: existingChat?.createdAt || now,
        updatedAt: now,
      };

      setActiveConversationId(conversationId);
      setAnswerHistory(nextHistory);
      setDocumentTruncated(Boolean(streamMetadata.truncated));
      setStreamingAnswer("");

      setConversations((previous) =>
        [
          nextChat,
          ...previous.filter((chat) => chat.id !== conversationId),
        ].slice(0, MAX_SAVED_CHATS)
      );

      const savedMessages: AgentMessage[] = nextHistory.slice(-250).flatMap((item) => [
        { role: "user" as const, content: item.question },
        { role: "assistant" as const, content: item.answer },
      ]);
      const maxSyncedTextLength = 300_000;
      const saveError = await saveAgentConversation("pdf", historyId, savedMessages, {
        pdf: {
          fileName: nextChat.fileName,
          fileSize: nextChat.fileSize,
          pageCount: nextChat.pageCount,
          extractedText: nextChat.extractedText.slice(0, maxSyncedTextLength),
          textTruncated: nextChat.extractedText.length > maxSyncedTextLength,
        },
      });
      if (saveError) setStorageNotice(`Your answer is ready, but account history could not be saved: ${saveError}`);

      setQuestion("");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (accumulatedAnswer.trim()) setError("Answer generation stopped. The partial response was not saved to chat history.");
        else setError("Analysis stopped before an answer was generated.");
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      setIsAsking(false);
      setVisualScanProgress("");
    }
  }

  function stopGenerating() {
    abortControllerRef.current?.abort();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-[10px] font-semibold uppercase">
            AI AGENT
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            PDF Agent
          </h1>

          <p className="mt-2 text-gray-400">
            Upload a PDF, explore its contents, and get clear answers from
            NEXUS AI.
          </p>
        </div>

        <button
          type="button"
          onClick={clearCurrentChat}
          disabled={isAsking || isExtracting}
          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-50"
        >
          + New chat
        </button>
      </div>

      <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        {!hasDocument ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void handleFile(event.dataTransfer.files?.[0]);
            }}
            className={`rounded-xl border border-dashed p-8 text-center transition sm:p-12 ${isDragging
              ? "border-violet-400 bg-violet-500/10"
              : "border-white/10 hover:border-violet-400/50"
              }`}
          >
            <div className="text-4xl" aria-hidden="true">
              📄
            </div>

            <h2 className="mt-5 text-lg font-medium text-white">
              Upload your PDF
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Choose a document or drag and drop it here. Maximum size: 20 MB.
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting || isAsking}
              className="mt-6 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-gray-200 disabled:opacity-50"
            >
              Choose PDF
            </button>

            <p className="mt-4 text-xs text-gray-600">
              PDF files only · Maximum size 20 MB
            </p>

            {isExtracting && (
              <p className="mt-4 text-sm text-violet-300">
                Extracting PDF content...
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.05] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-2xl">
                  📄
                </div>

                <div className="min-w-0">
                  <h2 className="truncate font-medium text-white">
                    {fileName}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {formatFileSize(fileSize)} · PDF
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={isExtracting || isAsking}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  Replace
                </button>

                <button
                  type="button"
                  disabled={isExtracting || isAsking}
                  onClick={clearCurrentChat}
                  className="rounded-lg border border-red-400/20 px-4 py-2 text-sm text-red-400 transition hover:bg-red-400/10 disabled:opacity-50"
                >
                  Close PDF
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-400">
                {extractedText
                  ? "✓ Text extracted"
                  : "✓ Ready for visual analysis"}
              </span>

              <span className="text-gray-400">
                {pageCount} {pageCount === 1 ? "page" : "pages"}
              </span>

              {extractedText && (
                <span className="text-gray-400">
                  {extractedText.length.toLocaleString()} characters
                </span>
              )}

              {!selectedFile && (
                <span className="text-xs text-violet-300">
                  Restored from chat history
                </span>
              )}
            </div>

            {extractedText && (
              <details className="mt-5">
                <summary className="cursor-pointer text-sm text-violet-300">
                  Preview extracted text
                </summary>

                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-gray-300">
                  {extractedText.slice(0, 5000)}
                  {extractedText.length > 5000
                    ? "\n\n... Preview shortened. The complete extracted text is retained for this chat."
                    : ""}
                </pre>
              </details>
            )}
          </div>
        )}

        {hasDocument && !isExtracting && (
          <section className="rounded-xl border border-white/10 bg-black/10 p-4 sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                Ask your PDF
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Ask questions, solve assignment parts, or request step-by-step
                explanations. The agent checks up to 4 relevant page visuals,
                or up to 6 when you ask about charts, images, or diagrams.
              </p>

              {!selectedFile && (
                <p className="mt-2 text-xs text-amber-300">
                  This is a restored conversation. Re-upload the original PDF
                  to enable visual analysis for new questions.
                </p>
              )}
            </div>

            {answerHistory.length > 0 && (
              <div className="pdf-chat-scroll mb-6 max-h-[65vh] space-y-7 overflow-y-auto pr-3">
                {answerHistory.map((item, index) => (
                  <div
                    key={`${index}-${item.question}`}
                    className="space-y-4"
                  >
                    <div className="ml-auto max-w-[95%] rounded-xl border border-violet-400/10 bg-violet-500/[0.08] p-4 sm:max-w-[85%]">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-violet-300">
                        Your question
                      </p>

                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-200">
                        {item.question}
                      </p>
                    </div>

                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-sm">
                          ✦
                        </span>

                        <p className="text-sm font-medium text-white">
                          NEXUS AI
                        </p>
                      </div>

                      <MarkdownAnswer content={item.answer} />
                      {item.sourcePages && item.sourcePages.length > 0 && <div className="mt-4 border-t border-white/10 pt-3">
                        <p className="text-xs font-medium text-gray-400">PDF pages cited</p>
                        <div className="mt-2 flex flex-wrap gap-2">{item.sourcePages.map((pageNumber) => <span key={pageNumber} className="rounded-full border border-violet-400/20 bg-violet-400/5 px-2.5 py-1 text-xs text-violet-200">Page {pageNumber}</span>)}</div>
                      </div>}
                      {item.visualPagesAnalyzed && item.visualPagesAnalyzed.length > 0 && <div className="mt-4 border-t border-white/10 pt-3">
                        <p className="text-xs font-medium text-gray-400">Page visuals checked · {item.visualPagesAnalyzed.length}</p>
                        <div className="mt-2 flex flex-wrap gap-2">{item.visualPagesAnalyzed.slice(0, 12).map((pageNumber) => <span key={pageNumber} className="rounded-full border border-sky-400/20 bg-sky-400/5 px-2.5 py-1 text-xs text-sky-200">Page {pageNumber}</span>)}</div>
                        {item.visualPagesAnalyzed.length > 12 && <p className="mt-2 text-xs text-gray-500">And {item.visualPagesAnalyzed.length - 12} more pages</p>}
                      </div>}
                      {item.visualScanFailedPages && item.visualScanFailedPages.length > 0 && <p className="mt-3 text-xs text-amber-300">
                        Visual analysis could not read {item.visualScanFailedPages.length === 1 ? "page" : "pages"} {item.visualScanFailedPages.slice(0, 12).join(", ")}{item.visualScanFailedPages.length > 12 ? ` and ${item.visualScanFailedPages.length - 12} more` : ""}. The rest of the scan was still used.
                      </p>}
                      <ResponseDownloads prompt={item.question} content={item.answer} title={fileName || "PDF answer"} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {streamingAnswer && (
              <section aria-live="polite" className="pdf-chat-scroll mb-6 max-h-[65vh] overflow-y-auto rounded-xl border border-violet-400/20 bg-violet-500/[0.04] p-4 sm:p-5">
                <p className="mb-3 text-sm font-medium text-violet-200">NEXUS AI is answering</p>
                <MarkdownAnswer content={streamingAnswer} />
              </section>
            )}

            {isAsking && (
              <div
                role="status"
                className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/5 p-4 text-sm text-violet-300"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                {visualScanProgress || (scanEveryPage ? `Scanning all ${pageCount} pages, then preparing your answer…` : "NEXUS AI is analyzing your question and selected pages…")}
                <span className="text-gray-500">
                {scanEveryPage ? "Every page is processed one at a time. This can take several minutes for long PDFs." : "Visual analysis may take longer on the first request."}
                </span>
                <button type="button" onClick={() => abortControllerRef.current?.abort()} className="ml-auto rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10">Stop</button>
              </div>
            )}

            <form onSubmit={askQuestion} className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3.5 transition hover:border-violet-300/20 hover:bg-violet-300/[.035]">
                <input
                  type="checkbox"
                  checked={scanEveryPage}
                  onChange={(event) => setScanEveryPage(event.target.checked)}
                  disabled={!selectedFile || isAsking}
                  className="mt-0.5 h-4 w-4 accent-violet-400"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-200">Scan every page for images, charts, and diagrams</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500">Uses your local vision model on each page, one at a time. Long PDFs can take several minutes. Turn this off for the faster relevant-page scan.</span>
                </span>
              </label>
              <label
                htmlFor="pdf-question"
                className="block text-sm font-medium text-gray-300"
              >
                Your question
              </label>

              {/* Question input with microphone */}
              <div className="relative">
                <textarea
                  id="pdf-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about the text, a graph, a diagram, or a scanned page..."
                  rows={3}
                  maxLength={2000}
                  disabled={isAsking}
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-16 text-sm leading-6 text-white outline-none placeholder:text-gray-600 focus:border-violet-400/60 disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={
                    isListening ? stopListening : startListening
                  }
                  disabled={isAsking}
                  aria-label={
                    isListening
                      ? "Stop microphone"
                      : "Start microphone"
                  }
                  title={
                    isListening
                      ? "Stop listening"
                      : "Ask using your voice"
                  }
                  className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-50 ${isListening
                    ? "animate-pulse border-red-400/40 bg-red-400/10 text-red-400"
                    : "border-white/10 bg-white/[0.04] text-gray-400 hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-300"
                    }`}
                >
                  {isListening ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect
                        x="6"
                        y="6"
                        width="12"
                        height="12"
                        rx="2"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect
                        x="9"
                        y="2"
                        width="6"
                        height="12"
                        rx="3"
                      />
                      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                      <line x1="8" y1="22" x2="16" y2="22" />
                    </svg>
                  )}
                </button>
              </div>

              {isListening && (
                <p className="text-xs text-violet-300">
                  Listening... Speak your question, then click the mic to stop.
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  Answers and visual analysis run locally through Ollama.
                </p>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  {isAsking && (
                    <button
                      type="button"
                      onClick={stopGenerating}
                      className="rounded-lg border border-red-400/30 px-5 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-400/10"
                    >
                      Stop generating
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={!question.trim() || isAsking}
                    className="rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isAsking ? "Generating answer..." : "Ask question"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {documentTruncated && answerHistory.length > 0 && (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-300">
            Relevant text sections and page visuals were selected for this question. For
            a specific figure in a long PDF, include its page number in your question.
          </p>
        )}

        {storageNotice && (
          <p
            role="status"
            className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-300"
          >
            {storageNotice}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-400"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

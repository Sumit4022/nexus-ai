"use client";

import {
  Suspense,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import "highlight.js/styles/github-dark.css";
import { codeExtension, downloadText, safeFilename } from "@/lib/file-exports";
import ResponseDownloads from "@/components/response-downloads";
import SvgImageActions from "@/components/svg-image-actions";

GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
type AgentType = "coding" | "pdf" | "research" | "knowledge";
type CodingMode =
  | "ask"
  | "code"
  | "debug"
  | "review"
  | "architect"
  | "test"
  | "optimize"
  | "explain";

const CODING_MODES: {
  value: CodingMode;
  label: string;
  description: string;
  icon: string;
}[] = [
    {
      value: "ask",
      label: "Ask",
      description: "General programming questions",
      icon: "💬",
    },
    {
      value: "code",
      label: "Code",
      description: "Generate code and implement features",
      icon: "✍️",
    },
    {
      value: "debug",
      label: "Debug",
      description: "Find and fix errors",
      icon: "🐛",
    },
    {
      value: "review",
      label: "Review",
      description: "Review code quality and security",
      icon: "🔍",
    },
    {
      value: "architect",
      label: "Architect",
      description: "Plan software architecture",
      icon: "🏗️",
    },
    {
      value: "test",
      label: "Test",
      description: "Generate tests and edge cases",
      icon: "🧪",
    },
    {
      value: "optimize",
      label: "Optimize",
      description: "Improve performance",
      icon: "⚡",
    },
    {
      value: "explain",
      label: "Explain",
      description: "Understand existing code",
      icon: "📚",
    },
  ];

type AttachmentInfo = {
  id: string;
  name: string;
  type: string;
  size: number;
};

type Attachment = AttachmentInfo & {
  content: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  context?: string;
  attachments?: AttachmentInfo[];
};


type Conversation = {
  id: string;
  agent?: AgentType;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

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

const CURRENT_CHAT_KEY = "nexus-ai-current-chat";
const HISTORY_KEY = "nexus-ai-chat-history";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_CONTEXT = 60000;
const MAX_TEXT_FILE_CHARS = 20000;
const MAX_PDF_PAGES = 20;
const CONVERSATION_SAVE_TIMEOUT_MS = 30_000;

/*
 * Extract plain text from ReactMarkdown's code-block children.
 * This is used by the Copy Code button, including when syntax
 * highlighting has wrapped tokens in span elements.
 */
function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

/*
 * Individual code block with its own language label and Copy Code button.
 */
function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const codeText = getNodeText(children);
  const codeElement = isValidElement<{ className?: string }>(children)
    ? children
    : null;

  const className = codeElement?.props.className ?? "";
  const languageMatch = className.match(/language-([\w+#.-]+)/i);
  const language = languageMatch?.[1] ?? "Code";
  const isSvg = language.toLowerCase() === "svg" || /^\s*<svg[\s>]/i.test(codeText);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy code:", error);
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0d]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2">
        <span className="text-xs font-medium text-gray-400">
          {language}
        </span>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => downloadText(`nexus-${safeFilename(language)}`, `\`\`\`${language}\n${codeText}\n\`\`\``, "code")}
            className="rounded-md border border-white/10 px-3 py-1 text-xs text-gray-300 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white" aria-label={`Download ${language} code file`}>
            Download .{codeExtension(`\`\`\`${language}\n${codeText}\n\`\`\``)}
          </button>
          <button type="button" onClick={() => void copyCode()}
            className="rounded-md border border-white/10 px-3 py-1 text-xs text-gray-300 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white" aria-label="Copy code">
            {copied ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      </div>

      {isSvg && <SvgImageActions source={codeText} />}

      <pre className="overflow-x-auto p-4 text-xs leading-6 sm:text-sm">
        {children}
      </pre>
    </div>
  );
}

const initialMessage: Message = {
  role: "assistant",
  content:
    "Hi! I'm your coding assistant. Ask me to explain code, debug an error, or help you build something. You can also attach code files, logs, configuration files, or PDFs for me to analyze.",
};

function createConversation(): Conversation {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    agent: "coding",
    title: "New Coding Chat",
    messages: [initialMessage],
    createdAt: now,
    updatedAt: now,
  };
}

function createTitle(messages: Message[]) {
  const firstUserMessage = messages.find(
    (msg) => msg.role === "user"
  );

  if (!firstUserMessage) return "New Coding Chat";

  const title =
    firstUserMessage.content.trim() ||
    (firstUserMessage.attachments?.length
      ? `Files: ${firstUserMessage.attachments
        .map((file) => file.name)
        .join(", ")}`
      : "New Coding Chat");

  return title.length <= 45
    ? title
    : `${title.slice(0, 45)}...`;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function CodingAgentClient() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get("chat");

  const [conversation, setConversation] =
    useState<Conversation>(createConversation);

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [codingMode, setCodingMode] =
    useState<CodingMode>("ask");
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");


  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const messages = conversation.messages;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function restoreConversation() {
      setIsHydrated(false);
      setError("");

      try {
        if (chatId) {
          let canUseLocalFallback = false;
          // Prefer the signed-in user's Supabase copy so History always opens
          // the latest saved version, even in a different browser/device.
          try {
            const response = await fetch(
              `/api/conversations?id=${encodeURIComponent(chatId)}`,
              {
                method: "GET",
                cache: "no-store",
                signal: controller.signal,
              }
            );

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
              canUseLocalFallback = response.status >= 500;
              throw new Error(
                result.error || "Could not restore this conversation."
              );
            }

            const savedConversation = Array.isArray(result.conversations)
              ? result.conversations.find(
                (item: Conversation) => item.id === chatId
              )
              : null;

            if (!savedConversation) {
              throw new Error("This conversation was not found in your account history.");
            }

            const restoredConversation: Conversation = {
              ...savedConversation,
              agent: savedConversation.agent ?? "coding",
              messages: Array.isArray(savedConversation.messages)
                ? savedConversation.messages
                : [],
            };

            if (!cancelled) {
              setConversation(restoredConversation);

              // Keep a local cache for faster recovery if the network is unavailable.
              try {
                const existingHistory = localStorage.getItem(HISTORY_KEY);
                const parsed = existingHistory ? JSON.parse(existingHistory) : [];
                const history = Array.isArray(parsed) ? parsed : [];
                localStorage.setItem(
                  HISTORY_KEY,
                  JSON.stringify([
                    restoredConversation,
                    ...history.filter(
                      (item: Conversation) => item?.id !== restoredConversation.id
                    ),
                  ])
                );
              } catch (storageError) {
                console.warn("Could not cache the restored conversation locally:", storageError);
              }
            }
            return;
          } catch (remoteError) {
            if (remoteError instanceof DOMException && remoteError.name === "AbortError") {
              return;
            }

            if (remoteError instanceof TypeError) canUseLocalFallback = true;
            if (!canUseLocalFallback) throw remoteError;

            // Use the local cache for network/server failures, but respect an
            // explicit 401/404 so signed-out or deleted chats stay unavailable.
            const savedHistory = localStorage.getItem(HISTORY_KEY);
            if (savedHistory) {
              const parsedHistory: unknown = JSON.parse(savedHistory);
              if (Array.isArray(parsedHistory)) {
                const selectedConversation = parsedHistory.find(
                  (item): item is Conversation =>
                    Boolean(item) &&
                    typeof item === "object" &&
                    item.id === chatId &&
                    Array.isArray(item.messages)
                );

                if (selectedConversation) {
                  if (!cancelled) {
                    setConversation({
                      ...selectedConversation,
                      agent: selectedConversation.agent ?? "coding",
                    });
                  }
                  return;
                }
              }
            }

            throw remoteError;
          }
        }

        const savedChat = localStorage.getItem(CURRENT_CHAT_KEY);
        if (savedChat) {
          const parsedChat = JSON.parse(savedChat);

          if (Array.isArray(parsedChat)) {
            const now = new Date().toISOString();
            if (!cancelled) {
              setConversation({
                id: crypto.randomUUID(),
                agent: "coding",
                title: createTitle(parsedChat),
                messages: parsedChat,
                createdAt: now,
                updatedAt: now,
              });
            }
          } else if (
            parsedChat &&
            parsedChat.id &&
            Array.isArray(parsedChat.messages)
          ) {
            if (!cancelled) {
              setConversation({
                ...parsedChat,
                agent: parsedChat.agent ?? "coding",
              });
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to restore conversation:", err);
        if (!cancelled && chatId) {
          setConversation(createConversation());
          setError(
            err instanceof Error
              ? err.message
              : "Could not restore this conversation."
          );
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    }

    void restoreConversation();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [chatId]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;

    bottomRef.current?.scrollIntoView({
      behavior: isLoading ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(
        CURRENT_CHAT_KEY,
        JSON.stringify(conversation)
      );
    } catch (err) {
      console.error("Failed to save current conversation:", err);
      queueMicrotask(() => setError(
        "The chat could not be fully saved locally. The conversation or attached files may be too large for browser storage."
      ));
    }
  }, [conversation, isHydrated]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      abortControllerRef.current?.abort();
    };
  }, []);

  async function saveConversationToHistory(
    conversationToSave: Conversation
  ): Promise<void> {
    if (!conversationToSave.messages.some((msg) => msg.role === "user")) {
      return;
    }

    const updatedConversation: Conversation = {
      ...conversationToSave,
      agent: "coding",
      title: createTitle(conversationToSave.messages),
      updatedAt: new Date().toISOString(),
    };

    // Save locally first so the chat remains available if the network fails.
    try {
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      const parsedHistory: unknown = savedHistory ? JSON.parse(savedHistory) : [];
      const history: Conversation[] = Array.isArray(parsedHistory)
        ? parsedHistory.map((item) => ({
          ...item,
          agent: item.agent ?? "coding",
        }))
        : [];

      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([
          updatedConversation,
          ...history.filter((item) => item.id !== updatedConversation.id),
        ])
      );
    } catch (err) {
      console.error("Failed to save conversation to local history:", err);
      setError(
        "The chat history could not be saved locally. Browser storage may be full."
      );
    }

    // Also persist the latest messages to the signed-in user's Supabase account.
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: updatedConversation.id,
          title: updatedConversation.title,
          agent: "coding",
          messages: updatedConversation.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            ...(msg.context ? { context: msg.context } : {}),
          })),
        }),
        signal: AbortSignal.timeout(CONVERSATION_SAVE_TIMEOUT_MS),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Could not save conversation to Supabase.");
      }

      console.log("Conversation saved to Supabase.");
    } catch (err) {
      console.error("Supabase conversation save failed:", err);
      // Local saving still succeeded; surface the cloud-sync issue to the user.
      const saveError = err instanceof DOMException && err.name === "TimeoutError"
        ? "cloud sync timed out after 30 seconds"
        : err instanceof Error ? err.message : "Please try again.";
      setError(
        `Saved locally, but cloud sync failed: ${saveError}`
      );
    }
  }

  function updateMessages(newMessages: Message[]) {
    setConversation((current) => ({
      ...current,
      messages: newMessages,
      title: createTitle(newMessages),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function handleNewChat() {
    if (isLoading || isReadingFiles) return;

    // Wait for the current conversation's save request before switching chats.
    await saveConversationToHistory(conversation);

    setConversation(createConversation());
    setMessage("");
    setAttachments([]);
    setCopiedIndex(null);
    setError("");
    stopListening();
  }

  async function handleCopy(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
      setError("Could not copy the response to the clipboard.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

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

    recognitionRef.current?.abort();

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

        setMessage(transcript.trimStart().slice(0, 10000));
      };

      recognition.onerror = (event) => {
        setIsListening(false);

        if (event.error === "not-allowed") {
          setError(
            "Microphone permission was denied. Allow microphone access in your browser settings."
          );
        } else if (event.error === "no-speech") {
          setError("No speech detected. Please try again.");
        } else if (event.error !== "aborted") {
          setError(
            `Speech recognition failed (${event.error}). Please try again.`
          );
        }
      };

      recognition.onend = () => {
        setIsListening(false);

        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error("Could not start speech recognition:", err);
      recognitionRef.current = null;
      setIsListening(false);
      setError("Could not start the microphone. Please try again.");
    }
  }

  function isSupportedTextFile(file: File) {
    const name = file.name.toLowerCase();

    const allowedExtensions = [
      ".txt", ".md", ".markdown", ".log",
      ".js", ".jsx", ".ts", ".tsx",
      ".mjs", ".cjs", ".html", ".css",
      ".scss", ".json", ".jsonc",
      ".yaml", ".yml", ".toml", ".xml",
      ".csv", ".sql", ".sh", ".bash",
      ".py", ".java", ".c", ".h", ".cpp",
      ".hpp", ".cs", ".go", ".rs", ".php",
      ".rb", ".swift", ".kt", ".kts",
      ".dart", ".vue", ".svelte", ".graphql",
      ".gql", ".env", ".example", ".gitignore",
      ".dockerignore", ".dockerfile", ".makefile",
      ".prisma", ".tf", ".ini", ".conf",
      ".properties", ".bat", ".ps1", ".r",
      ".ipynb",
    ];

    return (
      allowedExtensions.some((ext) => name.endsWith(ext)) ||
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      file.type === "application/xml"
    );
  }

  async function extractPdfContent(file: File) {
    const loadingTask = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });

    const pdf = await loadingTask.promise;

    try {
      const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
      const parts: string[] = [];

      for (
        let pageNumber = 1;
        pageNumber <= pageCount;
        pageNumber++
      ) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();

        const pageText = textContent.items
          .map((item) => {
            if ("str" in item) return item.str;
            return "";
          })
          .join(" ")
          .trim();

        parts.push(
          `--- PDF page ${pageNumber} ---\n${pageText || "[No selectable text on this page]"
          }`
        );
      }

      let content = parts.join("\n\n");

      if (pdf.numPages > MAX_PDF_PAGES) {
        content += `\n\n[Only the first ${MAX_PDF_PAGES} of ${pdf.numPages} pages were extracted.]`;
      }

      if (
        !content
          .replace(/\[No selectable text on this page\]/g, "")
          .trim()
      ) {
        throw new Error(
          "This PDF has no extractable text. It may be scanned; OCR is not enabled in the Coding Agent yet."
        );
      }

      return content.slice(0, MAX_TEXT_FILE_CHARS);
    } finally {
      // Destroy the loading task, not the PDFDocumentProxy.
      await loadingTask.destroy();
    }
  }

  async function extractServerAttachmentContent(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/attachments/extract", {
      method: "POST",
      body: formData,
    });

    const result: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
          ? result.error
          : `Could not extract content from ${file.name}.`;

      throw new Error(errorMessage);
    }

    if (
      !result ||
      typeof result !== "object" ||
      !("content" in result) ||
      typeof result.content !== "string" ||
      !result.content.trim()
    ) {
      throw new Error(`No readable content was extracted from ${file.name}.`);
    }

    return result.content.slice(0, MAX_TEXT_FILE_CHARS);
  }

  async function handleFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!selectedFiles.length) return;

    setError("");

    if (attachments.length + selectedFiles.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files per message.`);
      return;
    }

    setIsReadingFiles(true);

    try {
      const newAttachments: Attachment[] = [];
      let totalCharacters = attachments.reduce(
        (sum, item) => sum + item.content.length,
        0
      );

      for (const file of selectedFiles) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(
            `${file.name} is larger than the 5 MB per-file limit.`
          );
        }

        let content = "";

        const lowerName = file.name.toLowerCase();

        if (
          file.type === "application/pdf" ||
          lowerName.endsWith(".pdf")
        ) {
          content = await extractPdfContent(file);
        } else if (
          lowerName.endsWith(".docx") ||
          file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          content = await extractServerAttachmentContent(file);
        } else if (
          file.type.startsWith("image/") ||
          /\\.(png|jpe?g|webp)$/i.test(lowerName)
        ) {
          content = await extractServerAttachmentContent(file);
        } else if (isSupportedTextFile(file)) {
          content = (await file.text()).slice(
            0,
            MAX_TEXT_FILE_CHARS
          );
        } else {
          throw new Error(
            `${file.name} is not supported. Attach text/code files, text-based PDFs, DOCX documents, or PNG/JPG/WEBP images.`
          );
        }

        const remaining = MAX_TOTAL_CONTEXT - totalCharacters;

        if (remaining <= 0) {
          throw new Error(
            "The total extracted file content limit is 60,000 characters per message."
          );
        }

        if (content.length > remaining) {
          content =
            content.slice(0, remaining) +
            "\n\n[Content truncated to fit the attachment context limit.]";
        }

        totalCharacters += content.length;

        newAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type || "text/plain",
          size: file.size,
          content,
        });
      }

      setAttachments((current) => [
        ...current,
        ...newAttachments,
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read the selected files."
      );
    } finally {
      setIsReadingFiles(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) =>
      current.filter((file) => file.id !== id)
    );
  }

  function handleStop() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }

  async function generateResponse(
    conversationMessages: Message[],
    conversationId: string,
    createdAt: string
  ) {
    setIsLoading(true);
    setCopiedIndex(null);
    setError("");

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let assistantContent = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationMessages,
          mode: codingMode,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let errorMessage = "Something went wrong.";

        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Keep the fallback message.
        }

        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        assistantContent += decoder.decode(value, {
          stream: true,
        });

        updateMessages([
          ...conversationMessages,
          {
            role: "assistant",
            content: assistantContent,
          },
        ]);
      }

      assistantContent += decoder.decode();

      const finalMessages: Message[] = [
        ...conversationMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ];

      const finalConversation: Conversation = {
        id: conversationId,
        agent: "coding",
        title: createTitle(finalMessages),
        messages: finalMessages,
        createdAt,
        updatedAt: new Date().toISOString(),
      };

      setConversation(finalConversation);
      await saveConversationToHistory(finalConversation);
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        const partialMessages: Message[] = [
          ...conversationMessages,
          ...(assistantContent.trim()
            ? [
              {
                role: "assistant" as const,
                content: assistantContent,
              },
            ]
            : []),
        ];

        const partialConversation: Conversation = {
          id: conversationId,
          agent: "coding",
          title: createTitle(partialMessages),
          messages: partialMessages,
          createdAt,
          updatedAt: new Date().toISOString(),
        };

        setConversation(partialConversation);

        try {
          await saveConversationToHistory(partialConversation);
        } catch (saveError) {
          console.error(
            "Could not save interrupted response:",
            saveError
          );
        }

        return;
      }

      console.error("Coding Agent request failed:", err);

      const errorText =
        err instanceof Error
          ? err.message
          : "Could not connect to the local AI model.";

      setError(errorText);

      const errorMessages: Message[] = [
        ...conversationMessages,
        {
          role: "assistant",
          content: `Sorry, I couldn't complete that request.\n\n${errorText}`,
        },
      ];

      const errorConversation: Conversation = {
        id: conversationId,
        agent: "coding",
        title: createTitle(errorMessages),
        messages: errorMessages,
        createdAt,
        updatedAt: new Date().toISOString(),
      };

      setConversation(errorConversation);
      await saveConversationToHistory(errorConversation);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }

  async function handleSend() {
    if (
      (!message.trim() && attachments.length === 0) ||
      isLoading ||
      isReadingFiles
    ) {
      return;
    }

    stopListening();

    const fileContext = attachments
      .map(
        (file) =>
          `FILE: ${file.name}\nCONTENT:\n${file.content}`
      )
      .join("\n\n==============================\n\n");

    const userMessage: Message = {
      role: "user",
      content:
        message.trim() ||
        `Please analyze the ${attachments.length === 1
          ? "attached file"
          : "attached files"
        }.`,
      context: fileContext || undefined,
      attachments: attachments.map(
        ({ id, name, type, size }) => ({
          id,
          name,
          type,
          size,
        })
      ),
    };

    const conversationMessages: Message[] = [
      ...messages,
      userMessage,
    ];

    const conversationId = conversation.id;
    const conversationCreatedAt = conversation.createdAt;

    setConversation((current) => ({
      ...current,
      title: createTitle(conversationMessages),
      messages: [
        ...conversationMessages,
        { role: "assistant", content: "" },
      ],
      updatedAt: new Date().toISOString(),
    }));

    setMessage("");
    setAttachments([]);
    setError("");

    await generateResponse(
      conversationMessages,
      conversationId,
      conversationCreatedAt
    );
  }

  async function handleRegenerate() {
    if (isLoading) return;

    const lastUserMessageIndex = messages
      .map((msg) => msg.role)
      .lastIndexOf("user");

    if (lastUserMessageIndex === -1) return;

    const conversationMessages = messages.slice(
      0,
      lastUserMessageIndex + 1
    );

    updateMessages([
      ...conversationMessages,
      { role: "assistant", content: "" },
    ]);

    await generateResponse(
      conversationMessages,
      conversation.id,
      conversation.createdAt
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-[10px] font-semibold uppercase">AI AGENT</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Coding Agent
          </h1>
          <p className="mt-2 text-gray-400">
            Write, debug, explain, and improve code with your AI coding assistant.
          </p>
        </div>

        <button
          onClick={handleNewChat}
          disabled={isLoading || isReadingFiles}
          className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-gray-300 transition hover:border-violet-400/40 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          + New Chat
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/10">
        <div
          ref={messagesContainerRef}
          onScroll={(event) => {
            const element = event.currentTarget;

            const distanceFromBottom =
              element.scrollHeight - element.scrollTop - element.clientHeight;

            shouldAutoScrollRef.current = distanceFromBottom < 100;
          }}
          className="h-[55vh] min-h-[350px] max-h-[calc(100vh-280px)] space-y-6 overflow-y-auto border-b border-white/10 p-4 sm:p-6"
        >
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-4 ${msg.role === "user" ? "justify-end" : ""
                }`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                  🤖
                </div>
              )}

              <div className="max-w-[85%] min-w-0">
                <div
                  className={`rounded-xl px-4 py-3 text-sm leading-6 ${msg.role === "user"
                    ? "bg-violet-500 text-white"
                    : "bg-white/[0.05] text-gray-300"
                    }`}
                >
                  {msg.role === "user" &&
                    msg.attachments?.length ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {msg.attachments.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-2 rounded-lg border border-white/20 bg-black/10 px-3 py-2 text-xs"
                        >
                          <span aria-hidden="true">📎</span>
                          <span className="max-w-48 break-all">
                            {file.name}
                          </span>
                          <span className="text-white/70">
                            {formatFileSize(file.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {msg.role === "assistant" ? (
                    msg.content ? (
                      <ReactMarkdown
                        rehypePlugins={[
                          [
                            rehypeHighlight,
                            {
                              detect: true,
                              ignoreMissing: true,
                            },
                          ],
                        ]}
                        components={{
                          p({ children }) {
                            return (
                              <p className="mb-3 last:mb-0">
                                {children}
                              </p>
                            );
                          },
                          h1({ children }) {
                            return (
                              <h1 className="mb-3 mt-4 text-lg font-semibold text-white">
                                {children}
                              </h1>
                            );
                          },
                          h2({ children }) {
                            return (
                              <h2 className="mb-3 mt-4 text-base font-semibold text-white">
                                {children}
                              </h2>
                            );
                          },
                          h3({ children }) {
                            return (
                              <h3 className="mb-2 mt-4 text-sm font-semibold text-white">
                                {children}
                              </h3>
                            );
                          },
                          ul({ children }) {
                            return (
                              <ul className="mb-3 list-disc space-y-1 pl-5">
                                {children}
                              </ul>
                            );
                          },
                          ol({ children }) {
                            return (
                              <ol className="mb-3 list-decimal space-y-1 pl-5">
                                {children}
                              </ol>
                            );
                          },
                          li({ children }) {
                            return <li>{children}</li>;
                          },
                          strong({ children }) {
                            return (
                              <strong className="font-semibold text-white">
                                {children}
                              </strong>
                            );
                          },
                          pre({ children }) {
                            return <CodeBlock>{children}</CodeBlock>;
                          },
                          code({ children, className }) {
                            if (className) {
                              return (
                                <code className={className}>
                                  {children}
                                </code>
                              );
                            }

                            return (
                              <code className="rounded bg-black/40 px-1.5 py-0.5 text-violet-200">
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-400" />
                    )
                  ) : (
                    <p className="whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  )}
                </div>

                {msg.role === "assistant" &&
                  msg.content &&
                  !isLoading &&
                  index !== 0 && (
                    <div className="mt-2 flex items-center gap-4">
                      <button
                        onClick={() =>
                          void handleCopy(msg.content, index)
                        }
                        className="text-xs text-gray-500 transition hover:text-violet-400"
                      >
                        {copiedIndex === index
                          ? "✓ Copied"
                          : "Copy Response"}
                      </button>

                      {index === messages.length - 1 && (
                        <button
                          onClick={() => void handleRegenerate()}
                          className="text-xs text-gray-500 transition hover:text-violet-400"
                        >
                          ↻ Regenerate
                        </button>
                      )}
                    </div>
                  )}
                {msg.role === "assistant" && msg.content && !isLoading && index === messages.length - 1 && index > 0 && (
                  <ResponseDownloads prompt={messages[index - 1]?.role === "user" ? messages[index - 1].content : ""} content={msg.content} />
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
              Generating response...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4">
          <div className="mb-4">
            <label
              htmlFor="coding-mode"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500"
            >
            </label>

            <div className="flex flex-wrap items-center gap-2">
              {CODING_MODES.map((mode) => {
                const isSelected = codingMode === mode.value;

                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setCodingMode(mode.value)}
                    disabled={isLoading}
                    title={mode.description}
                    aria-pressed={isSelected}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${isSelected
                      ? "border-violet-400/50 bg-violet-500/15 text-violet-200 shadow-sm shadow-violet-500/10"
                      : "border-white/10 bg-white/[0.03] text-gray-400 hover:border-violet-400/30 hover:bg-white/[0.06] hover:text-white"
                      }`}
                  >
                    <span className="mr-1.5" aria-hidden="true">
                      {mode.icon}
                    </span>
                    {mode.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              {CODING_MODES.find((mode) => mode.value === codingMode)?.description}
            </p>
          </div>
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
              <button
                type="button"
                onClick={() => setError("")}
                className="ml-2 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-300"
                >
                  <span aria-hidden="true">📎</span>
                  <span className="max-w-48 break-all">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-gray-500">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(file.id)}
                    disabled={isLoading}
                    aria-label={`Remove ${file.name}`}
                    className="ml-1 text-gray-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {isListening && (
            <p className="mb-2 text-xs text-violet-300">
              Listening... Speak your question, then click the mic to stop.
            </p>
          )}

          {isReadingFiles && (
            <p className="mb-2 text-xs text-violet-300">
              Reading and extracting file contents...
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt,.md,.markdown,.log,.js,.jsx,.ts,.tsx,.mjs,.cjs,.html,.css,.scss,.json,.jsonc,.yaml,.yml,.toml,.xml,.csv,.sql,.sh,.bash,.py,.java,.c,.h,.cpp,.hpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.kts,.dart,.vue,.svelte,.graphql,.gql,.env,.gitignore,.dockerignore,.dockerfile,.makefile,.prisma,.tf,.ini,.conf,.properties,.bat,.ps1,.r,.ipynb"
              onChange={handleFilesSelected}
              disabled={isLoading || isReadingFiles}
              className="hidden"
            />

            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  isLoading ||
                  isReadingFiles ||
                  attachments.length >= MAX_FILES
                }
                className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-gray-300 transition hover:border-violet-400/40 hover:text-white disabled:opacity-40"
                title="Attach code, text, PDFs, DOCX documents, or images"
                aria-label="Attach files"
              >
                📎 Attach
              </button>

              <input
                type="text"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={isLoading || isReadingFiles}
                placeholder="Ask the Coding Agent..."
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-400/50 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <button
                type="button"
                onClick={
                  isListening ? stopListening : startListening
                }
                disabled={isLoading || isReadingFiles}
                aria-label={
                  isListening ? "Stop voice input" : "Start voice input"
                }
                title={
                  isListening ? "Stop voice input" : "Speak your question"
                }
                className={`shrink-0 rounded-lg border px-3 py-3 text-sm transition disabled:opacity-40 ${isListening
                  ? "border-red-400/30 bg-red-500/10 text-red-300"
                  : "border-white/10 bg-white/[0.03] text-gray-300 hover:border-violet-400/40 hover:text-white"
                  }`}
              >
                {isListening ? "■" : "🎙️"}
              </button>

              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="shrink-0 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void handleSend()}
                  disabled={
                    (!message.trim() && attachments.length === 0) ||
                    isReadingFiles
                  }
                  className="shrink-0 rounded-lg bg-violet-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send
                </button>
              )}
            </div>

            <p className="w-full text-xs text-gray-600">
              Up to 5 files, 5 MB each. Supports text/code, text-based PDFs, DOCX, and PNG/JPG/WEBP images. Images are analyzed by your local Ollama vision model.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CodingAgentLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-gray-500">
        Loading Coding Agent...
      </div>
    </div>
  );
}

export default function CodingAgentPage() {
  return (
    <Suspense fallback={<CodingAgentLoading />}>
      <CodingAgentClient />
    </Suspense>
  );
}

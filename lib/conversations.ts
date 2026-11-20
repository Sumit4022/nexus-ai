export type AgentType =
  | "coding"
  | "pdf"
  | "research"
  | "knowledge";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type Conversation = {
  id: string;
  agent: AgentType;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

export const CURRENT_CHAT_KEY =
  "nexus-ai-current-chat";

export const HISTORY_KEY =
  "nexus-ai-chat-history";

export function createConversation(
  agent: AgentType
): Conversation {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    agent,
    title: "New Conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createConversationTitle(
  messages: Message[]
) {
  const firstUserMessage = messages.find(
    (message) => message.role === "user"
  );

  if (!firstUserMessage) {
    return "New Conversation";
  }

  const title =
    firstUserMessage.content.trim();

  if (title.length <= 45) {
    return title;
  }

  return `${title.slice(0, 45)}...`;
}

export function getAgentName(
  agent: AgentType
) {
  switch (agent) {
    case "coding":
      return "Coding Agent";

    case "pdf":
      return "PDF Agent";

    case "research":
      return "Research Agent";

    case "knowledge":
      return "Knowledge Agent";

    default:
      return "AI Agent";
  }
}

export function getAgentIcon(
  agent: AgentType
) {
  switch (agent) {
    case "coding":
      return "💻";

    case "pdf":
      return "📄";

    case "research":
      return "🔎";

    case "knowledge":
      return "🧠";

    default:
      return "🤖";
  }
}

export function saveConversationToHistory(
  conversation: Conversation
) {
  const hasUserMessage =
    conversation.messages.some(
      (message) =>
        message.role === "user"
    );

  if (!hasUserMessage) {
    return;
  }

  try {
    const savedHistory =
      localStorage.getItem(HISTORY_KEY);

    let history: Conversation[] = [];

    if (savedHistory) {
      const parsedHistory =
        JSON.parse(savedHistory);

      if (Array.isArray(parsedHistory)) {
        history = parsedHistory;
      }
    }

    const updatedConversation: Conversation = {
      ...conversation,
      title: createConversationTitle(
        conversation.messages
      ),
      updatedAt: new Date().toISOString(),
    };

    const filteredHistory =
      history.filter(
        (item) =>
          item.id !== updatedConversation.id
      );

    const updatedHistory = [
      updatedConversation,
      ...filteredHistory,
    ];

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(updatedHistory)
    );
  } catch (error) {
    console.error(
      "Failed to save conversation to history:",
      error
    );
  }
}
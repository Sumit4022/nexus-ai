import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_AGENTS = [
    "coding",
    "pdf",
    "research",
    "knowledge",
] as const;

type AgentType = (typeof VALID_AGENTS)[number];

type IncomingMessage = {
    role: "user" | "assistant";
    content: string;
    context?: string;
};

type IncomingConversation = {
    id: string;
    title: string;
    agent: AgentType;
    messages: IncomingMessage[];
    metadata?: Record<string, unknown>;
};

type ConversationRow = {
    id: string;
    title: string;
    agent_type: AgentType;
    metadata?: unknown;
    created_at: string;
    updated_at: string;
    messages: Array<{ role: string; content: string; context?: string | null; created_at: string }>;
};

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_TITLE_LENGTH = 200;
const MAX_MESSAGES = 500;
const MAX_MESSAGE_LENGTH = 100_000;
const MAX_TOTAL_CONTENT_LENGTH = 2_000_000;
const MAX_CONVERSATION_PAGE_SIZE = 50;
const MAX_SAVED_RESEARCH_RESULTS = 8;
const MAX_SAVED_RESEARCH_ANSWER_LENGTH = 50_000;
const MAX_SAVED_RESEARCH_SOURCES = 10;

function describeConversationSaveError(error: { code?: string; message?: string; hint?: string | null }) {
    if (error.code === "42P10") {
        return "Supabase is missing a unique index required by chat saves. Apply 20261106000000_repair_conversation_save_indexes.sql, then retry.";
    }
    if (error.code === "42883" || error.code === "PGRST202") {
        return "Supabase cannot find the conversation save function. Apply 20261103000200_atomic_conversation_saves.sql and refresh the Supabase schema cache.";
    }
    if (error.code === "42501") {
        return "Supabase denied this save for the signed-in account. Check the authenticated role grants and row security policies.";
    }

    const detail = typeof error.message === "string"
        ? error.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 260)
        : "No database error details were returned.";
    return `Supabase could not save this conversation${error.code ? ` (${error.code})` : ""}: ${detail}`;
}

function isObject(
    value: unknown
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isValidAgent(value: unknown): value is AgentType {
    return (
        typeof value === "string" &&
        VALID_AGENTS.includes(value as AgentType)
    );
}

function isValidConversation(
    value: unknown
): value is IncomingConversation {
    if (!isObject(value)) {
        return false;
    }

    if (
        typeof value.id !== "string" ||
        !UUID_REGEX.test(value.id)
    ) {
        return false;
    }

    if (
        typeof value.title !== "string" ||
        value.title.length > MAX_TITLE_LENGTH
    ) {
        return false;
    }

    if (!isValidAgent(value.agent)) {
        return false;
    }

    if (value.metadata !== undefined) {
        if (!isObject(value.metadata)) return false;
        const hasMetadata = Object.keys(value.metadata).length > 0;
        // The GET endpoint may include an empty metadata object for older
        // conversations. Permit that harmless value for every agent, while
        // keeping actual agent metadata limited to the agents that use it.
        if (hasMetadata && value.agent !== "pdf" && value.agent !== "research") return false;
        if (new TextEncoder().encode(JSON.stringify(value.metadata)).length > 800_000) return false;

        if (hasMetadata && value.agent === "research") {
            const research = value.metadata.research;
            if (!isObject(research) || !Array.isArray(research.results) || research.results.length > MAX_SAVED_RESEARCH_RESULTS) return false;
            for (const result of research.results) {
                if (!isObject(result) || typeof result.query !== "string" || result.query.length > 800 || typeof result.answer !== "string" || result.answer.length > MAX_SAVED_RESEARCH_ANSWER_LENGTH || !Array.isArray(result.sources) || result.sources.length > MAX_SAVED_RESEARCH_SOURCES) return false;
                for (const source of result.sources) {
                    if (!isObject(source) || !Number.isInteger(source.number) || typeof source.title !== "string" || source.title.length > 500 || typeof source.url !== "string" || source.url.length > 2_000 || typeof source.content !== "string" || source.content.length > 2_500 || (source.publishedDate !== null && typeof source.publishedDate !== "string")) return false;
                    try {
                        const url = new URL(source.url);
                        if (url.protocol !== "https:" && url.protocol !== "http:") return false;
                    } catch {
                        return false;
                    }
                }
            }
        }
    }

    if (
        !Array.isArray(value.messages) ||
        value.messages.length > MAX_MESSAGES
    ) {
        return false;
    }

    let totalContentLength = 0;

    for (const message of value.messages) {
        if (!isObject(message)) {
            return false;
        }

        if (
            message.role !== "user" &&
            message.role !== "assistant"
        ) {
            return false;
        }

        if (
            typeof message.content !== "string" ||
            message.content.length > MAX_MESSAGE_LENGTH
        ) {
            return false;
        }

        if (message.context !== undefined && (typeof message.context !== "string" || message.context.length > MAX_MESSAGE_LENGTH)) {
            return false;
        }

        totalContentLength += message.content.length;
        if (typeof message.context === "string") totalContentLength += message.context.length;

        if (totalContentLength > MAX_TOTAL_CONTENT_LENGTH) {
            return false;
        }
    }

    return true;
}

async function getAuthenticatedClient() {
    const supabase = await createClient();

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        return {
            supabase,
            user: null,
        };
    }

    return {
        supabase,
        user,
    };
}

/**
 * GET /api/conversations
 *
 * Returns compact conversation summaries for lists. A specific ID returns
 * the complete conversation for restoration in its agent.
 */
export async function GET(request: Request) {
    try {
        const { supabase, user } =
            await getAuthenticatedClient();

        if (!user) {
            return NextResponse.json(
                {
                    error: "Please sign in to view conversations.",
                },
                { status: 401 }
            );
        }

        const searchParams = new URL(request.url).searchParams;
        const requestedId = searchParams.get("id");
        if (requestedId && !UUID_REGEX.test(requestedId)) {
            return NextResponse.json({ error: "A valid conversation ID is required." }, { status: 400 });
        }

        const page = Number(searchParams.get("page") ?? "1");
        const pageSize = Number(searchParams.get("limit") ?? String(MAX_CONVERSATION_PAGE_SIZE));
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_CONVERSATION_PAGE_SIZE) {
            return NextResponse.json({ error: `Page must be a positive integer and limit must be between 1 and ${MAX_CONVERSATION_PAGE_SIZE}.` }, { status: 400 });
        }

        let data: ConversationRow[] = [];
        let queryError: { message: string } | null = null;
        let totalCount = 0;

        if (requestedId) {
            const result = await supabase
                .from("conversations")
                .select(`
                    id,
                    title,
                    agent_type,
                    metadata,
                    created_at,
                    updated_at,
                    messages (role, content, context, created_at)
                `)
                .eq("user_id", user.id)
                .eq("id", requestedId)
                .order("updated_at", { ascending: false });
            data = (result.data ?? []) as unknown as ConversationRow[];
            queryError = result.error;
        } else {
            const result = await supabase
                .from("conversations")
                .select(`
        id,
        title,
        agent_type,
        created_at,
        updated_at,
        messages!inner (
          role,
          content,
          created_at
        )
      `, { count: "exact" })
                .eq("user_id", user.id)
                .eq("messages.role", "user")
                .order("updated_at", { ascending: false })
                .order("id", { ascending: false })
                .order("created_at", { ascending: false, referencedTable: "messages" })
                .limit(1, { referencedTable: "messages" })
                .range((page - 1) * pageSize, page * pageSize - 1);
            data = (result.data ?? []) as unknown as ConversationRow[];
            queryError = result.error;
            totalCount = result.count ?? 0;
        }

        if (queryError) {
            console.error(
                "Failed to load conversations:",
                queryError
            );

            return NextResponse.json(
                {
                    error: "Could not load conversations.",
                },
                { status: 500 }
            );
        }

        const conversations = (data ?? []).map(
            (conversation) => {
                const messages = [
                    ...(conversation.messages ?? []),
                ]
                    .sort((a, b) => {
                        return (
                            new Date(a.created_at).getTime() -
                            new Date(b.created_at).getTime()
                        );
                    })
                    .map((message) => ({
                        role: message.role,
                        content: message.content,
                        ...(typeof message.context === "string" ? { context: message.context } : {}),
                    }));

                return {
                    id: conversation.id,
                    title: conversation.title,
                    agent: conversation.agent_type,
                    metadata: "metadata" in conversation ? conversation.metadata ?? {} : {},
                    createdAt: conversation.created_at,
                    updatedAt: conversation.updated_at,
                    messages,
                };
            }
        );

        return NextResponse.json(
            {
                conversations,
                page,
                pageSize: requestedId ? conversations.length : pageSize,
                totalCount: requestedId ? conversations.length : totalCount,
                hasMore: requestedId ? false : page * pageSize < totalCount,
            },
            {
                headers: {
                    "Cache-Control": "private, no-store",
                },
            }
        );
    } catch (error) {
        console.error(
            "Conversations GET error:",
            error
        );

        return NextResponse.json(
            {
                error: "An unexpected error occurred.",
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/conversations
 *
 * Creates or updates a conversation and replaces
 * its saved message list with the latest version.
 */
export async function POST(request: Request) {
    try {
        const { supabase, user } =
            await getAuthenticatedClient();

        if (!user) {
            return NextResponse.json(
                {
                    error: "Please sign in to save conversations.",
                },
                { status: 401 }
            );
        }

        let body: unknown;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                {
                    error: "Invalid JSON request.",
                },
                { status: 400 }
            );
        }

        if (!isValidConversation(body)) {
            return NextResponse.json(
                {
                    error:
                        "Invalid conversation data. Check the ID, title, agent, and messages.",
                },
                { status: 400 }
            );
        }

        const conversation = body;

        const now = new Date().toISOString();

        const title =
            conversation.title.trim().slice(
                0,
                MAX_TITLE_LENGTH
            ) || "New Conversation";

        const { error: saveError } = await supabase.rpc("save_agent_conversation", {
            p_conversation_id: conversation.id,
            p_title: title,
            p_agent_type: conversation.agent,
            p_messages: conversation.messages.map((message) => ({
                role: message.role,
                content: message.content,
                ...(typeof message.context === "string" ? { context: message.context } : {}),
            })),
            p_metadata: conversation.metadata ?? null,
        });

        if (saveError) {
            console.error("Atomic conversation save failed:", saveError);
            return NextResponse.json(
                { error: describeConversationSaveError(saveError) },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            id: conversation.id,
            updatedAt: now,
        });
    } catch (error) {
        console.error(
            "Conversations POST error:",
            error
        );

        return NextResponse.json(
            {
                error: "An unexpected error occurred.",
            },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/conversations?id=<conversation-id>
 *
 * Deletes a conversation belonging to the
 * authenticated user.
 */
export async function DELETE(request: Request) {
    try {
        const { supabase, user } =
            await getAuthenticatedClient();

        if (!user) {
            return NextResponse.json(
                {
                    error:
                        "Please sign in to delete conversations.",
                },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);

        const conversationId =
            searchParams.get("id");

        if (
            !conversationId ||
            !UUID_REGEX.test(conversationId)
        ) {
            return NextResponse.json(
                {
                    error:
                        "A valid conversation ID is required.",
                },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("conversations")
            .delete()
            .eq("id", conversationId)
            .eq("user_id", user.id)
            .select("id")
            .maybeSingle();

        if (error) {
            console.error(
                "Conversation deletion failed:",
                error
            );

            return NextResponse.json(
                {
                    error: "Could not delete the conversation.",
                },
                { status: 500 }
            );
        }

        if (!data) {
            return NextResponse.json(
                {
                    error:
                        "Conversation not found or access denied.",
                },
                { status: 404 }
            );
        }

        /*
         * The messages table references conversations
         * with ON DELETE CASCADE, so its messages are
         * removed automatically.
         */
        return NextResponse.json({
            success: true,
            id: data.id,
        });
    } catch (error) {
        console.error(
            "Conversations DELETE error:",
            error
        );

        return NextResponse.json(
            {
                error: "An unexpected error occurred.",
            },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";

type IncomingMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function makeClientMessageId() {
  return `assistant-${Math.random().toString(36).slice(2)}`;
}

export async function POST(request: NextRequest) {
  const basetenApiKey = process.env.BASETEN_API_KEY;
  const basetenModelSlug = process.env.BASETEN_MODEL_SLUG;

  if (!basetenApiKey || !basetenModelSlug) {
    return NextResponse.json(
      { error: "Baseten configuration is missing." },
      { status: 500 },
    );
  }

  let body: {
    messages?: IncomingMessage[];
    conversationId?: string | null;
    guestId?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, conversationId, guestId } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "'messages' array is required." },
      { status: 400 },
    );
  }

  const authHeader = request.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const accessToken = authHeader.slice("Bearer ".length).trim();
    if (accessToken) {
      const { data, error } = await supabaseServerClient.auth.getUser(
        accessToken,
      );
      if (!error && data.user) {
        userId = data.user.id;
      }
    }
  }

  let resolvedConversationId = conversationId ?? null;

  if (!resolvedConversationId) {
    const firstUserMessage = messages.find((m) => m.role === "user");
    const title = firstUserMessage?.content
      ? firstUserMessage.content.slice(0, 80)
      : null;

    const { data, error } = await supabaseServerClient
      .from("conversations")
      .insert({
        user_id: userId,
        guest_id: userId ? null : guestId ?? null,
        title,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to create conversation." },
        { status: 500 },
      );
    }

    resolvedConversationId = data.id;
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (lastUserMessage) {
    const { error: insertUserError } = await supabaseServerClient
      .from("messages")
      .insert({
        conversation_id: resolvedConversationId,
        role: "user",
        content: lastUserMessage.content,
      });

    if (insertUserError) {
      // Non-fatal: log and continue
      console.error("Error inserting user message", insertUserError);
    }
  }

  const basetenMessages = [
    {
      role: "system" as const,
      content:
        "You are a helpful assistant inside a Baseten-powered chat demo for a Forward Deployed Engineer portfolio project.",
    },
    ...messages,
  ];

  const startedAt = Date.now();

  const basetenResponse = await fetch(
    "https://inference.baseten.co/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${basetenApiKey}`,
      },
      body: JSON.stringify({
        model: basetenModelSlug,
        messages: basetenMessages,
      }),
    },
  );

  const latencyMs = Date.now() - startedAt;

  if (!basetenResponse.ok) {
    const text = await basetenResponse.text().catch(() => "");
    console.error("Baseten error", basetenResponse.status, text);
    return NextResponse.json(
      { error: "Baseten request failed." },
      { status: 502 },
    );
  }

  const json = await basetenResponse.json();

  const assistantContent: string | undefined =
    json?.choices?.[0]?.message?.content;

  if (!assistantContent) {
    return NextResponse.json(
      { error: "Unexpected response from Baseten." },
      { status: 500 },
    );
  }

  const usage = json?.usage ?? {};
  const inputTokens =
    usage.prompt_tokens ?? usage.input_tokens ?? usage.request_tokens ?? null;
  const outputTokens =
    usage.completion_tokens ?? usage.output_tokens ?? usage.response_tokens ??
    null;
  const totalTokens = usage.total_tokens ??
    (inputTokens && outputTokens ? inputTokens + outputTokens : null);

  const { error: insertAssistantError } = await supabaseServerClient
    .from("messages")
    .insert({
      conversation_id: resolvedConversationId,
      role: "assistant",
      content: assistantContent,
    });

  if (insertAssistantError) {
    console.error("Error inserting assistant message", insertAssistantError);
  }

  const { error: metricsError } = await supabaseServerClient
    .from("model_invocations")
    .insert({
      conversation_id: resolvedConversationId,
      provider: "baseten",
      model: basetenModelSlug,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: null,
    });

  if (metricsError) {
    console.error("Error inserting model_invocations", metricsError);
  }

  return NextResponse.json({
    conversationId: resolvedConversationId,
    message: {
      id: makeClientMessageId(),
      role: "assistant" as const,
      content: assistantContent,
    },
  });
}

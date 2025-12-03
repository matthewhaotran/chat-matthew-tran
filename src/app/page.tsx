"use client";

import { useEffect, useState, FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowserClient } from "@/lib/supabaseClient";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<
    { kind: "warning" | "error"; text: string } | null
  >(null);

  useEffect(() => {
    let isMounted = true;

    const initAuthAndGuest = async () => {
      const { data } = await supabaseBrowserClient.auth.getUser();
      if (!isMounted) return;
      setUser(data.user ?? null);

      const storedGuestId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("guest_id")
          : null;

      if (!storedGuestId && typeof window !== "undefined") {
        const newGuestId = crypto.randomUUID();
        window.localStorage.setItem("guest_id", newGuestId);
        setGuestId(newGuestId);
      } else if (storedGuestId) {
        setGuestId(storedGuestId);
      }
    };

    initAuthAndGuest();

    const {
      data: { subscription },
    } = supabaseBrowserClient.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;

    const redirectTo =
      origin && origin.includes("localhost")
        ? origin
        : process.env.NEXT_PUBLIC_SITE_URL ?? origin;

    await supabaseBrowserClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
  };

  const handleSignOut = async () => {
    await supabaseBrowserClient.auth.signOut();
  };

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setErrorBanner(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const { data } = await supabaseBrowserClient.auth.getSession();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token
            ? { Authorization: `Bearer ${data.session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          conversationId,
          guestId,
        }),
      });

      if (!res.ok) {
        let friendly =
          "There was an error contacting the model. Please try again shortly.";
        let kind: "warning" | "error" = "error";

        try {
          const data = (await res.json()) as { error?: string };
          const serverError =
            typeof data?.error === "string" ? data.error : undefined;

          if (res.status === 429) {
            kind = "warning";
            friendly =
              serverError ??
              "You are sending messages quickly. Please wait a moment before trying again.";
          } else if (res.status === 403) {
            kind = "warning";
            friendly =
              serverError ??
              "Guest conversations are limited. Sign in with Google to continue this conversation.";
          } else if (serverError) {
            friendly = serverError;
          }
        } catch {
          // ignore JSON parsing issues and use the default message
        }

        console.error("/api/chat error", res.status);
        setErrorBanner({ kind, text: friendly });
        return;
      }

      const json = (await res.json()) as {
        conversationId?: string;
        message?: ChatMessage;
      };

      if (json.conversationId && !conversationId) {
        setConversationId(json.conversationId);
      }

      if (json.message) {
        setMessages((prev) => [...prev, json.message!]);
      }
      setErrorBanner(null);
    } catch (error) {
      console.error("Error sending message", error);
      setErrorBanner({
        kind: "error",
        text: "Something went wrong while sending your message. Please try again.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const signedInLabel = user
    ? `Signed in as ${user.email ?? user.id}`
    : guestId
      ? "Using guest session"
      : "Initializing session";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            Baseten-powered chat
          </h1>
          <p className="text-xs text-zinc-400 sm:text-sm">
            Chat interface backed by Baseten and Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs text-zinc-400 sm:block">
            {signedInLabel}
          </p>
          {user ? (
            <button
              onClick={handleSignOut}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-200"
            >
              Log in
            </button>
          )}
        </div>
      </header>

      {isLoginOpen && !user && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-4 shadow-xl">
            <h2 className="text-sm font-semibold text-zinc-50">Sign in</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Sign in with Google to sync your conversations across devices.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLoginOpen(false)}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLoginOpen(false);
                  void handleGoogleSignIn();
                }}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-200"
              >
                Continue with Google
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex flex-1 flex-col items-center px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-zinc-100">Chat</p>
              <p className="text-xs text-zinc-400">
                Ask questions, explore ideas, and iterate with an LLM powered by
                Baseten.
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Prototype
            </span>
          </div>

          {errorBanner && (
            <div
              className={`border-b px-4 py-2 text-xs sm:text-sm ${
                errorBanner.kind === "warning"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {errorBanner.text}
            </div>
          )}

          <div className="flex-1 space-y-4 overflow-y-auto bg-zinc-950 px-4 py-4 sm:px-6">
            {messages.length === 0 ? (
              <div className="mt-8 text-center text-sm text-zinc-500">
                <p>Start a conversation by typing a message below.</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex w-full ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm sm:px-4 sm:py-2.5 ${
                      message.role === "user"
                        ? "bg-emerald-500 text-emerald-950"
                        : "bg-zinc-800 text-zinc-50"
                    }`}
                  >
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-300/80">
                      {message.role === "user" ? "You" : "Assistant"}
                    </p>
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="border-t border-zinc-800 bg-zinc-950/80 px-4 py-3 sm:px-6"
          >
            <div className="flex items-end gap-2">
              <textarea
                className="h-10 flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:h-11 sm:px-4"
                placeholder="Send a message..."
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

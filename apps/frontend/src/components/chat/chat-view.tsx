import { useChat } from "@ai-sdk/react";
import { AlertCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createChatTransport } from "@/lib/chat";
import type { ChatMessage } from "@/lib/chat-types";
import { formatChatError, logChatError } from "@/lib/format-chat-error";
import type { Conversation as ConversationRecord } from "@/lib/conversations-store";
import { useConversationsStore } from "@/lib/conversations-store";

import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";

export interface ChatViewProps {
  conversation: ConversationRecord;
}

export function ChatView({ conversation }: ChatViewProps) {
  const persistMessages = useConversationsStore((s) => s.setMessages);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, stop, regenerate, error, clearError } =
    useChat<ChatMessage>({
      id: conversation.id,
      messages: conversation.messages,
      transport: createChatTransport(),
      onError: logChatError,
    });

  // Persist messages when a turn settles, and once more on unmount so an
  // in-flight conversation isn't lost when switching away.
  const latestMessages = useRef(messages);
  useEffect(() => {
    latestMessages.current = messages;
  }, [messages]);

  useEffect(() => {
    if (status === "ready" || status === "error") {
      persistMessages(conversation.id, latestMessages.current);
    }
  }, [status, conversation.id, persistMessages]);

  useEffect(
    () => () => {
      persistMessages(conversation.id, latestMessages.current);
    },
    [conversation.id, persistMessages]
  );

  const handleSubmit = (text: string) => {
    clearError();
    sendMessage({ text });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    clearError();
    sendMessage({ text });
  };

  const handleRetry = () => {
    clearError();
    regenerate();
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4">
          {isEmpty ? (
            <EmptyState onSelect={handleSuggestion} />
          ) : (
            <MessageList
              messages={messages}
              onRegenerate={handleRetry}
              status={status}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        {error && (
          <Alert className="mb-3" variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{formatChatError(error)}</span>
              <Button onClick={handleRetry} size="sm" variant="outline">
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Composer
          input={input}
          onInputChange={setInput}
          onStop={stop}
          onSubmit={handleSubmit}
          status={status}
        />
        <p className="mt-2 text-center text-muted-foreground text-xs">
          The agent can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

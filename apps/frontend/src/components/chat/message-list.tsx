import type { ChatStatus } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { CheckIcon, CopyIcon, RefreshCcwIcon } from "lucide-react";
import { Fragment, useState } from "react";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Spinner } from "@/components/ui/spinner";
import type { ChatMessage, ChatToolPart } from "@/lib/chat-types";

interface MessageListProps {
  messages: ChatMessage[];
  status: ChatStatus;
  onRegenerate: () => void;
}

function getMessageText(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function ToolPartView({ part }: { part: ChatToolPart }) {
  const isDynamic = part.type === "dynamic-tool";
  return (
    <Tool>
      {isDynamic ? (
        <ToolHeader
          state={part.state}
          toolName={getToolName(part)}
          type="dynamic-tool"
        />
      ) : (
        <ToolHeader state={part.state} type={part.type} />
      )}
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator?.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <MessageAction onClick={handleCopy} tooltip={copied ? "Copied" : "Copy"}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </MessageAction>
  );
}

function AssistantMessage({
  message,
  showActions,
  onRegenerate,
}: {
  message: ChatMessage;
  showActions: boolean;
  onRegenerate: () => void;
}) {
  const text = getMessageText(message);

  return (
    <Message from="assistant">
      <div className="flex w-full flex-col gap-2">
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;
          if (part.type === "reasoning") {
            return (
              <Reasoning isStreaming={part.state === "streaming"} key={key}>
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          }
          if (isToolUIPart(part) || (part.type as string) === "dynamic-tool") {
            return <ToolPartView key={key} part={part as ChatToolPart} />;
          }
          if (part.type === "text") {
            return (
              <MessageContent key={key}>
                <MessageResponse>{part.text}</MessageResponse>
              </MessageContent>
            );
          }
          return <Fragment key={key} />;
        })}

        {showActions && text.length > 0 && (
          <MessageActions className="opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={text} />
            <MessageAction onClick={onRegenerate} tooltip="Regenerate">
              <RefreshCcwIcon />
            </MessageAction>
          </MessageActions>
        )}
      </div>
    </Message>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <Message from="user">
      <MessageContent>
        {message.parts.map((part, index) =>
          part.type === "text" ? (
            <p className="whitespace-pre-wrap" key={`${message.id}-${index}`}>
              {part.text}
            </p>
          ) : null
        )}
      </MessageContent>
    </Message>
  );
}

export function MessageList({
  messages,
  status,
  onRegenerate,
}: MessageListProps) {
  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;
  const isWaiting =
    status === "submitted" && messages.at(-1)?.role === "user";

  return (
    <div className="flex flex-col gap-8">
      {messages.map((message) =>
        message.role === "assistant" ? (
          <AssistantMessage
            key={message.id}
            message={message}
            onRegenerate={onRegenerate}
            showActions={
              message.id === lastAssistantId && status !== "streaming"
            }
          />
        ) : (
          <UserMessage key={message.id} message={message} />
        )
      )}

      {isWaiting && (
        <Message from="assistant">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner />
            Thinking…
          </div>
        </Message>
      )}
    </div>
  );
}

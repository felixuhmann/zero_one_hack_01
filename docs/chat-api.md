# Chat API contract (`/api/chat`)

The agent frontend (`apps/frontend`) talks to a single streaming endpoint. The
backend is implemented in a later step; this document is the contract it must
satisfy so the UI renders correctly.

In development, Vite proxies `/api` to `http://127.0.0.1:8000`
(`apps/frontend/vite.config.ts`). The client uses the Vercel AI SDK v6
`DefaultChatTransport`, so the request/response shapes below are fixed by that
transport and the AI SDK **UI message stream** protocol.

## Request

```
POST /api/chat
Content-Type: application/json
```

Body (sent automatically by `DefaultChatTransport`):

```jsonc
{
  "id": "conversation-id",          // stable per conversation
  "messages": [/* UIMessage[] */],  // full history, v5/v6 "parts" shape
  "trigger": "submit-message",      // or "regenerate-message"
  "messageId": "..."                // present on regenerate
}
```

Each `UIMessage` looks like:

```jsonc
{
  "id": "msg_123",
  "role": "user",            // "user" | "assistant" | "system"
  "metadata": { "model": "claude-sonnet-4", "createdAt": 1730000000000 },
  "parts": [
    { "type": "text", "text": "Hello" }
    // also: "reasoning", "tool-<name>", "dynamic-tool", "data-<name>", "file", "source-url"
  ]
}
```

To send extra context (selected model, enabled tools), include it in the
request `body` via the transport / `sendMessage({ body })` — the backend should
read those fields if present.

## Response

Return an **AI SDK UI message stream** over Server-Sent Events:

```
Content-Type: text/event-stream
```

On a JS/TS backend this is simply:

```ts
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model: "anthropic/claude-sonnet-4",
    system: "You are a helpful agent.",
    messages: convertToModelMessages(messages),
    tools: {/* server-side tool definitions */},
  });
  return result.toUIMessageStreamResponse();
}
```

A Python backend must emit the same SSE event stream. The UI consumes these
part/stream events:

| Stream event                          | Renders as                                  |
| ------------------------------------- | ------------------------------------------- |
| `text-start` / `text-delta` / `text-end` | Streamed markdown (code, math, mermaid)  |
| `reasoning-start` / `reasoning-delta`    | Collapsible "Thinking…" panel             |
| `tool-input-*` / `tool-output-*`         | Tool call card (params + result/error)    |
| `data-<name>`                            | Custom typed data parts (see `chat-types.ts`) |
| `error`                                  | Surfaced via `useChat` `onError` + retry  |
| finish events                            | Ends the assistant turn                    |

Metadata (model, token counts) can be attached with
`toUIMessageStreamResponse({ messageMetadata })` and is typed in
`apps/frontend/src/lib/chat-types.ts` (`ChatMessageMetadata`).

## Errors

Any non-2xx response or a stream `error` event is delivered to the client via
`useChat`'s `onError`. The UI shows an inline error with a Retry action that
re-runs the last turn (`regenerate`).

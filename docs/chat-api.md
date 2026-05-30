# Chat API contract (`/api/chat`)

The agent frontend (`apps/frontend`) talks to a single streaming endpoint,
implemented in the FastAPI backend at `apps/backend/forecasting/chat/`
(route registered in `forecasting/cli.py`). This document is the contract it
satisfies so the UI renders correctly.

The Python backend converts the incoming `UIMessage[]` to OpenAI chat messages
and streams from an **OpenAI-compatible** endpoint — the **Vercel AI Gateway**
by default (`https://ai-gateway.vercel.sh/v1`, models addressed as
`<provider>/<model>`). Configure it via repo-root `.env`:

| Variable | Purpose | Default |
|----------|---------|---------|
| `AI_GATEWAY_API_KEY` | Gateway API key (required for live responses) | — |
| `LLM_MODEL` | Model id | `anthropic/claude-sonnet-4.6` |
| `LLM_BASE_URL` | OpenAI-compatible base URL (point at a self-hosted / Leonardo vLLM endpoint to stay sovereign) | gateway URL |

When no key is configured the endpoint still returns a valid stream whose only
content is an `error` chunk, so the UI shows an inline error + Retry.

In development, Vite proxies `/api` to `http://127.0.0.1:8000`
(`apps/frontend/vite.config.ts`, with proxy timeouts disabled for long chat
streams). The client uses the Vercel AI SDK v6
`DefaultChatTransport`, so the request/response shapes below are fixed by that
transport and the AI SDK **UI message stream** protocol.

## Request

```
POST /api/chat
Content-Type: application/json
```

Body (sent automatically by `DefaultChatTransport`, plus client fields):

```jsonc
{
  "id": "conversation-id",          // stable per conversation
  "messages": [/* UIMessage[] */],  // full history, v5/v6 "parts" shape
  "trigger": "submit-message",      // or "regenerate-message"
  "messageId": "...",               // present on regenerate
  "model": "anthropic/claude-opus-4.8"  // optional; gateway "<provider>/<model>"
}
```

When `model` is omitted, the backend uses `LLM_MODEL` from `.env` or
`anthropic/claude-sonnet-4.6`. The chat UI sends `model` on every submit and
regenerate via `sendMessage` / `regenerate` `{ body: { model } }` (see
`apps/frontend/src/lib/models.ts` for the selectable ids).

Each `UIMessage` looks like:

```jsonc
{
  "id": "msg_123",
  "role": "user",            // "user" | "assistant" | "system"
  "metadata": { "model": "anthropic/claude-sonnet-4.6", "createdAt": 1730000000000 },
  "parts": [
    { "type": "text", "text": "Hello" }
    // also: "reasoning", "tool-<name>", "dynamic-tool", "data-<name>", "file", "source-url"
  ]
}
```

To send extra context (enabled tools, etc.), add fields alongside `model` in
the request `body` via `sendMessage({ body })` / `regenerate({ body })`.

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

Long tool calls (especially `run_forecast_pipeline`) can take several minutes
with no model tokens. The Python backend emits SSE comment keepalives
(`: keepalive`) every 15s during tool execution so proxies and browsers do not
close the connection. Backend logs use the `forecasting` logger (`INFO` on
`forecasting.api` and `forecasting.chat.service`).

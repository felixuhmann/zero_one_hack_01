import { DefaultChatTransport } from "ai";

import type { ChatMessage } from "./chat-types";

/**
 * Chat API endpoint.
 *
 * In dev, Vite proxies `/api` to the backend (see `vite.config.ts`,
 * default `http://127.0.0.1:8000`). The backend implements this route in
 * `apps/backend/forecasting/chat/`; the exact wire contract this client
 * expects is documented in `docs/chat-api.md` at the repo root.
 */
export const CHAT_API_ENDPOINT = "/api/chat";

/**
 * Builds the transport used by `useChat`. `DefaultChatTransport` POSTs
 * `{ id, messages, trigger, messageId }` to {@link CHAT_API_ENDPOINT} and
 * consumes an AI SDK UI message stream (SSE) in response.
 */
export function createChatTransport() {
  return new DefaultChatTransport<ChatMessage>({
    api: CHAT_API_ENDPOINT,
  });
}

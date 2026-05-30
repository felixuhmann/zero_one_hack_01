import { UIMessageStreamError } from "ai";

/** Log the full error once (dev only). Hook into `useChat({ onError })`. */
export function logChatError(error: Error): void {
  if (import.meta.env.DEV) {
    console.error("[chat] stream error", error);
  }
}

/** Turn `useChat` errors into something actionable in the UI. */
export function formatChatError(error: Error): string {
  if (UIMessageStreamError.isInstance(error)) {
    return `${error.message} (chunk: ${error.chunkType}, id: ${error.chunkId})`;
  }

  const message = error.message?.trim() || "Failed to reach the agent.";

  if (/network|fetch|failed to fetch|load failed/i.test(message)) {
    return `${message} — the connection may have timed out during a long forecast run. Keep this tab open and retry; check the backend terminal for progress.`;
  }

  if (/parse|validation|json/i.test(message)) {
    return `${message} — the server sent a chunk the client could not parse. Check the backend log for the matching request.`;
  }

  return message;
}

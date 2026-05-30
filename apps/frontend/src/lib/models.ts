/** Vercel AI Gateway model ids (`<provider>/<model>`). */
export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4.6";

export interface ChatModelOption {
  id: string;
  name: string;
}

/** Models exposed in the chat composer (gateway-addressable). */
export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = [
  { id: "anthropic/claude-opus-4.8", name: "Claude Opus 4.8" },
  { id: "openai/gpt-5.5", name: "GPT 5.5" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
] as const;

const MODEL_NAME_BY_ID = new Map(
  CHAT_MODEL_OPTIONS.map((option) => [option.id, option.name]),
);

export function isChatModelId(id: string): boolean {
  return MODEL_NAME_BY_ID.has(id);
}

export function chatModelLabel(id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  if (MODEL_NAME_BY_ID.has(id)) {
    return MODEL_NAME_BY_ID.get(id);
  }
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

const MODEL_STORAGE_KEY = "zero-one-chat-model";

export function loadPreferredChatModel(): string {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored && isChatModelId(stored)) {
      return stored;
    }
  } catch {
    // private mode / blocked storage
  }
  return DEFAULT_CHAT_MODEL;
}

export function savePreferredChatModel(id: string): void {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ChatMessage } from "./chat-types";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_TITLE = "New chat";

function createConversation(): Conversation {
  const now = Date.now();
  return {
    id: nanoid(),
    title: DEFAULT_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Derive a short title from the first user message. */
function deriveTitle(messages: ChatMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) {
    return null;
  }
  const text = firstUser.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
  if (!text) {
    return null;
  }
  return text.length > 48 ? `${text.slice(0, 48).trimEnd()}…` : text;
}

interface ConversationsState {
  conversations: Conversation[];
  activeId: string | null;
  /** Create a fresh conversation and make it active. Returns its id. */
  newConversation: () => string;
  /** Switch the active conversation. */
  setActiveId: (id: string) => void;
  /** Remove a conversation; keeps an active conversation selected. */
  deleteConversation: (id: string) => void;
  /** Rename a conversation explicitly. */
  renameConversation: (id: string, title: string) => void;
  /** Replace a conversation's messages (called as the chat streams/finishes). */
  setMessages: (id: string, messages: ChatMessage[]) => void;
  /** Ensure at least one conversation exists and is active. */
  ensureActive: () => string;
}

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,

      newConversation: () => {
        const conversation = createConversation();
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeId: conversation.id,
        }));
        return conversation.id;
      },

      setActiveId: (id) => set({ activeId: id }),

      deleteConversation: (id) =>
        set((state) => {
          const conversations = state.conversations.filter((c) => c.id !== id);
          let activeId = state.activeId;
          if (activeId === id) {
            activeId = conversations[0]?.id ?? null;
          }
          return { conversations, activeId };
        }),

      renameConversation: (id, title) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title: title.trim() || DEFAULT_TITLE } : c
          ),
        })),

      setMessages: (id, messages) =>
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== id) {
              return c;
            }
            const titleIsDefault = c.title === DEFAULT_TITLE;
            const derived = titleIsDefault ? deriveTitle(messages) : null;
            return {
              ...c,
              messages,
              title: derived ?? c.title,
              updatedAt: Date.now(),
            };
          }),
        })),

      ensureActive: () => {
        const { activeId, conversations } = get();
        if (activeId && conversations.some((c) => c.id === activeId)) {
          return activeId;
        }
        if (conversations.length > 0) {
          const id = conversations[0].id;
          set({ activeId: id });
          return id;
        }
        return get().newConversation();
      },
    }),
    {
      name: "zero-one-chat-conversations",
      version: 1,
    }
  )
);

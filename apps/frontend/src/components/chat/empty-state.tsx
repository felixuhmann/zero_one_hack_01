import { SparklesIcon } from "lucide-react";

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const STARTER_PROMPTS = [
  "Summarize the latest fed rate forecast",
  "What can you help me build?",
  "Draft a plan for a new agent workflow",
  "Explain how tool calling works",
];

export interface EmptyStateProps {
  onSelect: (prompt: string) => void;
}

export function EmptyState({ onSelect }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <SparklesIcon className="size-6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-semibold text-2xl tracking-tight">
            How can I help you today?
          </h1>
          <p className="text-muted-foreground text-sm">
            Ask anything, or pick a starting point below.
          </p>
        </div>
      </div>

      <Suggestions className="justify-center">
        {STARTER_PROMPTS.map((prompt) => (
          <Suggestion key={prompt} onClick={onSelect} suggestion={prompt} />
        ))}
      </Suggestions>
    </div>
  );
}

import type { ChatStatus } from "ai";
import { CheckIcon, ChevronDownIcon, PaperclipIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "claude-opus-4", name: "Claude Opus 4" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "claude-haiku-3-5", name: "Claude Haiku 3.5" },
] as const;

export interface ComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  status: ChatStatus;
  className?: string;
}

export function Composer({
  input,
  onInputChange,
  onSubmit,
  onStop,
  status,
  className,
}: ComposerProps) {
  // Model selection is a non-functional stub for now; the backend will own
  // the actual model routing in a later step.
  const [model, setModel] = useState<string>(MODELS[1].id);
  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[1];

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text) {
      return;
    }
    onSubmit(text);
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <PromptInput
      className={cn("rounded-2xl border-border bg-card shadow-sm", className)}
      onSubmit={handleSubmit}
    >
      <PromptInputTextarea
        autoFocus
        onChange={(event) => onInputChange(event.target.value)}
        placeholder="Message the agent…"
        value={input}
      />
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputButton
            disabled
            tooltip="Attachments coming soon"
            variant="ghost"
          >
            <PaperclipIcon />
          </PromptInputButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <PromptInputButton variant="ghost">
                <SparklesIcon />
                <span className="hidden sm:inline">{selectedModel.name}</span>
                <ChevronDownIcon />
              </PromptInputButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Model</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MODELS.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => setModel(m.id)}
                >
                  <span className="flex-1">{m.name}</span>
                  {m.id === model && <CheckIcon className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </PromptInputTools>

        <PromptInputSubmit
          disabled={!isBusy && input.trim().length === 0}
          onStop={onStop}
          status={status}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}

import type { ChatStatus } from "ai";
import { CheckIcon, ChevronDownIcon, PaperclipIcon, SparklesIcon } from "lucide-react";

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
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from "@/lib/models";
import { cn } from "@/lib/utils";

export interface ComposerProps {
  input: string;
  model: string;
  onModelChange: (modelId: string) => void;
  onInputChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  status: ChatStatus;
  className?: string;
}

export function Composer({
  input,
  model,
  onModelChange,
  onInputChange,
  onSubmit,
  onStop,
  status,
  className,
}: ComposerProps) {
  const selectedModel =
    CHAT_MODEL_OPTIONS.find((m) => m.id === model) ??
    CHAT_MODEL_OPTIONS.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    CHAT_MODEL_OPTIONS[0];

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
              {CHAT_MODEL_OPTIONS.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => onModelChange(m.id)}
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

import { useEffect } from "react";

import { ModeToggle } from "@/components/theme/mode-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConversationsStore } from "@/lib/conversations-store";

import { AppSidebar } from "./app-sidebar";
import { ChatView } from "./chat-view";

export interface ChatAppProps {
  onNavigateToStudio?: () => void;
  onNavigateToForecast?: () => void;
}

export function ChatApp({
  onNavigateToStudio,
  onNavigateToForecast,
}: ChatAppProps) {
  const conversations = useConversationsStore((s) => s.conversations);
  const activeId = useConversationsStore((s) => s.activeId);
  const ensureActive = useConversationsStore((s) => s.ensureActive);

  useEffect(() => {
    ensureActive();
  }, [ensureActive]);

  const active =
    conversations.find((c) => c.id === activeId) ?? conversations[0] ?? null;

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider>
        <AppSidebar
          onNavigateToForecast={onNavigateToForecast}
          onNavigateToStudio={onNavigateToStudio}
        />
        <SidebarInset className="flex h-svh min-h-0 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <SidebarTrigger className="-ml-1" />
            <Separator
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              orientation="vertical"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-medium text-sm">
                {active?.title ?? "New chat"}
              </h1>
            </div>
            <ModeToggle />
          </header>

          {active ? (
            <ChatView conversation={active} key={active.id} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

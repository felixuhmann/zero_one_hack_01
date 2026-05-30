import {
  LayoutDashboardIcon,
  LineChartIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useConversationsStore } from "@/lib/conversations-store";

export interface AppSidebarProps {
  onNavigateToStudio?: () => void;
  onNavigateToForecast?: () => void;
}

export function AppSidebar({
  onNavigateToStudio,
  onNavigateToForecast,
}: AppSidebarProps) {
  const conversations = useConversationsStore((s) => s.conversations);
  const activeId = useConversationsStore((s) => s.activeId);
  const newConversation = useConversationsStore((s) => s.newConversation);
  const setActiveId = useConversationsStore((s) => s.setActiveId);
  const deleteConversation = useConversationsStore((s) => s.deleteConversation);
  const renameConversation = useConversationsStore((s) => s.renameConversation);
  const { isMobile, setOpenMobile } = useSidebar();

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleSelect = (id: string) => {
    setActiveId(id);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleNew = () => {
    newConversation();
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const openRename = (id: string, currentTitle: string) => {
    setRenameTarget(id);
    setRenameValue(currentTitle);
  };

  const submitRename = () => {
    if (renameTarget) {
      renameConversation(renameTarget, renameValue);
    }
    setRenameTarget(null);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Zero One Agent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <SparklesIcon />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Zero One Agent</span>
                <span className="truncate text-xs">Chat</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleNew} tooltip="New chat">
                <MessageSquarePlusIcon />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {sorted.length === 0 && (
              <p className="px-2 py-1.5 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
                No conversations yet.
              </p>
            )}
            {sorted.map((conversation) => (
              <SidebarMenuItem key={conversation.id}>
                <SidebarMenuButton
                  isActive={conversation.id === activeId}
                  onClick={() => handleSelect(conversation.id)}
                  tooltip={conversation.title}
                >
                  <MessageSquareIcon />
                  <span className="truncate">{conversation.title}</span>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <MoreHorizontalIcon />
                      <span className="sr-only">More</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="right">
                    <DropdownMenuItem
                      onSelect={() =>
                        openRename(conversation.id, conversation.title)
                      }
                    >
                      <PencilIcon />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => deleteConversation(conversation.id)}
                      variant="destructive"
                    >
                      <Trash2Icon />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {(onNavigateToStudio || onNavigateToForecast) && (
        <SidebarFooter>
          <SidebarMenu>
            {onNavigateToStudio && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onNavigateToStudio}
                  tooltip="Decision Studio"
                >
                  <LayoutDashboardIcon />
                  <span>Decision Studio</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {onNavigateToForecast && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onNavigateToForecast}
                  tooltip="Forecast pipeline"
                >
                  <LineChartIcon />
                  <span>Forecast pipeline</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarFooter>
      )}

      <SidebarRail />

      <Dialog
        onOpenChange={(open) => !open && setRenameTarget(null)}
        open={renameTarget !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitRename();
              }
            }}
            value={renameValue}
          />
          <DialogFooter>
            <Button onClick={() => setRenameTarget(null)} variant="ghost">
              Cancel
            </Button>
            <Button onClick={submitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}

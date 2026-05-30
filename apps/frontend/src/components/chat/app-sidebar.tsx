import {
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useConversationsStore } from "@/lib/conversations-store";

export function AppSidebar() {
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
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SparklesIcon className="size-4" />
          </div>
          <span className="font-semibold text-sm">Zero One Agent</span>
        </div>
        <Button
          className="justify-start"
          onClick={handleNew}
          variant="outline"
        >
          <MessageSquarePlusIcon data-icon="inline-start" />
          New chat
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarMenu>
            {sorted.length === 0 && (
              <p className="px-2 py-1.5 text-muted-foreground text-xs">
                No conversations yet.
              </p>
            )}
            {sorted.map((conversation) => (
              <SidebarMenuItem key={conversation.id}>
                <SidebarMenuButton
                  isActive={conversation.id === activeId}
                  onClick={() => handleSelect(conversation.id)}
                >
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
                      <PencilIcon className="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => deleteConversation(conversation.id)}
                      variant="destructive"
                    >
                      <Trash2Icon className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

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

import type { AssistantBlock, ChatMessage } from "@/features/agent/messages";

const EMPTY_BLOCKS: AssistantBlock[] = [];

export function assistantBlocksForMessage(message: ChatMessage): AssistantBlock[] {
  if (message.blocks?.length) return message.blocks;
  if (!message.text.trim()) return EMPTY_BLOCKS;
  return [{ kind: "text", id: `${message.id}:fallback-text`, text: message.text }];
}

export function messageRenders(message: ChatMessage): boolean {
  if (message.role === "system") return false;
  if (message.role === "user") {
    return message.text.trim().length > 0 || Boolean(message.attachments?.length);
  }
  return assistantBlocksForMessage(message).some((block) =>
    block.kind === "text" ? block.text.trim() !== "" : true,
  );
}

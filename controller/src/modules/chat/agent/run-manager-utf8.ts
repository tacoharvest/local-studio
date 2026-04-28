import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { cleanUtf8StreamContent, type Utf8State } from "../../../core/utf8";
import type { AssistantMessage } from "./pi-agent-types";

export type MessageCleaner = (message: AgentMessage) => void;

/**
 * Create a stateful cleaner for streamed assistant UTF-8 fragments.
 * @returns Message cleaner function.
 */
export function createMessageCleaner(): MessageCleaner {
  const utf8State: Utf8State = { pendingContent: "", pendingReasoning: "" };

  return (message: AgentMessage): void => {
    if (!message || message.role !== "assistant") return;
    const assistant = message as AssistantMessage;
    const content = Array.isArray(assistant.content) ? assistant.content : null;
    if (!content) return;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;

      if (block.type === "text" && typeof (block as { text?: unknown }).text === "string") {
        const cleaned = cleanUtf8StreamContent((block as { text: string }).text, utf8State);
        (block as { text: string }).text = cleaned;
        continue;
      }

      if (
        block.type === "thinking" &&
        typeof (block as { thinking?: unknown }).thinking === "string"
      ) {
        const reasoningState = {
          pendingContent: utf8State.pendingReasoning,
          pendingReasoning: "",
        };
        const cleaned = cleanUtf8StreamContent(
          (block as { thinking: string }).thinking,
          reasoningState
        );
        utf8State.pendingReasoning = reasoningState.pendingContent;
        (block as { thinking: string }).thinking = cleaned;
      }
    }
  };
}

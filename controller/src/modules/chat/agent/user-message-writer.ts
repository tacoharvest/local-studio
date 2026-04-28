import type { AppContext } from "../../../types/context";
import type { ChatRunOptions } from "./run-manager-types";
import type { ImageContent } from "./pi-agent-types";

export function writeUserMessage(
  context: AppContext,
  options: ChatRunOptions,
  runId: string,
  userMessageId: string,
  storedModel: string
): ImageContent[] {
  const sessionId = options.sessionId;
  const content = options.content.trim();
  const userMetadata = { runId };

  const userParts: Array<Record<string, unknown>> = [];
  if (content) {
    userParts.push({ type: "text", text: content });
  }

  const agentImages: ImageContent[] = [];
  if (options.images && options.images.length > 0) {
    for (const img of options.images) {
      userParts.push({ type: "image", data: img.data, mimeType: img.mimeType, name: img.name });
      agentImages.push({ type: "image", data: img.data, mimeType: img.mimeType });
    }
  }

  context.stores.chatStore.addMessage(
    sessionId,
    userMessageId,
    "user",
    content,
    storedModel,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    userParts.length > 0 ? userParts : [{ type: "text", text: content }],
    userMetadata
  );

  return agentImages;
}

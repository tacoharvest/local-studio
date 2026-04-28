import { randomUUID } from "node:crypto";
import type { Agent } from "@mariozechner/pi-agent-core";
import type { AppContext } from "../../../types/context";
import type { AsyncQueue } from "../../../core/async";
import { handleAgentEvent, type ToolExecutionInfo } from "./agent-event-handler";
import type { AgentEventType } from "./contracts";
import { AGENT_RUN_EVENT_TYPES } from "./contracts";
import { buildAgentTools } from "./tool-registry";
import { createMessageCleaner } from "./run-manager-utf8";
import { persistAssistantMessage, extractToolResultText } from "./run-manager-persistence";
import { mapToolCallsToMessage, parseToolServer } from "./run-manager-utilities";
import type { ApprovalGate } from "./tool-approval-gate";
import type { RunRegistry } from "./run-registry";
import type { ImageContent } from "./pi-agent-types";

export interface AgentEventPipelineParams {
  context: AppContext;
  agent: Agent;
  activeRuns: RunRegistry;
  queue: AsyncQueue<string>;
  abort: AbortController;
  publish: (type: AgentEventType, data: Record<string, unknown>) => void;
  publishPlanEvent: (type: AgentEventType, data: Record<string, unknown>) => void;
  approvalGate: ApprovalGate;
  runId: string;
  sessionId: string;
  userMessageId: string;
  storedModel: string;
  agentMode: boolean;
  agentFiles: boolean;
  content: string;
  images: ImageContent[];
}

export async function createAgentEventPipeline(
  params: AgentEventPipelineParams
): Promise<void> {
  const {
    context,
    agent,
    activeRuns,
    queue,
    abort,
    publish,
    publishPlanEvent,
    approvalGate,
    runId,
    sessionId,
    userMessageId,
    storedModel,
    agentMode,
    agentFiles,
    content,
    images,
  } = params;

  const toolExecutionStarts = new Map<string, ToolExecutionInfo>();
  const toolCallToMessageId = new Map<string, string>();
  let currentAssistantMessageId: string | null = null;
  let lastAssistantMessageId: string | null = null;
  let runStatus: "completed" | "error" | "aborted" = "completed";
  let runError: string | null = null;
  let turnIndex = -1;

  const cleanMessage = createMessageCleaner();

  const tools = await buildAgentTools(context, {
    sessionId,
    agentMode,
    agentFiles,
    emitEvent: publishPlanEvent,
    approvalGate,
    runId,
  });
  agent.setTools(tools);

  const unsubscribe = agent.subscribe((event) => {
    handleAgentEvent(
      event,
      {
        runId,
        sessionId,
        publish,
        toolExecutionStarts,
        toolCallToMessageId,
        userMessageId,
        setAssistantId: (id) => {
          currentAssistantMessageId = id;
        },
        setLastAssistantId: (id) => {
          lastAssistantMessageId = id;
        },
        getAssistantId: () => currentAssistantMessageId,
        getLastAssistantId: () => lastAssistantMessageId,
        cleanMessage,
        getTurnIndex: () => turnIndex,
        setTurnIndex: (value) => {
          turnIndex = value;
        },
        markError: (message, status) => {
          runStatus = status;
          runError = message;
        },
      },
      {
        createMessageId: () => randomUUID(),
        mapToolCallsToMessage: (assistant, messageId, mapping) => {
          mapToolCallsToMessage(assistant, messageId, mapping);
        },
        persistAssistantMessage: (sid, mid, assistant, toolResults, rid, tIndex) => {
          persistAssistantMessage(context, {
            sessionId: sid,
            messageId: mid,
            assistant,
            toolResults,
            runId: rid,
            ...(typeof tIndex === "number" ? { turnIndex: tIndex } : {}),
          });
        },
        addToolExecution: (rid, toolCallId, toolName, toolExecutionOptions) => {
          context.stores.chatStore.addToolExecution(
            rid,
            toolCallId,
            toolName,
            toolExecutionOptions
          );
        },
        parseToolServer: (toolName) => parseToolServer(toolName),
        extractToolResultText: (result) => extractToolResultText(result),
      }
    );
  });

  publish(AGENT_RUN_EVENT_TYPES.RUN_START, {
    user_message_id: userMessageId,
    model: storedModel,
  });

  return agent
    .prompt(content, images.length > 0 ? images : undefined)
    .catch((error) => {
      runStatus = abort.signal.aborted ? "aborted" : "error";
      runError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      unsubscribe();
      approvalGate.clear();
      activeRuns.markFinished(runId);
      context.stores.chatStore.updateRun(runId, {
        status: runStatus,
        finishedAt: new Date().toISOString(),
      });
      publish(AGENT_RUN_EVENT_TYPES.RUN_END, {
        status: runStatus,
        error: runError,
      });
      queue.close();
    });
}

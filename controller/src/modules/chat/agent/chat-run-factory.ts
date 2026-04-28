import { randomUUID } from "node:crypto";
import { Agent } from "@mariozechner/pi-agent-core";
import type { AppContext } from "../../../types/context";
import { AsyncQueue } from "../../../core/async";
import { createOpenAiCompatibleModel } from "./model-factory";
import { mapAgentMessagesToLlm, mapStoredMessagesToAgentMessages } from "./message-mapper";
import { streamOpenAiCompletionsSafe } from "./stream-openai-completions-safe";
import { buildSystemPrompt } from "./system-prompt-builder";
import { createRunPublisher, createSseStream } from "./run-manager-sse";
import { createApprovalGate } from "./tool-approval-gate";
import { AGENT_RUN_EVENT_TYPES, type AgentEventType } from "./contracts";
import { resolveModel, resolveApiKey } from "./run-manager-model-resolver";
import type { ChatRunOptions, ChatRunStream } from "./run-manager-types";
import type { RunRegistry } from "./run-registry";
import { writeUserMessage } from "./user-message-writer";
import { createAgentEventPipeline } from "./agent-event-pipeline";

const RUN_EVENT_QUEUE_CAPACITY = 1024;

export async function createChatRun(
  context: AppContext,
  activeRuns: RunRegistry,
  options: ChatRunOptions
): Promise<ChatRunStream> {
  const sessionId = options.sessionId;
  const session = context.stores.chatStore.getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const content = options.content.trim();
  const hasImageInput = Array.isArray(options.images) && options.images.length > 0;
  if (!content && !hasImageInput) {
    throw new Error("Message content is required");
  }

  const modelSelection = await resolveModel(context, session, options.model, options.provider);
  const requestModel = modelSelection.requestModel;
  const storedModel = modelSelection.storedModel;
  const provider = modelSelection.provider;
  const apiKey = resolveApiKey(context, provider);

  const systemPrompt = buildSystemPrompt(session, options.systemPrompt, options.agentMode ?? false);
  const thinkingLevel = options.thinkingLevel ?? (options.deepResearch ? "high" : "off");
  const baseUrl = `http://localhost:${context.config.port}/v1`;
  const model = createOpenAiCompatibleModel(requestModel, baseUrl, provider);

  const history = Array.isArray(session["messages"])
    ? (session["messages"] as Array<Record<string, unknown>>)
    : [];
  const agentMessages = mapStoredMessagesToAgentMessages(history, model);

  const runId = randomUUID();
  const userMessageId = options.messageId ?? randomUUID();

  const agentImages = writeUserMessage(context, options, runId, userMessageId, storedModel);

  const runOptions = {
    userMessageId,
    model: storedModel,
    status: "running",
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(options.agentMode || options.agentFiles ? { toolsetId: "agent" } : {}),
  };
  context.stores.chatStore.createRun(runId, sessionId, runOptions);

  const queue = new AsyncQueue<string>(RUN_EVENT_QUEUE_CAPACITY);
  const abort = new AbortController();

  const { publish } = createRunPublisher(context, { runId, sessionId, queue });

  const publishPlanEvent = (type: AgentEventType, data: Record<string, unknown>): void => {
    publish(type, data);
  };

  const approvalGate = createApprovalGate((type, data) => publish(type as AgentEventType, data));

  const runEntry = activeRuns.createRun(
    runId,
    new Agent({
      initialState: {
        model,
        systemPrompt: systemPrompt ?? "",
        thinkingLevel,
        tools: [],
        messages: agentMessages,
      },
      convertToLlm: mapAgentMessagesToLlm,
      streamFn: streamOpenAiCompletionsSafe,
      getApiKey: (): string => apiKey,
      maxRetryDelayMs: 60_000,
    }),
    abort,
    requestModel,
    provider,
    approvalGate
  );
  const agent = runEntry.agent;
  agent.sessionId = sessionId;

  activeRuns.markRunning(runId);

  const runPromise = createAgentEventPipeline({
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
    agentMode: Boolean(options.agentMode),
    agentFiles: Boolean(options.agentFiles),
    content,
    images: agentImages,
  });

  return {
    runId,
    stream: createSseStream(queue, abort, runPromise),
  };
}

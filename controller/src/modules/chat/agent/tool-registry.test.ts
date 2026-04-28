import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../../config/env";
import { AGENT_TOOL_NAMES } from "./contracts";
import { buildAgentTools } from "./tool-registry";

const dataDir = join(tmpdir(), "vllm-studio");

const createConfig = (overrides: Partial<Config> = {}): Config => ({
  host: "0.0.0.0",
  port: 8080,
  inference_port: 8000,
  data_dir: dataDir,
  db_path: join(dataDir, "controller.db"),
  models_dir: "/models",
  strict_openai_models: false,
  providers: [],
  ...overrides,
});

describe("agent tool registry", () => {
  it("builds plan, local command, and file tools for agent mode", async () => {
    const tools = await buildAgentTools(
      {
        config: createConfig(),
      } as never,
      {
        sessionId: "session-1",
        agentMode: true,
        agentFiles: true,
      }
    );

    const names = tools.map((tool) => tool.name);
    expect(names).toContain(AGENT_TOOL_NAMES.EXECUTE_COMMAND);
    expect(names).toContain(AGENT_TOOL_NAMES.COMPUTER_USE);
    expect(names).toContain(AGENT_TOOL_NAMES.BROWSER_OPEN_URL);
    expect(names).toContain(AGENT_TOOL_NAMES.LIST_FILES);
    expect(names).toContain(AGENT_TOOL_NAMES.WRITE_FILE);
    expect(names).toContain("create_plan");
    expect(names).toContain("update_plan");
  });

  it("exposes file tools without local command or plan tools when agent mode is off", async () => {
    const tools = await buildAgentTools(
      {
        config: createConfig(),
      } as never,
      {
        sessionId: "session-1",
        agentMode: false,
        agentFiles: true,
      }
    );

    const names = tools.map((tool) => tool.name);
    expect(names).toContain(AGENT_TOOL_NAMES.LIST_FILES);
    expect(names).toContain(AGENT_TOOL_NAMES.WRITE_FILE);
    expect(names).not.toContain(AGENT_TOOL_NAMES.EXECUTE_COMMAND);
    expect(names).not.toContain(AGENT_TOOL_NAMES.COMPUTER_USE);
    expect(names).not.toContain(AGENT_TOOL_NAMES.BROWSER_OPEN_URL);
    expect(names).not.toContain("create_plan");
    expect(names).not.toContain("update_plan");
  });
});

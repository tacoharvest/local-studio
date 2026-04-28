import { describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLocalTools } from "./tool-registry-local";
import { AGENT_TOOL_NAMES } from "./contracts";

const dataDirectory = join(tmpdir(), "vllm-studio-local-tools");

const createTools = () => {
  rmSync(dataDirectory, { recursive: true, force: true });
  return buildLocalTools(
    {
      config: {
        data_dir: dataDirectory,
      },
    } as never,
    { sessionId: "session-test" }
  );
};

describe("local agent tools", () => {
  it("registers execute_command, computer_use, and browser_open_url", () => {
    const tools = createTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain(AGENT_TOOL_NAMES.EXECUTE_COMMAND);
    expect(names).toContain(AGENT_TOOL_NAMES.COMPUTER_USE);
    expect(names).toContain(AGENT_TOOL_NAMES.BROWSER_OPEN_URL);
  });

  it("execute_command runs a local shell command", async () => {
    const tools = createTools();
    const executeTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.EXECUTE_COMMAND)!;
    const result = await executeTool.execute("call-1", { command: "echo hello-local" });
    const textPart = result.content.find(
      (item): item is { type: "text"; text: string } => item.type === "text"
    );
    expect(textPart?.text).toContain("hello-local");
  });

  it("execute_command accepts cmd alias", async () => {
    const tools = createTools();
    const executeTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.EXECUTE_COMMAND)!;
    const result = await executeTool.execute("call-2", { cmd: "echo alias-test" });
    const textPart = result.content.find(
      (item): item is { type: "text"; text: string } => item.type === "text"
    );
    expect(textPart?.text).toContain("alias-test");
  });

  it("execute_command accepts raw string params", async () => {
    const tools = createTools();
    const executeTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.EXECUTE_COMMAND)!;
    const result = await executeTool.execute("call-3", "echo raw-string");
    const textPart = result.content.find(
      (item): item is { type: "text"; text: string } => item.type === "text"
    );
    expect(textPart?.text).toContain("raw-string");
  });

  it("computer_use works like execute_command", async () => {
    const tools = createTools();
    const computerTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.COMPUTER_USE)!;
    const result = await computerTool.execute("call-4", { cmd: "echo computer-test" });
    const textPart = result.content.find(
      (item): item is { type: "text"; text: string } => item.type === "text"
    );
    expect(textPart?.text).toContain("computer-test");
  });

  it("browser_open_url fetches a URL via curl", async () => {
    const tools = createTools();
    const browserTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.BROWSER_OPEN_URL)!;
    const result = await browserTool.execute("call-5", { url: "https://example.com" });
    const textPart = result.content.find(
      (item): item is { type: "text"; text: string } => item.type === "text"
    );
    expect(textPart?.text).toContain("URL: https://example.com");
    expect(textPart?.text).toContain("Title:");
  });

  it("execute_command keeps cwd inside sandbox root", async () => {
    const tools = createTools();
    const executeTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.EXECUTE_COMMAND)!;
    const result = await executeTool.execute("call-6", { command: "pwd" });
    const textPart = result.content.find(
      (item): item is { type: "text"; text: string } => item.type === "text"
    );
    expect(textPart?.text).toContain(`${dataDirectory}/agent-tools-shell/session-test`);
  });

  it("rejects cwd that escapes sandbox root", async () => {
    const tools = createTools();
    const executeTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.EXECUTE_COMMAND)!;
    await expect(executeTool.execute("call-7", { command: "pwd", cwd: "/tmp" })).rejects.toThrow(
      "cwd escapes sandbox root"
    );
  });

  it("rejects blocked dangerous commands", async () => {
    const tools = createTools();
    const executeTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.EXECUTE_COMMAND)!;
    await expect(executeTool.execute("call-8", { command: "sudo ls" })).rejects.toThrow(
      "blocked operation"
    );
  });

  it("rejects localhost browser URLs", async () => {
    const tools = createTools();
    const browserTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.BROWSER_OPEN_URL)!;
    await expect(browserTool.execute("call-9", { url: "http://localhost:3000" })).rejects.toThrow(
      "localhost URLs are not allowed"
    );
  });

  it("rejects private IP browser URLs", async () => {
    const tools = createTools();
    const browserTool = tools.find((t) => t.name === AGENT_TOOL_NAMES.BROWSER_OPEN_URL)!;
    await expect(browserTool.execute("call-10", { url: "http://192.168.1.10" })).rejects.toThrow(
      "private or non-routable IP addresses are not allowed"
    );
  });
});

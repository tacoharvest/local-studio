import { describe, expect, test } from "bun:test";
import { normalizeDeepSeekV4Thinking } from "../../../controller/src/modules/proxy/chat-request";

describe("DeepSeek V4 thinking request normalization", () => {
  test("maps Pi thinking controls to the DS4 chat template", () => {
    const payload: Record<string, unknown> = {
      thinking: { type: "enabled" },
      chat_template_kwargs: { preserve_thinking: true },
    };

    expect(normalizeDeepSeekV4Thinking(payload, { reasoning_parser: "deepseek_v4" })).toBe(true);
    expect(payload["chat_template_kwargs"]).toEqual({
      preserve_thinking: true,
      thinking: true,
      enable_thinking: true,
    });
  });

  test("does not alter other reasoning parsers", () => {
    const payload: Record<string, unknown> = { thinking: { type: "enabled" } };

    expect(normalizeDeepSeekV4Thinking(payload, { reasoning_parser: "deepseek_r1" })).toBe(false);
    expect(payload["chat_template_kwargs"]).toBeUndefined();
  });
});

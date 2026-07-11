import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

test("composer hides optional controls as its own pane narrows", () => {
  const css = source("src/app/styles/globals/chat.css");
  assert.match(
    css,
    /@container \(max-width: 38rem\)[\s\S]*agent-composer-model[\s\S]*agent-composer-plugin/,
  );
  assert.match(
    css,
    /@container \(max-width: 32rem\)[\s\S]*agent-composer-canvas[\s\S]*agent-composer-browser-backend/,
  );
  assert.match(css, /@container \(max-width: 26rem\)[\s\S]*agent-composer-browser/);
});

test("composer keeps the input, attachment, and send controls out of collapse rules", () => {
  const css = source("src/app/styles/globals/chat.css");
  assert.doesNotMatch(css, /agent-composer-attach\s*\{\s*display:\s*none/);
  const actions = source("src/features/agent/ui/agent-composer-actions.tsx");
  assert.match(actions, /agent-composer-attach/);
  assert.match(actions, /type="submit"/);
});

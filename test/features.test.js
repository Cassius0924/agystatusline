import test from "node:test";
import assert from "node:assert/strict";
import { renderLines } from "../src/render.js";

const P = {
  conversation_id: "12345678-abcd",
  model: { display_name: "Gemini 4 Argon (High)", effort: "high" },
  workspace: { current_dir: "/root/proj" },
  context_window: {
    used_percentage: 42.5, context_window_size: 1048576,
    total_input_tokens: 120000, total_output_tokens: 8000,
    current_usage: { input_tokens: 100, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 },
  },
  vcs: { branch: "main" },
  quota: { "gemini-5h": { remaining_fraction: 0.5, reset_in_seconds: 3600 } },
  sandbox: { enabled: true },
  plan_tier: "Pro",
  pending_input_count: 2,
};
const GIT = {
  branch: "main", changes: "+5 \u22122", insertions: "+5", deletions: "\u22122", sha: "abc1234",
  root: "proj", origin: "me/proj", staged: 1, unstaged: 2, untracked: 3, aheadBehind: "\u21e132 \u21e31",
};
const ctx = (extra = {}) => ({ p: P, home: "/root", git: GIT, width: 0, mem: 61, now: "14:05", ...extra });

test("new token and context widgets read the payload", () => {
  const cfg = { lines: [[{ type: "tokens-input" }, { type: "separator" }, { type: "tokens-output" }, { type: "separator" }, { type: "context-length" }, { type: "separator" }, { type: "context-window" }, { type: "separator" }, { type: "context-remaining" }]] };
  assert.equal(renderLines(cfg, ctx(), { color: false }), "120k | 8k | 128k | 1.0M | 58%");
});

test("git sub-widgets come from the cached git info", () => {
  const cfg = { lines: [[{ type: "git-insertions" }, { type: "separator" }, { type: "git-deletions" }, { type: "separator" }, { type: "git-staged" }, { type: "separator" }, { type: "git-unstaged" }, { type: "separator" }, { type: "git-untracked" }, { type: "separator" }, { type: "git-ahead-behind" }, { type: "separator" }, { type: "git-root" }, { type: "separator" }, { type: "git-origin" }]] };
  assert.equal(renderLines(cfg, ctx(), { color: false }), "+5 | \u22122 | +1 | ~2 | ?3 | \u21e132 \u21e31 | proj | me/proj");
});

test("host widgets: clock, memory, terminal width, plan, sandbox, queue", () => {
  const cfg = { lines: [[{ type: "clock" }, { type: "separator" }, { type: "memory" }, { type: "separator" }, { type: "terminal-width" }, { type: "separator" }, { type: "plan" }, { type: "separator" }, { type: "sandbox" }, { type: "separator" }, { type: "queue" }]] };
  assert.equal(renderLines(cfg, ctx({ width: 120 }), { color: false }), "14:05 | 61% | 120 | Pro | SB:ON | +2");
});

test("flex separator pushes the tail to the right edge", () => {
  const cfg = { lines: [[{ type: "agent-state" }, { type: "flex-separator" }, { type: "cost", metadata: {} }]] };
  const out = renderLines(cfg, ctx({ p: { ...P, agent_state: "idle", cost: { total_usd: 0.5 } } }), { color: false, width: 40 });
  assert.equal([...out].length, 40);
  assert.ok(out.startsWith("READY"));
  assert.ok(out.endsWith("$0.50"));
});

test("powerline mode paints blocks with background colours and a glyph", () => {
  const cfg = {
    powerline: { enabled: true, separators: ["\uE0B0"], endCap: "\uE0B4", autoAlign: true },
    lines: [
      [{ type: "model", bgColor: "#224488", textColor: "#ffffff" }, { type: "git-branch", bgColor: "#884422", textColor: "#ffffff" }],
    ],
  };
  const out = renderLines(cfg, ctx(), { color: true, width: 120 });
  assert.ok(out.includes("\x1b[48;2;34;68;136m"), "model block background");
  assert.ok(out.includes("\uE0B0"), "separator glyph");
  assert.ok(out.includes("\uE0B4"), "end cap");
  assert.ok(out.includes("\x1b[38;2;34;68;136;48;2;136;68;34m"), "glyph carries the previous background");
});

test("powerline aligns equal columns across rows", () => {
  const cfg = {
    powerline: { enabled: true, separators: ["\uE0B0"], autoAlign: true },
    lines: [
      [{ type: "model", bgColor: "#111111" }, { type: "plan", bgColor: "#222222" }],
      [{ type: "agent-state", bgColor: "#111111" }, { type: "plan", bgColor: "#222222" }],
    ],
  };
  const plain = renderLines(cfg, ctx(), { color: false });
  const [a, b] = plain.split("\n").map((l) => l.replace(/\uE0B0/g, "|"));
  // "Gemini 4 Argon (High)" is longer than "READY": the second column starts at the same offset both rows.
  assert.equal(a.indexOf("Pro"), b.indexOf("Pro"));
});

test("a theme recolours explicit named colours, not just slots", () => {
  const cfg = { theme: "mono", lines: [[{ type: "model", color: "brightBlue" }]] };
  const aurora = { theme: "aurora", lines: [[{ type: "model", color: "brightBlue" }]] };
  const plain = renderLines(cfg, ctx(), { color: true });
  const neon = renderLines(aurora, ctx(), { color: true });
  assert.ok(plain.includes("\x1b[97m"), "mono turns brightBlue into brightWhite");
  assert.ok(neon.includes("\x1b[96m"), "aurora turns brightBlue into brightCyan");
  assert.notEqual(plain, neon);
});

test("theme slots resolve to their palette colour", () => {
  const cfg = { theme: "aurora", lines: [[{ type: "git-branch", color: "git" }]] };
  assert.ok(renderLines(cfg, ctx(), { color: true }).includes("\x1b[95m"), "aurora git slot is brightMagenta");
});

test("custom theme object overrides the built-in palettes", () => {
  const cfg = { theme: { git: "#ff0000" }, lines: [[{ type: "git-branch", color: "git" }]] };
  assert.ok(renderLines(cfg, ctx(), { color: true }).includes("\x1b[38;2;255;0;0m"));
});

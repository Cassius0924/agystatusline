import test from "node:test";
import assert from "node:assert/strict";
import { renderLines, cacheHitRate, duration, quotaBucket } from "../src/render.js";

const PAYLOAD = {
  cwd: "/root/proj",
  conversation_id: "12345678-abcd-ef01-2345-6789abcdef01",
  conversation_title: "重构状态栏渲染并统一配色方案",
  model: { id: "gemini-4-argon-high", display_name: "Gemini 4 Argon (High)", effort: "high" },
  workspace: { current_dir: "/root/proj", project_dir: "/root/proj" },
  context_window: {
    total_input_tokens: 88244,
    total_output_tokens: 61074,
    context_window_size: 1048576,
    used_percentage: 14.24,
    current_usage: { input_tokens: 63382, output_tokens: 346, cache_read_input_tokens: 20857, cache_creation_input_tokens: 0 },
  },
  vcs: { type: "git", branch: "feat/x" },
  vim: { mode: "NORMAL" },
  quota: {
    "3p-5h": { remaining_fraction: 0.5, reset_in_seconds: 60 },
    "gemini-5h": { remaining_fraction: 0.72, reset_in_seconds: 5400 },
    "gemini-weekly": { remaining_fraction: 0.93, reset_in_seconds: 560580 },
  },
  cost: { total_usd: 0.4213 },
};

const CONFIG = {
  lines: [
    [
      { type: "model", color: "brightBlue" },
      { type: "custom-text", customText: " " },
      { type: "thinking-effort", color: "brightBlue" },
      { type: "separator" },
      { type: "current-working-dir", color: "brightMagenta", metadata: { abbreviateHome: "true" } },
      { type: "separator" },
      { type: "git-branch", color: "magenta" },
      { type: "separator" },
      { type: "vim-mode", color: "brightBlack" },
    ],
    [
      { type: "custom-text", customText: "Ctx ", color: "green" },
      { type: "context-percentage-usable", metadata: { display: "slider" } },
      { type: "separator", character: "|" },
      { type: "cache-hit-rate", color: "brightBlack" },
      { type: "separator", character: "|" },
      { type: "claude-session-id", color: "brightBlack" },
    ],
    [
      { type: "session-usage", color: "white" },
      { type: "custom-text", customText: " x " },
      { type: "reset-timer" },
      { type: "custom-text", customText: " x " },
      { type: "weekly-usage" },
      { type: "custom-text", customText: " x " },
      { type: "weekly-reset-timer" },
    ],
  ],
};

const ctx = (p = PAYLOAD) => ({ p, home: "/root", git: { branch: p.vcs?.branch ?? "", changes: "+128 \u221234", sha: "a1b2c3d" } });

test("renders three plain lines without colour", () => {
  const lines = renderLines(CONFIG, ctx(), { color: false }).split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "Gemini 4 Argon (High) high | ~/proj | feat/x | NORMAL");
  assert.equal(lines[1], "Ctx \u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591 14% | 25% | 12345678");
  assert.equal(lines[2], "72% x 1h 30m x 93% x 6d 11h");
});

test("no double spaces and no escape codes when colour is off", () => {
  const out = renderLines(CONFIG, ctx(), { color: false });
  assert.ok(!out.includes("  "), `double space in ${JSON.stringify(out)}`);
  assert.ok(!out.includes("\x1b"));
});

test("colour wraps each value but keeps the joiners plain", () => {
  const out = renderLines(CONFIG, ctx(), { color: true });
  assert.ok(out.includes("\x1b[94mGemini 4 Argon (High)\x1b[0m"));
  assert.ok(out.includes("\x1b[0m | \x1b[35mfeat/x")); // joiners stay plain
});

test("missing data hides the widget instead of printing blanks", () => {
  const out = renderLines(CONFIG, { p: {}, home: "/root", git: { branch: "", changes: "", sha: "" } }, { color: false });
  assert.equal(out, "");
});

test("git-changes and title only appear when configured", () => {
  const cfg = { lines: [[{ type: "git-changes" }, { type: "separator" }, { type: "title" }]] };
  assert.equal(renderLines(cfg, ctx(), { color: false }), "+128 \u221234 | 重构状态栏渲染并统一配色方案");
});

test("cache hit rate counts cached + fresh prompt tokens", () => {
  assert.equal(cacheHitRate({ input_tokens: 63382, cache_read_input_tokens: 20857, cache_creation_input_tokens: 0 }), 25);
  assert.equal(cacheHitRate({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }), null);
  assert.equal(cacheHitRate(undefined), null);
});

test("quota buckets prefer the gemini-* window", () => {
  assert.equal(quotaBucket(PAYLOAD.quota, "5h").remaining_fraction, 0.72);
  assert.equal(quotaBucket(PAYLOAD.quota, "weekly").remaining_fraction, 0.93);
  assert.equal(quotaBucket({}, "5h"), null);
});

test("width drops trailing widgets instead of wrapping", () => {
  const narrow = renderLines(CONFIG, ctx(), { color: false, width: 40 });
  const wide = renderLines(CONFIG, ctx(), { color: false, width: 200 });
  assert.ok(narrow.split("\n")[0].length <= 40, narrow.split("\n")[0]);
  assert.ok(wide.split("\n")[0].includes("NORMAL"));
});

test("context and quota pick their own colour when the config sets none", () => {
  const cfg = { lines: [[{ type: "context-percentage-usable" }, { type: "separator" }, { type: "session-usage" }]] };
  const hot = { p: { ...PAYLOAD, context_window: { used_percentage: 95 }, quota: { "gemini-5h": { remaining_fraction: 0.05 } } }, home: "/root", git: {} };
  const cold = { p: { ...PAYLOAD, context_window: { used_percentage: 10 }, quota: { "gemini-5h": { remaining_fraction: 0.9 } } }, home: "/root", git: {} };
  assert.ok(renderLines(cfg, hot, { color: true }).includes("\x1b[31m"));
  assert.ok(renderLines(cfg, cold, { color: true }).includes("\x1b[32m"));
});

test("durations read like humans expect", () => {
  assert.equal(duration(5400), "1h 30m");
  assert.equal(duration(560580), "6d 11h");
  assert.equal(duration(45), "now");
  assert.equal(duration(null), "");
});

import test from "node:test";
import assert from "node:assert/strict";
import { detectLang, t, translator } from "../src/i18n.js";
import { renderLines, duration } from "../src/render.js";

const P = {
  agent_state: "tool_use",
  model: { display_name: "Gemini 4 Argon (High)" },
  workspace: { current_dir: "/root/proj" },
  quota: { "gemini-5h": { remaining_fraction: 0.72, reset_in_seconds: 5400 } },
  subagents: [{ status: "running" }],
  task_count: 2,
};
const ctx = (extra = {}) => ({ p: P, home: "/root", git: { branch: "main" }, width: 0, ...extra });

test("config language wins over the environment", () => {
  const before = process.env.AGYSTATUSLINE_LANG;
  process.env.AGYSTATUSLINE_LANG = "zh";
  assert.equal(detectLang({ language: "en" }), "en");
  assert.equal(detectLang({}), "zh");
  assert.equal(detectLang({ language: "klingon" }), "zh"); // unknown value falls back to env
  if (before === undefined) delete process.env.AGYSTATUSLINE_LANG;
  else process.env.AGYSTATUSLINE_LANG = before;
});

test("missing keys fall back to English rather than printing the key", () => {
  assert.equal(t("zh", "state.idle"), "就绪");
  assert.equal(t("en", "state.idle"), "READY");
  assert.equal(t("zh", "nope.not.a.key"), "nope.not.a.key");
});

test("placeholders are substituted", () => {
  assert.equal(t("zh", "ui.msg.added", "model"), "已添加 model");
  assert.equal(t("en", "ui.msg.added", "model"), "added model");
  assert.equal(translator("zh")("ui.msg.deleted", "separator"), "已删除 separator");
});

test("Chinese renders state, tasks and timers", () => {
  const cfg = {
    language: "zh",
    lines: [[
      { type: "agent-state" }, { type: "separator" },
      { type: "tasks" }, { type: "separator" },
      { type: "reset-timer" },
    ]],
  };
  assert.equal(renderLines(cfg, ctx(), { color: false }), "调用工具 | 1 个子代理 · 2 个后台任务 | 1时30分");
});

test("English stays the default when no language is configured", () => {
  const cfg = { lines: [[{ type: "agent-state" }, { type: "separator" }, { type: "tasks" }]] };
  const before = process.env.AGYSTATUSLINE_LANG;
  delete process.env.AGYSTATUSLINE_LANG;
  assert.equal(renderLines(cfg, ctx(), { color: false }), "TOOL | 1 subagent · 2 tasks");
  if (before !== undefined) process.env.AGYSTATUSLINE_LANG = before;
});

test("durations use each language's units", () => {
  assert.equal(duration(5400, "en"), "1h 30m");
  assert.equal(duration(5400, "zh"), "1时30分");
  assert.equal(duration(560580, "zh"), "6天11时");
  assert.equal(duration(30, "zh"), "刚刚");
});

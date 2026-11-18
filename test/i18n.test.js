import test from "node:test";
import assert from "node:assert/strict";
import { detectLang, t, translator, widgetName } from "../src/i18n.js";
import { renderLines } from "../src/render.js";

const P = {
  agent_state: "tool_use",
  model: { display_name: "Gemini 4 Argon (High)" },
  workspace: { current_dir: "/root/proj" },
  quota: { "gemini-5h": { remaining_fraction: 0.72, reset_in_seconds: 5400 } },
  subagents: [{ status: "running" }],
  task_count: 2,
};
const ctx = { p: P, home: "/root", git: { branch: "main" }, width: 0 };

test("config language wins over the environment", () => {
  const before = process.env.AGYSTATUSLINE_LANG;
  process.env.AGYSTATUSLINE_LANG = "zh";
  assert.equal(detectLang({ language: "en" }), "en");
  assert.equal(detectLang({}), "zh");
  assert.equal(detectLang({ language: "klingon" }), "zh"); // unknown value falls back to env
  if (before === undefined) delete process.env.AGYSTATUSLINE_LANG;
  else process.env.AGYSTATUSLINE_LANG = before;
});

test("editor strings are translated, missing keys fall back to the key", () => {
  assert.equal(t("zh", "ui.colour"), "颜色");
  assert.equal(t("en", "ui.colour"), "colour");
  assert.equal(t("zh", "nope.not.a.key"), "nope.not.a.key");
  assert.equal(t("zh", "ui.msg.added", "model"), "已添加 model");
  assert.equal(translator("zh")("ui.msg.deleted", "separator"), "已删除 separator");
});

test("widget names are translated for the editor", () => {
  assert.equal(widgetName("zh", "separator"), "分隔符");
  assert.equal(widgetName("zh", "git-branch"), "分支");
  assert.equal(widgetName("zh", "context-percentage-usable"), "上下文百分比");
  assert.equal(widgetName("en", "separator"), "separator");
  assert.equal(widgetName("zh", "unknown-widget"), "unknown-widget");
});

test("language never changes what agy renders", () => {
  const lines = [[
    { type: "agent-state" }, { type: "separator" },
    { type: "tasks" }, { type: "separator" },
    { type: "reset-timer" },
  ]];
  const en = renderLines({ lines }, ctx, { color: false });
  const zh = renderLines({ language: "zh", lines }, ctx, { color: false });
  assert.equal(en, "TOOL | 1 subagent · 2 tasks | 1h 30m");
  assert.equal(zh, en);
});

test("Chinese editor strings never leak into the rendered line", () => {
  const cfg = { language: "zh", lines: [[{ type: "separator", character: "|" }, { type: "model" }]] };
  const out = renderLines(cfg, ctx, { color: false });
  assert.equal(out, "Gemini 4 Argon (High)");
  assert.ok(!/[\u4e00-\u9fff]/.test(out));
});

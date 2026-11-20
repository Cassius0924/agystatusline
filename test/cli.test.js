import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/agystatusline.js", import.meta.url));

function run(args, { stdin = "", config = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agsl-"));
  if (config !== null) {
    const cfgDir = join(dir, "config", "agystatusline");
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, "settings.json"), config);
  }
  return execFileSync(process.execPath, [BIN, ...args], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", XDG_CONFIG_HOME: join(dir, "config"), XDG_CACHE_HOME: join(dir, "cache") },
    timeout: 5000,
  });
}

const PAYLOAD = JSON.stringify({
  conversation_id: "12345678-abcd",
  model: { display_name: "Gemini 4 Argon (High)", effort: "high" },
  workspace: { current_dir: "/tmp" },
  context_window: { used_percentage: 14 },
  quota: { "gemini-5h": { remaining_fraction: 0.72, reset_in_seconds: 5400 } },
  terminal_width: 120,
});

test("renders the default layout", () => {
  const out = run([], { stdin: PAYLOAD });
  assert.match(out, /Gemini 4 Argon \(High\)/);
  assert.match(out, /Ctx .*14%/);
  assert.match(out, /72% x 1h 30m/);
});

test("an empty payload still prints a non-empty bar", () => {
  // git info from the cwd may legitimately show up; what matters is no blank row.
  assert.ok(run([], { stdin: "{}" }).trim().length > 0);
});

test("malformed config falls back to the default layout instead of failing", () => {
  const out = run([], { stdin: PAYLOAD, config: "{ not json" });
  assert.match(out, /Gemini 4 Argon \(High\)/);
});

test("broken stdin never exits non-zero", () => {
  assert.equal(run([], { stdin: "not json at all" }).trim(), "agy");
});

test("unknown widget types are ignored without breaking the row", () => {
  const cfg = JSON.stringify({ lines: [[{ type: "nope" }, { type: "model" }]] });
  assert.equal(run([], { stdin: PAYLOAD, config: cfg }).trim(), "Gemini 4 Argon (High)");
});

test("--demo renders without stdin", () => {
  const out = run(["--demo"]);
  assert.match(out, /Gemini 4 Argon \(High\)/);
  assert.match(out, /main/);
});

test("switching preset keeps language, theme and cache settings", () => {
  const cfg = JSON.stringify({ version: 1, language: "zh", theme: "paper", gitCacheTtlSeconds: 9, lines: [[{ type: "model" }]] });
  const dir = mkdtempSync(join(tmpdir(), "agsl-"));
  const cfgDir = join(dir, "config", "agystatusline");
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(join(cfgDir, "settings.json"), cfg);
  execFileSync(process.execPath, [BIN, "preset", "compact"], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", XDG_CONFIG_HOME: join(dir, "config"), XDG_CACHE_HOME: join(dir, "cache") },
  });
  const after = JSON.parse(readFileSync(join(cfgDir, "settings.json"), "utf8"));
  assert.equal(after.language, "zh");
  assert.equal(after.theme, "paper");
  assert.equal(after.gitCacheTtlSeconds, 9);
  assert.equal(after.lines.length, 1);
  assert.ok(after.lines[0].some((w) => w.type === "context-percentage"));
});

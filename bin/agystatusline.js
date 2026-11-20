#!/usr/bin/env node
// agystatusline — status line renderer for the Antigravity CLI (agy).
// Reads the CLI's session JSON on stdin, prints the configured lines on stdout.
// agy kills a statusline command after 5s and disables it after 30 failures,
// so every path here must exit 0 with something on stdout.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderLines } from "../src/render.js";
import { DEMO_PAYLOAD, DEMO_GIT, demoCtx } from "../src/demo.js";
import { runTUI } from "../src/tui.js";
import { PRESETS, PRESET_NAMES } from "../src/presets.js";

const VERSION = "0.5.1";
const HOME = homedir();
const CACHE_DIR = process.env.XDG_CACHE_HOME
  ? join(process.env.XDG_CACHE_HOME, "agystatusline")
  : join(HOME, ".cache", "agystatusline");
const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "agystatusline")
  : join(HOME, ".config", "agystatusline");
const CONFIG_PATH = join(CONFIG_DIR, "settings.json");
const AGY_SETTINGS = join(HOME, ".gemini", "antigravity-cli", "settings.json");

// Shape mirrors ccstatusline settings.json (lines of widgets, per-widget color).
const DEFAULT_CONFIG = { version: 1, gitCacheTtlSeconds: 5, ...PRESETS.default };

function loadConfig() {
  try {
    if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    /* malformed config: fall back to the default layout instead of breaking the bar */
  }
  return DEFAULT_CONFIG;
}

function readCache(key, ttl) {
  try {
    const d = JSON.parse(readFileSync(join(CACHE_DIR, `${key}.json`), "utf8"));
    if (Date.now() - d.at < ttl * 1000) return d.value;
  } catch {
    /* no cache yet */
  }
  return null;
}

function writeCache(key, value) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* caching is best-effort */
  }
}

// Branch, sha and working-tree diff. Only what the configured widgets ask for;
// each git call is capped, and results are cached on disk because agy starts a
// fresh process on every refresh (at most every 300 ms).
function gitInfo(p, need, ttl) {
  const dir = p?.workspace?.current_dir || p?.cwd || process.cwd();
  const key = `git-${Buffer.from(dir).toString("hex").slice(-32)}`;
  const cached = readCache(key, ttl);
  if (cached) return { ...cached, branch: p?.vcs?.branch || cached.branch };

  const info = { branch: p?.vcs?.branch || "", changes: "", sha: "" };
  const run = (args) => {
    try {
      return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 300 }).stdout?.trim() ?? "";
    } catch {
      return "";
    }
  };

  if (!info.branch) {
    const dotGit = join(dir, ".git");
    try {
      // A checkout has a .git directory; a linked worktree or submodule has a
      // .git file with "gitdir: …" pointing at the real git directory.
      const isDir = statSync(dotGit).isDirectory();
      const head = isDir ? readFileSync(join(dotGit, "HEAD"), "utf8").trim() : readFileSync(dotGit, "utf8").trim();
      const ref = head.match(/^gitdir:\s*(.+)$/)?.[1];
      const real = ref ? readFileSync(join(dir, ref, "HEAD"), "utf8").trim() : head;
      if (real.startsWith("ref: refs/heads/")) info.branch = real.slice("ref: refs/heads/".length);
    } catch {
      /* not a repo */
    }
  }
  if (need.has("git-changes") || need.has("git-insertions") || need.has("git-deletions")) {
    const stat = run(["diff", "--shortstat", "HEAD"]);
    const add = stat.match(/(\d+) insertions?/);
    const del = stat.match(/(\d+) deletions?/);
    if (add || del) info.changes = `+${add ? add[1] : 0} \u2212${del ? del[1] : 0}`;
    if (add) info.insertions = `+${add[1]}`;
    if (del) info.deletions = `\u2212${del[1]}`;
  }
  if (need.has("git-staged") || need.has("git-unstaged") || need.has("git-untracked")) {
    let staged = 0;
    let unstaged = 0;
    let untracked = 0;
    for (const row of run(["status", "--porcelain"]).split("\n")) {
      if (!row) continue;
      if (row.startsWith("??")) { untracked += 1; continue; }
      if (row[0] !== " " && row[0] !== "?") staged += 1;
      if (row[1] !== " " && row[1] !== "?") unstaged += 1;
    }
    info.staged = staged;
    info.unstaged = unstaged;
    info.untracked = untracked;
  }
  if (need.has("git-ahead-behind")) {
    const ab = run(["rev-list", "--left-right", "--count", "@{u}...HEAD"]).split(/\s+/);
    const behind = Number(ab[0]) || 0;
    const ahead = Number(ab[1]) || 0;
    if (ahead || behind) info.aheadBehind = `${ahead ? `\u21e13${ahead}` : ""}${behind ? ` \u21e3${behind}` : ""}`.trim();
  }
  if (need.has("git-root")) info.root = run(["rev-parse", "--show-toplevel"]).split("/").pop() ?? "";
  if (need.has("git-origin")) {
    const url = run(["remote", "get-url", "origin"]);
    const m = url.match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (m) info.origin = `${m[1]}/${m[2]}`;
  }
  if (need.has("git-sha")) info.sha = run(["rev-parse", "--short", "HEAD"]);

  writeCache(key, info);
  return info;
}

function render(payload, { color }) {
  const config = loadConfig();
  const need = new Set(config.lines.flat().map((w) => w.type));
  const ctx = {
    p: payload,
    home: HOME,
    git: gitInfo(payload, need, config.gitCacheTtlSeconds ?? 5),
    width: Number(payload?.terminal_width) || 0,
    mem: need.has("memory") ? memoryPercent() : null,
    now: need.has("clock")
      ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null,
  };
  return renderLines(config, ctx, { color, width: ctx.width });
}

// Used memory share, Linux only; elsewhere the widget just hides.
function memoryPercent() {
  try {
    const info = readFileSync("/proc/meminfo", "utf8");
    const total = Number(info.match(/MemTotal:\s+(\d+)/)?.[1]);
    const avail = Number(info.match(/MemAvailable:\s+(\d+)/)?.[1]);
    return total && avail ? Math.round((1 - avail / total) * 100) : null;
  } catch {
    return null;
  }
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function logError(err) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(join(CACHE_DIR, "error.log"), `${new Date().toISOString()} ${err?.stack ?? err}\n`);
  } catch {
    /* nothing else to do */
  }
}

function writePreset(name) {
  if (!PRESETS[name]) {
    console.log(`unknown preset. available: ${PRESET_NAMES.join(", ")}`);
    return 1;
  }
  const config = { version: 1, gitCacheTtlSeconds: 5, ...PRESETS[name] };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  const ctx = demoCtx(120);
  console.log(`preset   ${name} -> ${CONFIG_PATH}`);
  console.log(renderLines(config, ctx, { color: true, width: 120, now: ctx.now }));
  return 0;
}

function init(argv) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    console.log(`config   ${CONFIG_PATH}`);
  } else {
    console.log(`config   ${CONFIG_PATH} (kept)`);
  }

  const settings = existsSync(AGY_SETTINGS) ? JSON.parse(readFileSync(AGY_SETTINGS, "utf8")) : {};
  if (settings.statusLine && !argv.includes("--force")) {
    console.log(`statusLine already set: ${JSON.stringify(settings.statusLine)}`);
    console.log("re-run with --force to replace it");
    return 1;
  }
  if (existsSync(AGY_SETTINGS)) copyFileSync(AGY_SETTINGS, `${AGY_SETTINGS}.agystatusline.bak`);

  // Prefer the PATH-visible binary (survives npm -g upgrades); fall back to node
  // plus this file's absolute path when running from a checkout.
  const bin = fileURLToPath(import.meta.url);
  const onPath = spawnSync("sh", ["-c", "command -v agystatusline"], { encoding: "utf8" }).stdout?.trim();
  const command = onPath || `${process.execPath} ${bin}`;
  settings.statusLine = { type: "command", command, enabled: true };
  mkdirSync(dirname(AGY_SETTINGS), { recursive: true });
  writeFileSync(AGY_SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`wired    ${AGY_SETTINGS} -> ${command}`);

  // Prove the wiring before claiming it works.
  if (!onPath && command.includes("_npx")) {
    console.log("warning: wired a path inside the npx cache; install with `npm i -g agystatusline` for a stable command");
  }
  const check = spawnSync("sh", ["-c", command], {
    input: JSON.stringify(DEMO_PAYLOAD),
    encoding: "utf8",
    timeout: 5000,
  });
  if (check.status !== 0 || !check.stdout?.trim()) {
    console.log(`self-check FAILED: exit ${check.status} ${(check.stderr ?? "").trim()}`);
    return 1;
  }
  console.log(`self-check ok: ${check.stdout.split("\n")[0]}`);
  console.log("restart agy (or open a new session) to pick it up");
  return 0;
}

const argv = process.argv.slice(2);
if (argv.includes("--version") || argv.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}
if (argv[0] === "init") process.exit(init(argv));
if (argv[0] === "preset") process.exit(writePreset(argv[1] ?? ""));
if (argv[0] === "config") {
  console.log(CONFIG_PATH);
  process.exit(0);
}

// Editing mode: the TUI keeps the process alive on its own keypress listener,
// so nothing after this may call process.exit().
const wantsTUI =
  argv[0] === "edit" ||
  argv[0] === "tui" ||
  (!argv.includes("--demo") && !argv.includes("--version") && process.stdin.isTTY && process.stdout.isTTY);

if (wantsTUI) {
  runTUI(CONFIG_PATH, loadConfig());
} else {
  renderOnce();
}

function renderOnce() {
const demo = argv.includes("--demo");
const raw = demo ? JSON.stringify(DEMO_PAYLOAD) : readStdin();
const color = !argv.includes("--no-color") && !process.env.NO_COLOR;
let line = "";
try {
  const payload = raw.trim() ? JSON.parse(raw) : {};
  line = render(payload, { color });
} catch (err) {
  logError(err);
  line = "agy";
}
// An empty bar collapses the row in agy; always print something.
console.log(line || "agy");
process.exit(0);
}

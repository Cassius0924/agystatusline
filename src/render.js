// Widget registry + renderer. Values come from the JSON Antigravity CLI pipes
// on stdin (see https://antigravity.google/docs/cli/statusline).
// Type names follow ccstatusline so an existing settings.json ports over.

const COLORS = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  brightBlack: 90, brightRed: 91, brightGreen: 92, brightYellow: 93,
  brightBlue: 94, brightMagenta: 95, brightCyan: 96, brightWhite: 97,
};

// A theme has two layers: `slots` maps semantic names a widget may use
// (`color: "git"`) to a base colour, and `palette` remaps the named colours
// themselves so switching themes visibly recolours a config that hard-codes
// `brightBlue`/`magenta`/….
const THEMES = {
  mono: {
    slots: { model: "brightWhite", git: "white", meta: "brightBlack", ok: "white", warn: "white", bad: "white" },
    palette: {
      black: "black", red: "white", green: "white", yellow: "white", blue: "white", magenta: "white", cyan: "white",
      white: "white", brightBlack: "brightBlack", brightRed: "brightWhite", brightGreen: "brightWhite",
      brightYellow: "brightWhite", brightBlue: "brightWhite", brightMagenta: "brightWhite", brightCyan: "brightWhite",
      brightWhite: "brightWhite", "#ffffff": "brightWhite",
    },
  },
  aurora: {
    slots: { model: "brightCyan", git: "brightMagenta", meta: "brightBlack", ok: "brightGreen", warn: "brightYellow", bad: "brightRed" },
    palette: {
      blue: "cyan", brightBlue: "brightCyan", magenta: "magenta", brightMagenta: "brightMagenta",
      cyan: "green", brightCyan: "brightCyan", green: "brightGreen", brightGreen: "brightGreen",
      yellow: "brightYellow", brightYellow: "brightYellow", red: "brightRed", brightRed: "brightRed",
    },
  },
  paper: {
    slots: { model: "blue", git: "magenta", meta: "brightBlack", ok: "green", warn: "yellow", bad: "red" },
    palette: {
      blue: "#1f4e79", brightBlue: "#1f4e79", magenta: "#7a3e9d", brightMagenta: "#7a3e9d",
      cyan: "#0f6b5c", brightCyan: "#0f6b5c", green: "#2f6b2f", brightGreen: "#2f6b2f",
      yellow: "#8a6d00", brightYellow: "#8a6d00", red: "#a13b3b", brightRed: "#a13b3b",
    },
  },
};

const BASE_SLOTS = { model: "brightBlue", git: "brightMagenta", meta: "brightBlack", ok: "green", warn: "yellow", bad: "red" };

const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const slot = (color, theme) => {
  const named = theme?.slots?.[color] ?? theme?.[color] ?? BASE_SLOTS[color] ?? color;
  return theme?.palette?.[named] ?? named;
};

function fgCode(color, theme) {
  const c = slot(color, theme);
  if (c === undefined || c === null || c === "") return null;
  if (COLORS[c] !== undefined) return String(COLORS[c]);
  if (isHex(c)) return `38;2;${rgb(c).join(";")}`;
  return null;
}

function bgCode(color, theme) {
  const c = slot(color, theme);
  return isHex(c) ? `48;2;${rgb(c).join(";")}` : null;
}

export function paint(text, color, colorEnabled, theme = null) {
  if (!colorEnabled || !text) return text;
  const code = fgCode(color, theme);
  return code ? `\x1b[${code}m${text}\x1b[0m` : text;
}

// ── payload helpers ─────────────────────────────────────────────────────────
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function humanTokens(n) {
  if (n === null || n === undefined || n === 0) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

export function duration(seconds) {
  if (seconds === null || seconds < 0) return "";
  if (seconds < 60) return "now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// 5-hour / weekly bucket: gemini-* first, then the 3p-* equivalent.
export function quotaBucket(quota, window) {
  if (!quota || typeof quota !== "object") return null;
  const suffix = window === "weekly" ? "-weekly" : "-5h";
  const keys = Object.keys(quota).filter((k) => k.endsWith(suffix));
  keys.sort((a, b) => (a.startsWith("gemini-") ? -1 : 1) - (b.startsWith("gemini-") ? -1 : 1));
  return keys.length ? quota[keys[0]] : null;
}

export function cacheHitRate(u) {
  if (!u || typeof u !== "object") return null;
  const read = num(u.cache_read_input_tokens);
  const created = num(u.cache_creation_input_tokens) ?? 0;
  const input = num(u.input_tokens) ?? 0;
  const total = read === null ? null : read + created + input;
  if (!total) return null;
  return Math.round((read / total) * 100);
}

function bar(pct, cells = 10) {
  const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)));
  return "\u2588".repeat(filled) + "\u2591".repeat(cells - filled);
}

export function abbrevHome(dir, home, platform = process.platform) {
  if (!dir) return "";
  if (!home) return dir;
  // Windows paths are case-insensitive and may carry a trailing separator.
  const same = (a, b) => (platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
  const base = home.replace(/[\\/]+$/, "");
  const head = dir.slice(0, base.length);
  return same(head, base) ? `~${dir.slice(base.length)}` : dir;
}

const usedTokens = (p) => {
  const cw = p.context_window ?? {};
  return (num(cw.total_input_tokens) ?? 0) + (num(cw.total_output_tokens) ?? 0);
};

const STATE_LABEL = {
  idle: "READY", working: "WORKING", tool_use: "TOOL", thinking: "THINKING",
  reviewing: "REVIEW", authenticating: "AUTH", initializing: "INIT", error: "ERROR",
};

const STATE_TONE = {
  idle: "ok", working: "model", tool_use: "git", thinking: "warn",
  reviewing: "model", authenticating: "warn", initializing: "meta", error: "bad",
};

// ── widgets ─────────────────────────────────────────────────────────────────
// Each widget returns a string ("" hides it). ctx: {p, home, git, width, mem, now}
export const WIDGETS = {
  // session
  model: ({ p }) => p.model?.display_name ?? p.model?.id ?? "",
  "thinking-effort": ({ p }) => {
    const effort = p.model?.effort ?? "";
    // agy already prints "Gemini 4 Argon (High)"; repeating "high" is noise.
    return effort && !String(p.model?.display_name ?? "").toLowerCase().includes(effort.toLowerCase()) ? effort : "";
  },
  "agent-state": ({ p }) => STATE_LABEL[p.agent_state || "idle"] ?? String(p.agent_state).toUpperCase(),
  "cycle-mode": ({ p }) => p.cycle_mode ?? "",
  "vim-mode": ({ p }) => p.vim?.mode ?? "",
  "conversation-id": ({ p }, o) => (o.metadata?.full ? p.conversation_id || "" : (p.conversation_id || "").slice(0, 8)),
  "claude-session-id": ({ p }) => (p.conversation_id || p.session_id || "").slice(0, 8), // portability alias
  title: ({ p }, o) => {
    const t = (p.conversation_title || "").replace(/\s+/g, " ").trim();
    const max = num(o.maxWidth) ?? 30;
    return t.length > max ? `${t.slice(0, max)}\u2026` : t;
  },
  plan: ({ p }) => p.plan_tier ?? "",
  sandbox: ({ p }) => (p.sandbox ? (p.sandbox.enabled ? "SB:ON" : "SB:OFF") : ""),
  queue: ({ p }) => (num(p.pending_input_count) > 0 ? `+${p.pending_input_count}` : ""),
  tasks: ({ p }) => {
    const running = Array.isArray(p.subagents) ? p.subagents.filter((x) => x.status === "running").length : 0;
    const bg = num(p.task_count) ?? 0;
    const bits = [];
    if (running) bits.push(`${running} subagent${running > 1 ? "s" : ""}`);
    if (bg) bits.push(`${bg} task${bg > 1 ? "s" : ""}`);
    return bits.join(" \u00b7 ");
  },
  cost: ({ p }) => {
    const v = num(p.cost?.total_usd);
    return v === null ? "" : `$${v.toFixed(2)}`;
  },

  // workspace / host
  "current-working-dir": ({ p, home }, o) =>
    abbrevHome(p.workspace?.current_dir ?? p.cwd ?? "", o.metadata?.abbreviateHome === "true" ? home : ""),
  "terminal-width": ({ width }) => (width ? String(width) : ""),
  memory: ({ mem }) => (mem === null || mem === undefined ? "" : `${mem}%`),
  clock: ({ now }) => now ?? "",

  // git
  "git-branch": ({ git }, o) => (git.branch ? `${o.metadata?.icon ?? ""}${git.branch}` : ""),
  "git-changes": ({ git }, o) => {
    if (!git.changes) return "";
    if (!o.metadata?.paren) return git.changes;
    // (+3,-1) style, ccstatusline's compact form
    const add = git.insertions ?? git.changes.match(/\+(\d+)/)?.[1];
    const del = git.deletions ?? git.changes.match(/\u2212(\d+)/)?.[1];
    return `(+${add ? String(add).replace("+", "") : 0},-${del ? String(del).replace("\u2212", "") : 0})`;
  },
  "git-insertions": ({ git }) => git.insertions,
  "git-deletions": ({ git }) => git.deletions,
  "git-sha": ({ git }) => git.sha,
  "git-root": ({ git }) => git.root,
  "git-origin": ({ git }) => git.origin,
  "git-staged": ({ git }) => (git.staged ? `+${git.staged}` : ""),
  "git-unstaged": ({ git }) => (git.unstaged ? `~${git.unstaged}` : ""),
  "git-untracked": ({ git }) => (git.untracked ? `?${git.untracked}` : ""),
  "git-ahead-behind": ({ git }) => git.aheadBehind,

  // context / tokens
  "context-percentage-usable": ({ p }, o) => {
    const pct = num(p.context_window?.used_percentage);
    if (pct === null) return "";
    const rounded = Math.round(pct);
    return o.metadata?.display === "slider" ? `${bar(rounded)} ${rounded}%` : `${rounded}%`;
  },
  "context-percentage": ({ p }) => {
    const pct = num(p.context_window?.used_percentage);
    return pct === null ? "" : `${Math.round(pct)}%`;
  },
  "context-remaining": ({ p }) => {
    const pct = num(p.context_window?.used_percentage);
    return pct === null ? "" : `${Math.round(100 - pct)}%`;
  },
  "context-bar": ({ p }) => {
    const pct = num(p.context_window?.used_percentage);
    return pct === null ? "" : `${bar(pct, 20)} ${Math.round(pct)}%`;
  },
  "context-length": ({ p }) => humanTokens(usedTokens(p)),
  "context-window": ({ p }) => humanTokens(num(p.context_window?.context_window_size)),
  "tokens-input": ({ p }) => humanTokens(num(p.context_window?.total_input_tokens)),
  "tokens-output": ({ p }) => humanTokens(num(p.context_window?.total_output_tokens)),
  "tokens-total": ({ p }) => humanTokens(usedTokens(p)),
  tokens: ({ p }) => humanTokens(usedTokens(p)), // alias
  "tokens-cached": ({ p }) => humanTokens(num(p.context_window?.current_usage?.cache_read_input_tokens)),
  "cache-hit-rate": ({ p }, o) => {
    const pct = cacheHitRate(p.context_window?.current_usage);
    if (pct !== null) return `${pct}%`;
    // "n/a" is only honest when agy is actually reporting a context window;
    // with an empty payload the whole row should disappear instead.
    return p.context_window ? o.metadata?.whenMissing ?? "" : "";
  },

  // quota
  "session-usage": ({ p }) => {
    const b = quotaBucket(p.quota, "5h");
    return b?.remaining_fraction === undefined ? "" : `${Math.round(b.remaining_fraction * 100)}%`;
  },
  "weekly-usage": ({ p }) => {
    const b = quotaBucket(p.quota, "weekly");
    return b?.remaining_fraction === undefined ? "" : `${Math.round(b.remaining_fraction * 100)}%`;
  },
  "reset-timer": ({ p }) => timer(quotaBucket(p.quota, "5h")),
  "weekly-reset-timer": ({ p }) => timer(quotaBucket(p.quota, "weekly")),

  // static
  separator: (_, o) => o.character ?? "|",
  "flex-separator": () => FLEX,
  "custom-text": (_, o) => o.customText ?? "",
  text: (_, o) => o.customText ?? o.text ?? "",
  symbol: (_, o) => o.customSymbol ?? o.customText ?? "",
};

const FLEX = "\u0000flex";

// Quota known but reset time not yet reported: agy briefly sends the bucket
// without reset_in_seconds, so say "Loading" instead of dropping the segment.
const timer = (bucket) =>
  bucket?.reset_in_seconds !== undefined ? duration(bucket.reset_in_seconds) : bucket ? "[Loading]" : "";
const STATIC = new Set(["separator", "flex-separator", "custom-text", "text", "symbol"]);

function autoTone(type, p) {
  if (type === "agent-state") return STATE_TONE[p.agent_state || "idle"] ?? null;
  if (type === "context-percentage-usable" || type === "context-percentage" || type === "context-bar") {
    const pct = num(p.context_window?.used_percentage);
    if (pct === null) return null;
    return pct >= 90 ? "bad" : pct >= 70 ? "warn" : "ok";
  }
  if (type === "session-usage" || type === "weekly-usage") {
    const left = num(quotaBucket(p.quota, type === "weekly-usage" ? "weekly" : "5h")?.remaining_fraction);
    if (left === null) return null;
    return left <= 0.1 ? "bad" : left <= 0.3 ? "warn" : "ok";
  }
  return null;
}

// ── renderer ────────────────────────────────────────────────────────────────
const visibleLength = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;

function resolveTheme(config) {
  if (!config.theme) return null;
  if (typeof config.theme === "object") return config.theme;
  return THEMES[config.theme] ?? null;
}

function buildRow(line, ctx, hl = -1) {
  const segs = [];
  let sep = null;
  for (const [i, w] of line.entries()) {
    const fn = WIDGETS[w.type];
    if (!fn) continue;
    const value = (fn(ctx, w) ?? "").trim();
    if (!value) continue;
    if (w.type === "separator") { sep = value; continue; }
    if (w.type === "flex-separator") { segs.push({ flex: true }); continue; }
    if (sep !== null && segs.length) { segs.push({ text: sep, sep: true }); sep = null; }
    const text = w.label && !w.raw ? `${w.label} ${value}` : value;
    segs.push({
      text,
      fg: w.color ?? w.textColor ?? autoTone(w.type, ctx.p) ?? null,
      bg: w.bgColor ?? w.backgroundColor ?? null,
      data: !STATIC.has(w.type),
      hl: i === hl,
    });
  }
  return segs;
}

function renderPlain(segs, { color, width, theme }) {
  const parts = [];
  let used = 0;
  let hasFlex = false;
  let sep = null;
  for (const s of segs) {
    if (s.flex) { parts.push({ flex: true }); hasFlex = true; continue; }
    if (s.sep) { sep = s.text; continue; }
    const glue = parts.length === 0 ? "" : sep ? ` ${sep} ` : " ";
    const len = visibleLength(glue) + visibleLength(s.text);
    // No room left: drop the rest of the row instead of wrapping mid-widget.
    if (!hasFlex && width > 0 && parts.length && used + len > width) break;
    parts.push({ text: s.text, glue, len, fg: s.fg, hl: s.hl });
    used += len;
    sep = null;
  }
  if (hasFlex) {
    const fixed = parts.filter((p) => !p.flex).reduce((a, p) => a + p.len, 0);
    const flexCount = parts.filter((p) => p.flex).length;
    const fill = " ".repeat(Math.max(1, Math.floor(((width || 80) - fixed) / flexCount)));
    return parts.map((p) => (p.flex ? fill : `${p.glue}${mark(paint(p.text, p.fg, color, theme), p.hl, color)}`)).join("").trimEnd();
  }
  return parts.map((p) => `${p.glue}${mark(paint(p.text, p.fg, color, theme), p.hl, color)}`).join("").trimEnd();
}

// Editor preview only: underline the segment being edited. Off for the real bar.
const mark = (text, on, color) => (on && color ? `\x1b[4m${text}\x1b[24m` : text);

function renderPowerline(rows, pl, theme, { color, width, padLeft, padRight }) {
  const glyph = typeof pl.separators?.[0] === "string" ? pl.separators[0] : "\uE0B0";
  const autoAlign = pl.autoAlign !== false;

  // Cells first (bg-less widgets merge into the block before them), then column
  // widths, so rows stack like a table.
  const rowsCells = rows.map((segs) => {
    const cells = [];
    for (const s of segs) {
      if (s.flex || s.sep) continue;
      const text = `${padLeft}${s.text}${padRight}`;
      if (!s.bg && cells.length) {
        cells[cells.length - 1].text += text;
        continue;
      }
      cells.push({ text, fg: s.fg, bg: s.bg });
    }
    return cells;
  });

  const widths = [];
  if (autoAlign) {
    for (const cells of rowsCells) {
      cells.forEach((cell, i) => {
        widths[i] = Math.max(widths[i] ?? 0, visibleLength(cell.text));
      });
    }
  }

  const out = [];
  for (const cells of rowsCells) {
    if (autoAlign) cells.forEach((cell, i) => { cell.text = cell.text.padEnd(widths[i]); });
    // Too wide for the terminal: drop trailing columns instead of the whole row.
    let painted = paintCells(cells, { color, theme, pl, glyph });
    while (width > 0 && visibleLength(painted) > width && cells.length > 1) {
      cells.pop();
      painted = paintCells(cells, { color, theme, pl, glyph });
    }
    out.push(painted);
  }
  return out.filter((l) => l.trim()).join("\n");
}

function paintCells(cells, { color, theme, pl, glyph }) {
  let painted = "";
  if (pl.startCap) {
    const bg = bgCode(cells[0]?.bg, theme);
    painted += color && bg ? `\x1b[${bg.replace("48;2;", "38;2;")}m${pl.startCap}\x1b[0m` : pl.startCap;
  }
  cells.forEach((cell, i) => {
    if (color) {
      const codes = [fgCode(cell.fg, theme), bgCode(cell.bg, theme)]
        .filter(Boolean)
        .map((code) => `\x1b[${code}m`)
        .join("");
      painted += codes ? `${codes}${cell.text}\x1b[0m` : cell.text;
    } else {
      painted += cell.text;
    }
    const next = cells[i + 1];
    if (next) {
      const from = bgCode(cell.bg, theme);
      const to = bgCode(next.bg, theme);
      if (color && to) painted += `\x1b[${(from ?? "49").replace("48;2;", "38;2;")};${to}m${glyph}\x1b[0m`;
      else painted += glyph;
    }
  });
  const last = cells[cells.length - 1];
  if (pl.endCap) {
    const from = bgCode(last?.bg, theme);
    painted += color && from ? `\x1b[${from.replace("48;2;", "38;2;")}m${pl.endCap}\x1b[0m` : pl.endCap;
  }
  return painted;
}

/**
 * Render the configured rows.
 * Options: color (bool), width (terminal columns), now (clock string).
 */
export function renderLines(config, ctx, { color = true, width = 0, now = null, highlight = null } = {}) {
  const theme = resolveTheme(config);
  const g = config.global ?? {};
  const pl = config.powerline ?? {};
  const pad = g.padding ?? "both";
  const padLeft = pad === "both" || pad === "left" ? " " : "";
  const padRight = pad === "both" || pad === "right" ? " " : "";
  const c = { ...ctx, now: ctx.now ?? now };

  const rows = [];
  for (const [rowIndex, line] of (config.lines ?? []).entries()) {
    const segs = buildRow(line, c, highlight?.line === rowIndex ? highlight.index : -1);
    if (!segs.some((s) => s.data)) continue; // a row with no live data is noise
    rows.push(segs);
  }
  if (!rows.length) return "";
  if (pl.enabled) return renderPowerline(rows, pl, theme, { color, width, padLeft, padRight });
  return rows
    .map((segs) => renderPlain(segs, { color, theme, width }))
    .filter((l) => l.trim())
    .join("\n");
}

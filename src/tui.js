// Interactive editor. Hand-rolled (no Ink, no deps): framed layout, live
// preview, widget list with a detail pane, colour picker, label editor and
// preset switching. Every change saves immediately.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { WIDGETS, renderLines } from "./render.js";
import { demoCtx } from "./demo.js";
import { PRESETS, PRESET_NAMES } from "./presets.js";
import { LANGUAGES, detectLang, translator, widgetName } from "./i18n.js";

const THEMES = ["aurora", "mono", "paper", null];
export const SWATCHES = [
  null, "brightBlue", "brightMagenta", "brightCyan", "brightGreen", "brightYellow",
  "white", "brightBlack", "#8ab4f8", "#c792ea", "#ffb86c", "#50fa7b", "#ff5555",
];

const NAMED = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  brightBlack: 90, brightRed: 91, brightGreen: 92, brightYellow: 93,
  brightBlue: 94, brightMagenta: 95, brightCyan: 96, brightWhite: 97,
};

export const PICKER = [
  "agent-state", "model", "thinking-effort", "current-working-dir", "git-branch", "git-changes",
  "git-insertions", "git-deletions", "git-staged", "git-unstaged", "git-untracked",
  "git-ahead-behind", "git-sha", "git-root", "git-origin",
  "context-percentage-usable", "context-bar", "context-percentage", "context-remaining",
  "context-length", "context-window", "tokens-input", "tokens-output", "tokens-total", "tokens-cached",
  "cache-hit-rate", "session-usage", "weekly-usage", "reset-timer", "weekly-reset-timer",
  "title", "conversation-id", "plan", "sandbox", "queue", "tasks", "cost", "vim-mode",
  "cycle-mode", "clock", "memory", "terminal-width",
  "separator", "flex-separator", "custom-text",
].filter((type) => WIDGETS[type]);

export const initialState = (config, pick = 0) => ({
  config,
  line: 0,
  idx: 0,
  mode: "list", // list | picker | colors | label | presets | help
  pick,
  colorIdx: 0,
  input: "",
  status: "",
  themeIdx: Math.max(0, THEMES.indexOf(config.theme ?? null)),
  done: false,
  dirty: false,
});

const clamp = (n, max) => Math.max(0, Math.min(max, n));

// Pure key → state transition. The terminal loop below only draws it.
export function applyKey(state, key) {
  const cfg = state.config;
  const lines = cfg.lines ?? [];
  const s = { ...state, config: cfg, dirty: false, status: "" };
  const line = lines[s.line] ?? [];
  const current = line[s.idx];

  if (s.mode === "help") {
    s.mode = "list";
    return s;
  }

  if (s.mode === "picker") {
    if (key.name === "up" || key.name === "k") s.pick = clamp(s.pick - 1, PICKER.length - 1);
    else if (key.name === "down" || key.name === "j") s.pick = clamp(s.pick + 1, PICKER.length - 1);
    else if (key.name === "return") {
      const type = PICKER[s.pick];
      line.splice(s.idx + 1, 0, { type });
      s.idx += 1;
      s.dirty = true;
      s.status = translator(detectLang(s.config))("ui.msg.added", type);
      s.mode = "list";
    } else if (key.name === "escape") s.mode = "list";
    return s;
  }

  if (s.mode === "colors") {
    if (key.name === "left" || key.name === "h") s.colorIdx = clamp(s.colorIdx - 1, SWATCHES.length - 1);
    else if (key.name === "right" || key.name === "l") s.colorIdx = clamp(s.colorIdx + 1, SWATCHES.length - 1);
    else if (key.name === "return" && current) {
      const colour = SWATCHES[s.colorIdx];
      if (colour) current.color = colour;
      else delete current.color;
      s.dirty = true;
      s.status = translator(detectLang(s.config))("ui.msg.colour", colour ?? translator(detectLang(s.config))("ui.auto"));
      s.mode = "list";
    } else if (key.name === "escape") s.mode = "list";
    return s;
  }

  if (s.mode === "label") {
    if (key.name === "return" && current) {
      if (s.input.trim()) current.label = s.input.trim();
      else delete current.label;
      s.dirty = true;
      s.status = current.label ? translator(detectLang(s.config))("ui.msg.label", current.label) : translator(detectLang(s.config))("ui.msg.labelCleared");
      s.mode = "list";
    } else if (key.name === "escape") {
      s.mode = "list";
    } else if (key.name === "backspace") {
      s.input = s.input.slice(0, -1);
    } else if (typeof key.sequence === "string" && key.sequence.length === 1 && key.sequence >= " ") {
      s.input += key.sequence;
    }
    return s;
  }

  if (s.mode === "presets") {
    if (key.name === "up" || key.name === "k") s.pick = clamp(s.pick - 1, PRESET_NAMES.length - 1);
    else if (key.name === "down" || key.name === "j") s.pick = clamp(s.pick + 1, PRESET_NAMES.length - 1);
    else if (key.name === "return") {
      const name = PRESET_NAMES[s.pick];
      s.config = { version: cfg.version ?? 1, gitCacheTtlSeconds: cfg.gitCacheTtlSeconds ?? 5, ...PRESETS[name] };
      s.line = 0;
      s.idx = 0;
      s.dirty = true;
      s.status = translator(detectLang(s.config))("ui.msg.preset", name);
      s.mode = "list";
    } else if (key.name === "escape") {
      s.mode = "list";
    }
    return s;
  }

  switch (key.name) {
    case "up":
    case "k":
      s.idx = clamp(s.idx - 1, line.length - 1);
      break;
    case "down":
    case "j":
      s.idx = clamp(s.idx + 1, line.length - 1);
      break;
    case "left":
    case "[":
      s.line = clamp(s.line - 1, lines.length - 1);
      s.idx = 0;
      break;
    case "right":
    case "]":
      s.line = clamp(s.line + 1, lines.length - 1);
      s.idx = 0;
      break;
    case "J":
    case "shiftDown":
      if (s.idx < line.length - 1) {
        [line[s.idx], line[s.idx + 1]] = [line[s.idx + 1], line[s.idx]];
        s.idx += 1;
        s.dirty = true;
      }
      break;
    case "K":
    case "shiftUp":
      if (s.idx > 0) {
        [line[s.idx], line[s.idx - 1]] = [line[s.idx - 1], line[s.idx]];
        s.idx -= 1;
        s.dirty = true;
      }
      break;
    case "a":
      s.mode = "picker";
      break;
    case "x":
    case "d":
      if (line.length) {
        const [gone] = line.splice(s.idx, 1);
        s.idx = clamp(s.idx, line.length - 1);
        s.dirty = true;
        s.status = translator(detectLang(s.config))("ui.msg.deleted", gone.type);
      }
      break;
    case "n":
      lines.splice(s.line + 1, 0, []);
      s.line += 1;
      s.idx = 0;
      s.dirty = true;
      break;
    case "c":
    case "return":
      if (current) {
        s.colorIdx = Math.max(0, SWATCHES.indexOf(current.color ?? null));
        s.mode = "colors";
      }
      break;
    case "l":
      if (current) {
        s.input = current.label ?? "";
        s.mode = "label";
      }
      break;
    case "r":
      if (current) {
        current.raw = !current.raw;
        if (!current.raw) delete current.raw;
        s.dirty = true;
        s.status = translator(detectLang(s.config))("ui.msg.raw", translator(detectLang(s.config))(current.raw ? "ui.on" : "ui.off"));
      }
      break;
    case "o":
      s.pick = Math.max(0, PRESET_NAMES.indexOf("default"));
      s.mode = "presets";
      break;
    case "p":
      cfg.powerline = { ...(cfg.powerline ?? {}), enabled: !cfg.powerline?.enabled };
      if (cfg.powerline.enabled && !cfg.powerline.separators) {
        cfg.powerline.separators = [String.fromCharCode(0xe0b0)];
        cfg.powerline.endCap = String.fromCharCode(0xe0b4);
        cfg.powerline.autoAlign = true;
      }
      s.dirty = true;
      s.status = translator(detectLang(cfg))("ui.msg.powerline", translator(detectLang(cfg))(cfg.powerline.enabled ? "ui.on" : "ui.off"));
      break;
    case "t":
      s.themeIdx = (s.themeIdx + 1) % THEMES.length;
      if (THEMES[s.themeIdx]) cfg.theme = THEMES[s.themeIdx];
      else delete cfg.theme;
      s.dirty = true;
      s.status = translator(detectLang(cfg))("ui.msg.theme", THEMES[s.themeIdx] ?? "-");
      break;
    case "m":
      cfg.global = { ...(cfg.global ?? {}), minimalist: !cfg.global?.minimalist };
      s.dirty = true;
      s.status = translator(detectLang(cfg))("ui.msg.minimalist", translator(detectLang(cfg))(cfg.global.minimalist ? "ui.on" : "ui.off"));
      break;
    case "b":
      cfg.global = { ...(cfg.global ?? {}), bold: !cfg.global?.bold };
      s.dirty = true;
      s.status = translator(detectLang(cfg))("ui.msg.bold", translator(detectLang(cfg))(cfg.global.bold ? "ui.on" : "ui.off"));
      break;
    case "g": {
      const at = LANGUAGES.indexOf(detectLang(cfg));
      const next = LANGUAGES[(at + 1) % LANGUAGES.length];
      cfg.language = next;
      s.dirty = true;
      s.status = translator(next)("ui.msg.lang", next === "zh" ? "中文" : "English");
      break;
    }
    case "?":
    case "h":
      s.mode = "help";
      break;
    case "q":
    case "escape":
      s.done = true;
      break;
    default:
      break;
  }
  return s;
}

// ── drawing ─────────────────────────────────────────────────────────────────
const esc = (code) => `\x1b[${code}m`;
const RESET = esc(0);
const BOLD = esc(1);
const DIM = esc(90);
const CYAN = esc(36);
const GREEN = esc(32);
const INVERSE = esc(7);
const CLEAR = "\x1b[2J\x1b[H";
const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";

const paintFg = (text, colour) => {
  if (!colour) return text;
  if (NAMED[colour]) return `${esc(NAMED[colour])}${text}${RESET}`;
  if (/^#[0-9a-f]{6}$/i.test(colour)) {
    const n = parseInt(colour.slice(1), 16);
    return `${esc(`38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`)}${text}${RESET}`;
  }
  return text;
};

const paintSwatch = (colour) => {
  if (!colour || !/^#[0-9a-f]{6}$/i.test(colour)) return paintFg("    ", colour ?? "brightBlack");
  const n = parseInt(colour.slice(1), 16);
  return `${esc(`48;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`)}    ${RESET}`;
};

// Terminal cell width: CJK and fullwidth glyphs take two columns, so a plain
// codepoint count would misalign every box in Chinese.
const wide = (cp) =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0x303e) ||
  (cp >= 0x3041 && cp <= 0x33ff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0xa000 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6);

const dwidth = (text) => {
  let total = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    total += wide(cp) ? 2 : 1;
  }
  return total;
};

const visible = (s) => dwidth(s.replace(/\x1b\[[0-9;]*m/g, ""));

const fit = (s, w) => {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  const len = dwidth(plain);
  if (len === w) return s;
  if (len < w) return s + " ".repeat(w - len);
  let out = "";
  let used = 0;
  for (const ch of plain) {
    const cw = wide(ch.codePointAt(0)) ? 2 : 1;
    if (used + cw > w - 1) break;
    out += ch;
    used += cw;
  }
  return out + "\u2026" + " ".repeat(Math.max(0, w - used - 1));
};

const top = (title, w, right = "") => {
  const head = ` ${title} `;
  const tail = right ? ` ${right} ` : "";
  const fill = Math.max(0, w - 2 - dwidth(head) - visible(tail));
  return `${DIM}\u250c${RESET}${BOLD}${head}${RESET}${DIM}${"\u2500".repeat(fill)}${RESET}${tail}${DIM}\u2510${RESET}`;
};
const mid = (w) => `${DIM}\u251c${"\u2500".repeat(w - 2)}\u2524${RESET}`;
const bottom = (w) => `${DIM}\u2514${"\u2500".repeat(w - 2)}\u2518${RESET}`;
const row = (content, w) => `${DIM}\u2502${RESET}${fit(` ${content}`, w - 2)}${DIM}\u2502${RESET}`;

function detailRows(state) {
  const tr = translator(detectLang(state.config));
  const w = state.config.lines?.[state.line]?.[state.idx];
  if (!w) return [`${DIM}${tr("ui.noSelection")}${RESET}`];
  const ctx = demoCtx(120);
  const alone = renderLines({ ...state.config, lines: [[w]] }, ctx, { color: true, width: 120, now: ctx.now });
  const pad = (word) => word.padEnd(7);
  return [
    `${DIM}${pad(tr("ui.type"))}${RESET} ${BOLD}${widgetName(detectLang(state.config), w.type)}${RESET} ${DIM}${w.type}${RESET}`,
    `${DIM}${pad(tr("ui.colour"))}${RESET} ${w.color ? paintFg(w.color, w.color) : `${DIM}${tr("ui.auto")}${RESET}`}`,
    `${DIM}${pad(tr("ui.label"))}${RESET} ${w.label ?? `${DIM}\u2014${RESET}`}`,
    `${DIM}${pad(tr("ui.raw"))}${RESET} ${w.raw ? tr("ui.on") : `${DIM}${tr("ui.off")}${RESET}`}`,
    `${DIM}${pad(tr("ui.renders"))}${RESET} ${alone || `${DIM}${tr("ui.emptyPayload")}${RESET}`}`,
    "",
    `${DIM}${tr("ui.detailKeys")}${RESET}`,
  ];
}

function draw(state) {
  const cfgLang = detectLang(state.config);
  const tr = translator(cfgLang);
  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 40;
  const W = Math.max(56, Math.min(cols - 1, 130));
  const cfg = state.config;
  const out = [];

  const word = (key, on) => (on ? `${GREEN}${tr(key)}${RESET}` : `${DIM}${tr(key)}:${tr("ui.off")}${RESET}`);
  const flags = [
    cfg.theme ? paintFg(`theme:${cfg.theme}`, cfg.theme) : `${DIM}theme:none${RESET}`,
    word("powerline", cfg.powerline?.enabled),
    word("minimal", cfg.global?.minimalist),
    word("bold", cfg.global?.bold),
  ].join(`${DIM} \u00b7 ${RESET}`);
  out.push(top("agystatusline", W, flags));

  const preview = renderLines(cfg, demoCtx(W - 4), { color: true, width: W - 4, now: "14:05" }) || `${DIM}${tr("ui.emptyLayout")}${RESET}`;
  upLines(preview).forEach((l) => out.push(row(l, W)));
  out.push(mid(W));

  if (state.mode === "help") {
    const help = [
      ["\u2191\u2193 / k j", tr("ui.help.move")],
      ["\u2190\u2192 / [ ]", tr("ui.help.row")],
      ["J K / shift+\u2191\u2193", tr("ui.help.reorder")],
      ["a", tr("ui.help.add")],
      ["x / d", tr("ui.help.delete")],
      ["Enter / c", tr("ui.help.colour")],
      ["l", tr("ui.help.label")],
      ["r", tr("ui.help.raw")],
      ["n", tr("ui.help.newRow")],
      ["o", tr("ui.help.preset")],
      ["p", tr("ui.help.powerline")],
      ["t", tr("ui.help.theme")],
      ["m", tr("ui.help.minimalist")],
      ["b", tr("ui.help.bold")],
      ["g", tr("ui.help.lang")],
      ["q", tr("ui.help.quit")],
    ];
    help.forEach(([k, v]) => out.push(row(`${CYAN}${k.padEnd(20)}${RESET}${v}`, W)));
    out.push(bottom(W));
    return CLEAR + out.join("\n") + "\n";
  }

  // ── widget list ──
  const listRows = [];
  (cfg.lines ?? []).forEach((line, li) => {
    if (!line.length) {
      listRows.push({ text: `${GREEN}L${li + 1}${RESET} ${DIM}${tr("ui.emptyRow")}${RESET}`, active: li === state.line && line.length === 0 });
      return;
    }
    line.forEach((w, wi) => {
      const active = li === state.line && wi === state.idx;
      const marker = active ? `${BOLD}\u25b8${RESET}` : " ";
      const colour = w.color ? paintFg(w.color, w.color) : `${DIM}${tr("ui.auto")}${RESET}`;
      const gutter = wi === 0 ? `${DIM}L${li + 1}${RESET}` : "  ";
      listRows.push({ text: `${gutter} ${marker} ${widgetName(cfgLang, w.type)}  ${colour}`, active });
    });
  });

  const previewLines = upLines(preview).length;
  const budget = Math.max(6, rows - previewLines - 10);
  const activeRow = Math.max(0, listRows.findIndex((r) => r.active));
  const start = clamp(activeRow - Math.floor(budget / 2), Math.max(0, listRows.length - budget));
  const slice = listRows.slice(start, start + budget);

  const detail = detailRows(state);
  const sideBySide = cols >= 96;
  if (sideBySide) {
    const leftW = Math.max(34, Math.floor(W * 0.5));
    const rightW = W - leftW - 1;
    const height = Math.max(slice.length, detail.length);
    for (let i = 0; i < height; i += 1) {
      const l = slice[i];
      const left = l ? `${l.active ? INVERSE : ""}${fit(l.text, leftW - 3)}${RESET}` : " ".repeat(leftW - 3);
      const right = detail[i] ?? "";
      out.push(`${DIM}\u2502${RESET} ${left}${DIM}\u2502${RESET}${fit(` ${right}`, rightW)}${DIM}\u2502${RESET}`);
    }
  } else {
    slice.forEach((r) => out.push(row(`${r.active ? INVERSE : ""}${r.text}${RESET}`, W)));
    out.push(mid(W));
    detail.forEach((d) => out.push(row(d, W)));
  }
  out.push(mid(W));

  if (state.mode === "colors") {
    const swatches = SWATCHES.map((c, i) => {
      const label = c === null ? tr("ui.auto") : c.replace(/^bright/, "").slice(0, 9);
      const cell = `${paintSwatch(c)} ${paintFg(label, c)}`;
      return i === state.colorIdx ? `${INVERSE}${cell}${RESET}` : cell;
    });
    out.push(row(`${BOLD}${tr("ui.colour")}${RESET} ${swatches.slice(0, Math.max(1, Math.floor((W - 10) / 18))).join(" ")}`, W));
    out.push(row(`${DIM}${tr("ui.chooseApply")}${RESET}`, W));
  } else if (state.mode === "label") {
    out.push(row(`${BOLD}${tr("ui.label")}${RESET}  ${state.input}${INVERSE} ${RESET}`, W));
    out.push(row(`${DIM}${tr("ui.typeLabel")}${RESET}`, W));
  } else if (state.mode === "picker") {
    const from = clamp(state.pick - 3, Math.max(0, PICKER.length - 7));
    out.push(row(`${BOLD}${tr("ui.addWidget")}${RESET} ${DIM}${state.pick + 1}/${PICKER.length}${RESET}`, W));
    PICKER.slice(from, from + 7).forEach((t, i) => {
      const at = from + i;
      const name = widgetName(cfgLang, t);
      const label = name === t ? t : `${name} ${DIM}${t}${RESET}`;
      out.push(row(`${at === state.pick ? INVERSE : ""}${at === state.pick ? "\u25b8" : " "} ${label}${RESET}`, W));
    });
  } else if (state.mode === "presets") {
    out.push(row(`${BOLD}${tr("ui.preset")}${RESET} ${DIM}${tr("ui.chooseApply")}${RESET}`, W));
    PRESET_NAMES.forEach((name, i) => out.push(row(`${i === state.pick ? INVERSE : ""} ${name}${RESET}`, W)));
  } else {
    out.push(row(`${DIM}${tr("ui.keys1")}${RESET}`, W));
    out.push(row(`${DIM}${tr("ui.keys2")}${RESET}`, W));
  }

  out.push(row(state.status ? `${GREEN}${state.status}${RESET}` : `${DIM}${state.dirty ? tr("ui.saved") : ""}${RESET}`, W));
  out.push(bottom(W));
  return CLEAR + out.join("\n") + "\n";
}

const upLines = (s) => s.split("\n");

// Write the config, creating the directory the first time round (npx users can
// land in the editor before `init` ever ran). Returns an error label or null.
export function saveConfig(path, config) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    return null;
  } catch (err) {
    return err?.code ?? String(err?.message ?? err);
  }
}

export function runTUI(configPath, config) {
  const stdin = process.stdin;
  let state = initialState(config);
  const save = () => {
    const err = saveConfig(configPath, state.config);
    if (err) state = { ...state, status: `save failed: ${err}` };
  };

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  process.stdout.write(HIDE);
  process.stdout.write(draw(state));

  const cleanup = () => {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.off("keypress", onKey);
    process.stdout.write(SHOW + CLEAR);
  };

  function onKey(str, key = {}) {
    let name = (key.name ?? "").toLowerCase();
    if (key.shift && (name === "up" || name === "down")) name = `shift${name[0].toUpperCase()}${name.slice(1)}`;
    else if (key.shift && (name === "j" || name === "k")) name = name.toUpperCase();
    state = applyKey(state, { ...key, name, sequence: key.sequence ?? str });
    if (state.dirty) save();
    if (state.done) {
      cleanup();
      process.stdout.write(`saved ${configPath}\n`);
      return;
    }
    process.stdout.write(draw(state));
  }

  stdin.on("keypress", onKey);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGWINCH", () => process.stdout.write(draw(state)));
}

export const readConfig = (path) => JSON.parse(readFileSync(path, "utf8"));

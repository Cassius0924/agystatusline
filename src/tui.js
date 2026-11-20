// Interactive editor, laid out like ccstatusline's: a title line, a previewed
// box, a plain list with a "▶" cursor and a one-line description underneath.
// Screens: main → lines → edit, plus pickers. Saving is explicit (ctrl+s / s),
// quitting with unsaved edits asks first.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { WIDGETS, renderLines } from "./render.js";
import { demoCtx } from "./demo.js";
import { detectLang, translator, widgetName } from "./i18n.js";

const VERSION = "0.6.1";
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

// Categories mirror ccstatusline's picker so the list stays scannable.
export const CATEGORIES = [
  { key: "all", types: PICKER },
  { key: "core", types: ["agent-state", "model", "thinking-effort", "title", "conversation-id", "vim-mode", "cycle-mode", "clock"] },
  { key: "git", types: PICKER.filter((t) => t.startsWith("git-")) },
  { key: "env", types: ["current-working-dir", "terminal-width", "memory", "plan", "sandbox", "queue", "tasks", "cost"] },
  { key: "tokens", types: ["tokens-input", "tokens-output", "tokens-total", "tokens-cached"] },
  { key: "cache", types: ["cache-hit-rate"] },
  { key: "context", types: ["context-percentage-usable", "context-percentage", "context-remaining", "context-bar", "context-length", "context-window"] },
  { key: "usage", types: ["session-usage", "weekly-usage", "reset-timer", "weekly-reset-timer"] },
  { key: "layout", types: ["separator", "flex-separator", "custom-text", "text", "symbol"] },
].filter((c) => c.types.length);

const snapshot = (config) => JSON.stringify(config);
const dirtyOf = (state) => snapshot(state.config) !== state.original;
const clamp = (n, max) => Math.max(0, Math.min(max, n));

export const markSaved = (state) => ({ ...state, original: snapshot(state.config), dirty: false });

export const initialState = (config) => ({
  config,
  original: snapshot(config),
  screen: "main", // main | lines | edit | picker | colors | label
  menuIdx: 0,
  line: 0,
  idx: 0,
  grab: false,
  catIdx: 0,
  pickIdx: 0,
  pickStage: "cat", // cat | type
  search: "",
  colorIdx: 0,
  input: "",
  confirm: null, // { choice: 0 save & exit | 1 discard | 2 cancel }
  status: "",
  done: false,
  saveNow: false,
  dirty: false,
});

const MENU = ["editLines", "colors", "powerline", "global", "install", "exit"];

function menuItems(s) {
  const items = MENU.map((key) => ({ key }));
  return items;
}

const typesInStage = (s) => {
  if (s.pickStage === "cat") return CATEGORIES.map((c) => c.key);
  const base = CATEGORIES[s.catIdx]?.types ?? PICKER;
  if (!s.search) return base;
  const needle = s.search.toLowerCase();
  return base.filter((t) => t.toLowerCase().includes(needle) || widgetName(detectLang(s.config), t).toLowerCase().includes(needle));
};

const curLine = (s) => s.config.lines?.[s.line] ?? [];
const curWidget = (s) => curLine(s)[s.idx];

export function applyKey(state, key) {
  const next = applyKeyInner(state, key);
  next.dirty = dirtyOf(next);
  return next;
}

function applyKeyInner(state, key) {
  const cfg = state.config;
  const lines = cfg.lines ?? [];
  const s = { ...state, config: cfg, status: "" };
  const tr = translator(detectLang(cfg));
  const line = lines[s.line] ?? [];
  const w = line[s.idx];

  // ── modal: quit confirmation ──
  if (s.confirm) {
    if (key.name === "up" || key.name === "down" || key.name === "left" || key.name === "right") s.confirm = { choice: (s.confirm.choice + 1) % 3 };
    else if (key.name === "escape" || key.name === "q") s.confirm = null;
    else if (key.name === "return") {
      if (s.confirm.choice === 0) { s.saveNow = true; s.done = true; s.confirm = null; }
      else if (s.confirm.choice === 1) { s.done = true; s.confirm = null; }
      else s.confirm = null;
    }
    return s;
  }

  // ── modal: colour / label pickers ──
  if (s.screen === "colors") {
    if (key.name === "left" || key.name === "h") s.colorIdx = clamp(s.colorIdx - 1, SWATCHES.length - 1);
    else if (key.name === "right" || key.name === "l") s.colorIdx = clamp(s.colorIdx + 1, SWATCHES.length - 1);
    else if (key.name === "return" && w) {
      const colour = SWATCHES[s.colorIdx];
      if (colour) w.color = colour; else delete w.color;
      s.status = tr("ui.msg.colour", colour ?? tr("ui.auto"));
      s.screen = "edit";
    } else if (key.name === "escape") s.screen = "edit";
    return s;
  }
  if (s.screen === "label") {
    if (key.name === "return" && w) {
      if (s.input.trim()) w.label = s.input.trim(); else delete w.label;
      s.status = w.label ? tr("ui.msg.label", w.label) : tr("ui.msg.labelCleared");
      s.screen = "edit";
    } else if (key.name === "escape") s.screen = "edit";
    else if (key.name === "backspace") s.input = s.input.slice(0, -1);
    else if (typeof key.sequence === "string" && key.sequence.length === 1 && key.sequence >= " ") s.input += key.sequence;
    return s;
  }

  // ── picker ──
  if (s.screen === "picker") {
    const list = typesInStage(s);
    if (key.name === "up" || key.name === "k") {
      if (s.pickStage === "cat") s.catIdx = clamp(s.catIdx - 1, CATEGORIES.length - 1);
      else s.pickIdx = clamp(s.pickIdx - 1, list.length - 1);
    } else if (key.name === "down" || key.name === "j") {
      if (s.pickStage === "cat") s.catIdx = clamp(s.catIdx + 1, CATEGORIES.length - 1);
      else s.pickIdx = clamp(s.pickIdx + 1, list.length - 1);
    } else if (key.name === "return") {
      if (s.pickStage === "cat") {
        s.pickStage = "type";
        s.pickIdx = 0;
      } else {
        const type = list[s.pickIdx];
        if (type) {
          const at = s.pick === "append" ? line.length : s.idx + 1;
          line.splice(at, 0, { type });
          s.idx = at;
          s.status = tr("ui.msg.added", type);
        }
        s.screen = "edit";
      }
    } else if (key.name === "backspace") {
      if (s.pickStage === "cat" && s.search) s.search = s.search.slice(0, -1);
      else if (s.pickStage === "type" && s.search) { s.search = s.search.slice(0, -1); s.pickIdx = 0; }
      else if (s.pickStage === "type") { s.pickStage = "cat"; s.search = ""; }
    } else if (key.name === "escape") {
      if (s.pickStage === "type" && (s.search || s.catIdx !== 0)) { s.pickStage = "cat"; s.search = ""; }
      else s.screen = "edit";
    } else if (typeof key.sequence === "string" && key.sequence.length === 1 && key.sequence >= " ") {
      s.search += key.sequence;
      s.pickStage = "type";
      s.pickIdx = 0;
    }
    return s;
  }

  // ── main menu ──
  if (s.screen === "main") {
    const items = menuItems(s);
    if (key.name === "up" || key.name === "k") s.menuIdx = clamp(s.menuIdx - 1, items.length - 1);
    else if (key.name === "down" || key.name === "j") s.menuIdx = clamp(s.menuIdx + 1, items.length - 1);
    else if (key.name === "s:save") s.saveNow = true;
    else if (key.name === "g") {
      cfg.language = detectLang(cfg) === "zh" ? "en" : "zh";
      s.status = cfg.language;
    }
    else if (key.name === "escape" || key.name === "q") {
      if (dirtyOf(s)) s.confirm = { choice: 0 }; else s.done = true;
    } else if (key.name === "return") {
      const item = items[s.menuIdx].key;
      if (item === "editLines") { s.screen = "lines"; s.line = clamp(s.line, lines.length - 1); s.idx = 0; }
      else if (item === "colors") {
        s.themeIdx = (THEMES.indexOf(cfg.theme ?? null) + 1 + THEMES.length) % THEMES.length;
        if (THEMES[s.themeIdx]) cfg.theme = THEMES[s.themeIdx]; else delete cfg.theme;
        s.status = tr("ui.msg.theme", cfg.theme ?? "-");
      } else if (item === "powerline") {
        cfg.powerline = { ...(cfg.powerline ?? {}), enabled: !cfg.powerline?.enabled };
        if (cfg.powerline.enabled && !cfg.powerline.separators) {
          cfg.powerline.separators = [String.fromCharCode(0xe0b0)];
          cfg.powerline.endCap = String.fromCharCode(0xe0b4);
          cfg.powerline.autoAlign = true;
        }
        s.status = tr("ui.msg.powerline", tr(cfg.powerline.enabled ? "ui.on" : "ui.off"));
      } else if (item === "global") {
        cfg.global = { ...(cfg.global ?? {}), minimalist: !cfg.global?.minimalist };
        s.status = tr("ui.msg.minimalist", tr(cfg.global.minimalist ? "ui.on" : "ui.off"));
      } else if (item === "install") {
        s.install = true;
        s.done = true;
      } else if (item === "exit") {
        if (dirtyOf(s)) s.confirm = { choice: 0 }; else s.done = true;
      }
    }
    return s;
  }

  // ── lines screen ──
  if (s.screen === "lines") {
    if (key.name === "up" || key.name === "k") s.line = clamp(s.line - 1, lines.length - 1);
    else if (key.name === "down" || key.name === "j") s.line = clamp(s.line + 1, lines.length - 1);
    else if (key.name === "return") { s.screen = "edit"; s.idx = 0; s.grab = false; }
    else if (key.name === "a") { lines.splice(s.line + 1, 0, []); s.line += 1; s.status = tr("ui.lineAdded", s.line + 1); }
    else if (key.name === "d") {
      if (lines.length > 1) { lines.splice(s.line, 1); s.line = clamp(s.line, lines.length - 1); s.status = tr("ui.lineDeleted", s.line + 1); }
    } else if (key.name === "escape") s.screen = "main";
    return s;
  }

  // ── edit screen ──
  const inGrab = s.grab;
  const move = (delta) => {
    const to = s.idx + delta;
    if (to < 0 || to >= line.length) return;
    [line[s.idx], line[to]] = [line[to], line[s.idx]];
    s.idx = to;
  };

  switch (key.name) {
    case "up":
      if (inGrab) move(-1); else s.idx = clamp(s.idx - 1, line.length - 1);
      break;
    case "down":
      if (inGrab) move(1); else s.idx = clamp(s.idx + 1, line.length - 1);
      break;
    case "return":
      s.grab = !inGrab;
      break;
    case "a":
      s.screen = "picker"; s.pick = "append"; s.pickStage = "cat"; s.search = "";
      break;
    case "i":
      s.screen = "picker"; s.pick = "insert"; s.pickStage = "cat"; s.search = "";
      break;
    case "k":
      if (w) { line.splice(s.idx + 1, 0, JSON.parse(JSON.stringify(w))); s.idx += 1; s.status = tr("ui.cloned", w.type); }
      break;
    case "d":
      if (line.length) {
        const [gone] = line.splice(s.idx, 1);
        s.idx = clamp(s.idx, line.length - 1);
        s.status = tr("ui.msg.deleted", gone.type);
      }
      break;
    case "c":
      line.length = 0;
      s.idx = 0;
      s.status = tr("ui.cleared", s.line + 1);
      break;
    case "r":
      if (w) { w.raw = !w.raw; if (!w.raw) delete w.raw; s.status = tr("ui.msg.raw", tr(w.raw ? "ui.on" : "ui.off")); }
      break;
    case "m":
      if (w && s.idx < line.length - 1) {
        const next = line[s.idx + 1];
        line.splice(s.idx + 1, 1);
        s.status = tr("ui.merged", next.type, w.type);
      }
      break;
    case "o":
      if (w) { s.colorIdx = Math.max(0, SWATCHES.indexOf(w.color ?? null)); s.screen = "colors"; }
      break;
    case "l":
      if (w) { s.input = w.label ?? ""; s.screen = "label"; }
      break;
    case "left":
    case "right":
      if (w) { s.screen = "picker"; s.pick = "change"; s.pickStage = "cat"; s.search = ""; }
      break;
    case "s:save":
      s.saveNow = true;
      break;
    case "escape":
      s.screen = "lines";
      s.grab = false;
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

const wide = (cp) =>
  (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6);

const dwidth = (text) => {
  let total = 0;
  for (const ch of text) total += wide(ch.codePointAt(0)) ? 2 : 1;
  return total;
};

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
  return `${out}\u2026${" ".repeat(Math.max(0, w - used - 1))}`;
};

const label = (lang, type) => {
  const name = widgetName(lang, type);
  return name === type ? `widget.${type}` : name;
};

const widgetTitle = (lang, w) => {
  const name = widgetName(lang, w.type);
  const base = name === w.type ? w.type : name;
  if (w.type === "separator") return `${base} ${w.character ?? "|"}`;
  if (w.type === "custom-text") return `${base} (${w.customText ?? ""})`;
  return w.raw ? `${base} (raw value)` : base;
};

function previewBlock(state, tr, W) {
  const cfg = state.config;
  const box = [];
  const title = tr("ui.previewLabel");
  box.push(`${DIM}\u256d${"\u2500".repeat(Math.max(0, W - 2))}\u256e${RESET}`);
  box.push(`${DIM}\u2502${RESET} ${fit(title, W - 3)}${DIM}\u2502${RESET}`);
  box.push(`${DIM}\u2570${"\u2500".repeat(Math.max(0, W - 2))}\u256f${RESET}`);
  const preview = renderLines(cfg, demoCtx(W - 4), { color: true, width: W - 4, now: "14:05" }) || `${DIM}${tr("ui.emptyLayout")}${RESET}`;
  preview.split("\n").forEach((l) => box.push(`  ${l}`));
  return box;
}

export function renderScreen(state, size = {}) {
  const lang = detectLang(state.config);
  const tr = translator(lang);
  const cols = size.columns ?? process.stdout.columns ?? 100;
  const totalRows = size.rows ?? process.stdout.rows ?? 40;
  const W = Math.max(60, Math.min(cols - 1, 118));
  const cfg = state.config;
  const out = [];

  const dirty = state.dirty ? `  ${GREEN}* ${tr("ui.unsaved")}${RESET}` : "";
  out.push(`${BOLD}agystatusline${RESET} ${DIM}| v${VERSION}${RESET}${dirty}`);
  out.push(...previewBlock(state, tr, W));
  out.push("");

  const lines = cfg.lines ?? [];
  let title = tr("ui.mainMenu");
  let hint1 = tr("ui.menuHelp");
  let hint2 = "";
  let rows = [];
  let desc = tr("ui.mainHint");

  if (state.screen === "lines") {
    title = tr("ui.selectLine");
    hint1 = tr("ui.selectLineHint");
    hint2 = tr("ui.linesKeys");
    rows = lines.map((line, i) => ({
      text: `${i === state.line ? `${CYAN}\u25b6${RESET}` : " "}  \u2630 ${lang === "zh" ? `第 ${i + 1} 行` : `Line ${i + 1}`} ${DIM}(${line.length} widget${line.length === 1 ? "" : "s"})${RESET}`,
      active: i === state.line,
    }));
    rows.push({ text: "", active: false });
    rows.push({ text: `${DIM}${tr("ui.back")}${RESET}`, active: false, back: true });
    desc = `${tr("ui.selectLineHint")}`;
  } else if (state.screen === "edit") {
    title = tr("ui.editLine", state.line + 1);
    hint1 = state.grab ? tr("ui.moveMode", widgetTitle(lang, curWidget(state) ?? { type: "?" })) : tr("ui.editKeys");
    rows = (lines[state.line] ?? []).map((w, i) => {
      const active = i === state.idx;
      const num = String(i + 1).padStart(2, " ");
      return { text: `${active ? `${CYAN}\u25b6${RESET}` : " "} ${num}. ${widgetTitle(lang, w)}`, active };
    });
    if (curWidget(state)) {
      const key = `desc.${curWidget(state).type}`;
      const own = tr(key);
      desc = own === key ? tr("ui.widgetDesc", widgetTitle(lang, curWidget(state))) : own;
    } else desc = "";
  } else if (state.screen === "picker") {
    title = `${tr("ui.editLine", state.line + 1)} [${state.pick === "append" ? "ADD WIDGET" : "INSERT WIDGET"}]`;
    hint1 = tr("ui.pickerKeys");
    const list = typesInStage(state);
    const active = state.pickStage === "cat" ? state.catIdx : state.pickIdx;
    rows = list.map((item, i) => {
      const name = state.pickStage === "cat" ? (tr(`cat.${item}`) === `cat.${item}` ? item : tr(`cat.${item}`)) : label(lang, item);
      const num = String(i + 1).padStart(2, " ");
      return { text: `${i === active ? `${CYAN}\u25b6${RESET}` : " "} ${num}. ${name}`, active: i === active };
    });
    if (state.pickStage === "type" && list[state.pickIdx]) {
      const key = `desc.${list[state.pickIdx]}`;
      desc = tr(key) === key ? tr("ui.widgetDesc", label(lang, list[state.pickIdx])) : tr(key);
    } else desc = tr("ui.searchAll");
  } else if (state.screen === "colors") {
    title = tr("ui.colour");
    hint1 = tr("ui.colourKeys");
    const cells = SWATCHES.map((c, i) => {
      const name = (c === null ? tr("ui.auto") : c.replace(/^bright/, "")).slice(0, 9);
      const cell = `${paintSwatch(c)} ${paintFg(name.padEnd(9), c)}`;
      return i === state.colorIdx ? `${INVERSE}${cell}${RESET}` : cell;
    });
    for (let i = 0; i < cells.length; i += 4) {
      rows.push({ text: cells.slice(i, i + 4).join("  "), active: false });
    }
    desc = tr("ui.chooseApply");
  } else if (state.screen === "label") {
    title = tr("ui.label");
    hint1 = tr("ui.labelKeys");
    rows = [{ text: `${state.input}${INVERSE} ${RESET}`, active: false }];
    desc = tr("ui.typeLabel");
  } else {
    // main menu — ccstatusline's grouping: edit, looks, then settings, then exit
    const items = menuItems(state);
    const icon = { editLines: "\u{1F4DD}", colors: "\u{1F3A8}", powerline: "\u26A1", global: "\u{1F310}", install: "\u{1F4E6}", exit: "\u{1F6AA}" };
    const name = {
      editLines: tr("ui.menu.editLines"),
      colors: tr("ui.menu.colors"),
      powerline: tr("ui.menu.powerline"),
      global: tr("ui.menu.global"),
      install: tr("ui.menu.install"),
      exit: state.dirty ? tr("ui.menu.saveExit") : tr("ui.menu.exit"),
    };
    rows = items.map((item, i) => ({
      text: `${i === state.menuIdx ? `${CYAN}\u25b6${RESET}` : " "}  ${icon[item.key]} ${name[item.key]}`,
      active: i === state.menuIdx,
      gapBefore: item.key === "install",
    }));
    desc = state.dirty ? tr("ui.confirm.title") : tr("ui.mainHint");
  }

  out.push(`${BOLD}${title}${RESET}`);
  if (hint1) out.push(`${DIM}${hint1}${RESET}`);
  if (hint2) out.push(`${DIM}${hint2}${RESET}`);
  out.push("");

  const budget = Math.max(6, totalRows - out.length - 6);
  const activeRow = Math.max(0, rows.findIndex((r) => r.active));
  const start = clamp(activeRow - Math.floor(budget / 2), Math.max(0, rows.length - budget));
  if (start > 0) out.push(`  ${DIM}\u2191 ${start} ${tr("ui.windowMore")}${RESET}`);
  rows.slice(start, start + budget).forEach((r) => {
    if (r.gapBefore) out.push("");
    out.push(`  ${r.text}`);
  });
  const rest = rows.length - (start + budget);
  if (rest > 0) out.push(`  ${DIM}\u2193 ${rest} ${tr("ui.windowMore")}${RESET}`);

  out.push("");
  out.push(`  ${DIM}${desc}${RESET}`);
  if (state.status) out.push(`  ${GREEN}${state.status}${RESET}`);

  if (state.confirm) {
    const options = [tr("ui.confirm.save"), tr("ui.confirm.discard"), tr("ui.confirm.cancel")];
    out.push("");
    out.push(`  ${BOLD}${tr("ui.confirm.title")}${RESET}`);
    options.forEach((text, i) => {
      out.push(`  ${i === state.confirm.choice ? `${CYAN}\u25b6${RESET}` : " "}  ${i === state.confirm.choice ? `${BOLD}${text}${RESET}` : text}`);
    });
  }

  return CLEAR + out.join("\n") + "\n";
}

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
  const tr = () => translator(detectLang(state.config));

  const save = () => {
    const err = saveConfig(configPath, state.config);
    if (err) {
      state = { ...state, status: `${tr()("ui.save")} failed: ${err}` };
      return false;
    }
    state = { ...markSaved(state), status: tr()("ui.msg.saved", configPath) };
    return true;
  };

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  process.stdout.write(HIDE);
  process.stdout.write(renderScreen(state));

  const cleanup = () => {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.off("keypress", onKey);
    process.stdout.write(`${SHOW}${CLEAR}`);
  };

  function onKey(str, key = {}) {
    let name = (key.name ?? "").toLowerCase();
    if (key.shift && (name === "up" || name === "down")) name = `shift${name[0].toUpperCase()}${name.slice(1)}`;
    if (name === "s") name = "s:save"; // s / ctrl+s saves
    state = applyKey(state, { ...key, name, sequence: key.sequence ?? str });

    if (state.saveNow) {
      save();
      state = { ...state, saveNow: false };
    }
    if (state.done) {
      const saved = !state.dirty;
      const install = state.install;
      cleanup();
      process.stdout.write(saved ? `${tr()("ui.saved")} ${configPath}\n` : `${tr()("ui.msg.quitUnsaved")}\n`);
      if (install) process.stdout.write("run `agystatusline init` to wire agy's statusLine\n");
      return;
    }
    process.stdout.write(renderScreen(state));
  }

  stdin.on("keypress", onKey);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGWINCH", () => process.stdout.write(renderScreen(state)));
}

export const readConfig = (path) => JSON.parse(readFileSync(path, "utf8"));

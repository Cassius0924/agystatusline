// Shared preset definitions: used by `agystatusline preset <name>` and the TUI.
// Each preset is a complete layout; `default` is what `init` writes.
const sep = { type: "separator" };
const space = { type: "custom-text", customText: " " };

export const PRESETS = {
  default: {
    lines: [
      [
        { type: "agent-state" },
        { type: "separator" },
        { type: "title" },
        { type: "separator" },
        { type: "model", color: "brightBlue" },
        { type: "custom-text", customText: " " },
        { type: "thinking-effort", color: "brightBlue" },
        { type: "separator" },
        { type: "current-working-dir", color: "brightMagenta", metadata: { abbreviateHome: "true" } },
        { type: "custom-text", customText: " " },
        { type: "git-branch", metadata: { icon: "\u2387 " } },
        { type: "separator" },
        { type: "git-changes", color: "brightBlack", metadata: { paren: true } },
      ],
      [
        { type: "custom-text", customText: "Ctx ", color: "green" },
        { type: "context-percentage-usable", metadata: { display: "slider" } },
        { type: "separator" },
        { type: "custom-text", customText: "Cache Hit: ", color: "brightBlack" },
        { type: "cache-hit-rate", color: "brightBlack", metadata: { whenMissing: "n/a" } },
        { type: "separator" },
        { type: "conversation-id", color: "brightBlack", metadata: { full: true } },
      ],
      [
        { type: "custom-text", customText: "5-hour: " },
        { type: "session-usage" },
        { type: "custom-text", customText: " x " },
        { type: "reset-timer", color: "brightBlack" },
        { type: "separator" },
        { type: "custom-text", customText: "Weekly: " },
        { type: "weekly-usage" },
        { type: "custom-text", customText: " x " },
        { type: "weekly-reset-timer", color: "brightBlack" },
      ],
    ],
  },

  // One line, everything at a glance; nothing that changes every keystroke.
  compact: {
    lines: [[
      { type: "agent-state" },
      sep,
      { type: "title" },
      sep,
      { type: "model", color: "brightBlue" },
      sep,
      { type: "git-branch", color: "magenta" },
      sep,
      { type: "git-changes", color: "cyan" },
      sep,
      { type: "context-percentage" },
    ]],
  },

  // Two lines: the working line, then quota/context.
  standard: {
    lines: [
      [
        { type: "agent-state" },
        sep,
        { type: "title" },
        sep,
        { type: "model", color: "brightBlue" },
        sep,
        { type: "current-working-dir", color: "brightMagenta" },
        space,
        { type: "git-branch", color: "magenta" },
        sep,
        { type: "git-changes", color: "cyan" },
      ],
      [
        { type: "context-percentage-usable", metadata: { display: "slider" } },
        { type: "separator", character: "|" },
        { type: "session-usage" },
        { type: "separator", character: "|" },
        { type: "weekly-usage" },
      ],
    ],
  },

  // Shortest useful line: model + context.
  minimal: {
    lines: [[
      { type: "model", color: "brightBlue" },
      sep,
      { type: "context-percentage" },
    ]],
  },

  // Everything the payload can give, including host stats and cost.
  full: {
    lines: [
      [
        { type: "agent-state" },
        sep,
        { type: "title" },
        sep,
        { type: "model", color: "brightBlue" },
        sep,
        { type: "current-working-dir", color: "brightMagenta" },
        space,
        { type: "git-branch", color: "magenta" },
        sep,
        { type: "git-changes", color: "cyan" },
        sep,
        { type: "git-ahead-behind", color: "brightBlack" },
        sep,
        { type: "vim-mode", color: "brightBlack" },
        sep,
        { type: "cycle-mode", color: "brightBlack" },
        sep,
        { type: "tasks", color: "brightCyan" },
      ],
      [
        { type: "custom-text", customText: "Ctx ", color: "green" },
        { type: "context-percentage-usable", metadata: { display: "slider" } },
        { type: "separator", character: "|" },
        { type: "custom-text", customText: "Tok ", color: "brightBlack" },
        { type: "tokens-total", color: "brightBlack" },
        { type: "separator", character: "|" },
        { type: "custom-text", customText: "Cache ", color: "brightBlack" },
        { type: "cache-hit-rate", color: "brightBlack" },
        { type: "separator", character: "|" },
        { type: "cost", color: "brightBlack" },
      ],
      [
        { type: "session-usage" },
        { type: "custom-text", customText: " x " },
        { type: "reset-timer", color: "brightBlack" },
        { type: "custom-text", customText: " x " },
        { type: "weekly-usage" },
        { type: "custom-text", customText: " x " },
        { type: "weekly-reset-timer", color: "brightBlack" },
        { type: "separator", character: "|" },
        { type: "memory", color: "brightBlack" },
        { type: "separator", character: "|" },
        { type: "clock", color: "brightBlack" },
      ],
    ],
  },

  // Coloured blocks, needs a Nerd Font for the separators.
  powerline: {
    theme: "aurora",
    powerline: { enabled: true, separators: [String.fromCharCode(0xe0b0)], endCap: String.fromCharCode(0xe0b4), autoAlign: true },
    lines: [
      [
        { type: "agent-state", bgColor: "#1f6feb", textColor: "#ffffff" },
        { type: "model", bgColor: "#3b2f63", textColor: "#ffffff" },
        { type: "current-working-dir", bgColor: "#243b53", textColor: "#ffffff" },
        { type: "git-branch", bgColor: "#155e4b", textColor: "#ffffff" },
        { type: "git-changes", bgColor: "#155e4b", textColor: "#ffffff" },
      ],
      [
        { type: "context-percentage-usable", bgColor: "#3d2f2f", textColor: "#ffffff" },
        { type: "cache-hit-rate", bgColor: "#33323d", textColor: "#ffffff" },
        { type: "session-usage", bgColor: "#2f3d2f", textColor: "#ffffff" },
        { type: "reset-timer", bgColor: "#2f3d2f", textColor: "#ffffff" },
        { type: "weekly-usage", bgColor: "#2f3d2f", textColor: "#ffffff" },
      ],
    ],
  },

  // Git-heavy: branch, divergence, and the porcelain counts.
  git: {
    lines: [
      [{ type: "git-branch" }, sep, { type: "git-changes" }, sep, { type: "git-ahead-behind" }, sep, { type: "git-origin" }],
      [{ type: "git-staged" }, sep, { type: "git-unstaged" }, sep, { type: "git-untracked" }, sep, { type: "git-sha" }],
    ],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

// Apply a preset over an existing config: layout always, theme/powerline only
// when the preset sets them (so switching back to `default` keeps the colours).
export function applyPreset(config, preset) {
  const next = { ...config, lines: JSON.parse(JSON.stringify(preset.lines)) };
  if (preset.theme !== undefined) next.theme = preset.theme;
  if (preset.powerline !== undefined) next.powerline = JSON.parse(JSON.stringify(preset.powerline));
  return next;
}

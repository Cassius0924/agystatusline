// Shared preset definitions: used by `agystatusline preset <name>` and the TUI.
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
        { type: "git-branch", color: "magenta" },
        { type: "separator" },
        { type: "git-changes", color: "cyan" },
        { type: "separator" },
        { type: "vim-mode", color: "brightBlack" },
        { type: "separator" },
        { type: "tasks", color: "brightCyan" },
      ],
      [
        { type: "custom-text", customText: "Ctx ", color: "green" },
        { type: "context-percentage-usable", metadata: { display: "slider" } },
        { type: "separator", character: "|" },
        { type: "cache-hit-rate", color: "brightBlack" },
        { type: "separator", character: "|" },
        { type: "conversation-id", color: "brightBlack" },
      ],
      [
        { type: "session-usage" },
        { type: "custom-text", customText: " x " },
        { type: "reset-timer", color: "brightBlack" },
        { type: "custom-text", customText: " x " },
        { type: "weekly-usage" },
        { type: "custom-text", customText: " x " },
        { type: "weekly-reset-timer", color: "brightBlack" },
      ],
    ],
  },
  minimal: {
    global: { minimalist: true },
    lines: [[
      { type: "agent-state" }, { type: "separator" },
      { type: "model" }, { type: "separator" },
      { type: "current-working-dir" }, { type: "separator" },
      { type: "context-percentage" }, { type: "separator" },
      { type: "session-usage" },
    ]],
  },
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
  git: {
    lines: [
      [{ type: "git-branch" }, { type: "separator" }, { type: "git-changes" }, { type: "separator" }, { type: "git-ahead-behind" }, { type: "separator" }, { type: "git-origin" }],
      [{ type: "git-staged" }, { type: "separator" }, { type: "git-unstaged" }, { type: "separator" }, { type: "git-untracked" }, { type: "separator" }, { type: "git-sha" }],
    ],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

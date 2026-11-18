// Sample session used by `--demo`, `preset` previews and the TUI preview.
export const DEMO_PAYLOAD = {
  cwd: "/home/you/proj",
  conversation_id: "12345678-abcd-ef01-2345-6789abcdef01",
  conversation_title: "Fix the config loader",
  model: { id: "gemini-4-argon-high", display_name: "Gemini 4 Argon (High)", effort: "high" },
  workspace: { current_dir: "/home/you/proj", project_dir: "/home/you/proj" },
  context_window: {
    total_input_tokens: 88244,
    total_output_tokens: 61074,
    context_window_size: 1048576,
    used_percentage: 14.24,
    current_usage: { input_tokens: 63382, output_tokens: 346, cache_read_input_tokens: 20857, cache_creation_input_tokens: 0 },
  },
  vcs: { type: "git", branch: "main" },
  vim: { mode: "NORMAL" },
  quota: {
    "gemini-5h": { remaining_fraction: 0.72, reset_in_seconds: 5400 },
    "gemini-weekly": { remaining_fraction: 0.93, reset_in_seconds: 560580 },
  },
  cycle_mode: "plan",
  terminal_width: 120,
};

export const DEMO_GIT = {
  branch: "main", changes: "+128 \u221234", insertions: "+128", deletions: "\u221234",
  sha: "a1b2c3d", root: "proj", origin: "you/proj", staged: 2, unstaged: 3,
  untracked: 1, aheadBehind: "\u21e131 \u21e31",
};

export const demoCtx = (width = 120) => ({
  p: DEMO_PAYLOAD,
  home: "/home/you",
  git: DEMO_GIT,
  width,
  mem: 61,
  now: "14:05",
});

# agystatusline

Configurable status line for the [Antigravity CLI](https://antigravity.google/docs/cli/statusline) (`agy`) — widget rows defined in JSON, `ccstatusline`-style, zero dependencies.

```bash
npx -y agystatusline init          # writes the config + wires agy's statusLine
npx -y agystatusline preset powerline   # or: default | minimal | git
```

`init` refuses to replace an existing `statusLine` unless you pass `--force`; it backs `settings.json` up to `settings.json.agystatusline.bak` and runs a self-check through the same command it just wired.

## How it works

Antigravity runs the configured `statusLine.command` on every agent-state change and pipes the session JSON to its stdin. This package reads that JSON and prints the rows you configured:

```json
{ "statusLine": { "type": "command", "command": "/usr/bin/node /path/to/agystatusline/bin/agystatusline.js" } }
```

One Node process per refresh, ~50 ms including startup.

## Configuration

`~/.config/agystatusline/settings.json` (or `$XDG_CONFIG_HOME/agystatusline/settings.json`):

```json
{
  "version": 1,
  "gitCacheTtlSeconds": 5,
  "theme": "aurora",
  "global": { "padding": "both", "bold": false, "minimalist": false, "inheritColors": false },
  "powerline": { "enabled": false, "separators": ["\ue0b0"], "endCap": "\ue0b4", "autoAlign": true },
  "lines": [
    [
      { "type": "agent-state" },
      { "type": "model", "label": "", "color": "model" },
      { "type": "current-working-dir", "color": "git", "metadata": { "abbreviateHome": "true" } },
      { "type": "git-branch", "color": "git" },
      { "type": "git-changes" }
    ]
  ]
}
```

### Layout options

| key | meaning |
| --- | --- |
| `global.padding` | `both` / `left` / `right` / `none` — block padding in powerline mode |
| `global.bold` | bold every value |
| `global.minimalist` | drop labels / decorations, values only |
| `global.inheritColors` | separators take the colour of the value before them |
| `theme` | `mono` / `aurora` / `paper`, or an object mapping slots (`model`, `git`, `meta`, `ok`, `warn`, `bad`) to colours |
| `powerline.enabled` | draw blocks with background colours instead of plain text |
| `powerline.separators` | glyph used between blocks (default `\ue0b0`) |
| `powerline.endCap` / `startCap` | optional cap glyphs |
| `powerline.autoAlign` | pad blocks so columns line up across rows (default on) |
| `flex-separator` widget | a row spacer: with `width` known it right-aligns the tail |

Colours: `black red green yellow blue magenta cyan white`, the `bright*` variants, `#rrggbb`, or a theme slot name. `NO_COLOR=1` / `--no-color` disables colour.

### Widgets

| type | shows |
| --- | --- |
| `model`, `thinking-effort` | model name, effort level |
| `agent-state` | `READY`, `WORKING`, `TOOL`, `THINKING`, `ERROR` |
| `title`, `conversation-id` (alias `claude-session-id`) | conversation title (30 cols) and id prefix |
| `plan`, `sandbox`, `queue`, `tasks`, `cost` | plan tier, `SB:ON`, pending messages, subagents/background tasks, `$0.42` |
| `vim-mode`, `cycle-mode` | `NORMAL`, `plan` / `auto` |
| `current-working-dir`, `terminal-width`, `memory`, `clock` | `~/proj`, columns, RAM %, `14:05` |
| `git-branch`, `git-changes`, `git-insertions`, `git-deletions`, `git-sha` | branch, `+5 −2`, split counts, short commit |
| `git-staged`, `git-unstaged`, `git-untracked`, `git-ahead-behind`, `git-root`, `git-origin` | `+2`, `~3`, `?1`, `⇡2 ⇣1`, repo name, `owner/repo` |
| `context-percentage-usable`, `context-percentage`, `context-remaining`, `context-bar` | `████░ 42%`, `42%`, `58%`, 20-cell bar |
| `context-length`, `context-window`, `tokens-input`, `tokens-output`, `tokens-total`, `tokens-cached` | `128k`, `1.0M`, per-direction and cached tokens |
| `cache-hit-rate` | share of prompt tokens served from cache |
| `session-usage`, `weekly-usage`, `reset-timer`, `weekly-reset-timer` | quota left and reset countdowns (`5h 30m`, `6d 11h`) |
| `separator`, `flex-separator`, `custom-text`, `text`, `symbol` | static text, spacers |

Any widget accepts `color`, `textColor`, `bgColor`, `label`, `raw` and `maxWidth`.

## Editor (TUI)

Run it with no arguments in a terminal (or `agystatusline edit`):

```
┌ agystatusline ──────────────────────── theme:aurora · powerline · bold:off ┐
│ READY | Gemini 4 Argon (High) | ~/proj main | +128 −34 | NORMAL            │
│ Ctx █░░░░░░░░░ 14% | 25% | 12345678                                        │
├───────────────────────────────────────────────────────────────────────────┤
│ L1 ▸ agent-state  auto        │ type    agent-state                       │
│      separator  auto          │ colour  auto                              │
│      model  brightBlue        │ label   —                                 │
│      current-working-dir …    │ renders READY                             │
├───────────────────────────────────────────────────────────────────────────┤
│ ↑↓ move  ←→ row  J/K reorder  a add  x del  Enter colour  l label  r raw  │
└───────────────────────────────────────────────────────────────────────────┘
```

- Framed three-pane layout at ≥96 columns (list + detail), stacked below that; the list scrolls with the cursor.
- `Enter`/`c` opens a **colour picker with live swatches** (`←→` choose, Enter apply — first entry returns the widget to auto).
- `l` edits the widget **label** inline, `r` toggles raw values, `o` opens the **preset picker**, `?` shows the full key map.
- The preview pane uses the same renderer as the live status line, so what you see is what agy draws.
- Every keypress saves; the next agy refresh (≤300 ms) shows the change.

## Commands

| command | does |
| --- | --- |
| `agystatusline` | render from stdin (what agy calls) |
| `agystatusline init [--force]` | write the default config + wire agy settings |
| `agystatusline preset [default\|minimal\|powerline\|git]` | switch layout, previews it |
| `agystatusline edit` (or no args in a TTY) | interactive editor |
| `agystatusline config` | print the config path |
| `agystatusline --demo` | render a sample payload |
| `agystatusline --version` | print the version |

## Behaviour worth knowing

- Git values are cached for `gitCacheTtlSeconds` (default 5) in `~/.cache/agystatusline`: agy starts a fresh process at most every 300 ms, so without the cache every refresh would spawn `git`.
- Bad config, bad stdin or a throwing widget still prints a bar (`agy`) and logs to `~/.cache/agystatusline/error.log`. agy disables a status line after 30 consecutive failures, so silence is not an option.
- Rows never wrap: widgets that don't fit `terminal_width` are dropped from the end.
- Colours need `TERM`; agy strips ANSI when it thinks the terminal can't do colour.
- No network calls, no telemetry; only `git` and `/proc/meminfo` are read locally.

## Compared with ccstatusline

Ported: multi-row widget config, the `ccstatusline` widget vocabulary, per-widget colours/labels, themes/gradients-in-theme-slots, powerline blocks with caps and column alignment, flex separator, minimalist mode, git cache TTL, reset timers, cache-hit-rate, the interactive `preset` previews, and a renderer with no dependencies.

Not portable (agy's payload has no data for it): Claude usage API widgets (session/weekly per-model, spend limits, block forecasts), PR/CI widgets, transcript-derived metrics (output speed, cache misses, compaction), hook-driven widgets. Not implemented: per-widget gradients and per-project configs.

MIT.

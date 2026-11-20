# agystatusline

[![CI](https://github.com/Cassius0924/agystatusline/actions/workflows/ci.yml/badge.svg)](https://github.com/Cassius0924/agystatusline/actions/workflows/ci.yml)
[![Release](https://github.com/Cassius0924/agystatusline/actions/workflows/release.yml/badge.svg)](https://github.com/Cassius0924/agystatusline/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@cassius0924/agystatusline.svg)](https://www.npmjs.com/package/@cassius0924/agystatusline)

Configurable status line for the [Antigravity CLI](https://antigravity.google/docs/cli/statusline) (`agy`) — widget rows defined in JSON, `ccstatusline`-style, zero dependencies.

```bash
npx -y @cassius0924/agystatusline init          # writes the config + wires agy's statusLine
npx -y @cassius0924/agystatusline preset compact     # or: default | standard | minimal | full | powerline | git
```

> Behind a registry mirror (npmmirror, corporate proxy)? The mirror's `latest` tag can lag behind npm by minutes to hours, so `npx` may install an older version. Either wait for the sync or bypass the mirror for this command:
> ```bash
> npx -y --registry=https://registry.npmjs.org @cassius0924/agystatusline@latest
> ```

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
  "global": { "padding": "both", "bold": false, "inheritColors": false },
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
| `global.inheritColors` | separators take the colour of the value before them |
| `theme` | `mono` / `aurora` / `paper`, or an object mapping slots (`model`, `git`, `meta`, `ok`, `warn`, `bad`) to colours. A theme remaps the named colours too, so it recolours configs that hard-code `brightBlue`/`magenta`/… |
| `language` | `en` (default) / `zh` — UI and widget wording |
| `powerline.enabled` | draw blocks with background colours instead of plain text |
| `powerline.separators` | glyph used between blocks (default `\ue0b0`) |
| `powerline.endCap` / `startCap` | optional cap glyphs |
| `powerline.autoAlign` | pad blocks so columns line up across rows (default on) |
| `flex-separator` widget | a row spacer: with `width` known it right-aligns the tail |

### Language

`"language": "zh"` switches **the editor** to Chinese: pane titles, key hints, help, status messages and widget names (`separator` → 分隔符, `git-branch` → 分支, `context-percentage-usable` → 上下文百分比). The raw type id stays visible next to it, so configs remain portable.

The rendered status line is **not** translated — `READY`, `1 subagent · 2 tasks`, `1h 30m` stay exactly as configured, so a language switch never changes what agy displays. Without the key the editor follows `AGYSTATUSLINE_LANG` / `LC_ALL` / `LANG`, defaulting to English; press `g` in the editor to toggle.

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

Run it with no arguments in a terminal (or `agystatusline edit`). The layout follows
ccstatusline: a title line, a preview box, then a plain list with a `▶` cursor and a
one-line description underneath.

```
agystatusline | v0.6.2
╭──────────────────────────────────────────────────────────────────────╮
│ > Preview  (ctrl+s to save configuration at any time)                │
╰──────────────────────────────────────────────────────────────────────╯
  READY | Gemini 4 Argon (High) | ~/proj main | +128 −34 | NORMAL
  Ctx █░░░░░░░░░ 14% | 25% | 12345678
  72% x 1h 30m x 93% x 6d 11h

Main Menu
↑↓ select · Enter open · s save · q exit

  ▶  📝 Edit Lines
     🎨 Theme
     ⚡ Powerline Setup
     🌐 Global Options

     📦 Install to agy
     🚪 Exit

  Configure any number of status rows with widgets like model info, git status and quota usage
```

Screens: **Main Menu → Edit Lines → Edit Line N**, each with its own hint line and a
description for the selected item. **Preset layouts** and **Theme** preview the highlighted
choice in the box above before you press Enter.

| preset | shape |
| --- | --- |
| `default` | three rows: status+title+model+cwd+branch+changes, context row, quota row |
| `compact` | one row, state → title → model → branch → changes → context |
| `standard` | two rows: the working line, then context + 5h/weekly quota |
| `minimal` | one row: model + context percentage |
| `full` | three rows with everything agy reports, incl. tokens, cost, host RAM and clock |
| `powerline` | coloured blocks with caps (needs a Nerd Font) |
| `git` | two rows of repo detail (divergence, staged/unstaged/untracked, sha) |

```
Edit Line 1
↑↓ select · ←→ change type · Enter move · (a) append · (i) insert · (k) clone ·
(d) delete · (c) clear · (r) raw · (m) merge · Esc back

  ▶  1. Agent State
     2. Separator |
     3. Model
     4. Custom Text ( )
     5. Thinking Effort

  Agent state: ready, working, tool use or error
```

- `Enter` starts **move mode** (arrows reorder, Enter drops); `←→` swaps the widget type.
- `(a)` appends, `(i)` inserts after the cursor — both open the **widget picker** with
  categories (Core / Git / Environment / Tokens / Cache / Context / Usage / Layout) and
  type-to-search over every widget.
- `o` opens the colour picker with live swatches, `l` edits the widget label, `r` toggles
  raw values, `c` clears the line.
- The preview box uses the same renderer as the live status line, so what you see is what
  agy draws.
- **Saving is explicit**, like ccstatusline: edits live in memory, the title line shows
  `* unsaved changes`, `s` (or `Ctrl+S`) writes them, and quitting with unsaved edits asks
  *Save & Exit / Exit without saving / Cancel*. agy's next refresh picks the file up.
- `g` toggles the editor language (English / Chinese); rendered output is never translated.
- **No separate install step**: the `📦 Install to agy` menu entry writes agy's
  `~/.gemini/antigravity-cli/settings.json` in place (backup + self-check) and turns into
  `✅ agy is wired up` once it is. If another status line is already configured it asks
  in a dialog before overwriting instead of telling you to rerun a command.
  `agystatusline init` does the same thing for scripts and prompts `[y/N]` on a terminal.

Layout config lives in `~/.config/agystatusline/settings.json` (respects `XDG_CONFIG_HOME`),
the same split ccstatusline uses: tool config in `~/.config/ccstatusline/settings.json`,
wiring in the host CLI's settings file.

## Commands

| command | does |
| --- | --- |
| `agystatusline` | render from stdin (what agy calls) |
| `agystatusline init [--force]` | write the default config + wire agy settings (optional — the editor menu does it) |
| `agystatusline preset [default\|compact\|standard\|minimal\|full\|powerline\|git]` | switch layout, previews it |
| `agystatusline edit` (or no args in a TTY) | interactive editor (`s` save, `q` quit) |
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

Ported: multi-row widget config, the `ccstatusline` widget vocabulary, per-widget colours/labels, themes/gradients-in-theme-slots, powerline blocks with caps and column alignment, flex separator, git cache TTL, reset timers, cache-hit-rate, the interactive `preset` previews, and a renderer with no dependencies.

Not portable (agy's payload has no data for it): Claude usage API widgets (session/weekly per-model, spend limits, block forecasts), PR/CI widgets, transcript-derived metrics (output speed, cache misses, compaction), hook-driven widgets. Not implemented: per-widget gradients and per-project configs.

## Releasing

1. `npm version patch|minor` (or edit `package.json`), commit.
2. `git tag -a vX.Y.Z -m …` and `git push --tags`.
3. `gh release create vX.Y.Z --generate-notes`.

`.github/workflows/release.yml` runs the tests, checks the tag matches `package.json`, then publishes with `--provenance` through [trusted publishing](https://docs.npmjs.com/trusted-publishers): npm exchanges the GitHub OIDC token for a short-lived publish credential, so no secret is stored.

Setup (once, on npmjs.com → package → Settings → Trusted Publisher → GitHub Actions):

| field | value |
| --- | --- |
| Organization or user | `Cassius0924` |
| Repository | `agystatusline` |
| Workflow filename | `release.yml` |
| Environment | *(leave empty)* |

A repository secret `NPM_TOKEN` still works as a fallback for accounts without trusted publishing.

MIT.

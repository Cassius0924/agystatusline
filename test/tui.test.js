import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyKey, initialState, PICKER, SWATCHES, saveConfig, markSaved, CATEGORIES } from "../src/tui.js";

const base = () => ({
  lines: [
    [{ type: "model", color: "brightBlue" }, { type: "git-branch" }],
    [{ type: "context-percentage" }],
  ],
});
const key = (name, extra = {}) => ({ name, ...extra });

// main → lines → edit line 1
const openEditor = () => {
  let s = initialState(base());
  s = applyKey(s, key("return"));
  s = applyKey(s, key("return"));
  return s;
};

test("the picker only offers widget types the renderer knows", () => {
  assert.ok(PICKER.includes("git-branch"));
  assert.ok(PICKER.includes("separator"));
  assert.ok(!PICKER.includes("claude-status"));
  assert.ok(CATEGORIES.some((c) => c.key === "git"));
});

test("main menu opens the line list, then the editor", () => {
  const lines = applyKey(initialState(base()), key("return"));
  assert.equal(lines.screen, "lines");
  const edit = applyKey(lines, key("return"));
  assert.equal(edit.screen, "edit");
  assert.equal(edit.idx, 0);
});

test("edits stay in memory until saved", () => {
  let s = openEditor();
  assert.equal(s.dirty, false);
  s = applyKey(s, key("d"));
  assert.equal(s.dirty, true);
  s = markSaved(s);
  assert.equal(s.dirty, false);
});

test("s asks for a save without quitting", () => {
  const s = applyKey(openEditor(), key("s:save"));
  assert.equal(s.saveNow, true);
  assert.notEqual(s.done, true);
});

test("delete, clear and raw act on the selected widget", () => {
  let s = openEditor();
  s = applyKey(s, key("d"));
  assert.deepEqual(s.config.lines[0].map((w) => w.type), ["git-branch"]);
  s = applyKey(s, key("r"));
  assert.equal(s.config.lines[0][0].raw, true);
  s = applyKey(s, key("c"));
  assert.deepEqual(s.config.lines[0], []);
});

test("Enter toggles grab mode and arrows move the widget", () => {
  let s = openEditor();
  s = applyKey(s, key("return"));
  assert.equal(s.grab, true);
  s = applyKey(s, key("down"));
  assert.deepEqual(s.config.lines[0].map((w) => w.type), ["git-branch", "model"]);
  assert.equal(s.idx, 1);
  s = applyKey(s, key("return"));
  assert.equal(s.grab, false);
});

test("a appends through the picker, i inserts after the cursor", () => {
  let s = openEditor();
  s = applyKey(s, key("a"));
  assert.equal(s.screen, "picker");
  assert.equal(s.pick, "append");
  s = applyKey(s, key("return")); // category → types
  assert.equal(s.pickStage, "type");
  s = applyKey(s, key("return")); // add the first type in "all"
  assert.equal(s.screen, "edit");
  assert.equal(s.config.lines[0].length, 3);
  assert.equal(s.config.lines[0][2].type, PICKER[0]);

  let t = openEditor();
  t = applyKey(t, key("i"));
  t = applyKey(t, key("return"));
  t = applyKey(t, key("down"));
  t = applyKey(t, key("return"));
  assert.equal(t.config.lines[0][1].type, PICKER[1]);
});

test("typing filters the picker", () => {
  let s = applyKey(openEditor(), key("a"));
  s = applyKey(s, key("return"));
  for (const ch of "git") s = applyKey(s, { name: ch, sequence: ch });
  assert.equal(s.search, "git");
  assert.equal(s.pickStage, "type");
});

test("k clones and m merges the selected widget", () => {
  let s = applyKey(openEditor(), key("k"));
  assert.equal(s.config.lines[0].length, 3);
  assert.equal(s.config.lines[0][1].type, "model");
  s = applyKey(s, key("m"));
  assert.equal(s.config.lines[0].length, 2);
});

test("the lines screen adds and deletes rows", () => {
  let s = applyKey(initialState(base()), key("return"));
  s = applyKey(s, key("a"));
  assert.equal(s.config.lines.length, 3);
  assert.equal(s.line, 1);
  s = applyKey(s, key("d"));
  assert.equal(s.config.lines.length, 2);
});

test("the colour picker applies a swatch to the selected widget", () => {
  let s = applyKey(openEditor(), key("o"));
  assert.equal(s.screen, "colors");
  s = applyKey(s, key("right"));
  s = applyKey(s, key("right"));
  const picked = SWATCHES[s.colorIdx];
  s = applyKey(s, key("return"));
  assert.equal(s.screen, "edit");
  assert.equal(s.config.lines[0][0].color, picked);
});

test("the label editor types and applies", () => {
  let s = applyKey(openEditor(), key("l"));
  assert.equal(s.screen, "label");
  for (const ch of "Git") s = applyKey(s, { name: ch.toLowerCase(), sequence: ch });
  s = applyKey(s, key("return"));
  assert.equal(s.config.lines[0][0].label, "Git");
});

test("q exits when clean, asks when there are unsaved changes", () => {
  const clean = applyKey(initialState(base()), key("q"));
  assert.equal(clean.done, true);

  let dirty = applyKey(openEditor(), key("d"));
  dirty = applyKey(dirty, key("escape")); // lines
  dirty = applyKey(dirty, key("escape")); // main
  dirty = applyKey(dirty, key("q"));
  assert.ok(dirty.confirm);
  assert.equal(dirty.done, false);

  const saveAndExit = applyKey(dirty, key("return"));
  assert.equal(saveAndExit.done, true);
  assert.equal(saveAndExit.saveNow, true);

  const discard = applyKey(applyKey(dirty, key("down")), key("return"));
  assert.equal(discard.done, true);
  assert.notEqual(discard.saveNow, true);

  const cancel = applyKey(dirty, key("escape"));
  assert.equal(cancel.confirm, null);
  assert.equal(cancel.done, false);
});

test("saveConfig creates the config directory on first write", () => {
  const dir = mkdtempSync(join(tmpdir(), "agsl-"));
  const target = join(dir, "deep", "config", "settings.json");
  assert.equal(saveConfig(target, { language: "zh" }), null);
  assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { language: "zh" });
});

test("saveConfig reports a failure instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "agsl-"));
  const blocker = join(dir, "not-a-dir");
  writeFileSync(blocker, "x");
  const err = saveConfig(join(blocker, "settings.json"), {});
  assert.equal(typeof err, "string");
  assert.ok(err.length > 0);
});

// ── screen layout (what the user actually sees) ──
import { renderScreen } from "../src/tui.js";

const plain = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const screenOf = (state) => plain(renderScreen(state, { columns: 100, rows: 30 }));

test("main menu looks like ccstatusline: title, preview box, menu, description", () => {
  const out = screenOf(initialState(base()));
  const lines = out.split("\n");
  assert.match(lines[0], /^agystatusline \| v\d/);
  assert.match(out, /╭─+╮/);
  assert.match(out, /> Preview {2}\(ctrl\+s to save configuration at any time\)/);
  assert.match(out, /\nMain Menu\n/);
  assert.match(out, /▶ {2}📝 Edit Lines/);
  assert.match(out, /🚪 Exit/);
  assert.match(out, /Add, remove and reorder widgets/);
});

test("the line list shows widget counts and a way back", () => {
  const out = screenOf(applyKey(initialState(base()), { name: "return" }));
  assert.match(out, /Select Line to Edit Items/);
  assert.match(out, /☰ Line 1 \(2 widgets\)/);
  assert.match(out, /☰ Line 2 \(1 widget\)/);
  assert.match(out, /← Back/);
});

test("the editor numbers widgets and shows a description for the selection", () => {
  let s = applyKey(initialState(base()), { name: "return" });
  s = applyKey(s, { name: "return" });
  const out = screenOf(s);
  assert.match(out, /Edit Line 1/);
  assert.match(out, /▶ {1,2}1\. Model/);
  assert.match(out, / {2}2\. Git Branch/);
  assert.match(out, /Name of the model agy is running/);
});

test("the quit dialog renders its three choices", () => {
  let s = applyKey(initialState(base()), { name: "return" });
  s = applyKey(s, { name: "return" });
  s = applyKey(s, { name: "d" });
  s = applyKey(s, { name: "escape" });
  s = applyKey(s, { name: "escape" });
  s = applyKey(s, { name: "q" });
  const out = screenOf(s);
  assert.match(out, /Save changes before quitting\?/);
  assert.match(out, /Save & Exit/);
  assert.match(out, /Exit without saving/);
  assert.match(out, /Cancel/);
});

test("the unsaved marker shows up in the title line", () => {
  let s = applyKey(initialState(base()), { name: "return" });
  s = applyKey(s, { name: "return" });
  s = applyKey(s, { name: "d" });
  assert.match(screenOf(s).split("\n")[0], /unsaved changes/);
});

test("the install item wires agy in place instead of asking for init", () => {
  let called = 0;
  const hooks = { isWired: () => false, install: () => { called += 1; return { ok: true, message: "wired ok" }; } };
  let s = initialState(base(), hooks);
  const menu = screenOf(s);
  assert.match(menu, /📦 Install to agy/);
  // walk down to the install entry (5th)
  for (let i = 0; i < 4; i += 1) s = applyKey(s, { name: "down" });
  s = applyKey(s, { name: "return" });
  assert.equal(called, 1);
  assert.equal(s.done, false);
  assert.equal(s.status, "wired ok");
});

test("the wiring row reports its state in the description, not as a stray line", () => {
  let s = initialState(base(), { isWired: () => true });
  s = applyKey(s, { name: "down" });
  s = applyKey(s, { name: "down" });
  s = applyKey(s, { name: "down" });
  s = applyKey(s, { name: "down" });
  assert.match(screenOf(s), /agy already points at this tool/);

  const fresh = initialState(base(), { isWired: () => false });
  assert.match(screenOf(fresh), /📦 Install to agy/);
});

test("a taken statusLine opens an in-editor overwrite dialog", () => {
  const calls = [];
  const hooks = {
    isWired: () => false,
    install: (opts) => {
      calls.push(opts);
      if (opts?.force) return { ok: true, message: "wired now" };
      return { ok: false, conflict: "~/.gemini/antigravity-cli/statusline.sh", message: "taken" };
    },
  };
  let s = initialState(base(), hooks);
  for (let i = 0; i < 4; i += 1) s = applyKey(s, { name: "down" });
  s = applyKey(s, { name: "return" });
  assert.equal(s.confirm.kind, "install");
  assert.match(screenOf(s), /already has a statusLine/);
  assert.match(screenOf(s), /statusline\.sh/);

  // Esc cancels without forcing
  assert.equal(applyKey(s, { name: "escape" }).confirm, null);
  assert.equal(calls.length, 1);

  // Enter on the first option overwrites
  s = applyKey(s, { name: "return" });
  assert.deepEqual(calls[1], { force: true });
  assert.equal(s.status, "wired now");
  assert.equal(s.done, false);

  // the second option just cancels
  let t = initialState(base(), hooks);
  for (let i = 0; i < 4; i += 1) t = applyKey(t, { name: "down" });
  t = applyKey(t, { name: "return" });
  t = applyKey(t, { name: "down" });
  t = applyKey(t, { name: "return" });
  assert.equal(t.confirm, null);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].force, undefined);
});

test("the theme screen lists every theme and applies the chosen one", () => {
  let s = applyKey(initialState(base()), { name: "down" }); // Theme
  s = applyKey(s, { name: "return" });
  assert.equal(s.screen, "themes");
  const out = screenOf(s);
  assert.match(out, /aurora/);
  assert.match(out, /none \(plain\)/);
  s = applyKey(s, { name: "up" });
  s = applyKey(s, { name: "return" });
  assert.equal(s.config.theme, "paper");
  assert.equal(s.screen, "main");
});

test("deleting the only line explains itself instead of doing nothing", () => {
  let s = initialState({ lines: [[{ type: "model" }]] });
  s = applyKey(s, { name: "return" });
  s = applyKey(s, { name: "d" });
  assert.equal(s.config.lines.length, 1);
  assert.match(screenOf(s), /last line cannot be deleted/);
});

test("q goes back a level, and s saves from any list screen", () => {
  let s = applyKey(initialState(base()), { name: "return" }); // lines
  assert.equal(s.screen, "lines");
  assert.equal(applyKey(s, { name: "q" }).screen, "main");
  assert.equal(applyKey(s, { name: "s:save" }).saveNow, true);
  s = applyKey(s, { name: "return" }); // edit
  assert.equal(applyKey(s, { name: "q" }).screen, "lines");
  assert.equal(applyKey(s, { name: "s:save" }).saveNow, true);
});

test("a search with no hits says so, and an empty line explains itself", () => {
  let s = applyKey(openEditor(), { name: "a" });
  s = applyKey(s, { name: "return" });
  for (const ch of "zzz") s = applyKey(s, { name: ch, sequence: ch });
  assert.match(screenOf(s), /no widget matches/);

  let empty = initialState({ lines: [[]] });
  empty = applyKey(empty, { name: "return" });
  empty = applyKey(empty, { name: "return" });
  assert.match(screenOf(empty), /empty line/);
});

test("the preset screen previews the highlighted layout before Enter", () => {
  // cursor starts on `default` (three rows), move to `compact` (one row)
  let s = applyKey(applyKey(initialState(base()), { name: "down" }), { name: "down" });
  s = applyKey(s, { name: "return" });
  assert.equal(s.screen, "presets");
  const one = plain(renderScreen(s, { columns: 100, rows: 30 }));
  s = applyKey(s, { name: "down" }); // compact
  const two = plain(renderScreen(s, { columns: 100, rows: 30 }));
  assert.notEqual(one, two, "the preview changes with the cursor");
  s = applyKey(s, { name: "return" });
  assert.equal(s.screen, "main");
  assert.equal(s.config.lines.length, 1);
  assert.match(s.status, /compact/);
});

test("the theme screen previews colours before Enter", () => {
  let s = applyKey(initialState(base()), { name: "down" });
  s = applyKey(s, { name: "return" });
  const aurora = renderScreen(s, { columns: 100, rows: 30 });
  s = applyKey(s, { name: "up" }); // paper
  s = applyKey(s, { name: "up" }); // mono
  const mono = renderScreen(s, { columns: 100, rows: 30 });
  assert.notEqual(aurora, mono);
  assert.ok(mono.includes("\x1b[97m") || mono.includes("\x1b[37m"), "mono paints brightWhite/white");
});

test("the editor preview underlines the widget being edited", () => {
  let s = applyKey(initialState(base()), { name: "return" });
  const listScreen = renderScreen(s, { columns: 100, rows: 30 });
  assert.ok(!listScreen.includes("\x1b[4m"), "no highlight before entering the editor");

  s = applyKey(s, { name: "return" }); // edit line 1, widget 0 (model)
  const first = renderScreen(s, { columns: 100, rows: 30 });
  assert.match(first, /\x1b\[4m(\x1b\[[0-9;]+m)?Gemini 4 Argon \(High\)/);

  s = applyKey(s, { name: "down" }); // git-branch
  const second = renderScreen(s, { columns: 100, rows: 30 });
  assert.match(second, /\x1b\[4m(\x1b\[[0-9;]+m)?main/);
  assert.doesNotMatch(second, /\x1b\[4m(\x1b\[[0-9;]+m)?Gemini/);
});

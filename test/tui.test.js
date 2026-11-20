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
  let s = applyKey(openEditor(), key("k:clone"));
  assert.equal(s.config.lines[0].length, 3);
  assert.equal(s.config.lines[0][1].type, "model");
  s = applyKey(s, key("m:merge"));
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
  assert.match(out, /Configure any number of status rows/);
});

test("the line list shows widget counts and a way back", () => {
  const out = screenOf(applyKey(initialState(base()), { name: "return" }));
  assert.match(out, /Select Line to Edit Items/);
  assert.match(out, /☰ Line 1 \(2 widgets\)/);
  assert.match(out, /☰ Line 2 \(1 widgets\)/);
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

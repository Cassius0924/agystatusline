import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyKey, initialState, PICKER, SWATCHES, saveConfig, markSaved } from "../src/tui.js";

const base = () => ({
  lines: [
    [{ type: "agent-state" }, { type: "model", color: "brightBlue" }],
    [{ type: "context-percentage" }],
  ],
});

const key = (name, extra = {}) => ({ name, ...extra });

test("the picker offers only widget types the renderer knows", () => {
  assert.ok(PICKER.includes("git-branch"));
  assert.ok(PICKER.includes("separator"));
  assert.ok(!PICKER.includes("claude-status"));
});

test("adding a widget inserts it after the cursor and keeps the picker open until Enter", () => {
  let s = initialState(base());
  s = applyKey(s, key("a"));
  assert.equal(s.mode, "picker");
  s = applyKey(s, { ...key("return"), });
  assert.equal(s.mode, "list");
  assert.equal(s.config.lines[0].length, 3);
  assert.ok(s.dirty);
});

test("delete removes the selected widget and clamps the cursor", () => {
  let s = initialState(base());
  s = applyKey(s, key("down")); // model
  s = applyKey(s, key("x"));
  assert.deepEqual(s.config.lines[0].map((w) => w.type), ["agent-state"]);
  assert.equal(s.idx, 0);
});

test("J and K reorder the current row", () => {
  let s = initialState(base());
  s = applyKey(s, key("J"));
  assert.deepEqual(s.config.lines[0].map((w) => w.type), ["model", "agent-state"]);
  s = applyKey(s, key("K"));
  assert.deepEqual(s.config.lines[0].map((w) => w.type), ["agent-state", "model"]);
});

test("arrow keys move between rows and clamp inside a row", () => {
  let s = initialState(base());
  s = applyKey(s, key("right"));
  assert.equal(s.line, 1);
  s = applyKey(s, key("down"));
  assert.equal(s.idx, 0); // one widget only
  s = applyKey(s, key("left"));
  assert.equal(s.line, 0);
});

test("n starts a new empty row below and moves the cursor there", () => {
  let s = initialState(base());
  s = applyKey(s, key("n"));
  assert.equal(s.config.lines.length, 3);
  assert.equal(s.line, 1);
  assert.deepEqual(s.config.lines[1], []);
});

test("p toggles powerline and seeds the glyphs on first enable", () => {
  let s = initialState(base());
  s = applyKey(s, key("p"));
  assert.equal(s.config.powerline.enabled, true);
  assert.equal(s.config.powerline.separators[0], String.fromCharCode(0xe0b0));
  s = applyKey(s, key("p"));
  assert.equal(s.config.powerline.enabled, false);
});

test("t cycles themes including the no-theme state", () => {
  let s = initialState(base());
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    s = applyKey(s, key("t"));
    seen.push(s.config.theme ?? null);
  }
  assert.ok(seen.includes("aurora"));
  assert.ok(seen.includes(null));
});

test("c opens the colour picker and Enter applies the chosen swatch", () => {
  let s = initialState(base());
  s = applyKey(s, key("down"));
  s = applyKey(s, key("c"));
  assert.equal(s.mode, "colors");
  assert.equal(s.colorIdx, 1); // current colour preselected
  s = applyKey(s, key("right"));
  s = applyKey(s, key("right"));
  const picked = SWATCHES[s.colorIdx];
  s = applyKey(s, key("return"));
  assert.equal(s.mode, "list");
  assert.equal(s.config.lines[0][1].color, picked);
  assert.ok(s.dirty);
});

test("colour picker can go back to auto", () => {
  let s = initialState(base());
  s = applyKey(s, key("down"));
  s = applyKey(s, key("c"));
  s = applyKey(s, key("left")); // to "auto"
  s = applyKey(s, { name: "left" });
  s = applyKey(s, { name: "return" });
  assert.equal(s.config.lines[0][1].color, undefined);
});

test("label editor types, applies and clears", () => {
  let s = initialState(base());
  s = applyKey(s, key("down"));
  s = applyKey(s, key("l"));
  assert.equal(s.mode, "label");
  for (const ch of "M") s = applyKey(s, { name: "m", sequence: ch });
  s = applyKey(s, { name: "backspace" });
  for (const ch of "Model") s = applyKey(s, { name: ch.toLowerCase(), sequence: ch });
  s = applyKey(s, key("return"));
  assert.equal(s.config.lines[0][1].label, "Model");
  s = applyKey(s, key("l"));
  s = applyKey(s, { name: "backspace" });
  s = applyKey(s, { name: "backspace" });
  s = applyKey(s, { name: "backspace" });
  s = applyKey(s, { name: "backspace" });
  s = applyKey(s, { name: "backspace" });
  s = applyKey(s, key("return"));
  assert.equal(s.config.lines[0][1].label, undefined);
});

test("r toggles raw and o opens the preset picker", () => {
  let s = initialState(base());
  s = applyKey(s, key("r"));
  assert.equal(s.config.lines[0][0].raw, true);
  s = applyKey(s, key("o"));
  assert.equal(s.mode, "presets");
  s = applyKey(s, key("down"));
  s = applyKey(s, key("return"));
  assert.equal(s.mode, "list");
  assert.ok(s.config.lines.length >= 1);
});

test("? opens help and any key returns", () => {
  let s = initialState(base());
  s = applyKey(s, { name: "?" });
  assert.equal(s.mode, "help");
  s = applyKey(s, key("x"));
  assert.equal(s.mode, "list");
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

test("edits do not save themselves: dirty is derived from the snapshot", () => {
  let s = initialState(base());
  assert.equal(s.dirty, false);
  s = applyKey(s, key("x"));
  assert.equal(s.dirty, true);
  s = markSaved(s);
  assert.equal(s.dirty, false);
});

test("s marks the session for saving without quitting", () => {
  const s = applyKey(initialState(base()), key("s:save"));
  assert.equal(s.saveNow, true);
  assert.notEqual(s.done, true);
});

test("q with no changes exits immediately", () => {
  const s = applyKey(initialState(base()), key("q"));
  assert.equal(s.done, true);
  assert.equal(s.mode, "list");
});

test("q with unsaved changes asks first", () => {
  let s = applyKey(initialState(base()), key("x")); // delete a widget
  s = applyKey(s, key("q"));
  assert.equal(s.mode, "confirm");
  assert.notEqual(s.done, true);
  assert.equal(s.confirm, 0);
});

test("the quit dialog can save, discard or cancel", () => {
  const dirty = applyKey(initialState(base()), key("x"));

  const saveAndExit = applyKey(applyKey(dirty, key("q")), key("return"));
  assert.equal(saveAndExit.saveNow, true);
  assert.equal(saveAndExit.done, true);

  const discard = applyKey(applyKey(applyKey(dirty, key("q")), key("down")), key("return"));
  assert.equal(discard.done, true);
  assert.notEqual(discard.saveNow, true);

  const cancel = applyKey(applyKey(applyKey(dirty, key("q")), key("down")), key("escape"));
  assert.equal(cancel.mode, "list");
  assert.notEqual(cancel.done, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { abbrevHome } from "../src/render.js";
import { memoryPercent } from "../src/memory.js";
import { buildCommand } from "../src/install.js";

test("home abbreviations survive Windows separators and case", () => {
  assert.equal(abbrevHome("/home/me/proj", "/home/me", "linux"), "~/proj");
  assert.equal(abbrevHome("C:\\Users\\He Zhi Zhou\\proj", "C:\\Users\\He Zhi Zhou", "win32"), "~\\proj");
  assert.equal(abbrevHome("c:\\users\\he zhi zhou\\proj", "C:\\Users\\He Zhi Zhou", "win32"), "~\\proj");
  assert.equal(abbrevHome("C:\\Users\\hezhizhou\\proj", "C:\\Users\\He Zhi Zhou", "win32"), "C:\\Users\\hezhizhou\\proj");
  assert.equal(abbrevHome("/home/me/proj", "/home/me/", "linux"), "~/proj");
});

test("memory falls back to os numbers where /proc is missing", () => {
  const linux = memoryPercent(() => "MemTotal: 1000 kB\nMemAvailable: 250 kB\n", { totalmem: () => 1e9, freemem: () => 1 });
  assert.equal(linux, 75);

  const macish = memoryPercent(
    () => {
      throw new Error("ENOENT");
    },
    { totalmem: () => 16e9, freemem: () => 4e9 },
  );
  assert.equal(macish, 75);

  const nowhere = memoryPercent(
    () => {
      throw new Error("ENOENT");
    },
    { totalmem: () => 0, freemem: () => 0 },
  );
  assert.equal(nowhere, null);
});

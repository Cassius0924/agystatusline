import test from "node:test";
import assert from "node:assert/strict";
import { buildCommand, quote } from "../src/install.js";

test("POSIX keeps the bare path so the shell can run it", () => {
  assert.equal(buildCommand({ platform: "linux", onPath: "/usr/local/bin/agystatusline", execPath: "/usr/bin/node", scriptPath: "/x/a.js" }), "/usr/local/bin/agystatusline");
  assert.equal(buildCommand({ platform: "darwin", execPath: "/usr/local/bin/node", scriptPath: "/Users/me/a b/a.js" }), "/usr/local/bin/node /Users/me/a b/a.js");
  assert.equal(quote("/Users/me/it's here", "darwin"), `'/Users/me/it'\\''s here'`);
});

test("Windows quotes both halves and prefers a PATH hit", () => {
  assert.equal(
    buildCommand({ platform: "win32", onPath: "C:\\Users\\He Zhi Zhou\\AppData\\Roaming\\npm\\agystatusline.cmd", execPath: "C:\\Program Files\\nodejs\\node.exe", scriptPath: "C:\\x\\a.js" }),
    '"C:\\Users\\He Zhi Zhou\\AppData\\Roaming\\npm\\agystatusline.cmd"',
  );
  assert.equal(
    buildCommand({ platform: "win32", execPath: "C:\\Program Files\\nodejs\\node.exe", scriptPath: "C:\\Users\\He Zhi Zhou\\a.js" }),
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\He Zhi Zhou\\a.js"',
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../frontend/v2/four-stock-paper-ui.js", import.meta.url),
  "utf8"
);

test("adapter requires explicit Resume for a saved session", () => {
  assert.match(source, /resume:\s*"four-stock-paper-resume"/);
  assert.match(source, /paused = true;\s*savePauseState\(\);\s*render\(saved\)/);
  assert.match(source, /el\.resume\.addEventListener\("click"/);
  assert.match(source, /paused = false;\s*saveActiveState\(\)/);
});

test("Prepare cannot silently reuse an existing session", () => {
  assert.match(
    source,
    /if \(busy \|\| isTodaySession\(controller\.getSessionSnapshot\(\)\)\) return;/
  );
  assert.match(source, /el\.prepare\.disabled = busy \|\| todaySession/);
});

test("Resume and paper steps require a valid four-instrument universe", () => {
  assert.match(source, /function validUniverse\(snapshot\)/);
  assert.match(source, /instruments\.length !== 4/);
  assert.match(source, /new Set\(symbols\)\.size === 4/);
  assert.match(source, /symbols\.includes\("NIFTY 50"\)/);
  assert.match(source, /if \(!isTodaySession\(snapshot\) \|\| !validUniverse\(snapshot\)\)/);
});

test("Stop pauses UI polling and preserves controller evidence", () => {
  assert.match(source, /el\.stop\.addEventListener\("click"/);
  assert.match(source, /paused = true;\s*savePauseState\(\)/);
  assert.doesNotMatch(source, /controller\.clearSession\(\)/);
});

test("Adapter initialization does not automatically start or poll a session", () => {
  assert.match(source, /Adapter initialized; no session was started/);
  assert.doesNotMatch(source, /await controller\.startSession\(\);\s*await controller\.pollSession\(\)/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.doesNotMatch(source, /setTimeout\s*\(/);
});

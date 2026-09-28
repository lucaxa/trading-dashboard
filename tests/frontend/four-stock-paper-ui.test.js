import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../frontend/v2/four-stock-paper-ui.js", import.meta.url),
  "utf8"
);

test("adapter exposes automatic paper-session lifecycle controls", () => {
  assert.match(source, /resume:\s*"four-stock-paper-resume"/);
  assert.match(source, /el\.resume\.addEventListener\("click"/);
  assert.match(source, /el\.stop\.addEventListener\("click"/);
  assert.match(source, /startAutomaticPolling/);
  assert.match(source, /stopAutomaticPolling/);
  assert.match(source, /paused = false;\s*saveActiveState\(\)/);
  assert.match(source, /paused = true;\s*savePauseState\(\)/);
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

test("Adapter wires automatic polling through the controller", () => {
  assert.match(source, /typeof controller\.startAutomaticPolling !== "function"/);
  assert.match(source, /typeof controller\.stopAutomaticPolling !== "function"/);
  assert.match(source, /await controller\.startAutomaticPolling\(\)/);
  assert.match(source, /controller\.stopAutomaticPolling\(\)/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.doesNotMatch(source, /setTimeout\s*\(/);
});

test("Download JSON button is registered and disabled without a saved session", () => {
  assert.match(source, /download:\s*"four-stock-paper-download"/);
  assert.match(source, /if \(!snapshot\)[\s\S]*?el\.download\.disabled = true/);
  assert.match(source, /el\.download\.addEventListener\("click"/);
});

test("Download JSON exports the saved snapshot with a dated filename", () => {
  assert.match(source, /const snapshot = controller\.getSessionSnapshot\(\)/);
  assert.match(source, /JSON\.stringify\(snapshot, null, 2\)/);
  assert.match(source, /type:\s*"application\/json"/);
  assert.match(
    source,
    /trademind-four-stock-session-\$\{sessionDate\}-\$\{timestamp\}\.json/
  );
  assert.match(source, /link\.click\(\)/);
});

test("Download JSON does not trigger a paper step or mutate the session", () => {
  const handler = source.match(
    /el\.download\.addEventListener\("click", \(\) => \{([\s\S]*?)\n    \}\);/
  );

  assert.ok(handler, "Download click handler should exist");
  assert.doesNotMatch(handler[1], /controller\.pollSession\(/);
  assert.doesNotMatch(handler[1], /controller\.startSession\(/);
  assert.doesNotMatch(handler[1], /controller\.clearSession\(/);
  assert.doesNotMatch(handler[1], /fetch\(/);
});

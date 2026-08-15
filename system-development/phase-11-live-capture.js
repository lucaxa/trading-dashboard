/*
===========================================================
 TradeMind Pro
 SYSTEM PHASE 11 — LIVE OBSERVATION CAPTURE
 V1
===========================================================

PURPOSE
-------
Capture ONE genuinely fresh completed NIFTY 50 5-minute
observation from the existing /api/live-signal endpoint.

THIS IS A CAPTURE LAYER ONLY.

It does NOT:
- modify V10.20
- modify Phase 8
- modify Phase 11
- optimize parameters
- learn
- promote
- place broker orders
- place real orders
- manufacture historical evidence

FLOW
----
/api/live-signal
        ↓
latest completed candle
        ↓
freshness validation
        ↓
frozen V10.20 strategy provenance validation
        ↓
frozen V10.20 decision
        ↓
Phase 11 observation contract

SAFETY
------
A stale candle is rejected.
A future candle is rejected.
A missing/invalid candle is rejected.
A non-LIVE response is rejected.
A non-PAPER_ONLY response is rejected.
An unexpected strategy identity is rejected.

No observation file is written unless all
freshness, provenance, and market-data checks pass.
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");

const VERSION =
  "SYSTEM_PHASE_11_LIVE_OBSERVATION_CAPTURE_V1";

const EXPECTED_STRATEGY =
  "V10.20";

const DEFAULT_SIGNAL_URL =
  "https://trading-dashboard-sigma-ten.vercel.app/api/live-signal";

const SIGNAL_URL =
  process.env.TRADEMIND_LIVE_SIGNAL_URL ||
  DEFAULT_SIGNAL_URL;

const OUTPUT_FILE =
  path.resolve(
    process.env.PHASE11_INPUT_FILE ||
      "system-development/data/phase-11-live-observations.json"
  );

const MAX_CANDLE_AGE_MS =
  Number(
    process.env.PHASE11_MAX_CANDLE_AGE_MS ||
      10 * 60 * 1000
  );

function fail(message) {
  throw new Error(message);
}

function finite(value, name) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    fail(`${name} must be finite`);
  }

  return n;
}

function ensureFreshness(signalCandle) {
  const tsSeconds =
    finite(signalCandle.ts, "signalCandle.ts");

  const timestampMs =
    tsSeconds * 1000;

  const now =
    Date.now();

  if (timestampMs > now + 60 * 1000) {
    fail("Completed candle timestamp is in the future");
  }

  const age =
    now - timestampMs;

  if (age < 0) {
    fail("Completed candle timestamp is invalid");
  }

  if (age > MAX_CANDLE_AGE_MS) {
    fail(
      `Latest completed candle is stale: ` +
      `${Math.round(age / 1000)} seconds old`
    );
  }

  return {
    timestampMs,
    ageMs: age
  };
}

function validateCandle(candle) {
  if (!candle || typeof candle !== "object") {
    fail("Signal candle is missing");
  }

  const o = finite(candle.open, "candle.open");
  const h = finite(candle.high, "candle.high");
  const l = finite(candle.low, "candle.low");
  const c = finite(candle.close, "candle.close");

  if (h < Math.max(o, c)) {
    fail("Candle high is invalid");
  }

  if (l > Math.min(o, c)) {
    fail("Candle low is invalid");
  }

  if (l > h) {
    fail("Candle low/high relationship is invalid");
  }

  return { o, h, l, c };
}

function validateStrategyProvenance(data) {
  if (data.strategy !== EXPECTED_STRATEGY) {
    fail(
      `Unexpected strategy identity: ` +
      `${data.strategy ?? "missing"}; ` +
      `expected ${EXPECTED_STRATEGY}`
    );
  }
}

function mapDecision(signal) {
  switch (signal) {
    case "WAIT":
      return {
        action: "NO_TRADE",
        rationale: "Frozen V10.20 decision: WAIT"
      };

    case "BUY":
      return {
        action: "ENTER_LONG",
        rationale: "Frozen V10.20 decision: BUY"
      };

    case "SELL":
      return {
        action: "ENTER_SHORT",
        rationale: "Frozen V10.20 decision: SELL"
      };

    case "EXIT":
      return {
        action: "EXIT",
        rationale: "Frozen V10.20 decision: EXIT"
      };

    default:
      fail(`Unsupported live signal: ${signal}`);
  }
}

async function main() {
  console.log(
    "=== TRADEMIND PRO PHASE 11 LIVE CAPTURE ==="
  );

  console.log("VERSION:", VERSION);
  console.log("EXPECTED STRATEGY:", EXPECTED_STRATEGY);
  console.log("SIGNAL URL:", SIGNAL_URL);

  const response =
    await fetch(
      SIGNAL_URL,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    fail("Live-signal endpoint returned invalid JSON");
  }

  if (!response.ok) {
    fail(`Live-signal HTTP error: ${response.status}`);
  }

  if (data.success !== true) {
    fail("Live-signal response is not successful");
  }

  if (data.status !== "LIVE") {
    fail(`Live-signal is not LIVE: ${data.status}`);
  }

  if (data.mode !== "PAPER_ONLY") {
    fail("Live-signal is not PAPER_ONLY");
  }

  if (data.instrument !== "NIFTY 50") {
    fail("Unexpected instrument");
  }

  if (data.interval !== "5minute") {
    fail("Unexpected live interval");
  }

  validateStrategyProvenance(data);

  const signalCandle =
    data.signalCandle;

  const freshness =
    ensureFreshness(signalCandle);

  const candle =
    validateCandle(signalCandle);

  const decision =
    mapDecision(data.signal);

  const timestamp =
    new Date(
      freshness.timestampMs
    ).toISOString();

  const observation = {
    source: "LIVE_MARKET",
    timestamp,
    instrument: "NIFTY 50",
    timeframe: "5m",
    completedCandle: true,
    candle,

    decision: {
      action: decision.action,
      confidence: null,
      rationale: decision.rationale
    },

    capture: {
      sourceVersion: VERSION,
      engineVersion: data.version || null,
      strategy: data.strategy,
      signal: data.signal,
      signalTime:
        data.data?.signalTime || timestamp,
      capturedAt:
        new Date(Date.now()).toISOString(),
      candleAgeSeconds:
        Math.round(freshness.ageMs / 1000)
    }
  };

  if (observation.source !== "LIVE_MARKET") {
    fail("Internal source safety check failed");
  }

  if (observation.completedCandle !== true) {
    fail(
      "Internal completed-candle safety check failed"
    );
  }

  if (
    observation.capture?.strategy !==
    EXPECTED_STRATEGY
  ) {
    fail(
      "Internal strategy provenance check failed"
    );
  }

  if (
    observation.timestamp.includes(
      "REPLACE_WITH"
    )
  ) {
    fail("Placeholder timestamp detected");
  }

  if (
    !Number.isFinite(
      Date.parse(observation.timestamp)
    )
  ) {
    fail("Generated timestamp is invalid");
  }

  fs.mkdirSync(
    path.dirname(OUTPUT_FILE),
    { recursive: true }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify([observation], null, 2) + "\n",
    "utf8"
  );

  console.log(
    "LIVE_FORWARD_OBSERVATION_CAPTURED"
  );

  console.log(
    JSON.stringify(observation, null, 2)
  );

  console.log("OUTPUT:", OUTPUT_FILE);
}

main().catch(error => {
  console.error(
    "LIVE_FORWARD_CAPTURE_REJECTED"
  );

  console.error(
    error?.message || error
  );

  process.exit(1);
});

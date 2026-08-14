/*
===========================================================
 TradeMind Pro
 SYSTEM DEVELOPMENT — PHASE 1
 LEARNING MEMORY / EXPERIENCE LEDGER
===========================================================

PURPOSE
-------
Create the first real system-development component after the
bounded research exit: a deterministic experience ledger.

This module is NOT a strategy and NOT an execution engine.
It records observations, decisions, and eventual outcomes in a
stable schema so a future learner can learn from experience
without rewriting history.

SAFETY BOUNDARY
---------------
- paper/development data only
- no broker imports
- no order placement
- no parameter optimization
- no feature selection
- no automatic strategy promotion
- no mutation of historical records

CORE PRINCIPLE
--------------
OBSERVATION -> DECISION -> OUTCOME -> EXPERIENCE

The learner comes later. First we create reliable memory.
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_1_MEMORY_V1";
const LEDGER_DIR = path.resolve(
  process.env.TRADEMIND_LEDGER_DIR || "system-development/data"
);
const LEDGER_FILE = path.join(LEDGER_DIR, "experience-ledger.jsonl");

const ALLOWED_ACTIONS = new Set([
  "NO_TRADE",
  "PAPER_LONG",
  "PAPER_SHORT"
]);

const ALLOWED_MARKET_MODES = new Set([
  "UNKNOWN",
  "BULL",
  "BEAR",
  "TRANSITION",
  "RANGE"
]);

function fail(message) {
  throw new Error(message);
}

function finiteNumber(value, name) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    fail(`${name} must be finite when provided`);
  }
  return n;
}

function cleanString(value, name, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) fail(`${name} is required`);
    return null;
  }
  return String(value);
}

function ensureLedger() {
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  if (!fs.existsSync(LEDGER_FILE)) {
    fs.writeFileSync(LEDGER_FILE, "", "utf8");
  }
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function validateExperience(input) {
  if (!input || typeof input !== "object") {
    fail("Experience must be an object");
  }

  const action = cleanString(input.action, "action", true);

  if (!ALLOWED_ACTIONS.has(action)) {
    fail(`Unsupported action: ${action}`);
  }

  const marketMode =
    cleanString(input.marketMode, "marketMode") || "UNKNOWN";

  if (!ALLOWED_MARKET_MODES.has(marketMode)) {
    fail(`Unsupported marketMode: ${marketMode}`);
  }

  const timestamp = cleanString(input.timestamp, "timestamp", true);

  if (Number.isNaN(Date.parse(timestamp))) {
    fail("timestamp must be a valid ISO timestamp");
  }

  return {
    schemaVersion: VERSION,
    experienceId:
      cleanString(input.experienceId, "experienceId") ||
      crypto.randomUUID(),

    timestamp,

    instrument: cleanString(
      input.instrument,
      "instrument",
      true
    ),

    timeframe: cleanString(
      input.timeframe,
      "timeframe",
      true
    ),

    marketMode,

    observation: {
      close: finiteNumber(
        input.observation?.close,
        "observation.close"
      ),
      return1: finiteNumber(
        input.observation?.return1,
        "observation.return1"
      ),
      atr: finiteNumber(
        input.observation?.atr,
        "observation.atr"
      ),
      rsi: finiteNumber(
        input.observation?.rsi,
        "observation.rsi"
      ),
      ema9: finiteNumber(
        input.observation?.ema9,
        "observation.ema9"
      ),
      ema21: finiteNumber(
        input.observation?.ema21,
        "observation.ema21"
      ),
      vwap: finiteNumber(
        input.observation?.vwap,
        "observation.vwap"
      )
    },

    context: {
      session: cleanString(
        input.context?.session,
        "context.session"
      ),
      direction: cleanString(
        input.context?.direction,
        "context.direction"
      ),
      transitionState: cleanString(
        input.context?.transitionState,
        "context.transitionState"
      ),
      source: cleanString(
        input.context?.source,
        "context.source"
      )
    },

    decision: {
      action,
      confidence: finiteNumber(
        input.confidence,
        "confidence"
      ),
      rationale: cleanString(
        input.rationale,
        "rationale"
      )
    },

    outcome:
      input.outcome == null
        ? null
        : {
            status: cleanString(
              input.outcome.status,
              "outcome.status",
              true
            ),
            exitTimestamp: cleanString(
              input.outcome.exitTimestamp,
              "outcome.exitTimestamp"
            ),
            priceChange: finiteNumber(
              input.outcome.priceChange,
              "outcome.priceChange"
            ),
            normalizedReturn: finiteNumber(
              input.outcome.normalizedReturn,
              "outcome.normalizedReturn"
            ),
            barsHeld: finiteNumber(
              input.outcome.barsHeld,
              "outcome.barsHeld"
            ),
            maxFavorableExcursion: finiteNumber(
              input.outcome.maxFavorableExcursion,
              "outcome.maxFavorableExcursion"
            ),
            maxAdverseExcursion: finiteNumber(
              input.outcome.maxAdverseExcursion,
              "outcome.maxAdverseExcursion"
            )
          }
  };
}

function appendExperience(input) {
  ensureLedger();

  const experience = validateExperience(input);
  const payload = JSON.stringify(experience);

  const record = {
    ...experience,
    recordHash: sha256(payload)
  };

  fs.appendFileSync(
    LEDGER_FILE,
    JSON.stringify(record) + "\n",
    "utf8"
  );

  return record;
}

function readLedger() {
  ensureLedger();

  const lines = fs
    .readFileSync(LEDGER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  return lines.map((line, index) => {
    let record;

    try {
      record = JSON.parse(line);
    } catch {
      fail(`Ledger line ${index + 1} is invalid JSON`);
    }

    if (!record.recordHash) {
      fail(`Ledger line ${index + 1} has no recordHash`);
    }

    const { recordHash, ...payload } = record;

    if (sha256(JSON.stringify(payload)) !== recordHash) {
      fail(
        `Ledger integrity failure at line ${index + 1}`
      );
    }

    return record;
  });
}

function selfTest() {
  ensureLedger();

  const before = readLedger().length;

  const sample = appendExperience({
    timestamp: new Date().toISOString(),
    instrument: "NIFTY 50",
    timeframe: "5m",
    marketMode: "UNKNOWN",

    observation: {
      close: 0,
      return1: 0,
      atr: 0,
      rsi: 50,
      ema9: 0,
      ema21: 0,
      vwap: 0
    },

    context: {
      session: "DEVELOPMENT",
      direction: "UNKNOWN",
      transitionState: "UNKNOWN",
      source: "SYSTEM_PHASE_1_SELF_TEST"
    },

    action: "NO_TRADE",
    confidence: 0,
    rationale: "Schema and ledger integrity self-test",

    outcome: {
      status: "UNRESOLVED",
      priceChange: 0,
      normalizedReturn: 0,
      barsHeld: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0
    }
  });

  const after = readLedger().length;

  if (after !== before + 1) {
    fail("Ledger append self-test failed");
  }

  return {
    version: VERSION,
    status: "SYSTEM_PHASE_1_MEMORY_READY",
    ledgerFile: LEDGER_FILE,
    recordsBefore: before,
    recordsAfter: after,
    integrityVerified: true,
    realTradingEnabled: false,
    learnerEnabled: false,
    strategyPromotionEnabled: false,
    sampleExperienceId: sample.experienceId
  };
}

if (require.main === module) {
  console.log(
    JSON.stringify(selfTest(), null, 2)
  );
}

module.exports = {
  VERSION,
  LEDGER_FILE,
  validateExperience,
  appendExperience,
  readLedger,
  selfTest
};

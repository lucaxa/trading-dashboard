/*
===========================================================
 TradeMind Pro
 SYSTEM DEVELOPMENT — PHASE 2
 PAPER EXPERIENCE CAPTURE
===========================================================

PURPOSE
-------
Phase 1 created durable learning memory.

Phase 2 creates the controlled paper-experience layer that
turns an observation + paper decision into a resolved experience
record.

PIPELINE
--------
INPUT OBSERVATION
      ↓
PAPER DECISION
      ↓
FUTURE CANDLE OUTCOME
      ↓
RESOLVED EXPERIENCE
      ↓
PHASE 1 MEMORY LEDGER

IMPORTANT
---------
This module does NOT:
- place real orders
- call a broker
- optimize parameters
- select features
- change strategy rules
- promote a strategy
- learn from the same outcome while it is being resolved

It only captures and resolves paper experiences.

INPUT SCHEMA
------------
Each row must contain:

{
  timestamp,
  instrument,
  timeframe,
  candle: { o, h, l, c },
  indicators: {...},
  marketMode,
  decision: {
    action: "NO_TRADE" | "PAPER_LONG" | "PAPER_SHORT",
    confidence,
    rationale
  }
}

OUTCOME POLICY
--------------
For a paper position:

PAPER_LONG:
  next N candles are inspected.
  Exit is at the final observation close.

PAPER_SHORT:
  same, but return is inverted.

NO_TRADE:
  no position is opened.
  It is recorded as an observation/decision experience.

This is intentionally simple in Phase 2.
The purpose is reliable experience capture, not strategy tuning.

===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_2_PAPER_CAPTURE_V1";
const HOLD_BARS = 3;

const MEMORY_MODULE = path.resolve(
  __dirname,
  "phase-1-learning-memory.js"
);

const OUTPUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE2_DIR ||
    "system-development/data"
);

const CAPTURE_FILE = path.join(
  OUTPUT_DIR,
  "paper-experience-capture.jsonl"
);

const ACTIONS = new Set([
  "NO_TRADE",
  "PAPER_LONG",
  "PAPER_SHORT"
]);

function fail(message) {
  throw new Error(message);
}

function finite(value, name) {
  if (value === null || value === undefined) {
    return null;
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    fail(`${name} must be finite`);
  }

  return n;
}

function stringValue(value, name, required = false) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    if (required) {
      fail(`${name} is required`);
    }

    return null;
  }

  return String(value);
}

function ensureOutput() {
  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
  });

  if (!fs.existsSync(CAPTURE_FILE)) {
    fs.writeFileSync(
      CAPTURE_FILE,
      "",
      "utf8"
    );
  }
}

function candleClose(row, name) {
  const close = Number(row?.c);

  if (!Number.isFinite(close)) {
    fail(`${name}.c must be finite`);
  }

  return close;
}

function validateInputRow(row, index) {
  if (!row || typeof row !== "object") {
    fail(`Input row ${index} is invalid`);
  }

  const timestamp = stringValue(
    row.timestamp,
    `row ${index}.timestamp`,
    true
  );

  if (Number.isNaN(Date.parse(timestamp))) {
    fail(`Input row ${index}.timestamp is invalid`);
  }

  const instrument = stringValue(
    row.instrument,
    `row ${index}.instrument`,
    true
  );

  const timeframe = stringValue(
    row.timeframe,
    `row ${index}.timeframe`,
    true
  );

  if (!row.candle) {
    fail(`Input row ${index}.candle is required`);
  }

  candleClose(
    row.candle,
    `row ${index}.candle`
  );

  const action = stringValue(
    row.decision?.action,
    `row ${index}.decision.action`,
    true
  );

  if (!ACTIONS.has(action)) {
    fail(
      `Input row ${index} has unsupported action ${action}`
    );
  }

  return {
    ...row,
    timestamp,
    instrument,
    timeframe,
    decision: {
      action,
      confidence: finite(
        row.decision?.confidence,
        `row ${index}.decision.confidence`
      ),
      rationale: stringValue(
        row.decision?.rationale,
        `row ${index}.decision.rationale`
      )
    }
  };
}

function normalizeAction(action) {
  return action === "PAPER_LONG"
    ? "PAPER_LONG"
    : action === "PAPER_SHORT"
      ? "PAPER_SHORT"
      : "NO_TRADE";
}

function calculateOutcome(
  entryRow,
  futureRows
) {
  const action = normalizeAction(
    entryRow.decision.action
  );

  const entryPrice = candleClose(
    entryRow.candle,
    "entry candle"
  );

  if (action === "NO_TRADE") {
    return {
      status: "NO_TRADE",
      exitTimestamp: null,
      priceChange: 0,
      normalizedReturn: 0,
      barsHeld: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0
    };
  }

  if (futureRows.length === 0) {
    return {
      status: "UNRESOLVED",
      exitTimestamp: null,
      priceChange: null,
      normalizedReturn: null,
      barsHeld: 0,
      maxFavorableExcursion: null,
      maxAdverseExcursion: null
    };
  }

  const heldRows = futureRows.slice(
    0,
    HOLD_BARS
  );

  const exitRow =
    heldRows[heldRows.length - 1];

  const exitPrice = candleClose(
    exitRow.candle,
    "exit candle"
  );

  const rawChange =
    exitPrice - entryPrice;

  const signedChange =
    action === "PAPER_LONG"
      ? rawChange
      : -rawChange;

  const normalizedReturn =
    entryPrice === 0
      ? 0
      : signedChange / entryPrice;

  let mfe = 0;
  let mae = 0;

  for (const row of heldRows) {
    const high = finite(
      row.candle?.h,
      "future candle high"
    );

    const low = finite(
      row.candle?.l,
      "future candle low"
    );

    if (
      high !== null &&
      low !== null
    ) {
      const favorable =
        action === "PAPER_LONG"
          ? (high - entryPrice) / entryPrice
          : (entryPrice - low) / entryPrice;

      const adverse =
        action === "PAPER_LONG"
          ? (low - entryPrice) / entryPrice
          : (entryPrice - high) / entryPrice;

      mfe = Math.max(mfe, favorable);
      mae = Math.min(mae, adverse);
    }
  }

  return {
    status:
      signedChange > 0
        ? "WIN"
        : signedChange < 0
          ? "LOSS"
          : "FLAT",

    exitTimestamp:
      exitRow.timestamp,

    priceChange:
      signedChange,

    normalizedReturn,

    barsHeld:
      heldRows.length,

    maxFavorableExcursion:
      mfe,

    maxAdverseExcursion:
      mae
  };
}

function makeExperience(
  row,
  outcome
) {
  return {
    timestamp: row.timestamp,
    instrument: row.instrument,
    timeframe: row.timeframe,
    marketMode:
      stringValue(
        row.marketMode,
        "marketMode"
      ) || "UNKNOWN",

    observation: {
      close: candleClose(
        row.candle,
        "observation candle"
      ),
      return1: finite(
        row.observation?.return1,
        "observation.return1"
      ),
      atr: finite(
        row.indicators?.atr,
        "indicators.atr"
      ),
      rsi: finite(
        row.indicators?.rsi14,
        "indicators.rsi14"
      ),
      ema9: finite(
        row.indicators?.ema9,
        "indicators.ema9"
      ),
      ema21: finite(
        row.indicators?.ema21,
        "indicators.ema21"
      ),
      vwap: finite(
        row.indicators?.vwap,
        "indicators.vwap"
      )
    },

    context: {
      session:
        stringValue(
          row.context?.session,
          "context.session"
        ) || "PAPER",

      direction:
        stringValue(
          row.context?.direction,
          "context.direction"
        ),

      transitionState:
        stringValue(
          row.context?.transitionState,
          "context.transitionState"
        ),

      source:
        stringValue(
          row.context?.source,
          "context.source"
        ) || "SYSTEM_PHASE_2"
    },

    decision: {
      action:
        row.decision.action,
      confidence:
        row.decision.confidence,
      rationale:
        row.decision.rationale
    },

    outcome
  };
}

function appendCapture(record) {
  ensureOutput();

  const line = JSON.stringify(record);

  const recordWithHash = {
    ...record,
    captureId:
      crypto.randomUUID(),
    captureHash:
      crypto
        .createHash("sha256")
        .update(line, "utf8")
        .digest("hex")
  };

  fs.appendFileSync(
    CAPTURE_FILE,
    JSON.stringify(recordWithHash) + "\n",
    "utf8"
  );

  return recordWithHash;
}

function runCapture(rows) {
  if (!Array.isArray(rows)) {
    fail("Phase 2 input must be an array");
  }

  if (rows.length < HOLD_BARS + 1) {
    fail(
      `Phase 2 requires at least ${
        HOLD_BARS + 1
      } rows`
    );
  }

  const validated =
    rows.map(validateInputRow);

  const results = [];

  for (
    let i = 0;
    i < validated.length;
    i++
  ) {
    const row = validated[i];

    const futureRows =
      validated.slice(
        i + 1,
        i + 1 + HOLD_BARS
      );

    const outcome =
      calculateOutcome(
        row,
        futureRows
      );

    const experience =
      makeExperience(
        row,
        outcome
      );

    results.push(
      appendCapture(experience)
    );
  }

  return results;
}

function syntheticFixture() {
  const base = 25000;

  const closes = [
    base,
    base + 10,
    base + 25,
    base + 15,
    base + 40,
    base + 30,
    base + 50
  ];

  return closes.map(
    (close, index) => ({
      timestamp:
        new Date(
          Date.UTC(
            2026,
            0,
            1,
            9,
            15 + index * 5
          )
        ).toISOString(),

      instrument:
        "NIFTY 50",

      timeframe:
        "5m",

      candle: {
        o: close - 5,
        h: close + 10,
        l: close - 10,
        c: close
      },

      indicators: {
        atr: 20,
        rsi14: 55,
        ema9: close + 2,
        ema21: close,
        vwap: close - 3
      },

      marketMode:
        "UNKNOWN",

      context: {
        session: "DEVELOPMENT",
        direction: "UNKNOWN",
        transitionState: "UNKNOWN",
        source: "PHASE_2_SELF_TEST"
      },

      decision: {
        action:
          index === 0
            ? "PAPER_LONG"
            : "NO_TRADE",

        confidence:
          index === 0
            ? 0.5
            : 0,

        rationale:
          "Controlled Phase 2 self-test"
      }
    })
  );
}

function selfTest() {
  ensureOutput();

  const fixture =
    syntheticFixture();

  const before =
    fs.readFileSync(
      CAPTURE_FILE,
      "utf8"
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .length;

  const results =
    runCapture(fixture);

  if (results.length !== fixture.length) {
    fail(
      "Phase 2 capture count mismatch"
    );
  }

  const lines =
    fs.readFileSync(
      CAPTURE_FILE,
      "utf8"
    )
      .split(/\r?\n/)
      .filter(Boolean);

  if (lines.length <= before) {
    fail(
      "Phase 2 did not append captures"
    );
  }

  const parsed =
    lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        fail(
          `Invalid JSON in capture line ${
            index + 1
          }`
        );
      }
    });

  for (const row of parsed) {
    if (!row.captureId) {
      fail("Capture missing captureId");
    }

    if (!row.captureHash) {
      fail("Capture missing captureHash");
    }

    if (!row.instrument) {
      fail("Capture missing instrument");
    }

    if (!row.decision?.action) {
      fail("Capture missing decision action");
    }

    if (!row.outcome?.status) {
      fail("Capture missing outcome status");
    }
  }

  return {
    version: VERSION,
    status:
      "SYSTEM_PHASE_2_PAPER_CAPTURE_READY",

    fixtureRows:
      fixture.length,

    capturesCreated:
      results.length,

    captureFile:
      CAPTURE_FILE,

    holdBars:
      HOLD_BARS,

    realTradingEnabled:
      false,

    brokerIntegrationEnabled:
      false,

    learnerEnabled:
      false,

    strategyPromotionEnabled:
      false
  };
}

if (require.main === module) {
  console.log(
    JSON.stringify(
      selfTest(),
      null,
      2
    )
  );
}

module.exports = {
  VERSION,
  HOLD_BARS,
  validateInputRow,
  calculateOutcome,
  runCapture,
  selfTest
};

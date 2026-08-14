/*
===========================================================
 TradeMind Pro
 SYSTEM PHASE 10 — BOUNDED PAPER EXPERIENCE ACCUMULATION
 V2 — CLEAN REPLACEMENT FILE
===========================================================

Purpose
-------
Capture bounded paper experience from the frozen Phase 8
candidate without changing the strategy or enabling trading.

This version fixes the Phase 10 failure modes observed in CI:

1. Does not shadow Node's global `process`.
2. Rejects placeholder timestamps clearly.
3. Validates complete OHLC data.
4. Requires chronological observations.
5. Blocks replay against the persisted checkpoint.
6. Preserves Phase 7 NOT_VALIDATED.
7. Preserves PAPER_ONLY / no-broker / no-learning boundaries.
8. Supports an EXPLICIT controlled smoke mode for CI.
9. Does not silently convert fake data into LIVE_MARKET data.

Normal mode:
  PHASE10_INPUT_FILE =
  system-development/data/phase-10-paper-observations.json

Controlled CI smoke mode:
  PHASE10_CONTROLLED_SMOKE=true

In controlled smoke mode, the input file is ignored and a
small deterministic test stream is generated in memory.

IMPORTANT:
Controlled smoke mode is a PIPELINE TEST only. It is not
market evidence and must never be counted as genuine live
market experience.
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION =
  "SYSTEM_PHASE_10_BOUNDED_PAPER_EXPERIENCE_ACCUMULATION_V2";

const MODEL_VERSION =
  "SYSTEM_PHASE_8_BOUNDED_PAPER_TRADING_MODEL_V1";

const CANDIDATE_ID = "CANDIDATE_BASELINE_V1";

const MODEL_FILE =
  process.env.PHASE8_MODEL_FILE ||
  "system-development/data/phase-8-paper-trading-model.json";

const INPUT_FILE =
  process.env.PHASE10_INPUT_FILE ||
  "system-development/data/phase-10-paper-observations.json";

const OUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE10_DIR ||
    "system-development/data"
);

const CHECK_DIR = path.resolve(
  process.env.TRADEMIND_PHASE10_CHECKPOINT_DIR ||
    "system-development/checkpoints"
);

const OUT_FILE = path.join(
  OUT_DIR,
  "phase-10-paper-experience.json"
);

const LEDGER_FILE = path.join(
  OUT_DIR,
  "phase-10-paper-experience-ledger.jsonl"
);

const STATE_FILE = path.join(
  CHECK_DIR,
  "phase-10-paper-position-state.json"
);

const CHECK_FILE = path.join(
  CHECK_DIR,
  "phase-10-paper-experience-checkpoint.json"
);

const MAX_TRADES_PER_SESSION = 5;
const MAX_OPEN_POSITIONS = 1;
const MAX_DAILY_LOSS_PCT = 1.0;
const STARTING_CAPITAL = 100000;

const CONTROLLED_SMOKE =
  String(process.env.PHASE10_CONTROLLED_SMOKE || "")
    .toLowerCase() === "true";

function fail(message) {
  throw new Error(message);
}

function readJson(file, label) {
  if (!fs.existsSync(file)) {
    fail(`${label} not found: ${file}`);
  }

  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch (error) {
    fail(`Invalid ${label}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {
    recursive: true
  });

  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2) + "\n",
    "utf8"
  );
}

function finite(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    fail(`${name} must be finite`);
  }

  return number;
}

function hash(text) {
  return crypto
    .createHash("sha256")
    .update(text, "utf8")
    .digest("hex");
}

function validateModel(model) {
  if (model.version !== MODEL_VERSION) {
    fail("Unexpected Phase 8 model version");
  }

  if (model.status !== "PAPER_MODEL_CONSTRUCTED") {
    fail("Phase 8 model is not constructed");
  }

  if (model.candidate?.id !== CANDIDATE_ID) {
    fail("Unexpected Phase 8 candidate ID");
  }

  if (model.candidate?.oosStatus !== "NOT_VALIDATED") {
    fail(
      "Phase 7 NOT_VALIDATED status was not preserved"
    );
  }

  if (
    model.paperContract?.executionMode !==
    "PAPER_ONLY"
  ) {
    fail("Paper-only execution boundary failed");
  }

  if (model.paperContract?.realTrading !== false) {
    fail("Real-trading boundary failed");
  }

  if (model.paperContract?.brokerOrders !== false) {
    fail("Broker-order boundary failed");
  }

  if (model.learningBoundary?.learnerUpdate !== false) {
    fail("Learner-update boundary failed");
  }

  if (
    model.learningBoundary?.strategyMutation !== false
  ) {
    fail("Strategy-mutation boundary failed");
  }

  if (model.learningBoundary?.promotion !== false) {
    fail("Promotion boundary failed");
  }
}

function controlledSmokeRows() {
  return [
    {
      source: "CONTROLLED_TEST",
      timestamp: "2026-08-17T09:15:00+05:30",
      instrument: "NIFTY 50",
      timeframe: "5m",
      candle: {
        o: 25000,
        h: 25005,
        l: 24995,
        c: 25000
      },
      decision: {
        action: "NO_TRADE",
        confidence: 0,
        rationale: "CONTROLLED_PHASE_10_SMOKE"
      }
    },
    {
      source: "CONTROLLED_TEST",
      timestamp: "2026-08-17T09:20:00+05:30",
      instrument: "NIFTY 50",
      timeframe: "5m",
      candle: {
        o: 25000,
        h: 25015,
        l: 24998,
        c: 25010
      },
      decision: {
        action: "ENTER_LONG",
        confidence: 0.5,
        rationale: "CONTROLLED_PHASE_10_SMOKE"
      }
    },
    {
      source: "CONTROLLED_TEST",
      timestamp: "2026-08-17T09:25:00+05:30",
      instrument: "NIFTY 50",
      timeframe: "5m",
      candle: {
        o: 25010,
        h: 25025,
        l: 25005,
        c: 25020
      },
      decision: {
        action: "EXIT",
        confidence: 0.5,
        rationale: "CONTROLLED_PHASE_10_SMOKE"
      }
    }
  ];
}

function validateTimestamp(value, index) {
  const timestamp = String(value || "");

  if (!timestamp) {
    fail(`Observation ${index} timestamp is missing`);
  }

  if (
    timestamp.includes("REPLACE_WITH") ||
    timestamp.includes("YYYY") ||
    timestamp.includes("TIMESTAMP")
  ) {
    fail(
      `Observation ${index} contains a placeholder timestamp`
    );
  }

  const milliseconds = Date.parse(timestamp);

  if (!Number.isFinite(milliseconds)) {
    fail(`Observation ${index} timestamp is invalid`);
  }

  return timestamp;
}

function validateInput(rows, sourceMode) {
  if (!Array.isArray(rows) || rows.length === 0) {
    fail("Phase 10 input must be a non-empty array");
  }

  const allowedActions = new Set([
    "NO_TRADE",
    "ENTER_LONG",
    "ENTER_SHORT",
    "EXIT"
  ]);

  const normalized = rows.map((row, index) => {
    if (!row || typeof row !== "object") {
      fail(`Observation ${index} is invalid`);
    }

    if (sourceMode === "LIVE_MARKET") {
      if (row.source !== "LIVE_MARKET") {
        fail(
          `Observation ${index} must have source LIVE_MARKET`
        );
      }
    } else {
      if (row.source !== "CONTROLLED_TEST") {
        fail(
          `Observation ${index} must have source CONTROLLED_TEST`
        );
      }
    }

    const timestamp = validateTimestamp(
      row.timestamp,
      index
    );

    if (String(row.instrument) !== "NIFTY 50") {
      fail(
        `Observation ${index} instrument must be NIFTY 50`
      );
    }

    if (String(row.timeframe) !== "5m") {
      fail(
        `Observation ${index} timeframe must be 5m`
      );
    }

    if (!row.candle || typeof row.candle !== "object") {
      fail(
        `Observation ${index} candle is required`
      );
    }

    const open = finite(
      row.candle.o,
      `Observation ${index} open`
    );

    const high = finite(
      row.candle.h,
      `Observation ${index} high`
    );

    const low = finite(
      row.candle.l,
      `Observation ${index} low`
    );

    const close = finite(
      row.candle.c,
      `Observation ${index} close`
    );

    if (high < Math.max(open, close)) {
      fail(
        `Observation ${index} high is below open/close`
      );
    }

    if (low > Math.min(open, close)) {
      fail(
        `Observation ${index} low is above open/close`
      );
    }

    if (low > high) {
      fail(
        `Observation ${index} low is above high`
      );
    }

    const action = String(
      row.decision?.action || ""
    );

    if (!allowedActions.has(action)) {
      fail(
        `Observation ${index} unsupported action ${action}`
      );
    }

    const confidence =
      row.decision?.confidence == null
        ? null
        : finite(
            row.decision.confidence,
            `Observation ${index} confidence`
          );

    if (
      confidence !== null &&
      (confidence < 0 || confidence > 1)
    ) {
      fail(
        `Observation ${index} confidence must be between 0 and 1`
      );
    }

    return {
      source: row.source,
      timestamp,
      instrument: "NIFTY 50",
      timeframe: "5m",
      candle: {
        o: open,
        h: high,
        l: low,
        c: close
      },
      close,
      decision: {
        action,
        confidence,
        rationale:
          row.decision?.rationale == null
            ? null
            : String(row.decision.rationale)
      }
    };
  });

  for (let index = 1; index < normalized.length; index++) {
    const previous = Date.parse(
      normalized[index - 1].timestamp
    );

    const current = Date.parse(
      normalized[index].timestamp
    );

    if (current <= previous) {
      fail(
        "Observations must be strictly chronological"
      );
    }
  }

  return normalized;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      version:
        "SYSTEM_PHASE_10_POSITION_STATE_V2",
      position: "FLAT",
      entryPrice: null,
      entryTimestamp: null,
      tradeId: null,
      sessionDate: null,
      sessionTrades: 0,
      sessionPnl: 0,
      cumulativeClosedTrades: 0,
      cumulativeWins: 0,
      cumulativeLosses: 0,
      cumulativeGrossPnl: 0,
      lastTimestamp: null,
      lastObservationHash: null
    };
  }

  const state = readJson(
    STATE_FILE,
    "Phase 10 position state"
  );

  if (
    state.version !==
    "SYSTEM_PHASE_10_POSITION_STATE_V2"
  ) {
    fail(
      "Unexpected Phase 10 position-state version"
    );
  }

  if (
    !["FLAT", "LONG", "SHORT"].includes(
      state.position
    )
  ) {
    fail("Invalid Phase 10 position state");
  }

  return state;
}

function loadLedger() {
  if (!fs.existsSync(LEDGER_FILE)) {
    return [];
  }

  const text = fs.readFileSync(
    LEDGER_FILE,
    "utf8"
  ).trim();

  if (!text) {
    return [];
  }

  return text.split(/\r?\n/).map(
    (line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(
          `Invalid Phase 10 ledger row ${index}`
        );
      }
    }
  );
}

function processObservations(
  rows,
  state,
  sourceMode
) {
  const newLedger = [];

  let tradeSequence =
    state.cumulativeClosedTrades + 1;

  for (const row of rows) {
    const rowMilliseconds = Date.parse(
      row.timestamp
    );

    if (
      state.lastTimestamp &&
      rowMilliseconds <=
        Date.parse(state.lastTimestamp)
    ) {
      fail(
        `Observation is not newer than checkpoint: ${row.timestamp}`
      );
    }

    const date = row.timestamp.slice(0, 10);

    if (state.sessionDate !== date) {
      state.sessionDate = date;
      state.sessionTrades = 0;
      state.sessionPnl = 0;
    }

    const action = row.decision.action;

    if (
      action === "ENTER_LONG" ||
      action === "ENTER_SHORT"
    ) {
      if (state.position !== "FLAT") {
        fail(
          `Entry received while position is ${state.position}`
        );
      }

      if (
        state.sessionTrades >=
        MAX_TRADES_PER_SESSION
      ) {
        fail(
          "Maximum paper trades per session exceeded"
        );
      }

      const dailyLossLimit =
        -STARTING_CAPITAL *
        (MAX_DAILY_LOSS_PCT / 100);

      if (state.sessionPnl <= dailyLossLimit) {
        fail("Maximum daily paper loss reached");
      }

      state.position =
        action === "ENTER_LONG"
          ? "LONG"
          : "SHORT";

      state.entryPrice = row.close;
      state.entryTimestamp = row.timestamp;
      state.tradeId =
        `P10-${date}-${String(tradeSequence).padStart(4, "0")}`;

      state.sessionTrades += 1;
      tradeSequence += 1;

      newLedger.push({
        type: "ENTRY",
        source: sourceMode,
        paperTradeId: state.tradeId,
        timestamp: row.timestamp,
        instrument: "NIFTY 50",
        timeframe: "5m",
        candidateId: CANDIDATE_ID,
        action,
        entryPrice: row.close,
        exitPrice: null,
        quantity: 1,
        status: "OPEN",
        grossPnl: 0,
        executionMode: "PAPER_ONLY",
        realOrderSent: false,
        brokerOrderSent: false,
        confidence: row.decision.confidence,
        rationale: row.decision.rationale
      });

      state.lastTimestamp = row.timestamp;
      continue;
    }

    if (action === "EXIT") {
      if (state.position === "FLAT") {
        fail(
          "EXIT received while paper position is flat"
        );
      }

      const pnl =
        state.position === "LONG"
          ? row.close - state.entryPrice
          : state.entryPrice - row.close;

      state.sessionPnl += pnl;
      state.cumulativeGrossPnl += pnl;
      state.cumulativeClosedTrades += 1;

      if (pnl > 0) {
        state.cumulativeWins += 1;
      }

      if (pnl < 0) {
        state.cumulativeLosses += 1;
      }

      newLedger.push({
        type: "EXIT",
        source: sourceMode,
        paperTradeId: state.tradeId,
        timestamp: row.timestamp,
        instrument: "NIFTY 50",
        timeframe: "5m",
        candidateId: CANDIDATE_ID,
        action: "EXIT",
        entryPrice: state.entryPrice,
        exitPrice: row.close,
        quantity: 1,
        status: "CLOSED",
        grossPnl: pnl,
        executionMode: "PAPER_ONLY",
        realOrderSent: false,
        brokerOrderSent: false,
        confidence: row.decision.confidence,
        rationale: row.decision.rationale
      });

      state.position = "FLAT";
      state.entryPrice = null;
      state.entryTimestamp = null;
      state.tradeId = null;
      state.lastTimestamp = row.timestamp;

      continue;
    }

    newLedger.push({
      type: "OBSERVATION",
      source: sourceMode,
      paperTradeId: null,
      timestamp: row.timestamp,
      instrument: "NIFTY 50",
      timeframe: "5m",
      candidateId: CANDIDATE_ID,
      action: "NO_TRADE",
      close: row.close,
      status: "OBSERVED",
      grossPnl: 0,
      executionMode: "PAPER_ONLY",
      realOrderSent: false,
      brokerOrderSent: false,
      confidence: row.decision.confidence,
      rationale: row.decision.rationale
    });

    state.lastTimestamp = row.timestamp;
  }

  return {
    state,
    newLedger
  };
}

function buildResult(
  rows,
  newLedger,
  allLedger,
  state,
  sourceMode
) {
  const allObservations =
    allLedger.filter(
      item => item.type === "OBSERVATION"
    );

  const allEntries =
    allLedger.filter(
      item => item.type === "ENTRY"
    );

  const allExits =
    allLedger.filter(
      item => item.type === "EXIT"
    );

  const newEntries =
    newLedger.filter(
      item => item.type === "ENTRY"
    );

  const newExits =
    newLedger.filter(
      item => item.type === "EXIT"
    );

  return {
    phase: "SYSTEM_DEVELOPMENT_PHASE_10",
    component:
      "BOUNDED_PAPER_EXPERIENCE_ACCUMULATION",
    version: VERSION,
    status:
      sourceMode === "CONTROLLED_TEST"
        ? "CONTROLLED_PIPELINE_TEST_CAPTURED"
        : "PAPER_EXPERIENCE_CAPTURED",

    candidate: {
      id: CANDIDATE_ID,
      sourcePhase: "SYSTEM_PHASE_6",
      oosStatus: "NOT_VALIDATED",
      strategyModification: false
    },

    source: {
      mode: sourceMode,
      genuineMarketEvidence:
        sourceMode === "LIVE_MARKET",
      controlledSmoke:
        sourceMode === "CONTROLLED_TEST",
      inputObservations: rows.length
    },

    capture: {
      newObservations: rows.length,
      newEntries: newEntries.length,
      newExits: newExits.length,
      totalObservations:
        allObservations.length,
      totalEntries: allEntries.length,
      totalExits: allExits.length,
      cumulativeClosedTrades:
        state.cumulativeClosedTrades,
      cumulativeWins: state.cumulativeWins,
      cumulativeLosses: state.cumulativeLosses,
      cumulativeGrossPnl:
        state.cumulativeGrossPnl,
      openPosition: state.position
    },

    sourceBoundary: {
      sourceRequired: "LIVE_MARKET",
      controlledTestExplicit:
        sourceMode === "CONTROLLED_TEST",
      instrument: "NIFTY 50",
      timeframe: "5m",
      completedCandleRequired: true,
      chronological: true,
      placeholderTimestampRejected: true,
      duplicateReplayBlocked: true
    },

    safety: {
      executionMode: "PAPER_ONLY",
      realTrading: false,
      brokerOrders: false,
      strategyModification: false,
      parameterOptimization: false,
      featureSelection: false,
      learnerUpdates: false,
      modelWeightUpdate: false,
      promotion: false,
      maxOpenPositions:
        MAX_OPEN_POSITIONS,
      maxTradesPerSession:
        MAX_TRADES_PER_SESSION,
      maxDailyLossPct:
        MAX_DAILY_LOSS_PCT
    },

    learning: {
      experienceCapture: true,
      learnerUpdate: false,
      modelWeightUpdate: false,
      strategyMutation: false,
      promotion: false
    },

    nextStage:
      "ACCUMULATE_BOUNDED_FORWARD_PAPER_EXPERIENCE_BEFORE_ANY_LEARNING_UPDATE"
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, {
    recursive: true
  });

  fs.mkdirSync(CHECK_DIR, {
    recursive: true
  });

  const model = readJson(
    MODEL_FILE,
    "Phase 8 model"
  );

  validateModel(model);

  const sourceMode = CONTROLLED_SMOKE
    ? "CONTROLLED_TEST"
    : "LIVE_MARKET";

  const rawRows = CONTROLLED_SMOKE
    ? controlledSmokeRows()
    : readJson(
        INPUT_FILE,
        "Phase 10 observations"
      );

  const rows = validateInput(
    rawRows,
    sourceMode
  );

  const state = loadState();

  const existingLedger = loadLedger();

  const processed =
    processObservations(
      rows,
      state,
      sourceMode
    );

  const newLedger =
    processed.newLedger;

  const nextState =
    processed.state;

  let allLedger;

  if (sourceMode === "CONTROLLED_TEST") {
    allLedger = existingLedger;
  } else {
    allLedger =
      existingLedger.concat(newLedger);

    if (newLedger.length > 0) {
      fs.appendFileSync(
        LEDGER_FILE,
        newLedger
          .map(item =>
            JSON.stringify(item)
          )
          .join("\n") + "\n",
        "utf8"
      );
    }

    writeJson(
      STATE_FILE,
      nextState
    );
  }

  const result = buildResult(
    rows,
    newLedger,
    allLedger,
    nextState,
    sourceMode
  );

  const resultText =
    JSON.stringify(
      result,
      null,
      2
    ) + "\n";

  result.integrity = {
    sha256: hash(resultText),
    bytes: Buffer.byteLength(
      resultText,
      "utf8"
    )
  };

  writeJson(
    OUT_FILE,
    result
  );

  writeJson(
    CHECK_FILE,
    result
  );

  console.log(
    "=== TRADEMIND PRO PHASE 10 ==="
  );

  console.log(
    "VERSION:",
    VERSION
  );

  console.log(
    "STATUS:",
    result.status
  );

  console.log(
    "SOURCE MODE:",
    sourceMode
  );

  console.log(
    "NEW OBSERVATIONS:",
    result.capture.newObservations
  );

  console.log(
    "NEW ENTRIES:",
    result.capture.newEntries
  );

  console.log(
    "NEW EXITS:",
    result.capture.newExits
  );

  console.log(
    "CLOSED TRADES:",
    result.capture.cumulativeClosedTrades
  );

  console.log(
    "CUMULATIVE GROSS PNL:",
    result.capture.cumulativeGrossPnl
  );

  console.log(
    "OPEN POSITION:",
    result.capture.openPosition
  );

  console.log(
    "PAPER ONLY:",
    result.safety.executionMode ===
      "PAPER_ONLY"
  );

  console.log(
    "REAL TRADING:",
    result.safety.realTrading
  );

  console.log(
    "BROKER ORDERS:",
    result.safety.brokerOrders
  );

  console.log(
    "LEARNER UPDATE:",
    result.safety.learnerUpdates
  );

  console.log(
    "PROMOTION:",
    result.safety.promotion
  );

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}

if (require.main === module) {
  main();
}

module.exports = {
  VERSION,
  validateModel,
  validateInput,
  processObservations,
  buildResult,
  controlledSmokeRows,
  main
};

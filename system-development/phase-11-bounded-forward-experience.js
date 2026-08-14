/*
===========================================================
 TradeMind Pro
 SYSTEM PHASE 11 — BOUNDED FORWARD PAPER EXPERIENCE
 V1
===========================================================

PURPOSE
-------
Accumulate genuine forward-market paper experience from the
frozen Phase 8 candidate.

This phase is NOT a research optimizer and NOT a learning phase.

INPUT
-----
system-development/data/phase-11-live-observations.json

Every observation MUST be genuine forward-market data and MUST
carry source = LIVE_MARKET.

CONTROLLED / SYNTHETIC / HISTORICAL rows are rejected.

BOUNDARIES
----------
- Phase 7 remains NOT_VALIDATED.
- Candidate remains CANDIDATE_BASELINE_V1.
- No strategy mutation.
- No parameter optimization.
- No feature selection.
- No learner update.
- No model-weight update.
- No promotion.
- No broker order.
- No real trading.

The phase only records forward paper experience.
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_11_BOUNDED_FORWARD_PAPER_EXPERIENCE_V1";
const MODEL_VERSION = "SYSTEM_PHASE_8_BOUNDED_PAPER_TRADING_MODEL_V1";
const CANDIDATE_ID = "CANDIDATE_BASELINE_V1";

const MODEL_FILE =
  process.env.PHASE8_MODEL_FILE ||
  "system-development/data/phase-8-paper-trading-model.json";

const INPUT_FILE =
  process.env.PHASE11_INPUT_FILE ||
  "system-development/data/phase-11-live-observations.json";

const OUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE11_DIR || "system-development/data"
);

const CHECK_DIR = path.resolve(
  process.env.TRADEMIND_PHASE11_CHECKPOINT_DIR ||
  "system-development/checkpoints"
);

const RESULT_FILE = path.join(
  OUT_DIR,
  "phase-11-forward-experience.json"
);

const LEDGER_FILE = path.join(
  OUT_DIR,
  "phase-11-forward-experience-ledger.jsonl"
);

const STATE_FILE = path.join(
  CHECK_DIR,
  "phase-11-forward-position-state.json"
);

const CHECKPOINT_FILE = path.join(
  CHECK_DIR,
  "phase-11-forward-experience-checkpoint.json"
);

const MAX_OPEN_POSITIONS = 1;
const MAX_TRADES_PER_SESSION = 5;
const MAX_DAILY_LOSS_PCT = 1.0;
const STARTING_CAPITAL = 100000;

function fail(message) {
  throw new Error(message);
}

function readJson(file, label) {
  if (!fs.existsSync(file)) fail(`${label} not found: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Invalid ${label}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function finite(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${name} must be finite`);
  return n;
}

function validateModel(model) {
  if (model.version !== MODEL_VERSION) fail("Unexpected Phase 8 model version");
  if (model.status !== "PAPER_MODEL_CONSTRUCTED") fail("Phase 8 model is not constructed");
  if (model.candidate?.id !== CANDIDATE_ID) fail("Unexpected candidate ID");
  if (model.candidate?.oosStatus !== "NOT_VALIDATED") fail("Phase 7 NOT_VALIDATED was not preserved");
  if (model.paperContract?.executionMode !== "PAPER_ONLY") fail("Phase 8 is not PAPER_ONLY");
  if (model.paperContract?.realTrading !== false) fail("Real trading boundary failed");
  if (model.paperContract?.brokerOrders !== false) fail("Broker order boundary failed");
  if (model.learningBoundary?.learnerUpdate !== false) fail("Learner update boundary failed");
  if (model.learningBoundary?.strategyMutation !== false) fail("Strategy mutation boundary failed");
  if (model.learningBoundary?.promotion !== false) fail("Promotion boundary failed");
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      version: "SYSTEM_PHASE_11_POSITION_STATE_V1",
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

  const state = readJson(STATE_FILE, "Phase 11 position state");
  if (state.version !== "SYSTEM_PHASE_11_POSITION_STATE_V1")
    fail("Unexpected Phase 11 position-state version");
  if (!["FLAT", "LONG", "SHORT"].includes(state.position))
    fail("Invalid Phase 11 position state");
  return state;
}

function loadLedger() {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  const text = fs.readFileSync(LEDGER_FILE, "utf8").trim();
  if (!text) return [];
  return text.split(/\r?\n/).map((line, i) => {
    try { return JSON.parse(line); }
    catch { fail(`Invalid Phase 11 ledger row ${i}`); }
  });
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    fail("Phase 11 requires at least one genuine LIVE_MARKET observation");
  }

  const allowed = new Set(["NO_TRADE", "ENTER_LONG", "ENTER_SHORT", "EXIT"]);

  const normalized = rows.map((row, i) => {
    if (!row || typeof row !== "object") fail(`Observation ${i} is invalid`);
    if (row.source !== "LIVE_MARKET") fail(`Observation ${i} must have source LIVE_MARKET`);
    if (row.synthetic === true) fail(`Observation ${i} is marked synthetic`);
    if (row.historical === true) fail(`Observation ${i} is marked historical`);

    const timestamp = String(row.timestamp || "");
    if (!timestamp || timestamp.includes("REPLACE_WITH") ||
        Number.isNaN(Date.parse(timestamp))) {
      fail(`Observation ${i} timestamp is invalid`);
    }

    if (row.instrument !== "NIFTY 50")
      fail(`Observation ${i} instrument must be NIFTY 50`);
    if (row.timeframe !== "5m")
      fail(`Observation ${i} timeframe must be 5m`);
    if (row.completedCandle !== true)
      fail(`Observation ${i} must be a completed candle`);

    const candle = row.candle || {};
    const o = finite(candle.o, `Observation ${i} open`);
    const h = finite(candle.h, `Observation ${i} high`);
    const l = finite(candle.l, `Observation ${i} low`);
    const c = finite(candle.c, `Observation ${i} close`);

    if (h < Math.max(o, c)) fail(`Observation ${i} high is invalid`);
    if (l > Math.min(o, c)) fail(`Observation ${i} low is invalid`);
    if (l > h) fail(`Observation ${i} low/high relationship is invalid`);

    const action = String(row.decision?.action || "");
    if (!allowed.has(action))
      fail(`Observation ${i} has unsupported action ${action}`);

    return {
      source: "LIVE_MARKET",
      timestamp,
      instrument: "NIFTY 50",
      timeframe: "5m",
      completedCandle: true,
      candle: { o, h, l, c },
      decision: {
        action,
        confidence:
          row.decision?.confidence == null
            ? null
            : finite(row.decision.confidence, `Observation ${i} confidence`),
        rationale:
          row.decision?.rationale == null
            ? null
            : String(row.decision.rationale)
      }
    };
  });

  for (let i = 1; i < normalized.length; i++) {
    if (Date.parse(normalized[i].timestamp) <=
        Date.parse(normalized[i - 1].timestamp)) {
      fail("Phase 11 observations must be strictly chronological");
    }
  }

  return normalized;
}

function observationHash(row) {
  return sha256(JSON.stringify(row));
}

function processRows(rows, state, existingLedger) {
  const newLedger = [];
  let tradeSequence = state.cumulativeClosedTrades + 1;

  const existingHashes = new Set(
    existingLedger
      .filter(x => x.observationHash)
      .map(x => x.observationHash)
  );

  for (const row of rows) {
    const rowHash = observationHash(row);

    if (existingHashes.has(rowHash))
      fail(`Duplicate observation replay detected: ${row.timestamp}`);

    if (state.lastTimestamp &&
        Date.parse(row.timestamp) <= Date.parse(state.lastTimestamp)) {
      fail(`Observation is not newer than checkpoint: ${row.timestamp}`);
    }

    const sessionDate = row.timestamp.slice(0, 10);

    if (state.sessionDate !== sessionDate) {
      state.sessionDate = sessionDate;
      state.sessionTrades = 0;
      state.sessionPnl = 0;
    }

    const action = row.decision.action;

    if (action === "ENTER_LONG" || action === "ENTER_SHORT") {
      if (state.position !== "FLAT")
        fail(`Entry received while position is ${state.position}`);

      if (state.sessionTrades >= MAX_TRADES_PER_SESSION)
        fail("Maximum paper trades per session exceeded");

      if (state.sessionPnl <=
          -(STARTING_CAPITAL * MAX_DAILY_LOSS_PCT / 100)) {
        fail("Maximum daily paper loss reached");
      }

      state.position = action === "ENTER_LONG" ? "LONG" : "SHORT";
      state.entryPrice = row.candle.c;
      state.entryTimestamp = row.timestamp;
      state.tradeId =
        `P11-${sessionDate}-${String(tradeSequence).padStart(4, "0")}`;
      state.sessionTrades += 1;
      tradeSequence += 1;

      newLedger.push({
        type: "ENTRY",
        source: "LIVE_MARKET",
        observationHash: rowHash,
        paperTradeId: state.tradeId,
        timestamp: row.timestamp,
        instrument: "NIFTY 50",
        timeframe: "5m",
        candidateId: CANDIDATE_ID,
        action,
        entryPrice: row.candle.c,
        status: "OPEN",
        grossPnl: 0,
        executionMode: "PAPER_ONLY",
        realOrderSent: false,
        brokerOrderSent: false,
        confidence: row.decision.confidence,
        rationale: row.decision.rationale
      });
    } else if (action === "EXIT") {
      if (state.position === "FLAT")
        fail("EXIT received while position is flat");

      const pnl = state.position === "LONG"
        ? row.candle.c - state.entryPrice
        : state.entryPrice - row.candle.c;

      state.sessionPnl += pnl;
      state.cumulativeGrossPnl += pnl;
      state.cumulativeClosedTrades += 1;

      if (pnl > 0) state.cumulativeWins += 1;
      if (pnl < 0) state.cumulativeLosses += 1;

      newLedger.push({
        type: "EXIT",
        source: "LIVE_MARKET",
        observationHash: rowHash,
        paperTradeId: state.tradeId,
        timestamp: row.timestamp,
        instrument: "NIFTY 50",
        timeframe: "5m",
        candidateId: CANDIDATE_ID,
        action: "EXIT",
        entryPrice: state.entryPrice,
        exitPrice: row.candle.c,
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
    } else {
      newLedger.push({
        type: "OBSERVATION",
        source: "LIVE_MARKET",
        observationHash: rowHash,
        paperTradeId: null,
        timestamp: row.timestamp,
        instrument: "NIFTY 50",
        timeframe: "5m",
        candidateId: CANDIDATE_ID,
        action: "NO_TRADE",
        close: row.candle.c,
        status: "OBSERVED",
        grossPnl: 0,
        executionMode: "PAPER_ONLY",
        realOrderSent: false,
        brokerOrderSent: false,
        confidence: row.decision.confidence,
        rationale: row.decision.rationale
      });
    }

    state.lastTimestamp = row.timestamp;
    state.lastObservationHash = rowHash;
  }

  return { newLedger, state };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CHECK_DIR, { recursive: true });

  const model = readJson(MODEL_FILE, "Phase 8 model");
  validateModel(model);

  const rows = validateRows(
    readJson(INPUT_FILE, "Phase 11 live observations")
  );

  const state = loadState();
  const existingLedger = loadLedger();

  const processed = processRows(rows, state, existingLedger);

  if (processed.newLedger.length) {
    fs.appendFileSync(
      LEDGER_FILE,
      processed.newLedger.map(x => JSON.stringify(x)).join("\n") + "\n",
      "utf8"
    );
  }

  writeJson(STATE_FILE, processed.state);

  const allLedger = existingLedger.concat(processed.newLedger);

  const result = {
    phase: "SYSTEM_DEVELOPMENT_PHASE_11",
    component: "BOUNDED_FORWARD_PAPER_EXPERIENCE",
    version: VERSION,
    status: "FORWARD_PAPER_EXPERIENCE_CAPTURED",

    candidate: {
      id: CANDIDATE_ID,
      oosStatus: "NOT_VALIDATED",
      frozen: true
    },

    source: {
      mode: "LIVE_MARKET",
      genuineMarketEvidence: true,
      instrument: "NIFTY 50",
      timeframe: "5m",
      completedCandlesRequired: true
    },

    capture: {
      newObservations: rows.length,
      newEntries:
        processed.newLedger.filter(x => x.type === "ENTRY").length,
      newExits:
        processed.newLedger.filter(x => x.type === "EXIT").length,
      cumulativeObservations:
        allLedger.filter(x => x.type === "OBSERVATION").length,
      cumulativeEntries:
        allLedger.filter(x => x.type === "ENTRY").length,
      cumulativeExits:
        allLedger.filter(x => x.type === "EXIT").length,
      cumulativeClosedTrades:
        processed.state.cumulativeClosedTrades,
      cumulativeWins:
        processed.state.cumulativeWins,
      cumulativeLosses:
        processed.state.cumulativeLosses,
      cumulativeGrossPnl:
        processed.state.cumulativeGrossPnl,
      openPosition:
        processed.state.position
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
      maxOpenPositions: MAX_OPEN_POSITIONS,
      maxTradesPerSession: MAX_TRADES_PER_SESSION,
      maxDailyLossPct: MAX_DAILY_LOSS_PCT
    },

    learning: {
      allowed: false,
      reason:
        "Forward evidence must accumulate before any learning update"
    },

    decision: "CONTINUE_BOUNDED_FORWARD_OBSERVATION"
  };

  result.integrity = {
    sha256: sha256(
      JSON.stringify(result, null, 2) + "\n"
    )
  };

  writeJson(RESULT_FILE, result);
  writeJson(CHECKPOINT_FILE, result);

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();

module.exports = {
  VERSION,
  validateModel,
  validateRows,
  processRows,
  main
};

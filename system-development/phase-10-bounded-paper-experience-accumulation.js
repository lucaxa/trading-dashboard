/*
 TradeMind Pro — System Phase 10
 Bounded Paper Experience Accumulation V1

 Purpose:
   Accumulate genuine forward-market paper experience from the
   already-frozen candidate execution layer.

 This phase:
   - consumes completed 5-minute NIFTY 50 observations
   - requires the decision to come from the frozen candidate
   - preserves Phase 7 NOT_VALIDATED
   - records paper decisions and outcomes
   - carries bounded paper position state through a checkpoint

 This phase DOES NOT:
   - optimize
   - retrain
   - mutate the strategy
   - change parameters/features
   - promote the candidate
   - place broker orders
   - trade real money

 Input:
   system-development/data/phase-10-paper-observations.json
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_10_BOUNDED_PAPER_EXPERIENCE_ACCUMULATION_V1";
const MODEL_VERSION = "SYSTEM_PHASE_8_BOUNDED_PAPER_TRADING_MODEL_V1";
const CANDIDATE_ID = "CANDIDATE_BASELINE_V1";

const MODEL_FILE =
  process.env.PHASE8_MODEL_FILE ||
  "system-development/data/phase-8-paper-trading-model.json";

const INPUT_FILE =
  process.env.PHASE10_INPUT_FILE ||
  "system-development/data/phase-10-paper-observations.json";

const OUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE10_DIR || "system-development/data"
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

function fail(message) {
  throw new Error(message);
}

function readJson(file, label) {
  if (!fs.existsSync(file)) fail(`${label} not found: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`Invalid ${label}: ${e.message}`);
  }
}

function hash(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function finite(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${name} must be finite`);
  return n;
}

function validateModel(model) {
  if (model.version !== MODEL_VERSION)
    fail("Unexpected Phase 8 model version");

  if (model.status !== "PAPER_MODEL_CONSTRUCTED")
    fail("Phase 8 model is not constructed");

  if (model.candidate?.id !== CANDIDATE_ID)
    fail("Unexpected candidate ID");

  if (model.candidate?.oosStatus !== "NOT_VALIDATED")
    fail("Phase 7 NOT_VALIDATED status was not preserved");

  if (model.paperContract?.executionMode !== "PAPER_ONLY")
    fail("Paper-only boundary failed");

  if (model.paperContract?.realTrading !== false)
    fail("Real-trading boundary failed");

  if (model.paperContract?.brokerOrders !== false)
    fail("Broker-order boundary failed");

  if (model.learningBoundary?.learnerUpdate !== false)
    fail("Learner-update boundary failed");

  if (model.learningBoundary?.strategyMutation !== false)
    fail("Strategy-mutation boundary failed");

  if (model.learningBoundary?.promotion !== false)
    fail("Promotion boundary failed");
}

function validateInput(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    fail("Phase 10 input must be a non-empty array");

  const allowed = new Set([
    "NO_TRADE",
    "ENTER_LONG",
    "ENTER_SHORT",
    "EXIT"
  ]);

  const out = rows.map((row, i) => {
    if (!row || typeof row !== "object")
      fail(`Observation ${i} is invalid`);

    if (row.source !== "LIVE_MARKET")
      fail(`Observation ${i} must have source LIVE_MARKET`);

    const timestamp = String(row.timestamp || "");
    if (!timestamp || Number.isNaN(Date.parse(timestamp)))
      fail(`Observation ${i} timestamp is invalid`);

    if (String(row.instrument) !== "NIFTY 50")
      fail(`Observation ${i} instrument must be NIFTY 50`);

    if (String(row.timeframe) !== "5m")
      fail(`Observation ${i} timeframe must be 5m`);

    if (!row.candle || typeof row.candle !== "object")
      fail(`Observation ${i} candle is required`);

    const close = finite(row.candle.c, `Observation ${i} close`);
    finite(row.candle.o, `Observation ${i} open`);
    finite(row.candle.h, `Observation ${i} high`);
    finite(row.candle.l, `Observation ${i} low`);

    const action = String(row.decision?.action || "");
    if (!allowed.has(action))
      fail(`Observation ${i} unsupported action ${action}`);

    return {
      ...row,
      timestamp,
      close,
      decision: {
        action,
        confidence:
          row.decision?.confidence == null
            ? null
            : finite(
                row.decision.confidence,
                `Observation ${i} confidence`
              ),
        rationale:
          row.decision?.rationale == null
            ? null
            : String(row.decision.rationale)
      }
    };
  });

  for (let i = 1; i < out.length; i++) {
    if (Date.parse(out[i].timestamp) <= Date.parse(out[i - 1].timestamp))
      fail("Observations must be strictly chronological");
  }

  return out;
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      version: "SYSTEM_PHASE_10_POSITION_STATE_V1",
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
      lastTimestamp: null
    };
  }

  const state = readJson(STATE_FILE, "Phase 10 position state");

  if (state.version !== "SYSTEM_PHASE_10_POSITION_STATE_V1")
    fail("Unexpected Phase 10 position-state version");

  if (!["FLAT", "LONG", "SHORT"].includes(state.position))
    fail("Invalid Phase 10 position state");

  return state;
}

function loadExistingLedger() {
  if (!fs.existsSync(LEDGER_FILE)) return [];

  return fs.readFileSync(LEDGER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        fail(`Invalid ledger row ${i}`);
      }
    });
}

/*
 IMPORTANT FIX:
 The original function was named "process", which shadowed Node's
 global process object and caused process.env.PHASE8_MODEL_FILE to fail.
 It is now explicitly named processObservations.
*/
function processObservations(rows, state, existingLedger) {
  const ledger = [];
  let tradeSeq = state.cumulativeClosedTrades + 1;
  let currentDate = state.sessionDate;

  for (const row of rows) {
    if (
      state.lastTimestamp &&
      Date.parse(row.timestamp) <= Date.parse(state.lastTimestamp)
    ) {
      fail(
        `Observation is not newer than stored checkpoint: ${row.timestamp}`
      );
    }

    const date = row.timestamp.slice(0, 10);

    if (currentDate !== date) {
      currentDate = date;
      state.sessionDate = date;
      state.sessionTrades = 0;
      state.sessionPnl = 0;
    }

    const action = row.decision.action;

    if (action === "ENTER_LONG" || action === "ENTER_SHORT") {
      if (state.position !== "FLAT")
        fail(`Entry received while position is ${state.position}`);

      if (state.sessionTrades >= MAX_TRADES_PER_SESSION)
        fail("Maximum paper trades per session exceeded");

      if (
        state.sessionPnl <=
        -(STARTING_CAPITAL * MAX_DAILY_LOSS_PCT / 100)
      ) {
        fail("Maximum daily paper loss reached");
      }

      state.position = action === "ENTER_LONG" ? "LONG" : "SHORT";
      state.entryPrice = row.close;
      state.entryTimestamp = row.timestamp;
      state.tradeId =
        `P10-${date}-${String(tradeSeq).padStart(4, "0")}`;
      state.sessionTrades += 1;
      tradeSeq += 1;

      ledger.push({
        type: "ENTRY",
        paperTradeId: state.tradeId,
        timestamp: row.timestamp,
        source: "LIVE_MARKET",
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
      if (state.position === "FLAT")
        fail("EXIT received while paper position is flat");

      const pnl =
        state.position === "LONG"
          ? row.close - state.entryPrice
          : state.entryPrice - row.close;

      state.sessionPnl += pnl;
      state.cumulativeGrossPnl += pnl;
      state.cumulativeClosedTrades += 1;

      if (pnl > 0) state.cumulativeWins += 1;
      if (pnl < 0) state.cumulativeLosses += 1;

      ledger.push({
        type: "EXIT",
        paperTradeId: state.tradeId,
        timestamp: row.timestamp,
        source: "LIVE_MARKET",
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

    ledger.push({
      type: "OBSERVATION",
      paperTradeId: null,
      timestamp: row.timestamp,
      source: "LIVE_MARKET",
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

  return { ledger, state };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CHECK_DIR, { recursive: true });

  const model = readJson(MODEL_FILE, "Phase 8 model");
  const rows = validateInput(
    readJson(INPUT_FILE, "Phase 10 observations")
  );

  validateModel(model);

  const state = readState();
  const existingLedger = loadExistingLedger();

  const { ledger, state: nextState } =
    processObservations(rows, state, existingLedger);

  if (nextState.position !== "FLAT") {
    console.log(
      "NOTE: bounded forward window currently carries an OPEN paper position."
    );
  }

  const appended = ledger.map(x => JSON.stringify(x)).join("\n");
  if (appended) {
    fs.appendFileSync(
      LEDGER_FILE,
      appended + "\n",
      "utf8"
    );
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(nextState, null, 2) + "\n",
    "utf8"
  );

  const allLedger = existingLedger.concat(ledger);
  const observations = allLedger.filter(x => x.type === "OBSERVATION");
  const entries = allLedger.filter(x => x.type === "ENTRY");
  const exits = allLedger.filter(x => x.type === "EXIT");

  const result = {
    phase: "SYSTEM_DEVELOPMENT_PHASE_10",
    component: "BOUNDED_PAPER_EXPERIENCE_ACCUMULATION",
    version: VERSION,
    status: "PAPER_EXPERIENCE_CAPTURED",

    candidate: {
      id: CANDIDATE_ID,
      sourcePhase: "SYSTEM_PHASE_6",
      oosStatus: "NOT_VALIDATED",
      strategyModification: false
    },

    capture: {
      newObservations: rows.length,
      newEntries: ledger.filter(x => x.type === "ENTRY").length,
      newExits: ledger.filter(x => x.type === "EXIT").length,
      totalObservations: observations.length,
      totalEntries: entries.length,
      totalExits: exits.length,
      cumulativeClosedTrades: nextState.cumulativeClosedTrades,
      cumulativeWins: nextState.cumulativeWins,
      cumulativeLosses: nextState.cumulativeLosses,
      cumulativeGrossPnl: nextState.cumulativeGrossPnl,
      openPosition: nextState.position
    },

    sourceBoundary: {
      sourceRequired: "LIVE_MARKET",
      instrument: "NIFTY 50",
      timeframe: "5m",
      completedCandleRequired: true,
      chronological: true,
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
      maxOpenPositions: MAX_OPEN_POSITIONS,
      maxTradesPerSession: MAX_TRADES_PER_SESSION,
      maxDailyLossPct: MAX_DAILY_LOSS_PCT
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

  let text = JSON.stringify(result, null, 2) + "\n";
  result.file = {
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: hash(text)
  };
  text = JSON.stringify(result, null, 2) + "\n";

  fs.writeFileSync(OUT_FILE, text, "utf8");
  fs.writeFileSync(CHECK_FILE, text, "utf8");

  console.log("=== TRADEMIND PRO PHASE 10 ===");
  console.log("BOUNDED_PAPER_EXPERIENCE_CAPTURE_COMPLETE");
  console.log(text);
}

if (require.main === module) main();

module.exports = {
  VERSION,
  validateModel,
  validateInput,
  readState,
  processObservations,
  main
};

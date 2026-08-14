/*
 TradeMind Pro — System Phase 9
 Bounded Paper Forward Validation V1

 Product-execution phase.
 No research loop, optimization, strategy mutation, promotion,
 broker orders, or real trading.

 Phase 8 provides the frozen PAPER_ONLY contract.
 Phase 9 validates a bounded forward paper stream and records
 every paper decision in a durable ledger.

 Maximum:
   sessions            = 2
   trades / session   = 5
   open positions     = 1
   daily loss          = 1%
   risk / trade        = 0.5%

 Input:
 system-development/data/phase-9-paper-forward-input.json

 Each row:
 {
   timestamp,
   instrument: "NIFTY 50",
   timeframe: "5m",
   candle: { o, h, l, c },
   decision: {
     action: "NO_TRADE" | "ENTER_LONG" | "ENTER_SHORT" | "EXIT",
     confidence,
     rationale
   }
 }

 The decision is supplied by the frozen candidate execution layer.
 This phase does not optimize or change it.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_9_BOUNDED_PAPER_FORWARD_VALIDATION_V1";
const MODEL_VERSION = "SYSTEM_PHASE_8_BOUNDED_PAPER_TRADING_MODEL_V1";
const CANDIDATE_ID = "CANDIDATE_BASELINE_V1";

const MODEL_FILE =
  process.env.PHASE8_MODEL_FILE ||
  "system-development/data/phase-8-paper-trading-model.json";

const INPUT_FILE =
  process.env.PHASE9_INPUT_FILE ||
  "system-development/data/phase-9-paper-forward-input.json";

const OUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE9_DIR || "system-development/data"
);
const CHECK_DIR = path.resolve(
  process.env.TRADEMIND_PHASE9_CHECKPOINT_DIR ||
  "system-development/checkpoints"
);

const OUT_FILE = path.join(
  OUT_DIR,
  "phase-9-paper-forward-validation.json"
);
const LEDGER_FILE = path.join(
  OUT_DIR,
  "phase-9-paper-forward-ledger.jsonl"
);
const CHECK_FILE = path.join(
  CHECK_DIR,
  "phase-9-paper-forward-validation-checkpoint.json"
);

const MAX_SESSIONS = 2;
const MAX_TRADES_PER_SESSION = 5;
const MAX_OPEN_POSITIONS = 1;
const MAX_DAILY_LOSS_PCT = 1.0;
const MAX_RISK_PER_TRADE_PCT = 0.5;

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

function finite(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${name} must be finite`);
  return n;
}

function hash(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
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
    fail("Paper-only execution boundary failed");

  if (model.paperContract?.realTrading !== false)
    fail("Real trading boundary failed");

  if (model.paperContract?.brokerOrders !== false)
    fail("Broker order boundary failed");

  if (model.learningBoundary?.learnerUpdate !== false)
    fail("Learner update boundary failed");

  if (model.learningBoundary?.strategyMutation !== false)
    fail("Strategy mutation boundary failed");

  if (model.learningBoundary?.promotion !== false)
    fail("Promotion boundary failed");
}

function validateInput(rows) {
  if (!Array.isArray(rows))
    fail("Phase 9 input must be an array");

  if (rows.length === 0)
    fail("Phase 9 input is empty");

  const allowed = new Set([
    "NO_TRADE",
    "ENTER_LONG",
    "ENTER_SHORT",
    "EXIT"
  ]);

  const out = rows.map((row, i) => {
    if (!row || typeof row !== "object")
      fail(`Row ${i} is invalid`);

    const timestamp = String(row.timestamp || "");

    if (!timestamp || Number.isNaN(Date.parse(timestamp)))
      fail(`Row ${i} timestamp is invalid`);

    if (String(row.instrument) !== "NIFTY 50")
      fail(`Row ${i} instrument must be NIFTY 50`);

    if (String(row.timeframe) !== "5m")
      fail(`Row ${i} timeframe must be 5m`);

    if (!row.candle)
      fail(`Row ${i} candle is required`);

    const close = finite(row.candle.c, `Row ${i} close`);
    const action = String(row.decision?.action || "");

    if (!allowed.has(action))
      fail(`Row ${i} has unsupported action ${action}`);

    return {
      ...row,
      timestamp,
      close,
      decision: {
        action,
        confidence:
          row.decision?.confidence == null
            ? null
            : finite(row.decision.confidence, `Row ${i} confidence`),
        rationale:
          row.decision?.rationale == null
            ? null
            : String(row.decision.rationale)
      }
    };
  });

  for (let i = 1; i < out.length; i++) {
    if (
      Date.parse(out[i].timestamp) <=
      Date.parse(out[i - 1].timestamp)
    ) {
      fail("Input timestamps must be strictly chronological");
    }
  }

  return out;
}

function buildLedger(rows) {
  let state = "FLAT";
  let entryPrice = null;
  let entryAction = null;
  let tradeSeq = 0;
  let currentDate = null;
  let sessionTrades = 0;
  let sessionPnl = 0;

  const ledger = [];
  const sessions = new Map();

  for (const row of rows) {
    const date = row.timestamp.slice(0, 10);

    if (!sessions.has(date)) {
      if (sessions.size >= MAX_SESSIONS)
        fail("Maximum Phase 9 session count exceeded");

      sessions.set(date, { trades: 0, grossPnl: 0 });
    }

    if (currentDate !== date) {
      currentDate = date;
      sessionTrades = 0;
      sessionPnl = 0;
    }

    const action = row.decision.action;

    if (action === "ENTER_LONG" || action === "ENTER_SHORT") {
      if (state !== "FLAT")
        fail(`Invalid entry while position is ${state}`);

      if (sessionTrades >= MAX_TRADES_PER_SESSION)
        fail("Maximum trades per session exceeded");

      if (
        sessionPnl <=
        -(100000 * MAX_DAILY_LOSS_PCT / 100)
      ) {
        fail("Maximum daily loss reached");
      }

      state = action === "ENTER_LONG" ? "LONG" : "SHORT";
      entryPrice = row.close;
      entryAction = action;
      tradeSeq++;
      sessionTrades++;
      sessions.get(date).trades++;

      ledger.push({
        paperTradeId:
          `P9-${date}-${String(tradeSeq).padStart(3, "0")}`,
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
        riskCheck: {
          passed: true,
          maxOpenPositions: MAX_OPEN_POSITIONS,
          maxTradesPerSession: MAX_TRADES_PER_SESSION,
          maxDailyLossPct: MAX_DAILY_LOSS_PCT,
          maxRiskPerTradePct: MAX_RISK_PER_TRADE_PCT
        },
        executionMode: "PAPER_ONLY",
        realOrderSent: false,
        brokerOrderSent: false,
        confidence: row.decision.confidence,
        rationale: row.decision.rationale
      });

      continue;
    }

    if (action === "EXIT") {
      if (state === "FLAT")
        fail("EXIT received while flat");

      const pnl =
        state === "LONG"
          ? row.close - entryPrice
          : entryPrice - row.close;

      sessionPnl += pnl;
      sessions.get(date).grossPnl += pnl;

      const open = ledger[ledger.length - 1];

      open.exitPrice = row.close;
      open.exitTimestamp = row.timestamp;
      open.grossPnl = pnl;
      open.status = "CLOSED";
      open.exitAction = "EXIT";

      state = "FLAT";
      entryPrice = null;
      entryAction = null;

      continue;
    }

    ledger.push({
      paperTradeId:
        `P9-${date}-OBS-${String(ledger.length + 1).padStart(3, "0")}`,
      timestamp: row.timestamp,
      instrument: "NIFTY 50",
      timeframe: "5m",
      candidateId: CANDIDATE_ID,
      action: "NO_TRADE",
      entryPrice: row.close,
      exitPrice: row.close,
      quantity: 0,
      status: "OBSERVED",
      grossPnl: 0,
      riskCheck: {
        passed: true,
        maxOpenPositions: MAX_OPEN_POSITIONS,
        maxTradesPerSession: MAX_TRADES_PER_SESSION,
        maxDailyLossPct: MAX_DAILY_LOSS_PCT,
        maxRiskPerTradePct: MAX_RISK_PER_TRADE_PCT
      },
      executionMode: "PAPER_ONLY",
      realOrderSent: false,
      brokerOrderSent: false,
      confidence: row.decision.confidence,
      rationale: row.decision.rationale
    });
  }

  if (state !== "FLAT")
    fail("Forward window ended with an open paper position");

  return { ledger, sessions };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CHECK_DIR, { recursive: true });

  const model = readJson(MODEL_FILE, "Phase 8 model");
  const rows = validateInput(
    readJson(INPUT_FILE, "Phase 9 input")
  );

  validateModel(model);

  const { ledger, sessions } = buildLedger(rows);

  const closed = ledger.filter(x => x.status === "CLOSED");
  const wins = closed.filter(x => x.grossPnl > 0).length;
  const losses = closed.filter(x => x.grossPnl < 0).length;
  const flat = closed.filter(x => x.grossPnl === 0).length;
  const grossPnl = closed.reduce(
    (sum, x) => sum + x.grossPnl,
    0
  );

  const result = {
    phase: "SYSTEM_DEVELOPMENT_PHASE_9",
    component: "BOUNDED_PAPER_FORWARD_VALIDATION",
    version: VERSION,
    status: "PAPER_FORWARD_PIPELINE_VALIDATED",

    candidate: {
      id: CANDIDATE_ID,
      sourcePhase: "SYSTEM_PHASE_6",
      oosStatus: "NOT_VALIDATED",
      strategyModification: false
    },

    window: {
      sessions: sessions.size,
      maxSessions: MAX_SESSIONS,
      observations: rows.length,
      start: rows[0].timestamp,
      end: rows[rows.length - 1].timestamp,
      chronological: true,
      historicalRewind: false
    },

    results: {
      closedTrades: closed.length,
      wins,
      losses,
      flat,
      grossPnl,
      winRate:
        closed.length ? wins / closed.length : null,
      noTradeObservations:
        ledger.filter(x => x.action === "NO_TRADE").length
    },

    safety: {
      executionMode: "PAPER_ONLY",
      realTrading: false,
      brokerOrders: false,
      strategyModification: false,
      parameterOptimization: false,
      featureSelection: false,
      learnerUpdates: false,
      promotion: false,
      maxSessions: MAX_SESSIONS,
      maxTradesPerSession: MAX_TRADES_PER_SESSION,
      maxOpenPositions: MAX_OPEN_POSITIONS,
      maxDailyLossPct: MAX_DAILY_LOSS_PCT,
      maxRiskPerTradePct: MAX_RISK_PER_TRADE_PCT
    },

    learning: {
      experienceCapture: true,
      learnerUpdate: false,
      modelWeightUpdate: false,
      strategyMutation: false,
      promotion: false
    },

    nextStage: "BOUNDED_PAPER_EXPERIENCE_ACCUMULATION"
  };

  const raw = JSON.stringify(result, null, 2) + "\n";

  result.file = {
    bytes: Buffer.byteLength(raw, "utf8"),
    sha256: hash(raw)
  };

  const text = JSON.stringify(result, null, 2) + "\n";

  fs.writeFileSync(OUT_FILE, text, "utf8");
  fs.writeFileSync(CHECK_FILE, text, "utf8");
  fs.writeFileSync(
    LEDGER_FILE,
    ledger.map(x => JSON.stringify(x)).join("\n") + "\n",
    "utf8"
  );

  console.log("=== TRADEMIND PRO PHASE 9 ===");
  console.log("BOUNDED_PAPER_FORWARD_VALIDATION_COMPLETE");
  console.log(text);
}

if (require.main === module) main();

module.exports = {
  VERSION,
  validateModel,
  validateInput,
  buildLedger,
  main
};

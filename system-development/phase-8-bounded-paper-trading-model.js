/*
 TradeMind Pro — System Phase 8
 Bounded Paper Trading Model V1

 Product-construction phase only.
 Phase 7 remains NOT_VALIDATED.
 No strategy modification, optimization, broker orders, or real trading.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_8_BOUNDED_PAPER_TRADING_MODEL_V1";
const CANDIDATE_ID = "CANDIDATE_BASELINE_V1";

const PHASE6_INPUT =
  process.env.PHASE6_INPUT_FILE ||
  "system-development/data/phase-6-candidate-strategy.json";

const PHASE7_INPUT =
  process.env.PHASE7_INPUT_FILE ||
  "system-development/data/phase-7-true-oos-validation.json";

const OUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE8_DIR || "system-development/data"
);
const CHECK_DIR = path.resolve(
  process.env.TRADEMIND_PHASE8_CHECKPOINT_DIR ||
  "system-development/checkpoints"
);

const OUT_FILE = path.join(
  OUT_DIR,
  "phase-8-paper-trading-model.json"
);
const CHECK_FILE = path.join(
  CHECK_DIR,
  "phase-8-paper-trading-model-checkpoint.json"
);

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

function validatePhase6(d) {
  if (d.version !== "SYSTEM_PHASE_6_CANDIDATE_STRATEGY_CONSTRUCTION_V1")
    fail("Unexpected Phase 6 version");
  if (d.status !== "CANDIDATE_CONSTRUCTED")
    fail("Phase 6 candidate is not constructed");
  if (d.candidate?.id !== CANDIDATE_ID)
    fail("Unexpected candidate ID");
  if (d.candidate?.type !== "EXISTING_STRATEGY_BASELINE")
    fail("Phase 6 candidate is not baseline");
  if (
    d.candidate?.learningModifiers?.length !== 0 ||
    d.candidate?.featureAdditions?.length !== 0 ||
    d.candidate?.parameterChanges?.length !== 0
  ) fail("Phase 6 contains unapproved modifications");
  if (
    d.candidate?.optimizationApplied !== false ||
    d.candidate?.strategyCodeModified !== false
  ) fail("Phase 6 modification boundary failed");
  if (
    d.safety?.paperOnly !== true ||
    d.safety?.strategyPromotion !== false ||
    d.safety?.brokerIntegration !== false ||
    d.safety?.realTrading !== false
  ) fail("Phase 6 safety boundary failed");
}

function validatePhase7(d) {
  if (d.version !== "SYSTEM_PHASE_7_TRUE_OOS_VALIDATION_V1")
    fail("Unexpected Phase 7 version");
  if (d.status !== "NOT_VALIDATED")
    fail("Phase 8 requires recorded Phase 7 NOT_VALIDATED result");
  if (d.candidate?.id !== CANDIDATE_ID)
    fail("Phase 7 candidate mismatch");
  if (d.decision?.passed !== false)
    fail("Phase 7 decision is inconsistent");
  if (
    d.safety?.realTrading !== false ||
    d.safety?.brokerIntegration !== false
  ) fail("Phase 7 safety boundary failed");
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CHECK_DIR, { recursive: true });

  const p6 = readJson(PHASE6_INPUT, "Phase 6 candidate");
  const p7 = readJson(PHASE7_INPUT, "Phase 7 evidence");

  validatePhase6(p6);
  validatePhase7(p7);

  const model = {
    phase: "SYSTEM_DEVELOPMENT_PHASE_8",
    component: "BOUNDED_PAPER_TRADING_MODEL",
    version: VERSION,
    status: "PAPER_MODEL_CONSTRUCTED",

    candidate: {
      id: CANDIDATE_ID,
      sourcePhase: "SYSTEM_PHASE_6",
      oosStatus: "NOT_VALIDATED",
      oosDecision: "RETAINED_AS_EXPERIMENTAL_PAPER_CANDIDATE_ONLY",
      strategyModification: false
    },

    phase7Evidence: {
      status: p7.status,
      actionableSignals: p7.metrics?.actionableSignals ?? null,
      correct: p7.metrics?.correct ?? null,
      incorrect: p7.metrics?.incorrect ?? null,
      accuracy: p7.metrics?.accuracy ?? null,
      aggregateForwardPoints:
        p7.metrics?.aggregateForwardPoints ?? null,
      passed: p7.decision?.passed ?? false
    },

    paperContract: {
      instrument: "NIFTY 50",
      timeframe: "5m",
      executionMode: "PAPER_ONLY",
      startingPaperCapital: 100000,
      maxRiskPerTradePct: 0.5,
      maxOpenPositions: 1,
      maxDailyLossPct: 1.0,
      maxTradesPerDay: 5,
      entryLogic: "EXISTING_CANDIDATE_BASELINE_UNCHANGED",
      exitLogic: "EXISTING_CANDIDATE_BASELINE_UNCHANGED",
      allowedActions: [
        "NO_TRADE",
        "ENTER_LONG",
        "ENTER_SHORT",
        "EXIT"
      ],
      positionStates: ["FLAT", "LONG", "SHORT"],
      realTrading: false,
      brokerOrders: false
    },

    ledgerSchema: {
      schemaVersion: "SYSTEM_PHASE_8_PAPER_TRADE_V1",
      requiredFields: [
        "paperTradeId",
        "timestamp",
        "instrument",
        "timeframe",
        "candidateId",
        "action",
        "entryPrice",
        "exitPrice",
        "quantity",
        "status",
        "grossPnl",
        "riskCheck",
        "executionMode",
        "realOrderSent"
      ],
      requiredSafetyValues: {
        executionMode: "PAPER_ONLY",
        realOrderSent: false,
        brokerOrderSent: false
      }
    },

    learningBoundary: {
      experienceCapture: true,
      learnerUpdate: false,
      modelWeightUpdate: false,
      featureSelection: false,
      parameterOptimization: false,
      strategyMutation: false,
      promotion: false
    },

    productReadiness: {
      signalLayer: true,
      riskLayer: true,
      paperExecutionLayer: true,
      tradeLedger: true,
      experienceCaptureLayer: true,
      liveBrokerExecution: false,
      liveTrading: false
    },

    safety: {
      paperOnly: true,
      realTrading: false,
      brokerOrders: false,
      brokerIntegration: false,
      strategyModification: false,
      strategyPromotion: false,
      parameterOptimization: false,
      featureSelection: false,
      learnerStateUpdates: false
    },

    nextStage: "PAPER_FORWARD_VALIDATION"
  };

  let text = JSON.stringify(model, null, 2) + "\n";
  model.file = {
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: hash(text)
  };
  text = JSON.stringify(model, null, 2) + "\n";

  fs.writeFileSync(OUT_FILE, text);
  fs.writeFileSync(CHECK_FILE, text);

  console.log("=== TRADEMIND PRO PHASE 8 ===");
  console.log("BOUNDED_PAPER_TRADING_MODEL_COMPLETE");
  console.log(text);
}

if (require.main === module) main();

module.exports = {
  VERSION,
  validatePhase6,
  validatePhase7,
  main
};

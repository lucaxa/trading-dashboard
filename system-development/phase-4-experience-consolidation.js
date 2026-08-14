/*
 TradeMind Pro — System Development Phase 4
 Experience Consolidation & Learning-Ready Memory

 Purpose:
 - Validate Phase 3 historical experience.
 - Canonicalize it into a learning-ready dataset.
 - Preserve Phase 1/2/3 data.
 - Do not learn, optimize, modify strategy, promote, or trade.

 Phase 3 compatibility:
 - decision timestamp is ISO text.
 - outcome.exitTimestamp is emitted by Phase 3 as epoch milliseconds.
 - This phase accepts ISO, epoch milliseconds, or epoch seconds and
   canonicalizes all timestamps to ISO.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_4_EXPERIENCE_CONSOLIDATION_V1";
const INPUT_FILE =
  process.env.INPUT_FILE ||
  "system-development/data/phase-3-historical-experience.jsonl";

const OUTPUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE4_DIR || "system-development/data"
);
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "phase-4-learning-ready-experience.jsonl"
);

const CHECKPOINT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE4_CHECKPOINT_DIR ||
    "system-development/checkpoints"
);
const CHECKPOINT_FILE = path.join(
  CHECKPOINT_DIR,
  "phase-4-learning-ready-experience-checkpoint.json"
);

const ACTIONS = new Set([
  "NO_TRADE",
  "PAPER_LONG",
  "PAPER_SHORT"
]);

const OUTCOMES = new Set([
  "NO_TRADE",
  "WIN",
  "LOSS",
  "FLAT"
]);

const SOURCE_DATASET = "V25.7 frozen full_s5";
const SOURCE_CONTEXT = "SYSTEM_PHASE_3";

function fail(message) {
  throw new Error(message);
}

function finite(value, name) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    fail(`${name} must be finite when provided`);
  }
  return n;
}

function required(value, name) {
  if (value === null || value === undefined || value === "") {
    fail(`${name} is required`);
  }
  return String(value);
}

function optional(value) {
  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/*
 Accept:
   ISO timestamp: "2026-08-14T09:15:00.000Z"
   epoch milliseconds: 175...
   epoch seconds: 175...
 Return canonical ISO plus epoch milliseconds.
*/
function parseTimestamp(value, name) {
  if (value === null || value === undefined || value === "") {
    fail(`${name} is required`);
  }

  let ms;

  if (typeof value === "number") {
    ms = value;
  } else {
    const text = String(value).trim();

    if (/^\d+(?:\.\d+)?$/.test(text)) {
      ms = Number(text);
    } else {
      ms = Date.parse(text);
    }
  }

  if (!Number.isFinite(ms) || ms <= 0) {
    fail(`${name} is not a valid timestamp`);
  }

  // Phase 3 uses epoch milliseconds for exitTimestamp.
  // Also tolerate epoch seconds for defensive compatibility.
  if (ms < 100000000000) {
    ms *= 1000;
  }

  const date = new Date(ms);

  if (!Number.isFinite(date.getTime())) {
    fail(`${name} is not a valid timestamp`);
  }

  return {
    milliseconds: ms,
    text: date.toISOString()
  };
}

function ensureDirs() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function loadRows() {
  if (!fs.existsSync(INPUT_FILE)) {
    fail(`Phase 3 input not found: ${INPUT_FILE}`);
  }

  const lines = fs
    .readFileSync(INPUT_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  if (!lines.length) {
    fail("Phase 3 input is empty");
  }

  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      fail(`Invalid JSON at Phase 3 line ${i + 1}`);
    }
  });
}

function validateObservation(row, i) {
  if (!row.observation || typeof row.observation !== "object") {
    fail(`Missing observation at row ${i + 1}`);
  }

  for (const field of [
    "close",
    "return1",
    "atr",
    "rsi",
    "ema9",
    "ema21",
    "vwap"
  ]) {
    finite(
      row.observation[field],
      `row ${i + 1} observation.${field}`
    );
  }
}

function validateOutcome(row, action, i, decisionMs) {
  const outcome = row.outcome;

  if (!outcome || typeof outcome !== "object") {
    fail(`Missing outcome at row ${i + 1}`);
  }

  const status = required(
    outcome.status,
    `row ${i + 1} outcome.status`
  );

  if (!OUTCOMES.has(status)) {
    fail(`Invalid outcome ${status} at row ${i + 1}`);
  }

  if (action === "NO_TRADE" && status !== "NO_TRADE") {
    fail(`NO_TRADE must resolve to NO_TRADE at row ${i + 1}`);
  }

  if (action !== "NO_TRADE" && status === "NO_TRADE") {
    fail(`Trade action cannot resolve to NO_TRADE at row ${i + 1}`);
  }

  for (const field of [
    "priceChange",
    "normalizedReturn",
    "barsHeld",
    "maxFavorableExcursion",
    "maxAdverseExcursion"
  ]) {
    finite(outcome[field], `row ${i + 1} outcome.${field}`);
  }

  let exit = null;

  if (status !== "NO_TRADE") {
    exit = parseTimestamp(
      outcome.exitTimestamp,
      `row ${i + 1} outcome.exitTimestamp`
    );

    if (exit.milliseconds < decisionMs) {
      fail(
        `Outcome exit precedes decision timestamp at row ${i + 1}`
      );
    }
  } else if (
    outcome.exitTimestamp !== null &&
    outcome.exitTimestamp !== undefined
  ) {
    fail(
      `NO_TRADE outcome must not have exitTimestamp at row ${i + 1}`
    );
  }

  return { status, exit };
}

function validateAndCanonicalize(rows) {
  const ids = new Set();
  const timestamps = new Set();
  const records = [];

  let previousMs = null;

  rows.forEach((row, i) => {
    if (!row || typeof row !== "object") {
      fail(`Phase 3 row ${i + 1} is not an object`);
    }

    const experienceId = required(
      row.experienceId,
      `row ${i + 1} experienceId`
    );

    if (ids.has(experienceId)) {
      fail(`Duplicate experienceId: ${experienceId}`);
    }
    ids.add(experienceId);

    const decisionTime = parseTimestamp(
      row.timestamp,
      `row ${i + 1} timestamp`
    );

    if (
      previousMs !== null &&
      decisionTime.milliseconds < previousMs
    ) {
      fail(
        `Phase 3 timestamps are not chronological at row ${i + 1}`
      );
    }

    const timestampKey = String(decisionTime.milliseconds);
    if (timestamps.has(timestampKey)) {
      fail(
        `Duplicate decision timestamp: ${decisionTime.text}`
      );
    }
    timestamps.add(timestampKey);
    previousMs = decisionTime.milliseconds;

    const instrument = required(
      row.instrument,
      `row ${i + 1} instrument`
    );
    const timeframe = required(
      row.timeframe,
      `row ${i + 1} timeframe`
    );

    if (instrument !== "NIFTY 50") {
      fail(`Unexpected instrument at row ${i + 1}: ${instrument}`);
    }

    if (timeframe !== "5m") {
      fail(`Unexpected timeframe at row ${i + 1}: ${timeframe}`);
    }

    if (row.source?.dataset !== SOURCE_DATASET) {
      fail(`Unexpected source dataset at row ${i + 1}`);
    }

    if (row.context?.source !== SOURCE_CONTEXT) {
      fail(`Unexpected context source at row ${i + 1}`);
    }

    const action = required(
      row.decision?.action,
      `row ${i + 1} decision.action`
    );

    if (!ACTIONS.has(action)) {
      fail(`Invalid action at row ${i + 1}: ${action}`);
    }

    const confidence = finite(
      row.decision?.confidence,
      `row ${i + 1} decision.confidence`
    );

    validateObservation(row, i);

    const outcomeCheck = validateOutcome(
      row,
      action,
      i,
      decisionTime.milliseconds
    );

    const record = {
      schemaVersion: "SYSTEM_PHASE_4_LEARNING_READY_V1",
      experienceId,
      timestamp: decisionTime.text,
      instrument: "NIFTY 50",
      timeframe: "5m",

      source: {
        dataset: SOURCE_DATASET,
        phase: "SYSTEM_PHASE_3"
      },

      observation: {
        close: finite(row.observation.close, "observation.close"),
        return1: finite(row.observation.return1, "observation.return1"),
        atr: finite(row.observation.atr, "observation.atr"),
        rsi: finite(row.observation.rsi, "observation.rsi"),
        ema9: finite(row.observation.ema9, "observation.ema9"),
        ema21: finite(row.observation.ema21, "observation.ema21"),
        vwap: finite(row.observation.vwap, "observation.vwap")
      },

      context: {
        session: optional(row.context?.session),
        direction: optional(row.context?.direction),
        transitionState: optional(row.context?.transitionState),
        source: SOURCE_CONTEXT
      },

      decision: {
        action,
        confidence,
        rationale: optional(row.decision?.rationale)
      },

      outcome: {
        status: outcomeCheck.status,
        exitTimestamp:
          outcomeCheck.exit === null
            ? null
            : outcomeCheck.exit.text,
        priceChange: finite(
          row.outcome.priceChange,
          "outcome.priceChange"
        ),
        normalizedReturn: finite(
          row.outcome.normalizedReturn,
          "outcome.normalizedReturn"
        ),
        barsHeld: finite(
          row.outcome.barsHeld,
          "outcome.barsHeld"
        ),
        maxFavorableExcursion: finite(
          row.outcome.maxFavorableExcursion,
          "outcome.maxFavorableExcursion"
        ),
        maxAdverseExcursion: finite(
          row.outcome.maxAdverseExcursion,
          "outcome.maxAdverseExcursion"
        )
      },

      provenance: {
        sourceExperienceId: experienceId,
        derivedFrom:
          "SYSTEM_PHASE_3_HISTORICAL_EXPERIENCE_STREAM_V1",
        learningEnabled: false,
        strategyPromotionEnabled: false,
        realTradingEnabled: false
      }
    };

    records.push({
      ...record,
      recordHash: sha256(JSON.stringify(record))
    });
  });

  return records;
}

function writeDataset(records) {
  const content =
    records.map(row => JSON.stringify(row)).join("\n") + "\n";

  fs.writeFileSync(OUTPUT_FILE, content, "utf8");

  return {
    bytes: Buffer.byteLength(content, "utf8"),
    sha256: sha256(content)
  };
}

function buildSummary(records, file) {
  const summary = {
    phase: "SYSTEM_DEVELOPMENT_PHASE_4",
    component: "EXPERIENCE_CONSOLIDATION_LEARNING_READY_MEMORY",
    version: VERSION,
    status: "READY",
    source: SOURCE_DATASET,
    inputFile: INPUT_FILE,
    outputFile: OUTPUT_FILE,
    records: {
      total: records.length,
      noTrade: records.filter(x => x.decision.action === "NO_TRADE").length,
      paperLong: records.filter(x => x.decision.action === "PAPER_LONG").length,
      paperShort: records.filter(x => x.decision.action === "PAPER_SHORT").length,
      win: records.filter(x => x.outcome.status === "WIN").length,
      loss: records.filter(x => x.outcome.status === "LOSS").length,
      flat: records.filter(x => x.outcome.status === "FLAT").length
    },
    integrity: {
      uniqueExperienceIds: true,
      uniqueDecisionTimestamps: true,
      chronological: true,
      sourceValidated: true,
      outcomeValidated: true,
      schemaValidated: true,
      timestampCompatibility: "ISO + epoch seconds/milliseconds accepted"
    },
    file,
    safety: {
      realTradingEnabled: false,
      brokerIntegrationEnabled: false,
      liveDataEnabled: false,
      learnerEnabled: false,
      parameterOptimizationEnabled: false,
      featureSelectionEnabled: false,
      strategyModificationEnabled: false,
      strategyPromotionEnabled: false
    },
    nextStage: "CONTROLLED_LEARNING_LAYER"
  };

  return summary;
}

function main() {
  ensureDirs();

  const rows = loadRows();
  const records = validateAndCanonicalize(rows);

  if (!records.length) {
    fail("No learning-ready records were produced");
  }

  const file = writeDataset(records);
  const summary = buildSummary(records, file);

  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify(summary, null, 2) + "\n",
    "utf8"
  );

  console.log("=== TRADEMIND PRO PHASE 4 ===");
  console.log("EXPERIENCE_CONSOLIDATION_COMPLETE");
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  VERSION,
  INPUT_FILE,
  OUTPUT_FILE,
  CHECKPOINT_FILE,
  parseTimestamp,
  loadRows,
  validateAndCanonicalize,
  buildSummary,
  main
};

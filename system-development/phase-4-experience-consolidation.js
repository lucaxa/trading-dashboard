/*
===========================================================
 TradeMind Pro
 SYSTEM DEVELOPMENT — PHASE 4
 EXPERIENCE CONSOLIDATION & LEARNING-READY MEMORY
===========================================================

PURPOSE
-------
Convert the controlled Phase 3 historical experience stream
into a deterministic, immutable, learning-ready experience
dataset.

THIS IS A PRODUCT-BUILDING PHASE.

It does NOT:
- learn
- optimize
- select features
- select thresholds
- modify strategy.js
- promote a strategy
- place orders
- call Dhan
- use live market data
- rewrite Phase 1 memory

PIPELINE
--------
PHASE 3 HISTORICAL EXPERIENCE STREAM
                ↓
SCHEMA VALIDATION
                ↓
IDENTITY / DUPLICATE AUDIT
                ↓
TEMPORAL ORDER AUDIT
                ↓
DECISION / OUTCOME RECONCILIATION
                ↓
SOURCE / SAFETY AUDIT
                ↓
CANONICAL LEARNING RECORD
                ↓
IMMUTABLE LEARNING-READY DATASET
                ↓
CHECKPOINT + SUMMARY

OUTPUT
------
system-development/data/
  phase-4-learning-ready-experience.jsonl

system-development/checkpoints/
  phase-4-learning-ready-experience-checkpoint.json

IMPORTANT
---------
The Phase 3 stream remains untouched.
The Phase 1 ledger remains untouched.
This phase creates a new derived dataset.

===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION =
  "SYSTEM_PHASE_4_EXPERIENCE_CONSOLIDATION_V1";

const INPUT_FILE =
  process.env.INPUT_FILE ||
  "system-development/data/phase-3-historical-experience.jsonl";

const OUTPUT_DIR =
  path.resolve(
    process.env.TRADEMIND_PHASE4_DIR ||
      "system-development/data"
  );

const OUTPUT_FILE =
  path.join(
    OUTPUT_DIR,
    "phase-4-learning-ready-experience.jsonl"
  );

const CHECKPOINT_DIR =
  path.resolve(
    process.env.TRADEMIND_PHASE4_CHECKPOINT_DIR ||
      "system-development/checkpoints"
  );

const CHECKPOINT_FILE =
  path.join(
    CHECKPOINT_DIR,
    "phase-4-learning-ready-experience-checkpoint.json"
  );

const ALLOWED_ACTIONS = new Set([
  "NO_TRADE",
  "PAPER_LONG",
  "PAPER_SHORT"
]);

const ALLOWED_OUTCOMES = new Set([
  "NO_TRADE",
  "WIN",
  "LOSS",
  "FLAT"
]);

const SOURCE_DATASET =
  "V25.7 frozen full_s5";

const SOURCE_CONTEXT =
  "SYSTEM_PHASE_3";

function fail(message) {
  throw new Error(message);
}

function finiteNumber(value, name) {
  if (value === null || value === undefined) {
    return null;
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    fail(`${name} must be finite when provided`);
  }

  return n;
}

function requiredString(value, name) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    fail(`${name} is required`);
  }

  return String(value);
}

function optionalString(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function ensureDirectories() {
  fs.mkdirSync(
    OUTPUT_DIR,
    { recursive: true }
  );

  fs.mkdirSync(
    CHECKPOINT_DIR,
    { recursive: true }
  );
}

function loadPhase3Rows() {
  if (!fs.existsSync(INPUT_FILE)) {
    fail(
      `Phase 3 input not found: ${INPUT_FILE}`
    );
  }

  const lines =
    fs.readFileSync(
      INPUT_FILE,
      "utf8"
    )
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length === 0) {
    fail("Phase 3 input is empty");
  }

  return lines.map(
    (line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        fail(
          `Invalid JSON at Phase 3 line ${index + 1}`
        );
      }
    }
  );
}

function parseTimestamp(value, name) {
  const text =
    requiredString(value, name);

  const milliseconds =
    Date.parse(text);

  if (
    !Number.isFinite(
      milliseconds
    )
  ) {
    fail(
      `${name} is not a valid ISO timestamp`
    );
  }

  return {
    text,
    milliseconds
  };
}

function validateObservation(
  observation,
  index
) {
  if (
    !observation ||
    typeof observation !== "object"
  ) {
    fail(
      `Missing observation at row ${index + 1}`
    );
  }

  const fields = [
    "close",
    "return1",
    "atr",
    "rsi",
    "ema9",
    "ema21",
    "vwap"
  ];

  for (const field of fields) {
    finiteNumber(
      observation[field],
      `row ${index + 1} observation.${field}`
    );
  }
}

function validateOutcome(
  outcome,
  action,
  index
) {
  if (
    !outcome ||
    typeof outcome !== "object"
  ) {
    fail(
      `Missing outcome at row ${index + 1}`
    );
  }

  const status =
    requiredString(
      outcome.status,
      `row ${index + 1} outcome.status`
    );

  if (
    !ALLOWED_OUTCOMES.has(
      status
    )
  ) {
    fail(
      `Invalid outcome ${status} at row ${index + 1}`
    );
  }

  if (
    action === "NO_TRADE" &&
    status !== "NO_TRADE"
  ) {
    fail(
      `NO_TRADE must resolve to NO_TRADE at row ${index + 1}`
    );
  }

  if (
    action !== "NO_TRADE" &&
    status === "NO_TRADE"
  ) {
    fail(
      `Trade action cannot resolve to NO_TRADE at row ${index + 1}`
    );
  }

  finiteNumber(
    outcome.priceChange,
    `row ${index + 1} outcome.priceChange`
  );

  finiteNumber(
    outcome.normalizedReturn,
    `row ${index + 1} outcome.normalizedReturn`
  );

  finiteNumber(
    outcome.barsHeld,
    `row ${index + 1} outcome.barsHeld`
  );

  finiteNumber(
    outcome.maxFavorableExcursion,
    `row ${index + 1} outcome.maxFavorableExcursion`
  );

  finiteNumber(
    outcome.maxAdverseExcursion,
    `row ${index + 1} outcome.maxAdverseExcursion`
  );

  if (
    status !== "NO_TRADE"
  ) {
    const exit =
      parseTimestamp(
        outcome.exitTimestamp,
        `row ${index + 1} outcome.exitTimestamp`
      );

    return exit.milliseconds;
  }

  if (
    outcome.exitTimestamp !== null &&
    outcome.exitTimestamp !== undefined
  ) {
    fail(
      `NO_TRADE outcome must not have exitTimestamp at row ${index + 1}`
    );
  }

  return null;
}

function validateRow(
  row,
  index,
  previousTimestamp
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    fail(
      `Phase 3 row ${index + 1} is not an object`
    );
  }

  const experienceId =
    requiredString(
      row.experienceId,
      `row ${index + 1} experienceId`
    );

  const timestamp =
    parseTimestamp(
      row.timestamp,
      `row ${index + 1} timestamp`
    );

  if (
    previousTimestamp !== null &&
    timestamp.milliseconds <
      previousTimestamp
  ) {
    fail(
      `Phase 3 timestamps are not chronological at row ${index + 1}`
    );
  }

  const instrument =
    requiredString(
      row.instrument,
      `row ${index + 1} instrument`
    );

  const timeframe =
    requiredString(
      row.timeframe,
      `row ${index + 1} timeframe`
    );

  if (
    instrument !== "NIFTY 50"
  ) {
    fail(
      `Unexpected instrument at row ${index + 1}: ${instrument}`
    );
  }

  if (
    timeframe !== "5m"
  ) {
    fail(
      `Unexpected timeframe at row ${index + 1}: ${timeframe}`
    );
  }

  if (
    row.source?.dataset !==
    SOURCE_DATASET
  ) {
    fail(
      `Unexpected source dataset at row ${index + 1}`
    );
  }

  if (
    row.context?.source !==
    SOURCE_CONTEXT
  ) {
    fail(
      `Unexpected context source at row ${index + 1}`
    );
  }

  const action =
    requiredString(
      row.decision?.action,
      `row ${index + 1} decision.action`
    );

  if (
    !ALLOWED_ACTIONS.has(action)
  ) {
    fail(
      `Invalid action at row ${index + 1}: ${action}`
    );
  }

  finiteNumber(
    row.decision?.confidence,
    `row ${index + 1} decision.confidence`
  );

  validateObservation(
    row.observation,
    index
  );

  const exitTimestamp =
    validateOutcome(
      row.outcome,
      action,
      index
    );

  if (
    exitTimestamp !== null &&
    exitTimestamp <
      timestamp.milliseconds
  ) {
    fail(
      `Outcome exit precedes decision timestamp at row ${index + 1}`
    );
  }

  return {
    experienceId,
    timestampText:
      timestamp.text,
    timestampMs:
      timestamp.milliseconds,
    exitTimestampMs:
      exitTimestamp
  };
}

function canonicalRecord(
  row,
  index
) {
  const timestamp =
    parseTimestamp(
      row.timestamp,
      `row ${index + 1} timestamp`
    );

  const action =
    requiredString(
      row.decision.action,
      `row ${index + 1} decision.action`
    );

  const record = {
    schemaVersion:
      "SYSTEM_PHASE_4_LEARNING_READY_V1",

    experienceId:
      row.experienceId,

    timestamp:
      timestamp.text,

    instrument:
      "NIFTY 50",

    timeframe:
      "5m",

    source: {
      dataset:
        SOURCE_DATASET,
      phase:
        "SYSTEM_PHASE_3"
    },

    observation: {
      close:
        finiteNumber(
          row.observation.close,
          "observation.close"
        ),
      return1:
        finiteNumber(
          row.observation.return1,
          "observation.return1"
        ),
      atr:
        finiteNumber(
          row.observation.atr,
          "observation.atr"
        ),
      rsi:
        finiteNumber(
          row.observation.rsi,
          "observation.rsi"
        ),
      ema9:
        finiteNumber(
          row.observation.ema9,
          "observation.ema9"
        ),
      ema21:
        finiteNumber(
          row.observation.ema21,
          "observation.ema21"
        ),
      vwap:
        finiteNumber(
          row.observation.vwap,
          "observation.vwap"
        )
    },

    context: {
      session:
        optionalString(
          row.context?.session
        ),
      direction:
        optionalString(
          row.context?.direction
        ),
      transitionState:
        optionalString(
          row.context?.transitionState
        ),
      source:
        SOURCE_CONTEXT
    },

    decision: {
      action,
      confidence:
        finiteNumber(
          row.decision.confidence,
          "decision.confidence"
        ),
      rationale:
        optionalString(
          row.decision.rationale
        )
    },

    outcome: {
      status:
        requiredString(
          row.outcome.status,
          "outcome.status"
        ),
      exitTimestamp:
        row.outcome.exitTimestamp == null
          ? null
          : requiredString(
              row.outcome.exitTimestamp,
              "outcome.exitTimestamp"
            ),
      priceChange:
        finiteNumber(
          row.outcome.priceChange,
          "outcome.priceChange"
        ),
      normalizedReturn:
        finiteNumber(
          row.outcome.normalizedReturn,
          "outcome.normalizedReturn"
        ),
      barsHeld:
        finiteNumber(
          row.outcome.barsHeld,
          "outcome.barsHeld"
        ),
      maxFavorableExcursion:
        finiteNumber(
          row.outcome.maxFavorableExcursion,
          "outcome.maxFavorableExcursion"
        ),
      maxAdverseExcursion:
        finiteNumber(
          row.outcome.maxAdverseExcursion,
          "outcome.maxAdverseExcursion"
        )
    },

    provenance: {
      sourceExperienceId:
        row.experienceId,
      derivedFrom:
        "SYSTEM_PHASE_3_HISTORICAL_EXPERIENCE_STREAM_V1",
      learningEnabled:
        false,
      strategyPromotionEnabled:
        false,
      realTradingEnabled:
        false
    }
  };

  const payload =
    JSON.stringify(record);

  return {
    ...record,
    recordHash:
      sha256(payload)
  };
}

function auditAndBuild(rows) {
  const ids =
    new Set();

  const timestamps =
    new Set();

  const records = [];

  let previousTimestamp =
    null;

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {
    const row =
      rows[i];

    const meta =
      validateRow(
        row,
        i,
        previousTimestamp
      );

    if (
      ids.has(
        meta.experienceId
      )
    ) {
      fail(
        `Duplicate experienceId: ${meta.experienceId}`
      );
    }

    ids.add(
      meta.experienceId
    );

    const timestampKey =
      String(
        meta.timestampMs
      );

    if (
      timestamps.has(
        timestampKey
      )
    ) {
      fail(
        `Duplicate decision timestamp: ${meta.timestampText}`
      );
    }

    timestamps.add(
      timestampKey
    );

    previousTimestamp =
      meta.timestampMs;

    records.push(
      canonicalRecord(
        row,
        i
      )
    );
  }

  return records;
}

function writeCanonicalRecords(
  records
) {
  const content =
    records
      .map(
        record =>
          JSON.stringify(record)
      )
      .join("\n") +
    "\n";

  fs.writeFileSync(
    OUTPUT_FILE,
    content,
    "utf8"
  );

  return {
    bytes:
      Buffer.byteLength(
        content,
        "utf8"
      ),
    sha256:
      sha256(content)
  };
}

function summarize(
  records,
  fileMeta
) {
  const counts = {
    total: records.length,
    noTrade: 0,
    paperLong: 0,
    paperShort: 0,
    win: 0,
    loss: 0,
    flat: 0
  };

  let sumTradeReturn = 0;
  let tradeCount = 0;

  for (
    const record of records
  ) {
    const action =
      record.decision.action;

    const status =
      record.outcome.status;

    if (action === "NO_TRADE") {
      counts.noTrade++;
    }

    if (action === "PAPER_LONG") {
      counts.paperLong++;
    }

    if (action === "PAPER_SHORT") {
      counts.paperShort++;
    }

    if (status === "WIN") {
      counts.win++;
    }

    if (status === "LOSS") {
      counts.loss++;
    }

    if (status === "FLAT") {
      counts.flat++;
    }

    if (
      action !== "NO_TRADE"
    ) {
      tradeCount++;

      sumTradeReturn +=
        Number(
          record.outcome
            .normalizedReturn || 0
        );
    }
  }

  const tradeWinRate =
    tradeCount > 0
      ? counts.win /
        tradeCount
      : null;

  const meanTradeReturn =
    tradeCount > 0
      ? sumTradeReturn /
        tradeCount
      : null;

  return {
    phase:
      "SYSTEM_DEVELOPMENT_PHASE_4",

    component:
      "EXPERIENCE_CONSOLIDATION_LEARNING_READY_MEMORY",

    version:
      VERSION,

    status:
      "READY",

    source:
      SOURCE_DATASET,

    inputFile:
      INPUT_FILE,

    outputFile:
      OUTPUT_FILE,

    records:
      counts,

    tradeCount,

    tradeWinRate,

    meanTradeNormalizedReturn:
      meanTradeReturn,

    file:
      fileMeta,

    integrity: {
      uniqueExperienceIds:
        true,
      uniqueDecisionTimestamps:
        true,
      chronological:
        true,
      sourceValidated:
        true,
      outcomeValidated:
        true,
      schemaValidated:
        true
    },

    safety: {
      realTradingEnabled:
        false,
      brokerIntegrationEnabled:
        false,
      liveDataEnabled:
        false,
      learnerEnabled:
        false,
      parameterOptimizationEnabled:
        false,
      featureSelectionEnabled:
        false,
      strategyModificationEnabled:
        false,
      strategyPromotionEnabled:
        false
    },

    nextStage:
      "CONTROLLED_LEARNING_LAYER"
  };
}

function writeCheckpoint(
  summary
) {
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify(
      summary,
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function main() {
  ensureDirectories();

  const rows =
    loadPhase3Rows();

  const records =
    auditAndBuild(
      rows
    );

  if (
    records.length === 0
  ) {
    fail(
      "No learning-ready records were produced"
    );
  }

  const fileMeta =
    writeCanonicalRecords(
      records
    );

  const summary =
    summarize(
      records,
      fileMeta
    );

  writeCheckpoint(
    summary
  );

  console.log(
    "=== TRADEMIND PRO PHASE 4 ==="
  );

  console.log(
    "EXPERIENCE_CONSOLIDATION_COMPLETE"
  );

  console.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );
}

if (
  require.main === module
) {
  main();
}

module.exports = {
  VERSION,
  INPUT_FILE,
  OUTPUT_FILE,
  CHECKPOINT_FILE,
  loadPhase3Rows,
  validateRow,
  auditAndBuild,
  summarize,
  main
};

/*
===========================================================
 TradeMind Pro
 V25.32 — CONTROLLED REGIME-TRANSITION RESEARCH
===========================================================

PURPOSE
-------
Determine whether the observed EMA relationship changes
directionally when the market transitions between regime
states.

RESEARCH ONLY
-------------
- Uses the frozen V25.10 learning dataset.
- No feature selection.
- No threshold search.
- No parameter optimization.
- No P&L ranking.
- No cherry-picking.
- No strategy promotion.
- No live trading.
- No broker orders.

IMPORTANT V25.10 SCHEMA
-----------------------
V25.10 stores the actual learning rows at:

  learningDataset.records[]

Each record contains:

  {
    timestamp,
    istDate,
    features: {
      ema9,
      ema21,
      ...
    },
    label: {
      futureReturn,
      futureMovePoints,
      futureDirection,
      horizonCandles
    }
  }

V25.32 therefore uses:
- EMA9 vs EMA21 from the frozen FEATURES to define regime.
- Existing frozen FUTURE LABELS only as descriptive outcomes.

Future labels are NEVER used to define the regime itself.

OUTPUT
------
v25_32_controlled_regime_transition_research.json
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "V25.32";
const DATASET_VERSION = "V25.10";
const INPUT_NAME = "v25_10_learning_dataset.json";
const OUTPUT_NAME = "v25_32_controlled_regime_transition_research.json";

const WINDOW = 3;

function fail(message) {
  throw new Error(message);
}

function firstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function text(v) {
  if (v === undefined || v === null) return null;

  const s = String(v).trim();
  return s ? s : null;
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function timestamp(row, index) {
  const raw =
    row.timestamp ??
    row.time ??
    row.datetime ??
    row.date ??
    row.Date ??
    row.dateTime;

  const numeric = num(raw);

  if (numeric !== null) {
    return numeric;
  }

  const parsed = Date.parse(String(raw ?? ""));

  return Number.isFinite(parsed)
    ? parsed
    : index;
}

/*
-----------------------------------------------------------
LOAD FROZEN V25.10 DATASET
-----------------------------------------------------------
*/

const inputPath = firstExisting([
  path.resolve(INPUT_NAME),
  path.resolve(process.cwd(), INPUT_NAME),
  path.resolve(__dirname, INPUT_NAME),
  path.resolve(process.cwd(), ".github", "scripts", INPUT_NAME)
]);

if (!inputPath) {
  fail(`Frozen ${DATASET_VERSION} dataset not found: ${INPUT_NAME}`);
}

const raw = loadJson(inputPath);

/*
V25.10's authoritative learning rows are:

  raw.learningDataset.records

Compatibility fallbacks are retained only so the research
script remains safe if the frozen file is wrapped differently.
*/
function unwrapRows(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    value.learningDataset &&
    Array.isArray(value.learningDataset.records)
  ) {
    return value.learningDataset.records;
  }

  const keys = [
    "rows",
    "data",
    "candles",
    "dataset",
    "records",
    "items"
  ];

  for (const key of keys) {
    if (value && Array.isArray(value[key])) {
      return value[key];
    }
  }

  return null;
}

const rows = unwrapRows(raw);

if (!rows || rows.length < 20) {
  fail(
    `Frozen ${DATASET_VERSION} dataset records must contain at least 20 rows.`
  );
}

/*
-----------------------------------------------------------
VERIFY THE FROZEN DATASET STRUCTURE
-----------------------------------------------------------
*/

const normalized = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i] || {};

  const features =
    row.features &&
    typeof row.features === "object"
      ? row.features
      : row;

  const label =
    row.label &&
    typeof row.label === "object"
      ? row.label
      : {};

  const ema9 = num(
    features.ema9 ??
    features.EMA9 ??
    features.ema_9 ??
    features.EMA_9
  );

  const ema21 = num(
    features.ema21 ??
    features.EMA21 ??
    features.ema_21 ??
    features.EMA_21
  );

  const futureReturn = num(
    label.futureReturn ??
    row.futureReturn
  );

  const futureMovePoints = num(
    label.futureMovePoints ??
    row.futureMovePoints
  );

  const futureDirection = text(
    label.futureDirection ??
    row.futureDirection
  );

  if (
    ema9 === null ||
    ema21 === null ||
    futureReturn === null
  ) {
    continue;
  }

  normalized.push({
    index: i,
    t: timestamp(row, i),
    istDate: text(row.istDate),
    ema9,
    ema21,
    futureReturn,
    futureMovePoints,
    futureDirection
  });
}

if (normalized.length < 20) {
  fail(
    "Frozen V25.10 dataset has fewer than 20 usable learning records after schema validation."
  );
}

/*
-----------------------------------------------------------
DETERMINISTIC REGIME STATE
-----------------------------------------------------------

CRITICAL:
FutureReturn / futureDirection are NOT used here.

BULL:
  EMA9 > EMA21

BEAR:
  EMA9 < EMA21

UNKNOWN:
  EMA9 === EMA21
-----------------------------------------------------------
*/

function regimeAt(record) {
  if (record.ema9 > record.ema21) {
    return "BULL";
  }

  if (record.ema9 < record.ema21) {
    return "BEAR";
  }

  return "UNKNOWN";
}

const states = normalized.map(regimeAt);

/*
-----------------------------------------------------------
REGIME TRANSITIONS
-----------------------------------------------------------
*/

const transitions = [];

for (let i = 1; i < normalized.length; i++) {
  const from = states[i - 1];
  const to = states[i];

  if (from === "UNKNOWN" || to === "UNKNOWN") {
    continue;
  }

  if (from !== to) {
    transitions.push({
      index: i,
      from,
      to,
      timestamp: normalized[i].t,
      istDate: normalized[i].istDate
    });
  }
}

/*
-----------------------------------------------------------
DESCRIPTIVE OUTCOME SUMMARY
-----------------------------------------------------------

The frozen futureReturn is already part of V25.10's
diagnostic label. It is used only to describe what was
observed around each regime state/transition.

No threshold, trade rule, score, or ranking is created.
-----------------------------------------------------------
*/

function summarizeSegment(start, end) {
  let observations = 0;
  let positiveFutureReturns = 0;
  let futureReturnSum = 0;
  let directionUp = 0;
  let directionDown = 0;

  for (let i = start; i < end; i++) {
    const row = normalized[i];

    if (!row) {
      continue;
    }

    observations++;

    if (row.futureReturn > 0) {
      positiveFutureReturns++;
    }

    futureReturnSum += row.futureReturn;

    const direction =
      row.futureDirection
        ? row.futureDirection.toUpperCase()
        : null;

    if (
      direction === "UP" ||
      direction === "BULL" ||
      direction === "LONG"
    ) {
      directionUp++;
    }

    if (
      direction === "DOWN" ||
      direction === "BEAR" ||
      direction === "SHORT"
    ) {
      directionDown++;
    }
  }

  return {
    observations,
    positiveFutureReturns,
    positiveRate:
      observations
        ? positiveFutureReturns / observations
        : null,
    meanFutureReturn:
      observations
        ? futureReturnSum / observations
        : null,
    directionUp,
    directionDown
  };
}

/*
-----------------------------------------------------------
STATE SUMMARY
-----------------------------------------------------------
*/

const stateSummary = {};

for (let i = 0; i < states.length; i++) {
  const state = states[i];

  if (!stateSummary[state]) {
    stateSummary[state] = summarizeSegment(0, 0);

    stateSummary[state] = {
      observations: 0,
      positiveFutureReturns: 0,
      positiveRate: null,
      meanFutureReturn: null,
      directionUp: 0,
      directionDown: 0
    };
  }

  const row = normalized[i];

  if (!row) {
    continue;
  }

  const s = stateSummary[state];

  s.observations++;

  if (row.futureReturn > 0) {
    s.positiveFutureReturns++;
  }

  if (
    row.futureDirection &&
    ["UP", "BULL", "LONG"].includes(
      row.futureDirection.toUpperCase()
    )
  ) {
    s.directionUp++;
  }

  if (
    row.futureDirection &&
    ["DOWN", "BEAR", "SHORT"].includes(
      row.futureDirection.toUpperCase()
    )
  ) {
    s.directionDown++;
  }
}

for (const state of Object.keys(stateSummary)) {
  const s = stateSummary[state];

  /*
  Recalculate mean without retaining a hidden ranking field.
  */
  let sum = 0;

  for (let i = 0; i < states.length; i++) {
    if (states[i] === state && normalized[i]) {
      sum += normalized[i].futureReturn;
    }
  }

  s.positiveRate =
    s.observations
      ? s.positiveFutureReturns / s.observations
      : null;

  s.meanFutureReturn =
    s.observations
      ? sum / s.observations
      : null;
}

/*
-----------------------------------------------------------
TRANSITION WINDOWS
-----------------------------------------------------------
*/

const transitionWindows = [];

for (const transition of transitions) {
  const beforeStart =
    Math.max(0, transition.index - WINDOW);

  const beforeEnd =
    transition.index;

  const afterStart =
    transition.index;

  const afterEnd =
    Math.min(
      normalized.length,
      transition.index + WINDOW
    );

  const before =
    summarizeSegment(
      beforeStart,
      beforeEnd
    );

  const after =
    summarizeSegment(
      afterStart,
      afterEnd
    );

  const beforeMean =
    before.meanFutureReturn;

  const afterMean =
    after.meanFutureReturn;

  const directionChanged =
    beforeMean !== null &&
    afterMean !== null &&
    Math.sign(beforeMean) !==
      Math.sign(afterMean);

  transitionWindows.push({
    ...transition,
    windowObservations: WINDOW,
    before,
    after,
    directionChanged
  });
}

/*
-----------------------------------------------------------
DESCRIPTIVE CLASSIFICATION
-----------------------------------------------------------
*/

const interpretableTransitions =
  transitionWindows.filter(
    item =>
      item.before.meanFutureReturn !== null &&
      item.after.meanFutureReturn !== null
  ).length;

const directionChangedTransitionCount =
  transitionWindows.filter(
    item => item.directionChanged
  ).length;

let classification =
  "MIXED_DESCRIPTIVE_EVIDENCE";

if (interpretableTransitions === 0) {
  classification =
    "INSUFFICIENT_TRANSITION_EVIDENCE";
} else if (directionChangedTransitionCount === 0) {
  classification =
    "STABLE_DESCRIPTIVE_DIRECTION";
}

/*
-----------------------------------------------------------
RESULT
-----------------------------------------------------------
*/

const datasetFingerprint =
  sha256(
    fs.readFileSync(inputPath)
  );

const result = {
  status:
    "CONTROLLED_REGIME_TRANSITION_RESEARCH_COMPLETE",

  version: VERSION,

  mode:
    "controlled_descriptive_research",

  dataset: {
    requiredVersion:
      DATASET_VERSION,

    sourceFile:
      path.basename(inputPath),

    rowsRead:
      rows.length,

    usableRows:
      normalized.length,

    sha256:
      datasetFingerprint
  },

  researchQuestion:
    "Does the EMA9-versus-EMA21 relationship remain directionally interpretable through regime transitions, or does the observed future behavior materially change when the EMA-defined market state transitions?",

  regimeMethod: {
    source:
      "V25.10 frozen learning-record features",

    stateDefinition:
      "EMA9 > EMA21 = BULL; EMA9 < EMA21 = BEAR; equal = UNKNOWN",

    futureOutcomeUsedToDefineRegime:
      false,

    thresholdSearch:
      false,

    parameterSearch:
      false,

    optimization:
      false
  },

  transitionAnalysis: {
    transitionCount:
      transitions.length,

    interpretableTransitionCount:
      interpretableTransitions,

    directionChangedTransitionCount:
      directionChangedTransitionCount,

    transitionWindowObservations:
      WINDOW
  },

  stateSummary,

  transitionWindows,

  conclusion: {
    classification,

    featureSelection:
      false,

    thresholdOptimization:
      false,

    parameterOptimization:
      false,

    pAndLRanking:
      false,

    strategyPromotion:
      false,

    predictiveClaim:
      false,

    liveTrading:
      false,

    brokerOrders:
      false
  },

  prohibitedConclusions: [
    "feature_is_profitable",
    "feature_should_be_traded",
    "feature_is_optimal",
    "feature_is_predictive_out_of_sample",
    "feature_should_be_promoted_to_strategy"
  ],

  nextStage:
    "V25.33",

  generatedAtUtc:
    new Date().toISOString()
};

fs.writeFileSync(
  OUTPUT_NAME,
  JSON.stringify(result, null, 2) + "\n"
);

console.log(
  JSON.stringify(result, null, 2)
);

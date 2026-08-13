/*
===========================================================
 TradeMind Pro
 V25.34 — CONTROLLED TRANSITION CONTEXT RESEARCH
===========================================================

PURPOSE
-------
Determine whether the descriptive transition behavior identified
in V25.32/V25.33 varies with NON-OPTIMIZED context surrounding
the transition.

Context dimensions are fixed in advance:
- market-session clock context
- pre-transition regime persistence
- existing frozen feature snapshot at transition

This is descriptive research only.

RESEARCH CONTROLS
-----------------
- Frozen V25.10 learning dataset only.
- V25.33 transition attribution is the source evidence.
- No feature creation for trading.
- No threshold search.
- No parameter optimization.
- No P&L ranking.
- No cherry-picking.
- No strategy promotion.
- No predictive claim.
- No live trading.
- No broker orders.

IMPORTANT
---------
V25.34 does NOT search for a profitable transition context.
It describes whether transition observations occur under
different pre-defined contexts.

OUTPUT
------
v25_34_controlled_transition_context_research.json
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "V25.34";
const DATASET_VERSION = "V25.10";
const SOURCE_VERSION = "V25.33";

const SOURCE_NAME =
  "v25_33_controlled_transition_direction_attribution.json";

const DATASET_NAME =
  "v25_10_learning_dataset.json";

const OUTPUT_NAME =
  "v25_34_controlled_transition_context_research.json";

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
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function mean(values) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2
    ? a[m]
    : (a[m - 1] + a[m]) / 2;
}

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

function getRecords(raw) {
  if (
    raw &&
    raw.learningDataset &&
    Array.isArray(raw.learningDataset.records)
  ) {
    return raw.learningDataset.records;
  }

  if (Array.isArray(raw)) return raw;

  for (const key of ["records", "rows", "data", "items"]) {
    if (raw && Array.isArray(raw[key])) return raw[key];
  }

  return null;
}

function getFeatures(row) {
  return row && row.features && typeof row.features === "object"
    ? row.features
    : row || {};
}

function getLabel(row) {
  return row && row.label && typeof row.label === "object"
    ? row.label
    : {};
}

function getTimestamp(row, index) {
  const raw =
    row.timestamp ??
    row.ts ??
    row.time ??
    row.datetime ??
    row.date ??
    row.dateTime;

  const n = num(raw);
  if (n !== null) return n < 100000000000 ? n * 1000 : n;

  const parsed = Date.parse(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : index;
}

function istParts(timestamp) {
  const d = new Date(timestamp + 5.5 * 60 * 60 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes()
  };
}

/*
-----------------------------------------------------------
LOAD V25.33 SOURCE
-----------------------------------------------------------
*/

const sourcePath = firstExisting([
  path.resolve(SOURCE_NAME),
  path.resolve(process.cwd(), SOURCE_NAME),
  path.resolve(__dirname, SOURCE_NAME)
]);

if (!sourcePath) {
  fail(`V25.33 source not found: ${SOURCE_NAME}`);
}

const source = loadJson(sourcePath);

if (source.version !== SOURCE_VERSION) {
  fail(`Expected ${SOURCE_VERSION}, received ${source.version || "unknown"}.`);
}

if (
  source.status !==
  "CONTROLLED_TRANSITION_DIRECTION_ATTRIBUTION_COMPLETE"
) {
  fail("V25.33 source is not a completed attribution result.");
}

if (
  !source.controls ||
  source.controls.featureSelection !== false ||
  source.controls.thresholdSearch !== false ||
  source.controls.parameterSearch !== false ||
  source.controls.optimization !== false ||
  source.controls.pAndLRanking !== false ||
  source.controls.cherryPicking !== false ||
  source.controls.strategyPromotion !== false ||
  source.controls.predictiveClaim !== false ||
  source.controls.liveTrading !== false ||
  source.controls.brokerOrders !== false
) {
  fail("V25.33 research controls are invalid.");
}

/*
-----------------------------------------------------------
LOAD FROZEN V25.10 DATASET
-----------------------------------------------------------
*/

const datasetPath = firstExisting([
  path.resolve(DATASET_NAME),
  path.resolve(process.cwd(), DATASET_NAME),
  path.resolve(__dirname, DATASET_NAME)
]);

if (!datasetPath) {
  fail(`Frozen ${DATASET_VERSION} dataset not found: ${DATASET_NAME}`);
}

const dataset = loadJson(datasetPath);

const records = getRecords(dataset);

if (!records || records.length < 20) {
  fail("Frozen V25.10 dataset does not contain sufficient records.");
}

if (
  dataset.status &&
  dataset.status !== "DATASET_FREEZE_COMPLETE"
) {
  fail(`Unexpected V25.10 status: ${dataset.status}`);
}

/*
-----------------------------------------------------------
NORMALIZE RECORDS
-----------------------------------------------------------
*/

const normalized = records.map((row, index) => {
  const f = getFeatures(row);
  const l = getLabel(row);
  const t = getTimestamp(row, index);
  const ist = istParts(t);

  const ema9 = num(
    f.ema9 ?? f.EMA9 ?? f.ema_9 ?? f.EMA_9
  );

  const ema21 = num(
    f.ema21 ?? f.EMA21 ?? f.ema_21 ?? f.EMA_21
  );

  return {
    index,
    timestamp: t,
    istDate: row.istDate ?? ist.date,
    hour: ist.hour,
    minute: ist.minute,
    ema9,
    ema21,
    futureReturn: num(l.futureReturn ?? row.futureReturn),
    features: f
  };
});

function regimeAt(row) {
  if (row.ema9 === null || row.ema21 === null) return "UNKNOWN";
  if (row.ema9 > row.ema21) return "BULL";
  if (row.ema9 < row.ema21) return "BEAR";
  return "UNKNOWN";
}

const states = normalized.map(regimeAt);

/*
-----------------------------------------------------------
SESSION CONTEXT
-----------------------------------------------------------

Fixed market-clock descriptions.
No data-driven thresholds are searched.

OPEN      09:15 - 10:30
MIDDAY    10:35 - 13:30
LATE      13:35 - 15:15
OTHER     outside these fixed windows
-----------------------------------------------------------
*/

function sessionContext(hour, minute) {
  const m = hour * 60 + minute;

  if (m >= 9 * 60 + 15 && m <= 10 * 60 + 30) {
    return "OPEN";
  }

  if (m >= 10 * 60 + 35 && m <= 13 * 60 + 30) {
    return "MIDDAY";
  }

  if (m >= 13 * 60 + 35 && m <= 15 * 60 + 15) {
    return "LATE";
  }

  return "OTHER";
}

/*
-----------------------------------------------------------
PRE-TRANSITION PERSISTENCE
-----------------------------------------------------------

Count consecutive identical regime observations immediately
before the transition. This is descriptive state history,
not an optimized threshold.
-----------------------------------------------------------
*/

function persistenceBefore(index, fromState) {
  let count = 0;

  for (let i = index - 1; i >= 0; i--) {
    if (states[i] !== fromState) break;
    count++;
  }

  return count;
}

function pickFeature(features, names) {
  for (const name of names) {
    const value = num(features?.[name]);
    if (value !== null) return value;
  }
  return null;
}

/*
-----------------------------------------------------------
BUILD TRANSITION CONTEXT OBSERVATIONS
-----------------------------------------------------------
*/

const sourceWindows = Array.isArray(source.transitionWindows)
  ? source.transitionWindows
  : [];

if (!sourceWindows.length) {
  fail("V25.33 contains no transition windows.");
}

const observations = [];

for (const w of sourceWindows) {
  const index = Number(w.index);

  if (!Number.isInteger(index) || index < 1 || index >= normalized.length) {
    continue;
  }

  const row = normalized[index];
  const from = w.from;
  const to = w.to;

  if (
    !(
      (from === "BULL" && to === "BEAR") ||
      (from === "BEAR" && to === "BULL")
    )
  ) {
    continue;
  }

  const persistence = persistenceBefore(index, from);

  const f = row.features || {};

  observations.push({
    index,
    timestamp: row.timestamp,
    istDate: row.istDate,
    hour: row.hour,
    minute: row.minute,
    sessionContext: sessionContext(row.hour, row.minute),

    transitionDirection:
      from === "BULL" && to === "BEAR"
        ? "BULL_TO_BEAR"
        : "BEAR_TO_BULL",

    from,
    to,

    preTransitionRegimePersistence: persistence,

    /*
    Existing frozen feature snapshot only.
    These are not newly engineered trading features.
    */
    preTransitionFeatureSnapshot: {
      ema9: row.ema9,
      ema21: row.ema21,
      emaSpread: pickFeature(f, [
        "emaSpread",
        "ema_spread",
        "EMA_spread"
      ]),
      emaSpreadAtr: pickFeature(f, [
        "emaSpreadAtr",
        "ema_spread_atr",
        "emaSpreadATR"
      ]),
      rsi14: pickFeature(f, [
        "rsi14",
        "RSI14",
        "rsi_14"
      ]),
      atr14: pickFeature(f, [
        "atr14",
        "ATR14",
        "atr_14"
      ]),
      vwapDistanceAtr: pickFeature(f, [
        "vwapDistanceAtr",
        "vwap_distance_atr"
      ]),
      bodyRatio: pickFeature(f, [
        "bodyRatio",
        "body_ratio"
      ]),
      effectiveVolumeRatio: pickFeature(f, [
        "effectiveVolumeRatio",
        "effective_volume_ratio"
      ])
    },

    /*
    Inherited descriptive outcome from V25.32.
    It is never used to define context.
    */
    directionChanged:
      w.directionChanged === true,

    beforeMeanFutureReturn:
      num(w.before?.meanFutureReturn),

    afterMeanFutureReturn:
      num(w.after?.meanFutureReturn)
  });
}

if (!observations.length) {
  fail("No valid V25.33 transition observations could be aligned to V25.10.");
}

/*
-----------------------------------------------------------
AGGREGATION
-----------------------------------------------------------
*/

function summarize(items) {
  const persistence = items
    .map(x => x.preTransitionRegimePersistence)
    .filter(Number.isFinite);

  const beforeReturns = items
    .map(x => x.beforeMeanFutureReturn)
    .filter(Number.isFinite);

  const afterReturns = items
    .map(x => x.afterMeanFutureReturn)
    .filter(Number.isFinite);

  const changed = items.filter(x => x.directionChanged).length;

  return {
    observations: items.length,
    interpretableOutcomeObservations:
      beforeReturns.length,
    directionChangedCount: changed,
    directionChangedRate:
      beforeReturns.length
        ? changed / beforeReturns.length
        : null,

    meanPreTransitionRegimePersistence:
      mean(persistence),

    medianPreTransitionRegimePersistence:
      median(persistence),

    meanBeforeWindowFutureReturn:
      mean(beforeReturns),

    meanAfterWindowFutureReturn:
      mean(afterReturns)
  };
}

const byDirection = {
  BULL_TO_BEAR: summarize(
    observations.filter(x => x.transitionDirection === "BULL_TO_BEAR")
  ),
  BEAR_TO_BULL: summarize(
    observations.filter(x => x.transitionDirection === "BEAR_TO_BULL")
  )
};

const bySession = {};

for (const session of ["OPEN", "MIDDAY", "LATE", "OTHER"]) {
  const items = observations.filter(
    x => x.sessionContext === session
  );

  bySession[session] = summarize(items);
}

const sessionByDirection = {};

for (const direction of ["BULL_TO_BEAR", "BEAR_TO_BULL"]) {
  sessionByDirection[direction] = {};

  for (const session of ["OPEN", "MIDDAY", "LATE", "OTHER"]) {
    sessionByDirection[direction][session] = summarize(
      observations.filter(
        x =>
          x.transitionDirection === direction &&
          x.sessionContext === session
      )
    );
  }
}

/*
-----------------------------------------------------------
FEATURE CONTEXT DESCRIPTIVE SUMMARY
-----------------------------------------------------------
*/

function featureSummary(items, key) {
  const values = items
    .map(x => x.preTransitionFeatureSnapshot[key])
    .filter(Number.isFinite);

  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null
  };
}

const featureContext = {};

for (const key of [
  "ema9",
  "ema21",
  "emaSpread",
  "emaSpreadAtr",
  "rsi14",
  "atr14",
  "vwapDistanceAtr",
  "bodyRatio",
  "effectiveVolumeRatio"
]) {
  featureContext[key] = {
    ALL: featureSummary(observations, key),
    BULL_TO_BEAR: featureSummary(
      observations.filter(x => x.transitionDirection === "BULL_TO_BEAR"),
      key
    ),
    BEAR_TO_BULL: featureSummary(
      observations.filter(x => x.transitionDirection === "BEAR_TO_BULL"),
      key
    )
  };
}

/*
-----------------------------------------------------------
CLASSIFICATION
-----------------------------------------------------------
*/

const directionCounts = {
  BULL_TO_BEAR:
    observations.filter(x => x.transitionDirection === "BULL_TO_BEAR").length,
  BEAR_TO_BULL:
    observations.filter(x => x.transitionDirection === "BEAR_TO_BULL").length
};

let classification = "MIXED_CONTEXT_DESCRIPTIVE_EVIDENCE";

if (
  directionCounts.BULL_TO_BEAR === 0 ||
  directionCounts.BEAR_TO_BULL === 0
) {
  classification = "ONE_SIDED_CONTEXT_COVERAGE";
} else if (
  bySession.OPEN.observations === 0 &&
  bySession.MIDDAY.observations === 0 &&
  bySession.LATE.observations === 0
) {
  classification = "INSUFFICIENT_SESSION_CONTEXT";
}

/*
-----------------------------------------------------------
RESULT
-----------------------------------------------------------
*/

const result = {
  status:
    "CONTROLLED_TRANSITION_CONTEXT_RESEARCH_COMPLETE",

  version: VERSION,

  mode:
    "controlled_descriptive_context_research",

  source: {
    version: SOURCE_VERSION,
    file: path.basename(sourcePath),
    sha256: sha256File(sourcePath)
  },

  frozenDataset: {
    requiredVersion: DATASET_VERSION,
    file: path.basename(datasetPath),
    sha256: sha256File(datasetPath),
    rowsAvailable: records.length,
    alignedTransitionObservations: observations.length
  },

  researchQuestion:
    "Does descriptive transition behavior vary with fixed session context, pre-transition regime persistence, or the existing frozen feature state immediately at the transition?",

  controls: {
    featureSelection: false,
    thresholdSearch: false,
    parameterSearch: false,
    optimization: false,
    pAndLRanking: false,
    cherryPicking: false,
    newTradingFeatures: false,
    strategyPromotion: false,
    predictiveClaim: false,
    liveTrading: false,
    brokerOrders: false
  },

  contextDefinitions: {
    sessionContext: {
      OPEN: "09:15-10:30 IST",
      MIDDAY: "10:35-13:30 IST",
      LATE: "13:35-15:15 IST",
      OTHER: "outside the fixed session windows"
    },

    persistence:
      "number of consecutive frozen EMA-defined regime observations immediately preceding the transition",

    featureSnapshot:
      "existing V25.10 frozen feature values at the transition observation; no new feature is constructed"
  },

  transitionUniverse: {
    sourceTransitionWindows: sourceWindows.length,
    alignedObservations: observations.length,
    bullToBear: directionCounts.BULL_TO_BEAR,
    bearToBull: directionCounts.BEAR_TO_BULL
  },

  byDirection,
  bySession,
  sessionByDirection,
  featureContext,

  observations,

  descriptiveClassification: classification,

  interpretationRules: {
    contextIsDescriptiveOnly: true,
    noContextWasSelected: true,
    noThresholdWasSearched: true,
    noParameterWasOptimized: true,
    noProfitabilityClaim: true,
    noPredictiveClaim: true
  },

  prohibitedConclusions: [
    "a_context_is_profitable",
    "a_context_should_be_traded",
    "a_context_is_optimal",
    "a_context_is_predictive_out_of_sample",
    "a_context_should_be_promoted_to_strategy"
  ],

  nextStage:
    "V25.35_CONTROLLED_TRANSITION_TEMPORAL_REPLICATION",

  generatedAtUtc:
    new Date().toISOString()
};

fs.writeFileSync(
  OUTPUT_NAME,
  JSON.stringify(result, null, 2) + "\n"
);

console.log(JSON.stringify(result, null, 2));

/*
===========================================================
 TradeMind Pro
 V25.34 — APPROACH 3
 CONTROLLED TRANSITION CONTEXT RESEARCH
===========================================================

PURPOSE
-------
Use V25.32 transitionWindows[] as the row-level transition
evidence and V25.33 as an independent aggregate confirmation.

IMPORTANT SOURCE-LINEAGE RULE
-----------------------------
V25.33 does NOT contain transitionWindows[].
V25.32 does.

Therefore:
  V25.32 = PRIMARY ROW-LEVEL SOURCE
  V25.33 = INDEPENDENT DIRECTIONAL CONFIRMATION

This script must never attempt to read transitionWindows[]
from V25.33.

RESEARCH CONTROLS
-----------------
- Frozen V25.10 learning dataset only.
- No feature selection.
- No threshold search.
- No parameter search.
- No optimization.
- No P&L ranking.
- No cherry-picking.
- No new trading features.
- No strategy promotion.
- No predictive claim.
- No live trading.
- No broker orders.

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

const V25_32_NAME =
  "v25_32_controlled_regime_transition_research.json";

const V25_33_NAME =
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

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
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
    row.dateTime ??
    row.date;

  const n = num(raw);

  if (n !== null) {
    return n < 100000000000 ? n * 1000 : n;
  }

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

function pickFeature(features, names) {
  for (const name of names) {
    const value = num(features?.[name]);
    if (value !== null) return value;
  }
  return null;
}

/*
-----------------------------------------------------------
LOAD PRIMARY V25.32 SOURCE
-----------------------------------------------------------
*/

const v25_32_path = firstExisting([
  path.resolve(V25_32_NAME),
  path.resolve(process.cwd(), V25_32_NAME),
  path.resolve(__dirname, V25_32_NAME)
]);

if (!v25_32_path) {
  fail(`V25.32 source not found: ${V25_32_NAME}`);
}

const v25_32 = loadJson(v25_32_path);

if (v25_32.version !== "V25.32") {
  fail(
    `Expected V25.32 source, received ${v25_32.version || "unknown"}.`
  );
}

if (
  v25_32.status !==
  "CONTROLLED_REGIME_TRANSITION_RESEARCH_COMPLETE"
) {
  fail("V25.32 source is not a completed transition research result.");
}

if (!Array.isArray(v25_32.transitionWindows)) {
  fail("V25.32 does not contain transitionWindows[].");
}

if (v25_32.transitionWindows.length < 1) {
  fail("V25.32 contains no transition windows.");
}

/*
-----------------------------------------------------------
LOAD INDEPENDENT V25.33 CONFIRMATION
-----------------------------------------------------------
*/

const v25_33_path = firstExisting([
  path.resolve(V25_33_NAME),
  path.resolve(process.cwd(), V25_33_NAME),
  path.resolve(__dirname, V25_33_NAME)
]);

if (!v25_33_path) {
  fail(`V25.33 source not found: ${V25_33_NAME}`);
}

const v25_33 = loadJson(v25_33_path);

if (v25_33.version !== "V25.33") {
  fail(
    `Expected V25.33 source, received ${v25_33.version || "unknown"}.`
  );
}

if (
  v25_33.status !==
  "CONTROLLED_TRANSITION_DIRECTION_ATTRIBUTION_COMPLETE"
) {
  fail("V25.33 source is not a completed attribution result.");
}

if (!v25_33.attribution) {
  fail("V25.33 attribution object is missing.");
}

if (
  !v25_33.attribution.BULL_TO_BEAR ||
  !v25_33.attribution.BEAR_TO_BULL
) {
  fail("V25.33 directional attribution is incomplete.");
}

const v25_33_controls = v25_33.controls || {};

for (const key of [
  "featureSelection",
  "thresholdSearch",
  "parameterSearch",
  "optimization",
  "pAndLRanking",
  "cherryPicking",
  "strategyPromotion",
  "predictiveClaim",
  "liveTrading",
  "brokerOrders"
]) {
  if (v25_33_controls[key] !== false) {
    fail(`V25.33 control failed: ${key}`);
  }
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
NORMALIZE DATASET
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
    futureReturn: num(
      l.futureReturn ??
      row.futureReturn ??
      row.future_return
    ),
    features: f
  };
});

function regimeAt(row) {
  if (row.ema9 === null || row.ema21 === null) {
    return "UNKNOWN";
  }

  if (row.ema9 > row.ema21) return "BULL";
  if (row.ema9 < row.ema21) return "BEAR";

  return "UNKNOWN";
}

const states = normalized.map(regimeAt);

/*
-----------------------------------------------------------
FIXED SESSION CONTEXT
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

function persistenceBefore(index, fromState) {
  let count = 0;

  for (let i = index - 1; i >= 0; i--) {
    if (states[i] !== fromState) break;
    count++;
  }

  return count;
}

/*
-----------------------------------------------------------
ALIGN V25.32 TRANSITION WINDOWS TO V25.10
-----------------------------------------------------------
*/

const observations = [];

for (const w of v25_32.transitionWindows) {
  const index = Number(
    w.index ??
    w.transitionIndex ??
    w.rowIndex ??
    w.startIndex
  );

  if (
    !Number.isInteger(index) ||
    index < 1 ||
    index >= normalized.length
  ) {
    continue;
  }

  const from =
    w.from ??
    w.fromRegime ??
    w.beforeRegime;

  const to =
    w.to ??
    w.toRegime ??
    w.afterRegime;

  if (
    !(
      (from === "BULL" && to === "BEAR") ||
      (from === "BEAR" && to === "BULL")
    )
  ) {
    continue;
  }

  const row = normalized[index];
  const f = row.features || {};

  observations.push({
    index,
    timestamp: row.timestamp,
    istDate: row.istDate,
    hour: row.hour,
    minute: row.minute,

    sessionContext: sessionContext(
      row.hour,
      row.minute
    ),

    transitionDirection:
      from === "BULL" && to === "BEAR"
        ? "BULL_TO_BEAR"
        : "BEAR_TO_BULL",

    from,
    to,

    preTransitionRegimePersistence:
      persistenceBefore(index, from),

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

    directionChanged:
      w.directionChanged === true ||
      w.directionChanged === "true",

    beforeMeanFutureReturn:
      num(
        w.before?.meanFutureReturn ??
        w.beforeMeanFutureReturn
      ),

    afterMeanFutureReturn:
      num(
        w.after?.meanFutureReturn ??
        w.afterMeanFutureReturn
      )
  });
}

if (!observations.length) {
  fail(
    "No valid V25.32 transition observations could be aligned to V25.10."
  );
}

/*
-----------------------------------------------------------
V25.32 ↔ V25.33 INDEPENDENT CONFIRMATION
-----------------------------------------------------------
*/

const primaryBullToBear = observations.filter(
  x => x.transitionDirection === "BULL_TO_BEAR"
).length;

const primaryBearToBull = observations.filter(
  x => x.transitionDirection === "BEAR_TO_BULL"
).length;

const confirmedBullToBear =
  Number(
    v25_33.attribution.BULL_TO_BEAR.transitionCount
  );

const confirmedBearToBull =
  Number(
    v25_33.attribution.BEAR_TO_BULL.transitionCount
  );

if (
  Number.isFinite(confirmedBullToBear) &&
  primaryBullToBear !== confirmedBullToBear
) {
  fail(
    `V25.32/V25.33 mismatch BULL_TO_BEAR: ` +
    `${primaryBullToBear} !== ${confirmedBullToBear}`
  );
}

if (
  Number.isFinite(confirmedBearToBull) &&
  primaryBearToBull !== confirmedBearToBull
) {
  fail(
    `V25.32/V25.33 mismatch BEAR_TO_BULL: ` +
    `${primaryBearToBull} !== ${confirmedBearToBull}`
  );
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

  const changed = items.filter(
    x => x.directionChanged
  ).length;

  return {
    observations: items.length,

    interpretableOutcomeObservations:
      beforeReturns.length,

    directionChangedCount:
      changed,

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
    observations.filter(
      x => x.transitionDirection === "BULL_TO_BEAR"
    )
  ),

  BEAR_TO_BULL: summarize(
    observations.filter(
      x => x.transitionDirection === "BEAR_TO_BULL"
    )
  )
};

const bySession = {};

for (const session of [
  "OPEN",
  "MIDDAY",
  "LATE",
  "OTHER"
]) {
  bySession[session] = summarize(
    observations.filter(
      x => x.sessionContext === session
    )
  );
}

const sessionByDirection = {};

for (const direction of [
  "BULL_TO_BEAR",
  "BEAR_TO_BULL"
]) {
  sessionByDirection[direction] = {};

  for (const session of [
    "OPEN",
    "MIDDAY",
    "LATE",
    "OTHER"
  ]) {
    sessionByDirection[direction][session] =
      summarize(
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
DESCRIPTIVE FEATURE CONTEXT
-----------------------------------------------------------
*/

function featureSummary(items, key) {
  const values = items
    .map(
      x =>
        x.preTransitionFeatureSnapshot[key]
    )
    .filter(Number.isFinite);

  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    min: values.length
      ? Math.min(...values)
      : null,
    max: values.length
      ? Math.max(...values)
      : null
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
    ALL: featureSummary(
      observations,
      key
    ),

    BULL_TO_BEAR: featureSummary(
      observations.filter(
        x =>
          x.transitionDirection ===
          "BULL_TO_BEAR"
      ),
      key
    ),

    BEAR_TO_BULL: featureSummary(
      observations.filter(
        x =>
          x.transitionDirection ===
          "BEAR_TO_BULL"
      ),
      key
    )
  };
}

/*
-----------------------------------------------------------
OUTPUT
-----------------------------------------------------------
*/

const output = {
  version: VERSION,

  status:
    "CONTROLLED_TRANSITION_CONTEXT_RESEARCH_COMPLETE",

  descriptiveClassification:
    "MIXED_DESCRIPTIVE_CONTEXT_EVIDENCE",

  frozenDataset: {
    requiredVersion: DATASET_VERSION,
    sourceFile: DATASET_NAME,
    rows: records.length,
    sha256: sha256File(datasetPath)
  },

  sourceLineage: {
    primaryRowLevelSource: {
      version: "V25.32",
      file: V25_32_NAME,
      transitionWindows:
        v25_32.transitionWindows.length,
      sha256: sha256File(v25_32_path)
    },

    independentConfirmation: {
      version: "V25.33",
      file: V25_33_NAME,
      sha256: sha256File(v25_33_path)
    },

    v25_32_v25_33_consistent: true
  },

  transitionUniverse: {
    sourceTransitionWindows:
      v25_32.transitionWindows.length,

    alignedObservations:
      observations.length,

    bullToBear:
      primaryBullToBear,

    bearToBull:
      primaryBearToBull
  },

  independentConfirmation: {
    bullToBear:
      confirmedBullToBear,

    bearToBull:
      confirmedBearToBull
  },

  byDirection,

  bySession,

  sessionByDirection,

  featureContext,

  contextDimensions: {
    marketSessionClock: [
      "OPEN",
      "MIDDAY",
      "LATE",
      "OTHER"
    ],

    preTransitionRegimePersistence:
      "consecutive identical EMA regime observations",

    frozenFeatureSnapshot: true
  },

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

  conclusion: {
    researchOnly: true,
    evidenceType:
      "descriptive_context_research",
    featureSelection: false,
    thresholdOptimization: false,
    parameterOptimization: false,
    optimization: false,
    strategyPromotion: false,
    predictiveClaim: false,
    liveTrading: false,
    brokerOrders: false
  },

  nextStage:
    "BOUNDED_RESEARCH_EXIT_GATE"
};

fs.writeFileSync(
  OUTPUT_NAME,
  JSON.stringify(output, null, 2) + "\n",
  "utf8"
);

console.log("=== TRADEMIND PRO V25.34 ===");
console.log(
  "Status:",
  output.status
);
console.log(
  "Primary source:",
  output.sourceLineage.primaryRowLevelSource.version
);
console.log(
  "Independent confirmation:",
  output.sourceLineage.independentConfirmation.version
);
console.log(
  "Aligned observations:",
  output.transitionUniverse.alignedObservations
);
console.log(
  "BULL -> BEAR:",
  output.transitionUniverse.bullToBear
);
console.log(
  "BEAR -> BULL:",
  output.transitionUniverse.bearToBull
);
console.log(
  "V25.32/V25.33 consistent:",
  output.sourceLineage.v25_32_v25_33_consistent
);
console.log(
  "Next stage:",
  output.nextStage
);

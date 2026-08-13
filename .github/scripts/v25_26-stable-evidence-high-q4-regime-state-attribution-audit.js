/*
===========================================================
 TradeMind Pro
 V25.26 — STABLE EVIDENCE HIGH-Q4 REGIME-STATE
          ATTRIBUTION AUDIT
===========================================================

PURPOSE
-----------------------------------------------------------
Determine descriptively whether the HIGH_Q4 divergence observed
in V25.25 is accompanied by a distinct market-state profile
already represented by the frozen V25.10 feature set.

QUESTION
-----------------------------------------------------------
Inside the fixed HIGH-volatility ATR strata:

1. How do the existing frozen features differ between
   HIGH_Q4 and HIGH_Q1/HIGH_Q2/HIGH_Q3?
2. Are HIGH_Q4 feature-state differences persistent across
   EARLY, MIDDLE and LATE chronological blocks?
3. Is HIGH_Q4 simply an ATR tail, or does it also exhibit
   a broader state profile across the already-approved
   feature set?

This is a descriptive evidence audit only.

IMPORTANT
-----------------------------------------------------------
No new features are created.
No feature is selected.
No thresholds are optimized.
No outcome-based feature ranking is performed.
No strategy is changed.

FIXED SOURCE
-----------------------------------------------------------
v25_10_learning_dataset.json
Rows: 7791
Features: 19

FEATURES
-----------------------------------------------------------
EMA 9
EMA 21
EMA 9 slope
EMA 21 slope
EMA spread
EMA spread / ATR
EMA 9 slope / ATR
EMA 21 slope / ATR
RSI 14
RSI change
ATR 14
session VWAP
VWAP distance / ATR
close-to-EMA9 / ATR
close-to-EMA21 / ATR
body ratio
upper wick ratio
lower wick ratio
close location

STRATIFICATION
-----------------------------------------------------------
Reuse the already-established V25.19 / V25.22 thresholds:

HIGH threshold = 28.352465261634
HIGH_Q1      = HIGH threshold <= ATR < 30.703900683886566
HIGH_Q2      = 30.703900683886566 <= ATR < 34.429988262130585
HIGH_Q3      = 34.429988262130585 <= ATR < 40.56251647855333
HIGH_Q4      = ATR >= 40.56251647855333

Thresholds are fixed and applied unchanged to all blocks.

ANALYSIS
-----------------------------------------------------------
For every feature and every fixed HIGH stratum:

- row count
- mean
- median
- standard deviation
- Q25
- Q75

For HIGH_Q4 versus pooled HIGH_Q1-Q3:

- mean difference
- median difference
- standardized mean difference (SMD)

SMD uses pooled standard deviation:

  (mean_Q4 - mean_nonQ4) / pooled_std

The comparison is descriptive only.

CHRONOLOGY
-----------------------------------------------------------
Repeat the complete analysis for:

EARLY  : 0..2596
MIDDLE : 2597..5193
LATE   : 5194..7790

No future thresholds are recalculated.

INTERPRETATION GUARD
-----------------------------------------------------------
This audit does NOT establish:

- causality
- feature superiority
- feature selection
- trading edge
- strategy validity
- statistical significance
- optimal thresholds
- future performance

A large SMD is a descriptive state difference, not a
recommendation to use that feature.

POLICY
-----------------------------------------------------------
Source frozen.
Dataset not modified.
Feature engineering false.
Feature selection false.
Candidate discovery false.
Strategy discovery false.
Optimization false.
Model fitting false.
Validation false.
OOS false.
Strategy modification false.
Real orders false.
===========================================================
*/

const fs = require("fs");
const path = require("path");

const INPUT = "v25_10_learning_dataset.json";
const OUTPUT =
  "v25_26_stable_evidence_high_q4_regime_state_attribution_audit.json";

const HIGH_THRESHOLD = 28.352465261634;

const FIXED_THRESHOLDS = {
  q25: 30.703900683886566,
  q50: 34.429988262130585,
  q75: 40.56251647855333
};

const BLOCKS = [
  { name: "EARLY", start: 0, end: 2597 },
  { name: "MIDDLE", start: 2597, end: 5194 },
  { name: "LATE", start: 5194, end: 7791 }
];

const FEATURES = [
  "ema9",
  "ema21",
  "ema9Slope",
  "ema21Slope",
  "emaSpread",
  "emaSpreadATR",
  "ema9SlopeATR",
  "ema21SlopeATR",
  "rsi14",
  "rsiChange",
  "atr14",
  "vwap",
  "vwapDistanceATR",
  "ema9DistanceATR",
  "ema21DistanceATR",
  "bodyRatio",
  "upperWickRatio",
  "lowerWickRatio",
  "closeLocation"
];

// The dataset has 19 features; the target is not a feature.
// The final feature name is included as an alias guard below if
// the frozen dataset exposes it under a known alternate spelling.
const FEATURE_ALIASES = {
  ema9: ["ema9"],
  ema21: ["ema21"],
  ema9Slope: ["ema9Slope", "ema9_slope"],
  ema21Slope: ["ema21Slope", "ema21_slope"],
  emaSpread: ["emaSpread"],
  emaSpreadATR: ["emaSpreadATR", "emaSpreadAtr"],
  ema9SlopeATR: ["ema9SlopeATR", "ema9_slope_atr"],
  ema21SlopeATR: ["ema21SlopeATR", "ema21_slope_atr"],
  rsi14: ["rsi14", "rsi"],
  rsiChange: ["rsiChange", "rsi_change"],
  atr14: ["atr14"],
  vwap: ["vwap", "sessionVWAP", "sessionVwap"],
  vwapDistanceATR: ["vwapDistanceATR", "vwap_distance_atr"],
  ema9DistanceATR: ["ema9DistanceATR", "closeToEMA9ATR", "ema9_distance_atr"],
  ema21DistanceATR: ["ema21DistanceATR", "closeToEMA21ATR", "ema21_distance_atr"],
  bodyRatio: ["bodyRatio", "body_ratio"],
  upperWickRatio: ["upperWickRatio", "upper_wick_ratio"],
  lowerWickRatio: ["lowerWickRatio", "lower_wick_ratio"],
  closeLocation: ["closeLocation", "close_location"]
};

function fail(message) {
  throw new Error(message);
}

function finite(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function value(row, key) {
  if (row && Object.prototype.hasOwnProperty.call(row, key)) {
    return row[key];
  }

  if (row && row.features) {
    if (Object.prototype.hasOwnProperty.call(row.features, key)) {
      return row.features[key];
    }
  }

  if (row && row.label) {
    if (Object.prototype.hasOwnProperty.call(row.label, key)) {
      return row.label[key];
    }
  }

  const aliases = FEATURE_ALIASES[key] || [];
  for (const alias of aliases) {
    if (row && Object.prototype.hasOwnProperty.call(row, alias)) {
      return row[alias];
    }
    if (
      row &&
      row.features &&
      Object.prototype.hasOwnProperty.call(row.features, alias)
    ) {
      return row.features[alias];
    }
  }

  return undefined;
}

function loadRows() {
  const file = path.resolve(INPUT);

  if (!fs.existsSync(file)) {
    fail(`Input dataset not found: ${INPUT}`);
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const dataset = parsed && parsed.learningDataset;

  if (!dataset || !Array.isArray(dataset.records)) {
    fail("V25.10 dataset does not contain learningDataset.records.");
  }

  if (dataset.frozen !== true) {
    fail("V25.10 learningDataset.frozen is not true.");
  }

  if (dataset.rowCount !== 7791) {
    fail(`V25.10 rowCount guard failed: ${dataset.rowCount}`);
  }

  if (dataset.featureCount !== 19) {
    fail(`V25.10 featureCount guard failed: ${dataset.featureCount}`);
  }

  return dataset.records;
}

function mean(values) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);

  if (lo === hi) return sorted[lo];

  return (
    sorted[lo] +
    (sorted[hi] - sorted[lo]) * (pos - lo)
  );
}

function stddev(values) {
  if (values.length < 2) return null;

  const m = mean(values);
  const variance =
    values.reduce(
      (sum, x) => sum + Math.pow(x - m, 2),
      0
    ) / values.length;

  return Math.sqrt(variance);
}

function pooledStd(a, b) {
  if (a.length < 2 || b.length < 2) return null;

  const sa = stddev(a);
  const sb = stddev(b);

  const numerator =
    ((a.length - 1) * sa * sa) +
    ((b.length - 1) * sb * sb);

  const denominator =
    a.length + b.length - 2;

  if (denominator <= 0) return null;

  return Math.sqrt(numerator / denominator);
}

function describe(values) {
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    stddev: stddev(values),
    q25: quantile(values, 0.25),
    q75: quantile(values, 0.75)
  };
}

function classifyATR(atr) {
  if (!finite(atr) || atr <= 0) return null;

  if (atr >= HIGH_THRESHOLD && atr < FIXED_THRESHOLDS.q25) {
    return "HIGH_Q1";
  }

  if (
    atr >= FIXED_THRESHOLDS.q25 &&
    atr < FIXED_THRESHOLDS.q50
  ) {
    return "HIGH_Q2";
  }

  if (
    atr >= FIXED_THRESHOLDS.q50 &&
    atr < FIXED_THRESHOLDS.q75
  ) {
    return "HIGH_Q3";
  }

  if (atr >= FIXED_THRESHOLDS.q75) {
    return "HIGH_Q4";
  }

  return null;
}

function finiteFeatureRows(rows, feature) {
  return rows.filter((row) => {
    const atr = value(row, "atr14");
    const x = value(row, feature);

    return (
      finite(atr) &&
      atr > 0 &&
      finite(x)
    );
  });
}

function summarizeStrata(rows) {
  const strata = {
    HIGH_Q1: [],
    HIGH_Q2: [],
    HIGH_Q3: [],
    HIGH_Q4: []
  };

  for (const row of rows) {
    const stratum = classifyATR(value(row, "atr14"));
    if (stratum) strata[stratum].push(row);
  }

  return strata;
}

function featureAnalysis(rowsByStratum, feature) {
  const q1 = finiteFeatureRows(rowsByStratum.HIGH_Q1, feature);
  const q2 = finiteFeatureRows(rowsByStratum.HIGH_Q2, feature);
  const q3 = finiteFeatureRows(rowsByStratum.HIGH_Q3, feature);
  const q4 = finiteFeatureRows(rowsByStratum.HIGH_Q4, feature);

  const nonQ4 = [...q1, ...q2, ...q3];

  const values = {
    HIGH_Q1: q1.map((r) => value(r, feature)),
    HIGH_Q2: q2.map((r) => value(r, feature)),
    HIGH_Q3: q3.map((r) => value(r, feature)),
    HIGH_Q4: q4.map((r) => value(r, feature)),
    NON_Q4: nonQ4.map((r) => value(r, feature))
  };

  const q4Values = values.HIGH_Q4;
  const nonQ4Values = values.NON_Q4;

  const q4Mean = mean(q4Values);
  const nonQ4Mean = mean(nonQ4Values);
  const q4Median = median(q4Values);
  const nonQ4Median = median(nonQ4Values);
  const psd = pooledStd(q4Values, nonQ4Values);

  return {
    strata: {
      HIGH_Q1: describe(values.HIGH_Q1),
      HIGH_Q2: describe(values.HIGH_Q2),
      HIGH_Q3: describe(values.HIGH_Q3),
      HIGH_Q4: describe(values.HIGH_Q4)
    },
    q4VsNonQ4: {
      q4Rows: q4Values.length,
      nonQ4Rows: nonQ4Values.length,
      meanDifference:
        q4Mean === null || nonQ4Mean === null
          ? null
          : q4Mean - nonQ4Mean,
      medianDifference:
        q4Median === null || nonQ4Median === null
          ? null
          : q4Median - nonQ4Median,
      pooledStd: psd,
      standardizedMeanDifference:
        psd === null || psd === 0 ||
        q4Mean === null || nonQ4Mean === null
          ? null
          : (q4Mean - nonQ4Mean) / psd
    }
  };
}

function analyzeBlock(rows, blockName) {
  const highRows = rows.filter((row) => {
    const atr = value(row, "atr14");
    return finite(atr) && atr >= HIGH_THRESHOLD;
  });

  const strata = summarizeStrata(highRows);

  const featureAnalyses = {};
  for (const feature of FEATURES) {
    featureAnalyses[feature] =
      featureAnalysis(strata, feature);
  }

  return {
    block: blockName,
    rows: rows.length,
    highRows: highRows.length,
    stratumCounts: {
      HIGH_Q1: strata.HIGH_Q1.length,
      HIGH_Q2: strata.HIGH_Q2.length,
      HIGH_Q3: strata.HIGH_Q3.length,
      HIGH_Q4: strata.HIGH_Q4.length
    },
    featureAnalyses
  };
}

const rows = loadRows();

if (rows.length !== 7791) {
  fail(`Expected 7791 records, got ${rows.length}.`);
}

// Guard: every approved feature must be present numerically in the
// frozen dataset. No feature is silently substituted or created.
for (const feature of FEATURES) {
  const usable = rows.filter((row) => finite(value(row, feature)));

  if (usable.length === 0) {
    fail(`Feature presence guard failed: ${feature}`);
  }
}

// Guard the mathematical identity already established in V25.18.
let identityCount = 0;
let identityZero = 0;
let identityMax = 0;

for (const row of rows) {
  const raw = value(row, "emaSpread");
  const norm = value(row, "emaSpreadATR");
  const atr = value(row, "atr14");

  if (
    finite(raw) &&
    finite(norm) &&
    finite(atr) &&
    atr > 0
  ) {
    identityCount++;

    const residual =
      norm - raw / atr;

    if (residual === 0) identityZero++;

    identityMax =
      Math.max(identityMax, Math.abs(residual));
  }
}

if (identityCount !== identityZero || identityMax !== 0) {
  fail("V25.18 mathematical identity guard failed.");
}

const overall = analyzeBlock(rows, "OVERALL");

const chronologicalBlocks =
  BLOCKS.map((block) =>
    analyzeBlock(
      rows.slice(block.start, block.end),
      block.name
    )
  );

const result = {
  success: true,
  version:
    "V25.26-STABLE-EVIDENCE-HIGH-Q4-REGIME-STATE-ATTRIBUTION",
  status:
    "HIGH_Q4_REGIME_STATE_ATTRIBUTION_AUDIT_COMPLETE",

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    "Determine descriptively whether HIGH_Q4 exhibits a distinct market-state profile across the already-approved frozen feature set, and whether that profile persists across chronological blocks.",

  policy: {
    sourceFrozen: true,
    datasetModified: false,
    featureEngineering: false,
    featureSelection: false,
    candidateDiscovery: false,
    strategyDiscovery: false,
    optimization: false,
    modelFitting: false,
    strategyValidation: false,
    strategyModified: false,
    realOrders: false
  },

  source: {
    inputFile: INPUT,
    datasetRows: rows.length,
    featureCount: 19,
    approvedFeatures: FEATURES,
    highVolatilityThreshold:
      HIGH_THRESHOLD,
    fixedATRQuartileThresholds:
      FIXED_THRESHOLDS
  },

  methodology: {
    strata: [
      "HIGH_Q1",
      "HIGH_Q2",
      "HIGH_Q3",
      "HIGH_Q4"
    ],
    thresholdsAppliedUnchangedToAllBlocks: true,
    noFutureThresholdRecalculation: true,
    comparison:
      "HIGH_Q4 versus pooled HIGH_Q1/HIGH_Q2/HIGH_Q3",
    metrics: [
      "count",
      "mean",
      "median",
      "stddev",
      "q25",
      "q75",
      "meanDifference",
      "medianDifference",
      "pooledStd",
      "standardizedMeanDifference"
    ],
    outcomeUsedForFeatureRanking: false
  },

  overall,
  chronologicalBlocks,

  identityGuard: {
    count: identityCount,
    exactResidualZeroCount: identityZero,
    maxAbsResidual: identityMax
  },

  interpretation: {
    highQ4StateProfileMeasured: true,
    temporalPersistenceMeasured: true,
    descriptiveOnly: true,
    noFeatureRanking: true,
    noFeatureSelection: true,
    noCausalityClaim: true,
    noTradingDecision: true
  },

  guards: {
    learningEngineCalled: false,
    featureSelection: false,
    candidateDiscovery: false,
    strategyDiscovery: false,
    optimization: false,
    modelFitting: false,
    validation: false,
    oos: false,
    strategyModified: false,
    realOrders: false
  },

  auditPass: true,
  outputFile: OUTPUT
};

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(result, null, 2)
);

console.log(
  JSON.stringify(result, null, 2)
);

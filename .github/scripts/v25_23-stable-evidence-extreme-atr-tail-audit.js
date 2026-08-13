/*
===========================================================
 TradeMind Proa
 V25.23 — STABLE EVIDENCE EXTREME-ATR TAIL
          INTEGRITY & PERSISTENCE AUDIT
===========================================================

PURPOSE
-----------------------------------------------------------
Investigate whether the V25.22 HIGH-volatility divergence
between emaSpread and emaSpreadATR is concentrated in a small
number of extreme-ATR observations or persists throughout the
HIGH_Q4 tail.

This is a descriptive influence/persistence diagnostic.

QUESTION
-----------------------------------------------------------
Inside the fixed HIGH_Q4 regime, is the raw-vs-normalized
outcome-correlation difference:

A) broadly persistent across the tail,
B) concentrated in the most extreme ATR observations, or
C) materially altered by a relatively small influential tail?

METHOD
-----------------------------------------------------------
1. Load frozen V25.10 learningDataset.records.
2. Reuse V25.19 EARLY q3 HIGH threshold unchanged.
3. Reuse V25.22 EARLY-HIGH q25/q50/q75 thresholds unchanged.
4. Define HIGH_Q4 using those fixed thresholds.
5. Measure raw emaSpread vs futureReturn and
   emaSpreadATR vs futureReturn.
6. Perform sensitivity diagnostics at fixed ATR tail cutoffs
   inside HIGH_Q4:
     - FULL HIGH_Q4
     - EXCLUDE TOP 10% ATR
     - EXCLUDE TOP 5% ATR
     - EXCLUDE TOP 2.5% ATR
     - EXCLUDE TOP 1% ATR
7. Report the corresponding ATR ranges, row counts, Pearson
   relationships, and divergence.
8. Repeat the same diagnostics chronologically for EARLY,
   MIDDLE and LATE blocks.
9. Do NOT remove observations from the source dataset.
   Tail exclusions exist only as diagnostic sensitivity views.
10. Verify that constant scaling cannot change Pearson
    correlation inside every diagnostic view.

INTERPRETATION GUARD
-----------------------------------------------------------
A sensitivity change does not prove causality or feature
superiority. It only quantifies whether extreme ATR rows have
material influence on the observed descriptive relationship.

This audit does NOT establish:
- causality
- feature superiority
- feature interchangeability
- feature selection
- trading edge
- strategy validity
- optimal thresholds

POLICY
-----------------------------------------------------------
Source frozen.
Dataset not modified.
No feature engineering.
No feature selection.
No candidate discovery.
No strategy discovery.
No optimization.
No model fitting.
No validation.
No OOS.
No strategy modification.
No real orders.
===========================================================
*/

const fs = require("fs");
const path = require("path");

const INPUT = "v25_10_learning_dataset.json";
const OUTPUT =
  "v25_23_stable_evidence_extreme_atr_tail_audit.json";

const FEATURE_A = "emaSpread";
const FEATURE_B = "emaSpreadATR";
const ATR = "atr14";
const TARGET = "futureReturn";

const HIGH_THRESHOLD = 28.352465261634;

const BLOCKS = [
  { name: "EARLY", start: 0, end: 2597 },
  { name: "MIDDLE", start: 2597, end: 5194 },
  { name: "LATE", start: 5194, end: 7791 }
];

const TAIL_FRACTIONS = [
  { name: "FULL_HIGH_Q4", fraction: 0 },
  { name: "EXCLUDE_TOP_10PCT", fraction: 0.10 },
  { name: "EXCLUDE_TOP_5PCT", fraction: 0.05 },
  { name: "EXCLUDE_TOP_2_5PCT", fraction: 0.025 },
  { name: "EXCLUDE_TOP_1PCT", fraction: 0.01 }
];

function fail(message) {
  throw new Error(message);
}

function finite(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function loadRows() {
  const file = path.resolve(INPUT);

  if (!fs.existsSync(file)) {
    fail(`Input dataset not found: ${INPUT}`);
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));

  if (
    parsed &&
    parsed.learningDataset &&
    Array.isArray(parsed.learningDataset.records)
  ) {
    if (parsed.learningDataset.frozen !== true) {
      fail("V25.10 learningDataset.frozen is not true.");
    }

    if (parsed.learningDataset.rowCount !== 7791) {
      fail("V25.10 rowCount guard failed.");
    }

    if (parsed.learningDataset.featureCount !== 19) {
      fail("V25.10 featureCount guard failed.");
    }

    return parsed.learningDataset.records;
  }

  fail("V25.10 dataset does not contain learningDataset.records.");
}

function value(row, key) {
  if (
    row &&
    Object.prototype.hasOwnProperty.call(row, key)
  ) {
    return row[key];
  }

  if (
    row &&
    row.features &&
    Object.prototype.hasOwnProperty.call(row.features, key)
  ) {
    return row.features[key];
  }

  if (
    row &&
    row.label &&
    Object.prototype.hasOwnProperty.call(row.label, key)
  ) {
    return row.label[key];
  }

  return undefined;
}

function mean(a) {
  return a.length
    ? a.reduce((x, y) => x + y, 0) / a.length
    : null;
}

function median(a) {
  if (!a.length) return null;

  const x = [...a].sort((p, q) => p - q);
  const m = Math.floor(x.length / 2);

  return x.length % 2
    ? x[m]
    : (x[m - 1] + x[m]) / 2;
}

function quantile(a, q) {
  if (!a.length) return null;

  const x = [...a].sort((p, q2) => p - q2);
  const pos = (x.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);

  if (lo === hi) return x[lo];

  return x[lo] + (x[hi] - x[lo]) * (pos - lo);
}

function pearson(xs, ys) {
  if (
    xs.length !== ys.length ||
    xs.length < 2
  ) {
    return null;
  }

  const mx = mean(xs);
  const my = mean(ys);

  let numerator = 0;
  let dx = 0;
  let dy = 0;

  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;

    numerator += a * b;
    dx += a * a;
    dy += b * b;
  }

  return dx && dy
    ? numerator / Math.sqrt(dx * dy)
    : null;
}

function usableRows(rows) {
  return rows.filter((r) => {
    const a = value(r, FEATURE_A);
    const b = value(r, FEATURE_B);
    const atr = value(r, ATR);
    const y = value(r, TARGET);

    return (
      finite(a) &&
      finite(b) &&
      finite(atr) &&
      atr > 0 &&
      finite(y)
    );
  });
}

function relationship(rows) {
  const clean = usableRows(rows);

  const raw = clean.map((r) => value(r, FEATURE_A));
  const norm = clean.map((r) => value(r, FEATURE_B));
  const atr = clean.map((r) => value(r, ATR));
  const y = clean.map((r) => value(r, TARGET));

  const meanATR = mean(atr);
  const constantScaled = raw.map((v) => v / meanATR);

  const rawPearson = pearson(raw, y);
  const constantPearson = pearson(constantScaled, y);
  const normalizedPearson = pearson(norm, y);

  const residuals = clean.map(
    (r) =>
      value(r, FEATURE_B) -
      value(r, FEATURE_A) / value(r, ATR)
  );

  return {
    rows: clean.length,

    atr: {
      min: Math.min(...atr),
      max: Math.max(...atr),
      mean: meanATR,
      median: median(atr),
      q25: quantile(atr, 0.25),
      q75: quantile(atr, 0.75)
    },

    outcomePearson: {
      rawEmaSpread: rawPearson,
      constantScaledRawEmaSpread: constantPearson,
      normalizedEmaSpreadATR: normalizedPearson,

      normalizedMinusRaw:
        normalizedPearson === null || rawPearson === null
          ? null
          : normalizedPearson - rawPearson,

      constantScaledMinusRaw:
        constantPearson === null || rawPearson === null
          ? null
          : constantPearson - rawPearson
    },

    identityCheck: {
      count: residuals.length,
      exactResidualZeroCount:
        residuals.filter((v) => v === 0).length,
      maxAbsResidual:
        residuals.length
          ? Math.max(...residuals.map((v) => Math.abs(v)))
          : null
    }
  };
}

function deriveHighQ4Thresholds(rows) {
  const early = rows.slice(0, 2597);

  const earlyHigh = usableRows(early).filter(
    (r) => value(r, ATR) >= HIGH_THRESHOLD
  );

  if (earlyHigh.length < 20) {
    fail("Insufficient EARLY HIGH rows for HIGH_Q4 derivation.");
  }

  const atr = earlyHigh.map((r) => value(r, ATR));

  return {
    q25: quantile(atr, 0.25),
    q50: quantile(atr, 0.50),
    q75: quantile(atr, 0.75)
  };
}

function isHighQ4(row, thresholds) {
  const atr = value(row, ATR);

  return (
    finite(atr) &&
    atr >= HIGH_THRESHOLD &&
    atr >= thresholds.q75
  );
}

function highQ4Rows(rows, thresholds) {
  return usableRows(rows).filter((r) =>
    isHighQ4(r, thresholds)
  );
}

function applyTailSensitivity(rows, fraction) {
  const clean = usableRows(rows);

  if (fraction === 0) {
    return {
      rows: clean,
      cutoff: null,
      excludedRows: 0
    };
  }

  const atrValues = clean.map((r) => value(r, ATR));
  const cutoff = quantile(atrValues, 1 - fraction);

  const kept = clean.filter(
    (r) => value(r, ATR) < cutoff
  );

  return {
    rows: kept,
    cutoff,
    excludedRows: clean.length - kept.length
  };
}

function auditTailViews(rows) {
  const clean = usableRows(rows);

  return TAIL_FRACTIONS.map((spec) => {
    const view = applyTailSensitivity(clean, spec.fraction);
    const analysis = relationship(view.rows);

    return {
      view: spec.name,
      excludedTopFraction: spec.fraction,
      rowsBeforeExclusion: clean.length,
      excludedRows: view.excludedRows,
      rowsAfterExclusion: view.rows.length,
      atrCutoff: view.cutoff,
      analysis
    };
  });
}

function analyzeBlock(rows, thresholds) {
  const highQ4 = highQ4Rows(rows, thresholds);

  return {
    highQ4Rows: highQ4.length,
    tailSensitivity: auditTailViews(highQ4)
  };
}

const rows = loadRows();

if (rows.length !== 7791) {
  fail(`Expected 7791 rows, got ${rows.length}`);
}

const thresholds = deriveHighQ4Thresholds(rows);

const blockResults = BLOCKS.map((block) => ({
  block: block.name,
  start: block.start,
  end: block.end,
  rows: block.end - block.start,
  analysis: analyzeBlock(
    rows.slice(block.start, block.end),
    thresholds
  )
}));

const allHighQ4 = highQ4Rows(rows, thresholds);
const overallSensitivity = auditTailViews(allHighQ4);

/*
===========================================================
 CONSTANT-SCALING INVARIANT
===========================================================
*/

function assertConstantScaling(result, label) {
  for (const view of result) {
    const diff =
      view.analysis.outcomePearson.constantScaledMinusRaw;

    if (
      diff !== null &&
      Math.abs(diff) > 1e-12
    ) {
      fail(
        `Constant-scaling Pearson invariant failed in ${label}/${view.view}.`
      );
    }
  }
}

assertConstantScaling(
  overallSensitivity,
  "OVERALL"
);

for (const block of blockResults) {
  assertConstantScaling(
    block.analysis.tailSensitivity,
    block.block
  );
}

/*
===========================================================
 FINAL RESULT
===========================================================
*/

const result = {
  success: true,

  version:
    "V25.23-STABLE-EVIDENCE-EXTREME-ATR-TAIL-INTEGRITY",

  status:
    "EXTREME_ATR_TAIL_AUDIT_COMPLETE",

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    "Determine descriptively whether the V25.22 HIGH_Q4 raw-vs-normalized outcome-correlation divergence is persistent across the ATR tail or disproportionately influenced by extreme-ATR observations.",

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
    featureA: FEATURE_A,
    featureB: FEATURE_B,
    normalizationFeature: ATR,
    target: TARGET,
    formula:
      "emaSpreadATR = emaSpread / atr14"
  },

  methodology: {
    highVolatilityThresholdSource:
      "V25.19 EARLY block q3",

    highVolatilityThreshold:
      HIGH_THRESHOLD,

    highQ4ThresholdSource:
      "V25.22 EARLY HIGH ATR quartiles",

    highQ4Thresholds: thresholds,

    diagnosticTailViews: [
      "FULL_HIGH_Q4",
      "EXCLUDE_TOP_10PCT",
      "EXCLUDE_TOP_5PCT",
      "EXCLUDE_TOP_2_5PCT",
      "EXCLUDE_TOP_1PCT"
    ],

    tailViewsAreDiagnosticOnly: true,
    sourceRowsNeverRemoved: true,
    thresholdsAppliedUnchangedToAllBlocks: true,
    noFutureThresholdRecalculation: true
  },

  overallHighQ4: {
    rows: allHighQ4.length,
    tailSensitivity: overallSensitivity
  },

  chronologicalBlocks: blockResults,

  interpretation: {
    extremeAtrSensitivityTested: true,
    chronologicalPersistenceTested: true,
    constantScalingCannotChangePearson: true,
    diagnosticExclusionsDoNotModifySource: true,

    descriptiveOnly: true,
    noCausalityClaim: true,
    noInterchangeabilityClaim: true,
    noFeatureSelection: true,
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

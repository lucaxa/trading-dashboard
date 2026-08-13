/*
===========================================================
 TradeMind Pro
 V25.25 — STABLE EVIDENCE HIGH-Q4 TEMPORAL CONCENTRATION
          AUDIT
===========================================================

PURPOSE
-----------------------------------------------------------
Determine descriptively whether the large HIGH_Q4
raw-vs-ATR-normalized outcome-correlation divergence seen
in V25.24 is concentrated in particular chronological
blocks and/or disproportionately concentrated in HIGH_Q4
relative to the lower HIGH-volatility ATR strata.

QUESTION
-----------------------------------------------------------
Inside the frozen HIGH-volatility observations:

1. How large is the normalized-minus-raw correlation
   difference in each fixed ATR stratum?
2. Does HIGH_Q4 account for a disproportionately large
   absolute divergence relative to HIGH_Q1/HIGH_Q2/HIGH_Q3?
3. Does that HIGH_Q4 divergence persist across EARLY,
   MIDDLE and LATE chronological blocks?
4. Is the large HIGH_Q4 divergence present early, or does
   it emerge later?

This is a descriptive evidence audit only.

METHOD
-----------------------------------------------------------
1. Load frozen V25.10 learningDataset.records.
2. Reuse the V25.19 EARLY q3 HIGH-volatility threshold:
      28.352465261634
3. Reuse the V25.22 EARLY-HIGH ATR quartile thresholds:
      q25 = 30.703900683886566
      q50 = 34.429988262130585
      q75 = 40.56251647855333
4. Construct fixed strata:
      HIGH_Q1 : HIGH threshold <= ATR < q25
      HIGH_Q2 : q25 <= ATR < q50
      HIGH_Q3 : q50 <= ATR < q75
      HIGH_Q4 : ATR >= q75
5. Calculate Pearson and Spearman outcome relationships
   for emaSpread and emaSpreadATR in every stratum.
6. Calculate normalizedMinusRaw for both correlations.
7. Repeat for EARLY, MIDDLE and LATE blocks.
8. Calculate descriptive HIGH_Q4 concentration metrics:
      - absolute divergence
      - signed divergence
      - median absolute divergence of Q1-Q3
      - HIGH_Q4 absolute-divergence / Q1-Q3 median ratio
      - HIGH_Q4 share of total absolute divergence
9. Report chronological persistence / emergence descriptively.
10. Do not remove observations.
11. Do not recalculate thresholds from future blocks.
12. Verify emaSpreadATR = emaSpread / atr14 exactly.

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

Concentration metrics are descriptive measurements only.

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
  "v25_25_stable_evidence_high_q4_temporal_concentration_audit.json";

const FEATURE_A = "emaSpread";
const FEATURE_B = "emaSpreadATR";
const ATR = "atr14";
const TARGET = "futureReturn";

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

const STRATA = [
  {
    name: "HIGH_Q1",
    lower: HIGH_THRESHOLD,
    upper: FIXED_THRESHOLDS.q25
  },
  {
    name: "HIGH_Q2",
    lower: FIXED_THRESHOLDS.q25,
    upper: FIXED_THRESHOLDS.q50
  },
  {
    name: "HIGH_Q3",
    lower: FIXED_THRESHOLDS.q50,
    upper: FIXED_THRESHOLDS.q75
  },
  {
    name: "HIGH_Q4",
    lower: FIXED_THRESHOLDS.q75,
    upper: Infinity
  }
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

function value(row, key) {
  if (row && Object.prototype.hasOwnProperty.call(row, key)) {
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

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;

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

  if (!dx || !dy) return null;

  return numerator / Math.sqrt(dx * dy);
}

function rank(values) {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array(values.length);
  let i = 0;

  while (i < indexed.length) {
    let j = i + 1;

    while (
      j < indexed.length &&
      indexed[j].v === indexed[i].v
    ) {
      j++;
    }

    const avgRank = (i + j - 1) / 2 + 1;

    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }

    i = j;
  }

  return ranks;
}

function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(rank(xs), rank(ys));
}

function usableRows(rows) {
  return rows.filter((row) => {
    const a = value(row, FEATURE_A);
    const b = value(row, FEATURE_B);
    const atr = value(row, ATR);
    const y = value(row, TARGET);

    return (
      finite(a) &&
      finite(b) &&
      finite(atr) &&
      atr > 0 &&
      finite(y)
    );
  });
}

function rowsForStratum(rows, stratum) {
  return usableRows(rows).filter((row) => {
    const atr = value(row, ATR);

    if (stratum.name === "HIGH_Q4") {
      return atr >= stratum.lower;
    }

    return atr >= stratum.lower && atr < stratum.upper;
  });
}

function relationship(rows) {
  const clean = usableRows(rows);

  if (clean.length < 3) {
    return {
      rows: clean.length,
      sufficientSample: false,
      outcomePearson: {
        rawEmaSpread: null,
        normalizedEmaSpreadATR: null,
        normalizedMinusRaw: null
      },
      outcomeSpearman: {
        rawEmaSpread: null,
        normalizedEmaSpreadATR: null,
        normalizedMinusRaw: null
      },
      identityCheck: {
        count: 0,
        exactResidualZeroCount: 0,
        maxAbsResidual: null
      }
    };
  }

  const raw = clean.map((r) => value(r, FEATURE_A));
  const normalized = clean.map((r) => value(r, FEATURE_B));
  const atr = clean.map((r) => value(r, ATR));
  const target = clean.map((r) => value(r, TARGET));

  const rawPearson = pearson(raw, target);
  const normalizedPearson = pearson(normalized, target);

  const rawSpearman = spearman(raw, target);
  const normalizedSpearman = spearman(normalized, target);

  const residuals = clean.map(
    (r) =>
      value(r, FEATURE_B) -
      value(r, FEATURE_A) / value(r, ATR)
  );

  return {
    rows: clean.length,
    sufficientSample: true,

    outcomePearson: {
      rawEmaSpread: rawPearson,
      normalizedEmaSpreadATR: normalizedPearson,
      normalizedMinusRaw:
        normalizedPearson - rawPearson
    },

    outcomeSpearman: {
      rawEmaSpread: rawSpearman,
      normalizedEmaSpreadATR: normalizedSpearman,
      normalizedMinusRaw:
        normalizedSpearman - rawSpearman
    },

    identityCheck: {
      count: residuals.length,
      exactResidualZeroCount:
        residuals.filter((v) => v === 0).length,
      maxAbsResidual:
        Math.max(
          ...residuals.map((v) => Math.abs(v))
        )
    }
  };
}

function analyzeStrata(rows) {
  return STRATA.map((stratum) => {
    const subset = rowsForStratum(rows, stratum);
    const analysis = relationship(subset);

    return {
      stratum: stratum.name,
      atrLowerBound: stratum.lower,
      atrUpperBound:
        Number.isFinite(stratum.upper)
          ? stratum.upper
          : null,
      rows: subset.length,
      analysis
    };
  });
}

function concentrationMetrics(strata) {
  const absolutePearson = strata.map((s) =>
    Math.abs(
      s.analysis.outcomePearson.normalizedMinusRaw
    )
  );

  const absoluteSpearman = strata.map((s) =>
    Math.abs(
      s.analysis.outcomeSpearman.normalizedMinusRaw
    )
  );

  const nonQ4Pearson = absolutePearson.slice(0, 3);
  const nonQ4Spearman = absoluteSpearman.slice(0, 3);

  const q4Pearson = absolutePearson[3];
  const q4Spearman = absoluteSpearman[3];

  const nonQ4PearsonMedian = median(nonQ4Pearson);
  const nonQ4SpearmanMedian = median(nonQ4Spearman);

  const totalPearson = absolutePearson.reduce(
    (a, b) => a + b,
    0
  );

  const totalSpearman = absoluteSpearman.reduce(
    (a, b) => a + b,
    0
  );

  return {
    pearson: {
      highQ4SignedDivergence:
        strata[3].analysis.outcomePearson
          .normalizedMinusRaw,
      highQ4AbsoluteDivergence: q4Pearson,
      nonQ4AbsoluteDivergences: nonQ4Pearson,
      nonQ4MedianAbsoluteDivergence:
        nonQ4PearsonMedian,
      highQ4ToNonQ4MedianAbsoluteRatio:
        nonQ4PearsonMedian > 0
          ? q4Pearson / nonQ4PearsonMedian
          : null,
      highQ4ShareOfTotalAbsoluteDivergence:
        totalPearson > 0
          ? q4Pearson / totalPearson
          : null
    },

    spearman: {
      highQ4SignedDivergence:
        strata[3].analysis.outcomeSpearman
          .normalizedMinusRaw,
      highQ4AbsoluteDivergence: q4Spearman,
      nonQ4AbsoluteDivergences: nonQ4Spearman,
      nonQ4MedianAbsoluteDivergence:
        nonQ4SpearmanMedian,
      highQ4ToNonQ4MedianAbsoluteRatio:
        nonQ4SpearmanMedian > 0
          ? q4Spearman / nonQ4SpearmanMedian
          : null,
      highQ4ShareOfTotalAbsoluteDivergence:
        totalSpearman > 0
          ? q4Spearman / totalSpearman
          : null
    }
  };
}

function analyzeBlock(rows, name) {
  const strata = analyzeStrata(rows);

  return {
    block: name,
    rows: rows.length,
    strata,
    concentration: concentrationMetrics(strata)
  };
}

function assertIdentity(result) {
  for (const stratum of result.strata) {
    const identity = stratum.analysis.identityCheck;

    if (
      identity.count !==
      identity.exactResidualZeroCount
    ) {
      fail(
        `Identity residual count failed in ${result.block}/${stratum.stratum}.`
      );
    }

    if (
      identity.maxAbsResidual !== null &&
      identity.maxAbsResidual !== 0
    ) {
      fail(
        `Identity residual is non-zero in ${result.block}/${stratum.stratum}.`
      );
    }
  }
}

const rows = loadRows();

if (rows.length !== 7791) {
  fail(`Expected 7791 records, got ${rows.length}.`);
}

const overall = analyzeBlock(rows, "OVERALL");

const chronologicalBlocks = BLOCKS.map((block) =>
  analyzeBlock(
    rows.slice(block.start, block.end),
    block.name
  )
);

assertIdentity(overall);
chronologicalBlocks.forEach(assertIdentity);

const result = {
  success: true,
  version:
    "V25.25-STABLE-EVIDENCE-HIGH-Q4-TEMPORAL-CONCENTRATION",
  status:
    "HIGH_Q4_TEMPORAL_CONCENTRATION_AUDIT_COMPLETE",

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    "Determine descriptively whether the large HIGH_Q4 raw-vs-ATR-normalized outcome-correlation divergence observed in V25.24 is temporally concentrated and disproportionately concentrated relative to HIGH_Q1/HIGH_Q2/HIGH_Q3.",

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
    formula: "emaSpreadATR = emaSpread / atr14"
  },

  methodology: {
    highVolatilityThresholdSource:
      "V25.19 EARLY block q3",
    highVolatilityThreshold: HIGH_THRESHOLD,

    fixedAtrQuartileThresholdSource:
      "V25.22 EARLY HIGH ATR quartiles",

    fixedAtrQuartileThresholds: FIXED_THRESHOLDS,

    strata: STRATA.map((s) => s.name),

    chronologicalBlocks: BLOCKS.map((b) => ({
      block: b.name,
      start: b.start,
      end: b.end,
      rows: b.end - b.start
    })),

    thresholdsAppliedUnchangedToAllBlocks: true,
    noFutureThresholdRecalculation: true,
    sourceRowsNeverRemoved: true
  },

  overall,

  chronologicalBlocks,

  interpretation: {
    highQ4ConcentrationMeasured: true,
    temporalPersistenceMeasured: true,
    temporalEmergenceMeasured: true,
    lowerStrataComparisonMeasured: true,
    descriptiveOnly: true,
    noCausalityClaim: true,
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
  JSON.stringify(result, null, 2),
  "utf8"
);

console.log(JSON.stringify(result, null, 2));

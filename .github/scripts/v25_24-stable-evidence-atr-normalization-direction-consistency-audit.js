/*
===========================================================
 TradeMind Pro
 V25.24 — STABLE EVIDENCE ATR-NORMALIZATION
          DIRECTION / CONSISTENCY AUDIT
===========================================================

PURPOSE
-----------------------------------------------------------
Determine descriptively whether the V25.22/V25.23 difference
between emaSpread and emaSpreadATR outcome correlations has a
consistent directional relationship across fixed ATR strata
inside the HIGH-volatility region.

QUESTION
-----------------------------------------------------------
Inside the frozen HIGH-volatility observations, does the
normalized-minus-raw Pearson correlation difference:

A) remain directionally consistent across ATR strata,
B) change materially with ATR magnitude, or
C) show no stable directional pattern?

This is a descriptive evidence audit only.

METHOD
-----------------------------------------------------------
1. Load frozen V25.10 learningDataset.records.
2. Reuse the V25.19 EARLY q3 HIGH-volatility threshold:
      28.352465261634
3. Reuse the V25.22 EARLY-HIGH ATR quartile thresholds
   unchanged:
      q25 = 30.703900683886566
      q50 = 34.429988262130585
      q75 = 40.56251647855333
4. Construct fixed ATR strata inside HIGH volatility:
      HIGH_Q1 : HIGH threshold <= ATR < q25
      HIGH_Q2 : q25 <= ATR < q50
      HIGH_Q3 : q50 <= ATR < q75
      HIGH_Q4 : ATR >= q75
5. For every stratum calculate:
      emaSpread vs futureReturn Pearson
      emaSpreadATR vs futureReturn Pearson
      normalizedMinusRaw
      Spearman versions of the same relationships
6. Repeat chronologically for EARLY, MIDDLE and LATE blocks.
7. Compare the sign of normalizedMinusRaw across strata.
8. Report sign-consistency counts and whether the direction
   changes across ATR strata.
9. No observations are removed from the source dataset.
10. No thresholds are recalculated from future blocks.
11. Verify the constant-scaling Pearson invariant.

INTERPRETATION GUARD
-----------------------------------------------------------
This audit does NOT establish:
- causality
- feature superiority
- feature interchangeability
- feature selection
- trading edge
- strategy validity
- optimal thresholds
- statistical significance

A directional pattern is descriptive evidence only.

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
  "v25_24_stable_evidence_atr_normalization_direction_consistency_audit.json";

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
    upper: FIXED_THRESHOLDS.q25,
    lowerInclusive: true,
    upperInclusive: false
  },
  {
    name: "HIGH_Q2",
    lower: FIXED_THRESHOLDS.q25,
    upper: FIXED_THRESHOLDS.q50,
    lowerInclusive: true,
    upperInclusive: false
  },
  {
    name: "HIGH_Q3",
    lower: FIXED_THRESHOLDS.q50,
    upper: FIXED_THRESHOLDS.q75,
    lowerInclusive: true,
    upperInclusive: false
  },
  {
    name: "HIGH_Q4",
    lower: FIXED_THRESHOLDS.q75,
    upper: Infinity,
    lowerInclusive: true,
    upperInclusive: true
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

function rank(values) {
  const indexed = values.map((v, i) => ({
    v,
    i
  }));

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
  if (
    xs.length !== ys.length ||
    xs.length < 2
  ) {
    return null;
  }

  return pearson(rank(xs), rank(ys));
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

function stratumRows(rows, stratum) {
  return usableRows(rows).filter((r) => {
    const atr = value(r, ATR);

    if (stratum.name === "HIGH_Q4") {
      return atr >= stratum.lower;
    }

    return (
      atr >= stratum.lower &&
      atr < stratum.upper
    );
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
        normalizedMinusRaw: null,
        constantScaledRawEmaSpread: null,
        constantScaledMinusRaw: null
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
  const norm = clean.map((r) => value(r, FEATURE_B));
  const atr = clean.map((r) => value(r, ATR));
  const y = clean.map((r) => value(r, TARGET));

  const meanATR = mean(atr);
  const constantScaled = raw.map((v) => v / meanATR);

  const rawPearson = pearson(raw, y);
  const normalizedPearson = pearson(norm, y);
  const constantPearson = pearson(
    constantScaled,
    y
  );

  const rawSpearman = spearman(raw, y);
  const normalizedSpearman = spearman(norm, y);

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
        normalizedPearson - rawPearson,

      constantScaledRawEmaSpread:
        constantPearson,

      constantScaledMinusRaw:
        constantPearson - rawPearson
    },

    outcomeSpearman: {
      rawEmaSpread: rawSpearman,
      normalizedEmaSpreadATR:
        normalizedSpearman,

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

function signOf(v) {
  if (!finite(v)) return "UNDEFINED";
  if (v > 0) return "POSITIVE";
  if (v < 0) return "NEGATIVE";
  return "ZERO";
}

function analyzeStrata(rows) {
  return STRATA.map((stratum) => {
    const subset = stratumRows(rows, stratum);
    const rel = relationship(subset);

    return {
      stratum: stratum.name,
      atrLowerBound: stratum.lower,
      atrUpperBound:
        Number.isFinite(stratum.upper)
          ? stratum.upper
          : null,

      rows: subset.length,

      analysis: rel,

      direction: {
        pearsonNormalizedMinusRaw:
          signOf(
            rel.outcomePearson.normalizedMinusRaw
          ),

        spearmanNormalizedMinusRaw:
          signOf(
            rel.outcomeSpearman.normalizedMinusRaw
          )
      }
    };
  });
}

function summarizeConsistency(strata) {
  const pearsonSigns = strata
    .map(
      (x) =>
        x.direction.pearsonNormalizedMinusRaw
    )
    .filter((x) => x !== "UNDEFINED");

  const spearmanSigns = strata
    .map(
      (x) =>
        x.direction.spearmanNormalizedMinusRaw
    )
    .filter((x) => x !== "UNDEFINED");

  const uniquePearson = [
    ...new Set(pearsonSigns)
  ];

  const uniqueSpearman = [
    ...new Set(spearmanSigns)
  ];

  return {
    pearson: {
      signs: pearsonSigns,
      positiveCount:
        pearsonSigns.filter(
          (x) => x === "POSITIVE"
        ).length,
      negativeCount:
        pearsonSigns.filter(
          (x) => x === "NEGATIVE"
        ).length,
      zeroCount:
        pearsonSigns.filter(
          (x) => x === "ZERO"
        ).length,
      directionallyConsistent:
        uniquePearson.length <= 1,
      uniqueDirections: uniquePearson
    },

    spearman: {
      signs: spearmanSigns,
      positiveCount:
        spearmanSigns.filter(
          (x) => x === "POSITIVE"
        ).length,
      negativeCount:
        spearmanSigns.filter(
          (x) => x === "NEGATIVE"
        ).length,
      zeroCount:
        spearmanSigns.filter(
          (x) => x === "ZERO"
        ).length,
      directionallyConsistent:
        uniqueSpearman.length <= 1,
      uniqueDirections: uniqueSpearman
    }
  };
}

function analyzeBlock(rows, name) {
  const strata = analyzeStrata(rows);

  return {
    block: name,
    rows: rows.length,
    strata,
    consistency: summarizeConsistency(
      strata
    )
  };
}

function assertConstantScaling(result) {
  for (const stratum of result.strata) {
    const diff =
      stratum.analysis.outcomePearson
        .constantScaledMinusRaw;

    if (
      diff !== null &&
      Math.abs(diff) > 1e-12
    ) {
      fail(
        `Constant-scaling Pearson invariant failed in ${result.block}/${stratum.stratum}.`
      );
    }
  }
}

const rows = loadRows();

if (rows.length !== 7791) {
  fail(
    `Expected 7791 rows, got ${rows.length}`
  );
}

const blockResults = BLOCKS.map((block) =>
  analyzeBlock(
    rows.slice(block.start, block.end),
    block.name
  )
);

const overall = analyzeBlock(
  rows,
  "OVERALL"
);

assertConstantScaling(overall);

for (const block of blockResults) {
  assertConstantScaling(block);
}

const allIdentityChecks = [
  ...overall.strata.map(
    (x) => x.analysis.identityCheck
  ),
  ...blockResults.flatMap((b) =>
    b.strata.map(
      (x) => x.analysis.identityCheck
    )
  )
];

for (const check of allIdentityChecks) {
  if (
    check.count !==
    check.exactResidualZeroCount
  ) {
    fail(
      "Mathematical identity residual guard failed."
    );
  }

  if (
    check.maxAbsResidual !== null &&
    check.maxAbsResidual !== 0
  ) {
    fail(
      "Maximum identity residual is not zero."
    );
  }
}

const result = {
  success: true,

  version:
    "V25.24-STABLE-EVIDENCE-ATR-NORMALIZATION-DIRECTION-CONSISTENCY",

  status:
    "ATR_NORMALIZATION_DIRECTION_CONSISTENCY_AUDIT_COMPLETE",

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    "Determine descriptively whether the V25.22/V25.23 raw-vs-normalized outcome-correlation divergence has a consistent directional relationship across fixed ATR strata inside the HIGH-volatility region.",

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

    fixedAtrQuartileThresholdSource:
      "V25.22 EARLY HIGH ATR quartiles",

    fixedAtrQuartileThresholds:
      FIXED_THRESHOLDS,

    strata: [
      "HIGH_Q1",
      "HIGH_Q2",
      "HIGH_Q3",
      "HIGH_Q4"
    ],

    thresholdsAppliedUnchangedToAllBlocks:
      true,

    noFutureThresholdRecalculation:
      true,

    sourceRowsNeverRemoved:
      true
  },

  overall: {
    rows: rows.length,
    strata: overall.strata,
    consistency: overall.consistency
  },

  chronologicalBlocks: blockResults,

  interpretation: {
    directionAcrossAtrStrataTested:
      true,

    chronologicalPersistenceTested:
      true,

    pearsonDirectionConsistencyDescribed:
      true,

    spearmanDirectionConsistencyDescribed:
      true,

    constantScalingCannotChangePearson:
      true,

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

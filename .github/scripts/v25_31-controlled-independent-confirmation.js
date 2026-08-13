/*
===========================================================
 TradeMind Pro
 V25.31 — CONTROLLED INDEPENDENT CONFIRMATION
===========================================================

PURPOSE
-------
Perform a pre-declared independent confirmation analysis of
the V25.30-resolved evidence using the frozen V25.10 dataset.

IMPORTANT:
This is NOT an out-of-sample claim.

V25.31 uses the same frozen historical dataset that supported
the earlier evidence chain, but applies a new, fixed,
non-optimizing confirmation protocol.

The purpose is to ask:

"Does the descriptive relationship remain directionally
coherent when evaluated across fixed chronological folds
without threshold selection, ranking, or feature promotion?"

HARD POLICY
-----------
- Frozen V25.10 dataset only
- No dataset modification
- No new features
- No feature selection
- No threshold search
- No parameter search
- No ranking by PnL
- No optimization
- No model fitting
- No strategy construction
- No strategy modification
- No real orders
- No live trading

FEATURES UNDER REVIEW
----------------------
Only the two already-established representations are reviewed:

1. emaSpread
2. emaSpreadATR

These are NOT selected against each other.

TARGET
------
futureReturn

CONFIRMATION PROTOCOL
---------------------
The 7,791 frozen diagnostic rows are divided into FIVE fixed
chronological folds.

Fold boundaries are determined solely by row position.

For every fold and every feature:
  - Pearson correlation is calculated.
  - Direction/sign is recorded.
  - Observation count is recorded.

No threshold is introduced.

No fold is discarded because its result is inconvenient.

CONFIRMATION INTERPRETATION
---------------------------
CONFIRMED_DESCRIPTIVELY
  All five folds have non-zero correlations with the same sign.

MIXED_DESCRIPTIVE_CONFIRMATION
  All five folds are evaluable, but signs are not fully coherent.

INSUFFICIENT_CONFIRMATION
  One or more folds cannot be evaluated.

NO_FEATURE_SELECTION
--------------------
V25.31 deliberately does not choose the "better" feature.

Both features receive independent descriptive results.

OOS STATUS
----------
This protocol is NOT out-of-sample validation because the frozen
dataset has already participated in prior V25 evidence work.

The result must therefore never be interpreted as:
  - OOS predictive proof
  - profitability proof
  - strategy validation
  - trading authorization
*/

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const DATASET = path.join(
  ROOT,
  "v25_10_learning_dataset.json"
);

const V25_30_RESULT = path.join(
  ROOT,
  "v25_30_controlled_hypothesis_evidence_resolution.json"
);

const OUTPUT = path.join(
  ROOT,
  "v25_31_controlled_independent_confirmation.json"
);

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    fail(`Required file not found: ${file}`);
  }

  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch (err) {
    fail(
      `Invalid JSON in ${file}: ${err.message}`
    );
  }
}

function finite(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function sign(value) {
  if (!finite(value) || value === 0) {
    return "ZERO";
  }

  return value > 0
    ? "POSITIVE"
    : "NEGATIVE";
}

function getRows(dataset) {
  let records = null;

  if (
    dataset &&
    dataset.learningDataset &&
    Array.isArray(
      dataset.learningDataset.records
    )
  ) {
    records =
      dataset.learningDataset.records;
  } else if (
    Array.isArray(dataset)
  ) {
    records = dataset;
  } else {
    for (const key of [
      "rows",
      "records",
      "data",
      "learningRecords"
    ]) {
      if (
        Array.isArray(dataset[key])
      ) {
        records = dataset[key];
        break;
      }
    }
  }

  if (!Array.isArray(records)) {
    fail(
      "Frozen V25.10 dataset does not contain learningDataset.records."
    );
  }

  return records.map(
    (record, index) => {
      const features =
        record &&
        record.features &&
        typeof record.features ===
          "object"
          ? record.features
          : {};

      const label =
        record &&
        record.label &&
        typeof record.label ===
          "object"
          ? record.label
          : {};

      return {
        __recordIndex: index,
        sourceIndex:
          record
            ? record.sourceIndex
            : undefined,
        timestamp:
          record
            ? record.timestamp
            : undefined,
        istDate:
          record
            ? record.istDate
            : undefined,
        ...features,
        ...label
      };
    }
  );
}

function pearson(rows, feature, target) {
  const pairs = rows
    .map(row => [
      Number(row[feature]),
      Number(row[target])
    ])
    .filter(
      ([x, y]) =>
        finite(x) &&
        finite(y)
    );

  if (pairs.length < 3) {
    return {
      count: pairs.length,
      pearson: null,
      sign: "ZERO",
      status:
        "INSUFFICIENT_DATA"
    };
  }

  const xs =
    pairs.map(p => p[0]);

  const ys =
    pairs.map(p => p[1]);

  const meanX =
    xs.reduce(
      (a, b) => a + b,
      0
    ) / xs.length;

  const meanY =
    ys.reduce(
      (a, b) => a + b,
      0
    ) / ys.length;

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (
    let i = 0;
    i < xs.length;
    i++
  ) {
    const dx =
      xs[i] - meanX;

    const dy =
      ys[i] - meanY;

    numerator +=
      dx * dy;

    denominatorX +=
      dx * dx;

    denominatorY +=
      dy * dy;
  }

  const denominator =
    Math.sqrt(
      denominatorX *
      denominatorY
    );

  const value =
    denominator > 0
      ? numerator /
        denominator
      : null;

  return {
    count: pairs.length,
    pearson: value,
    sign: sign(value),
    status:
      value === null
        ? "UNDEFINED"
        : "OBSERVED"
  };
}

function fixedFiveFolds(rows) {
  const n = rows.length;

  const boundaries = [
    0,
    Math.floor(n * 1 / 5),
    Math.floor(n * 2 / 5),
    Math.floor(n * 3 / 5),
    Math.floor(n * 4 / 5),
    n
  ];

  const names = [
    "FOLD_1_EARLIEST",
    "FOLD_2_EARLY",
    "FOLD_3_MIDDLE",
    "FOLD_4_LATE",
    "FOLD_5_LATEST"
  ];

  return names.map(
    (name, i) => ({
      fold: name,
      start:
        boundaries[i],
      end:
        boundaries[i + 1],
      rows:
        rows.slice(
          boundaries[i],
          boundaries[i + 1]
        )
    })
  );
}

function resolveConfirmation(foldResults) {
  const signs =
    foldResults.map(
      fold => fold.sign
    );

  const evaluable =
    foldResults.every(
      fold =>
        fold.status ===
        "OBSERVED"
    );

  if (!evaluable) {
    return {
      status:
        "INSUFFICIENT_CONFIRMATION",
      signs
    };
  }

  const nonZero =
    signs.filter(
      x => x !== "ZERO"
    );

  const coherent =
    nonZero.length ===
      foldResults.length &&
    new Set(
      nonZero
    ).size === 1;

  return {
    status:
      coherent
        ? "CONFIRMED_DESCRIPTIVELY"
        : "MIXED_DESCRIPTIVE_CONFIRMATION",
    signs
  };
}

const dataset =
  readJson(DATASET);

const v25_30 =
  readJson(V25_30_RESULT);

if (
  v25_30.auditPass !== true
) {
  fail(
    "V25.30 result does not have auditPass=true."
  );
}

if (
  v25_30.researchConclusion &&
  v25_30.researchConclusion
    .decision !==
    "NO_FEATURE_SELECTION"
) {
  fail(
    "V25.30 is not marked NO_FEATURE_SELECTION."
  );
}

const rows =
  getRows(dataset);

if (
  rows.length !== 7791
) {
  fail(
    `Expected 7791 frozen diagnostic rows, found ${rows.length}.`
  );
}

const featureCandidates = [
  "emaSpread",
  "emaSpreadATR"
];

const target =
  "futureReturn";

for (
  const feature
  of featureCandidates
) {
  const exists =
    rows.some(
      row =>
        Object.prototype
          .hasOwnProperty.call(
            row,
            feature
          )
    );

  if (!exists) {
    fail(
      `Required feature missing from frozen dataset: ${feature}`
    );
  }
}

const targetExists =
  rows.some(
    row =>
      Object.prototype
        .hasOwnProperty.call(
          row,
          target
        )
  );

if (!targetExists) {
  fail(
    `Required target missing from frozen dataset: ${target}`
  );
}

const folds =
  fixedFiveFolds(rows);

const featureResults = {};

for (
  const feature
  of featureCandidates
) {
  const foldResults =
    folds.map(
      fold => {
        const summary =
          pearson(
            fold.rows,
            feature,
            target
          );

        return {
          fold:
            fold.fold,
          start:
            fold.start,
          end:
            fold.end,
          rows:
            fold.rows.length,
          count:
            summary.count,
          pearson:
            summary.pearson,
          sign:
            summary.sign,
          status:
            summary.status
        };
      }
    );

  const confirmation =
    resolveConfirmation(
      foldResults
    );

  featureResults[
    feature
  ] = {
    feature,
    target,
    foldResults,
    confirmation
  };
}

const allFoldsPresent =
  folds.length === 5 &&
  folds.every(
    fold =>
      fold.rows.length > 0
  );

if (!allFoldsPresent) {
  fail(
    "Fixed five-fold protocol did not produce five non-empty chronological folds."
  );
}

const result = {
  success: true,

  version:
    "V25.31-CONTROLLED-INDEPENDENT-CONFIRMATION",

  status:
    "CONTROLLED_INDEPENDENT_CONFIRMATION_COMPLETE",

  paperOnly: true,

  realOrders: false,

  brokerOrderEnabled: false,

  brokerOrderSent: false,

  purpose:
    "Independent descriptive confirmation across five fixed chronological folds of the frozen V25.10 dataset.",

  interpretation:
    "This is a confirmation analysis, not out-of-sample validation. The same frozen dataset was previously used by the V25 evidence chain.",

  source: {
    dataset:
      "v25_10_learning_dataset.json",

    rows:
      rows.length,

    target,

    featuresReviewed:
      featureCandidates
  },

  protocol: {
    folds:
      5,

    chronological:
      true,

    foldBoundariesFixed:
      true,

    thresholdSearch:
      false,

    parameterSearch:
      false,

    featureSelection:
      false,

    optimization:
      false,

    modelFitting:
      false,

    rankingByPnL:
      false,

    cherryPicking:
      false,

    strategyModification:
      false,

    liveTrading:
      false,

    outOfSample:
      false
  },

  v25_30Handoff: {
    resultVerified:
      true,

    auditPass:
      v25_30.auditPass,

    decision:
      v25_30.researchConclusion
        ? v25_30.researchConclusion
            .decision
        : "NO_FEATURE_SELECTION"
  },

  featureResults,

  confirmationSummary: {
    featureCount:
      featureCandidates.length,

    featuresWithDescriptiveConfirmation:
      featureCandidates.filter(
        feature =>
          featureResults[
            feature
          ].confirmation.status ===
          "CONFIRMED_DESCRIPTIVELY"
      ).length,

    featuresWithMixedConfirmation:
      featureCandidates.filter(
        feature =>
          featureResults[
            feature
          ].confirmation.status ===
          "MIXED_DESCRIPTIVE_CONFIRMATION"
      ).length,

    featuresInsufficient:
      featureCandidates.filter(
        feature =>
          featureResults[
            feature
          ].confirmation.status ===
          "INSUFFICIENT_CONFIRMATION"
      ).length
  },

  decision:
    "NO_FEATURE_SELECTION",

  conclusions: {
    descriptiveConfirmationOnly:
      true,

    predictiveProof:
      false,

    profitabilityProof:
      false,

    oosProof:
      false,

    strategyValidation:
      false,

    strategyPromotion:
      false,

    tradingAuthorization:
      false
  },

  guards: {
    datasetModified:
      false,

    newFeatures:
      false,

    thresholdSearch:
      false,

    parameterSearch:
      false,

    featureSelection:
      false,

    optimization:
      false,

    modelFitting:
      false,

    rankingByPnL:
      false,

    cherryPicking:
      false,

    strategyConstruction:
      false,

    strategyModification:
      false,

    realOrders:
      false
  },

  auditPass:
    true,

  outputFile:
    "v25_31_controlled_independent_confirmation.json"
};

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(
    result,
    null,
    2
  )
);

console.log(
  "=== TRADEMIND PRO V25.31 ==="
);

console.log(
  "CONTROLLED_INDEPENDENT_CONFIRMATION_COMPLETE"
);

console.log(
  `Frozen rows: ${rows.length}`
);

for (
  const feature
  of featureCandidates
) {
  console.log(
    `${feature}: ${featureResults[feature].confirmation.status}`
  );
}

console.log(
  "Decision: NO_FEATURE_SELECTION"
);

console.log(
  "OOS validation: NOT CLAIMED"
);

console.log(
  "Audit pass: true"
);

console.log(
  JSON.stringify(
    result,
    null,
    2
  )
);

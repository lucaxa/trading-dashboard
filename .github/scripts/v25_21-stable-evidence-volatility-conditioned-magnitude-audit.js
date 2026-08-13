/*
===========================================================
 TradeMind Pro
 V25.21 — STABLE EVIDENCE VOLATILITY-CONDITIONED
          MAGNITUDE AUDIT — FIXED
===========================================================

FIX
-----------------------------------------------------------
V25.10 is an object whose learning records live at:

    learningDataset.records

The previous V25.21 loader only accepted:
    parsed[]
    parsed.rows
    parsed.data

Therefore the audit failed before analysis with:
    "Dataset does not contain an array of rows."

This version reads the frozen V25.10 records without
modifying the dataset or changing the audit methodology.

POLICY
-----------------------------------------------------------
Source frozen.
Dataset is not modified.
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

This audit is descriptive only.
It does NOT declare a trading edge.
===========================================================
*/

const fs = require("fs");
const path = require("path");

const INPUT = "v25_10_learning_dataset.json";
const OUTPUT =
  "v25_21_stable_evidence_volatility_conditioned_magnitude_audit.json";

const FEATURE_A = "emaSpread";
const FEATURE_B = "emaSpreadATR";
const VOL_FEATURE = "atr14";
const TARGET = "futureReturn";

const REGIMES = ["LOW", "MID_LOW", "MID_HIGH", "HIGH"];

function fail(message) {
  throw new Error(message);
}

function finiteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/*
===========================================================
 LOAD FROZEN V25.10 DATASET
===========================================================
*/
function loadDataset() {
  const filePath = path.resolve(INPUT);

  if (!fs.existsSync(filePath)) {
    fail(`Input dataset not found: ${INPUT}`);
  }

  const parsed = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  /*
    V25.10 actual structure:
      {
        ...
        learningDataset: {
          frozen: true,
          rowCount: 7791,
          featureCount: 19,
          sha256: "...",
          records: [...]
        }
      }
  */

  if (
    parsed &&
    parsed.learningDataset &&
    Array.isArray(parsed.learningDataset.records)
  ) {
    return parsed.learningDataset.records;
  }

  /* Compatibility guards — do not alter the source. */
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed)) return parsed;

  fail(
    "V25.10 dataset does not contain learningDataset.records."
  );
}

/*
===========================================================
 VALUE ACCESS
===========================================================
*/
function getValue(row, key) {
  if (
    row &&
    Object.prototype.hasOwnProperty.call(row, key)
  ) {
    return row[key];
  }

  if (
    row &&
    row.features &&
    Object.prototype.hasOwnProperty.call(
      row.features,
      key
    )
  ) {
    return row.features[key];
  }

  if (
    row &&
    row.label &&
    Object.prototype.hasOwnProperty.call(
      row.label,
      key
    )
  ) {
    return row.label[key];
  }

  return undefined;
}

/*
===========================================================
 STATISTICS
===========================================================
*/
function median(values) {
  if (!values.length) return null;

  const a = [...values].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);

  return a.length % 2
    ? a[mid]
    : (a[mid - 1] + a[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length) return null;

  const a = [...values].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;

  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);

  if (lo === hi) return a[lo];

  return (
    a[lo] +
    (a[hi] - a[lo]) *
      (pos - lo)
  );
}

function mean(values) {
  if (!values.length) return null;

  return (
    values.reduce(
      (a, b) => a + b,
      0
    ) / values.length
  );
}

function std(values) {
  if (values.length < 2) return null;

  const m = mean(values);

  const variance =
    values.reduce(
      (sum, v) =>
        sum + Math.pow(v - m, 2),
      0
    ) / values.length;

  return Math.sqrt(variance);
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

  let num = 0;
  let dx = 0;
  let dy = 0;

  for (let i = 0; i < xs.length; i++) {
    const ax = xs[i] - mx;
    const by = ys[i] - my;

    num += ax * by;
    dx += ax * ax;
    dy += by * by;
  }

  if (dx === 0 || dy === 0) return null;

  return num / Math.sqrt(dx * dy);
}

function describe(values) {
  const abs = values.map(Math.abs);

  return {
    count: values.length,
    mean: mean(values),
    meanAbs: mean(abs),
    median: median(values),
    medianAbs: median(abs),
    q25Abs: quantile(abs, 0.25),
    q75Abs: quantile(abs, 0.75),
    std: std(values),
    absRatioToATR: null
  };
}

/*
===========================================================
 PAIR ANALYSIS
===========================================================
*/
function describePair(rows) {
  const a = [];
  const b = [];
  const atr = [];
  const target = [];

  for (const r of rows) {
    const av = getValue(r, FEATURE_A);
    const bv = getValue(r, FEATURE_B);
    const nv = getValue(r, VOL_FEATURE);
    const tv = getValue(r, TARGET);

    if (
      finiteNumber(av) &&
      finiteNumber(bv) &&
      finiteNumber(nv) &&
      nv > 0
    ) {
      a.push(av);
      b.push(bv);
      atr.push(nv);

      if (finiteNumber(tv)) {
        target.push(tv);
      }
    }
  }

  const aAbs = a.map(Math.abs);
  const bAbs = b.map(Math.abs);

  const ratioAtoBAbs = [];

  for (let i = 0; i < a.length; i++) {
    if (bAbs[i] > 0) {
      ratioAtoBAbs.push(
        aAbs[i] / bAbs[i]
      );
    }
  }

  const identityResiduals = [];

  for (let i = 0; i < a.length; i++) {
    identityResiduals.push(
      b[i] - a[i] / atr[i]
    );
  }

  const descA = describe(a);
  const descB = describe(b);

  descA.meanAbsToATRMean =
    atr.length
      ? descA.meanAbs / mean(atr)
      : null;

  descB.meanAbsToATRMean =
    atr.length
      ? descB.meanAbs / mean(atr)
      : null;

  return {
    rows: a.length,

    emaSpread: descA,

    emaSpreadATR: descB,

    atr14: {
      count: atr.length,
      mean: mean(atr),
      median: median(atr),
      q25: quantile(atr, 0.25),
      q75: quantile(atr, 0.75)
    },

    rawVsNormalizedMagnitude: {
      meanAbsDifference:
        descB.meanAbs -
        descA.meanAbs,

      medianAbsDifference:
        descB.medianAbs -
        descA.medianAbs,

      meanAbsRatioNormalizedToRaw:
        descA.meanAbs === 0
          ? null
          : descB.meanAbs /
            descA.meanAbs,

      medianAbsRatioNormalizedToRaw:
        descA.medianAbs === 0
          ? null
          : descB.medianAbs /
            descA.medianAbs,

      meanAbsoluteValueRatioRawToNormalized:
        ratioAtoBAbs.length
          ? mean(ratioAtoBAbs)
          : null
    },

    outcomeRelationship: {
      count:
        Math.min(
          a.length,
          target.length
        ),

      emaSpreadPearson:
        target.length === a.length
          ? pearson(a, target)
          : null,

      emaSpreadATRPearson:
        target.length === b.length
          ? pearson(b, target)
          : null
    },

    identityCheck: {
      count:
        identityResiduals.length,

      exactResidualZeroCount:
        identityResiduals.filter(
          v => v === 0
        ).length,

      maxAbsResidual:
        identityResiduals.length
          ? Math.max(
              ...identityResiduals.map(
                Math.abs
              )
            )
          : null
    }
  };
}

/*
===========================================================
 LOAD + FREEZE GUARDS
===========================================================
*/
const rows = loadDataset();

if (rows.length !== 7791) {
  fail(
    `Frozen V25.10 row-count guard failed: expected 7791, got ${rows.length}`
  );
}

/*
  Verify the actual V25.10 wrapper independently.
  These checks are informational guards only and do not
  alter any source data.
*/
const parsedSource = JSON.parse(
  fs.readFileSync(
    path.resolve(INPUT),
    "utf8"
  )
);

if (
  parsedSource.learningDataset &&
  parsedSource.learningDataset.frozen !== true
) {
  fail(
    "V25.10 learningDataset.frozen is not true."
  );
}

if (
  parsedSource.learningDataset &&
  parsedSource.learningDataset.rowCount !== 7791
) {
  fail(
    "V25.10 learningDataset.rowCount is not 7791."
  );
}

if (
  parsedSource.learningDataset &&
  parsedSource.learningDataset.featureCount !== 19
) {
  fail(
    "V25.10 learningDataset.featureCount is not 19."
  );
}

/*
===========================================================
 FROZEN V25.19 VOLATILITY THRESHOLDS
===========================================================
*/
const q1 = 16.068830755471;
const q2 = 21.027845135389;
const q3 = 28.352465261634;

function regimeForAtr(v) {
  if (v < q1) return "LOW";
  if (v < q2) return "MID_LOW";
  if (v < q3) return "MID_HIGH";
  return "HIGH";
}

/*
===========================================================
 CHRONOLOGICAL BLOCKS
===========================================================
*/
const blocks = [
  {
    name: "EARLY",
    start: 0,
    end: 2597
  },
  {
    name: "MIDDLE",
    start: 2597,
    end: 5194
  },
  {
    name: "LATE",
    start: 5194,
    end: 7791
  }
];

const allRowsByRegime = {};
const blockResults = [];

for (const regime of REGIMES) {
  allRowsByRegime[regime] = [];
}

for (const block of blocks) {
  const blockRows = rows.slice(
    block.start,
    block.end
  );

  const regimes = {};

  for (const regime of REGIMES) {
    regimes[regime] = [];
  }

  for (const row of blockRows) {
    const atr = getValue(
      row,
      VOL_FEATURE
    );

    if (
      finiteNumber(atr) &&
      atr > 0
    ) {
      const regime =
        regimeForAtr(atr);

      regimes[regime].push(row);
      allRowsByRegime[regime].push(
        row
      );
    }
  }

  blockResults.push({
    block: block.name,
    start: block.start,
    end: block.end,
    rows: blockRows.length,

    regimes: REGIMES.map(
      regime => ({
        regime,
        analysis:
          describePair(
            regimes[regime]
          )
      })
    )
  });
}

const overall = REGIMES.map(
  regime => ({
    regime,
    analysis:
      describePair(
        allRowsByRegime[regime]
      )
  })
);

/*
===========================================================
 HIGH-VOLATILITY FOCUS
===========================================================
*/
const highFocus =
  blockResults.map(
    block => {
      const high =
        block.regimes.find(
          r =>
            r.regime ===
            "HIGH"
        );

      return {
        block: block.block,

        rows:
          high.analysis.rows,

        emaSpreadMeanAbs:
          high.analysis
            .emaSpread.meanAbs,

        emaSpreadATRMeanAbs:
          high.analysis
            .emaSpreadATR.meanAbs,

        meanAbsDifference:
          high.analysis
            .rawVsNormalizedMagnitude
            .meanAbsDifference,

        meanAbsRatioNormalizedToRaw:
          high.analysis
            .rawVsNormalizedMagnitude
            .meanAbsRatioNormalizedToRaw,

        emaSpreadPearson:
          high.analysis
            .outcomeRelationship
            .emaSpreadPearson,

        emaSpreadATRPearson:
          high.analysis
            .outcomeRelationship
            .emaSpreadATRPearson
      };
    }
  );

/*
===========================================================
 FINAL AUDIT RESULT
===========================================================
*/
const result = {
  success: true,

  version:
    "V25.21-STABLE-EVIDENCE-VOLATILITY-CONDITIONED-MAGNITUDE",

  status:
    "VOLATILITY_CONDITIONED_MAGNITUDE_AUDIT_COMPLETE",

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    "Descriptively determine whether the V25.20 HIGH-volatility raw-vs-normalized difference is accompanied by persistent feature-magnitude and ATR-scaling differences across chronological blocks.",

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
    normalizationFeature:
      VOL_FEATURE,
    target: TARGET,
    formula:
      "emaSpreadATR = emaSpread / atr14"
  },

  methodology: {
    thresholdSource:
      "V25.19 EARLY block",

    q1,
    q2,
    q3,

    regimes: REGIMES,

    thresholdsAppliedUnchangedToAllBlocks:
      true,

    noFutureThresholdRecalculation:
      true,

    measurements: [
      "mean",
      "mean absolute magnitude",
      "median absolute magnitude",
      "absolute interquartile range",
      "standard deviation",
      "ATR distribution",
      "raw-vs-normalized magnitude ratios",
      "descriptive outcome Pearson comparison"
    ],

    interpretationRule:
      "Magnitude and scaling differences are descriptive only; no significance, causality, interchangeability, feature-selection, or trading-edge claim is permitted."
  },

  overall,

  blocks: blockResults,

  highVolatilityFocus: {
    regime: "HIGH",
    blocks: highFocus,

    purpose:
      "Focus on the regime where V25.20 showed the largest persistent raw-vs-normalized Pearson difference."
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
  JSON.stringify(
    result,
    null,
    2
  )
);

console.log(
  JSON.stringify(
    result,
    null,
    2
  )
);

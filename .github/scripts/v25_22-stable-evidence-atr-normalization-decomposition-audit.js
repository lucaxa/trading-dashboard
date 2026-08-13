/*
===========================================================
 TradeMind Pro
 V25.22 — STABLE EVIDENCE ATR NORMALIZATION
          DECOMPOSITION AUDIT
===========================================================

PURPOSE
-----------------------------------------------------------
Decompose the V25.20/V25.21 HIGH-volatility divergence between
emaSpread and emaSpreadATR without changing the frozen dataset.

QUESTION
-----------------------------------------------------------
Is the raw-vs-normalized outcome-correlation difference mainly
associated with ATR variation inside the HIGH-volatility regime,
or does the difference persist within narrower ATR sub-regimes?

METHOD
-----------------------------------------------------------
1. Load frozen V25.10 learningDataset.records.
2. Reuse V25.19 EARLY volatility threshold q3 unchanged to define
   the HIGH-volatility regime.
3. From EARLY HIGH rows only, derive internal ATR quartile
   thresholds (Q25 / Q50 / Q75).
4. Apply those thresholds unchanged to EARLY, MIDDLE and LATE.
5. For HIGH rows compare:
   - raw emaSpread
   - constant-scaled emaSpread / meanATR
   - actual row-wise emaSpread / atr14
6. Measure Pearson outcome relationships overall and inside each
   ATR sub-regime.
7. Verify the mathematical identity row by row.

INTERPRETATION GUARD
-----------------------------------------------------------
Constant scaling cannot change Pearson correlation. Therefore,
any difference between raw emaSpread and emaSpreadATR must come
from the row-wise ATR normalization, not from numerical units.

This is descriptive evidence only. It does NOT establish:
- causality
- feature superiority
- feature interchangeability
- feature selection
- trading edge
- strategy validity

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
  "v25_22_stable_evidence_atr_normalization_decomposition_audit.json";

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

  const parsed = JSON.parse(
    fs.readFileSync(file, "utf8")
  );

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

  fail(
    "V25.10 dataset does not contain learningDataset.records."
  );
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

  return (
    x[lo] +
    (x[hi] - x[lo]) *
      (pos - lo)
  );
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

  let n = 0;
  let dx = 0;
  let dy = 0;

  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;

    n += a * b;
    dx += a * a;
    dy += b * b;
  }

  return dx && dy
    ? n / Math.sqrt(dx * dy)
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

function auditGroup(rows) {
  const clean = usableRows(rows);

  const raw = clean.map((r) =>
    value(r, FEATURE_A)
  );

  const norm = clean.map((r) =>
    value(r, FEATURE_B)
  );

  const atr = clean.map((r) =>
    value(r, ATR)
  );

  const y = clean.map((r) =>
    value(r, TARGET)
  );

  const meanATR = mean(atr);

  const constantScaled = raw.map(
    (v) => v / meanATR
  );

  const residuals = clean.map(
    (r) =>
      value(r, FEATURE_B) -
      value(r, FEATURE_A) /
        value(r, ATR)
  );

  const exactZeros =
    residuals.filter(
      (v) => v === 0
    ).length;

  const rawPearson = pearson(
    raw,
    y
  );

  const constantPearson = pearson(
    constantScaled,
    y
  );

  const normalizedPearson = pearson(
    norm,
    y
  );

  return {
    rows: clean.length,

    atr: {
      mean: meanATR,
      median: median(atr),
      q25: quantile(atr, 0.25),
      q75: quantile(atr, 0.75)
    },

    outcomePearson: {
      rawEmaSpread: rawPearson,

      constantScaledRawEmaSpread:
        constantPearson,

      normalizedEmaSpreadATR:
        normalizedPearson,

      normalizedMinusRaw:
        normalizedPearson === null ||
        rawPearson === null
          ? null
          : normalizedPearson -
            rawPearson,

      constantScaledMinusRaw:
        constantPearson === null ||
        rawPearson === null
          ? null
          : constantPearson -
            rawPearson
    },

    identityCheck: {
      count: residuals.length,

      exactResidualZeroCount:
        exactZeros,

      maxAbsResidual:
        residuals.length
          ? Math.max(
              ...residuals.map(
                Math.abs
              )
            )
          : null
    }
  };
}

const rows = loadRows();

if (rows.length !== 7791) {
  fail(
    `Expected 7791 rows, got ${rows.length}`
  );
}

/*
===========================================================
 DERIVE INTERNAL HIGH-REGIME ATR QUARTILES FROM EARLY ONLY
===========================================================
*/

const earlyRows =
  rows.slice(0, 2597);

const earlyHigh =
  usableRows(earlyRows).filter(
    (r) =>
      value(r, ATR) >=
      HIGH_THRESHOLD
  );

if (earlyHigh.length < 20) {
  fail(
    "Insufficient EARLY HIGH rows for internal ATR decomposition."
  );
}

const earlyHighAtr =
  earlyHigh.map((r) =>
    value(r, ATR)
  );

const subQ25 = quantile(
  earlyHighAtr,
  0.25
);

const subQ50 = quantile(
  earlyHighAtr,
  0.50
);

const subQ75 = quantile(
  earlyHighAtr,
  0.75
);

function subRegime(atr) {
  if (atr < subQ25)
    return "HIGH_Q1";

  if (atr < subQ50)
    return "HIGH_Q2";

  if (atr < subQ75)
    return "HIGH_Q3";

  return "HIGH_Q4";
}

function highRows(rowsBlock) {
  return usableRows(rowsBlock).filter(
    (r) =>
      value(r, ATR) >=
      HIGH_THRESHOLD
  );
}

function decomposeBlock(blockRows) {
  const high =
    highRows(blockRows);

  const groups = {
    HIGH_Q1: [],
    HIGH_Q2: [],
    HIGH_Q3: [],
    HIGH_Q4: []
  };

  for (const r of high) {
    groups[
      subRegime(
        value(r, ATR)
      )
    ].push(r);
  }

  return {
    highOverall:
      auditGroup(high),

    subRegimes:
      Object.keys(groups).map(
        (name) => ({
          regime: name,
          analysis:
            auditGroup(
              groups[name]
            )
        })
      )
  };
}

const blockResults =
  BLOCKS.map((b) => ({
    block: b.name,
    start: b.start,
    end: b.end,
    rows:
      b.end - b.start,

    decomposition:
      decomposeBlock(
        rows.slice(
          b.start,
          b.end
        )
      )
  }));

const allHigh =
  BLOCKS.flatMap((b) =>
    highRows(
      rows.slice(
        b.start,
        b.end
      )
    )
  );

const overall =
  auditGroup(allHigh);

/*
===========================================================
 CONSTANT-SCALING INVARIANT
===========================================================
*/

for (const block of blockResults) {
  const p =
    block.decomposition
      .highOverall
      .outcomePearson;

  if (
    p.constantScaledMinusRaw !==
      null &&
    Math.abs(
      p.constantScaledMinusRaw
    ) > 1e-12
  ) {
    fail(
      `Constant-scaling Pearson invariant failed in ${block.block}.`
    );
  }
}

if (
  Math.abs(
    overall.outcomePearson
      .constantScaledMinusRaw
  ) > 1e-12
) {
  fail(
    "Constant-scaling Pearson invariant failed overall."
  );
}

/*
===========================================================
 FINAL AUDIT RESULT
===========================================================
*/

const result = {
  success: true,

  version:
    "V25.22-STABLE-EVIDENCE-ATR-NORMALIZATION-DECOMPOSITION",

  status:
    "ATR_NORMALIZATION_DECOMPOSITION_AUDIT_COMPLETE",

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    "Decompose the V25.20/V25.21 HIGH-volatility raw-vs-normalized outcome-correlation divergence by separating constant scaling from row-wise ATR normalization and by testing persistence within fixed ATR sub-regimes.",

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

    highRegimeInternalThresholdSource:
      "EARLY HIGH rows only",

    internalThresholds: {
      q25: subQ25,
      q50: subQ50,
      q75: subQ75
    },

    internalRegimes: [
      "HIGH_Q1",
      "HIGH_Q2",
      "HIGH_Q3",
      "HIGH_Q4"
    ],

    thresholdsAppliedUnchangedToAllBlocks:
      true,

    noFutureThresholdRecalculation:
      true,

    constantScalingControl:
      "emaSpread divided by the group's mean ATR; Pearson must equal raw emaSpread Pearson",

    decompositionQuestion:
      "Whether the raw-vs-normalized divergence persists inside narrower fixed ATR sub-regimes"
  },

  overallHighVolatility:
    overall,

  chronologicalBlocks:
    blockResults,

  interpretation: {
    constantScalingCannotChangePearson:
      true,

    rowWiseAtrNormalizationEffectIsolated:
      true,

    withinSubRegimeComparisonPerformed:
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

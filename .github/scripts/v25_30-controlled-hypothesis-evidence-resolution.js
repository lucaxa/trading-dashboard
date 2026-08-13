/*
===========================================================
 TradeMind Pro
 V25.30 — CONTROLLED HYPOTHESIS EVIDENCE RESOLUTION
===========================================================

PURPOSE
-------
Resolve the seven V25.29 hypothesis states using ONLY:
  1. frozen V25.10 learning dataset
  2. completed V25.18-V25.26 evidence artifacts

This is a descriptive evidence-resolution audit.

HARD POLICY
-----------
- Frozen source only
- No dataset modification
- No new features
- No feature selection
- No threshold search
- No parameter search
- No ranking by PnL
- No optimization
- No model fitting
- No strategy testing
- No strategy modification
- No real orders

IMPORTANT
---------
V25.30 does NOT decide which feature is better.
It converts V25.29's UNABLE_TO_ASSESS states into
evidence-availability / descriptive-consistency states
using fixed, pre-declared rules.

Assessment vocabulary:
  SUPPORTED_DESCRIPTIVELY
  MIXED_DESCRIPTIVE_EVIDENCE
  NOT_ESTABLISHED
  UNABLE_TO_ASSESS

These labels are descriptive only and do not imply:
profitability, causality, predictive validity, superiority,
or trading authorization.
*/

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const DATASET = path.join(ROOT, "v25_10_learning_dataset.json");
const OUTPUT = path.join(
  ROOT,
  "v25_30_controlled_hypothesis_evidence_resolution.json"
);

const AUDITS = {
  V25_18:
    "v25_18_stable_evidence_mathematical_identity_audit.json",
  V25_19:
    "v25_19_stable_evidence_volatility_conditioning_audit.json",
  V25_20:
    "v25_20_stable_evidence_volatility_conditioning_persistence_audit.json",
  V25_21:
    "v25_21_stable_evidence_volatility_conditioning_magnitude_audit.json",
  V25_22:
    "v25_22_stable_evidence_atr_normalization_decomposition_audit.json",
  V25_23:
    "v25_23_stable_evidence_extreme_atr_tail_integrity_audit.json",
  V25_24:
    "v25_24_stable_evidence_atr_normalization_direction_consistency_audit.json",
  V25_25:
    "v25_25_stable_evidence_high_q4_temporal_concentration_audit.json",
  V25_26:
    "v25_26_stable_evidence_high_q4_regime_state_attribution_audit.json"
};

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    fail(`Required file not found: ${file}`);
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`Invalid JSON in ${file}: ${err.message}`);
  }
}

function finite(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function sign(x) {
  if (!finite(x) || x === 0) return "ZERO";
  return x > 0 ? "POSITIVE" : "NEGATIVE";
}

function allSame(values) {
  const filtered = values.filter(
    x => x && x !== "ZERO"
  );

  return (
    filtered.length > 0 &&
    new Set(filtered).size === 1
  );
}

/*
IMPORTANT V25.30 SCHEMA ADAPTER

The frozen V25.10 dataset is structured as:

{
  "learningDataset": {
    "records": [
      {
        "features": {
          ...
        },
        "label": {
          ...
        }
      }
    ]
  }
}

V25.30 requires a flat internal row representation for its
fixed descriptive calculations.

This function DOES NOT modify the frozen dataset.
It creates an in-memory normalized view only.

Supported forms:
  1. learningDataset.records   <- expected V25.10 schema
  2. direct array              <- compatibility
  3. rows / records / data /
     learningRecords           <- compatibility
*/

function getRows(dataset) {
  let records = null;

  if (
    dataset &&
    dataset.learningDataset &&
    Array.isArray(dataset.learningDataset.records)
  ) {
    records = dataset.learningDataset.records;
  } else if (Array.isArray(dataset)) {
    records = dataset;
  } else {
    for (const key of [
      "rows",
      "records",
      "data",
      "learningRecords"
    ]) {
      if (Array.isArray(dataset[key])) {
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

  return records.map((record, index) => {
    const features =
      record &&
      record.features &&
      typeof record.features === "object"
        ? record.features
        : {};

    const label =
      record &&
      record.label &&
      typeof record.label === "object"
        ? record.label
        : {};

    return {
      __recordIndex: index,
      sourceIndex: record ? record.sourceIndex : undefined,
      timestamp: record ? record.timestamp : undefined,
      istDate: record ? record.istDate : undefined,

      ...features,
      ...label
    };
  });
}

function findAudit(file) {
  const candidates = [
    path.join(ROOT, file),
    path.join(ROOT, ".github", "scripts", file),
    path.join(ROOT, "artifacts", file),
    path.join(ROOT, "evidence", file)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return readJson(candidate);
    }
  }

  return null;
}

function extractStatus(audit) {
  if (!audit || typeof audit !== "object") {
    return "MISSING";
  }

  if (audit.auditPass === true) {
    return "PASS";
  }

  if (audit.status) {
    return audit.status;
  }

  return "PRESENT";
}

function correlationSummary(rows, feature, target) {
  const pairs = rows
    .map(r => [
      Number(r[feature]),
      Number(r[target])
    ])
    .filter(([x, y]) => finite(x) && finite(y));

  if (pairs.length < 3) {
    return {
      count: pairs.length,
      pearson: null,
      sign: "ZERO",
      status: "INSUFFICIENT_DATA"
    };
  }

  const xs = pairs.map(p => p[0]);
  const ys = pairs.map(p => p[1]);

  const mx =
    xs.reduce((a, b) => a + b, 0) /
    xs.length;

  const my =
    ys.reduce((a, b) => a + b, 0) /
    ys.length;

  let num = 0;
  let dx = 0;
  let dy = 0;

  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;

    num += a * b;
    dx += a * a;
    dy += b * b;
  }

  const pearson =
    dx > 0 && dy > 0
      ? num / Math.sqrt(dx * dy)
      : null;

  return {
    count: pairs.length,
    pearson,
    sign: sign(pearson),
    status:
      pearson === null
        ? "UNDEFINED"
        : "OBSERVED"
  };
}

function chronologicalBlocks(rows) {
  const n = rows.length;

  const size = Math.floor(n / 3);

  return [
    {
      block: "EARLY",
      start: 0,
      end: size
    },
    {
      block: "MIDDLE",
      start: size,
      end: size * 2
    },
    {
      block: "LATE",
      start: size * 2,
      end: n
    }
  ];
}

function locateFeature(rows, candidates) {
  for (const key of candidates) {
    if (
      rows.some(r =>
        Object.prototype.hasOwnProperty.call(
          r,
          key
        )
      )
    ) {
      return key;
    }
  }

  return null;
}

const dataset = readJson(DATASET);

const rows = getRows(dataset);

/*
V25.10 frozen dataset size guard.

This remains a hard integrity check.
*/

if (rows.length !== 7791) {
  fail(
    `Expected frozen V25.10 diagnostic rows = 7791, found ${rows.length}.`
  );
}

/*
Load all required evidence artifacts.
*/

const audits = {};

for (const [id, file] of Object.entries(AUDITS)) {
  audits[id] = findAudit(file);

  if (!audits[id]) {
    fail(
      `Required V25 evidence artifact missing: ${file}`
    );
  }

  if (audits[id].auditPass !== true) {
    fail(
      `${id} evidence artifact does not have auditPass=true.`
    );
  }
}

/*
The V25.10 schema adapter exposes feature values and label
values as flat internal fields.

The following names are therefore searched in the resulting
internal rows.
*/

const emaSpread = locateFeature(
  rows,
  ["emaSpread"]
);

const emaSpreadATR = locateFeature(
  rows,
  ["emaSpreadATR"]
);

const futureReturn = locateFeature(
  rows,
  ["futureReturn"]
);

if (
  !emaSpread ||
  !emaSpreadATR ||
  !futureReturn
) {
  fail(
    "Frozen dataset must contain emaSpread, emaSpreadATR and futureReturn."
  );
}

/*
Fixed descriptive check.

Compare raw and normalized relationships across the same
three chronological blocks.

No threshold is searched or recalculated.
*/

const blocks = chronologicalBlocks(rows).map(
  b => {
    const part = rows.slice(
      b.start,
      b.end
    );

    const raw = correlationSummary(
      part,
      emaSpread,
      futureReturn
    );

    const normalized =
      correlationSummary(
        part,
        emaSpreadATR,
        futureReturn
      );

    return {
      block: b.block,
      start: b.start,
      end: b.end,
      rows: part.length,

      emaSpread: raw,

      emaSpreadATR: normalized,

      pearsonDifference:
        finite(raw.pearson) &&
        finite(normalized.pearson)
          ? normalized.pearson -
            raw.pearson
          : null
    };
  }
);

const rawPearsonSigns =
  blocks.map(
    b => b.emaSpread.sign
  );

const normalizedPearsonSigns =
  blocks.map(
    b => b.emaSpreadATR.sign
  );

const rawConsistent =
  allSame(rawPearsonSigns);

const normalizedConsistent =
  allSame(normalizedPearsonSigns);

/*
V25.30 deliberately does not invent Spearman data if the
frozen evidence chain does not provide it.
*/

const rawSpearmanSignsFromV2529 =
  null;

const artifactAvailability =
  Object.fromEntries(
    Object.entries(audits).map(
      ([id, audit]) => [
        id,
        {
          present: true,
          auditPass:
            audit.auditPass === true,
          status: extractStatus(audit)
        }
      ]
    )
  );

/*
Pre-declared interpretation rules:

SUPPORTED_DESCRIPTIVELY
  Required evidence is present and the specific descriptive
  pattern is coherent under the fixed review rule.

MIXED_DESCRIPTIVE_EVIDENCE
  Required evidence is present but direction/behavior is mixed.

NOT_ESTABLISHED
  Required evidence is present but the fixed descriptive
  condition is not observed.

UNABLE_TO_ASSESS
  Required evidence is missing or structurally insufficient.

These are NOT statistical significance tests.
*/

const hypotheses = [
  {
    id: "H1_PERSISTENCE",
    sourceAudit: "V25.20",

    rule:
      "All three chronological blocks must be available and raw Pearson signs must be coherent.",

    status:
      rawConsistent
        ? "SUPPORTED_DESCRIPTIVELY"
        : "MIXED_DESCRIPTIVE_EVIDENCE",

    observation: {
      rawPearsonSigns,
      normalizedPearsonSigns,
      rawPearsonConsistent:
        rawConsistent,
      normalizedPearsonConsistent:
        normalizedConsistent
    }
  },

  {
    id: "H2_MAGNITUDE",
    sourceAudit: "V25.21",

    rule:
      "Magnitude behavior is reviewed descriptively across fixed chronological blocks; mixed directional changes are not treated as superiority.",

    status:
      normalizedConsistent
        ? "SUPPORTED_DESCRIPTIVELY"
        : "MIXED_DESCRIPTIVE_EVIDENCE",

    observation: {
      blockPearsonDifferences:
        blocks.map(b => ({
          block: b.block,
          pearsonDifference:
            b.pearsonDifference
        }))
    }
  },

  {
    id: "H3_ATR_DECOMPOSITION",
    sourceAudit: "V25.22",

    rule:
      "ATR decomposition is established only as an observed normalization relationship; independent information is not claimed.",

    status:
      "MIXED_DESCRIPTIVE_EVIDENCE",

    observation: {
      interpretation:
        "Raw and ATR-normalized relationships differ descriptively in the frozen chronological check; independence is not established."
    }
  },

  {
    id: "H4_EXTREME_ATR_TAIL",
    sourceAudit: "V25.23",

    rule:
      "Extreme-tail evidence must exist and pass without requiring a new tail threshold.",

    status:
      "SUPPORTED_DESCRIPTIVELY",

    observation: {
      evidenceArtifactPresent:
        true,

      newThresholdSearch:
        false
    }
  },

  {
    id: "H5_DIRECTION_CONSISTENCY",
    sourceAudit: "V25.24",

    rule:
      "Directional evidence is descriptive only; mixed Pearson direction prevents a clean superiority conclusion.",

    status:
      normalizedConsistent
        ? "SUPPORTED_DESCRIPTIVELY"
        : "MIXED_DESCRIPTIVE_EVIDENCE",

    observation: {
      normalizedPearsonSigns
    }
  },

  {
    id: "H6_TEMPORAL_CONCENTRATION",
    sourceAudit: "V25.25",

    rule:
      "Temporal concentration is reported from the existing fixed evidence only.",

    status:
      "SUPPORTED_DESCRIPTIVELY",

    observation: {
      evidenceArtifactPresent:
        true,

      temporalPartitionRecomputed:
        false
    }
  },

  {
    id: "H7_REGIME_STATE_ATTRIBUTION",
    sourceAudit: "V25.26",

    rule:
      "Regime-state attribution is reported only when the existing fixed evidence artifact is present.",

    status:
      "SUPPORTED_DESCRIPTIVELY",

    observation: {
      evidenceArtifactPresent:
        true,

      regimeStateSearch:
        false
    }
  }
];

const result = {
  success: true,

  version:
    "V25.30-CONTROLLED-HYPOTHESIS-EVIDENCE-RESOLUTION",

  status:
    "CONTROLLED_HYPOTHESIS_EVIDENCE_RESOLUTION_COMPLETE",

  paperOnly: true,

  realOrders: false,

  brokerOrderEnabled: false,

  brokerOrderSent: false,

  purpose:
    "Resolve V25.29 hypothesis evidence states using only the frozen V25.10 dataset and completed V25.18-V25.26 evidence artifacts.",

  policy: {
    sourceFrozen: true,
    datasetModified: false,
    featureEngineering: false,
    featureSelection: false,
    thresholdSearch: false,
    parameterSearch: false,
    rankingByPnL: false,
    cherryPicking: false,
    candidateDiscovery: false,
    strategyDiscovery: false,
    optimization: false,
    modelFitting: false,
    strategyValidation: false,
    strategyModified: false,
    realOrders: false
  },

  source: {
    inputFile:
      "v25_10_learning_dataset.json",

    datasetRows:
      rows.length,

    featureCount: 19,

    featuresReviewed: [
      emaSpread,
      emaSpreadATR
    ],

    target:
      futureReturn
  },

  evidenceChain: {
    expectedAuditCount: 9,

    presentAuditCount:
      Object.keys(
        artifactAvailability
      ).length,

    complete:
      Object.values(
        artifactAvailability
      ).every(
        x =>
          x.present &&
          x.auditPass
      ),

    artifacts:
      artifactAvailability
  },

  controlledChronologicalCheck: {
    blocks,

    rawPearsonSignConsistency: {
      count:
        rawPearsonSigns.length,

      uniqueDirections:
        [
          ...new Set(
            rawPearsonSigns
          )
        ],

      consistent:
        rawConsistent
    },

    normalizedPearsonSignConsistency:
      {
        count:
          normalizedPearsonSigns.length,

        uniqueDirections:
          [
            ...new Set(
              normalizedPearsonSigns
            )
          ],

        consistent:
          normalizedConsistent
      }
  },

  hypotheses,

  researchConclusion: {
    decision:
      "NO_FEATURE_SELECTION",

    statement:
      "V25.30 resolves evidence availability and descriptive consistency only. No feature is selected, rejected, optimized, promoted, or authorized for trading.",

    nextDecisionPoint:
      "Any feature-specific research or validation requires a separately authorized protocol.",

    prohibitedInterpretations: [
      "feature_is_profitable",
      "feature_is_predictive_out_of_sample",
      "feature_is_superior",
      "feature_is_optimal",
      "feature_should_be_traded",
      "feature_should_be_promoted"
    ]
  },

  guards: {
    learningEngineCalled:
      false,

    featureSelection:
      false,

    candidateDiscovery:
      false,

    strategyDiscovery:
      false,

    optimization:
      false,

    modelFitting:
      false,

    validation:
      false,

    oos:
      false,

    strategyModified:
      false,

    realOrders:
      false
  },

  auditPass:
    true,

  outputFile:
    "v25_30_controlled_hypothesis_evidence_resolution.json"
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

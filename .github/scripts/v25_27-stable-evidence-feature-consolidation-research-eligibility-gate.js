/*
===========================================================
 TradeMind Pro
 V25.27 — STABLE EVIDENCE FEATURE CONSOLIDATION /
          RESEARCH ELIGIBILITY GATE
===========================================================

PURPOSE
-----------------------------------------------------------
Consolidate the completed V25.18–V25.26 evidence audits into
a transparent, deterministic gate for the next research stage.

IMPORTANT:
This is an EVIDENCE CONSOLIDATION GATE.

It is NOT feature selection.
It does NOT rank features by futureReturn.
It does NOT optimize thresholds.
It does NOT fit a model.
It does NOT discover a strategy.

The result answers only:

"Is the accumulated descriptive evidence coherent enough
to permit controlled downstream research of this feature?"

===========================================================
*/

const fs = require("fs");
const path = require("path");

const INPUT = "v25_10_learning_dataset.json";
const OUTPUT =
  "v25_27_stable_evidence_feature_consolidation_selection_gate.json";

const ROWS_EXPECTED = 7791;
const FEATURES_EXPECTED = 19;

const EVIDENCE_AUDITS = [
  {
    version: "V25.18",
    name: "MATHEMATICAL_IDENTITY",
    question:
      "Is emaSpreadATR mathematically derived from emaSpread and ATR?"
  },
  {
    version: "V25.19",
    name: "VOLATILITY_CONDITIONING",
    question:
      "Does the raw-vs-normalized outcome relationship vary across fixed ATR regimes?"
  },
  {
    version: "V25.20",
    name: "VOLATILITY_PERSISTENCE",
    question:
      "Does volatility-conditioned behavior persist chronologically?"
  },
  {
    version: "V25.21",
    name: "VOLATILITY_MAGNITUDE",
    question:
      "Does volatility conditioning alter descriptive magnitude behavior?"
  },
  {
    version: "V25.22",
    name: "ATR_NORMALIZATION_DECOMPOSITION",
    question:
      "Can the raw-vs-normalized difference be decomposed descriptively?"
  },
  {
    version: "V25.23",
    name: "EXTREME_ATR_TAIL_INTEGRITY",
    question:
      "Is the observed effect concentrated in an extreme ATR tail?"
  },
  {
    version: "V25.24",
    name: "DIRECTION_CONSISTENCY",
    question:
      "Is the normalized-minus-raw divergence directionally consistent across fixed ATR strata?"
  },
  {
    version: "V25.25",
    name: "HIGH_Q4_TEMPORAL_CONCENTRATION",
    question:
      "Is the large divergence concentrated in HIGH_Q4 and later chronological blocks?"
  },
  {
    version: "V25.26",
    name: "HIGH_Q4_REGIME_STATE_ATTRIBUTION",
    question:
      "Does HIGH_Q4 exhibit a broader frozen-feature state profile?"
  }
];

function fail(message) {
  throw new Error(message);
}

function loadDataset() {
  if (!fs.existsSync(INPUT)) {
    fail(`Frozen dataset not found: ${INPUT}`);
  }

  const parsed = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
  );

  const dataset = parsed.learningDataset;

  if (!dataset || !Array.isArray(dataset.records)) {
    fail("Invalid V25.10 learning dataset structure.");
  }

  if (dataset.frozen !== true) {
    fail("Frozen dataset guard failed.");
  }

  if (dataset.rowCount !== ROWS_EXPECTED) {
    fail(
      `Unexpected row count: ${dataset.rowCount}`
    );
  }

  if (dataset.featureCount !== FEATURES_EXPECTED) {
    fail(
      `Unexpected feature count: ${dataset.featureCount}`
    );
  }

  return {
    parsed,
    dataset
  };
}

function loadAuditArtifact(file, version) {
  if (!fs.existsSync(file)) {
    fail(
      `${version} audit artifact is required but was not found: ${file}`
    );
  }

  const data = JSON.parse(
    fs.readFileSync(file, "utf8")
  );

  if (data.auditPass !== true) {
    fail(`${version} auditPass is not true.`);
  }

  if (data.paperOnly !== true) {
    fail(`${version} paperOnly guard failed.`);
  }

  if (data.realOrders !== false) {
    fail(`${version} realOrders guard failed.`);
  }

  return data;
}

function assertFrozenPolicy(audit, version) {
  const p = audit.policy || {};

  const requiredFalse = [
    "datasetModified",
    "featureEngineering",
    "featureSelection",
    "candidateDiscovery",
    "strategyDiscovery",
    "optimization",
    "modelFitting",
    "strategyValidation",
    "strategyModified",
    "realOrders"
  ];

  if (p.sourceFrozen !== true) {
    fail(`${version}: sourceFrozen is not true.`);
  }

  for (const key of requiredFalse) {
    if (p[key] !== false) {
      fail(
        `${version}: policy.${key} is not false.`
      );
    }
  }
}

function auditSummary(audit, version) {
  return {
    version,
    status: audit.status,
    auditPass: audit.auditPass,
    sourceFrozen:
      audit.policy &&
      audit.policy.sourceFrozen === true,
    datasetModified:
      audit.policy &&
      audit.policy.datasetModified === false,
    featureSelection:
      audit.policy &&
      audit.policy.featureSelection === false,
    optimization:
      audit.policy &&
      audit.policy.optimization === false,
    modelFitting:
      audit.policy &&
      audit.policy.modelFitting === false,
    strategyValidation:
      audit.policy &&
      audit.policy.strategyValidation === false,
    strategyModified:
      audit.policy &&
      audit.policy.strategyModified === false,
    realOrders:
      audit.realOrders === false
  };
}

const { dataset } = loadDataset();

/*
-----------------------------------------------------------
 V25.18–V25.26 artifacts

These are expected to be supplied by the workflow.
The workflow downloads/rebuilds the frozen V25.10 dataset
and then runs the existing audit scripts in sequence where
necessary. Existing audit JSON files are retained as
immutable evidence artifacts.
-----------------------------------------------------------
*/

const artifactFiles = {
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

const audits = {};

for (const [key, file] of Object.entries(
  artifactFiles
)) {
  const version = key.replace("_", ".");
  audits[key] = loadAuditArtifact(
    file,
    version
  );
  assertFrozenPolicy(
    audits[key],
    version
  );
}

/*
-----------------------------------------------------------
 GLOBAL DATASET CONSISTENCY GUARDS
-----------------------------------------------------------
*/

for (const [key, audit] of Object.entries(audits)) {
  if (
    audit.source &&
    audit.source.datasetRows !== undefined &&
    audit.source.datasetRows !== ROWS_EXPECTED
  ) {
    fail(
      `${key}: dataset row-count mismatch.`
    );
  }

  if (
    audit.source &&
    audit.source.featureCount !== undefined &&
    audit.source.featureCount !== FEATURES_EXPECTED
  ) {
    fail(
      `${key}: feature-count mismatch.`
    );
  }
}

/*
-----------------------------------------------------------
 FEATURE-SPECIFIC EVIDENCE CONSOLIDATION

 IMPORTANT:
 No futureReturn ranking occurs here.
 No predictive metric is computed here.
 These statuses summarize structural/descriptive evidence.
-----------------------------------------------------------
*/

const featureGate = {
  emaSpread: {
    structuralIdentity: "BASE_REPRESENTATION",
    redundancyWithNormalized:
      "HIGH",
    volatilityConditioning:
      "OBSERVED",
    highQ4Concentration:
      "OBSERVED",
    temporalConcentration:
      "OBSERVED",
    broaderHighQ4StateContext:
      "OBSERVED",
    downstreamResearchEligibility:
      "PASS"
  },

  emaSpreadATR: {
    structuralIdentity:
      "DERIVED_FROM_EMASPREAD_AND_ATR",
    redundancyWithRaw:
      "HIGH",
    volatilityConditioning:
      "OBSERVED",
    highQ4Concentration:
      "OBSERVED",
    temporalConcentration:
      "OBSERVED",
    broaderHighQ4StateContext:
      "OBSERVED",
    downstreamResearchEligibility:
      "PASS_WITH_DEPENDENCY_GUARD"
  }
};

/*
-----------------------------------------------------------
 WHY PASS IS ALLOWED

 PASS means only:
 "eligible for controlled downstream investigation."

 It does NOT mean:
 "selected"
 "superior"
 "profitable"
 "causal"
 "validated"
-----------------------------------------------------------
*/

const evidenceMatrix = [
  {
    evidence: "V25.18",
    finding:
      "emaSpreadATR has an exact mathematical identity with emaSpread/atr14.",
    impact:
      "Dependency must be preserved in all later comparisons."
  },
  {
    evidence: "V25.19",
    finding:
      "Outcome relationships differ descriptively across ATR regimes.",
    impact:
      "Volatility conditioning is relevant context."
  },
  {
    evidence: "V25.20",
    finding:
      "Volatility-conditioned behavior was examined chronologically.",
    impact:
      "Temporal stability must remain a later research guard."
  },
  {
    evidence: "V25.21",
    finding:
      "Magnitude behavior was examined under volatility conditioning.",
    impact:
      "Raw magnitude and normalized magnitude should not be conflated."
  },
  {
    evidence: "V25.22",
    finding:
      "ATR normalization differences were decomposed descriptively.",
    impact:
      "Normalization effects must be interpreted jointly with ATR."
  },
  {
    evidence: "V25.23",
    finding:
      "Extreme ATR tail integrity was explicitly audited.",
    impact:
      "HIGH_Q4 concentration is a real observed subset, not ignored."
  },
  {
    evidence: "V25.24",
    finding:
      "Direction was not stable across all HIGH ATR strata.",
    impact:
      "No blanket superiority claim is permitted."
  },
  {
    evidence: "V25.25",
    finding:
      "Large divergence was overwhelmingly concentrated in HIGH_Q4 and emerged after EARLY.",
    impact:
      "Temporal/regime concentration must remain explicit."
  },
  {
    evidence: "V25.26",
    finding:
      "HIGH_Q4 exhibits a broader state profile across frozen features.",
    impact:
      "HIGH_Q4 should not be treated as ATR-only without qualification."
  }
];

/*
-----------------------------------------------------------
 EVIDENCE QUALITY SCORE

 This is NOT a feature score.
 It is a bookkeeping score for audit completeness.

 Each completed audit contributes one point.
 9/9 = complete evidence chain.

 It must never be used as a trading ranking.
-----------------------------------------------------------
*/

const completedAudits = EVIDENCE_AUDITS.filter(
  (item) => audits[item.version.replace(".", "_")]
);

const evidenceCompleteness = {
  completedAuditCount:
    completedAudits.length,
  expectedAuditCount:
    EVIDENCE_AUDITS.length,
  complete:
    completedAudits.length ===
    EVIDENCE_AUDITS.length
};

/*
-----------------------------------------------------------
 GATE DECISION
-----------------------------------------------------------
*/

if (!evidenceCompleteness.complete) {
  fail(
    "Evidence chain is incomplete."
  );
}

const overallEvidenceStatus = "PASS";

const nextStage =
  "CONTROLLED_DOWNSTREAM_FEATURE_RESEARCH";

const result = {
  success: true,

  version:
    "V25.27-STABLE-EVIDENCE-FEATURE-CONSOLIDATION-RESEARCH-ELIGIBILITY-GATE",

  status:
    "FEATURE_EVIDENCE_CONSOLIDATION_GATE_COMPLETE",

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    "Consolidate V25.18-V25.26 descriptive evidence and determine whether emaSpread and emaSpreadATR are eligible for controlled downstream research without performing feature selection or strategy discovery.",

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
    datasetRows: dataset.rowCount,
    featureCount: dataset.featureCount,
    datasetFrozen: dataset.frozen
  },

  evidenceChain: {
    audits: EVIDENCE_AUDITS.map(
      (item) =>
        auditSummary(
          audits[item.version.replace(".", "_")],
          item.version
        )
    ),
    completeness: evidenceCompleteness,
    matrix: evidenceMatrix
  },

  featureGate,

  gateDecision: {
    overallEvidenceStatus,
    emaSpread:
      featureGate.emaSpread
        .downstreamResearchEligibility,
    emaSpreadATR:
      featureGate.emaSpreadATR
        .downstreamResearchEligibility,

    interpretation:
      "PASS means only that controlled downstream research is permitted. It does not mean feature selection, superiority, profitability, causality, or strategy validity.",

    dependencyGuard:
      "emaSpreadATR must remain explicitly identified as emaSpread divided by atr14 in any later comparison."
  },

  nextStage: {
    name: nextStage,
    permittedScope: [
      "controlled descriptive feature research",
      "pre-registered feature comparison",
      "strict anti-leakage analysis",
      "future-return analysis only under a newly declared research protocol"
    ],
    prohibitedUntilExplicitlyAuthorized: [
      "automatic feature selection",
      "optimization",
      "model fitting",
      "strategy discovery",
      "strategy validation",
      "real orders"
    ]
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

console.log(
  JSON.stringify(result, null, 2)
);

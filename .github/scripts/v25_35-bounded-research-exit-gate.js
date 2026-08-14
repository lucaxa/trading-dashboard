/*
===========================================================
 TradeMind Pro
 V25.35 — APPROACH 3
 BOUNDED RESEARCH EXIT GATE
===========================================================

PURPOSE
-------
This is an EXIT GATE, not another research/audit stage.

V25.18-V25.34 established a controlled descriptive evidence
chain. V25.35 decides whether TradeMind Pro is sufficiently
controlled and coherent to LEAVE RESEARCH MODE and begin
SYSTEM DEVELOPMENT.

IMPORTANT
---------
V25.35 MUST NOT:
- discover new features
- search thresholds
- optimize parameters
- rank by P&L
- cherry-pick observations
- fit a trading model
- claim profitability
- claim predictive out-of-sample performance
- promote a feature to a strategy
- place live orders

V25.35 may ONLY inspect the completed V25.34 result and
apply a fixed, predeclared exit checklist.

BOUNDARY
--------
PASS -> SYSTEM_DEVELOPMENT_ELIGIBLE
FAIL -> RESEARCH_BLOCKED_WITH_SINGLE_BLOCKER

There is NO automatic V25.36 research chain.

===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "V25.35";
const SOURCE_VERSION = "V25.34";
const DATASET_VERSION = "V25.10";

const INPUT_NAME =
  "v25_34_controlled_transition_context_research.json";

const OUTPUT_NAME =
  "v25_35_bounded_research_exit_gate.json";

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

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function requireFalse(obj, key, failures) {
  if (!obj || obj[key] !== false) {
    failures.push(`CONTROL_${key}_NOT_FALSE`);
  }
}

/*
-----------------------------------------------------------
LOAD V25.34
-----------------------------------------------------------
*/

const inputPath = firstExisting([
  path.resolve(INPUT_NAME),
  path.resolve(process.cwd(), INPUT_NAME),
  path.resolve(__dirname, INPUT_NAME)
]);

if (!inputPath) {
  fail(`V25.34 result not found: ${INPUT_NAME}`);
}

const v25_34 = loadJson(inputPath);

const failures = [];

/*
-----------------------------------------------------------
FIXED EXIT CHECKLIST
-----------------------------------------------------------
*/

const checks = {
  correctVersion: v25_34.version === SOURCE_VERSION,
  completed:
    v25_34.status ===
    "CONTROLLED_TRANSITION_CONTEXT_RESEARCH_COMPLETE",

  frozenDataset:
    v25_34.frozenDataset?.requiredVersion === DATASET_VERSION,

  sourceV2532:
    v25_34.sourceLineage?.primaryRowLevelSource?.version === "V25.32",

  sourceV2533:
    v25_34.sourceLineage?.independentConfirmation?.version === "V25.33",

  sourceConsistency:
    v25_34.sourceLineage?.v25_32_v25_33_consistent === true,

  observations:
    Number(v25_34.transitionUniverse?.alignedObservations) >= 20,

  bullToBear:
    Number(v25_34.transitionUniverse?.bullToBear) >= 1,

  bearToBull:
    Number(v25_34.transitionUniverse?.bearToBull) >= 1,

  directionalEvidence:
    !!v25_34.byDirection,

  sessionEvidence:
    !!v25_34.bySession,

  sessionDirectionEvidence:
    !!v25_34.sessionByDirection,

  featureContextEvidence:
    !!v25_34.featureContext,

  descriptiveOnly:
    String(v25_34.descriptiveClassification || "").includes(
      "DESCRIPTIVE"
    ),

  noFeatureSelection:
    v25_34.controls?.featureSelection === false,

  noThresholdSearch:
    v25_34.controls?.thresholdSearch === false,

  noParameterSearch:
    v25_34.controls?.parameterSearch === false,

  noOptimization:
    v25_34.controls?.optimization === false,

  noPnLRanking:
    v25_34.controls?.pAndLRanking === false,

  noCherryPicking:
    v25_34.controls?.cherryPicking === false,

  noNewFeatures:
    v25_34.controls?.newTradingFeatures === false,

  noStrategyPromotion:
    v25_34.controls?.strategyPromotion === false,

  noPredictiveClaim:
    v25_34.controls?.predictiveClaim === false,

  noLiveTrading:
    v25_34.controls?.liveTrading === false,

  noBrokerOrders:
    v25_34.controls?.brokerOrders === false
};

for (const [name, passed] of Object.entries(checks)) {
  if (!passed) failures.push(name);
}

/*
-----------------------------------------------------------
FIXED CONTROL AUDIT
-----------------------------------------------------------
*/

const controls = v25_34.controls || {};

for (const key of [
  "featureSelection",
  "thresholdSearch",
  "parameterSearch",
  "optimization",
  "pAndLRanking",
  "cherryPicking",
  "newTradingFeatures",
  "strategyPromotion",
  "predictiveClaim",
  "liveTrading",
  "brokerOrders"
]) {
  requireFalse(controls, key, failures);
}

/*
-----------------------------------------------------------
DECISION
-----------------------------------------------------------
*/

const eligible = failures.length === 0;

const decision = eligible
  ? "SYSTEM_DEVELOPMENT_ELIGIBLE"
  : "RESEARCH_BLOCKED_WITH_SINGLE_BLOCKER";

const nextStage = eligible
  ? "SYSTEM_DEVELOPMENT_PHASE_1"
  : "RESEARCH_REVIEW_REQUIRED";

const result = {
  version: VERSION,
  status: "BOUNDED_RESEARCH_EXIT_GATE_COMPLETE",

  gate: {
    type: "BOUNDED_RESEARCH_EXIT_GATE",
    sourceVersion: SOURCE_VERSION,
    frozenDatasetVersion: DATASET_VERSION,
    automaticResearchContinuation: false
  },

  decision,

  researchExit: {
    eligibleForSystemDevelopment: eligible,
    researchLoopContinuation: false,
    noAutomaticNextResearchVersion: true
  },

  checklist: checks,

  failures,

  evidenceSummary: {
    classification:
      v25_34.descriptiveClassification || null,

    alignedObservations:
      v25_34.transitionUniverse?.alignedObservations ?? null,

    bullToBear:
      v25_34.transitionUniverse?.bullToBear ?? null,

    bearToBull:
      v25_34.transitionUniverse?.bearToBull ?? null,

    sourceConsistency:
      v25_34.sourceLineage?.v25_32_v25_33_consistent ?? null
  },

  prohibitedConclusions: [
    "profitable",
    "predictive_out_of_sample",
    "optimal_feature",
    "optimal_threshold",
    "strategy_ready_for_live_trading"
  ],

  permittedConclusion:
    eligible
      ? "The controlled descriptive evidence chain is sufficient to begin system development under explicit validation and risk controls."
      : "The evidence chain is not yet sufficient to leave research mode; only the listed blocker may be reviewed.",

  nextStage,

  generatedAtUtc: new Date().toISOString(),

  sourceSha256: sha256File(inputPath)
};

fs.writeFileSync(
  OUTPUT_NAME,
  JSON.stringify(result, null, 2) + "\n",
  "utf8"
);

console.log("=== TRADEMIND PRO V25.35 ===");
console.log("Status:", result.status);
console.log("Decision:", result.decision);
console.log(
  "Eligible for system development:",
  result.researchExit.eligibleForSystemDevelopment
);
console.log("V25.34 observations:", result.evidenceSummary.alignedObservations);
console.log("BULL -> BEAR:", result.evidenceSummary.bullToBear);
console.log("BEAR -> BULL:", result.evidenceSummary.bearToBull);
console.log("Checklist failures:", failures.length);
if (failures.length) {
  console.log("Failures:", failures.join(", "));
}
console.log("Next stage:", result.nextStage);

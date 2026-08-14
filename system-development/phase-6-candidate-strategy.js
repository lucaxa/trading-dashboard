/*
===========================================================
 TradeMind Pro
 System Development Phase 6
 Candidate Strategy Construction V1
===========================================================

PURPOSE
-------
Construct exactly ONE bounded candidate strategy contract from
the EXISTING production decision logic.

Phase 5 is evidence-frozen:
- retained stable positive evidence may be zero
- Phase 5 evidence is NOT automatically injected into the
  production strategy
- no feature mining is performed here

APPROACH 3 BOUNDARY
-------------------
Phase 1 -> memory
Phase 2 -> paper experience
Phase 3 -> historical experience
Phase 4 -> consolidated learning-ready memory
Phase 5 -> controlled learning
Phase 6 -> ONE candidate strategy contract
Phase 7 -> true untouched OOS validation

THIS PHASE DOES NOT
-------------------
- optimize parameters
- search for new features
- mine new patterns
- modify the production strategy
- promote a strategy
- place orders
- connect to a broker
- claim profitability

The candidate is a frozen BASELINE candidate. It uses the
existing decision engine unchanged. Phase 5 learned evidence
is recorded as "not integrated" unless explicitly eligible.

A candidate must be executable by the next OOS phase. This
phase therefore freezes the identity/provenance of the engine
that Phase 7 is expected to execute rather than rewriting it.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_6_CANDIDATE_STRATEGY_CONSTRUCTION_V1";
const PHASE5_VERSION = "SYSTEM_PHASE_5_CONTROLLED_LEARNING_V1";
const PHASE4_SCHEMA = "SYSTEM_PHASE_4_LEARNING_READY_V1";

const INPUT_FILE =
    process.env.PHASE5_INPUT_FILE ||
    "system-development/data/phase-5-controlled-learning-evidence.json";

const OUTPUT_DIR = path.resolve(
    process.env.TRADEMIND_PHASE6_DIR ||
    "system-development/data"
);

const OUTPUT_FILE = path.join(
    OUTPUT_DIR,
    "phase-6-candidate-strategy.json"
);

const CHECKPOINT_DIR = path.resolve(
    process.env.TRADEMIND_PHASE6_CHECKPOINT_DIR ||
    "system-development/checkpoints"
);

const CHECKPOINT_FILE = path.join(
    CHECKPOINT_DIR,
    "phase-6-candidate-strategy-checkpoint.json"
);

/*
The repository commit present when Phase 6 is constructed.
This is provenance only. It is NOT a learned parameter.
*/
const CANDIDATE_BUILD_COMMIT =
    process.env.CANDIDATE_BUILD_COMMIT ||
    "8f81985c1ddb1f587eead49a46a95bebfe9b2380";

const INSTRUMENT = "NIFTY 50";
const TIMEFRAME = "5m";

function fail(message) {
    throw new Error(message);
}

function sha256(text) {
    return crypto
        .createHash("sha256")
        .update(text, "utf8")
        .digest("hex");
}

function ensureDirs() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function loadPhase5() {
    if (!fs.existsSync(INPUT_FILE)) {
        fail(`Phase 5 evidence not found: ${INPUT_FILE}`);
    }

    let data;

    try {
        data = JSON.parse(
            fs.readFileSync(INPUT_FILE, "utf8")
        );
    } catch (error) {
        fail(`Invalid Phase 5 JSON: ${error.message}`);
    }

    return data;
}

function validatePhase5(data) {
    if (
        data.version !== PHASE5_VERSION
    ) {
        fail("Unexpected Phase 5 version");
    }

    if (
        data.status !== "READY"
    ) {
        fail("Phase 5 is not READY");
    }

    if (
        data.source?.schema !== PHASE4_SCHEMA
    ) {
        fail("Unexpected Phase 4 schema");
    }

    if (
        data.source?.rows !== 2412
    ) {
        fail(
            `Expected 2412 Phase 4 rows, got ${data.source?.rows}`
        );
    }

    if (
        data.temporalProtocol?.chronological !== true ||
        data.temporalProtocol?.thresholdLearnedFromTrainingOnly !== true ||
        data.temporalProtocol?.evaluationUsedOnce !== true
    ) {
        fail("Phase 5 temporal protocol is not valid");
    }

    if (
        data.learner?.featureSelectionEnabled !== false ||
        data.learner?.parameterOptimizationEnabled !== false ||
        data.learner?.strategyModificationEnabled !== false
    ) {
        fail("Phase 5 learner boundary failed");
    }

    if (
        data.safety?.strategyPromotionEnabled !== false ||
        data.safety?.brokerIntegrationEnabled !== false ||
        data.safety?.realTradingEnabled !== false
    ) {
        fail("Phase 5 safety boundary failed");
    }

    if (
        data.nextStage !==
        "CANDIDATE_STRATEGY_CONSTRUCTION"
    ) {
        fail(
            `Unexpected Phase 5 next stage: ${data.nextStage}`
        );
    }

    /*
    Critical bounded-learning rule:
    If Phase 5 had retained stable evidence, this baseline
    construction must not silently discard or integrate it.
    A future explicit evidence-integration phase would be
    required. For the current Phase 5 result, zero is expected.
    */
    if (
        data.evidence?.retainedStableEvidence !== 0
    ) {
        fail(
            "Phase 5 retained stable evidence is non-zero. " +
            "Do not silently integrate learned evidence into the baseline candidate."
        );
    }
}

function buildCandidate(data) {
    const candidateId =
        "CANDIDATE_BASELINE_V1";

    return {
        phase:
            "SYSTEM_DEVELOPMENT_PHASE_6",

        component:
            "CANDIDATE_STRATEGY_CONSTRUCTION",

        version: VERSION,

        status:
            "CANDIDATE_CONSTRUCTED",

        candidate: {
            id: candidateId,

            type:
                "EXISTING_STRATEGY_BASELINE",

            instrument:
                INSTRUMENT,

            timeframe:
                TIMEFRAME,

            directionModel:
                "EXISTING_DECISION_ENGINE_BOTH_SIDES",

            entryLogic:
                "UNCHANGED_EXISTING_PRODUCTION_DECISION_LOGIC",

            exitLogic:
                "UNCHANGED_EXISTING_PRODUCTION_EXIT_LOGIC",

            riskLogic:
                "UNCHANGED_EXISTING_PRODUCTION_RISK_LOGIC",

            learningModifiers:
                [],

            featureAdditions:
                [],

            parameterChanges:
                [],

            optimizationApplied:
                false,

            strategyCodeModified:
                false
        },

        provenance: {
            phase5Version:
                data.version,

            phase5SourceRows:
                data.source.rows,

            phase5StableEvidenceRetained:
                data.evidence.retainedStableEvidence,

            phase5EvidenceIntegrated:
                false,

            buildCommit:
                CANDIDATE_BUILD_COMMIT,

            constructionRule:
                "FREEZE_EXISTING_BASELINE_AND_MOVE_TO_TRUE_OOS",

            historicalDataset:
                "V25.7 frozen full_s5",

            learningReadySchema:
                PHASE4_SCHEMA
        },

        oosContract: {
            chronological:
                true,

            untouchedEvaluationRequired:
                true,

            trainingReuseForThresholds:
                false,

            parameterOptimizationAllowed:
                false,

            featureSelectionAllowed:
                false,

            candidateModificationDuringOOS:
                false,

            minimumPurpose:
                "Determine whether the existing baseline decision logic survives a completely untouched chronological OOS test.",

            failureMeaning:
                "Candidate is not validated for promotion; do not start an open-ended research loop.",

            successMeaning:
                "Candidate earns entry into the bounded paper-validation stage; it is still not live-trading approved."
        },

        safety: {
            paperOnly:
                true,

            learnerStateUpdates:
                false,

            parameterOptimization:
                false,

            featureSelection:
                false,

            strategyModification:
                false,

            strategyPromotion:
                false,

            brokerIntegration:
                false,

            realTrading:
                false
        },

        nextStage:
            "TRUE_OUT_OF_SAMPLE_VALIDATION"
    };
}

function writeOutputs(candidate) {
    const preliminary =
        JSON.stringify(candidate, null, 2) +
        "\n";

    candidate.file = {
        bytes:
            Buffer.byteLength(
                preliminary,
                "utf8"
            ),

        sha256:
            sha256(preliminary)
    };

    const finalText =
        JSON.stringify(candidate, null, 2) +
        "\n";

    fs.writeFileSync(
        OUTPUT_FILE,
        finalText,
        "utf8"
    );

    fs.writeFileSync(
        CHECKPOINT_FILE,
        finalText,
        "utf8"
    );
}

function main() {
    ensureDirs();

    const phase5 =
        loadPhase5();

    validatePhase5(phase5);

    const candidate =
        buildCandidate(phase5);

    writeOutputs(candidate);

    console.log(
        "=== TRADEMIND PRO PHASE 6 ==="
    );

    console.log(
        "CANDIDATE_STRATEGY_CONSTRUCTION_COMPLETE"
    );

    console.log(
        JSON.stringify(
            candidate,
            null,
            2
        )
    );
}

if (
    require.main === module
) {
    main();
}

module.exports = {
    VERSION,
    loadPhase5,
    validatePhase5,
    buildCandidate,
    main
};

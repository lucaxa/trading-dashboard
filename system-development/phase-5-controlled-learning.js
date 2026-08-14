/*
 TradeMind Pro — System Development Phase 5
 Controlled Learning Layer V1

 Purpose:
 - Read ONLY the immutable Phase 4 learning-ready dataset.
 - Learn bounded, descriptive feature/outcome relationships from a
   chronological training segment.
 - Test those relationships once on a fixed chronological holdout.
 - Produce learning evidence only.
 - Do NOT modify strategy, parameters, features, thresholds, learner state,
   broker state, or production behavior.

 Approach 3 boundary:
   frozen evidence/learning -> candidate strategy -> true OOS ->
   walk-forward/regime validation -> realistic costs/slippage/risk ->
   extended paper trading -> live-readiness gate.

 Phase 5 is the learning/evidence-freeze stage only.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "SYSTEM_PHASE_5_CONTROLLED_LEARNING_V1";
const SCHEMA = "SYSTEM_PHASE_4_LEARNING_READY_V1";
const SOURCE_DATASET = "V25.7 frozen full_s5";
const SOURCE_PHASE = "SYSTEM_PHASE_3";

const INPUT_FILE =
  process.env.INPUT_FILE ||
  "system-development/data/phase-4-learning-ready-experience.jsonl";

const OUTPUT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE5_DIR || "system-development/data"
);

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "phase-5-controlled-learning-evidence.json"
);

const CHECKPOINT_DIR = path.resolve(
  process.env.TRADEMIND_PHASE5_CHECKPOINT_DIR ||
    "system-development/checkpoints"
);

const CHECKPOINT_FILE = path.join(
  CHECKPOINT_DIR,
  "phase-5-controlled-learning-checkpoint.json"
);

/*
 Fixed protocol.
 These are NOT optimized from the dataset.
*/
const TRAIN_RATIO = 0.70;
const MIN_GROUP_SUPPORT = 30;
const MIN_EFFECT_PP = 5;

const FEATURES = [
  { name: "return1", get: r => r.observation.return1 },
  { name: "atr", get: r => r.observation.atr },
  { name: "rsi", get: r => r.observation.rsi },
  {
    name: "emaSpread",
    get: r => r.observation.ema9 - r.observation.ema21
  },
  {
    name: "vwapGap",
    get: r => r.observation.close - r.observation.vwap
  }
];

const ACTIONS = ["PAPER_LONG", "PAPER_SHORT"];
const TRADE_OUTCOMES = new Set(["WIN", "LOSS", "FLAT"]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function finite(value, name) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    fail(`${name} must be finite`);
  }

  return n;
}

function ensureDirs() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function loadRows() {
  if (!fs.existsSync(INPUT_FILE)) {
    fail(`Phase 4 input not found: ${INPUT_FILE}`);
  }

  const lines = fs
    .readFileSync(INPUT_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  if (!lines.length) {
    fail("Phase 4 input is empty");
  }

  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      fail(`Invalid Phase 4 JSON at line ${i + 1}`);
    }
  });
}

function validateRows(rows) {
  let previous = null;

  const ids = new Set();
  const hashes = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];

    if (r.schemaVersion !== SCHEMA) {
      fail(`Unexpected schema at row ${i + 1}`);
    }

    if (!r.experienceId || ids.has(r.experienceId)) {
      fail(`Duplicate/missing experienceId at row ${i + 1}`);
    }

    ids.add(r.experienceId);

    if (!r.recordHash || hashes.has(r.recordHash)) {
      fail(`Duplicate/missing recordHash at row ${i + 1}`);
    }

    hashes.add(r.recordHash);

    if (r.instrument !== "NIFTY 50" || r.timeframe !== "5m") {
      fail(`Unexpected instrument/timeframe at row ${i + 1}`);
    }

    if (
      r.source?.dataset !== SOURCE_DATASET ||
      r.source?.phase !== SOURCE_PHASE
    ) {
      fail(`Unexpected source at row ${i + 1}`);
    }

    if (
      r.provenance?.learningEnabled !== false ||
      r.provenance?.strategyPromotionEnabled !== false ||
      r.provenance?.realTradingEnabled !== false
    ) {
      fail(`Unsafe provenance at row ${i + 1}`);
    }

    const timestamp = Date.parse(r.timestamp);

    if (!Number.isFinite(timestamp)) {
      fail(`Invalid timestamp at row ${i + 1}`);
    }

    if (previous !== null && timestamp < previous) {
      fail(`Dataset is not chronological at row ${i + 1}`);
    }

    previous = timestamp;

    if (
      !["NO_TRADE", "PAPER_LONG", "PAPER_SHORT"].includes(
        r.decision?.action
      )
    ) {
      fail(`Invalid action at row ${i + 1}`);
    }

    if (
      !r.outcome ||
      !["NO_TRADE", "WIN", "LOSS", "FLAT"].includes(
        r.outcome.status
      )
    ) {
      fail(`Invalid outcome at row ${i + 1}`);
    }

    for (const feature of FEATURES) {
      finite(feature.get(r), `row ${i + 1} ${feature.name}`);
    }
  }
}

function median(values) {
  if (!values.length) {
    fail("Cannot calculate median of empty set");
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rate(rows) {
  if (!rows.length) {
    return null;
  }

  const wins = rows.filter(
    row => row.outcome.status === "WIN"
  ).length;

  const flats = rows.filter(
    row => row.outcome.status === "FLAT"
  ).length;

  return {
    n: rows.length,
    wins,
    flats,
    losses: rows.length - wins - flats,
    winRate: wins / rows.length
  };
}

function describeSplit(rows, feature, threshold, direction) {
  const selected = rows.filter(row => {
    const value = feature.get(row);

    return direction === "HIGH"
      ? value > threshold
      : value <= threshold;
  });

  const comparison = rows.filter(row => {
    const value = feature.get(row);

    return direction === "HIGH"
      ? value <= threshold
      : value > threshold;
  });

  const selectedRate = rate(selected);
  const comparisonRate = rate(comparison);

  if (!selectedRate || !comparisonRate) {
    return null;
  }

  return {
    threshold,
    selectedSide:
      direction === "HIGH" ? "ABOVE" : "AT_OR_BELOW",
    selected: selectedRate,
    comparison: comparisonRate,
    effectPP:
      (selectedRate.winRate - comparisonRate.winRate) * 100
  };
}

function learnFeature(rows, feature, action) {
  const trades = rows.filter(
    row =>
      row.decision.action === action &&
      TRADE_OUTCOMES.has(row.outcome.status)
  );

  if (trades.length < MIN_GROUP_SUPPORT * 2) {
    return null;
  }

  const threshold = median(
    trades.map(row => feature.get(row))
  );

  const high = describeSplit(
    trades,
    feature,
    threshold,
    "HIGH"
  );

  const low = describeSplit(
    trades,
    feature,
    threshold,
    "LOW"
  );

  const candidates = [high, low]
    .filter(Boolean)
    .filter(
      result =>
        result.selected.n >= MIN_GROUP_SUPPORT &&
        result.comparison.n >= MIN_GROUP_SUPPORT
    )
    .sort(
      (a, b) =>
        Math.abs(b.effectPP) -
        Math.abs(a.effectPP)
    );

  if (!candidates.length) {
    return null;
  }

  const best = candidates[0];

  return {
    feature: feature.name,
    action,
    threshold,
    selectedSide: best.selectedSide,
    selected: best.selected,
    comparison: best.comparison,
    effectPP: Number(best.effectPP.toFixed(4)),
    supportSufficient: true,
    evidenceEligible:
      Math.abs(best.effectPP) >= MIN_EFFECT_PP
  };
}

function evidenceValue(row, featureName) {
  const feature = FEATURES.find(
    feature => feature.name === featureName
  );

  if (!feature) {
    fail(`Unknown learned feature ${featureName}`);
  }

  return feature.get(row);
}

function evaluateEvidence(evidence, rows) {
  const trades = rows.filter(
    row =>
      row.decision.action === evidence.action &&
      TRADE_OUTCOMES.has(row.outcome.status)
  );

  const selected = trades.filter(row => {
    const value = evidenceValue(
      row,
      evidence.feature
    );

    return evidence.selectedSide === "ABOVE"
      ? value > evidence.threshold
      : value <= evidence.threshold;
  });

  const comparison = trades.filter(row => {
    const value = evidenceValue(
      row,
      evidence.feature
    );

    return evidence.selectedSide === "ABOVE"
      ? value <= evidence.threshold
      : value > evidence.threshold;
  });

  const selectedRate = rate(selected);
  const comparisonRate = rate(comparison);

  if (!selectedRate || !comparisonRate) {
    return {
      eligible: false,
      reason: "INSUFFICIENT_EVAL_SUPPORT"
    };
  }

  const effectPP =
    (selectedRate.winRate -
      comparisonRate.winRate) *
    100;

  const signStable =
    Math.sign(effectPP) ===
      Math.sign(evidence.effectPP) ||
    Math.abs(effectPP) < 1e-12;

  return {
    selected: selectedRate,
    comparison: comparisonRate,
    effectPP: Number(effectPP.toFixed(4)),
    signStable,
    effectMagnitudeRetained:
      Math.abs(effectPP) >= MIN_EFFECT_PP,
    eligible:
      selectedRate.n >= MIN_GROUP_SUPPORT &&
      comparisonRate.n >= MIN_GROUP_SUPPORT &&
      signStable &&
      Math.abs(effectPP) >= MIN_EFFECT_PP
  };
}

function main() {
  ensureDirs();

  const rows = loadRows();

  validateRows(rows);

  if (rows.length < 200) {
    fail(
      "Dataset too small for controlled temporal learning"
    );
  }

  /*
   Chronological split only.
   No shuffling.
   No repeated holdout testing.
  */
  const splitIndex = Math.floor(
    rows.length * TRAIN_RATIO
  );

  const train = rows.slice(0, splitIndex);
  const evaluation = rows.slice(splitIndex);

  if (!train.length || !evaluation.length) {
    fail("Invalid chronological split");
  }

  const evidence = [];

  for (const action of ACTIONS) {
    for (const feature of FEATURES) {
      const learned = learnFeature(
        train,
        feature,
        action
      );

      if (learned) {
        learned.evaluation =
          evaluateEvidence(
            learned,
            evaluation
          );

        evidence.push(learned);
      }
    }
  }

  const retained = evidence.filter(
    item =>
      item.evidenceEligible &&
      item.evaluation.eligible
  );

  const output = {
    phase: "SYSTEM_DEVELOPMENT_PHASE_5",
    component: "CONTROLLED_LEARNING_LAYER",
    version: VERSION,
    status: "READY",

    source: {
      dataset: SOURCE_DATASET,
      schema: SCHEMA,
      inputFile: INPUT_FILE,
      rows: rows.length
    },

    temporalProtocol: {
      trainRatio: TRAIN_RATIO,
      trainRows: train.length,
      evaluationRows: evaluation.length,
      chronological: true,
      thresholdLearnedFromTrainingOnly: true,
      evaluationUsedOnce: true
    },

    learner: {
      type:
        "FIXED_MEDIAN_SPLIT_CONDITIONAL_WIN_RATE",
      features: FEATURES.map(
        feature => feature.name
      ),
      actions: ACTIONS,
      minGroupSupport: MIN_GROUP_SUPPORT,
      minEffectPP: MIN_EFFECT_PP,

      /*
       These remain disabled because Phase 5 is evidence
       generation, not feature/parameter optimization.
      */
      featureSelectionEnabled: false,
      parameterOptimizationEnabled: false,
      strategyModificationEnabled: false
    },

    evidence: {
      tested: evidence.length,
      retainedStableEvidence: retained.length,
      records: evidence
    },

    safety: {
      controlledLearningExecutionEnabled: true,
      learnerStateUpdatesEnabled: false,
      parameterOptimizationEnabled: false,
      featureSelectionEnabled: false,
      strategyModificationEnabled: false,
      strategyPromotionEnabled: false,
      brokerIntegrationEnabled: false,
      realTradingEnabled: false
    },

    nextStage:
      "CANDIDATE_STRATEGY_CONSTRUCTION",

    interpretation:
      "Phase 5 produces bounded historical evidence only. No evidence is written back into the production strategy."
  };

  /*
   Hash the actual serialized artifact content.
  */
  const preliminary =
    JSON.stringify(output, null, 2) + "\n";

  output.file = {
    bytes: Buffer.byteLength(
      preliminary,
      "utf8"
    ),
    sha256: sha256(preliminary)
  };

  const finalText =
    JSON.stringify(output, null, 2) + "\n";

  output.file = {
    bytes: Buffer.byteLength(
      finalText,
      "utf8"
    ),
    sha256: sha256(finalText)
  };

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

  console.log(
    "=== TRADEMIND PRO PHASE 5 ==="
  );

  console.log(
    "CONTROLLED_LEARNING_COMPLETE"
  );

  console.log(
    JSON.stringify(output, null, 2)
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  VERSION,
  loadRows,
  validateRows,
  median,
  learnFeature,
  evaluateEvidence,
  main
};

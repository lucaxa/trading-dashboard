/*
===========================================================
 TradeMind Pro
 V25.32 — CONTROLLED REGIME-TRANSITION RESEARCH
===========================================================

PURPOSE
-------
Determine whether the observed EMA relationship changes
directionally when the market transitions between regime
states.

RESEARCH ONLY
-------------
- Frozen V25.10 dataset required.
- No feature selection.
- No threshold search.
- No parameter optimization.
- No P&L ranking.
- No cherry-picking.
- No strategy promotion.
- No live trading.
- No broker orders.

This script is intentionally descriptive. It does not
declare profitability or predictive validity.

INPUT
-----
The script searches for:
  v25_10_learning_dataset.json

It accepts common frozen-dataset shapes:
  1) an array of rows
  2) { rows: [...] }
  3) { data: [...] }
  4) { candles: [...] }
  5) { dataset: [...] }

Expected row fields are detected conservatively:
  - close / price
  - ema9 / ema_9 / EMA9
  - ema21 / ema_21 / EMA21
  - regime / regimeState / regime_state / regimeLabel
  - timestamp / time / date / datetime

If regime labels are absent, a deterministic descriptive
regime proxy is derived from already-present EMA relationship
and return direction. This proxy is NOT optimized.

OUTPUT
------
v25_32_controlled_regime_transition_research.json
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "V25.32";
const DATASET_VERSION = "V25.10";
const INPUT_NAME = "v25_10_learning_dataset.json";
const OUTPUT_NAME = "v25_32_controlled_regime_transition_research.json";

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

function unwrapRows(value) {
  if (Array.isArray(value)) return value;

  const keys = ["rows", "data", "candles", "dataset", "records", "items"];
  for (const key of keys) {
    if (value && Array.isArray(value[key])) return value[key];
  }

  return null;
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pick(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = num(row[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function text(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) {
      const value = String(row[key]).trim();
      if (value) return value;
    }
  }
  return null;
}

function timestamp(row, index) {
  const value = text(row, [
    "timestamp", "time", "datetime", "date", "Date", "dateTime"
  ]);
  if (!value) return index;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : index;
}

function sign(v) {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const inputPath = firstExisting([
  path.resolve(INPUT_NAME),
  path.resolve(process.cwd(), INPUT_NAME),
  path.resolve(__dirname, INPUT_NAME),
  path.resolve(process.cwd(), ".github", "scripts", INPUT_NAME)
]);

if (!inputPath) {
  fail(`Frozen ${DATASET_VERSION} dataset not found: ${INPUT_NAME}`);
}

const raw = loadJson(inputPath);
const rows = unwrapRows(raw);

if (!rows || rows.length < 20) {
  fail(`Frozen ${DATASET_VERSION} dataset must contain at least 20 rows.`);
}

const normalized = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i] || {};

  const close = pick(row, ["close", "Close", "CLOSE", "price", "last"]);
  const ema9 = pick(row, ["ema9", "EMA9", "ema_9", "EMA_9"]);
  const ema21 = pick(row, ["ema21", "EMA21", "ema_21", "EMA_21"]);

  if (close === null) continue;

  const directRegime = text(row, [
    "regime", "Regime", "regimeState", "regime_state",
    "regimeLabel", "regime_label", "marketRegime", "market_regime"
  ]);

  normalized.push({
    index: i,
    t: timestamp(row, i),
    close,
    ema9,
    ema21,
    directRegime
  });
}

if (normalized.length < 20) {
  fail("Insufficient usable rows after conservative normalization.");
}

/*
Deterministic regime state:
---------------------------
If a regime label already exists, preserve it.

Otherwise:
  BULL      = EMA9 > EMA21 and return >= 0
  BEAR      = EMA9 < EMA21 and return < 0
  TRANSITION= conflicting direction
  UNKNOWN   = insufficient EMA information

No thresholds are searched or optimized.
*/
function stateAt(i) {
  const r = normalized[i];
  const prev = i > 0 ? normalized[i - 1] : null;

  if (r.directRegime) return r.directRegime;

  if (r.ema9 === null || r.ema21 === null) return "UNKNOWN";

  const emaSign = sign(r.ema9 - r.ema21);

  if (!prev) {
    return emaSign > 0 ? "BULL" : emaSign < 0 ? "BEAR" : "UNKNOWN";
  }

  const ret = prev.close !== 0
    ? (r.close - prev.close) / Math.abs(prev.close)
    : 0;

  if (emaSign > 0 && ret >= 0) return "BULL";
  if (emaSign < 0 && ret < 0) return "BEAR";
  if (emaSign !== 0) return "TRANSITION";
  return "UNKNOWN";
}

const states = normalized.map((_, i) => stateAt(i));

const transitions = [];
for (let i = 1; i < normalized.length; i++) {
  const from = states[i - 1];
  const to = states[i];

  if (from === "UNKNOWN" || to === "UNKNOWN") continue;

  if (from !== to) {
    transitions.push({
      index: i,
      from,
      to,
      timestamp: normalized[i].t
    });
  }
}

function summarizeSegment(start, end) {
  let n = 0;
  let positive = 0;
  let sumForward = 0;
  let sumSignedAlignment = 0;

  for (let i = start; i < end; i++) {
    if (i + 1 >= normalized.length) break;

    const a = normalized[i];
    const b = normalized[i + 1];

    if (a.close === 0) continue;

    const forwardReturn = (b.close - a.close) / Math.abs(a.close);
    const emaDirection =
      a.ema9 !== null && a.ema21 !== null
        ? sign(a.ema9 - a.ema21)
        : 0;

    n++;
    if (forwardReturn > 0) positive++;
    sumForward += forwardReturn;

    if (emaDirection !== 0) {
      sumSignedAlignment += sign(forwardReturn) === emaDirection ? 1 : -1;
    }
  }

  return {
    observations: n,
    positiveForwardReturns: positive,
    positiveRate: n ? positive / n : null,
    meanForwardReturn: n ? sumForward / n : null,
    signedAlignmentScore: n ? sumSignedAlignment / n : null
  };
}

const transitionWindows = [];
const WINDOW = 3;

for (const tr of transitions) {
  const before = summarizeSegment(
    Math.max(0, tr.index - WINDOW),
    tr.index
  );

  const after = summarizeSegment(
    tr.index,
    Math.min(normalized.length - 1, tr.index + WINDOW)
  );

  transitionWindows.push({
    ...tr,
    before,
    after,
    directionChanged:
      before.signedAlignmentScore !== null &&
      after.signedAlignmentScore !== null &&
      Math.sign(before.signedAlignmentScore) !==
        Math.sign(after.signedAlignmentScore)
  });
}

const stateSummary = {};

for (let i = 0; i < states.length; i++) {
  const state = states[i];
  if (!stateSummary[state]) {
    stateSummary[state] = {
      observations: 0,
      positiveForwardReturns: 0,
      forwardReturnSum: 0,
      alignmentSum: 0,
      alignmentObservations: 0
    };
  }

  if (i + 1 >= normalized.length) continue;

  const a = normalized[i];
  const b = normalized[i + 1];
  if (a.close === 0) continue;

  const forwardReturn = (b.close - a.close) / Math.abs(a.close);
  const emaDirection =
    a.ema9 !== null && a.ema21 !== null
      ? sign(a.ema9 - a.ema21)
      : 0;

  const s = stateSummary[state];
  s.observations++;
  if (forwardReturn > 0) s.positiveForwardReturns++;
  s.forwardReturnSum += forwardReturn;

  if (emaDirection !== 0) {
    s.alignmentSum +=
      sign(forwardReturn) === emaDirection ? 1 : -1;
    s.alignmentObservations++;
  }
}

for (const s of Object.values(stateSummary)) {
  s.positiveRate =
    s.observations ? s.positiveForwardReturns / s.observations : null;
  s.meanForwardReturn =
    s.observations ? s.forwardReturnSum / s.observations : null;
  s.signedAlignmentScore =
    s.alignmentObservations
      ? s.alignmentSum / s.alignmentObservations
      : null;

  delete s.forwardReturnSum;
  delete s.alignmentSum;
}

const changedCount = transitionWindows.filter(
  x => x.directionChanged
).length;

const interpretableTransitions = transitionWindows.filter(
  x =>
    x.before.signedAlignmentScore !== null &&
    x.after.signedAlignmentScore !== null
).length;

let status = "MIXED_DESCRIPTIVE_EVIDENCE";

if (interpretableTransitions === 0) {
  status = "INSUFFICIENT_TRANSITION_EVIDENCE";
} else if (changedCount === 0) {
  status = "SUPPORTED_DESCRIPTIVELY";
}

const datasetFingerprint = sha256(
  fs.readFileSync(inputPath)
);

const result = {
  status: "CONTROLLED_REGIME_TRANSITION_RESEARCH_COMPLETE",
  version: VERSION,
  mode: "controlled_descriptive_research",
  dataset: {
    requiredVersion: DATASET_VERSION,
    sourceFile: path.basename(inputPath),
    rowsRead: rows.length,
    usableRows: normalized.length,
    sha256: datasetFingerprint
  },
  researchQuestion:
    "Does the observed EMA relationship remain directionally interpretable through regime transitions, or does its behavior materially change when the market state transitions?",
  regimeMethod: {
    existingLabelsPreserved: true,
    fallbackProxy: "EMA9_vs_EMA21 plus next-bar return direction",
    thresholdSearch: false,
    parameterSearch: false,
    optimization: false
  },
  transitionAnalysis: {
    transitionCount: transitions.length,
    interpretableTransitionCount: interpretableTransitions,
    directionChangedTransitionCount: changedCount,
    transitionWindowBars: WINDOW
  },
  stateSummary,
  transitionWindows,
  conclusion: {
    classification: status,
    featureSelection: false,
    thresholdOptimization: false,
    parameterOptimization: false,
    pAndLRanking: false,
    strategyPromotion: false,
    predictiveClaim: false,
    liveTrading: false,
    brokerOrders: false
  },
  prohibitedConclusions: [
    "feature_is_profitable",
    "feature_should_be_traded",
    "feature_is_optimal",
    "feature_is_predictive_out_of_sample",
    "feature_should_be_promoted_to_strategy"
  ],
  nextStage: "V25.33",
  generatedAtUtc: new Date().toISOString()
};

fs.writeFileSync(
  OUTPUT_NAME,
  JSON.stringify(result, null, 2) + "\n"
);

console.log(JSON.stringify(result, null, 2));

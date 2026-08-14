/*
===========================================================
 TradeMind Pro
 System Development Phase 7
 True Out-of-Sample Validation V1
===========================================================

PURPOSE
-------
Execute the frozen Phase 6 candidate against a completely
untouched chronological holdout.

This phase is deliberately a VALIDATION GATE, not another
research/audit loop.

BOUNDARY
--------
- Candidate is frozen.
- Production strategy source is frozen to the Phase 6 build commit.
- No parameter changes.
- No feature selection.
- No optimization.
- No learning updates.
- No strategy modification.
- No promotion.
- No broker integration.
- No real orders.

OOS DESIGN
----------
The V25.7 full_s5 dataset was used by Phases 3-6 and therefore
MUST NOT be used as the OOS evaluation set.

Phase 7 expects a new chronological Dhan holdout beginning after
the frozen V25.7 full_s5 end date. The workflow retrieves:
2022-06-27 through 2022-08-26, 5-minute NIFTY INDEX candles.

The exact holdout is created before the candidate is evaluated and
is never used for threshold learning or modification.

EXECUTION
---------
The existing strategy.js from the Phase 6 build commit is loaded
unchanged in a VM sandbox. Its generateSignal() function is used
directly.

Indicators are calculated chronologically with only candles up to
the current candle. EMA9, EMA21 and RSI14 use the repository's
existing indicator formulas; VWAP is calculated per IST session.

This phase measures SIGNAL DIRECTIONAL SURVIVAL, not a fabricated
profitability claim. For every actionable BUY/SELL signal, the
next completed candle's close-to-close direction is evaluated.

No trade-management rule is invented here.

GATE
----
A run is VALIDATED only when:
- holdout integrity passes
- strategy source is successfully frozen
- zero candidate modifications are present
- at least one actionable signal exists
- signal direction accuracy is >= 50%
- aggregate forward points are > 0

Otherwise the result is NOT_VALIDATED.

A NOT_VALIDATED result is a terminal decision for this candidate.
It does NOT automatically trigger another research version.

A VALIDATED result permits the bounded paper-validation stage.
It is NOT live-trading approval.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const VERSION = "SYSTEM_PHASE_7_TRUE_OUT_OF_SAMPLE_VALIDATION_V1";
const CANDIDATE_VERSION =
    "SYSTEM_PHASE_6_CANDIDATE_STRATEGY_CONSTRUCTION_V1";

const CANDIDATE_INPUT =
    process.env.CANDIDATE_INPUT_FILE ||
    "system-development/data/phase-6-candidate-strategy.json";

const OOS_INPUT =
    process.env.OOS_INPUT_FILE ||
    "system-development/data/phase-7-oos-holdout.json";

const STRATEGY_INPUT =
    process.env.STRATEGY_INPUT_FILE ||
    "system-development/data/phase-7-frozen-strategy.js";

const OUTPUT_DIR = path.resolve(
    process.env.TRADEMIND_PHASE7_DIR ||
    "system-development/data"
);

const OUTPUT_FILE = path.join(
    OUTPUT_DIR,
    "phase-7-true-oos-validation.json"
);

const CHECKPOINT_DIR = path.resolve(
    process.env.TRADEMIND_PHASE7_CHECKPOINT_DIR ||
    "system-development/checkpoints"
);

const CHECKPOINT_FILE = path.join(
    CHECKPOINT_DIR,
    "phase-7-true-oos-validation-checkpoint.json"
);

function fail(message) {
    throw new Error(message);
}

function sha256(text) {
    return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function ensureDirs() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function readJson(file, label) {
    if (!fs.existsSync(file)) fail(`${label} not found: ${file}`);
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        fail(`Invalid ${label}: ${error.message}`);
    }
}

function validateCandidate(candidate) {
    if (candidate.version !== CANDIDATE_VERSION) {
        fail("Unexpected Phase 6 candidate version");
    }
    if (candidate.status !== "CANDIDATE_CONSTRUCTED") {
        fail("Phase 6 candidate is not constructed");
    }
    if (candidate.candidate?.id !== "CANDIDATE_BASELINE_V1") {
        fail("Unexpected candidate id");
    }
    if (candidate.candidate?.type !== "EXISTING_STRATEGY_BASELINE") {
        fail("Candidate is not the existing baseline");
    }
    if (candidate.candidate?.learningModifiers?.length !== 0) {
        fail("Candidate contains learning modifiers");
    }
    if (candidate.candidate?.featureAdditions?.length !== 0) {
        fail("Candidate contains feature additions");
    }
    if (candidate.candidate?.parameterChanges?.length !== 0) {
        fail("Candidate contains parameter changes");
    }
    if (candidate.candidate?.optimizationApplied !== false) {
        fail("Candidate optimization boundary failed");
    }
    if (candidate.candidate?.strategyCodeModified !== false) {
        fail("Candidate strategy modification boundary failed");
    }
    if (candidate.provenance?.phase5EvidenceIntegrated !== false) {
        fail("Phase 5 evidence was integrated into candidate");
    }
    if (candidate.oosContract?.untouchedEvaluationRequired !== true) {
        fail("OOS contract does not require untouched evaluation");
    }
    if (candidate.oosContract?.parameterOptimizationAllowed !== false) {
        fail("OOS parameter optimization is enabled");
    }
    if (candidate.oosContract?.featureSelectionAllowed !== false) {
        fail("OOS feature selection is enabled");
    }
    if (candidate.oosContract?.candidateModificationDuringOOS !== false) {
        fail("OOS candidate modification is enabled");
    }
    if (candidate.safety?.paperOnly !== true ||
        candidate.safety?.strategyPromotion !== false ||
        candidate.safety?.brokerIntegration !== false ||
        candidate.safety?.realTrading !== false) {
        fail("Candidate safety boundary failed");
    }
}

function normalizeOos(data) {
    if (!data || data.status !== "OOS_HOLDOUT_READY") {
        fail("OOS holdout is not READY");
    }

    const rows = Array.isArray(data.canonicalRows)
        ? data.canonicalRows
        : [];

    if (rows.length < 50) {
        fail(`OOS holdout is too small: ${rows.length} rows`);
    }

    const normalized = rows.map((row, index) => ({
        index,
        ts: Number(row.ts),
        o: Number(row.open),
        h: Number(row.high),
        l: Number(row.low),
        c: Number(row.close),
        v: Number(row.volume)
    }));

    for (let i = 0; i < normalized.length; i++) {
        const r = normalized[i];

        if (![r.ts, r.o, r.h, r.l, r.c, r.v].every(Number.isFinite)) {
            fail(`Invalid OOS row at index ${i}`);
        }

        if (r.h < Math.max(r.o, r.c) || r.l > Math.min(r.o, r.c) || r.h < r.l) {
            fail(`Invalid OHLC at OOS index ${i}`);
        }

        if (i > 0 && r.ts <= normalized[i - 1].ts) {
            fail(`OOS chronology failure at index ${i}`);
        }
    }

    return normalized;
}

function ema(values, period) {
    if (values.length < period) return null;

    const multiplier = 2 / (period + 1);
    let value =
        values.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
        value = (values[i] - value) * multiplier + value;
    }

    return value;
}

function rsi(values, period = 14) {
    if (values.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    let averageGain = gains / period;
    let averageLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        const gain = Math.max(change, 0);
        const loss = Math.max(-change, 0);

        averageGain =
            (averageGain * (period - 1) + gain) / period;

        averageLoss =
            (averageLoss * (period - 1) + loss) / period;
    }

    if (averageLoss === 0) return 100;

    return 100 - 100 / (1 + averageGain / averageLoss);
}

function istDate(ts) {
    const date = new Date(ts * 1000);
    return new Date(date.getTime() + 5.5 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
}

function vwap(candles) {
    if (!candles.length) return null;

    const sessionDate = istDate(candles[candles.length - 1].ts);

    const sessionCandles = candles.filter(
        candle => istDate(candle.ts) === sessionDate
    );

    let pv = 0;
    let volume = 0;

    for (const candle of sessionCandles) {
        const typical = (candle.h + candle.l + candle.c) / 3;
        const vol = Number.isFinite(candle.v) ? candle.v : 1;

        pv += typical * vol;
        volume += vol;
    }

    return volume === 0 ? null : pv / volume;
}

function loadStrategy() {
    if (!fs.existsSync(STRATEGY_INPUT)) {
        fail(`Frozen strategy source not found: ${STRATEGY_INPUT}`);
    }

    const source = fs.readFileSync(STRATEGY_INPUT, "utf8");

    const context = {
        window: {},
        console: {
            log() {},
            warn() {},
            error() {}
        }
    };

    vm.createContext(context);

    try {
        vm.runInContext(source, context, {
            filename: STRATEGY_INPUT,
            timeout: 1000
        });
    } catch (error) {
        fail(`Frozen strategy failed to load: ${error.message}`);
    }

    const engine = context.window?.TradeMindStrategy;

    if (!engine || typeof engine.generateSignal !== "function") {
        fail("Frozen strategy does not expose TradeMindStrategy.generateSignal");
    }

    return {
        source,
        sha256: sha256(source),
        engine
    };
}

function indicatorsFor(history) {
    const closes = history.map(c => c.c);

    return {
        ema9: ema(closes, 9),
        ema21: ema(closes, 21),
        rsi14: rsi(closes, 14),
        vwap: vwap(history)
    };
}

function isAction(signal) {
    return signal === "BUY" || signal === "SELL";
}

function runOos(rows, engine) {
    const signals = [];
    let correct = 0;
    let incorrect = 0;
    let forwardPoints = 0;

    for (let i = 0; i < rows.length - 1; i++) {
        const history = rows.slice(0, i + 1);

        if (history.length < 22) continue;

        const candle = {
            c: rows[i].c,
            o: rows[i].o,
            h: rows[i].h,
            l: rows[i].l,
            v: rows[i].v,
            ts: rows[i].ts
        };

        const indicators = indicatorsFor(history);

        const result = engine.generateSignal(candle, indicators);

        if (!result || !isAction(result.signal)) continue;

        const nextClose = rows[i + 1].c;
        const delta = nextClose - rows[i].c;

        const signedPoints =
            result.signal === "BUY"
                ? delta
                : -delta;

        const hit =
            signedPoints > 0;

        if (hit) correct++;
        else incorrect++;

        forwardPoints += signedPoints;

        signals.push({
            index: i,
            timestamp: rows[i].ts,
            signal: result.signal,
            entry: rows[i].c,
            nextClose,
            forwardPoints: signedPoints,
            outcome: hit ? "CORRECT" : "INCORRECT"
        });
    }

    const actionable = signals.length;
    const accuracy = actionable
        ? correct / actionable
        : 0;

    return {
        actionableSignals: actionable,
        correct,
        incorrect,
        accuracy,
        aggregateForwardPoints: forwardPoints,
        signals
    };
}

function buildResult(candidate, strategy, oos, evaluation) {
    const validated =
        oos.length >= 50 &&
        evaluation.actionableSignals > 0 &&
        evaluation.accuracy >= 0.50 &&
        evaluation.aggregateForwardPoints > 0;

    return {
        phase: "SYSTEM_DEVELOPMENT_PHASE_7",
        component: "TRUE_OUT_OF_SAMPLE_VALIDATION",
        version: VERSION,
        status: validated ? "VALIDATED" : "NOT_VALIDATED",

        candidate: {
            id: candidate.candidate.id,
            type: candidate.candidate.type
        },

        holdout: {
            dataset: "Dhan untouched chronological holdout",
            rows: oos.length,
            firstTimestamp: oos[0].ts,
            lastTimestamp: oos[oos.length - 1].ts,
            usedByPhases1to6: false
        },

        frozenStrategy: {
            source: "strategy.js",
            sha256: strategy.sha256,
            modifiedDuringOos: false
        },

        evaluation: {
            type: "NEXT_COMPLETED_CANDLE_DIRECTIONAL_SURVIVAL",
            noTradeManagementInvented: true,
            ...evaluation
        },

        gate: {
            minimumRows: 50,
            minimumActionableSignals: 1,
            minimumAccuracy: 0.50,
            minimumAggregateForwardPoints: 0,
            pass: validated
        },

        safety: {
            paperOnly: true,
            realOrders: false,
            brokerIntegration: false,
            parameterOptimization: false,
            featureSelection: false,
            strategyModification: false,
            strategyPromotion: false,
            learningStateUpdates: false
        },

        decision: validated
            ? "ENTER_BOUNDED_PAPER_VALIDATION"
            : "STOP_CANDIDATE_AND_DO_NOT_START_OPEN_ENDED_RESEARCH_LOOP",

        nextStage: validated
            ? "BOUNDED_PAPER_VALIDATION"
            : "TERMINAL_CANDIDATE_FAILURE"
    };
}

function writeResult(result) {
    const text = JSON.stringify(result, null, 2) + "\n";
    fs.writeFileSync(OUTPUT_FILE, text, "utf8");
    fs.writeFileSync(CHECKPOINT_FILE, text, "utf8");
}

function main() {
    ensureDirs();

    const candidate = readJson(CANDIDATE_INPUT, "Phase 6 candidate");
    validateCandidate(candidate);

    const oos = normalizeOos(readJson(OOS_INPUT, "OOS holdout"));
    const strategy = loadStrategy();

    const evaluation = runOos(oos, strategy.engine);
    const result = buildResult(candidate, strategy, oos, evaluation);

    writeResult(result);

    console.log("=== TRADEMIND PRO PHASE 7 ===");
    console.log(result.status);
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    VERSION,
    validateCandidate,
    normalizeOos,
    loadStrategy,
    indicatorsFor,
    runOos,
    buildResult,
    main
};

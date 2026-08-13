/*
============================================================
 TradeMind Pro
 V25.19 — STABLE EVIDENCE VOLATILITY CONDITIONING AUDIT
============================================================

PURPOSE
------------------------------------------------------------
V25.18 proved that:

    emaSpreadATR = emaSpread / atr14

is an exact mathematical identity in the frozen V25.10 dataset.

V25.19 asks the next descriptive question:

    Does ATR normalization change the relationship with
    futureReturn because the underlying relationship varies
    across volatility conditions?

STRICTLY DESCRIPTIVE
------------------------------------------------------------
- Frozen V25.10 dataset only.
- No market-data fetch.
- No dataset modification.
- No feature engineering.
- No feature selection.
- No candidate discovery.
- No strategy discovery.
- No optimization.
- No model fitting.
- No validation.
- No strategy modification.
- No orders.

CHRONOLOGICAL SAFETY
------------------------------------------------------------
Volatility regime thresholds are learned ONLY from the EARLY
third of the frozen dataset using ATR14 quartiles.
Those fixed thresholds are then applied unchanged to EARLY,
MIDDLE, and LATE observations.

REGIMES
------------------------------------------------------------
LOW        <= EARLY Q1
MID_LOW    > Q1 and <= EARLY Q2
MID_HIGH   > Q2 and <= EARLY Q3
HIGH       > EARLY Q3

For every volatility regime, and for EARLY / MIDDLE / LATE,
compare the descriptive Pearson and Spearman relationships of:

    emaSpread    -> futureReturn
    emaSpreadATR -> futureReturn

No feature is removed, selected, or modified.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_19_stable_evidence_volatility_conditioning_audit.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;
const FEATURE_A = "emaSpread";
const FEATURE_B = "emaSpreadATR";
const ATR_FEATURE = "atr14";
const TARGET = "futureReturn";

function finite(v) {
    return Number.isFinite(Number(v));
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function round(v, d = 10) {
    if (!Number.isFinite(v)) return null;
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
}

function mean(values) {
    if (!values.length) return null;
    return values.reduce((s, x) => s + x, 0) / values.length;
}

function pearson(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) return null;

    const mx = mean(xs);
    const my = mean(ys);
    let numerator = 0;
    let dx2 = 0;
    let dy2 = 0;

    for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        numerator += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
    }

    const denominator = Math.sqrt(dx2 * dy2);
    return denominator === 0 ? null : numerator / denominator;
}

function rank(values) {
    const indexed = values.map((value, index) => ({ value, index }));

    indexed.sort((a, b) => {
        if (a.value < b.value) return -1;
        if (a.value > b.value) return 1;
        return a.index - b.index;
    });

    const ranks = new Array(values.length);
    let i = 0;

    while (i < indexed.length) {
        let j = i + 1;

        while (
            j < indexed.length &&
            indexed[j].value === indexed[i].value
        ) {
            j++;
        }

        const averageRank = (i + 1 + j) / 2;

        for (let k = i; k < j; k++) {
            ranks[indexed[k].index] = averageRank;
        }

        i = j;
    }

    return ranks;
}

function spearman(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) return null;
    return pearson(rank(xs), rank(ys));
}

function quantile(sortedValues, q) {
    if (!sortedValues.length) return null;

    const pos = (sortedValues.length - 1) * q;
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);

    if (lower === upper) return sortedValues[lower];

    const weight = pos - lower;

    return (
        sortedValues[lower] * (1 - weight) +
        sortedValues[upper] * weight
    );
}

function blockRanges(n) {
    const third = Math.floor(n / 3);

    return [
        { block: "EARLY", start: 0, end: third },
        { block: "MIDDLE", start: third, end: third * 2 },
        { block: "LATE", start: third * 2, end: n }
    ];
}

function correlation(rows, feature) {
    const pairs = rows
        .map(r => ({
            x: num(r.features?.[feature]),
            y: num(r.label?.[TARGET])
        }))
        .filter(p => p.x !== null && p.y !== null);

    if (pairs.length < 2) {
        return {
            count: pairs.length,
            pearson: null,
            spearman: null
        };
    }

    const xs = pairs.map(p => p.x);
    const ys = pairs.map(p => p.y);

    return {
        count: pairs.length,
        pearson: round(pearson(xs, ys)),
        spearman: round(spearman(xs, ys))
    };
}

function regimeForAtr(atr, thresholds) {
    if (atr <= thresholds.q1) return "LOW";
    if (atr <= thresholds.q2) return "MID_LOW";
    if (atr <= thresholds.q3) return "MID_HIGH";
    return "HIGH";
}

function regimeSummary(rows, regime, thresholds) {
    const regimeRows = rows.filter(r => {
        const atr = num(r.features?.[ATR_FEATURE]);
        return (
            atr !== null &&
            regimeForAtr(atr, thresholds) === regime
        );
    });

    return {
        regime,
        rows: regimeRows.length,
        emaSpread: correlation(regimeRows, FEATURE_A),
        emaSpreadATR: correlation(regimeRows, FEATURE_B)
    };
}

function blockRegimeSummary(rows, thresholds) {
    return [
        "LOW",
        "MID_LOW",
        "MID_HIGH",
        "HIGH"
    ].map(regime =>
        regimeSummary(rows, regime, thresholds)
    );
}

const data = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

if (data.status !== "DATASET_FREEZE_COMPLETE") {
    throw new Error(
        "Frozen V25.10 dataset status is invalid."
    );
}

const learningDataset =
    data.learningDataset || {};

if (learningDataset.frozen !== true) {
    throw new Error(
        "V25.10 dataset is not marked frozen."
    );
}

const records =
    learningDataset.records || [];

if (records.length !== EXPECTED_ROWS) {
    throw new Error(
        `Unexpected V25.10 row count: ${records.length}`
    );
}

if (
    learningDataset.featureCount !==
    EXPECTED_FEATURE_COUNT
) {
    throw new Error(
        `Unexpected V25.10 feature count: ${learningDataset.featureCount}`
    );
}

for (const feature of [
    FEATURE_A,
    FEATURE_B,
    ATR_FEATURE
]) {
    if (
        !records.every(
            r => finite(r.features?.[feature])
        )
    ) {
        throw new Error(
            `Missing or invalid required feature: ${feature}`
        );
    }
}

for (const row of records) {
    if (!finite(row.label?.[TARGET])) {
        throw new Error(
            `Missing or invalid target: ${TARGET}`
        );
    }
}

const ranges =
    blockRanges(records.length);

const earlyRows =
    records.slice(
        ranges[0].start,
        ranges[0].end
    );

const earlyAtr =
    earlyRows
        .map(r => num(r.features[ATR_FEATURE]))
        .filter(v => v !== null && v > 0)
        .sort((a, b) => a - b);

if (earlyAtr.length < 2) {
    throw new Error(
        "Insufficient EARLY ATR observations for thresholds."
    );
}

const thresholds = {
    sourceBlock: "EARLY",
    q1: round(quantile(earlyAtr, 0.25), 12),
    q2: round(quantile(earlyAtr, 0.50), 12),
    q3: round(quantile(earlyAtr, 0.75), 12)
};

if (
    thresholds.q1 === null ||
    thresholds.q2 === null ||
    thresholds.q3 === null
) {
    throw new Error(
        "Failed to calculate ATR regime thresholds."
    );
}

const allRegimes =
    blockRegimeSummary(
        records,
        thresholds
    );

const blockResults =
    ranges.map(range => {
        const blockRows =
            records.slice(
                range.start,
                range.end
            );

        return {
            block: range.block,
            start: range.start,
            end: range.end,
            rows: blockRows.length,
            regimes:
                blockRegimeSummary(
                    blockRows,
                    thresholds
                )
        };
    });

const regimeCounts =
    Object.fromEntries(
        allRegimes.map(
            r => [r.regime, r.rows]
        )
    );

const report = {
    success: true,
    version:
        "V25.19-STABLE-EVIDENCE-VOLATILITY-CONDITIONING",
    status:
        "VOLATILITY_CONDITIONING_AUDIT_COMPLETE",
    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Determine descriptively whether the difference between emaSpread and emaSpreadATR outcome relationships varies across ATR-defined volatility conditions.",

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
        datasetRows: records.length,
        featureCount:
            learningDataset.featureCount,
        featureA: FEATURE_A,
        featureB: FEATURE_B,
        volatilityFeature: ATR_FEATURE,
        target: TARGET,
        chronologicalBlocks: ranges
    },

    methodology: {
        thresholdSourceBlock: "EARLY",
        thresholdSourceRows:
            earlyAtr.length,
        thresholds,
        regimes: [
            "LOW",
            "MID_LOW",
            "MID_HIGH",
            "HIGH"
        ],
        thresholdsAppliedUnchangedToAllBlocks:
            true,
        noFutureThresholdRecalculation:
            true
    },

    overall: {
        regimeCounts,
        regimes: allRegimes
    },

    blocks: blockResults,

    interpretation: {
        descriptiveOnly: true,
        volatilityConditioningTested: true,
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

    auditPass:
        records.length === EXPECTED_ROWS &&
        learningDataset.featureCount ===
            EXPECTED_FEATURE_COUNT &&
        earlyAtr.length > 0 &&
        thresholds.q1 <= thresholds.q2 &&
        thresholds.q2 <= thresholds.q3,

    outputFile: OUTPUT_FILE
};

fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(report, null, 2),
    "utf8"
);

console.log(
    JSON.stringify(report, null, 2)
);

/*
============================================================
TradeMind Pro
V25.13 — FEATURE EVIDENCE STABILITY AUDIT
============================================================

PURPOSE
------------------------------------------------------------
Test whether the descriptive feature/outcome relationships
observed in V25.12 are stable across time.

V25.12 showed that several features had noticeable Pearson
correlations, while Spearman correlations and decile behavior
were much weaker/non-monotonic. V25.13 therefore audits
whether those apparent relationships persist across the
EARLY / MIDDLE / LATE portions of the same frozen dataset.

STRICTLY DESCRIPTIVE
------------------------------------------------------------
- No market-data fetch.
- No dataset modification.
- No feature engineering.
- No threshold search.
- No candidate discovery.
- No strategy discovery.
- No optimization.
- No model fitting.
- No strategy validation.
- No strategy modification.
- No orders.

ANALYSES
------------------------------------------------------------
For every frozen feature:
1. Overall Pearson/Spearman correlation with futureReturn.
2. Pearson/Spearman correlation in EARLY/MIDDLE/LATE blocks.
3. Mean futureReturn by feature decile in each block.
4. Direction rates by feature decile in each block.
5. Correlation sign consistency across blocks.
6. Magnitude stability across blocks.
7. Robust comparison using trimmed tails (5% each side)
   to identify relationships dominated by extreme observations.

The result is an evidence-stability audit, NOT a strategy.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_13_feature_evidence_stability_audit.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;
const TRIM_FRACTION = 0.05;

const FEATURES = [
    "ema9",
    "ema21",
    "ema9Slope",
    "ema21Slope",
    "emaSpread",
    "emaSpreadATR",
    "ema9SlopeATR",
    "ema21SlopeATR",
    "rsi14",
    "rsiChange",
    "atr14",
    "vwap",
    "vwapDistanceATR",
    "ema9DistanceATR",
    "ema21DistanceATR",
    "bodyRatio",
    "upperWickRatio",
    "lowerWickRatio",
    "closeLocation"
];

function finite(v) {
    return Number.isFinite(Number(v));
}

function round(v, d = 6) {
    if (!Number.isFinite(v)) return null;
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
}

function mean(a) {
    if (!a.length) return null;
    return a.reduce((s, x) => s + x, 0) / a.length;
}

function pearson(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) return null;

    const mx = mean(xs);
    const my = mean(ys);

    let num = 0;
    let sx = 0;
    let sy = 0;

    for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        num += dx * dy;
        sx += dx * dx;
        sy += dy * dy;
    }

    const den = Math.sqrt(sx * sy);
    return den === 0 ? null : num / den;
}

function rank(values) {
    const indexed = values.map((value, index) => ({
        value,
        index
    }));

    indexed.sort((a, b) => a.value - b.value);

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

        const avg = (i + 1 + j) / 2;

        for (let k = i; k < j; k++) {
            ranks[indexed[k].index] = avg;
        }

        i = j;
    }

    return ranks;
}

function spearman(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) return null;
    return pearson(rank(xs), rank(ys));
}

function trimmedPairs(pairs) {
    if (pairs.length < 20) return pairs;

    const sortedX = [...pairs].sort(
        (a, b) => a.x - b.x
    );

    const trim = Math.floor(
        sortedX.length * TRIM_FRACTION
    );

    if (trim * 2 >= sortedX.length) return pairs;

    const xLow = sortedX[trim].x;
    const xHigh =
        sortedX[sortedX.length - trim - 1].x;

    const sortedY = [...pairs].sort(
        (a, b) => a.y - b.y
    );

    const yLow = sortedY[trim].y;
    const yHigh =
        sortedY[sortedY.length - trim - 1].y;

    return pairs.filter(
        p =>
            p.x >= xLow &&
            p.x <= xHigh &&
            p.y >= yLow &&
            p.y <= yHigh
    );
}

function correlationForPairs(pairs) {
    const xs = pairs.map(p => p.x);
    const ys = pairs.map(p => p.y);

    return {
        count: pairs.length,
        pearson: round(pearson(xs, ys)),
        spearman: round(spearman(xs, ys))
    };
}

function blockCorrelation(records, feature) {
    const n = records.length;
    const third = Math.floor(n / 3);

    const blocks = [
        ["EARLY", 0, third],
        ["MIDDLE", third, third * 2],
        ["LATE", third * 2, n]
    ];

    return blocks.map(([name, start, end]) => {
        const pairs = records
            .slice(start, end)
            .map(r => ({
                x: Number(r.features[feature]),
                y: Number(r.label.futureReturn)
            }))
            .filter(
                p =>
                    Number.isFinite(p.x) &&
                    Number.isFinite(p.y)
            );

        const trimmed = trimmedPairs(pairs);

        return {
            block: name,
            startIndex: start,
            endIndex: end - 1,
            raw: correlationForPairs(pairs),
            trimmed5pctEachTail:
                correlationForPairs(trimmed)
        };
    });
}

function decileAudit(records, feature, start, end) {
    const rows = records
        .slice(start, end)
        .map(r => ({
            x: Number(r.features[feature]),
            y: Number(r.label.futureReturn),
            direction: r.label.futureDirection
        }))
        .filter(
            r =>
                Number.isFinite(r.x) &&
                Number.isFinite(r.y)
        );

    rows.sort((a, b) => a.x - b.x);

    if (rows.length < 20) {
        return {
            count: rows.length,
            deciles: []
        };
    }

    const deciles = [];

    for (let d = 0; d < 10; d++) {
        const s = Math.floor(d * rows.length / 10);
        const e = Math.floor((d + 1) * rows.length / 10);
        const slice = rows.slice(s, e);

        const returns = slice.map(r => r.y);
        const up =
            slice.filter(r => r.direction === "UP").length;
        const down =
            slice.filter(r => r.direction === "DOWN").length;
        const flat =
            slice.filter(r => r.direction === "FLAT").length;

        deciles.push({
            decile: d + 1,
            count: slice.length,
            featureMean: round(mean(slice.map(r => r.x))),
            futureReturnMean: round(mean(returns)),
            upRate: round(up / slice.length, 4),
            downRate: round(down / slice.length, 4),
            flatRate: round(flat / slice.length, 4)
        });
    }

    return {
        count: rows.length,
        deciles
    };
}

function sign(v) {
    if (!Number.isFinite(v) || v === 0) return 0;
    return v > 0 ? 1 : -1;
}

function stability(blocks) {
    const raw = blocks
        .map(b => b.raw.pearson)
        .filter(Number.isFinite);

    const trimmed = blocks
        .map(b => b.trimmed5pctEachTail.pearson)
        .filter(Number.isFinite);

    const rawSigns = raw.map(sign);
    const trimmedSigns = trimmed.map(sign);

    const rawSignConsistent =
        rawSigns.length === 3 &&
        rawSigns.every(s => s !== 0) &&
        rawSigns.every(s => s === rawSigns[0]);

    const trimmedSignConsistent =
        trimmedSigns.length === 3 &&
        trimmedSigns.every(s => s !== 0) &&
        trimmedSigns.every(s => s === trimmedSigns[0]);

    const rawMagnitudeMean =
        raw.length ? mean(raw.map(Math.abs)) : null;

    const trimmedMagnitudeMean =
        trimmed.length
            ? mean(trimmed.map(Math.abs))
            : null;

    return {
        rawPearsonSignConsistent:
            rawSignConsistent,
        trimmedPearsonSignConsistent:
            trimmedSignConsistent,
        rawPearsonSigns: rawSigns,
        trimmedPearsonSigns: trimmedSigns,
        rawMeanAbsolutePearson:
            round(rawMagnitudeMean),
        trimmedMeanAbsolutePearson:
            round(trimmedMagnitudeMean),
        trimmingImpact:
            round(
                (rawMagnitudeMean ?? 0) -
                (trimmedMagnitudeMean ?? 0)
            )
    };
}

if (!fs.existsSync(INPUT)) {
    throw new Error(
        `V25.10 frozen dataset not found: ${INPUT}`
    );
}

const data = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

const records =
    data.learningDataset?.records;

if (!Array.isArray(records)) {
    throw new Error(
        "learningDataset.records is missing."
    );
}

if (data.status !== "DATASET_FREEZE_COMPLETE") {
    throw new Error(
        "Input dataset is not frozen."
    );
}

if (data.learningDataset?.frozen !== true) {
    throw new Error(
        "Input learning dataset is not marked frozen."
    );
}

if (records.length !== EXPECTED_ROWS) {
    throw new Error(
        `Expected ${EXPECTED_ROWS} rows, got ${records.length}.`
    );
}

if (
    data.learningDataset?.featureCount !==
    EXPECTED_FEATURE_COUNT
) {
    throw new Error(
        "Unexpected feature count."
    );
}

for (const feature of FEATURES) {
    for (const record of records) {
        if (
            !record?.features ||
            !finite(record.features[feature]) ||
            !record.label ||
            !finite(record.label.futureReturn)
        ) {
            throw new Error(
                `Invalid record detected for feature ${feature}.`
            );
        }
    }
}

const featureStability = {};

for (const feature of FEATURES) {
    const overallPairs = records
        .map(r => ({
            x: Number(r.features[feature]),
            y: Number(r.label.futureReturn)
        }))
        .filter(
            p =>
                Number.isFinite(p.x) &&
                Number.isFinite(p.y)
        );

    const overallTrimmed =
        trimmedPairs(overallPairs);

    const blocks =
        blockCorrelation(records, feature);

    const blockDeciles = [
        ["EARLY", 0, Math.floor(records.length / 3)],
        [
            "MIDDLE",
            Math.floor(records.length / 3),
            Math.floor(records.length / 3) * 2
        ],
        [
            "LATE",
            Math.floor(records.length / 3) * 2,
            records.length
        ]
    ].map(([name, start, end]) => ({
        block: name,
        ...decileAudit(
            records,
            feature,
            start,
            end
        )
    }));

    featureStability[feature] = {
        overall: {
            raw:
                correlationForPairs(
                    overallPairs
                ),
            trimmed5pctEachTail:
                correlationForPairs(
                    overallTrimmed
                )
        },
        blocks,
        stability:
            stability(blocks),
        decilesByBlock:
            blockDeciles
    };
}

const summary =
    FEATURES.map(feature => {
        const e = featureStability[feature];

        return {
            feature,
            overallPearson:
                e.overall.raw.pearson,
            overallSpearman:
                e.overall.raw.spearman,
            trimmedPearson:
                e.overall
                    .trimmed5pctEachTail
                    .pearson,
            earlyPearson:
                e.blocks[0].raw.pearson,
            middlePearson:
                e.blocks[1].raw.pearson,
            latePearson:
                e.blocks[2].raw.pearson,
            earlyTrimmedPearson:
                e.blocks[0]
                    .trimmed5pctEachTail
                    .pearson,
            middleTrimmedPearson:
                e.blocks[1]
                    .trimmed5pctEachTail
                    .pearson,
            lateTrimmedPearson:
                e.blocks[2]
                    .trimmed5pctEachTail
                    .pearson,
            rawPearsonSignConsistent:
                e.stability
                    .rawPearsonSignConsistent,
            trimmedPearsonSignConsistent:
                e.stability
                    .trimmedPearsonSignConsistent,
            rawMeanAbsolutePearson:
                e.stability
                    .rawMeanAbsolutePearson,
            trimmedMeanAbsolutePearson:
                e.stability
                    .trimmedMeanAbsolutePearson
        };
    }).sort(
        (a, b) =>
            Math.abs(
                b.overallPearson || 0
            ) -
            Math.abs(
                a.overallPearson || 0
            )
    );

const report = {
    success: true,

    version:
        "V25.13-FEATURE-EVIDENCE-STABILITY-AUDIT",

    status:
        "STABILITY_AUDIT_COMPLETE",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Descriptive stability audit of V25.12 feature/outcome evidence across time.",

    policy: {
        sourceFrozen: true,
        datasetModified: false,
        featureEngineering: false,
        thresholdSearch: false,
        candidateDiscovery: false,
        strategyDiscovery: false,
        optimization: false,
        modelFitting: false,
        oosStrategyEvaluation: false,
        strategyModified: false,
        realOrders: false
    },

    source: {
        inputFile: INPUT,
        datasetRows: records.length,
        featureCount:
            data.learningDataset.featureCount,
        trimFractionEachTail:
            TRIM_FRACTION
    },

    featureStability,

    summary,

    guards: {
        learningEngineCalled: false,
        learningDatasetCalled: false,
        candidateDiscovery: false,
        validation: false,
        oos: false,
        strategyModified: false,
        realOrders: false
    },

    verdict: {
        auditPass: true,
        descriptiveOnly: true,
        noOptimization: true,
        noCandidateDiscovery: true,
        noStrategyModification: true,
        recordsAnalyzed: records.length,
        interpretationRequired:
            "Human inspection of stability results is required before any later research stage."
    }
};

fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(report, null, 2),
    "utf8"
);

console.log(
    JSON.stringify(
        {
            status: report.status,
            datasetRows: records.length,
            featureCount:
                data.learningDataset.featureCount,
            topOverallPearsonFeatures:
                summary.slice(0, 5),
            outputFile: OUTPUT_FILE
        },
        null,
        2
    )
);

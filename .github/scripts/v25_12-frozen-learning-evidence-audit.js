/*
============================================================
TradeMind Pro
V25.12 — FROZEN LEARNING EVIDENCE AUDIT
============================================================

PURPOSE
------------------------------------------------------------
Perform a descriptive, non-optimizing evidence audit on the
already frozen V25.10 learning dataset.

This stage asks:

"Does the frozen feature set contain stable descriptive
information about the future outcome?"

It does NOT attempt to build a trading strategy.

STRICT PROHIBITIONS
------------------------------------------------------------
- No market-data fetch.
- No dataset modification.
- No feature engineering.
- No feature selection.
- No threshold search.
- No candidate discovery.
- No strategy discovery.
- No optimization.
- No train/test model fitting.
- No OOS strategy evaluation.
- No strategy modification.
- No orders.

ANALYSES
------------------------------------------------------------
1. Dataset / schema confirmation.
2. Future-direction balance.
3. Future-return distribution.
4. Per-feature distribution statistics.
5. Pearson correlation with futureReturn.
6. Mean futureReturn by futureDirection.
7. Feature means by direction.
8. Rank/decile descriptive stability.
9. Early/middle/late temporal stability.
10. Session-level outcome stability.
11. Missing / non-finite / duplicate checks.

IMPORTANT
------------------------------------------------------------
All statistics are descriptive evidence only.
No statistic is converted into a trading rule or threshold.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_12_frozen_learning_evidence_audit.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;

const EXPECTED_FEATURES = [
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

const DIRECTIONS = ["UP", "DOWN", "FLAT"];

function finite(value) {
    return Number.isFinite(Number(value));
}

function round(value, digits = 6) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const factor =
        Math.pow(10, digits);

    return Math.round(
        value * factor
    ) / factor;
}

function mean(values) {
    if (!values.length) {
        return null;
    }

    return values.reduce(
        (a, b) => a + b,
        0
    ) / values.length;
}

function variance(values) {
    if (values.length < 2) {
        return null;
    }

    const m = mean(values);

    return values.reduce(
        (sum, x) =>
            sum + Math.pow(x - m, 2),
        0
    ) / (values.length - 1);
}

function stddev(values) {
    const v = variance(values);
    return v === null ? null : Math.sqrt(v);
}

function median(values) {
    if (!values.length) {
        return null;
    }

    const sorted =
        [...values].sort((a, b) => a - b);

    const middle =
        Math.floor(sorted.length / 2);

    if (sorted.length % 2) {
        return sorted[middle];
    }

    return (
        sorted[middle - 1] +
        sorted[middle]
    ) / 2;
}

function percentile(values, p) {
    if (!values.length) {
        return null;
    }

    const sorted =
        [...values].sort((a, b) => a - b);

    const index =
        (sorted.length - 1) * p;

    const lower =
        Math.floor(index);

    const upper =
        Math.ceil(index);

    if (lower === upper) {
        return sorted[lower];
    }

    const weight =
        index - lower;

    return (
        sorted[lower] * (1 - weight) +
        sorted[upper] * weight
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

    let numerator = 0;
    let sx = 0;
    let sy = 0;

    for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;

        numerator += dx * dy;
        sx += dx * dx;
        sy += dy * dy;
    }

    const denominator =
        Math.sqrt(sx * sy);

    if (denominator === 0) {
        return null;
    }

    return numerator / denominator;
}

function rank(values) {
    const indexed =
        values.map(
            (value, index) => ({
                value,
                index
            })
        );

    indexed.sort(
        (a, b) => a.value - b.value
    );

    const ranks =
        new Array(values.length);

    let i = 0;

    while (i < indexed.length) {
        let j = i + 1;

        while (
            j < indexed.length &&
            indexed[j].value ===
                indexed[i].value
        ) {
            j++;
        }

        const averageRank =
            (i + 1 + j) / 2;

        for (let k = i; k < j; k++) {
            ranks[indexed[k].index] =
                averageRank;
        }

        i = j;
    }

    return ranks;
}

function spearman(xs, ys) {
    if (
        xs.length !== ys.length ||
        xs.length < 2
    ) {
        return null;
    }

    return pearson(
        rank(xs),
        rank(ys)
    );
}

function minMax(values) {
    if (!values.length) {
        return {
            min: null,
            max: null
        };
    }

    return {
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

function summarize(values) {
    if (!values.length) {
        return {
            count: 0,
            mean: null,
            stddev: null,
            min: null,
            p10: null,
            p25: null,
            median: null,
            p75: null,
            p90: null,
            max: null
        };
    }

    return {
        count: values.length,
        mean: round(mean(values)),
        stddev: round(stddev(values)),
        min: round(minMax(values).min),
        p10: round(percentile(values, 0.10)),
        p25: round(percentile(values, 0.25)),
        median: round(median(values)),
        p75: round(percentile(values, 0.75)),
        p90: round(percentile(values, 0.90)),
        max: round(minMax(values).max)
    };
}

function directionCounts(records) {
    const counts = {
        UP: 0,
        DOWN: 0,
        FLAT: 0
    };

    for (const record of records) {
        const direction =
            record.label?.futureDirection;

        if (
            Object.prototype.hasOwnProperty.call(
                counts,
                direction
            )
        ) {
            counts[direction]++;
        }
    }

    return counts;
}

function directionReturnStats(records) {
    const result = {};

    for (const direction of DIRECTIONS) {
        const values =
            records
                .filter(
                    r =>
                        r.label?.futureDirection ===
                        direction
                )
                .map(
                    r =>
                        Number(
                            r.label.futureReturn
                        )
                )
                .filter(Number.isFinite);

        result[direction] =
            summarize(values);
    }

    return result;
}

function featureDirectionMeans(
    records,
    feature
) {
    const result = {};

    for (const direction of DIRECTIONS) {
        const values =
            records
                .filter(
                    r =>
                        r.label?.futureDirection ===
                        direction
                )
                .map(
                    r =>
                        Number(
                            r.features?.[feature]
                        )
                )
                .filter(Number.isFinite);

        result[direction] =
            round(mean(values));
    }

    return result;
}

function decileAudit(records, feature) {
    const rows =
        records
            .map(
                (record, index) => ({
                    index,
                    value:
                        Number(
                            record.features?.[feature]
                        ),
                    futureReturn:
                        Number(
                            record.label?.futureReturn
                        )
                })
            )
            .filter(
                row =>
                    Number.isFinite(row.value) &&
                    Number.isFinite(row.futureReturn)
            );

    if (rows.length < 20) {
        return {
            count: rows.length,
            deciles: [],
            monotonicDirection: "INSUFFICIENT_DATA"
        };
    }

    rows.sort(
        (a, b) => a.value - b.value
    );

    const deciles = [];

    for (let d = 0; d < 10; d++) {
        const start =
            Math.floor(
                d * rows.length / 10
            );

        const end =
            Math.floor(
                (d + 1) *
                rows.length / 10
            );

        const slice =
            rows.slice(start, end);

        const returns =
            slice.map(
                row => row.futureReturn
            );

        const directions =
            slice.map(
                row =>
                    records[row.index]
                        .label.futureDirection
            );

        const up =
            directions.filter(
                x => x === "UP"
            ).length;

        const down =
            directions.filter(
                x => x === "DOWN"
            ).length;

        const flat =
            directions.filter(
                x => x === "FLAT"
            ).length;

        deciles.push({
            decile: d + 1,
            count: slice.length,
            featureMean:
                round(
                    mean(
                        slice.map(
                            row => row.value
                        )
                    )
                ),
            futureReturnMean:
                round(mean(returns)),
            futureReturnMedian:
                round(median(returns)),
            upRate:
                round(
                    up / slice.length,
                    4
                ),
            downRate:
                round(
                    down / slice.length,
                    4
                ),
            flatRate:
                round(
                    flat / slice.length,
                    4
                )
        });
    }

    const means =
        deciles.map(
            d => d.futureReturnMean
        );

    let increasing = true;
    let decreasing = true;

    for (let i = 1; i < means.length; i++) {
        if (means[i] < means[i - 1]) {
            increasing = false;
        }

        if (means[i] > means[i - 1]) {
            decreasing = false;
        }
    }

    let monotonicDirection =
        "NON_MONOTONIC";

    if (increasing && !decreasing) {
        monotonicDirection =
            "INCREASING";
    } else if (
        decreasing &&
        !increasing
    ) {
        monotonicDirection =
            "DECREASING";
    } else if (
        increasing &&
        decreasing
    ) {
        monotonicDirection =
            "FLAT";
    }

    return {
        count: rows.length,
        deciles,
        monotonicDirection
    };
}

function temporalBlock(records, name, start, end) {
    const block =
        records.slice(start, end);

    const returns =
        block
            .map(
                r =>
                    Number(
                        r.label?.futureReturn
                    )
            )
            .filter(Number.isFinite);

    const directions =
        directionCounts(block);

    return {
        block: name,
        startIndex: start,
        endIndex: end - 1,
        rowCount: block.length,
        futureReturn:
            summarize(returns),
        directionCounts: directions,
        directionRates: {
            UP:
                block.length
                    ? round(
                        directions.UP /
                        block.length,
                        4
                    )
                    : null,
            DOWN:
                block.length
                    ? round(
                        directions.DOWN /
                        block.length,
                        4
                    )
                    : null,
            FLAT:
                block.length
                    ? round(
                        directions.FLAT /
                        block.length,
                        4
                    )
                    : null
        }
    };
}

function sessionAudit(records) {
    const sessions =
        new Map();

    for (const record of records) {
        const date =
            record.istDate;

        if (!sessions.has(date)) {
            sessions.set(
                date,
                []
            );
        }

        sessions.get(date).push(record);
    }

    const rows = [];

    for (const [date, sessionRecords] of sessions) {
        const returns =
            sessionRecords
                .map(
                    r =>
                        Number(
                            r.label?.futureReturn
                        )
                )
                .filter(Number.isFinite);

        const directions =
            directionCounts(
                sessionRecords
            );

        rows.push({
            istDate: date,
            rowCount:
                sessionRecords.length,
            meanFutureReturn:
                round(mean(returns)),
            medianFutureReturn:
                round(median(returns)),
            upRate:
                round(
                    directions.UP /
                    sessionRecords.length,
                    4
                ),
            downRate:
                round(
                    directions.DOWN /
                    sessionRecords.length,
                    4
                ),
            flatRate:
                round(
                    directions.FLAT /
                    sessionRecords.length,
                    4
                )
        });
    }

    rows.sort(
        (a, b) =>
            a.istDate.localeCompare(
                b.istDate
            )
    );

    const sessionReturns =
        rows
            .map(
                row =>
                    row.meanFutureReturn
            )
            .filter(Number.isFinite);

    return {
        sessionCount: rows.length,
        meanSessionFutureReturn:
            round(mean(sessionReturns)),
        sessionReturnStddev:
            round(stddev(sessionReturns)),
        minimumSessionReturn:
            round(
                Math.min(
                    ...sessionReturns
                )
            ),
        maximumSessionReturn:
            round(
                Math.max(
                    ...sessionReturns
                )
            ),
        sessions: rows
    };
}

if (!fs.existsSync(INPUT)) {
    throw new Error(
        `V25.10 frozen dataset not found: ${INPUT}`
    );
}

const data =
    JSON.parse(
        fs.readFileSync(
            INPUT,
            "utf8"
        )
    );

const records =
    data.learningDataset?.records;

if (!Array.isArray(records)) {
    throw new Error(
        "V25.10 learningDataset.records is missing."
    );
}

if (
    data.status !==
    "DATASET_FREEZE_COMPLETE"
) {
    throw new Error(
        "Input dataset is not DATASET_FREEZE_COMPLETE."
    );
}

if (
    data.learningDataset?.frozen !==
    true
) {
    throw new Error(
        "Input dataset is not frozen."
    );
}

if (
    records.length !== EXPECTED_ROWS
) {
    throw new Error(
        `Expected ${EXPECTED_ROWS} records, got ${records.length}.`
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

const invalidRows = [];

for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (
        !record ||
        !record.features ||
        !record.label
    ) {
        invalidRows.push(i);
        continue;
    }

    for (const feature of EXPECTED_FEATURES) {
        if (
            !finite(
                record.features[feature]
            )
        ) {
            invalidRows.push(i);
            break;
        }
    }

    if (
        !finite(
            record.label.futureReturn
        ) ||
        !DIRECTIONS.includes(
            record.label.futureDirection
        )
    ) {
        invalidRows.push(i);
    }
}

if (invalidRows.length) {
    throw new Error(
        `Invalid learning records found: ${invalidRows.length}`
    );
}

const futureReturns =
    records
        .map(
            r =>
                Number(
                    r.label.futureReturn
                )
        )
        .filter(Number.isFinite);

const counts =
    directionCounts(records);

const directionRates = {
    UP:
        round(
            counts.UP /
            records.length,
            6
        ),
    DOWN:
        round(
            counts.DOWN /
            records.length,
            6
        ),
    FLAT:
        round(
            counts.FLAT /
            records.length,
            6
        )
};

const featureEvidence = {};

for (const feature of EXPECTED_FEATURES) {
    const pairs =
        records
            .map(
                r => ({
                    feature:
                        Number(
                            r.features[feature]
                        ),
                    futureReturn:
                        Number(
                            r.label.futureReturn
                        )
                })
            )
            .filter(
                pair =>
                    Number.isFinite(
                        pair.feature
                    ) &&
                    Number.isFinite(
                        pair.futureReturn
                    )
            );

    const xs =
        pairs.map(
            pair => pair.feature
        );

    const ys =
        pairs.map(
            pair => pair.futureReturn
        );

    featureEvidence[feature] = {
        distribution:
            summarize(xs),

        correlation: {
            pearsonFutureReturn:
                round(
                    pearson(xs, ys),
                    6
                ),
            spearmanFutureReturn:
                round(
                    spearman(xs, ys),
                    6
                )
        },

        meanFeatureByFutureDirection:
            featureDirectionMeans(
                records,
                feature
            ),

        decileAudit:
            decileAudit(
                records,
                feature
            )
    };
}

const third =
    Math.floor(
        records.length / 3
    );

const temporalBlocks = [
    temporalBlock(
        records,
        "EARLY",
        0,
        third
    ),
    temporalBlock(
        records,
        "MIDDLE",
        third,
        third * 2
    ),
    temporalBlock(
        records,
        "LATE",
        third * 2,
        records.length
    )
];

const sessionEvidence =
    sessionAudit(records);

const featureDistributionSummary = {};

for (const feature of EXPECTED_FEATURES) {
    featureDistributionSummary[feature] =
        featureEvidence[feature]
            .distribution;
}

const strongestAbsoluteCorrelations =
    EXPECTED_FEATURES
        .map(
            feature => ({
                feature,
                pearson:
                    featureEvidence[feature]
                        .correlation
                        .pearsonFutureReturn,
                spearman:
                    featureEvidence[feature]
                        .correlation
                        .spearmanFutureReturn
            })
        )
        .sort(
            (a, b) =>
                Math.abs(
                    b.pearson || 0
                ) -
                Math.abs(
                    a.pearson || 0
                )
        );

const auditPass =
    invalidRows.length === 0 &&
    records.length === EXPECTED_ROWS &&
    data.learningDataset?.featureCount ===
        EXPECTED_FEATURE_COUNT &&
    Object.keys(featureEvidence).length ===
        EXPECTED_FEATURE_COUNT &&
    futureReturns.length === EXPECTED_ROWS;

const report = {
    success: true,

    version:
        "V25.12-FROZEN-LEARNING-EVIDENCE-AUDIT",

    status:
        auditPass
            ? "EVIDENCE_AUDIT_COMPLETE"
            : "EVIDENCE_AUDIT_FAILED",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Descriptive evidence audit of the immutable V25.10 learning dataset.",

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
        frozenVersion:
            data.source?.frozenV25Version,
        sourceRows:
            data.source?.sourceRows,
        datasetRows:
            records.length,
        featureCount:
            data.learningDataset?.featureCount
    },

    outcome: {
        futureReturn:
            summarize(futureReturns),
        futureDirectionCounts:
            counts,
        futureDirectionRates:
            directionRates,
        futureReturnByDirection:
            directionReturnStats(records)
    },

    featureDistributionSummary,

    featureEvidence,

    temporalStability: {
        blocks: temporalBlocks
    },

    sessionEvidence,

    strongestAbsoluteCorrelations,

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
        auditPass,
        descriptiveOnly: true,
        noOptimization: true,
        noCandidateDiscovery: true,
        noStrategyModification: true,
        recordsAnalyzed:
            records.length,
        invalidRows:
            invalidRows.length
    }
};

fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
        report,
        null,
        2
    ),
    "utf8"
);

console.log(
    JSON.stringify(
        {
            status:
                report.status,
            datasetRows:
                records.length,
            featureCount:
                data.learningDataset?.featureCount,
            futureDirectionCounts:
                counts,
            auditPass,
            outputFile:
                OUTPUT_FILE
        },
        null,
        2
    )
);

if (!auditPass) {
    process.exitCode = 1;
}

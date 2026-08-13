/*
============================================================
 TradeMind Pro
 V25.20 — STABLE EVIDENCE VOLATILITY-CONDITIONED
             PERSISTENCE AUDIT
============================================================

PURPOSE
------------------------------------------------------------
V25.18 established the exact mathematical identity:

    emaSpreadATR = emaSpread / atr14

V25.19 showed that the descriptive relationship with
futureReturn changes across ATR-defined volatility regimes,
with the largest Pearson difference appearing in HIGH
volatility.

V25.20 asks the next evidence question:

    Are those volatility-conditioned differences persistent
    across EARLY, MIDDLE, and LATE chronological blocks?

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
- No strategy validation.
- No strategy modification.
- No real orders.

CHRONOLOGICAL SAFETY
------------------------------------------------------------
ATR regime thresholds are calculated ONLY from the EARLY
third of the frozen dataset using ATR14 quartiles.

Those thresholds are frozen and applied unchanged to
EARLY, MIDDLE, and LATE.

REGIMES
------------------------------------------------------------
LOW        <= EARLY Q1
MID_LOW    > Q1 and <= EARLY Q2
MID_HIGH   > Q2 and <= EARLY Q3
HIGH       > EARLY Q3

PERSISTENCE EVIDENCE
------------------------------------------------------------
For every regime and chronological block, record:

- row count
- Pearson: emaSpread -> futureReturn
- Spearman: emaSpread -> futureReturn
- Pearson: emaSpreadATR -> futureReturn
- Spearman: emaSpreadATR -> futureReturn

Then calculate descriptive persistence diagnostics:

1. Pearson sign consistency across EARLY/MIDDLE/LATE.
2. Spearman sign consistency across EARLY/MIDDLE/LATE.
3. Mean absolute Pearson difference between
   emaSpread and emaSpreadATR across blocks.
4. Mean absolute Spearman difference across blocks.
5. HIGH-regime block-by-block comparison.
6. Direction of the normalized-vs-raw Pearson difference.

IMPORTANT
------------------------------------------------------------
This script does NOT declare a trading edge persistent.
"Persistence" is reported descriptively only.

No statistical significance test is used.
No p-value threshold is used.
No feature is selected or removed.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_20_stable_evidence_volatility_conditioned_persistence_audit.json";

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

    return denominator === 0
        ? null
        : numerator / denominator;
}

function rank(values) {
    const indexed = values.map((value, index) => ({
        value,
        index
    }));

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
    if (xs.length !== ys.length || xs.length < 2) {
        return null;
    }

    return pearson(
        rank(xs),
        rank(ys)
    );
}

function quantile(sortedValues, q) {
    if (!sortedValues.length) return null;

    const position =
        (sortedValues.length - 1) * q;

    const lower = Math.floor(position);
    const upper = Math.ceil(position);

    if (lower === upper) {
        return sortedValues[lower];
    }

    const weight = position - lower;

    return (
        sortedValues[lower] * (1 - weight) +
        sortedValues[upper] * weight
    );
}

function blockRanges(n) {
    const third = Math.floor(n / 3);

    return [
        {
            block: "EARLY",
            start: 0,
            end: third
        },
        {
            block: "MIDDLE",
            start: third,
            end: third * 2
        },
        {
            block: "LATE",
            start: third * 2,
            end: n
        }
    ];
}

function regimeForAtr(atr, thresholds) {
    if (atr <= thresholds.q1) return "LOW";
    if (atr <= thresholds.q2) return "MID_LOW";
    if (atr <= thresholds.q3) return "MID_HIGH";
    return "HIGH";
}

function correlation(rows, feature) {
    const pairs = rows
        .map(row => ({
            x: num(row.features?.[feature]),
            y: num(row.label?.[TARGET])
        }))
        .filter(pair =>
            pair.x !== null &&
            pair.y !== null
        );

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
        pearson: round(
            pearson(xs, ys)
        ),
        spearman: round(
            spearman(xs, ys)
        )
    };
}

function sign(value) {
    if (!Number.isFinite(value)) return null;
    if (value > 0) return "POSITIVE";
    if (value < 0) return "NEGATIVE";
    return "ZERO";
}

function signConsistency(values) {
    const signs = values
        .map(sign)
        .filter(v => v !== null);

    if (!signs.length) {
        return {
            available: false,
            consistent: false,
            signs: []
        };
    }

    return {
        available: true,
        consistent:
            new Set(signs).size === 1,
        signs
    };
}

function absoluteDifferences(valuesA, valuesB) {
    const diffs = [];

    for (
        let i = 0;
        i < Math.min(
            valuesA.length,
            valuesB.length
        );
        i++
    ) {
        if (
            Number.isFinite(valuesA[i]) &&
            Number.isFinite(valuesB[i])
        ) {
            diffs.push(
                Math.abs(
                    valuesA[i] -
                    valuesB[i]
                )
            );
        }
    }

    return diffs;
}

function regimeRows(rows, regime, thresholds) {
    return rows.filter(row => {
        const atr =
            num(row.features?.[ATR_FEATURE]);

        return (
            atr !== null &&
            regimeForAtr(
                atr,
                thresholds
            ) === regime
        );
    });
}

function blockRegimeResult(
    blockRows,
    blockName,
    regime,
    thresholds
) {
    const rows = regimeRows(
        blockRows,
        regime,
        thresholds
    );

    const raw =
        correlation(rows, FEATURE_A);

    const normalized =
        correlation(rows, FEATURE_B);

    return {
        block: blockName,
        regime,
        rows: rows.length,
        emaSpread: raw,
        emaSpreadATR: normalized,
        pearsonDifference:
            raw.pearson !== null &&
            normalized.pearson !== null
                ? round(
                    normalized.pearson -
                    raw.pearson
                )
                : null,
        spearmanDifference:
            raw.spearman !== null &&
            normalized.spearman !== null
                ? round(
                    normalized.spearman -
                    raw.spearman
                )
                : null
    };
}

function persistenceForRegime(
    blockResults,
    regime
) {
    const rows =
        blockResults.filter(
            result =>
                result.regime === regime
        );

    const rawPearsons =
        rows.map(
            r => r.emaSpread.pearson
        );

    const normalizedPearsons =
        rows.map(
            r => r.emaSpreadATR.pearson
        );

    const rawSpearmans =
        rows.map(
            r => r.emaSpread.spearman
        );

    const normalizedSpearmans =
        rows.map(
            r => r.emaSpreadATR.spearman
        );

    const pearsonDiffs =
        absoluteDifferences(
            rawPearsons,
            normalizedPearsons
        );

    const spearmanDiffs =
        absoluteDifferences(
            rawSpearmans,
            normalizedSpearmans
        );

    const normalizedMinusRawPearson =
        rows.map(
            r => r.pearsonDifference
        );

    const normalizedMinusRawSpearman =
        rows.map(
            r => r.spearmanDifference
        );

    return {
        regime,
        blocks: rows.map(r => r.block),

        rawPearsonSignConsistency:
            signConsistency(
                rawPearsons
            ),

        normalizedPearsonSignConsistency:
            signConsistency(
                normalizedPearsons
            ),

        rawSpearmanSignConsistency:
            signConsistency(
                rawSpearmans
            ),

        normalizedSpearmanSignConsistency:
            signConsistency(
                normalizedSpearmans
            ),

        meanAbsolutePearsonDifference:
            round(
                mean(pearsonDiffs)
            ),

        meanAbsoluteSpearmanDifference:
            round(
                mean(spearmanDiffs)
            ),

        normalizedMinusRawPearsonByBlock:
            rows.map(r => ({
                block: r.block,
                difference:
                    r.pearsonDifference,
                direction:
                    sign(
                        r.pearsonDifference
                    )
            })),

        normalizedMinusRawSpearmanByBlock:
            rows.map(r => ({
                block: r.block,
                difference:
                    r.spearmanDifference,
                direction:
                    sign(
                        r.spearmanDifference
                    )
            })),

        descriptivePersistenceOnly:
            true
    };
}

const data = JSON.parse(
    fs.readFileSync(
        INPUT,
        "utf8"
    )
);

if (
    data.status !==
    "DATASET_FREEZE_COMPLETE"
) {
    throw new Error(
        "Frozen V25.10 dataset status is invalid."
    );
}

const learningDataset =
    data.learningDataset || {};

if (
    learningDataset.frozen !== true
) {
    throw new Error(
        "V25.10 dataset is not marked frozen."
    );
}

const records =
    learningDataset.records || [];

if (
    records.length !==
    EXPECTED_ROWS
) {
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

for (
    const feature of [
        FEATURE_A,
        FEATURE_B,
        ATR_FEATURE
    ]
) {
    if (
        !records.every(
            row =>
                finite(
                    row.features?.[feature]
                )
        )
    ) {
        throw new Error(
            `Missing or invalid required feature: ${feature}`
        );
    }
}

if (
    !records.every(
        row =>
            finite(
                row.label?.[TARGET]
            )
    )
) {
    throw new Error(
        `Missing or invalid target: ${TARGET}`
    );
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
        .map(
            row =>
                num(
                    row.features[
                        ATR_FEATURE
                    ]
                )
        )
        .filter(
            value =>
                value !== null &&
                value > 0
        )
        .sort(
            (a, b) => a - b
        );

if (earlyAtr.length < 2) {
    throw new Error(
        "Insufficient EARLY ATR observations."
    );
}

const thresholds = {
    sourceBlock: "EARLY",
    q1: round(
        quantile(
            earlyAtr,
            0.25
        ),
        12
    ),
    q2: round(
        quantile(
            earlyAtr,
            0.50
        ),
        12
    ),
    q3: round(
        quantile(
            earlyAtr,
            0.75
        ),
        12
    )
};

if (
    thresholds.q1 === null ||
    thresholds.q2 === null ||
    thresholds.q3 === null
) {
    throw new Error(
        "Failed to calculate EARLY ATR thresholds."
    );
}

const regimes = [
    "LOW",
    "MID_LOW",
    "MID_HIGH",
    "HIGH"
];

const blockResults = [];

for (const range of ranges) {
    const blockRows =
        records.slice(
            range.start,
            range.end
        );

    for (const regime of regimes) {
        blockResults.push(
            blockRegimeResult(
                blockRows,
                range.block,
                regime,
                thresholds
            )
        );
    }
}

const persistence =
    regimes.map(
        regime =>
            persistenceForRegime(
                blockResults,
                regime
            )
    );

const highRegime =
    persistence.find(
        item =>
            item.regime === "HIGH"
    );

const highRegimeBlocks =
    blockResults.filter(
        result =>
            result.regime === "HIGH"
    );

const highPearsonDifferenceSigns =
    highRegimeBlocks.map(
        result =>
            sign(
                result.pearsonDifference
            )
    );

const report = {
    success: true,

    version:
        "V25.20-STABLE-EVIDENCE-VOLATILITY-CONDITIONED-PERSISTENCE",

    status:
        "VOLATILITY_CONDITIONED_PERSISTENCE_AUDIT_COMPLETE",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Determine descriptively whether the V25.19 volatility-conditioned differences between emaSpread and emaSpreadATR persist across EARLY, MIDDLE, and LATE chronological blocks.",

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
        volatilityFeature:
            ATR_FEATURE,
        target: TARGET,
        chronologicalBlocks:
            ranges
    },

    methodology: {
        thresholdSourceBlock:
            "EARLY",

        thresholdSourceRows:
            earlyAtr.length,

        thresholds,

        regimes,

        thresholdsAppliedUnchangedToAllBlocks:
            true,

        noFutureThresholdRecalculation:
            true,

        persistenceDefinition:
            "Descriptive comparison of sign consistency and magnitude differences across EARLY, MIDDLE, and LATE; no statistical significance or trading-edge declaration."
    },

    blockResults,

    persistence,

    highVolatilityFocus: {
        regime: "HIGH",
        blocks:
            highRegimeBlocks,
        pearsonDifferenceSignSequence:
            highPearsonDifferenceSigns,
        descriptivePersistence:
            highRegime
                ? highRegime
                : null
    },

    interpretation: {
        descriptiveOnly: true,
        persistenceTested: true,
        highVolatilityPersistenceSpecificallyReported:
            true,
        noStatisticalSignificanceClaim:
            true,
        noCausalityClaim: true,
        noInterchangeabilityClaim:
            true,
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
        thresholds.q2 <= thresholds.q3 &&
        blockResults.length ===
            ranges.length * regimes.length,

    outputFile: OUTPUT_FILE
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
        report,
        null,
        2
    )
);

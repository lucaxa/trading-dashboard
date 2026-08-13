/*
============================================================
TradeMind Pro
V25.15 — FEATURE REDUNDANCY STABILITY AUDIT
============================================================

PURPOSE
------------------------------------------------------------
V25.14 established the cross-feature information structure:

- 19 frozen features
- 171 feature pairs
- near-duplicate relationships
- strong redundancy relationships
- redundancy groups
- independent singleton features

V25.15 asks the next question:

    Does that redundancy structure remain stable across time?

This is a DESCRIPTIVE AUDIT ONLY.

STRICTLY DESCRIPTIVE
------------------------------------------------------------
- Uses the frozen V25.10 learning dataset only.
- No market-data fetch.
- No dataset modification.
- No feature engineering.
- No threshold search for trading.
- No feature selection.
- No candidate discovery.
- No strategy discovery.
- No optimization.
- No model fitting.
- No strategy validation.
- No strategy modification.
- No orders.

ANALYSES
------------------------------------------------------------
For every one of the 171 feature pairs:

1. Overall Pearson correlation.
2. Overall Spearman correlation.
3. EARLY / MIDDLE / LATE Pearson correlation.
4. EARLY / MIDDLE / LATE Spearman correlation.
5. Sign consistency across the three time blocks.
6. Absolute-correlation magnitude stability.
7. Near-duplicate status by block (|Pearson| >= 0.95).
8. Strong-redundancy status by block (|Pearson| >= 0.80).
9. Persistent pair classification.
10. Per-feature counts of persistent redundancy.
11. Time-localized redundancy pairs.
12. Pairs that lose redundancy over time.

The result describes whether feature redundancy is
persistent, regime-localized, or unstable.

It does NOT select features or alter the strategy.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_15_feature_redundancy_stability_audit.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;

const NEAR_DUPLICATE_THRESHOLD = 0.95;
const STRONG_REDUNDANCY_THRESHOLD = 0.80;

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

function sign(v) {
    if (!Number.isFinite(v) || v === 0) return 0;
    return v > 0 ? 1 : -1;
}

function pairCorrelation(records, featureA, featureB, start, end) {
    const xs = [];
    const ys = [];

    for (let i = start; i < end; i++) {
        const record = records[i];

        const x = Number(record.features[featureA]);
        const y = Number(record.features[featureB]);

        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
        }
    }

    const p = pearson(xs, ys);
    const s = spearman(xs, ys);

    return {
        count: xs.length,
        pearson: round(p),
        spearman: round(s),
        absPearson: round(
            Number.isFinite(p) ? Math.abs(p) : null
        ),
        absSpearman: round(
            Number.isFinite(s) ? Math.abs(s) : null
        ),
        sign: sign(p),
        nearDuplicate:
            Number.isFinite(p) &&
            Math.abs(p) >= NEAR_DUPLICATE_THRESHOLD,
        strongRedundancy:
            Number.isFinite(p) &&
            Math.abs(p) >= STRONG_REDUNDANCY_THRESHOLD
    };
}

function blockRanges(n) {
    const third = Math.floor(n / 3);

    return [
        {
            block: "EARLY",
            startIndex: 0,
            endIndex: third - 1
        },
        {
            block: "MIDDLE",
            startIndex: third,
            endIndex: third * 2 - 1
        },
        {
            block: "LATE",
            startIndex: third * 2,
            endIndex: n - 1
        }
    ];
}

if (!fs.existsSync(INPUT)) {
    throw new Error(
        `Frozen V25.10 dataset not found: ${INPUT}`
    );
}

const data = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

if (data.status !== "DATASET_FREEZE_COMPLETE") {
    throw new Error(
        "Input dataset is not DATASET_FREEZE_COMPLETE."
    );
}

if (data.learningDataset?.frozen !== true) {
    throw new Error(
        "Input learning dataset is not marked frozen."
    );
}

const records =
    data.learningDataset?.records;

if (!Array.isArray(records)) {
    throw new Error(
        "learningDataset.records is missing."
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
        `Expected featureCount ${EXPECTED_FEATURE_COUNT}, got ` +
        `${data.learningDataset?.featureCount}.`
    );
}

for (const feature of FEATURES) {
    for (const record of records) {
        if (
            !record?.features ||
            !finite(record.features[feature])
        ) {
            throw new Error(
                `Invalid/missing value for feature ${feature}.`
            );
        }
    }
}

const ranges = blockRanges(records.length);
const pairResults = [];

for (let i = 0; i < FEATURES.length; i++) {
    for (let j = i + 1; j < FEATURES.length; j++) {
        const featureA = FEATURES[i];
        const featureB = FEATURES[j];

        const overall =
            pairCorrelation(
                records,
                featureA,
                featureB,
                0,
                records.length
            );

        const blocks = ranges.map(r => ({
            block: r.block,
            startIndex: r.startIndex,
            endIndex: r.endIndex,
            ...pairCorrelation(
                records,
                featureA,
                featureB,
                r.startIndex,
                r.endIndex + 1
            )
        }));

        const pearsonValues =
            blocks.map(b => b.pearson)
                .filter(Number.isFinite);

        const signs =
            blocks.map(b => b.sign);

        const nonZeroSigns =
            signs.filter(s => s !== 0);

        const signConsistent =
            nonZeroSigns.length === 3 &&
            nonZeroSigns.every(
                s => s === nonZeroSigns[0]
            );

        const absoluteValues =
            blocks.map(b => b.absPearson)
                .filter(Number.isFinite);

        const meanAbs =
            absoluteValues.length
                ? mean(absoluteValues)
                : null;

        const maxAbs =
            absoluteValues.length
                ? Math.max(...absoluteValues)
                : null;

        const minAbs =
            absoluteValues.length
                ? Math.min(...absoluteValues)
                : null;

        const magnitudeRange =
            maxAbs !== null && minAbs !== null
                ? maxAbs - minAbs
                : null;

        const nearBlocks =
            blocks.filter(
                b => b.nearDuplicate
            ).map(b => b.block);

        const strongBlocks =
            blocks.filter(
                b => b.strongRedundancy
            ).map(b => b.block);

        const persistentNear =
            nearBlocks.length === 3;

        const persistentStrong =
            strongBlocks.length === 3;

        const localizedStrong =
            strongBlocks.length > 0 &&
            strongBlocks.length < 3;

        const lostStrongByLate =
            blocks[0].strongRedundancy &&
            !blocks[2].strongRedundancy;

        const emergedStrongLate =
            !blocks[0].strongRedundancy &&
            blocks[2].strongRedundancy;

        pairResults.push({
            featureA,
            featureB,
            overall,
            blocks,
            stability: {
                pearsonSignConsistent:
                    signConsistent,
                blockPearsonSigns:
                    signs,
                meanAbsolutePearson:
                    round(meanAbs),
                maxAbsolutePearson:
                    round(maxAbs),
                minAbsolutePearson:
                    round(minAbs),
                absolutePearsonRange:
                    round(magnitudeRange),
                nearDuplicateBlocks:
                    nearBlocks,
                strongRedundancyBlocks:
                    strongBlocks,
                persistentNearDuplicate:
                    persistentNear,
                persistentStrongRedundancy:
                    persistentStrong,
                localizedStrongRedundancy:
                    localizedStrong,
                lostStrongByLate,
                emergedStrongLate
            }
        });
    }
}

const persistentNearDuplicatePairs =
    pairResults.filter(
        p =>
            p.stability
                .persistentNearDuplicate
    );

const persistentStrongRedundancyPairs =
    pairResults.filter(
        p =>
            p.stability
                .persistentStrongRedundancy
    );

const localizedStrongRedundancyPairs =
    pairResults.filter(
        p =>
            p.stability
                .localizedStrongRedundancy
    );

const lostStrongByLatePairs =
    pairResults.filter(
        p =>
            p.stability
                .lostStrongByLate
    );

const emergedStrongLatePairs =
    pairResults.filter(
        p =>
            p.stability
                .emergedStrongLate
    );

const signStablePairs =
    pairResults.filter(
        p =>
            p.stability
                .pearsonSignConsistent
    );

const signUnstablePairs =
    pairResults.filter(
        p =>
            !p.stability
                .pearsonSignConsistent
    );

const rankedByOverall =
    [...pairResults].sort(
        (a, b) =>
            (b.overall.absPearson || 0) -
            (a.overall.absPearson || 0)
    );

const rankedByInstability =
    [...pairResults].sort(
        (a, b) =>
            (b.stability.absolutePearsonRange || 0) -
            (a.stability.absolutePearsonRange || 0)
    );

const perFeature = {};

for (const feature of FEATURES) {
    const related =
        pairResults.filter(
            p =>
                p.featureA === feature ||
                p.featureB === feature
        );

    const persistentStrong =
        related.filter(
            p =>
                p.stability
                    .persistentStrongRedundancy
        );

    const localized =
        related.filter(
            p =>
                p.stability
                    .localizedStrongRedundancy
        );

    const signStable =
        related.filter(
            p =>
                p.stability
                    .pearsonSignConsistent
        );

    perFeature[feature] = {
        pairCount: related.length,
        persistentStrongRedundancyCount:
            persistentStrong.length,
        localizedStrongRedundancyCount:
            localized.length,
        signStablePairCount:
            signStable.length,
        topOverallRedundancies:
            [...related]
                .sort(
                    (a, b) =>
                        (b.overall.absPearson || 0) -
                        (a.overall.absPearson || 0)
                )
                .slice(0, 5)
                .map(p => ({
                    otherFeature:
                        p.featureA === feature
                            ? p.featureB
                            : p.featureA,
                    overallPearson:
                        p.overall.pearson,
                    earlyPearson:
                        p.blocks[0].pearson,
                    middlePearson:
                        p.blocks[1].pearson,
                    latePearson:
                        p.blocks[2].pearson,
                    persistentStrongRedundancy:
                        p.stability
                            .persistentStrongRedundancy
                }))
    };
}

const report = {
    success: true,

    version:
        "V25.15-FEATURE-REDUNDANCY-STABILITY-AUDIT",

    status:
        "REDUNDANCY_STABILITY_AUDIT_COMPLETE",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Descriptive audit of whether V25.14 feature redundancy relationships persist across time.",

    policy: {
        sourceFrozen: true,
        datasetModified: false,
        featureEngineering: false,
        tradingThresholdSearch: false,
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
        featureCount: FEATURES.length,
        blockCount: 3,
        blocks: ranges
    },

    thresholds: {
        nearDuplicateAbsPearson:
            NEAR_DUPLICATE_THRESHOLD,
        strongRedundancyAbsPearson:
            STRONG_REDUNDANCY_THRESHOLD
    },

    pairCount: pairResults.length,

    counts: {
        persistentNearDuplicatePairs:
            persistentNearDuplicatePairs.length,
        persistentStrongRedundancyPairs:
            persistentStrongRedundancyPairs.length,
        localizedStrongRedundancyPairs:
            localizedStrongRedundancyPairs.length,
        lostStrongByLatePairs:
            lostStrongByLatePairs.length,
        emergedStrongLatePairs:
            emergedStrongLatePairs.length,
        signStablePairs:
            signStablePairs.length,
        signUnstablePairs:
            signUnstablePairs.length
    },

    persistentNearDuplicatePairs,
    persistentStrongRedundancyPairs,
    localizedStrongRedundancyPairs,
    lostStrongByLatePairs,
    emergedStrongLatePairs,

    topOverallRedundancies:
        rankedByOverall.slice(0, 25),

    mostTimeUnstableRedundancies:
        rankedByInstability.slice(0, 25),

    perFeature,

    guards: {
        learningEngineCalled: false,
        learningDatasetModified: false,
        featureSelection: false,
        candidateDiscovery: false,
        strategyDiscovery: false,
        optimization: false,
        validation: false,
        oos: false,
        strategyModified: false,
        realOrders: false
    },

    verdict: {
        auditPass: true,
        descriptiveOnly: true,
        noFeatureSelection: true,
        noOptimization: true,
        noCandidateDiscovery: true,
        noStrategyModification: true,
        noRealOrders: true
    }
};

fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(report, null, 2)
);

console.log(
    JSON.stringify({
        status: report.status,
        datasetRows: report.source.datasetRows,
        featureCount: report.source.featureCount,
        pairCount: report.pairCount,
        persistentNearDuplicatePairs:
            report.counts.persistentNearDuplicatePairs,
        persistentStrongRedundancyPairs:
            report.counts.persistentStrongRedundancyPairs,
        localizedStrongRedundancyPairs:
            report.counts.localizedStrongRedundancyPairs,
        lostStrongByLatePairs:
            report.counts.lostStrongByLatePairs,
        emergedStrongLatePairs:
            report.counts.emergedStrongLatePairs,
        signStablePairs:
            report.counts.signStablePairs,
        signUnstablePairs:
            report.counts.signUnstablePairs,
        outputFile: OUTPUT_FILE
    }, null, 2)
);

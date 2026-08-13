/*
============================================================
TradeMind Pro
V25.17 — STABLE EVIDENCE REDUNDANCY EXPOSURE AUDIT
============================================================

PURPOSE
------------------------------------------------------------
V25.16 established that exactly one feature has stable
feature/outcome evidence across EARLY / MIDDLE / LATE and
after 5% tail trimming:

    emaSpread

V25.16 also established that emaSpread belongs to the
persistently redundant feature group.

V25.17 DOES NOT select, remove, rank for trading, or modify
features.

It only exposes the exact redundancy relationships behind the
V25.16 persistent-redundancy classification.

STRICTLY DESCRIPTIVE
------------------------------------------------------------
- Frozen V25.10 dataset only.
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

V25.17 QUESTIONS
------------------------------------------------------------
1. Which feature pairs satisfy |Pearson| >= 0.80 in ALL
   three chronological blocks?
2. Which feature pairs satisfy |Pearson| >= 0.95 in ALL
   three blocks?
3. Which persistent strong-redundancy pair(s) involve the
   V25.16 stable evidence feature(s)?
4. What are the EARLY / MIDDLE / LATE correlations for those
   exact pairs?
5. Does the stable evidence feature have one or multiple
   persistent strong-redundancy relationships?

This is an evidence-exposure audit only.

It does NOT determine whether the stable evidence is
independent, causal, tradable, or useful in a strategy.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_17_stable_evidence_redundancy_exposure_audit.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;

const STRONG_REDUNDANCY_THRESHOLD = 0.80;
const NEAR_DUPLICATE_THRESHOLD = 0.95;

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

const EXPECTED_STABLE_EVIDENCE_FEATURES = [
    "emaSpread"
];

function round(v, d = 6) {
    if (!Number.isFinite(v)) return null;
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
}

function pearson(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) {
        return null;
    }

    let sx = 0;
    let sy = 0;

    for (let i = 0; i < xs.length; i++) {
        sx += xs[i];
        sy += ys[i];
    }

    const mx = sx / xs.length;
    const my = sy / ys.length;

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

    if (denominator === 0) {
        return null;
    }

    return numerator / denominator;
}

function pairCorrelation(records, featureA, featureB, start, end) {
    const xs = [];
    const ys = [];

    for (let i = start; i < end; i++) {
        const row = records[i];

        const x = Number(row?.features?.[featureA]);
        const y = Number(row?.features?.[featureB]);

        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
        }
    }

    const value = pearson(xs, ys);

    return {
        count: xs.length,
        pearson: round(value),
        absPearson: round(
            Number.isFinite(value) ? Math.abs(value) : null
        ),
        strongRedundancy:
            Number.isFinite(value) &&
            Math.abs(value) >= STRONG_REDUNDANCY_THRESHOLD,
        nearDuplicate:
            Number.isFinite(value) &&
            Math.abs(value) >= NEAR_DUPLICATE_THRESHOLD
    };
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
    for (const row of records) {
        if (
            !row?.features ||
            !Number.isFinite(Number(row.features[feature]))
        ) {
            throw new Error(
                `Invalid feature value detected for ${feature}.`
            );
        }
    }
}

const ranges = blockRanges(records.length);

const allPairs = [];
const persistentStrongPairs = [];
const persistentNearDuplicatePairs = [];

for (let i = 0; i < FEATURES.length; i++) {
    for (let j = i + 1; j < FEATURES.length; j++) {
        const featureA = FEATURES[i];
        const featureB = FEATURES[j];

        const blocks = ranges.map(range => {
            const result = pairCorrelation(
                records,
                featureA,
                featureB,
                range.start,
                range.end
            );

            return {
                block: range.block,
                count: result.count,
                pearson: result.pearson,
                absPearson: result.absPearson,
                strongRedundancy:
                    result.strongRedundancy,
                nearDuplicate:
                    result.nearDuplicate
            };
        });

        const overall = pairCorrelation(
            records,
            featureA,
            featureB,
            0,
            records.length
        );

        const persistentStrong =
            blocks.every(
                block => block.strongRedundancy === true
            );

        const persistentNearDuplicate =
            blocks.every(
                block => block.nearDuplicate === true
            );

        const pair = {
            featureA,
            featureB,
            overallPearson: overall.pearson,
            overallAbsPearson: overall.absPearson,
            blocks,
            persistentStrongRedundancy: persistentStrong,
            persistentNearDuplicate
        };

        allPairs.push(pair);

        if (persistentStrong) {
            persistentStrongPairs.push(pair);
        }

        if (persistentNearDuplicate) {
            persistentNearDuplicatePairs.push(pair);
        }
    }
}

const stableEvidenceFeatures =
    EXPECTED_STABLE_EVIDENCE_FEATURES.filter(
        feature => FEATURES.includes(feature)
    );

const stableEvidenceRedundancyExposure =
    stableEvidenceFeatures.map(feature => {
        const pairs =
            persistentStrongPairs.filter(
                pair =>
                    pair.featureA === feature ||
                    pair.featureB === feature
            );

        const nearDuplicatePairs =
            persistentNearDuplicatePairs.filter(
                pair =>
                    pair.featureA === feature ||
                    pair.featureB === feature
            );

        return {
            feature,
            persistentStrongRedundancyPairCount:
                pairs.length,
            persistentStrongRedundancyPairs:
                pairs.map(pair => ({
                    otherFeature:
                        pair.featureA === feature
                            ? pair.featureB
                            : pair.featureA,
                    overallPearson:
                        pair.overallPearson,
                    overallAbsPearson:
                        pair.overallAbsPearson,
                    blocks: pair.blocks
                })),
            persistentNearDuplicatePairCount:
                nearDuplicatePairs.length,
            persistentNearDuplicatePairs:
                nearDuplicatePairs.map(pair => ({
                    otherFeature:
                        pair.featureA === feature
                            ? pair.featureB
                            : pair.featureA,
                    overallPearson:
                        pair.overallPearson,
                    overallAbsPearson:
                        pair.overallAbsPearson,
                    blocks: pair.blocks
                }))
        };
    });

const stableExposureSummary = {
    stableEvidenceFeatureCount:
        stableEvidenceFeatures.length,
    stableEvidenceFeatures,
    exposedToPersistentStrongRedundancy:
        stableEvidenceRedundancyExposure.filter(
            item =>
                item.persistentStrongRedundancyPairCount > 0
        ).length,
    stableEvidenceFeaturesWithoutPersistentStrongRedundancy:
        stableEvidenceRedundancyExposure.filter(
            item =>
                item.persistentStrongRedundancyPairCount === 0
        ).length
};

const output = {
    success: true,
    version:
        "V25.17-STABLE-EVIDENCE-REDUNDANCY-EXPOSURE",
    status:
        "REDUNDANCY_EXPOSURE_AUDIT_COMPLETE",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Expose the exact persistent redundancy relationships behind the V25.16 stable-evidence classification.",

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
        featureCount: FEATURES.length,
        blockCount: ranges.length,
        blocks: ranges.map(range => ({
            block: range.block,
            start: range.start,
            end: range.end
        }))
    },

    thresholds: {
        strongRedundancyAbsPearson:
            STRONG_REDUNDANCY_THRESHOLD,
        nearDuplicateAbsPearson:
            NEAR_DUPLICATE_THRESHOLD
    },

    counts: {
        totalFeaturePairs: allPairs.length,
        persistentStrongRedundancyPairs:
            persistentStrongPairs.length,
        persistentNearDuplicatePairs:
            persistentNearDuplicatePairs.length
    },

    stableEvidenceExposure:
        stableExposureSummary,

    persistentStrongRedundancyPairs:
        persistentStrongPairs,

    persistentNearDuplicatePairs:
        persistentNearDuplicatePairs,

    interpretation: {
        persistentStrongRedundancyDefinition:
            "A feature pair has |Pearson| >= 0.80 in EARLY, MIDDLE, and LATE.",
        persistentNearDuplicateDefinition:
            "A feature pair has |Pearson| >= 0.95 in EARLY, MIDDLE, and LATE.",
        stableEvidenceSource:
            "V25.16 stableEvidenceFeatures list.",
        noTradingDecision: true,
        noIndependenceClaim:
            "Persistent redundancy exposure does not establish that the stable evidence is dependent, independent, causal, or tradable."
    },

    guards: {
        learningEngineCalled: false,
        candidateDiscovery: false,
        featureSelection: false,
        modelFitting: false,
        validation: false,
        oos: false,
        strategyModified: false,
        realOrders: false
    },

    auditPass:
        persistentStrongPairs.length > 0 &&
        stableEvidenceFeatures.length > 0,

    outputFile: OUTPUT_FILE
};

fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(output, null, 2)
);

console.log(
    JSON.stringify(output, null, 2)
);

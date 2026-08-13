/*
============================================================
TradeMind Pro
V25.16 — FEATURE EVIDENCE × REDUNDANCY CONSOLIDATION AUDIT
============================================================

PURPOSE
------------------------------------------------------------
Consolidate the already-completed V25.13 feature-evidence
stability audit and V25.15 redundancy-stability evidence
into one feature-level diagnostic.

V25.16 DOES NOT select, remove, rank for trading, or modify
features. It only describes the evidence already present in
the frozen V25.10 learning dataset.

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

CONSOLIDATION QUESTIONS
------------------------------------------------------------
For each of the 19 frozen features:

1. Is feature/outcome Pearson sign stable across
   EARLY / MIDDLE / LATE?
2. Is that sign still stable after 5% tail trimming?
3. How large is the average absolute Pearson relationship?
4. How many strong redundancy relationships (|r| >= 0.80)
   persist across all three blocks?
5. How many strong redundancy relationships are localized?
6. How many near-duplicate relationships (|r| >= 0.95)
   persist across all three blocks?
7. Does the feature therefore have evidence that is:
   - STABLE_WITH_LOW_PERSISTENT_REDUNDANCY
   - STABLE_WITH_PERSISTENT_REDUNDANCY
   - UNSTABLE_WITH_LOW_PERSISTENT_REDUNDANCY
   - UNSTABLE_WITH_PERSISTENT_REDUNDANCY

These labels are descriptive only. They are NOT feature
selection decisions and do NOT imply a trading edge.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_16_feature_evidence_redundancy_consolidation.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;

const TRIM_FRACTION = 0.05;
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

function mean(values) {
    if (!values.length) return null;
    return values.reduce((s, x) => s + x, 0) / values.length;
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

function sign(v) {
    if (!Number.isFinite(v) || v === 0) return 0;
    return v > 0 ? 1 : -1;
}

function trimmedPairs(pairs) {
    if (pairs.length < 20) return pairs;

    const sortedX = [...pairs].sort((a, b) => a.x - b.x);
    const sortedY = [...pairs].sort((a, b) => a.y - b.y);

    const trim = Math.floor(pairs.length * TRIM_FRACTION);

    if (trim * 2 >= pairs.length) return pairs;

    const xLow = sortedX[trim].x;
    const xHigh = sortedX[sortedX.length - trim - 1].x;
    const yLow = sortedY[trim].y;
    const yHigh = sortedY[sortedY.length - trim - 1].y;

    return pairs.filter(
        p =>
            p.x >= xLow &&
            p.x <= xHigh &&
            p.y >= yLow &&
            p.y <= yHigh
    );
}

function correlation(pairs) {
    const xs = pairs.map(p => p.x);
    const ys = pairs.map(p => p.y);
    const value = pearson(xs, ys);

    return {
        count: pairs.length,
        pearson: round(value),
        absPearson: round(
            Number.isFinite(value) ? Math.abs(value) : null
        ),
        sign: sign(value)
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

function featureOutcomeBlock(records, feature, start, end) {
    const pairs = [];

    for (let i = start; i < end; i++) {
        const r = records[i];
        const x = Number(r.features[feature]);
        const y = Number(r.label.futureReturn);

        if (Number.isFinite(x) && Number.isFinite(y)) {
            pairs.push({ x, y });
        }
    }

    const raw = correlation(pairs);
    const trimmed = correlation(trimmedPairs(pairs));

    return {
        count: pairs.length,
        rawPearson: raw.pearson,
        trimmedPearson: trimmed.pearson,
        rawAbsPearson: raw.absPearson,
        trimmedAbsPearson: trimmed.absPearson,
        rawSign: raw.sign,
        trimmedSign: trimmed.sign
    };
}

function featureOutcomeAudit(records, feature, ranges) {
    const overallPairs = [];

    for (const r of records) {
        const x = Number(r.features[feature]);
        const y = Number(r.label.futureReturn);

        if (Number.isFinite(x) && Number.isFinite(y)) {
            overallPairs.push({ x, y });
        }
    }

    const overall = correlation(overallPairs);
    const overallTrimmed = correlation(
        trimmedPairs(overallPairs)
    );

    const blocks = ranges.map(r => ({
        block: r.block,
        startIndex: r.start,
        endIndex: r.end - 1,
        ...featureOutcomeBlock(
            records,
            feature,
            r.start,
            r.end
        )
    }));

    const rawSigns = blocks
        .map(b => b.rawSign)
        .filter(s => s !== 0);

    const trimmedSigns = blocks
        .map(b => b.trimmedSign)
        .filter(s => s !== 0);

    const rawSignConsistent =
        rawSigns.length === 3 &&
        rawSigns.every(s => s === rawSigns[0]);

    const trimmedSignConsistent =
        trimmedSigns.length === 3 &&
        trimmedSigns.every(s => s === trimmedSigns[0]);

    const rawAbs = blocks
        .map(b => b.rawAbsPearson)
        .filter(Number.isFinite);

    const trimmedAbs = blocks
        .map(b => b.trimmedAbsPearson)
        .filter(Number.isFinite);

    return {
        overall: {
            pearson: overall.pearson,
            trimmedPearson: overallTrimmed.pearson,
            absPearson: overall.absPearson,
            trimmedAbsPearson: overallTrimmed.absPearson
        },
        blocks,
        stability: {
            rawPearsonSignConsistent: rawSignConsistent,
            trimmedPearsonSignConsistent:
                trimmedSignConsistent,
            rawPearsonSigns: blocks.map(b => b.rawSign),
            trimmedPearsonSigns:
                blocks.map(b => b.trimmedSign),
            rawMeanAbsolutePearson:
                round(mean(rawAbs)),
            trimmedMeanAbsolutePearson:
                round(mean(trimmedAbs))
        }
    };
}

function pairPearson(records, a, b, start, end) {
    const xs = [];
    const ys = [];

    for (let i = start; i < end; i++) {
        const r = records[i];
        const x = Number(r.features[a]);
        const y = Number(r.features[b]);

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
        sign: sign(value),
        nearDuplicate:
            Number.isFinite(value) &&
            Math.abs(value) >= NEAR_DUPLICATE_THRESHOLD,
        strongRedundancy:
            Number.isFinite(value) &&
            Math.abs(value) >= STRONG_REDUNDANCY_THRESHOLD
    };
}

function redundancyAudit(records, feature, ranges) {
    const related = [];

    for (const other of FEATURES) {
        if (other === feature) continue;

        const blocks = ranges.map(r => ({
            block: r.block,
            ...pairPearson(
                records,
                feature,
                other,
                r.start,
                r.end
            )
        }));

        const strongBlocks = blocks
            .filter(b => b.strongRedundancy)
            .map(b => b.block);

        const nearBlocks = blocks
            .filter(b => b.nearDuplicate)
            .map(b => b.block);

        const signs = blocks.map(b => b.sign);
        const nonZeroSigns =
            signs.filter(s => s !== 0);

        const signConsistent =
            nonZeroSigns.length === 3 &&
            nonZeroSigns.every(
                s => s === nonZeroSigns[0]
            );

        const overall = pairPearson(
            records,
            feature,
            other,
            0,
            records.length
        );

        related.push({
            otherFeature: other,
            overallPearson: overall.pearson,
            overallAbsPearson: overall.absPearson,
            blocks,
            persistentStrongRedundancy:
                strongBlocks.length === 3,
            localizedStrongRedundancy:
                strongBlocks.length > 0 &&
                strongBlocks.length < 3,
            persistentNearDuplicate:
                nearBlocks.length === 3,
            strongRedundancyBlocks:
                strongBlocks,
            nearDuplicateBlocks:
                nearBlocks,
            pearsonSignConsistent:
                signConsistent
        });
    }

    const persistentStrong =
        related.filter(
            r => r.persistentStrongRedundancy
        );

    const localizedStrong =
        related.filter(
            r => r.localizedStrongRedundancy
        );

    const persistentNear =
        related.filter(
            r => r.persistentNearDuplicate
        );

    return {
        pairCount: related.length,
        persistentStrongRedundancyCount:
            persistentStrong.length,
        localizedStrongRedundancyCount:
            localizedStrong.length,
        persistentNearDuplicateCount:
            persistentNear.length,
        relatedPairs: related
    };
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
            !finite(record.features[feature]) ||
            !record.label ||
            !finite(record.label.futureReturn)
        ) {
            throw new Error(
                `Invalid record detected for ${feature}.`
            );
        }
    }
}

const ranges = blockRanges(records.length);
const features = {};

for (const feature of FEATURES) {
    const evidence =
        featureOutcomeAudit(
            records,
            feature,
            ranges
        );

    const redundancy =
        redundancyAudit(
            records,
            feature,
            ranges
        );

    const evidenceStable =
        evidence.stability
            .rawPearsonSignConsistent &&
        evidence.stability
            .trimmedPearsonSignConsistent;

    const persistentRedundancy =
        redundancy.persistentStrongRedundancyCount > 0;

    let descriptiveRole;

    if (evidenceStable && persistentRedundancy) {
        descriptiveRole =
            "STABLE_WITH_PERSISTENT_REDUNDANCY";
    } else if (evidenceStable && !persistentRedundancy) {
        descriptiveRole =
            "STABLE_WITH_LOW_PERSISTENT_REDUNDANCY";
    } else if (!evidenceStable && persistentRedundancy) {
        descriptiveRole =
            "UNSTABLE_WITH_PERSISTENT_REDUNDANCY";
    } else {
        descriptiveRole =
            "UNSTABLE_WITH_LOW_PERSISTENT_REDUNDANCY";
    }

    features[feature] = {
        feature,
        evidence: {
            overallPearson:
                evidence.overall.pearson,
            overallTrimmedPearson:
                evidence.overall.trimmedPearson,
            overallAbsPearson:
                evidence.overall.absPearson,
            overallTrimmedAbsPearson:
                evidence.overall.trimmedAbsPearson,
            earlyPearson:
                evidence.blocks[0].rawPearson,
            middlePearson:
                evidence.blocks[1].rawPearson,
            latePearson:
                evidence.blocks[2].rawPearson,
            earlyTrimmedPearson:
                evidence.blocks[0].trimmedPearson,
            middleTrimmedPearson:
                evidence.blocks[1].trimmedPearson,
            lateTrimmedPearson:
                evidence.blocks[2].trimmedPearson,
            rawPearsonSignConsistent:
                evidence.stability
                    .rawPearsonSignConsistent,
            trimmedPearsonSignConsistent:
                evidence.stability
                    .trimmedPearsonSignConsistent,
            rawMeanAbsolutePearson:
                evidence.stability
                    .rawMeanAbsolutePearson,
            trimmedMeanAbsolutePearson:
                evidence.stability
                    .trimmedMeanAbsolutePearson
        },
        redundancy: {
            pairCount:
                redundancy.pairCount,
            persistentStrongRedundancyCount:
                redundancy.persistentStrongRedundancyCount,
            localizedStrongRedundancyCount:
                redundancy.localizedStrongRedundancyCount,
            persistentNearDuplicateCount:
                redundancy.persistentNearDuplicateCount
        },
        consolidation: {
            evidenceStable,
            persistentStrongRedundancy:
                persistentRedundancy,
            descriptiveRole
        }
    };
}

const stableFeatures =
    FEATURES.filter(
        f => features[f]
            .consolidation.evidenceStable
    );

const unstableFeatures =
    FEATURES.filter(
        f => !features[f]
            .consolidation.evidenceStable
    );

const persistentlyRedundantFeatures =
    FEATURES.filter(
        f =>
            features[f]
                .consolidation
                .persistentStrongRedundancy
    );

const lowPersistentRedundancyFeatures =
    FEATURES.filter(
        f =>
            !features[f]
                .consolidation
                .persistentStrongRedundancy
    );

const report = {
    success: true,

    version:
        "V25.16-FEATURE-EVIDENCE-REDUNDANCY-CONSOLIDATION",

    status:
        "CONSOLIDATION_AUDIT_COMPLETE",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Consolidate V25.13 feature-evidence stability and V25.15 redundancy-stability evidence at feature level.",

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
        blocks: ranges
    },

    thresholds: {
        trimFractionEachTail:
            TRIM_FRACTION,
        nearDuplicateAbsPearson:
            NEAR_DUPLICATE_THRESHOLD,
        strongRedundancyAbsPearson:
            STRONG_REDUNDANCY_THRESHOLD
    },

    counts: {
        stableEvidenceFeatures:
            stableFeatures.length,
        unstableEvidenceFeatures:
            unstableFeatures.length,
        persistentlyRedundantFeatures:
            persistentlyRedundantFeatures.length,
        lowPersistentRedundancyFeatures:
            lowPersistentRedundancyFeatures.length
    },

    featureLists: {
        stableEvidenceFeatures:
            stableFeatures,
        unstableEvidenceFeatures:
            unstableFeatures,
        persistentlyRedundantFeatures:
            persistentlyRedundantFeatures,
        lowPersistentRedundancyFeatures:
            lowPersistentRedundancyFeatures
    },

    features,

    interpretation: {
        note:
            "descriptiveRole is an evidence classification only; it is not a feature-selection or trading decision.",
        stableEvidenceDefinition:
            "Raw Pearson sign is consistent across EARLY/MIDDLE/LATE AND trimmed Pearson sign is also consistent across all three blocks.",
        persistentRedundancyDefinition:
            "At least one other feature has |Pearson| >= 0.80 in EARLY, MIDDLE, and LATE.",
        nearDuplicateDefinition:
            "|Pearson| >= 0.95 in all three blocks.",
        noTradingDecision:
            true
    },

    guards: {
        learningEngineCalled: false,
        candidateDiscovery: false,
        featureSelection: false,
        validation: false,
        oos: false,
        strategyModified: false,
        realOrders: false
    },

    auditPass: true,

    outputFile: OUTPUT_FILE
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
            featureCount: FEATURES.length,
            stableEvidenceFeatures:
                stableFeatures.length,
            unstableEvidenceFeatures:
                unstableFeatures.length,
            persistentlyRedundantFeatures:
                persistentlyRedundantFeatures.length,
            lowPersistentRedundancyFeatures:
                lowPersistentRedundancyFeatures.length,
            outputFile: OUTPUT_FILE
        },
        null,
        2
    )
);

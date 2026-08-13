/*
============================================================
TradeMind Pro
V25.14 — FEATURE REDUNDANCY & INDEPENDENCE AUDIT
============================================================

PURPOSE
------------------------------------------------------------
Determine how much genuinely different information exists
inside the 19 frozen V25 learning features.

V25.13 showed that several apparent feature/outcome
relationships were unstable across time. V25.14 therefore
does NOT test strategy performance or discover candidates.

It audits feature-to-feature redundancy only.

STRICTLY DESCRIPTIVE
------------------------------------------------------------
- Uses the frozen V25.10 learning dataset only.
- No market-data fetch.
- No dataset modification.
- No feature engineering.
- No threshold search for trading.
- No candidate discovery.
- No strategy discovery.
- No optimization.
- No model fitting.
- No strategy validation.
- No strategy modification.
- No orders.

ANALYSES
------------------------------------------------------------
For every pair of the 19 features:
1. Pearson correlation.
2. Spearman correlation.
3. Absolute correlation ranking.
4. Near-duplicate detection at configurable thresholds.
5. Exact/near-exact pair detection.
6. Feature redundancy groups using a graph of
   high-correlation pairs.
7. Per-feature redundancy counts.

The result is an information-structure audit,
NOT a feature-selection engine and NOT a strategy.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_14_feature_redundancy_independence_audit.json";

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

if (!fs.existsSync(INPUT)) {
    throw new Error(`Frozen V25.10 dataset not found: ${INPUT}`);
}

const data = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

if (data.status !== "DATASET_FREEZE_COMPLETE") {
    throw new Error("Input dataset is not DATASET_FREEZE_COMPLETE.");
}

if (data.learningDataset?.frozen !== true) {
    throw new Error("Input learning dataset is not marked frozen.");
}

const records = data.learningDataset?.records;

if (!Array.isArray(records)) {
    throw new Error("learningDataset.records is missing.");
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

function pairData(a, b) {
    const xs = [];
    const ys = [];

    for (const record of records) {
        const x = Number(record.features[a]);
        const y = Number(record.features[b]);

        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
        }
    }

    return { xs, ys };
}

const pairResults = [];

for (let i = 0; i < FEATURES.length; i++) {
    for (let j = i + 1; j < FEATURES.length; j++) {
        const a = FEATURES[i];
        const b = FEATURES[j];

        const { xs, ys } = pairData(a, b);

        const p = pearson(xs, ys);
        const s = spearman(xs, ys);

        pairResults.push({
            featureA: a,
            featureB: b,
            count: xs.length,
            pearson: round(p),
            spearman: round(s),
            absPearson: round(
                Number.isFinite(p) ? Math.abs(p) : null
            ),
            absSpearman: round(
                Number.isFinite(s) ? Math.abs(s) : null
            ),
            nearDuplicate:
                Number.isFinite(p) &&
                Math.abs(p) >= NEAR_DUPLICATE_THRESHOLD,
            strongRedundancy:
                Number.isFinite(p) &&
                Math.abs(p) >= STRONG_REDUNDANCY_THRESHOLD
        });
    }
}

const rankedByPearson = [...pairResults].sort(
    (a, b) => b.absPearson - a.absPearson
);

const rankedBySpearman = [...pairResults].sort(
    (a, b) => b.absSpearman - a.absSpearman
);

const nearDuplicatePairs =
    pairResults.filter(p => p.nearDuplicate);

const strongRedundancyPairs =
    pairResults.filter(p => p.strongRedundancy);

const perFeature = {};

for (const feature of FEATURES) {
    const related = pairResults.filter(
        p =>
            p.featureA === feature ||
            p.featureB === feature
    );

    const near = related.filter(
        p => p.nearDuplicate
    );

    const strong = related.filter(
        p => p.strongRedundancy
    );

    const top = [...related]
        .sort((a, b) => b.absPearson - a.absPearson)
        .slice(0, 5);

    perFeature[feature] = {
        pairCount: related.length,
        nearDuplicateCount: near.length,
        strongRedundancyCount: strong.length,
        topPearsonRelationships: top.map(p => ({
            otherFeature:
                p.featureA === feature
                    ? p.featureB
                    : p.featureA,
            pearson: p.pearson,
            spearman: p.spearman,
            absPearson: p.absPearson
        }))
    };
}

/*
Build simple connected components from near-duplicate
relationships. This is descriptive grouping only.
*/
const adjacency = {};
for (const feature of FEATURES) {
    adjacency[feature] = new Set();
}

for (const p of nearDuplicatePairs) {
    adjacency[p.featureA].add(p.featureB);
    adjacency[p.featureB].add(p.featureA);
}

const visited = new Set();
const redundancyGroups = [];

for (const feature of FEATURES) {
    if (visited.has(feature)) continue;

    const queue = [feature];
    const group = [];
    visited.add(feature);

    while (queue.length) {
        const current = queue.shift();
        group.push(current);

        for (const next of adjacency[current]) {
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }

    if (group.length > 1) {
        redundancyGroups.push(
            group.sort()
        );
    }
}

const independentSingletons =
    FEATURES.filter(
        feature =>
            !redundancyGroups.some(
                group => group.includes(feature)
            )
    );

const report = {
    success: true,

    version:
        "V25.14-FEATURE-REDUNDANCY-INDEPENDENCE-AUDIT",

    status:
        "REDUNDANCY_AUDIT_COMPLETE",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Descriptive audit of redundancy and information overlap among the frozen V25 learning features.",

    policy: {
        sourceFrozen: true,
        datasetModified: false,
        featureEngineering: false,
        tradingThresholdSearch: false,
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
        featureCount: FEATURES.length
    },

    thresholds: {
        nearDuplicateAbsCorrelation:
            NEAR_DUPLICATE_THRESHOLD,
        strongRedundancyAbsCorrelation:
            STRONG_REDUNDANCY_THRESHOLD
    },

    featureList: FEATURES,

    pairCount: pairResults.length,

    topPearsonRelationships:
        rankedByPearson.slice(0, 25),

    topSpearmanRelationships:
        rankedBySpearman.slice(0, 25),

    nearDuplicatePairs,

    strongRedundancyPairs,

    redundancyGroups,

    independentSingletons,

    perFeature,

    guards: {
        learningEngineCalled: false,
        learningDatasetModified: false,
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
        nearDuplicatePairs: nearDuplicatePairs.length,
        strongRedundancyPairs: strongRedundancyPairs.length,
        redundancyGroups: redundancyGroups.length,
        independentSingletons: independentSingletons.length,
        outputFile: OUTPUT_FILE
    }, null, 2)
);

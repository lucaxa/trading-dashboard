/*
============================================================
TradeMind Pro
V25.18 — STABLE EVIDENCE MATHEMATICAL IDENTITY AUDIT
============================================================

PURPOSE
------------------------------------------------------------
V25.17 showed that the sole V25.16 stable-evidence feature
emaSpread is persistently strongly redundant with emaSpreadATR.

V25.18 asks a narrower descriptive question:

    Is the redundancy caused by a direct mathematical
    relationship between the two features, and how much does
    ATR normalization change their ordering/magnitude?

The frozen V25.10 feature construction defines:

    emaSpread    = ema9 - ema21
    emaSpreadATR = emaSpread / atr14

Therefore V25.18 verifies that identity directly from the
frozen dataset rather than inferring it from correlation alone.

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

ANALYSES
------------------------------------------------------------
1. Exact formula residual:
       emaSpreadATR - emaSpread / atr14

2. Formula identity pass rate.

3. Sign agreement between emaSpread and emaSpreadATR.

4. Pearson and Spearman correlation between the two features.

5. Rank agreement between the two features.

6. EARLY / MIDDLE / LATE versions of the above.

7. Compare each feature's descriptive correlation with
   futureReturn across the same chronological blocks.

IMPORTANT
------------------------------------------------------------
This audit does NOT claim that emaSpread and emaSpreadATR
are interchangeable, independent, causal, or tradable.

It only determines whether the V25.17 redundancy has a direct
mathematical origin and whether ATR normalization materially
changes ordering.

No feature is removed or selected.
============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_18_stable_evidence_mathematical_identity_audit.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;

const FEATURE_A = "emaSpread";
const FEATURE_B = "emaSpreadATR";
const ATR_FEATURE = "atr14";

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

function sign(v) {
    if (v > 0) return 1;
    if (v < 0) return -1;
    return 0;
}

function correlationSummary(rows, featureA, featureB) {
    const pairs = rows
        .map(r => ({
            a: num(r.features?.[featureA]),
            b: num(r.features?.[featureB])
        }))
        .filter(
            p =>
                p.a !== null &&
                p.b !== null
        );

    if (pairs.length < 2) {
        return {
            count: pairs.length,
            pearson: null,
            spearman: null,
            signAgreementRate: null,
            exactValueAgreementRate: null
        };
    }

    const xs = pairs.map(p => p.a);
    const ys = pairs.map(p => p.b);

    let signAgreement = 0;
    let exactAgreement = 0;

    for (const p of pairs) {
        if (sign(p.a) === sign(p.b)) {
            signAgreement++;
        }

        if (Object.is(p.a, p.b)) {
            exactAgreement++;
        }
    }

    return {
        count: pairs.length,
        pearson: round(pearson(xs, ys)),
        spearman: round(spearman(xs, ys)),
        signAgreementRate:
            round(signAgreement / pairs.length, 10),
        exactValueAgreementRate:
            round(exactAgreement / pairs.length, 10)
    };
}

function identitySummary(rows) {
    const valid = rows
        .map(r => ({
            a: num(r.features?.[FEATURE_A]),
            b: num(r.features?.[FEATURE_B]),
            atr: num(r.features?.[ATR_FEATURE])
        }))
        .filter(
            p =>
                p.a !== null &&
                p.b !== null &&
                p.atr !== null &&
                p.atr > 0
        );

    if (!valid.length) {
        return {
            count: 0,
            identityPass: false,
            exactResidualZeroCount: 0,
            maxAbsResidual: null,
            meanAbsResidual: null,
            signAgreementRate: null
        };
    }

    let exactResidualZeroCount = 0;
    let maxAbsResidual = 0;
    let residualSum = 0;
    let signAgreement = 0;

    for (const p of valid) {
        const expected = p.a / p.atr;
        const residual = p.b - expected;
        const absResidual = Math.abs(residual);

        if (absResidual <= 1e-12) {
            exactResidualZeroCount++;
        }

        if (absResidual > maxAbsResidual) {
            maxAbsResidual = absResidual;
        }

        residualSum += absResidual;

        if (sign(p.a) === sign(p.b)) {
            signAgreement++;
        }
    }

    return {
        count: valid.length,
        identityPass:
            exactResidualZeroCount === valid.length,
        exactResidualZeroCount,
        maxAbsResidual: round(maxAbsResidual),
        meanAbsResidual:
            round(residualSum / valid.length),
        signAgreementRate:
            round(signAgreement / valid.length, 10)
    };
}

function futureReturnCorrelation(rows, feature) {
    const pairs = rows
        .map(r => ({
            x: num(r.features?.[feature]),
            y: num(r.label?.futureReturn)
        }))
        .filter(
            p =>
                p.x !== null &&
                p.y !== null
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
        pearson: round(pearson(xs, ys)),
        spearman: round(spearman(xs, ys))
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

const raw = fs.readFileSync(INPUT, "utf8");
const data = JSON.parse(raw);

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

for (const feature of FEATURES) {
    if (
        !records.every(
            r =>
                r.features &&
                Object.prototype.hasOwnProperty.call(
                    r.features,
                    feature
                )
        )
    ) {
        throw new Error(
            `Missing required feature: ${feature}`
        );
    }
}

const ranges =
    blockRanges(records.length);

const identity =
    identitySummary(records);

const redundancy =
    correlationSummary(
        records,
        FEATURE_A,
        FEATURE_B
    );

const outcomeEvidence = {
    emaSpread:
        futureReturnCorrelation(
            records,
            "emaSpread"
        ),
    emaSpreadATR:
        futureReturnCorrelation(
            records,
            "emaSpreadATR"
        )
};

const blocks =
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
            identity:
                identitySummary(blockRows),
            redundancy:
                correlationSummary(
                    blockRows,
                    FEATURE_A,
                    FEATURE_B
                ),
            outcomeEvidence: {
                emaSpread:
                    futureReturnCorrelation(
                        blockRows,
                        "emaSpread"
                    ),
                emaSpreadATR:
                    futureReturnCorrelation(
                        blockRows,
                        "emaSpreadATR"
                    )
            }
        };
    });

const report = {
    success: true,
    version:
        "V25.18-STABLE-EVIDENCE-MATHEMATICAL-IDENTITY",
    status:
        "MATHEMATICAL_IDENTITY_AUDIT_COMPLETE",
    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Determine whether the V25.17 emaSpread ↔ emaSpreadATR redundancy has a direct mathematical origin and quantify the effect of ATR normalization descriptively.",

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
        normalizationFeature: ATR_FEATURE,
        formula:
            "emaSpreadATR = emaSpread / atr14",
        blocks: ranges
    },

    thresholds: {
        identityResidualTolerance:
            1e-12
    },

    overall: {
        identity,
        redundancy,
        outcomeEvidence
    },

    blocks,

    interpretation: {
        directMathematicalRelationship:
            identity.identityPass,
        signPreservedByNormalization:
            identity.signAgreementRate === 1,
        noInterchangeabilityClaim:
            true,
        noIndependenceClaim:
            true,
        noCausalityClaim:
            true,
        noTradingDecision:
            true
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
        identity.identityPass &&
        records.length === EXPECTED_ROWS &&
        learningDataset.featureCount ===
            EXPECTED_FEATURE_COUNT,

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

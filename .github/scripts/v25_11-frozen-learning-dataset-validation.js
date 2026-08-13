/*
============================================================
TradeMind Pro
V25.11 — FROZEN LEARNING DATASET VALIDATION
============================================================

PURPOSE
------------------------------------------------------------
Validate the immutable V25.10 learning dataset before any
learning-engine or candidate-discovery work is allowed.

This layer:
- DOES NOT fetch market data.
- DOES NOT modify V25.10 records.
- DOES NOT rebuild features.
- DOES NOT call learning-engine.js.
- DOES NOT call learning-dataset.js.
- DOES NOT discover candidates.
- DOES NOT select thresholds.
- DOES NOT validate a trading strategy.
- DOES NOT perform OOS testing.
- DOES NOT modify strategy.js.
- DOES NOT place orders.

It validates:
- frozen dataset status and row count
- exact feature schema
- deterministic SHA-256 integrity
- record uniqueness
- chronological ordering
- source-index ordering
- timestamp/session consistency
- finite feature and label values
- label policy and 12-candle / 60-minute horizon
- absence of future-derived feature keys
- paper-only guard state

INPUT
------------------------------------------------------------
v25_10_learning_dataset.json

EXPECTED
------------------------------------------------------------
status = DATASET_FREEZE_COMPLETE
dataset.frozen = true
dataset.rowCount = 7791
dataset.featureCount = 19
dataset.sha256 must equal SHA-256(JSON.stringify(records))
============================================================
*/

const fs = require("fs");
const crypto = require("crypto");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_10_learning_dataset.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_11_learning_dataset_validation.json";

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURE_COUNT = 19;
const FUTURE_CANDLES = 12;
const FIVE_MIN_SECONDS = 300;
const EXPECTED_HORIZON_SECONDS =
    FUTURE_CANDLES * FIVE_MIN_SECONDS;

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

const FORBIDDEN_FUTURE_FEATURE_TOKENS = [
    "future",
    "forward",
    "label",
    "target",
    "return",
    "direction",
    "outcome",
    "horizon"
];

function fail(message) {
    throw new Error(message);
}

function finite(value) {
    return Number.isFinite(Number(value));
}

function sha256(text) {
    return crypto
        .createHash("sha256")
        .update(text, "utf8")
        .digest("hex");
}

function getISTDate(timestamp) {
    const date = new Date(
        Number(timestamp) + 5.5 * 60 * 60 * 1000
    );

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().slice(0, 10);
}

if (!fs.existsSync(INPUT)) {
    fail(`V25.10 frozen dataset not found: ${INPUT}`);
}

const data = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

const dataset =
    data.learningDataset || {};

const audit =
    data.learningRecordAudit || {};

const guard =
    data.guard || {};

const records =
    dataset.records;

if (!Array.isArray(records)) {
    fail("learningDataset.records is not an array.");
}

const checks = {
    statusPass:
        data.status === "DATASET_FREEZE_COMPLETE",

    frozenPass:
        dataset.frozen === true,

    rowCountPass:
        dataset.rowCount === EXPECTED_ROWS &&
        records.length === EXPECTED_ROWS,

    featureCountPass:
        dataset.featureCount === EXPECTED_FEATURE_COUNT,

    sourcePass:
        data.source?.sourceRows === 9385,

    learningRecordAuditPass:
        audit.learningRecordAuditPass === true,

    datasetInvalidRowsPass:
        audit.datasetInvalidRows === 0,

    datasetDuplicateRowsPass:
        audit.datasetDuplicateRows === 0,

    guardPass:
        guard.learningEngineCalled === false &&
        guard.learningDatasetCalled === false &&
        guard.candidateDiscovery === false &&
        guard.validation === false &&
        guard.oos === false &&
        guard.strategyModified === false &&
        guard.realOrders === false
};

if (!checks.statusPass) {
    fail("V25.10 status is not DATASET_FREEZE_COMPLETE.");
}

if (!checks.frozenPass) {
    fail("V25.10 learning dataset is not marked frozen.");
}

if (!checks.rowCountPass) {
    fail(
        `Unexpected V25.10 row count. Expected ${EXPECTED_ROWS}, got ${records.length}.`
    );
}

if (!checks.featureCountPass) {
    fail(
        `Unexpected feature count. Expected ${EXPECTED_FEATURE_COUNT}, got ${dataset.featureCount}.`
    );
}

if (!checks.sourcePass) {
    fail("Unexpected V25.7 source row count.");
}

if (!checks.learningRecordAuditPass) {
    fail("Embedded learning record audit did not pass.");
}

if (!checks.datasetInvalidRowsPass) {
    fail("Embedded datasetInvalidRows is not zero.");
}

if (!checks.datasetDuplicateRowsPass) {
    fail("Embedded datasetDuplicateRows is not zero.");
}

if (!checks.guardPass) {
    fail("V25.10 guard contains an unexpected enabled stage.");
}

const embeddedSha256 =
    String(dataset.sha256 || "");

const canonicalRecordsJson =
    JSON.stringify(records);

const recomputedSha256 =
    sha256(canonicalRecordsJson);

const hashPass =
    embeddedSha256.length === 64 &&
    embeddedSha256 === recomputedSha256;

if (!hashPass) {
    fail(
        "V25.10 dataset SHA-256 does not match the persisted records."
    );
}

let invalidSchemaRows = 0;
let invalidFeatureRows = 0;
let invalidLabelRows = 0;
let duplicateRows = 0;
let timestampOrderViolations = 0;
let sourceIndexOrderViolations = 0;
let sessionDateViolations = 0;
let horizonViolations = 0;
let forbiddenFeatureKeyViolations = 0;
let outOfRangeSourceIndices = 0;

const keys = new Set();

let previousSourceIndex = -1;
let previousTimestamp = -Infinity;

for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (
        !record ||
        !Number.isInteger(Number(record.sourceIndex)) ||
        !finite(record.timestamp) ||
        typeof record.istDate !== "string" ||
        !record.features ||
        !record.label
    ) {
        invalidSchemaRows++;
        continue;
    }

    const sourceIndex =
        Number(record.sourceIndex);

    const timestamp =
        Number(record.timestamp);

    if (
        sourceIndex < 0 ||
        sourceIndex >= 9385
    ) {
        outOfRangeSourceIndices++;
    }

    if (sourceIndex <= previousSourceIndex) {
        sourceIndexOrderViolations++;
    }

    if (timestamp <= previousTimestamp) {
        timestampOrderViolations++;
    }

    previousSourceIndex = sourceIndex;
    previousTimestamp = timestamp;

    const key =
        `${sourceIndex}:${timestamp}`;

    if (keys.has(key)) {
        duplicateRows++;
    }

    keys.add(key);

    const featureKeys =
        Object.keys(record.features);

    if (
        featureKeys.length !==
        EXPECTED_FEATURE_COUNT
    ) {
        invalidSchemaRows++;
    }

    const featureKeySetPass =
        featureKeys.length ===
            EXPECTED_FEATURES.length &&
        EXPECTED_FEATURES.every(
            name =>
                Object.prototype.hasOwnProperty.call(
                    record.features,
                    name
                )
        );

    if (!featureKeySetPass) {
        invalidSchemaRows++;
    }

    for (const name of featureKeys) {
        const lower =
            String(name).toLowerCase();

        if (
            FORBIDDEN_FUTURE_FEATURE_TOKENS.some(
                token =>
                    lower.includes(token)
            )
        ) {
            forbiddenFeatureKeyViolations++;
        }
    }

    for (const name of EXPECTED_FEATURES) {
        if (!finite(record.features[name])) {
            invalidFeatureRows++;
            break;
        }
    }

    const label =
        record.label;

    if (
        !finite(label.futureReturn) ||
        !finite(label.futureMovePoints) ||
        !["UP", "DOWN", "FLAT"].includes(
            label.futureDirection
        )
    ) {
        invalidLabelRows++;
    }

    if (
        Number(label.horizonCandles) !==
            FUTURE_CANDLES ||
        Number(label.horizonSeconds) !==
            EXPECTED_HORIZON_SECONDS
    ) {
        horizonViolations++;
    }

    const derivedISTDate =
        getISTDate(timestamp);

    if (
        !derivedISTDate ||
        derivedISTDate !==
            record.istDate
    ) {
        sessionDateViolations++;
    }
}

const featureOrderPass =
    JSON.stringify(
        Object.keys(records[0]?.features || {})
    ) ===
    JSON.stringify(EXPECTED_FEATURES);

const schemaPass =
    invalidSchemaRows === 0 &&
    invalidFeatureRows === 0 &&
    invalidLabelRows === 0 &&
    forbiddenFeatureKeyViolations === 0;

const orderingPass =
    sourceIndexOrderViolations === 0 &&
    timestampOrderViolations === 0;

const uniquenessPass =
    duplicateRows === 0;

const temporalPass =
    sessionDateViolations === 0 &&
    horizonViolations === 0;

const validationPass =
    Object.values(checks).every(Boolean) &&
    hashPass &&
    schemaPass &&
    featureOrderPass &&
    orderingPass &&
    uniquenessPass &&
    temporalPass &&
    outOfRangeSourceIndices === 0;

const report = {
    success: true,

    version:
        "V25.11-FROZEN-LEARNING-DATASET-VALIDATION",

    status:
        validationPass
            ? "VALIDATION_COMPLETE"
            : "VALIDATION_FAILED",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Immutable V25.10 learning-dataset integrity validation only.",

    input: {
        file: INPUT,
        sourceVersion:
            data.source?.frozenV25Version,
        sourceRows:
            data.source?.sourceRows,
        datasetRows:
            records.length,
        expectedRows:
            EXPECTED_ROWS,
        featureCount:
            dataset.featureCount,
        expectedFeatureCount:
            EXPECTED_FEATURE_COUNT
    },

    integrity: {
        embeddedSha256,
        recomputedSha256,
        sha256Pass: hashPass,
        recordCountPass:
            records.length === EXPECTED_ROWS,
        frozenFlagPass:
            dataset.frozen === true,
        statusPass:
            data.status === "DATASET_FREEZE_COMPLETE",
        sourceRowsPass:
            data.source?.sourceRows === 9385
    },

    schema: {
        expectedFeatures:
            EXPECTED_FEATURES,
        featureOrderPass,
        invalidSchemaRows,
        invalidFeatureRows,
        invalidLabelRows,
        forbiddenFeatureKeyViolations
    },

    temporal: {
        sourceIndexOrderViolations,
        timestampOrderViolations,
        duplicateRows,
        outOfRangeSourceIndices,
        sessionDateViolations,
        horizonViolations,
        horizonCandles:
            FUTURE_CANDLES,
        horizonSeconds:
            EXPECTED_HORIZON_SECONDS
    },

    guard: {
        learningEngineCalled:
            false,
        learningDatasetCalled:
            false,
        candidateDiscovery:
            false,
        validation:
            false,
        oos:
            false,
        strategyModified:
            false,
        realOrders:
            false
    },

    verdict: {
        statusPass:
            checks.statusPass,
        frozenPass:
            checks.frozenPass,
        rowCountPass:
            checks.rowCountPass,
        featureCountPass:
            checks.featureCountPass,
        sourcePass:
            checks.sourcePass,
        learningRecordAuditPass:
            checks.learningRecordAuditPass,
        datasetInvalidRowsPass:
            checks.datasetInvalidRowsPass,
        datasetDuplicateRowsPass:
            checks.datasetDuplicateRowsPass,
        guardPass:
            checks.guardPass,
        hashPass,
        schemaPass,
        featureOrderPass,
        orderingPass,
        uniquenessPass,
        temporalPass,
        validationPass
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
            featureCount: dataset.featureCount,
            hashPass,
            schemaPass,
            featureOrderPass,
            orderingPass,
            uniquenessPass,
            temporalPass,
            validationPass,
            outputFile: OUTPUT_FILE
        },
        null,
        2
    )
);

if (!validationPass) {
    process.exitCode = 1;
}

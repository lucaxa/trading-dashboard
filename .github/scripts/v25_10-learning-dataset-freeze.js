/*
============================================================
TradeMind Pro
V25.10 — LEARNING DATASET MATERIALIZATION & FREEZE
============================================================

PURPOSE
------------------------------------------------------------
Materialize and freeze the audited learning records from the
frozen V25.7 canonical Dhan dataset and the V25.8.2-approved
feature set as an immutable learning dataset before any learning-engine
or candidate-discovery work is allowed.

This layer:
- DOES NOT fetch market data.
- DOES NOT modify V25.7 candles.
- DOES NOT call learning-engine.js.
- DOES NOT call learning-dataset.js.
- DOES NOT discover candidates.
- DOES NOT select a trading threshold or strategy.
- DOES NOT validate a trading strategy.
- DOES NOT perform OOS testing.
- DOES NOT modify strategy.js.
- DOES NOT place orders.

It only diagnoses whether the proposed feature set is:
- numerically valid,
- sufficiently populated,
- non-constant,
- session-safe,
- free of obvious future leakage,
- and diagnostically related to the next 12 five-minute
  candles.

INPUT
------------------------------------------------------------
v25_7_import.json

EXPECTED
------------------------------------------------------------
V25.7 frozen S5 canonicalRows = 9,385.

FEATURES
------------------------------------------------------------
EMA 9
EMA 21
EMA 9 slope
EMA 21 slope
EMA spread
EMA spread / ATR
RSI 14
RSI change
ATR 14
session VWAP
VWAP distance / ATR
close-to-EMA9 / ATR
close-to-EMA21 / ATR
body ratio
upper wick ratio
lower wick ratio
close location
effective-volume ratio

FUTURE HORIZON
------------------------------------------------------------
12 candles = 60 minutes.

Future candles are used ONLY for diagnostic outcomes.
They are never used in feature construction.

============================================================
*/

const fs = require("fs");
const crypto = require("crypto");

const INPUT =
    process.env.INPUT_FILE ||
    "v25_7_import.json";

const OUTPUT_FILE =
    process.env.OUTPUT_FILE ||
    "v25_10_learning_dataset.json";

const MODE =
    process.env.DIAGNOSTIC_MODE ||
    "full";

const CONTROL_ROWS =
    Number(process.env.CONTROL_ROWS || 500);

const FUTURE_CANDLES = 12;
const FIVE_MIN_SECONDS = 300;
const LOOKBACK = 40;
const EPSILON = 1e-12;


// ==========================================================
// HELPERS
// ==========================================================

function finite(value) {
    return Number.isFinite(Number(value));
}

function mean(values) {
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function min(values) {
    return values.length ? Math.min(...values) : null;
}

function max(values) {
    return values.length ? Math.max(...values) : null;
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stddev(values) {
    if (values.length < 2) return 0;
    const m = mean(values);
    const variance =
        values.reduce(
            (sum, x) => sum + Math.pow(x - m, 2),
            0
        ) / values.length;
    return Math.sqrt(variance);
}

function pearson(x, y) {
    if (x.length !== y.length || x.length < 3) {
        return null;
    }

    const mx = mean(x);
    const my = mean(y);

    let numerator = 0;
    let dx = 0;
    let dy = 0;

    for (let i = 0; i < x.length; i++) {
        const ax = x[i] - mx;
        const ay = y[i] - my;
        numerator += ax * ay;
        dx += ax * ax;
        dy += ay * ay;
    }

    const denominator = Math.sqrt(dx * dy);

    if (denominator <= EPSILON) {
        return null;
    }

    return numerator / denominator;
}

function round(value, digits = 6) {
    return Number.isFinite(value)
        ? Number(value.toFixed(digits))
        : null;
}


// ==========================================================
// LOAD FROZEN V25.7 DATASET
// ==========================================================

if (!fs.existsSync(INPUT)) {
    throw new Error(
        `Frozen V25.7 input not found: ${INPUT}`
    );
}

const imported =
    JSON.parse(
        fs.readFileSync(INPUT, "utf8")
    );

if (!Array.isArray(imported.canonicalRows)) {
    throw new Error(
        "V25.7 import does not contain canonicalRows."
    );
}

const sourceRows =
    imported.canonicalRows;

if (sourceRows.length !== 9385 && MODE === "full") {
    throw new Error(
        `Unexpected V25.7 canonical row count: ${sourceRows.length}. Expected 9385.`
    );
}

if (
    imported.status &&
    imported.status !== "IMPORT_COMPLETE"
) {
    throw new Error(
        `V25.7 source status is ${imported.status}, expected IMPORT_COMPLETE.`
    );
}

if (
    imported.mode &&
    imported.mode !== "full_s5" &&
    MODE === "full"
) {
    throw new Error(
        `V25.7 source mode is ${imported.mode}, expected full_s5.`
    );
}

if (
    imported.integrity &&
    imported.integrity.chronological !== true
) {
    throw new Error(
        "V25.7 source failed chronological integrity."
    );
}

if (
    imported.integrity &&
    imported.integrity.duplicateTimestamps !== false
) {
    throw new Error(
        "V25.7 source contains duplicate timestamps."
    );
}

if (
    imported.integrity &&
    imported.integrity.allOHLCValid !== true
) {
    throw new Error(
        "V25.7 source contains invalid OHLC."
    );
}


// ==========================================================
// NORMALIZE — NO DATA REPAIR
// ==========================================================

function normalizeRow(row, index) {
    const timestamp =
        Number(row.ts ?? row.timestamp);

    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    const volume = Number(row.volume);

    if (
        !finite(timestamp) ||
        !finite(open) ||
        !finite(high) ||
        !finite(low) ||
        !finite(close) ||
        !finite(volume)
    ) {
        throw new Error(
            `Non-numeric canonical value at row ${index}.`
        );
    }

    const timestampMs =
        timestamp < 100000000000
            ? timestamp * 1000
            : timestamp;

    return {
        sourceIndex: index,
        timestamp: timestampMs,
        open,
        high,
        low,
        close,
        volume
    };
}

const candles =
    sourceRows
        .map(normalizeRow)
        .sort(
            (a, b) =>
                a.timestamp - b.timestamp
        );


// ==========================================================
// TIMESTAMP / SESSION HELPERS
// ==========================================================

function getISTParts(timestamp) {
    const date =
        new Date(
            timestamp +
            5.5 * 60 * 60 * 1000
        );

    return {
        date:
            date.toISOString().slice(0, 10),
        hour:
            date.getUTCHours(),
        minute:
            date.getUTCMinutes()
    };
}

const prepared =
    candles.map(candle => {
        const ist =
            getISTParts(candle.timestamp);

        return {
            ...candle,
            istDate: ist.date,
            hour: ist.hour,
            minute: ist.minute
        };
    });


// ==========================================================
// INDICATORS
// ==========================================================

function ema(values, period) {
    if (
        !Array.isArray(values) ||
        values.length < period
    ) {
        return null;
    }

    const multiplier =
        2 / (period + 1);

    let value =
        values
            .slice(0, period)
            .reduce(
                (sum, item) =>
                    sum + Number(item),
                0
            ) / period;

    for (
        let i = period;
        i < values.length;
        i++
    ) {
        value =
            (
                (Number(values[i]) - value) *
                multiplier
            ) + value;
    }

    return value;
}

function rsi(values, period = 14) {
    if (
        !Array.isArray(values) ||
        values.length < period + 1
    ) {
        return null;
    }

    let gains = 0;
    let losses = 0;

    for (
        let i = 1;
        i <= period;
        i++
    ) {
        const change =
            Number(values[i]) -
            Number(values[i - 1]);

        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    let averageGain =
        gains / period;

    let averageLoss =
        losses / period;

    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {
        const change =
            Number(values[i]) -
            Number(values[i - 1]);

        const gain =
            Math.max(change, 0);

        const loss =
            Math.max(-change, 0);

        averageGain =
            (
                averageGain * (period - 1) +
                gain
            ) / period;

        averageLoss =
            (
                averageLoss * (period - 1) +
                loss
            ) / period;
    }

    if (averageLoss === 0) {
        return 100;
    }

    const rs =
        averageGain /
        averageLoss;

    return (
        100 -
        100 / (1 + rs)
    );
}

function atr(history, period = 14) {
    if (
        !Array.isArray(history) ||
        history.length < period + 1
    ) {
        return null;
    }

    const ranges = [];

    for (
        let i = 1;
        i < history.length;
        i++
    ) {
        const current =
            history[i];

        const previous =
            history[i - 1];

        const trueRange =
            Math.max(
                current.high -
                    current.low,

                Math.abs(
                    current.high -
                    previous.close
                ),

                Math.abs(
                    current.low -
                    previous.close
                )
            );

        if (finite(trueRange)) {
            ranges.push(trueRange);
        }
    }

    if (ranges.length < period) {
        return null;
    }

    let value =
        ranges
            .slice(0, period)
            .reduce(
                (sum, item) =>
                    sum + item,
                0
            ) / period;

    for (
        let i = period;
        i < ranges.length;
        i++
    ) {
        value =
            (
                value * (period - 1) +
                ranges[i]
            ) / period;
    }

    return value;
}

function sessionVWAP(history) {
    if (!history.length) {
        return null;
    }

    const sessionDate =
        history[
            history.length - 1
        ].istDate;

    let totalPV = 0;
    let totalVolume = 0;

    for (const candle of history) {
        if (
            candle.istDate !==
            sessionDate
        ) {
            continue;
        }

        const typicalPrice =
            (
                candle.high +
                candle.low +
                candle.close
            ) / 3;

        const effectiveVolume =
            Math.max(
                0,
                Number(candle.volume)
            );

        if (
            !finite(typicalPrice) ||
            !finite(effectiveVolume)
        ) {
            continue;
        }

        totalPV +=
            typicalPrice *
            effectiveVolume;

        totalVolume +=
            effectiveVolume;
    }

    if (totalVolume <= 0) {
        return null;
    }

    return (
        totalPV /
        totalVolume
    );
}


// ==========================================================
// FUTURE WINDOW GATE
// ==========================================================

function validFutureWindow(index) {
    const current =
        prepared[index];

    if (!current) {
        return false;
    }

    for (
        let j = 1;
        j <= FUTURE_CANDLES;
        j++
    ) {
        const future =
            prepared[index + j];

        if (!future) {
            return false;
        }

        if (
            future.istDate !==
            current.istDate
        ) {
            return false;
        }

        const previous =
            prepared[index + j - 1];

        const diff =
            (
                future.timestamp -
                previous.timestamp
            ) / 1000;

        if (
            diff !==
            FIVE_MIN_SECONDS
        ) {
            return false;
        }
    }

    return true;
}


// ==========================================================
// FEATURE CONSTRUCTION
// ==========================================================

function buildFeatures(index) {
    const current =
        prepared[index];

    const history =
        prepared.slice(
            0,
            index + 1
        );

    const closes =
        history.map(
            candle => candle.close
        );

    const previousCloses =
        closes.slice(0, -1);

    const ema9 =
        ema(closes, 9);

    const ema21 =
        ema(closes, 21);

    const previousEMA9 =
        ema(previousCloses, 9);

    const previousEMA21 =
        ema(previousCloses, 21);

    const rsi14 =
        rsi(closes, 14);

    const previousRSI =
        rsi(previousCloses, 14);

    const atr14 =
        atr(history, 14);

    const vwap =
        sessionVWAP(history);

    if (
        !finite(ema9) ||
        !finite(ema21) ||
        !finite(previousEMA9) ||
        !finite(previousEMA21) ||
        !finite(rsi14) ||
        !finite(previousRSI) ||
        !finite(atr14) ||
        !finite(vwap) ||
        atr14 <= 0
    ) {
        return null;
    }

    const range =
        current.high -
        current.low;

    const body =
        Math.abs(
            current.close -
            current.open
        );

    const upperWick =
        current.high -
        Math.max(
            current.open,
            current.close
        );

    const lowerWick =
        Math.min(
            current.open,
            current.close
        ) -
        current.low;

    const bodyRatio =
        range > 0
            ? body / range
            : 0;

    const upperWickRatio =
        range > 0
            ? upperWick / range
            : 0;

    const lowerWickRatio =
        range > 0
            ? lowerWick / range
            : 0;

    const closeLocation =
        range > 0
            ? (
                current.close -
                current.low
            ) / range
            : 0.5;

    const effectiveVolume =
        Math.max(
            0,
            current.volume
        );

    const previousVolume =
        index > 0
            ? Math.max(
                0,
                prepared[index - 1].volume
            )
            : 0;

    const ema9Slope =
        ema9 -
        previousEMA9;

    const ema21Slope =
        ema21 -
        previousEMA21;

    const emaSpread =
        ema9 -
        ema21;

    const emaSpreadATR =
        emaSpread /
        atr14;

    const ema9SlopeATR =
        ema9Slope /
        atr14;

    const ema21SlopeATR =
        ema21Slope /
        atr14;

    const rsiChange =
        rsi14 -
        previousRSI;

    const vwapDistance =
        current.close -
        vwap;

    const vwapDistanceATR =
        vwapDistance /
        atr14;

    const ema9DistanceATR =
        (
            current.close -
            ema9
        ) / atr14;

    const ema21DistanceATR =
        (
            current.close -
            ema21
        ) / atr14;

    return {
        ema9,
        ema21,
        ema9Slope,
        ema21Slope,
        emaSpread,
        emaSpreadATR,
        ema9SlopeATR,
        ema21SlopeATR,
        rsi14,
        rsiChange,
        atr14,
        vwap,
        vwapDistanceATR,
        ema9DistanceATR,
        ema21DistanceATR,
        bodyRatio,
        upperWickRatio,
        lowerWickRatio,
        closeLocation
    };
}


// ==========================================================
// FUTURE DIAGNOSTIC OUTCOME
// ==========================================================

function buildOutcome(index) {
    const current =
        prepared[index];

    const future =
        prepared[
            index +
            FUTURE_CANDLES
        ];

    if (!future) {
        return null;
    }

    const futureReturn =
        (
            future.close -
            current.close
        ) / current.close;

    const futureMovePoints =
        future.close -
        current.close;

    return {
        futureReturn,
        futureMovePoints,
        futureDirection:
            futureMovePoints > 0
                ? "UP"
                : futureMovePoints < 0
                    ? "DOWN"
                    : "FLAT"
    };
}


// ==========================================================
// FEATURE DATA COLLECTION
// ==========================================================

const featureNames = [
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

const selectedCandles =
    MODE === "control"
        ? prepared.slice(
            0,
            Math.min(
                CONTROL_ROWS,
                prepared.length
            )
        )
        : prepared;

const featureRows = [];

const skipped = {
    insufficientLookback: 0,
    futureSessionBoundary: 0,
    invalidFeatureState: 0
};

for (
    let i = 0;
    i < selectedCandles.length;
    i++
) {
    const globalIndex =
        MODE === "control"
            ? i
            : i;

    if (globalIndex < LOOKBACK) {
        skipped.insufficientLookback++;
        continue;
    }

    if (
        !validFutureWindow(globalIndex)
    ) {
        skipped.futureSessionBoundary++;
        continue;
    }

    const features =
        buildFeatures(globalIndex);

    if (!features) {
        skipped.invalidFeatureState++;
        continue;
    }

    const outcome =
        buildOutcome(globalIndex);

    if (!outcome) {
        skipped.futureSessionBoundary++;
        continue;
    }

    featureRows.push({
        index: globalIndex,
        timestamp:
            prepared[globalIndex].timestamp,
        istDate:
            prepared[globalIndex].istDate,
        ...features,
        ...outcome
    });
}


// ==========================================================
// LEARNING RECORD CONSTRUCTION AUDIT
// ==========================================================
//
// A learning record is ONLY a frozen-time feature vector plus
// a future outcome label already permitted by the V25.8.2
// diagnostic policy.
//
// No score, threshold, trade direction rule, entry rule,
// exit rule, candidate rule, or strategy decision is created.

const learningFeatureNames = [...featureNames];

const learningRecords = [];
const recordAudit = {
    attempted: featureRows.length,
    generated: 0,
    invalidFeatureVectorRows: 0,
    invalidLabelRows: 0,
    timestampMismatchRows: 0,
    sessionMismatchRows: 0,
    duplicateRecordRows: 0,
    sourceIndexMismatchRows: 0
};

const recordKeys = new Set();

for (const row of featureRows) {
    const featureVector = {};

    let featureVectorValid = true;

    for (const name of learningFeatureNames) {
        const value = Number(row[name]);

        if (!Number.isFinite(value)) {
            featureVectorValid = false;
            break;
        }

        featureVector[name] = value;
    }

    if (!featureVectorValid) {
        recordAudit.invalidFeatureVectorRows++;
        continue;
    }

    const labelValid =
        Number.isFinite(Number(row.futureReturn)) &&
        Number.isFinite(Number(row.futureMovePoints)) &&
        ["UP", "DOWN", "FLAT"].includes(row.futureDirection);

    if (!labelValid) {
        recordAudit.invalidLabelRows++;
        continue;
    }

    const sourceIndex = Number(row.index);
    const futureIndex =
        sourceIndex + FUTURE_CANDLES;

    const current = prepared[sourceIndex];
    const future = prepared[futureIndex];

    if (!current || !future) {
        recordAudit.timestampMismatchRows++;
        continue;
    }

    if (Number(row.timestamp) !== Number(current.timestamp)) {
        recordAudit.timestampMismatchRows++;
        continue;
    }

    if (row.istDate !== current.istDate) {
        recordAudit.sessionMismatchRows++;
        continue;
    }

    if (future.istDate !== current.istDate) {
        recordAudit.sessionMismatchRows++;
        continue;
    }

    const key = `${sourceIndex}:${current.timestamp}`;

    if (recordKeys.has(key)) {
        recordAudit.duplicateRecordRows++;
        continue;
    }

    recordKeys.add(key);

    learningRecords.push({
        sourceIndex,
        timestamp: current.timestamp,
        istDate: current.istDate,
        features: featureVector,
        label: {
            futureReturn: Number(row.futureReturn),
            futureMovePoints: Number(row.futureMovePoints),
            futureDirection: row.futureDirection,
            horizonCandles: FUTURE_CANDLES,
            horizonSeconds:
                FUTURE_CANDLES * FIVE_MIN_SECONDS
        }
    });
}

recordAudit.generated = learningRecords.length;

// ==========================================================
// LEARNING DATASET MATERIALIZATION AUDIT
// ==========================================================

const expectedFeatureCount = learningFeatureNames.length;
const datasetRows = learningRecords.length;

const datasetKeys = new Set();
let datasetInvalidRows = 0;
let datasetDuplicateRows = 0;

for (const record of learningRecords) {
    if (
        !Number.isInteger(Number(record.sourceIndex)) ||
        !finite(record.timestamp) ||
        typeof record.istDate !== "string" ||
        !record.features ||
        Object.keys(record.features).length !== expectedFeatureCount ||
        !record.label ||
        !finite(record.label.futureReturn) ||
        !finite(record.label.futureMovePoints) ||
        !["UP", "DOWN", "FLAT"].includes(record.label.futureDirection)
    ) {
        datasetInvalidRows++;
        continue;
    }

    for (const name of learningFeatureNames) {
        if (!finite(record.features[name])) {
            datasetInvalidRows++;
            break;
        }
    }

    const key = `${record.sourceIndex}:${record.timestamp}`;
    if (datasetKeys.has(key)) {
        datasetDuplicateRows++;
    }
    datasetKeys.add(key);
}

const datasetCanonicalJson =
    JSON.stringify(learningRecords);

const datasetSha256 =
    crypto
        .createHash("sha256")
        .update(datasetCanonicalJson, "utf8")
        .digest("hex");

const learningDatasetPass =
    learningRecordAuditPass &&
    datasetRows === recordAudit.attempted &&
    datasetInvalidRows === 0 &&
    datasetDuplicateRows === 0 &&
    expectedFeatureCount === 19;


const learningRecordAuditPass =
    recordAudit.generated === recordAudit.attempted &&
    recordAudit.invalidFeatureVectorRows === 0 &&
    recordAudit.invalidLabelRows === 0 &&
    recordAudit.timestampMismatchRows === 0 &&
    recordAudit.sessionMismatchRows === 0 &&
    recordAudit.duplicateRecordRows === 0 &&
    recordAudit.sourceIndexMismatchRows === 0;

// ==========================================================
// FEATURE QUALITY DIAGNOSTICS
// ==========================================================

const featureDiagnostics = {};

for (const name of featureNames) {
    const values =
        featureRows
            .map(row => Number(row[name]))
            .filter(Number.isFinite);

    const unique =
        new Set(
            values.map(
                value =>
                    value.toPrecision(12)
            )
        ).size;

    featureDiagnostics[name] = {
        count: values.length,
        missing:
            featureRows.length -
            values.length,
        min:
            round(min(values)),
        max:
            round(max(values)),
        mean:
            round(mean(values)),
        median:
            round(median(values)),
        stddev:
            round(stddev(values)),
        uniqueValues:
            unique,
        constant:
            unique <= 1
    };
}


// ==========================================================
// FEATURE / FUTURE-RETURN DIAGNOSTICS
// ==========================================================

const outcomeDiagnostics = {};

for (const name of featureNames) {
    const pairs =
        featureRows.filter(
            row =>
                finite(row[name]) &&
                finite(row.futureReturn)
        );

    const x =
        pairs.map(
            row => Number(row[name])
        );

    const y =
        pairs.map(
            row => Number(row.futureReturn)
        );

    const positive =
        pairs.filter(
            row =>
                row.futureReturn > 0
        );

    const negative =
        pairs.filter(
            row =>
                row.futureReturn < 0
        );

    outcomeDiagnostics[name] = {
        observations:
            pairs.length,

        pearsonCorrelation:
            round(
                pearson(x, y),
                8
            ),

        meanFutureReturnWhenPositive:
            round(
                mean(
                    positive.map(
                        row =>
                            row.futureReturn
                    )
                ),
                8
            ),

        meanFutureReturnWhenNegative:
            round(
                mean(
                    negative.map(
                        row =>
                            row.futureReturn
                    )
                ),
                8
            )
    };
}


// ==========================================================
// SESSION / TEMPORAL DIAGNOSTICS
// ==========================================================

const sessionCounts = {};

for (const row of featureRows) {
    sessionCounts[row.istDate] =
        (sessionCounts[row.istDate] || 0) + 1;
}

const sessionSizes =
    Object.values(sessionCounts);

const futureDirectionCounts = {
    UP: featureRows.filter(
        row => row.futureDirection === "UP"
    ).length,

    DOWN: featureRows.filter(
        row => row.futureDirection === "DOWN"
    ).length,

    FLAT: featureRows.filter(
        row => row.futureDirection === "FLAT"
    ).length
};


// ==========================================================
// LEAKAGE / INTEGRITY DIAGNOSTICS
// ==========================================================

let futureSpacingViolations = 0;
let futureSessionCrossings = 0;

for (const row of featureRows) {
    const index = row.index;
    const current =
        prepared[index];

    for (
        let j = 1;
        j <= FUTURE_CANDLES;
        j++
    ) {
        const future =
            prepared[index + j];

        const previous =
            prepared[index + j - 1];

        if (!future || !previous) {
            futureSpacingViolations++;
            continue;
        }

        const diff =
            (
                future.timestamp -
                previous.timestamp
            ) / 1000;

        if (
            diff !==
            FIVE_MIN_SECONDS
        ) {
            futureSpacingViolations++;
        }

        if (
            future.istDate !==
            current.istDate
        ) {
            futureSessionCrossings++;
        }
    }
}


// ==========================================================
// VERDICT
// ==========================================================

const constantFeatures =
    featureNames.filter(
        name =>
            featureDiagnostics[name].constant
    );

const missingFeatureValues =
    featureNames.filter(
        name =>
            featureDiagnostics[name].missing > 0
    );

const featureDiagnosticPass =
    featureRows.length > 0 &&
    constantFeatures.length === 0 &&
    futureSpacingViolations === 0 &&
    futureSessionCrossings === 0;

const report = {
    success: true,

    featurePolicy: {
        excludedConstantFeatures: [
            "volumeRatio"
        ],
        reason:
            "V25.8.1 found volumeRatio constant on the frozen V25.7 NIFTY INDEX dataset; it is excluded without modifying candles or relaxing the constant-feature gate.",
        policyChangeOnly: true
    },

    version:
        "V25.10-LEARNING-DATASET-FREEZE",

    status:
        learningDatasetPass
            ? "DATASET_FREEZE_COMPLETE"
            : "DATASET_FREEZE_FAILED",

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    purpose:
        "Feature quality and leakage diagnostic only.",

    source: {
        provider:
            imported.source?.provider || "Dhan",

        frozenV25Version:
            imported.version ||
            "V25.7-GITHUB-ACTIONS-IMPORT-v2",

        inputFile:
            INPUT,

        sourceRows:
            sourceRows.length,

        selectedRows:
            selectedCandles.length,

        canonicalRows:
            imported.counts?.canonicalRows ??
            sourceRows.length
    },

    policy: {
        sourceIsFrozen: true,
        ohlcUnchanged: true,
        negativeVolumeRetained: true,
        negativeVolumeVWAP:
            "CLAMP_TO_ZERO",
        timestampRepair: false,
        candleRepair: false,
        syntheticCandles: false,
        futureHorizonCandles:
            FUTURE_CANDLES,
        futureHorizonSeconds:
            FUTURE_CANDLES *
            FIVE_MIN_SECONDS,
        futureSessionCrossing:
            "REJECT",
        candidateDiscovery: false,
        validation: false,
        oos: false,
        strategyModified: false,
        realOrders: false
    },

    inputIntegrity: {
        importedStatus:
            imported.status,
        importedMode:
            imported.mode,
        chronological:
            imported.integrity?.chronological,
        duplicateTimestamps:
            imported.integrity?.duplicateTimestamps,
        allOHLCValid:
            imported.integrity?.allOHLCValid
    },

    processing: {
        mode:
            MODE,
        controlRows:
            MODE === "control"
                ? CONTROL_ROWS
                : null,
        lookbackCandles:
            LOOKBACK,
        selectedRows:
            selectedCandles.length,
        diagnosticRows:
            featureRows.length,
        skippedRows:
            selectedCandles.length -
            featureRows.length,
        skipped
    },

    featureDiagnostics,

    outcomeDiagnostics,

    temporalDiagnostics: {
        sessionCount:
            sessionSizes.length,

        minimumDiagnosticRowsPerSession:
            sessionSizes.length
                ? Math.min(...sessionSizes)
                : 0,

        maximumDiagnosticRowsPerSession:
            sessionSizes.length
                ? Math.max(...sessionSizes)
                : 0,

        meanDiagnosticRowsPerSession:
            round(
                mean(sessionSizes)
            ),

        futureDirectionCounts
    },

    learningDataset: {
        frozen: learningDatasetPass,
        rowCount: datasetRows,
        featureCount: expectedFeatureCount,
        sha256: datasetSha256,
        records: learningRecords
    },

    learningRecordAudit: {
        learningRecordAuditPass,
        featureNames: learningFeatureNames,
        recordCount: learningRecords.length,
        audit: recordAudit,
        labelPolicy: {
            target: "futureReturn",
            auxiliaryLabel: "futureDirection",
            horizonCandles: FUTURE_CANDLES,
            horizonSeconds: FUTURE_CANDLES * FIVE_MIN_SECONDS,
            noTradingThreshold: true,
            noStrategyDecision: true
        },
        recordsPersisted: learningDatasetPass,
        datasetMaterialized: true,
        datasetRowCount: datasetRows,
        datasetInvalidRows,
        datasetDuplicateRows,
        datasetSha256,
        learningEngineCalled: false,
        sampleRecords:
            learningRecords.slice(0, 3)
    },

    leakageAudit: {
        featureConstructionUsesFutureData:
            false,

        futureSpacingViolations,
        futureSessionCrossings,

        futureWindowRule:
            "12 future candles, exactly 300 seconds apart, same IST date",

        leakageGate:
            futureSpacingViolations === 0 &&
            futureSessionCrossings === 0
                ? "PASS"
                : "FAIL"
    },

    verdict: {
        featureDiagnosticPass,
        learningRecordAuditPass,

        constantFeatures,

        featuresWithMissingValues:
            missingFeatureValues,

        featureRowsGenerated:
            featureRows.length,

        learningRecordsGenerated:
            learningRecords.length,

        diagnosticOnly:
            true,

        learningRecordsGenerated:
            learningDatasetPass,

        learningDatasetFrozen:
            learningDatasetPass,

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

    guard: {
        learningRecordsGenerated: learningDatasetPass,
        learningDatasetFrozen: learningDatasetPass,
        learningEngineCalled: false,
        learningDatasetCalled: false,
        candidateDiscovery: false,
        validation: false,
        oos: false,
        strategyModified: false,
        realOrders: false
    }
};


// ==========================================================
// WRITE OUTPUT
// ==========================================================

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

            mode:
                MODE,

            sourceRows:
                sourceRows.length,

            diagnosticRows:
                featureRows.length,

            skippedRows:
                report.processing.skippedRows,

            constantFeatures:
                constantFeatures,

            missingFeatureValues:
                missingFeatureValues,

            futureSpacingViolations,
            futureSessionCrossings,

            leakageGate:
                report.leakageAudit.leakageGate,

            featureDiagnosticPass,
            learningRecordAuditPass,
            learningDatasetPass,
            learningRecordsGenerated:
                learningRecords.length,
            datasetSha256,

            outputFile:
                OUTPUT_FILE
        },
        null,
        2
    )
);

if (!featureDiagnosticPass || !learningRecordAuditPass || !learningDatasetPass) {
    process.exitCode = 1;
}

/*
============================================================
TradeMind Pro
V25.8 — CONTROLLED LEARNING-DATA HANDOFF
============================================================

PURPOSE
------------------------------------------------------------
Consume the FROZEN V25.7 canonical Dhan dataset.

This layer does NOT fetch market data.
This layer does NOT modify V25.7 data.
This layer does NOT call learning-engine.js.
This layer does NOT call learning-dataset.js.
This layer does NOT perform candidate discovery,
validation, OOS testing, strategy modification, or orders.

INPUT
------------------------------------------------------------
data/v25_7_import.json

EXPECTED INPUT
------------------------------------------------------------
V25.7 canonicalRows
9,385 candles for the completed S5 import.

MODE
------------------------------------------------------------
CONTROL:
    Process only the first controlled slice.

FULL:
    Process the complete canonical dataset.

IMPORTANT POLICY
------------------------------------------------------------
- V25.7 canonical candles remain authoritative.
- OHLC is unchanged.
- Negative volume is retained.
- For VWAP feature calculation only:
      effectiveVolume = Math.max(0, volume)
- No timestamp repair.
- No synthetic candles.
- A learning row is rejected if its 12-candle
  future horizon crosses a market-session/data gap.
- Future candles must be exactly 300 seconds apart.
- Future candles must remain on the same IST trading date.
- This is LEARNING DATA ONLY.

============================================================
*/

const fs = require("fs");

const INPUT =
    process.env.INPUT_FILE ||
    "data/v25_7_import.json";

const MODE =
    process.env.HANDOFF_MODE ||
    "control";

const CONTROL_ROWS =
    Number(process.env.CONTROL_ROWS || 500);

const FUTURE_CANDLES = 12;
const FIVE_MIN_SECONDS = 300;


// ==========================================================
// LOAD V25.7 CANONICAL DATA
// ==========================================================

if (!fs.existsSync(INPUT)) {
    throw new Error(`Input file not found: ${INPUT}`);
}

const imported = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

if (!Array.isArray(imported.canonicalRows)) {
    throw new Error(
        "V25.7 import does not contain canonicalRows."
    );
}

const sourceRows =
    imported.canonicalRows;


// ==========================================================
// V25.7 SOURCE INTEGRITY GATE
// ==========================================================

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
// NORMALIZE ONLY — NO DATA REPAIR
// ==========================================================

function normalizeRow(row) {

    const timestamp =
        Number(row.ts ?? row.timestamp);

    const open =
        Number(row.open);

    const high =
        Number(row.high);

    const low =
        Number(row.low);

    const close =
        Number(row.close);

    const volume =
        Number(row.volume);

    if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !Number.isFinite(volume)
    ) {
        throw new Error(
            "Canonical row contains a non-numeric value."
        );
    }

    /*
    V25.7 Dhan timestamps are expected to be
    Unix seconds. Convert once to milliseconds.
    If already milliseconds, retain them.
    */
    const timestampMs =
        timestamp < 100000000000
            ? timestamp * 1000
            : timestamp;

    return {
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
                a.timestamp -
                b.timestamp
        );


// ==========================================================
// OPTIONAL CONTROL SLICE
// ==========================================================

const selectedCandles =
    MODE === "control"
        ? candles.slice(
            0,
            Math.min(
                CONTROL_ROWS,
                candles.length
            )
        )
        : candles;


// ==========================================================
// IST HELPERS
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


// ==========================================================
// EMA
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

        const current =
            Number(values[i]);

        value =
            (
                (current - value) *
                multiplier
            ) + value;
    }

    return value;
}


// ==========================================================
// RSI
// ==========================================================

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
                averageGain *
                (period - 1) +
                gain
            ) / period;

        averageLoss =
            (
                averageLoss *
                (period - 1) +
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


// ==========================================================
// ATR
// ==========================================================

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

        if (
            Number.isFinite(trueRange)
        ) {
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


// ==========================================================
// SESSION VWAP
// ==========================================================

function sessionVWAP(history) {

    if (history.length === 0) {
        return null;
    }

    const latest =
        history[
            history.length - 1
        ];

    const sessionDate =
        latest.istDate;

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

        /*
        V25.7 policy:
        negative volume is retained in the
        canonical dataset.

        Production VWAP behavior:
        negative volume contributes zero.
        */
        const effectiveVolume =
            Math.max(
                0,
                Number(candle.volume)
            );

        if (
            !Number.isFinite(
                typicalPrice
            ) ||
            !Number.isFinite(
                effectiveVolume
            )
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
// SESSION / FUTURE-HORIZON VALIDATION
// ==========================================================

function validFutureWindow(
    candles,
    index
) {

    const current =
        candles[index];

    const currentDate =
        current.istDate;

    for (
        let j = 1;
        j <= FUTURE_CANDLES;
        j++
    ) {

        const future =
            candles[index + j];

        if (!future) {
            return false;
        }

        if (
            future.istDate !==
            currentDate
        ) {
            return false;
        }

        const previous =
            candles[index + j - 1];

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
// PREPARE CANDLES
// ==========================================================

const prepared =
    selectedCandles.map(candle => {

        const ist =
            getISTParts(
                candle.timestamp
            );

        return {
            ...candle,
            istDate: ist.date,
            hour: ist.hour,
            minute: ist.minute
        };
    });


// ==========================================================
// LEARNING DATA
// ==========================================================

const rows = [];

const skipped = {
    insufficientLookback: 0,
    invalidFeatureState: 0,
    futureSessionBoundary: 0
};

const LOOKBACK = 40;

for (
    let i = LOOKBACK;
    i <
        prepared.length -
        FUTURE_CANDLES;
    i++
) {

    const current =
        prepared[i];

    /*
    Do not create a label if the next 12
    candles cross a session/data boundary.
    */
    if (
        !validFutureWindow(
            prepared,
            i
        )
    ) {

        skipped.futureSessionBoundary++;
        continue;
    }

    const history =
        prepared.slice(
            0,
            i + 1
        );

    const closes =
        history.map(
            candle =>
                candle.close
        );

    const ema9 =
        ema(closes, 9);

    const ema21 =
        ema(closes, 21);

    const previousCloses =
        closes.slice(0, -1);

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
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(previousEMA9) ||
        !Number.isFinite(previousEMA21) ||
        !Number.isFinite(rsi14) ||
        !Number.isFinite(previousRSI) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwap) ||
        atr14 <= 0
    ) {

        skipped.invalidFeatureState++;
        continue;
    }

    const ema9Slope =
        ema9 - previousEMA9;

    const ema21Slope =
        ema21 - previousEMA21;

    const emaSpread =
        ema9 - ema21;

    const emaSpreadATR =
        emaSpread / atr14;

    const ema9SlopeATR =
        ema9Slope / atr14;

    const ema21SlopeATR =
        ema21Slope / atr14;

    const rsiChange =
        rsi14 - previousRSI;

    const vwapDistance =
        current.close - vwap;

    const vwapDistanceATR =
        vwapDistance / atr14;

    const ema9Distance =
        current.close - ema9;

    const ema9DistanceATR =
        ema9Distance / atr14;

    const ema21Distance =
        current.close - ema21;

    const ema21DistanceATR =
        ema21Distance / atr14;

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

    const rangeATR =
        range / atr14;

    const bullish =
        current.close >
        current.open;

    const bearish =
        current.close <
        current.open;

    let trend = "SIDEWAYS";

    if (
        ema9 > ema21 &&
        ema9Slope > 0 &&
        ema21Slope >= 0
    ) {
        trend = "BULLISH";
    }

    if (
        ema9 < ema21 &&
        ema9Slope < 0 &&
        ema21Slope <= 0
    ) {
        trend = "BEARISH";
    }

    let regime = "RANGING";

    const spreadStrength =
        Math.abs(
            emaSpreadATR
        );

    const slopeStrength =
        Math.max(
            Math.abs(
                ema9SlopeATR
            ),
            Math.abs(
                ema21SlopeATR
            )
        );

    if (
        spreadStrength >= 0.80 &&
        slopeStrength >= 0.15
    ) {
        regime = "TRENDING";
    } else if (
        spreadStrength >= 0.40
    ) {
        regime = "TRANSITION";
    }

    const hour =
        current.hour;

    const minute =
        current.minute;

    const minutesFromOpen =
        (
            hour * 60 +
            minute
        ) -
        (9 * 60 + 15);

    const future =
        prepared.slice(
            i + 1,
            i + 1 + FUTURE_CANDLES
        );

    const entry =
        current.close;

    const risk =
        atr14;

    const reward =
        atr14 * 2;

    const buyStop =
        entry - risk;

    const buyTarget =
        entry + reward;

    const sellStop =
        entry + risk;

    const sellTarget =
        entry - reward;

    let buyOutcome =
        "TIMEOUT";

    let sellOutcome =
        "TIMEOUT";

    let maxFavorableBuy = 0;
    let maxAdverseBuy = 0;
    let maxFavorableSell = 0;
    let maxAdverseSell = 0;

    for (
        const futureCandle
        of future
    ) {

        maxFavorableBuy =
            Math.max(
                maxFavorableBuy,
                futureCandle.high -
                    entry
            );

        maxAdverseBuy =
            Math.max(
                maxAdverseBuy,
                entry -
                    futureCandle.low
            );

        maxFavorableSell =
            Math.max(
                maxFavorableSell,
                entry -
                    futureCandle.low
            );

        maxAdverseSell =
            Math.max(
                maxAdverseSell,
                futureCandle.high -
                    entry
            );

        if (
            buyOutcome ===
            "TIMEOUT"
        ) {

            const hitStop =
                futureCandle.low <=
                buyStop;

            const hitTarget =
                futureCandle.high >=
                buyTarget;

            if (
                hitStop &&
                hitTarget
            ) {
                buyOutcome = "LOSS";
            } else if (hitStop) {
                buyOutcome = "LOSS";
            } else if (hitTarget) {
                buyOutcome = "WIN";
            }
        }

        if (
            sellOutcome ===
            "TIMEOUT"
        ) {

            const hitStop =
                futureCandle.high >=
                sellStop;

            const hitTarget =
                futureCandle.low <=
                sellTarget;

            if (
                hitStop &&
                hitTarget
            ) {
                sellOutcome = "LOSS";
            } else if (hitStop) {
                sellOutcome = "LOSS";
            } else if (hitTarget) {
                sellOutcome = "WIN";
            }
        }
    }

    let preferredDirection =
        "NONE";

    let label =
        "NO_TRADE";

    const buyWin =
        buyOutcome === "WIN";

    const sellWin =
        sellOutcome === "WIN";

    const buyLoss =
        buyOutcome === "LOSS";

    const sellLoss =
        sellOutcome === "LOSS";

    if (buyWin && !sellWin) {
        preferredDirection = "BUY";
        label = "BUY_WIN";
    } else if (
        sellWin &&
        !buyWin
    ) {
        preferredDirection = "SELL";
        label = "SELL_WIN";
    } else if (
        buyWin &&
        sellWin
    ) {
        label = "BOTH_WIN";
    } else if (
        buyLoss &&
        sellLoss
    ) {
        label = "BOTH_LOSS";
    }

    rows.push({

        timestamp:
            current.timestamp,

        date:
            current.istDate,

        open:
            current.open,

        high:
            current.high,

        low:
            current.low,

        close:
            current.close,

        volume:
            current.volume,

        ema9,
        ema21,
        emaSpread,
        emaSpreadATR,
        ema9Slope,
        ema21Slope,
        ema9SlopeATR,
        ema21SlopeATR,

        rsi14,
        previousRSI,
        rsiChange,

        atr14,

        vwap,
        vwapDistance,
        vwapDistanceATR,

        ema9Distance,
        ema9DistanceATR,

        ema21Distance,
        ema21DistanceATR,

        range,
        rangeATR,
        body,
        bodyRatio,
        upperWick,
        lowerWick,
        upperWickRatio,
        lowerWickRatio,
        closeLocation,

        bullish,
        bearish,

        trend,
        regime,

        hour,
        minute,
        minutesFromOpen,

        outcome: {

            entryTimestamp:
                current.timestamp,

            entry,
            risk,
            reward,

            buyStop,
            buyTarget,

            sellStop,
            sellTarget,

            buyOutcome,
            sellOutcome,

            preferredDirection,
            label,

            maxFavorableBuy,
            maxAdverseBuy,

            maxFavorableSell,
            maxAdverseSell,

            futureCandles:
                future.length,

            outcomeTimestamp:
                future[
                    future.length - 1
                ].timestamp
        }
    });
}


// ==========================================================
// STATISTICS
// ==========================================================

function countLabel(label) {

    return rows.filter(
        row =>
            row.outcome.label ===
            label
    ).length;
}

function countOutcome(
    direction,
    outcome
) {

    const key =
        direction === "BUY"
            ? "buyOutcome"
            : "sellOutcome";

    return rows.filter(
        row =>
            row.outcome[key] ===
            outcome
    ).length;
}

const buyWins =
    countOutcome("BUY", "WIN");

const buyLosses =
    countOutcome("BUY", "LOSS");

const buyTimeouts =
    countOutcome("BUY", "TIMEOUT");

const sellWins =
    countOutcome("SELL", "WIN");

const sellLosses =
    countOutcome("SELL", "LOSS");

const sellTimeouts =
    countOutcome("SELL", "TIMEOUT");

const buyDecisiveTrades =
    buyWins + buyLosses;

const sellDecisiveTrades =
    sellWins + sellLosses;

const report = {

    success: true,

    version:
        "V25.8-CONTROLLED-LEARNING-HANDOFF",

    status:
        "COMPLETED",

    mode: MODE,

    paperOnly: true,
    realOrders: false,
    brokerOrderEnabled: false,
    brokerOrderSent: false,

    source: {
        provider: "Dhan",
        sourceArtifact: INPUT,
        sourceVersion:
            imported.version,
        sourceCanonicalRows:
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
        sessionCrossingFutureWindows:
            "REJECT"
    },

    input: {
        sourceRows:
            sourceRows.length,

        selectedRows:
            selectedCandles.length,

        mode:
            MODE,

        controlRows:
            MODE === "control"
                ? CONTROL_ROWS
                : null
    },

    output: {
        learningRows:
            rows.length,

        skippedRows:
            selectedCandles.length -
            rows.length,

        skipped
    },

    datasetStatistics: {

        totalRows:
            rows.length,

        BUY_WIN:
            countLabel("BUY_WIN"),

        SELL_WIN:
            countLabel("SELL_WIN"),

        BOTH_WIN:
            countLabel("BOTH_WIN"),

        BOTH_LOSS:
            countLabel("BOTH_LOSS"),

        NO_TRADE:
            countLabel("NO_TRADE"),

        buyWins,
        buyLosses,
        buyTimeouts,

        sellWins,
        sellLosses,
        sellTimeouts,

        buyDecisiveTrades,
        sellDecisiveTrades,

        buyWinRate:
            buyDecisiveTrades > 0
                ? buyWins /
                    buyDecisiveTrades *
                    100
                : 0,

        sellWinRate:
            sellDecisiveTrades > 0
                ? sellWins /
                    sellDecisiveTrades *
                    100
                : 0
    },

    guard: {
        learningEngineCalled: false,
        learningDatasetCalled: false,
        candidateDiscovery: false,
        validation: false,
        oos: false,
        strategyModified: false,
        realOrders: false
    },

    rows
};


// ==========================================================
// WRITE OUTPUT
// ==========================================================

const outputFile =
    process.env.OUTPUT_FILE ||
    "v25_8_learning_handoff.json";

fs.writeFileSync(
    outputFile,
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
                report.mode,

            sourceRows:
                report.input.sourceRows,

            selectedRows:
                report.input.selectedRows,

            learningRows:
                report.output.learningRows,

            skippedRows:
                report.output.skippedRows,

            futureSessionBoundarySkipped:
                skipped.futureSessionBoundary,

            invalidFeatureStateSkipped:
                skipped.invalidFeatureState,

            integrity:
                "PASS"
        },
        null,
        2
    )
);


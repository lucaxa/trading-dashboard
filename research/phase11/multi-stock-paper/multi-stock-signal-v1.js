/*
TradeMind Pro
A11 Multi-Stock Paper Signal Evaluator V1

Purpose:
- Evaluate one instrument using the existing frozen V10.20/V10.25
  signal engine.
- Reuse the existing normalization, indicator calculation and
  getSignal() implementation.
- Support NIFTY 50 and PMSE-selected equities.
- Research / paper analysis only.

IMPORTANT:
- Does NOT modify the strategy.
- Does NOT create trades.
- Does NOT manage positions.
- Does NOT learn.
- Does NOT optimize.
- Does NOT promote.
- Does NOT place broker orders.
*/

import {
    CONFIG,
    normalizeCandles,
    calculateHistoricalIndicators,
    getSignal
} from "../../../api/backtest.js";


// ======================================================
// VERSION / SAFETY
// ======================================================

export const MULTI_STOCK_SIGNAL_VERSION =
    "A11-MULTI-STOCK-SIGNAL-V1";

const SAFETY = Object.freeze({

    researchOnly: true,
    paperOnly: true,

    learningEnabled: false,
    strategyMutation: false,
    parameterOptimization: false,
    featureSelection: false,
    modelWeightUpdates: false,
    promotionEnabled: false,

    realOrders: false,
    brokerOrderEnabled: false

});


// ======================================================
// VALIDATION
// ======================================================

function validateInstrument(instrument) {

    if (
        !instrument ||
        typeof instrument !== "object"
    ) {
        throw new Error(
            "Instrument is required"
        );
    }

    const symbol =
        String(
            instrument.symbol ?? ""
        ).trim();

    const securityId =
        String(
            instrument.securityId ?? ""
        ).trim();

    const exchange =
        String(
            instrument.exchange ?? ""
        ).trim();

    const segment =
        String(
            instrument.segment ?? ""
        ).trim();

    if (!symbol) {
        throw new Error(
            "Instrument symbol is required"
        );
    }

    if (!securityId) {
        throw new Error(
            `Security ID is required for ${symbol}`
        );
    }

    if (!exchange) {
        throw new Error(
            `Exchange is required for ${symbol}`
        );
    }

    if (!segment) {
        throw new Error(
            `Segment is required for ${symbol}`
        );
    }

    return {
        symbol,
        securityId,
        exchange,
        segment
    };
}

// ======================================================
// MARKET CANDLE ADAPTER
// ======================================================

function adaptMarketCandles(candles) {

    if (!Array.isArray(candles)) {
        return [];
    }

    return candles.map(candle => {

        if (
            !candle ||
            typeof candle !== "object"
        ) {
            return candle;
        }

        return {

            ts:
                Number(
                    candle.ts ??
                    candle.timestamp
                ),

            o:
                Number(
                    candle.o ??
                    candle.open
                ),

            h:
                Number(
                    candle.h ??
                    candle.high
                ),

            l:
                Number(
                    candle.l ??
                    candle.low
                ),

            c:
                Number(
                    candle.c ??
                    candle.close
                ),

            v:
                Number(
                    candle.v ??
                    candle.volume ??
                    0
                )

        };

    });

}

// ======================================================
// COMPLETED CANDLE FILTER
// ======================================================

function getCompletedCandles(
    candles,
    nowMs = Date.now()
) {

    if (!Array.isArray(candles)) {
        return [];
    }

    if (!candles.length) {
        return [];
    }

    const FIVE_MINUTES_SECONDS =
        5 * 60;

    const currentEpochSeconds =
        Math.floor(
            nowMs / 1000
        );

    const currentBucket =
        Math.floor(
            currentEpochSeconds /
            FIVE_MINUTES_SECONDS
        ) *
        FIVE_MINUTES_SECONDS;

    const latest =
        candles[
            candles.length - 1
        ];

    if (!latest) {
        return [];
    }

    const latestBucket =
        Math.floor(
            Number(latest.ts) /
            FIVE_MINUTES_SECONDS
        ) *
        FIVE_MINUTES_SECONDS;

    if (
        latestBucket >=
        currentBucket
    ) {

        return candles.slice(
            0,
            -1
        );

    }

    return candles;
}


// ======================================================
// SIGNAL EVALUATOR
// ======================================================

export function evaluateMultiStockSignal({
    instrument,
    candles,
    nowMs = Date.now()
}) {

    const validatedInstrument =
        validateInstrument(
            instrument
        );


    // --------------------------------------------------
    // NORMALIZE
    // --------------------------------------------------

    const normalizedCandles =
    normalizeCandles(
        adaptMarketCandles(candles)
    );


    if (
        normalizedCandles.length <
        CONFIG.EMA_SLOW + 10
    ) {

        return {

            version:
                MULTI_STOCK_SIGNAL_VERSION,

            strategy:
                "V10.20",

            engineVersion:
                CONFIG.VERSION,

            symbol:
                validatedInstrument.symbol,

            instrument:
                validatedInstrument,

            interval:
                "5minute",

            signal:
                "WAIT",

            status:
                "INSUFFICIENT_DATA",

            candlesAvailable:
                normalizedCandles.length,

            reason:
                "Not enough historical candles for V10.20",

            diagnostics: {},

            indicators: null,

            signalCandle: null,

            riskReference: null,

            safety:
                SAFETY

        };

    }


    // --------------------------------------------------
    // COMPLETED CANDLES ONLY
    // --------------------------------------------------

    const completedCandles =
        getCompletedCandles(
            normalizedCandles,
            nowMs
        );


    if (
        completedCandles.length <
        CONFIG.EMA_SLOW + 10
    ) {

        return {

            version:
                MULTI_STOCK_SIGNAL_VERSION,

            strategy:
                "V10.20",

            engineVersion:
                CONFIG.VERSION,

            symbol:
                validatedInstrument.symbol,

            instrument:
                validatedInstrument,

            interval:
                "5minute",

            signal:
                "WAIT",

            status:
                "INSUFFICIENT_COMPLETED_DATA",

            candlesAvailable:
                completedCandles.length,

            reason:
                "Not enough completed candles",

            diagnostics: {},

            indicators: null,

            signalCandle: null,

            riskReference: null,

            safety:
                SAFETY

        };

    }


    // --------------------------------------------------
    // SIGNAL CANDLE
    // --------------------------------------------------

    const signalIndex =
        completedCandles.length - 1;

    const signalCandle =
        completedCandles[
            signalIndex
        ];

    const previousCandle =
        signalIndex > 0
            ? completedCandles[
                signalIndex - 1
            ]
            : null;

    const previousPreviousCandle =
        signalIndex > 1
            ? completedCandles[
                signalIndex - 2
            ]
            : null;


    // --------------------------------------------------
    // INDICATORS
    // --------------------------------------------------

    const indicators =
        calculateHistoricalIndicators(
            completedCandles,
            signalIndex
        );


    if (!indicators) {

        return {

            version:
                MULTI_STOCK_SIGNAL_VERSION,

            strategy:
                "V10.20",

            engineVersion:
                CONFIG.VERSION,

            symbol:
                validatedInstrument.symbol,

            instrument:
                validatedInstrument,

            interval:
                "5minute",

            signal:
                "WAIT",

            status:
                "INDICATORS_UNAVAILABLE",

            candlesAvailable:
                completedCandles.length,

            reason:
                "V10.20 indicators could not be calculated",

            diagnostics: {},

            indicators: null,

            signalCandle,

            riskReference: null,

            safety:
                SAFETY

        };

    }


    // --------------------------------------------------
    // FROZEN SIGNAL ENGINE
    // --------------------------------------------------

    const signalResult =
        getSignal(

            signalCandle,

            indicators,

            previousCandle,

            previousPreviousCandle

        );


    // --------------------------------------------------
    // RISK REFERENCE
    // --------------------------------------------------

    let riskReference = null;

    if (
        signalResult.signal === "BUY" ||
        signalResult.signal === "SELL"
    ) {

        const atr14 =
            Number(
                indicators.atr14
            );

        const referenceEntry =
            Number(
                signalCandle.c
            );

        const risk =
            atr14 *
            CONFIG.ATR_STOP_MULTIPLIER;

        if (
            Number.isFinite(atr14) &&
            atr14 > 0 &&
            Number.isFinite(
                referenceEntry
            ) &&
            Number.isFinite(risk)
        ) {

            let stop;
            let target;

            if (
                signalResult.signal === "BUY"
            ) {

                stop =
                    referenceEntry -
                    risk;

                target =
                    referenceEntry +
                    (
                        risk *
                        CONFIG.RISK_REWARD
                    );

            } else {

                stop =
                    referenceEntry +
                    risk;

                target =
                    referenceEntry -
                    (
                        risk *
                        CONFIG.RISK_REWARD
                    );

            }

            riskReference = {

                atr14,

                risk,

                reward:
                    risk *
                    CONFIG.RISK_REWARD,

                referenceEntry,

                stop,

                target

            };

        }

    }


    // --------------------------------------------------
    // IMMUTABLE EVALUATION RESULT
    // --------------------------------------------------

    return {

        version:
            MULTI_STOCK_SIGNAL_VERSION,

        strategy:
            "V10.20",

        engineVersion:
            CONFIG.VERSION,

        symbol:
            validatedInstrument.symbol,

        instrument:
            validatedInstrument,

        interval:
            "5minute",

        status:
            "EVALUATED",

        signal:
            signalResult.signal,

        buyScore:
            signalResult.buyScore,

        sellScore:
            signalResult.sellScore,

        reason:
            signalResult.reason,

        diagnostics:
            signalResult.diagnostics,

        indicators,

        signalCandle,

        previousCandle,

        previousPreviousCandle,

        riskReference,

        provenance: {

            source:
                "MARKET_CANDLES",

            interval:
                "5minute",

            completedCandle:
                true,

            strategy:
                "V10.20",

            engineVersion:
                CONFIG.VERSION

        },

        safety:
            SAFETY

    };

}

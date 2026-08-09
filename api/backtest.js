/*
TradeMind Pro
V10.1 Historical Backtest Engine

INDstocks → Historical Candles → V10.1 Simulation

V10.1 fixes:
- Correct fresh-signal tracking
- Cooldown no longer resets signal to WAIT
- No repeated entry while same signal remains active
- Signal state tracked continuously
- No entry on same candle as trade exit
- Next-candle execution
- No same-candle entry
- EMA 9 / EMA 21
- EMA separation filter
- RSI 14
- VWAP confirmation
- ATR 14
- Strong candle confirmation
- Post-trade cooldown
- One position at a time
- No overnight positions
- Gap-aware execution
- Conservative SL/Target handling
- ATR-based Stop Loss
- 1:2 Risk / Reward
- Detailed trade diagnostics

PAPER BACKTEST ONLY.
NO REAL ORDERS.
*/


// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {

    EMA_FAST: 9,

    EMA_SLOW: 21,

    RSI_PERIOD: 14,

    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,

    RISK_REWARD: 2,

    MIN_EMA_ATR_SEPARATION: 0.10,

    MIN_VWAP_ATR_DISTANCE: 0.05,

    MIN_CANDLE_BODY_RATIO: 0.50,

    COOLDOWN_CANDLES: 3,

    ENTRY_START_MINUTES:
        9 * 60 + 20,

    ENTRY_END_MINUTES:
        15 * 60,

    SESSION_CLOSE_MINUTES:
        15 * 60 + 25

};


// ======================================================
// EMA
// ======================================================

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


// ======================================================
// RSI
// ======================================================

function rsi(
    values,
    period = 14
) {

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
            values[i] -
            values[i - 1];


        if (
            change > 0
        ) {

            gains += change;

        }

        else {

            losses +=
                Math.abs(change);

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
            values[i] -
            values[i - 1];


        const gain =
            Math.max(
                change,
                0
            );


        const loss =
            Math.max(
                -change,
                0
            );


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


    if (
        averageLoss === 0
    ) {

        return 100;

    }


    const rs =
        averageGain /
        averageLoss;


    return (
        100 -
        (
            100 /
            (1 + rs)
        )
    );

}


// ======================================================
// TRUE RANGE
// ======================================================

function trueRange(
    current,
    previous
) {

    const high =
        Number(current?.h);


    const low =
        Number(current?.l);


    const previousClose =
        Number(previous?.c);


    if (
        !Number.isFinite(high) ||
        !Number.isFinite(low)
    ) {

        return null;

    }


    if (
        !Number.isFinite(previousClose)
    ) {

        return high - low;

    }


    return Math.max(

        high - low,

        Math.abs(
            high -
            previousClose
        ),

        Math.abs(
            low -
            previousClose
        )

    );

}


// ======================================================
// ATR
// ======================================================

function atr(
    candles,
    period = 14
) {

    if (
        !Array.isArray(candles) ||
        candles.length < period + 1
    ) {

        return null;

    }


    const ranges = [];


    for (
        let i = 1;
        i < candles.length;
        i++
    ) {

        const value =
            trueRange(
                candles[i],
                candles[i - 1]
            );


        if (
            Number.isFinite(value)
        ) {

            ranges.push(value);

        }

    }


    if (
        ranges.length < period
    ) {

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
                value *
                (period - 1) +
                ranges[i]
            ) / period;

    }


    return value;

}


// ======================================================
// IST DATE
// ======================================================

function getISTDate(
    timestamp
) {

    const date =
        new Date(
            Number(timestamp) *
            1000 +
            (
                5.5 *
                60 *
                60 *
                1000
            )
        );


    return date
        .toISOString()
        .slice(0, 10);

}


// ======================================================
// IST MINUTES
// ======================================================

function getISTMinutes(
    timestamp
) {

    const date =
        new Date(
            Number(timestamp) *
            1000 +
            (
                5.5 *
                60 *
                60 *
                1000
            )
        );


    return (
        date.getUTCHours() *
        60
    ) +
    date.getUTCMinutes();

}


// ======================================================
// VWAP
// ======================================================

function vwap(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        return null;

    }


    const latest =
        candles[
            candles.length - 1
        ];


    const session =
        getISTDate(
            latest.ts
        );


    let totalPV = 0;

    let totalVolume = 0;


    for (
        const candle of candles
    ) {

        if (
            getISTDate(
                candle.ts
            ) !== session
        ) {

            continue;

        }


        const high =
            Number(candle.h);


        const low =
            Number(candle.l);


        const close =
            Number(candle.c);


        const volume =
            Number(candle.v);


        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            !Number.isFinite(volume)
        ) {

            continue;

        }


        const typicalPrice =
            (
                high +
                low +
                close
            ) / 3;


        totalPV +=
            typicalPrice *
            volume;


        totalVolume +=
            volume;

    }


    if (
        totalVolume <= 0
    ) {

        return null;

    }


    return (
        totalPV /
        totalVolume
    );

}


// ======================================================
// NORMALIZE CANDLES
// ======================================================

function normalizeCandles(
    candles
) {

    if (
        !Array.isArray(candles)
    ) {

        return [];

    }


    return candles

        .map(
            candle => {

                // ==========================================
                // ARRAY FORMAT
                // [timestamp, open, high, low, close, volume]
                // ==========================================

                if (
                    Array.isArray(candle)
                ) {

                    const normalized = {

                        ts:
                            Number(
                                candle[0]
                            ),

                        o:
                            Number(
                                candle[1]
                            ),

                        h:
                            Number(
                                candle[2]
                            ),

                        l:
                            Number(
                                candle[3]
                            ),

                        c:
                            Number(
                                candle[4]
                            ),

                        v:
                            Number(
                                candle[5] ?? 0
                            )

                    };


                    if (
                        !Number.isFinite(
                            normalized.ts
                        ) ||
                        !Number.isFinite(
                            normalized.o
                        ) ||
                        !Number.isFinite(
                            normalized.h
                        ) ||
                        !Number.isFinite(
                            normalized.l
                        ) ||
                        !Number.isFinite(
                            normalized.c
                        )
                    ) {

                        return null;

                    }


                    if (
                        normalized.h <
                        normalized.l
                    ) {

                        return null;

                    }


                    return normalized;

                }


                // ==========================================
                // OBJECT FORMAT
                // ==========================================

                if (
                    candle &&
                    typeof candle === "object"
                ) {

                    const normalized = {

                        ts:
                            Number(
                                candle.ts
                            ),

                        o:
                            Number(
                                candle.o
                            ),

                        h:
                            Number(
                                candle.h
                            ),

                        l:
                            Number(
                                candle.l
                            ),

                        c:
                            Number(
                                candle.c
                            ),

                        v:
                            Number(
                                candle.v ?? 0
                            )

                    };


                    if (
                        !Number.isFinite(
                            normalized.ts
                        ) ||
                        !Number.isFinite(
                            normalized.o
                        ) ||
                        !Number.isFinite(
                            normalized.h
                        ) ||
                        !Number.isFinite(
                            normalized.l
                        ) ||
                        !Number.isFinite(
                            normalized.c
                        )
                    ) {

                        return null;

                    }


                    if (
                        normalized.h <
                        normalized.l
                    ) {

                        return null;

                    }


                    return normalized;

                }


                return null;

            }
        )

        .filter(Boolean)

        .sort(
            (a, b) =>
                a.ts -
                b.ts
        );

}


// ======================================================
// HISTORICAL INDICATORS
// ======================================================

function calculateHistoricalIndicators(
    candles,
    index
) {

    const history =
        candles.slice(
            0,
            index + 1
        );


    if (
        history.length <
        CONFIG.EMA_SLOW + 2
    ) {

        return null;

    }


    const closes =
        history.map(
            candle =>
                candle.c
        );


    const ema9Value =
        ema(
            closes,
            CONFIG.EMA_FAST
        );


    const ema21Value =
        ema(
            closes,
            CONFIG.EMA_SLOW
        );


    const rsiValue =
        rsi(
            closes,
            CONFIG.RSI_PERIOD
        );


    const atrValue =
        atr(
            history,
            CONFIG.ATR_PERIOD
        );


    const vwapValue =
        vwap(
            history
        );


    if (
        !Number.isFinite(ema9Value) ||
        !Number.isFinite(ema21Value) ||
        !Number.isFinite(rsiValue) ||
        !Number.isFinite(atrValue) ||
        !Number.isFinite(vwapValue)
    ) {

        return null;

    }


    return {

        ema9:
            ema9Value,

        ema21:
            ema21Value,

        rsi14:
            rsiValue,

        atr14:
            atrValue,

        vwap:
            vwapValue

    };

}


// ======================================================
// V10 SIGNAL
// ======================================================

function getSignal(
    candle,
    indicators
) {

    if (
        !candle ||
        !indicators
    ) {

        return {

            signal: "WAIT",

            buyScore: 0,

            sellScore: 0,

            reason:
                "Missing data"

        };

    }


    const ema9 =
        Number(
            indicators.ema9
        );


    const ema21 =
        Number(
            indicators.ema21
        );


    const rsi14 =
        Number(
            indicators.rsi14
        );


    const atr14 =
        Number(
            indicators.atr14
        );


    const vwapValue =
        Number(
            indicators.vwap
        );


    const open =
        Number(
            candle.o
        );


    const high =
        Number(
            candle.h
        );


    const low =
        Number(
            candle.l
        );


    const close =
        Number(
            candle.c
        );


    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(rsi14) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwapValue) ||
        atr14 <= 0
    ) {

        return {

            signal: "WAIT",

            buyScore: 0,

            sellScore: 0,

            reason:
                "Indicators unavailable"

        };

    }


    const range =
        high - low;


    const body =
        Math.abs(
            close -
            open
        );


    const bodyRatio =
        range > 0
            ? body / range
            : 0;


    const strongCandle =
        bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO;


    const emaSeparation =
        Math.abs(
            ema9 -
            ema21
        );


    const strongTrend =
        emaSeparation >=
        (
            atr14 *
            CONFIG.MIN_EMA_ATR_SEPARATION
        );


    const vwapDistance =
        Math.abs(
            close -
            vwapValue
        );


    const awayFromVWAP =
        vwapDistance >=
        (
            atr14 *
            CONFIG.MIN_VWAP_ATR_DISTANCE
        );


    let buyScore = 0;

    let sellScore = 0;

    const reasons = [];


    // ==================================================
    // BUY
    // ==================================================

    if (
        ema9 > ema21
    ) {

        buyScore++;

        reasons.push(
            "EMA bullish"
        );

    }


    if (
        strongTrend &&
        ema9 > ema21
    ) {

        buyScore++;

        reasons.push(
            "Trend strength confirmed"
        );

    }


    if (
        rsi14 >= 55 &&
        rsi14 < 68
    ) {

        buyScore++;

        reasons.push(
            "RSI bullish"
        );

    }


    if (
        close >
        vwapValue &&
        awayFromVWAP
    ) {

        buyScore++;

        reasons.push(
            "Above VWAP"
        );

    }


    if (
        close > open &&
        strongCandle
    ) {

        buyScore++;

        reasons.push(
            "Strong bullish candle"
        );

    }


    // ==================================================
    // SELL
    // ==================================================

    if (
        ema9 < ema21
    ) {

        sellScore++;

        reasons.push(
            "EMA bearish"
        );

    }


    if (
        strongTrend &&
        ema9 < ema21
    ) {

        sellScore++;

        reasons.push(
            "Trend strength confirmed"
        );

    }


    if (
        rsi14 <= 45 &&
        rsi14 > 32
    ) {

        sellScore++;

        reasons.push(
            "RSI bearish"
        );

    }


    if (
        close <
        vwapValue &&
        awayFromVWAP
    ) {

        sellScore++;

        reasons.push(
            "Below VWAP"
        );

    }


    if (
        close < open &&
        strongCandle
    ) {

        sellScore++;

        reasons.push(
            "Strong bearish candle"
        );

    }


    let signal =
        "WAIT";


    if (
        buyScore >= 5 &&
        buyScore > sellScore
    ) {

        signal =
            "BUY";

    }

    else if (
        sellScore >= 5 &&
        sellScore > buyScore
    ) {

        signal =
            "SELL";

    }


    return {

        signal,

        buyScore,

        sellScore,

        reason:
            signal === "WAIT"
                ? "Waiting for full confirmation"
                : reasons.join(" + ")

    };

}


// ======================================================
// CLOSE TRADE
// ======================================================

function closePosition(
    position,
    exitPrice,
    exitTs,
    reason,
    equityState
) {

    const points =
        position.side === "BUY"

            ? exitPrice -
              position.entry

            : position.entry -
              exitPrice;


    equityState.equity +=
        points;


    equityState.peakEquity =
        Math.max(
            equityState.peakEquity,
            equityState.equity
        );


    const drawdown =
        equityState.peakEquity -
        equityState.equity;


    equityState.maxDrawdown =
        Math.max(
            equityState.maxDrawdown,
            drawdown
        );


    return {

        side:
            position.side,

        entry:
            Number(
                position.entry.toFixed(2)
            ),

        stop:
            Number(
                position.stop.toFixed(2)
            ),

        target:
            Number(
                position.target.toFixed(2)
            ),

        exit:
            Number(
                exitPrice.toFixed(2)
            ),

        points:
            Number(
                points.toFixed(2)
            ),

        result:
            points > 0
                ? "WIN"
                : "LOSS",

        reason,

        entryTs:
            position.entryTs,

        exitTs,

        signalTs:
            position.signalTs,

        entryTime:
            new Date(
                position.entryTs *
                1000
            ).toISOString(),

        exitTime:
            new Date(
                exitTs *
                1000
            ).toISOString(),

        signalTime:
            new Date(
                position.signalTs *
                1000
            ).toISOString(),

        // ==============================================
        // DIAGNOSTICS
        // ==============================================

        signal:
            position.signal,

        buyScore:
            position.signalBuyScore,

        sellScore:
            position.signalSellScore,

        signalReason:
            position.signalReason,

        ema9:
            Number(
                position.ema9?.toFixed(2)
            ),

        ema21:
            Number(
                position.ema21?.toFixed(2)
            ),

        rsi14:
            Number(
                position.rsi14?.toFixed(2)
            ),

        vwap:
            Number(
                position.vwap?.toFixed(2)
            ),

        atr14:
            Number(
                position.atr?.toFixed(2)
            )

    };

}


// ======================================================
// MANAGE POSITION
// ======================================================

function managePosition(
    position,
    candle,
    equityState
) {

    if (
        !position
    ) {

        return null;

    }


    const open =
        Number(candle.o);


    const high =
        Number(candle.h);


    const low =
        Number(candle.l);


    // ==================================================
    // BUY
    // ==================================================

    if (
        position.side === "BUY"
    ) {

        if (
            open <=
            position.stop
        ) {

            return closePosition(

                position,

                open,

                candle.ts,

                "STOP LOSS - GAP",

                equityState

            );

        }


        if (
            open >=
            position.target
        ) {

            return closePosition(

                position,

                open,

                candle.ts,

                "TARGET - GAP",

                equityState

            );

        }


        // Conservative:
        // STOP checked before TARGET.

        if (
            low <=
            position.stop
        ) {

            return closePosition(

                position,

                position.stop,

                candle.ts,

                "STOP LOSS",

                equityState

            );

        }


        if (
            high >=
            position.target
        ) {

            return closePosition(

                position,

                position.target,

                candle.ts,

                "TARGET",

                equityState

            );

        }

    }


    // ==================================================
    // SELL
    // ==================================================

    if (
        position.side === "SELL"
    ) {

        if (
            open >=
            position.stop
        ) {

            return closePosition(

                position,

                open,

                candle.ts,

                "STOP LOSS - GAP",

                equityState

            );

        }


        if (
            open <=
            position.target
        ) {

            return closePosition(

                position,

                open,

                candle.ts,

                "TARGET - GAP",

                equityState

            );

        }


        // Conservative:
        // STOP checked before TARGET.

        if (
            high >=
            position.stop
        ) {

            return closePosition(

                position,

                position.stop,

                candle.ts,

                "STOP LOSS",

                equityState

            );

        }


        if (
            low <=
            position.target
        ) {

            return closePosition(

                position,

                position.target,

                candle.ts,

                "TARGET",

                equityState

            );

        }

    }


    return null;

}


// ======================================================
// V10.1 BACKTEST
// ======================================================

function runBacktest(
    candles
) {

    const trades = [];


    let position = null;


    const equityState = {

        equity: 0,

        peakEquity: 0,

        maxDrawdown: 0

    };


    let cooldown = 0;


    let previousSession = null;


    /*
    IMPORTANT:

    This is the corrected signal state.

    We do NOT reset it during cooldown.

    This prevents:

    SELL
    LOSS
    cooldown
    SELL
    NEW TRADE

    unless the signal actually changed.
    */

    let previousSignal =
        "WAIT";


    const startIndex =
        Math.max(
            CONFIG.EMA_SLOW + 2,
            CONFIG.RSI_PERIOD + 2,
            CONFIG.ATR_PERIOD + 2
        );


    for (
        let i = startIndex;
        i < candles.length;
        i++
    ) {

        const candle =
            candles[i];


        const session =
            getISTDate(
                candle.ts
            );


        const minutes =
            getISTMinutes(
                candle.ts
            );


        let closedThisCandle =
            false;


        // ==================================================
        // NEW SESSION
        // ==================================================

        if (
            previousSession !== null &&
            session !== previousSession
        ) {

            if (
                position
            ) {

                const previousCandle =
                    candles[i - 1];


                const trade =
                    closePosition(

                        position,

                        previousCandle.c,

                        previousCandle.ts,

                        "SESSION CLOSE",

                        equityState

                    );


                trades.push(
                    trade
                );


                position =
                    null;


                cooldown =
                    CONFIG.COOLDOWN_CANDLES;


                closedThisCandle =
                    true;

            }


            /*
            A new trading session starts
            with a clean signal state.
            */

            previousSignal =
                "WAIT";

        }


        previousSession =
            session;


        // ==================================================
        // INDICATORS
        // ==================================================

        const indicators =
            calculateHistoricalIndicators(

                candles,

                i

            );


        /*
        We calculate the signal even during
        cooldown so that previousSignal
        always reflects what the market
        is actually signalling.

        This is the key V10.1 fix.
        */

        let signal =
            "WAIT";


        let signalResult =
            null;


        if (
            indicators
        ) {

            signalResult =
                getSignal(

                    candle,

                    indicators

                );


            signal =
                signalResult.signal;

        }


        // ==================================================
        // POSITION MANAGEMENT
        // ==================================================

        if (
            position
        ) {

            const trade =
                managePosition(

                    position,

                    candle,

                    equityState

                );


            if (
                trade
            ) {

                trades.push(
                    trade
                );


                position =
                    null;


                cooldown =
                    CONFIG.COOLDOWN_CANDLES;


                closedThisCandle =
                    true;

            }

        }


        // ==================================================
        // SESSION CLOSE
        // ==================================================

        if (
            position &&
            minutes >=
            CONFIG.SESSION_CLOSE_MINUTES
        ) {

            const trade =
                closePosition(

                    position,

                    candle.c,

                    candle.ts,

                    "SESSION CLOSE",

                    equityState

                );


            trades.push(
                trade
            );


            position =
                null;


            cooldown =
                CONFIG.COOLDOWN_CANDLES;


            closedThisCandle =
                true;

        }


        // ==================================================
        // UPDATE SIGNAL STATE
        // ==================================================

        /*
        This is deliberately done regardless
        of cooldown.

        Example:

        SELL
        SELL
        SELL
        WAIT
        SELL

        Only the final SELL is fresh.

        Example:

        SELL
        SELL
        SELL
        SELL

        Only the first SELL is fresh.
        */

        const freshSignal =
            signal !== "WAIT" &&
            signal !== previousSignal;


        /*
        Save the current signal AFTER
        determining freshness.
        */

        previousSignal =
            signal;


        // ==================================================
        // DON'T TRADE AFTER SESSION CLOSE
        // ==================================================

        if (
            minutes >=
            CONFIG.SESSION_CLOSE_MINUTES
        ) {

            continue;

        }


        // ==================================================
        // DON'T ENTER ON EXIT CANDLE
        // ==================================================

        if (
            closedThisCandle
        ) {

            continue;

        }


        // ==================================================
        // COOLDOWN
        // ==================================================

        if (
            cooldown > 0
        ) {

            cooldown--;

            /*
            IMPORTANT:

            DO NOT set previousSignal
            to WAIT here.

            The signal state above has
            already been updated correctly.
            */

            continue;

        }


        // ==================================================
        // ENTRY WINDOW
        // ==================================================

        if (
            minutes <
            CONFIG.ENTRY_START_MINUTES ||
            minutes >
            CONFIG.ENTRY_END_MINUTES
        ) {

            continue;

        }


        // ==================================================
        // INDICATORS REQUIRED
        // ==================================================

        if (
            !indicators ||
            !signalResult
        ) {

            continue;

        }


        // ==================================================
        // FRESH SIGNAL REQUIRED
        // ==================================================

        if (
            !freshSignal
        ) {

            continue;

        }


        // ==================================================
        // NEXT CANDLE REQUIRED
        // ==================================================

        if (
            i + 1 >=
            candles.length
        ) {

            continue;

        }


        const nextCandle =
            candles[i + 1];


        /*
        Never enter if the next candle
        belongs to another trading session.
        */

        if (
            getISTDate(
                nextCandle.ts
            ) !== session
        ) {

            continue;

        }


        // ==================================================
        // ATR
        // ==================================================

        const atrValue =
            Number(
                indicators.atr14
            );


        if (
            !Number.isFinite(atrValue) ||
            atrValue <= 0
        ) {

            continue;

        }


        // ==================================================
        // NEXT CANDLE ENTRY
        // ==================================================

        const entry =
            Number(
                nextCandle.o
            );


        if (
            !Number.isFinite(entry) ||
            entry <= 0
        ) {

            continue;

        }


        // ==================================================
        // STOP / TARGET
        // ==================================================

        const risk =
            atrValue *
            CONFIG.ATR_STOP_MULTIPLIER;


        const reward =
            risk *
            CONFIG.RISK_REWARD;


        const side =
            signal === "BUY"
                ? "BUY"
                : "SELL";


        const stop =
            side === "BUY"

                ? entry - risk

                : entry + risk;


        const target =
            side === "BUY"

                ? entry + reward

                : entry - reward;


        // ==================================================
        // CREATE POSITION
        // ==================================================

        position = {

            side,

            entry,

            stop,

            target,

            entryTs:
                nextCandle.ts,

            signalTs:
                candle.ts,

            signal,

            signalBuyScore:
                signalResult.buyScore,

            signalSellScore:
                signalResult.sellScore,

            signalReason:
                signalResult.reason,

            ema9:
                indicators.ema9,

            ema21:
                indicators.ema21,

            rsi14:
                indicators.rsi14,

            vwap:
                indicators.vwap,

            atr:
                atrValue

        };


        console.log(
            "V10.1 ENTRY:",
            {
                side,
                entry,
                stop,
                target,
                signal,
                buyScore:
                    signalResult.buyScore,
                sellScore:
                    signalResult.sellScore,
                ema9:
                    indicators.ema9,
                ema21:
                    indicators.ema21,
                rsi14:
                    indicators.rsi14,
                vwap:
                    indicators.vwap,
                atr14:
                    indicators.atr14
            }
        );

    }


    // ======================================================
    // CLOSE FINAL POSITION
    // ======================================================

    if (
        position
    ) {

        const last =
            candles[
                candles.length - 1
            ];


        const trade =
            closePosition(

                position,

                last.c,

                last.ts,

                "END OF DATA",

                equityState

            );


        trades.push(
            trade
        );

    }


    // ======================================================
    // STATISTICS
    // ======================================================

    const totalTrades =
        trades.length;


    const buyTrades =
        trades.filter(
            trade =>
                trade.side === "BUY"
        ).length;


    const sellTrades =
        trades.filter(
            trade =>
                trade.side === "SELL"
        ).length;


    const winningTrades =
        trades.filter(
            trade =>
                trade.points > 0
        );


    const losingTrades =
        trades.filter(
            trade =>
                trade.points <= 0
        );


    const wins =
        winningTrades.length;


    const losses =
        losingTrades.length;


    const winRate =
        totalTrades > 0

            ? (
                wins /
                totalTrades
            ) * 100

            : 0;


    const totalPoints =
        trades.reduce(

            (sum, trade) =>
                sum +
                trade.points,

            0

        );


    const averageWin =
        wins > 0

            ? winningTrades.reduce(

                (sum, trade) =>
                    sum +
                    trade.points,

                0

            ) / wins

            : 0;


    const averageLoss =
        losses > 0

            ? Math.abs(

                losingTrades.reduce(

                    (sum, trade) =>
                        sum +
                        trade.points,

                    0

                ) / losses

            )

            : 0;


    const grossProfit =
        winningTrades.reduce(

            (sum, trade) =>
                sum +
                trade.points,

            0

        );


    const grossLoss =
        Math.abs(

            losingTrades.reduce(

                (sum, trade) =>
                    sum +
                    trade.points,

                0

            )

        );


    const profitFactor =
        grossLoss > 0

            ? grossProfit /
              grossLoss

            : grossProfit > 0

                ? Infinity

                : 0;


    return {

        candlesTested:
            candles.length,

        totalTrades,

        buyTrades,

        sellTrades,

        winningTrades:
            wins,

        losingTrades:
            losses,

        winRate,

        totalPoints,

        averageWin,

        averageLoss,

        profitFactor,

        maxDrawdown:
            equityState.maxDrawdown,

        trades

    };

}


// ======================================================
// EXTRACT CANDLES FROM INDSTOCKS RESPONSE
// ======================================================

function extractCandles(
    result
) {

    /*
    Supported response:

    result.data.NIDX_40000001.candles

    OR

    result.data.candles

    OR

    result.candles
    */


    const candidates = [

        result
            ?.data
            ?.NIDX_40000001
            ?.candles,

        result
            ?.data
            ?.candles,

        result
            ?.candles

    ];


    for (
        const candidate of candidates
    ) {

        if (
            Array.isArray(candidate)
        ) {

            return candidate;

        }

    }


    return [];

}


// ======================================================
// API HANDLER
// ======================================================

export default async function handler(
    req,
    res
) {

    try {

        // ==================================================
        // TOKEN
        // ==================================================

        const token =
            process.env.INDSTOCKS_TOKEN;


        if (
            !token
        ) {

            return res.status(500).json({

                success: false,

                error:
                    "INDSTOCKS_TOKEN is not configured"

            });

        }


        // ==================================================
        // INTERVAL
        // ==================================================

        const interval =
            req.query?.interval ||
            "5minute";


        const allowedIntervals = [

            "1minute",

            "2minute",

            "3minute",

            "4minute",

            "5minute",

            "10minute",

            "15minute",

            "30minute",

            "60minute",

            "120minute",

            "180minute",

            "240minute",

            "1day"

        ];


        if (
            !allowedIntervals.includes(
                interval
            )
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid candle interval"

            });

        }


        // ==================================================
        // INSTRUMENT
        // ==================================================

        const NIFTY_ID =
            "40000001";


        const scripCode =
            `NIDX_${NIFTY_ID}`;


        // ==================================================
        // TIME RANGE
        // ==================================================

        const endTime =
            Date.now();


        const startTime =
            endTime -
            (
                7 *
                24 *
                60 *
                60 *
                1000
            );


        // ==================================================
        // INDSTOCKS URL
        // ==================================================

        const url =
            "https://api.indstocks.com" +
            `/market/historical/${interval}` +
            `?scrip-codes=${encodeURIComponent(
                scripCode
            )}` +
            `&start_time=${startTime}` +
            `&end_time=${endTime}`;


        console.log(
            "================================"
        );


        console.log(
            "TradeMind V10.1 Backtest Request"
        );


        console.log(
            "Interval:",
            interval
        );


        console.log(
            "Scrip:",
            scripCode
        );


        console.log(
            "Start:",
            startTime
        );


        console.log(
            "End:",
            endTime
        );


        console.log(
            "================================"
        );


        // ==================================================
        // API REQUEST
        // ==================================================

        const response =
            await fetch(
                url,
                {

                    method:
                        "GET",

                    headers: {

                        Authorization:
                            token,

                        Accept:
                            "application/json"

                    }

                }
            );


        const text =
            await response.text();


        let result;


        try {

            result =
                JSON.parse(text);

        }

        catch {

            console.error(
                "V10.1 invalid INDstocks response:",
                text.slice(0, 2000)
            );


            return res.status(502).json({

                success: false,

                version:
                    "V10.1",

                error:
                    "INDstocks returned invalid JSON",

                details:
                    text.slice(0, 1000)

            });

        }


        // ==================================================
        // RAW RESPONSE DEBUG
        // ==================================================

        console.log(
            "V10.1 INDstocks raw response:"
        );


        console.log(
            JSON.stringify(
                result
            ).slice(
                0,
                3000
            )
        );


        // ==================================================
        // HTTP ERROR
        // ==================================================

        if (
            !response.ok
        ) {

            console.error(
                "V10.1 INDstocks error:",
                result
            );


            return res.status(
                response.status
            ).json({

                success: false,

                version:
                    "V10.1",

                error:
                    result

            });

        }


        // ==================================================
        // EXTRACT CANDLES
        // ==================================================

        const rawCandles =
            extractCandles(
                result
            );


        console.log(
            "V10.1 raw candle count:",
            Array.isArray(rawCandles)
                ? rawCandles.length
                : "NOT_ARRAY"
        );


        // ==================================================
        // NORMALIZE
        // ==================================================

        const candles =
            normalizeCandles(
                rawCandles
            );


        console.log(
            "V10.1 normalized candle count:",
            candles.length
        );


        // ==================================================
        // INSUFFICIENT DATA
        // ==================================================

        if (
            candles.length < 50
        ) {

            console.error(
                "V10.1 insufficient historical candles:",
                candles.length
            );


            return res.status(200).json({

                success: true,

                version:
                    "V10.1",

                interval,

                status:
                    "INSUFFICIENT_DATA",

                message:
                    "Not enough historical candles",

                candlesTested:
                    candles.length,

                totalTrades: 0,

                buyTrades: 0,

                sellTrades: 0,

                winningTrades: 0,

                losingTrades: 0,

                winRate: 0,

                totalPoints: 0,

                averageWin: 0,

                averageLoss: 0,

                profitFactor: 0,

                maxDrawdown: 0,

                trades: []

            });

        }


        // ==================================================
        // RUN BACKTEST
        // ==================================================

        const backtest =
            runBacktest(
                candles
            );


        // ==================================================
        // RESULT LOGS
        // ==================================================

        console.log(
            "================================"
        );


        console.log(
            "TradeMind V10.1 Backtest Result"
        );


        console.log(
            "Candles:",
            backtest.candlesTested
        );


        console.log(
            "Trades:",
            backtest.totalTrades
        );


        console.log(
            "BUY:",
            backtest.buyTrades
        );


        console.log(
            "SELL:",
            backtest.sellTrades
        );


        console.log(
            "Wins:",
            backtest.winningTrades
        );


        console.log(
            "Losses:",
            backtest.losingTrades
        );


        console.log(
            "Win rate:",
            backtest.winRate
        );


        console.log(
            "Total points:",
            backtest.totalPoints
        );


        console.log(
            "Profit factor:",
            backtest.profitFactor
        );


        console.log(
            "Max drawdown:",
            backtest.maxDrawdown
        );


        console.log(
            "Trade history:"
        );


        console.table(
            backtest.trades
        );


        console.log(
            "================================"
        );


        // ==================================================
        // RESPONSE
        // ==================================================

        return res.status(200).json({

            success: true,

            version:
                "V10.1",

            interval,

            status:
                "COMPLETED",

            candlesTested:
                backtest.candlesTested,

            totalTrades:
                backtest.totalTrades,

            buyTrades:
                backtest.buyTrades,

            sellTrades:
                backtest.sellTrades,

            winningTrades:
                backtest.winningTrades,

            losingTrades:
                backtest.losingTrades,

            winRate:
                backtest.winRate,

            totalPoints:
                backtest.totalPoints,

            averageWin:
                backtest.averageWin,

            averageLoss:
                backtest.averageLoss,

            profitFactor:
                backtest.profitFactor,

            maxDrawdown:
                backtest.maxDrawdown,

            trades:
                backtest.trades

        });

    }

    catch (error) {

        console.error(
            "================================"
        );


        console.error(
            "TradeMind V10.1 Backtest Error:",
            error
        );


        console.error(
            "================================"
        );


        return res.status(500).json({

            success: false,

            version:
                "V10.1",

            error:
                "V10.1 backtest failed",

            details:
                error?.message ||
                "Unknown error"

        });

    }

}

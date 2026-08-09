/*
TradeMind Pro
V10.2 Historical Backtest Engine

INDstocks → Historical Candles → V10.2 Simulation

IMPORTANT:
- PAPER BACKTEST ONLY
- NO REAL ORDERS
- V10.2 is intentionally used as a deployment fingerprint.
*/

const VERSION = "V10.2";

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

    ENTRY_START_MINUTES: 9 * 60 + 20,
    ENTRY_END_MINUTES: 15 * 60,
    SESSION_CLOSE_MINUTES: 15 * 60 + 25
};


// ======================================================
// EMA
// ======================================================

function ema(values, period) {

    if (!Array.isArray(values) || values.length < period) {
        return null;
    }

    const multiplier = 2 / (period + 1);

    let value =
        values
            .slice(0, period)
            .reduce((sum, x) => sum + Number(x), 0) / period;

    for (let i = period; i < values.length; i++) {
        const current = Number(values[i]);

        if (!Number.isFinite(current)) {
            return null;
        }

        value = ((current - value) * multiplier) + value;
    }

    return value;
}


// ======================================================
// RSI
// ======================================================

function rsi(values, period = 14) {

    if (!Array.isArray(values) || values.length < period + 1) {
        return null;
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {

        const change =
            Number(values[i]) -
            Number(values[i - 1]);

        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    let averageGain = gains / period;
    let averageLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {

        const change =
            Number(values[i]) -
            Number(values[i - 1]);

        const gain = Math.max(change, 0);
        const loss = Math.max(-change, 0);

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

    const rs = averageGain / averageLoss;

    return 100 - (100 / (1 + rs));
}


// ======================================================
// TRUE RANGE
// ======================================================

function trueRange(current, previous) {

    const high = Number(current?.h);
    const low = Number(current?.l);
    const previousClose = Number(previous?.c);

    if (!Number.isFinite(high) || !Number.isFinite(low)) {
        return null;
    }

    if (!Number.isFinite(previousClose)) {
        return high - low;
    }

    return Math.max(
        high - low,
        Math.abs(high - previousClose),
        Math.abs(low - previousClose)
    );
}


// ======================================================
// ATR
// ======================================================

function atr(candles, period = 14) {

    if (!Array.isArray(candles) || candles.length < period + 1) {
        return null;
    }

    const ranges = [];

    for (let i = 1; i < candles.length; i++) {

        const tr =
            trueRange(
                candles[i],
                candles[i - 1]
            );

        if (Number.isFinite(tr)) {
            ranges.push(tr);
        }
    }

    if (ranges.length < period) {
        return null;
    }

    let value =
        ranges
            .slice(0, period)
            .reduce((sum, x) => sum + x, 0) / period;

    for (let i = period; i < ranges.length; i++) {

        value =
            (
                value * (period - 1) +
                ranges[i]
            ) / period;
    }

    return value;
}


// ======================================================
// IST HELPERS
// ======================================================

function istDate(timestamp) {

    const date =
        new Date(
            Number(timestamp) * 1000 +
            5.5 * 60 * 60 * 1000
        );

    return date.toISOString().slice(0, 10);
}


function istMinutes(timestamp) {

    const date =
        new Date(
            Number(timestamp) * 1000 +
            5.5 * 60 * 60 * 1000
        );

    return (
        date.getUTCHours() * 60
    ) + date.getUTCMinutes();
}


// ======================================================
// VWAP
// ======================================================

function vwap(candles) {

    if (!Array.isArray(candles) || candles.length === 0) {
        return null;
    }

    const latest = candles[candles.length - 1];

    const session = istDate(latest.ts);

    let totalPV = 0;
    let totalVolume = 0;

    for (const candle of candles) {

        if (istDate(candle.ts) !== session) {
            continue;
        }

        const high = Number(candle.h);
        const low = Number(candle.l);
        const close = Number(candle.c);
        const volume = Number(candle.v);

        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            !Number.isFinite(volume)
        ) {
            continue;
        }

        const typicalPrice =
            (high + low + close) / 3;

        totalPV += typicalPrice * volume;
        totalVolume += volume;
    }

    if (totalVolume <= 0) {
        return null;
    }

    return totalPV / totalVolume;
}


// ======================================================
// NORMALIZE CANDLES
// ======================================================

function normalizeCandles(candles) {

    if (!Array.isArray(candles)) {
        return [];
    }

    return candles
        .map(candle => {

            // ------------------------------------------
            // Array format
            // ------------------------------------------

            if (Array.isArray(candle)) {

                const normalized = {
                    ts: Number(candle[0]),
                    o: Number(candle[1]),
                    h: Number(candle[2]),
                    l: Number(candle[3]),
                    c: Number(candle[4]),
                    v: Number(candle[5] ?? 0)
                };

                if (
                    !Number.isFinite(normalized.ts) ||
                    !Number.isFinite(normalized.o) ||
                    !Number.isFinite(normalized.h) ||
                    !Number.isFinite(normalized.l) ||
                    !Number.isFinite(normalized.c)
                ) {
                    return null;
                }

                return normalized;
            }


            // ------------------------------------------
            // Object format
            // ------------------------------------------

            if (
                candle &&
                typeof candle === "object"
            ) {

                const normalized = {
                    ts: Number(
                        candle.ts ??
                        candle.timestamp ??
                        candle.time
                    ),

                    o: Number(
                        candle.o ??
                        candle.open
                    ),

                    h: Number(
                        candle.h ??
                        candle.high
                    ),

                    l: Number(
                        candle.l ??
                        candle.low
                    ),

                    c: Number(
                        candle.c ??
                        candle.close
                    ),

                    v: Number(
                        candle.v ??
                        candle.volume ??
                        0
                    )
                };

                if (
                    !Number.isFinite(normalized.ts) ||
                    !Number.isFinite(normalized.o) ||
                    !Number.isFinite(normalized.h) ||
                    !Number.isFinite(normalized.l) ||
                    !Number.isFinite(normalized.c)
                ) {
                    return null;
                }

                return normalized;
            }

            return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts);
}


// ======================================================
// EXTRACT ANY CANDLE ARRAY
// ======================================================

function findCandleArray(value, depth = 0) {

    if (depth > 6) {
        return null;
    }

    if (Array.isArray(value)) {

        if (value.length === 0) {
            return null;
        }

        // Looks like candle array
        if (
            Array.isArray(value[0]) ||
            (
                value[0] &&
                typeof value[0] === "object" &&
                (
                    "c" in value[0] ||
                    "close" in value[0]
                )
            )
        ) {
            return value;
        }

        return null;
    }

    if (
        !value ||
        typeof value !== "object"
    ) {
        return null;
    }

    for (const key of Object.keys(value)) {

        const found =
            findCandleArray(
                value[key],
                depth + 1
            );

        if (found) {
            return found;
        }
    }

    return null;
}


// ======================================================
// HISTORICAL INDICATORS
// ======================================================

function historicalIndicators(candles, index) {

    const history =
        candles.slice(0, index + 1);

    if (
        history.length <
        CONFIG.EMA_SLOW + 2
    ) {
        return null;
    }

    const closes =
        history.map(c => c.c);

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
        vwap(history);

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
        ema9: ema9Value,
        ema21: ema21Value,
        rsi14: rsiValue,
        atr14: atrValue,
        vwap: vwapValue
    };
}


// ======================================================
// SIGNAL
// ======================================================

function getSignal(candle, indicators) {

    if (!candle || !indicators) {

        return {
            signal: "WAIT",
            buyScore: 0,
            sellScore: 0,
            reason: "Missing data"
        };
    }

    const ema9 = Number(indicators.ema9);
    const ema21 = Number(indicators.ema21);
    const rsi14 = Number(indicators.rsi14);
    const atr14 = Number(indicators.atr14);
    const vwapValue = Number(indicators.vwap);

    const open = Number(candle.o);
    const high = Number(candle.h);
    const low = Number(candle.l);
    const close = Number(candle.c);

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
            reason: "Indicators unavailable"
        };
    }

    const range = high - low;

    const body =
        Math.abs(close - open);

    const bodyRatio =
        range > 0
            ? body / range
            : 0;

    const strongCandle =
        bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO;

    const emaSeparation =
        Math.abs(ema9 - ema21);

    const strongTrend =
        emaSeparation >=
        atr14 * CONFIG.MIN_EMA_ATR_SEPARATION;

    const awayFromVWAP =
        Math.abs(close - vwapValue) >=
        atr14 * CONFIG.MIN_VWAP_ATR_DISTANCE;

    let buyScore = 0;
    let sellScore = 0;

    const buyReasons = [];
    const sellReasons = [];


    // BUY

    if (ema9 > ema21) {
        buyScore++;
        buyReasons.push("EMA bullish");
    }

    if (
        strongTrend &&
        ema9 > ema21
    ) {
        buyScore++;
        buyReasons.push("Trend strength");
    }

    if (
        rsi14 >= 55 &&
        rsi14 < 68
    ) {
        buyScore++;
        buyReasons.push("RSI bullish");
    }

    if (
        close > vwapValue &&
        awayFromVWAP
    ) {
        buyScore++;
        buyReasons.push("Above VWAP");
    }

    if (
        close > open &&
        strongCandle
    ) {
        buyScore++;
        buyReasons.push("Strong bullish candle");
    }


    // SELL

    if (ema9 < ema21) {
        sellScore++;
        sellReasons.push("EMA bearish");
    }

    if (
        strongTrend &&
        ema9 < ema21
    ) {
        sellScore++;
        sellReasons.push("Trend strength");
    }

    if (
        rsi14 <= 45 &&
        rsi14 > 32
    ) {
        sellScore++;
        sellReasons.push("RSI bearish");
    }

    if (
        close < vwapValue &&
        awayFromVWAP
    ) {
        sellScore++;
        sellReasons.push("Below VWAP");
    }

    if (
        close < open &&
        strongCandle
    ) {
        sellScore++;
        sellReasons.push("Strong bearish candle");
    }


    let signal = "WAIT";
    let reason = "Waiting for full confirmation";

    if (
        buyScore >= 5 &&
        buyScore > sellScore
    ) {

        signal = "BUY";
        reason = buyReasons.join(" + ");

    } else if (
        sellScore >= 5 &&
        sellScore > buyScore
    ) {

        signal = "SELL";
        reason = sellReasons.join(" + ");
    }

    return {
        signal,
        buyScore,
        sellScore,
        reason
    };
}


// ======================================================
// CLOSE POSITION
// ======================================================

function closePosition(
    position,
    exitPrice,
    exitTs,
    reason,
    equity
) {

    const points =
        position.side === "BUY"
            ? exitPrice - position.entry
            : position.entry - exitPrice;

    equity.equity += points;

    equity.peak =
        Math.max(
            equity.peak,
            equity.equity
        );

    equity.maxDrawdown =
        Math.max(
            equity.maxDrawdown,
            equity.peak - equity.equity
        );

    return {

        side: position.side,

        entry: Number(
            position.entry.toFixed(2)
        ),

        stop: Number(
            position.stop.toFixed(2)
        ),

        target: Number(
            position.target.toFixed(2)
        ),

        exit: Number(
            exitPrice.toFixed(2)
        ),

        points: Number(
            points.toFixed(2)
        ),

        result:
            points > 0
                ? "WIN"
                : "LOSS",

        reason,

        entryTs: position.entryTs,
        exitTs,
        signalTs: position.signalTs,

        signal: position.signal,

        buyScore:
            position.buyScore,

        sellScore:
            position.sellScore,

        signalReason:
            position.signalReason,

        ema9: Number(
            position.ema9.toFixed(2)
        ),

        ema21: Number(
            position.ema21.toFixed(2)
        ),

        rsi14: Number(
            position.rsi14.toFixed(2)
        ),

        vwap: Number(
            position.vwap.toFixed(2)
        ),

        atr14: Number(
            position.atr14.toFixed(2)
        )
    };
}


// ======================================================
// MANAGE POSITION
// ======================================================

function managePosition(
    position,
    candle,
    equity
) {

    const open = Number(candle.o);
    const high = Number(candle.h);
    const low = Number(candle.l);

    if (position.side === "BUY") {

        if (open <= position.stop) {

            return closePosition(
                position,
                open,
                candle.ts,
                "STOP LOSS - GAP",
                equity
            );
        }

        if (open >= position.target) {

            return closePosition(
                position,
                open,
                candle.ts,
                "TARGET - GAP",
                equity
            );
        }

        if (low <= position.stop) {

            return closePosition(
                position,
                position.stop,
                candle.ts,
                "STOP LOSS",
                equity
            );
        }

        if (high >= position.target) {

            return closePosition(
                position,
                position.target,
                candle.ts,
                "TARGET",
                equity
            );
        }
    }


    if (position.side === "SELL") {

        if (open >= position.stop) {

            return closePosition(
                position,
                open,
                candle.ts,
                "STOP LOSS - GAP",
                equity
            );
        }

        if (open <= position.target) {

            return closePosition(
                position,
                open,
                candle.ts,
                "TARGET - GAP",
                equity
            );
        }

        if (high >= position.stop) {

            return closePosition(
                position,
                position.stop,
                candle.ts,
                "STOP LOSS",
                equity
            );
        }

        if (low <= position.target) {

            return closePosition(
                position,
                position.target,
                candle.ts,
                "TARGET",
                equity
            );
        }
    }

    return null;
}


// ======================================================
// BACKTEST
// ======================================================

function runBacktest(candles) {

    const trades = [];

    let position = null;

    let cooldown = 0;

    let previousSession = null;

    let previousSignal = "WAIT";

    const equity = {
        equity: 0,
        peak: 0,
        maxDrawdown: 0
    };

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

        const candle = candles[i];

        const session =
            istDate(candle.ts);

        const minutes =
            istMinutes(candle.ts);

        let closedThisCandle = false;


        // --------------------------------------------
        // SESSION CHANGE
        // --------------------------------------------

        if (
            previousSession !== null &&
            session !== previousSession
        ) {

            if (position) {

                const previousCandle =
                    candles[i - 1];

                const trade =
                    closePosition(
                        position,
                        previousCandle.c,
                        previousCandle.ts,
                        "SESSION CLOSE",
                        equity
                    );

                trades.push(trade);

                position = null;

                cooldown =
                    CONFIG.COOLDOWN_CANDLES;

                closedThisCandle = true;
            }

            previousSignal = "WAIT";
        }

        previousSession = session;


        // --------------------------------------------
        // INDICATORS
        // --------------------------------------------

        const indicators =
            historicalIndicators(
                candles,
                i
            );


        // --------------------------------------------
        // SIGNAL
        // --------------------------------------------

        let signalResult = null;
        let signal = "WAIT";

        if (indicators) {

            signalResult =
                getSignal(
                    candle,
                    indicators
                );

            signal =
                signalResult.signal;
        }


        // --------------------------------------------
        // MANAGE POSITION
        // --------------------------------------------

        if (position) {

            const trade =
                managePosition(
                    position,
                    candle,
                    equity
                );

            if (trade) {

                trades.push(trade);

                position = null;

                cooldown =
                    CONFIG.COOLDOWN_CANDLES;

                closedThisCandle = true;
            }
        }


        // --------------------------------------------
        // SESSION CLOSE
        // --------------------------------------------

        if (
            position &&
            minutes >= CONFIG.SESSION_CLOSE_MINUTES
        ) {

            const trade =
                closePosition(
                    position,
                    candle.c,
                    candle.ts,
                    "SESSION CLOSE",
                    equity
                );

            trades.push(trade);

            position = null;

            cooldown =
                CONFIG.COOLDOWN_CANDLES;

            closedThisCandle = true;
        }


        // --------------------------------------------
        // FRESH SIGNAL
        // --------------------------------------------

        const freshSignal =
            signal !== "WAIT" &&
            signal !== previousSignal;

        previousSignal = signal;


        // --------------------------------------------
        // ENTRY FILTERS
        // --------------------------------------------

        if (
            minutes >=
            CONFIG.SESSION_CLOSE_MINUTES
        ) {
            continue;
        }

        if (closedThisCandle) {
            continue;
        }

        if (cooldown > 0) {

            cooldown--;

            continue;
        }

        if (
            minutes <
            CONFIG.ENTRY_START_MINUTES ||
            minutes >
            CONFIG.ENTRY_END_MINUTES
        ) {
            continue;
        }

        if (
            !indicators ||
            !signalResult
        ) {
            continue;
        }

        if (!freshSignal) {
            continue;
        }

        if (i + 1 >= candles.length) {
            continue;
        }


        // --------------------------------------------
        // NEXT CANDLE
        // --------------------------------------------

        const nextCandle =
            candles[i + 1];

        if (
            istDate(nextCandle.ts) !==
            session
        ) {
            continue;
        }


        const entry =
            Number(nextCandle.o);

        const atrValue =
            Number(indicators.atr14);

        if (
            !Number.isFinite(entry) ||
            !Number.isFinite(atrValue) ||
            atrValue <= 0
        ) {
            continue;
        }


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

            buyScore:
                signalResult.buyScore,

            sellScore:
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

            atr14:
                atrValue
        };


        console.log(
            `${VERSION} ENTRY`,
            {
                side,
                entry,
                stop,
                target,
                signal,
                buyScore:
                    signalResult.buyScore,
                sellScore:
                    signalResult.sellScore
            }
        );
    }


    // --------------------------------------------
    // CLOSE FINAL POSITION
    // --------------------------------------------

    if (position) {

        const last =
            candles[candles.length - 1];

        trades.push(
            closePosition(
                position,
                last.c,
                last.ts,
                "END OF DATA",
                equity
            )
        );
    }


    // --------------------------------------------
    // STATS
    // --------------------------------------------

    const totalTrades =
        trades.length;

    const buyTrades =
        trades.filter(
            t => t.side === "BUY"
        ).length;

    const sellTrades =
        trades.filter(
            t => t.side === "SELL"
        ).length;

    const wins =
        trades.filter(
            t => t.points > 0
        );

    const losses =
        trades.filter(
            t => t.points <= 0
        );

    const winningTrades =
        wins.length;

    const losingTrades =
        losses.length;

    const winRate =
        totalTrades > 0
            ? (winningTrades / totalTrades) * 100
            : 0;

    const totalPoints =
        trades.reduce(
            (sum, t) => sum + t.points,
            0
        );

    const averageWin =
        winningTrades > 0
            ? wins.reduce(
                (sum, t) => sum + t.points,
                0
            ) / winningTrades
            : 0;

    const averageLoss =
        losingTrades > 0
            ? Math.abs(
                losses.reduce(
                    (sum, t) => sum + t.points,
                    0
                ) / losingTrades
            )
            : 0;

    const grossProfit =
        wins.reduce(
            (sum, t) => sum + t.points,
            0
        );

    const grossLoss =
        Math.abs(
            losses.reduce(
                (sum, t) => sum + t.points,
                0
            )
        );

    const profitFactor =
        grossLoss > 0
            ? grossProfit / grossLoss
            : grossProfit > 0
                ? Infinity
                : 0;


    return {

        candlesTested:
            candles.length,

        totalTrades,

        buyTrades,

        sellTrades,

        winningTrades,

        losingTrades,

        winRate,

        totalPoints,

        averageWin,

        averageLoss,

        profitFactor,

        maxDrawdown:
            equity.maxDrawdown,

        trades
    };
}


// ======================================================
// API HANDLER
// ======================================================

export default async function handler(req, res) {

    // ==================================================
    // CACHE CONTROL
    // ==================================================

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader(
        "Pragma",
        "no-cache"
    );

    res.setHeader(
        "Expires",
        "0"
    );


    try {

        const token =
            process.env.INDSTOCKS_TOKEN;

        if (!token) {

            return res.status(500).json({

                success: false,

                version: VERSION,

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
            !allowedIntervals.includes(interval)
        ) {

            return res.status(400).json({

                success: false,

                version: VERSION,

                error:
                    "Invalid candle interval"
            });
        }


        // ==================================================
        // NIFTY
        // ==================================================

        const scripCode =
            "NIDX_40000001";


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
        // INDSTOCKS
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
            "===================================="
        );

        console.log(
            `${VERSION} BACKTEST START`
        );

        console.log(
            "URL:",
            url
        );

        console.log(
            "===================================="
        );


        // ==================================================
        // REQUEST
        // ==================================================

        const response =
            await fetch(
                url,
                {
                    method: "GET",

                    headers: {
                        Authorization: token,
                        Accept: "application/json"
                    }
                }
            );


        const text =
            await response.text();


        let result;

        try {

            result =
                JSON.parse(text);

        } catch {

            return res.status(502).json({

                success: false,

                version: VERSION,

                error:
                    "INDstocks returned invalid JSON",

                details:
                    text.slice(0, 1000)
            });
        }


        console.log(
            `${VERSION} INDstocks HTTP:`,
            response.status
        );


        console.log(
            `${VERSION} RESPONSE KEYS:`,
            Object.keys(result || {})
        );


        if (!response.ok) {

            return res.status(
                response.status
            ).json({

                success: false,

                version: VERSION,

                error:
                    "INDstocks request failed",

                details:
                    result
            });
        }


        // ==================================================
        // EXTRACT CANDLES
        // ==================================================

        const rawCandles =
            findCandleArray(result);


        console.log(
            `${VERSION} RAW CANDLES:`,
            Array.isArray(rawCandles)
                ? rawCandles.length
                : 0
        );


        if (
            Array.isArray(rawCandles) &&
            rawCandles.length > 0
        ) {

            console.log(
                `${VERSION} FIRST RAW CANDLE:`,
                rawCandles[0]
            );

            console.log(
                `${VERSION} LAST RAW CANDLE:`,
                rawCandles[
                    rawCandles.length - 1
                ]
            );
        }


        // ==================================================
        // NORMALIZE
        // ==================================================

        const candles =
            normalizeCandles(
                rawCandles
            );


        console.log(
            `${VERSION} NORMALIZED CANDLES:`,
            candles.length
        );


        // ==================================================
        // INSUFFICIENT DATA
        // ==================================================

        if (
            candles.length < 50
        ) {

            return res.status(200).json({

                success: true,

                version: VERSION,

                interval,

                status:
                    "INSUFFICIENT_DATA",

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
        // RUN
        // ==================================================

        const backtest =
            runBacktest(
                candles
            );


        console.log(
            "===================================="
        );

        console.log(
            `${VERSION} BACKTEST COMPLETE`
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
            "Points:",
            backtest.totalPoints
        );

        console.log(
            "Win rate:",
            backtest.winRate
        );

        console.log(
            "Profit factor:",
            backtest.profitFactor
        );

        console.log(
            "===================================="
        );


        // ==================================================
        // RESPONSE
        // ==================================================

        return res.status(200).json({

            success: true,

            version: VERSION,

            interval,

            status:
                "COMPLETED",

            dataSource:
                "INDSTOCKS",

            instrument:
                scripCode,

            candleFormat:
                "normalized OHLCV",

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

    } catch (error) {

        console.error(
            `${VERSION} ERROR:`,
            error
        );

        return res.status(500).json({

            success: false,

            version: VERSION,

            error:
                `${VERSION} backtest failed`,

            details:
                error?.message ||
                "Unknown error"
        });
    }
}

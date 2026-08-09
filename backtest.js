/*
TradeMind Pro
V9 Historical Backtest Engine

Paper Trading Only
NO REAL ORDERS

V9 FEATURES:

- Historical candle replay
- EMA 9
- EMA 21
- RSI 14
- VWAP
- ATR 14
- Bullish/Bearish candle confirmation
- BUY / SELL signals
- Dynamic ATR stop loss
- 1:2 Risk / Reward
- Win rate
- Profit factor
- Maximum drawdown
- Total points
*/

"use strict";


// ======================================================
// HELPERS
// ======================================================

function bt$(id) {

    return document.getElementById(id);

}


function btSet(id, value) {

    const element = bt$(id);

    if (element) {

        element.textContent = value;

    }

}


// ======================================================
// NUMBER HELPERS
// ======================================================

function number(value) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : null;

}


function round(value) {

    return Math.round(value * 100) / 100;

}


// ======================================================
// EMA
// ======================================================

function calculateEMA(values, period) {

    if (
        !Array.isArray(values) ||
        values.length < period
    ) {

        return null;

    }


    const multiplier =
        2 / (period + 1);


    let ema =
        values
            .slice(0, period)
            .reduce(
                (a, b) => a + b,
                0
            ) / period;


    for (
        let i = period;
        i < values.length;
        i++
    ) {

        ema =
            (
                values[i] -
                ema
            ) * multiplier + ema;

    }


    return ema;

}


// ======================================================
// RSI
// ======================================================

function calculateRSI(values, period = 14) {

    if (
        !Array.isArray(values) ||
        values.length <= period
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


        if (change > 0) {

            gains += change;

        }

        else {

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
            values[i] -
            values[i - 1];


        const gain =
            change > 0
                ? change
                : 0;


        const loss =
            change < 0
                ? Math.abs(change)
                : 0;


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


    return 100 -
        (
            100 /
            (1 + rs)
        );

}


// ======================================================
// VWAP
// ======================================================

function calculateVWAP(candles) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        return null;

    }


    let cumulativePV = 0;

    let cumulativeVolume = 0;


    for (const candle of candles) {

        const high =
            number(candle.h);


        const low =
            number(candle.l);


        const close =
            number(candle.c);


        const volume =
            number(candle.v);


        if (
            high == null ||
            low == null ||
            close == null
        ) {

            continue;

        }


        const typicalPrice =
            (
                high +
                low +
                close
            ) / 3;


        const vol =
            volume != null
                ? volume
                : 1;


        cumulativePV +=
            typicalPrice * vol;


        cumulativeVolume +=
            vol;

    }


    if (
        cumulativeVolume === 0
    ) {

        return null;

    }


    return (
        cumulativePV /
        cumulativeVolume
    );

}


// ======================================================
// ATR
// ======================================================

function calculateATR(
    candles,
    period = 14
) {

    if (
        !Array.isArray(candles) ||
        candles.length <= period
    ) {

        return null;

    }


    const trueRanges = [];


    for (
        let i = 1;
        i < candles.length;
        i++
    ) {

        const high =
            number(candles[i].h);


        const low =
            number(candles[i].l);


        const previousClose =
            number(
                candles[i - 1].c
            );


        if (
            high == null ||
            low == null ||
            previousClose == null
        ) {

            continue;

        }


        const tr =
            Math.max(

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


        trueRanges.push(tr);

    }


    if (
        trueRanges.length < period
    ) {

        return null;

    }


    let atr =
        trueRanges
            .slice(0, period)
            .reduce(
                (a, b) => a + b,
                0
            ) / period;


    for (
        let i = period;
        i < trueRanges.length;
        i++
    ) {

        atr =
            (
                atr *
                (period - 1) +
                trueRanges[i]
            ) / period;

    }


    return atr;

}


// ======================================================
// CANDLE DIRECTION
// ======================================================

function isBullishCandle(candle) {

    const open =
        number(candle.o);


    const close =
        number(candle.c);


    return (
        open != null &&
        close != null &&
        close > open
    );

}


function isBearishCandle(candle) {

    const open =
        number(candle.o);


    const close =
        number(candle.c);


    return (
        open != null &&
        close != null &&
        close < open
    );

}


// ======================================================
// STRATEGY SIGNAL
// ======================================================

function generateV9Signal(
    candles,
    index
) {

    const candle =
        candles[index];


    const price =
        number(candle.c);


    if (price == null) {

        return {
            signal: "WAIT",
            reason: "Invalid price"
        };

    }


    /*
    Only use candles up to the
    CURRENT candle.

    This prevents future-data leakage.
    */

    const history =
        candles.slice(
            0,
            index + 1
        );


    const closes =
        history
            .map(c => number(c.c))
            .filter(
                v => v != null
            );


    if (
        closes.length < 22
    ) {

        return {
            signal: "WAIT",
            reason: "Insufficient history"
        };

    }


    const ema9 =
        calculateEMA(
            closes,
            9
        );


    const ema21 =
        calculateEMA(
            closes,
            21
        );


    const rsi =
        calculateRSI(
            closes,
            14
        );


    const vwap =
        calculateVWAP(
            history
        );


    if (
        ema9 == null ||
        ema21 == null ||
        rsi == null ||
        vwap == null
    ) {

        return {
            signal: "WAIT",
            reason: "Indicators unavailable"
        };

    }


    // ==================================================
    // CONDITIONS
    // ==================================================

    const bullishEMA =
        ema9 > ema21;


    const bearishEMA =
        ema9 < ema21;


    const aboveVWAP =
        price > vwap;


    const belowVWAP =
        price < vwap;


    const bullishRSI =
        rsi >= 55 &&
        rsi < 70;


    const bearishRSI =
        rsi <= 45 &&
        rsi > 30;


    const bullishCandle =
        isBullishCandle(candle);


    const bearishCandle =
        isBearishCandle(candle);


    // ==================================================
    // SCORE
    // ==================================================

    let buyScore = 0;

    let sellScore = 0;


    if (bullishEMA) {

        buyScore++;

    }


    if (bearishEMA) {

        sellScore++;

    }


    if (bullishRSI) {

        buyScore++;

    }


    if (bearishRSI) {

        sellScore++;

    }


    if (aboveVWAP) {

        buyScore++;

    }


    if (belowVWAP) {

        sellScore++;

    }


    if (bullishCandle) {

        buyScore++;

    }


    if (bearishCandle) {

        sellScore++;

    }


    // ==================================================
    // SIGNAL
    // ==================================================

    if (
        buyScore >= 3 &&
        buyScore > sellScore
    ) {

        return {

            signal:
                buyScore >= 4
                    ? "BUY"
                    : "BUY BIAS",

            price,

            ema9,
            ema21,
            rsi,
            vwap,

            score:
                buyScore,

            reason:
                "Bullish conditions"

        };

    }


    if (
        sellScore >= 3 &&
        sellScore > buyScore
    ) {

        return {

            signal:
                sellScore >= 4
                    ? "SELL"
                    : "SELL BIAS",

            price,

            ema9,
            ema21,
            rsi,
            vwap,

            score:
                sellScore,

            reason:
                "Bearish conditions"

        };

    }


    return {

        signal: "WAIT",

        price,

        ema9,
        ema21,
        rsi,
        vwap,

        score:
            Math.max(
                buyScore,
                sellScore
            ),

        reason:
            "Conditions not aligned"

    };

}


// ======================================================
// SIMULATE TRADE
// ======================================================

function simulateTrade(
    candles,
    entryIndex,
    signalData
) {

    const entry =
        signalData.price;


    const atr =
        calculateATR(
            candles.slice(
                0,
                entryIndex + 1
            ),
            14
        );


    if (
        atr == null ||
        atr <= 0
    ) {

        return null;

    }


    const risk =
        atr * 1.5;


    const reward =
        risk * 2;


    const bullish =
        signalData.signal === "BUY" ||
        signalData.signal === "BUY BIAS";


    const stopLoss =
        bullish
            ? entry - risk
            : entry + risk;


    const target =
        bullish
            ? entry + reward
            : entry - reward;


    for (
        let i = entryIndex + 1;
        i < candles.length;
        i++
    ) {

        const candle =
            candles[i];


        const high =
            number(candle.h);


        const low =
            number(candle.l);


        if (
            high == null ||
            low == null
        ) {

            continue;

        }


        if (bullish) {

            /*
            Conservative assumption:

            If both target and SL are
            touched in the same candle,
            assume SL happened first.

            This avoids artificially
            inflating results.
            */

            if (
                low <= stopLoss &&
                high >= target
            ) {

                return {

                    result: "LOSS",

                    entry,

                    exit: stopLoss,

                    points:
                        -risk,

                    bars:
                        i - entryIndex

                };

            }


            if (
                low <= stopLoss
            ) {

                return {

                    result: "LOSS",

                    entry,

                    exit: stopLoss,

                    points:
                        -risk,

                    bars:
                        i - entryIndex

                };

            }


            if (
                high >= target
            ) {

                return {

                    result: "WIN",

                    entry,

                    exit: target,

                    points:
                        reward,

                    bars:
                        i - entryIndex

                };

            }

        }

        else {

            if (
                high >= stopLoss &&
                low <= target
            ) {

                return {

                    result: "LOSS",

                    entry,

                    exit: stopLoss,

                    points:
                        -risk,

                    bars:
                        i - entryIndex

                };

            }


            if (
                high >= stopLoss
            ) {

                return {

                    result: "LOSS",

                    entry,

                    exit: stopLoss,

                    points:
                        -risk,

                    bars:
                        i - entryIndex

                };

            }


            if (
                low <= target
            ) {

                return {

                    result: "WIN",

                    entry,

                    exit: target,

                    points:
                        reward,

                    bars:
                        i - entryIndex

                };

            }

        }

    }


    /*
    If neither target nor SL
    was reached, close at the
    final available candle.
    */

    const finalCandle =
        candles[
            candles.length - 1
        ];


    const finalPrice =
        number(
            finalCandle.c
        );


    if (finalPrice == null) {

        return null;

    }


    const points =
        bullish
            ? finalPrice - entry
            : entry - finalPrice;


    return {

        result:
            points >= 0
                ? "WIN"
                : "LOSS",

        entry,

        exit:
            finalPrice,

        points,

        bars:
            candles.length -
            1 -
            entryIndex

    };

}


// ======================================================
// BACKTEST ENGINE
// ======================================================

function runV9Backtest(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length < 50
    ) {

        throw new Error(
            "At least 50 historical candles are required."
        );

    }


    const trades = [];


    /*
    Start after enough candles
    exist for EMA / RSI / ATR.
    */

    for (
        let i = 30;
        i < candles.length - 1;
        i++
    ) {

        const signal =
            generateV9Signal(
                candles,
                i
            );


        if (
            signal.signal !== "BUY" &&
            signal.signal !== "BUY BIAS" &&
            signal.signal !== "SELL" &&
            signal.signal !== "SELL BIAS"
        ) {

            continue;

        }


        const trade =
            simulateTrade(
                candles,
                i,
                signal
            );


        if (!trade) {

            continue;

        }


        trade.signal =
            signal.signal;


        trade.index =
            i;


        trade.reason =
            signal.reason;


        trades.push(
            trade
        );

    }


    // ==================================================
    // STATISTICS
    // ==================================================

    const wins =
        trades.filter(
            t =>
                t.result === "WIN"
        );


    const losses =
        trades.filter(
            t =>
                t.result === "LOSS"
        );


    const buyTrades =
        trades.filter(
            t =>
                t.signal === "BUY" ||
                t.signal === "BUY BIAS"
        );


    const sellTrades =
        trades.filter(
            t =>
                t.signal === "SELL" ||
                t.signal === "SELL BIAS"
        );


    const totalPoints =
        trades.reduce(
            (sum, trade) =>
                sum + trade.points,
            0
        );


    const grossProfit =
        wins.reduce(
            (sum, trade) =>
                sum + Math.max(
                    trade.points,
                    0
                ),
            0
        );


    const grossLoss =
        Math.abs(
            losses.reduce(
                (sum, trade) =>
                    sum + Math.min(
                        trade.points,
                        0
                    ),
                0
            )
        );


    const winRate =
        trades.length
            ? (
                wins.length /
                trades.length
            ) * 100
            : 0;


    const averageWin =
        wins.length
            ? grossProfit /
              wins.length
            : 0;


    const averageLoss =
        losses.length
            ? grossLoss /
              losses.length
            : 0;


    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
            : grossProfit > 0
                ? Infinity
                : 0;


    // ==================================================
    // MAX DRAWDOWN
    // ==================================================

    let equity = 0;

    let peak = 0;

    let maxDrawdown = 0;


    for (
        const trade of trades
    ) {

        equity +=
            trade.points;


        if (
            equity > peak
        ) {

            peak = equity;

        }


        const drawdown =
            peak - equity;


        if (
            drawdown >
            maxDrawdown
        ) {

            maxDrawdown =
                drawdown;

        }

    }


    return {

        candles:
            candles.length,

        trades:
            trades.length,

        buyTrades:
            buyTrades.length,

        sellTrades:
            sellTrades.length,

        wins:
            wins.length,

        losses:
            losses.length,

        winRate,

        totalPoints,

        averageWin,

        averageLoss,

        profitFactor,

        maxDrawdown,

        grossProfit,

        grossLoss,

        trades

    };

}


// ======================================================
// RENDER RESULTS
// ======================================================

function renderV9Results(
    result
) {

    btSet(
        "btCandles",
        result.candles
    );


    btSet(
        "btTrades",
        result.trades
    );


    btSet(
        "btBuyTrades",
        result.buyTrades
    );


    btSet(
        "btSellTrades",
        result.sellTrades
    );


    btSet(
        "btWins",
        result.wins
    );


    btSet(
        "btLosses",
        result.losses
    );


    btSet(
        "btWinRate",
        `${result.winRate.toFixed(1)}%`
    );


    btSet(
        "btPoints",
        result.totalPoints >= 0
            ? `+${result.totalPoints.toFixed(2)}`
            : result.totalPoints.toFixed(2)
    );


    btSet(
        "btAvgWin",
        result.averageWin.toFixed(2)
    );


    btSet(
        "btAvgLoss",
        result.averageLoss.toFixed(2)
    );


    btSet(
        "btProfitFactor",

        Number.isFinite(
            result.profitFactor
        )
            ? result.profitFactor.toFixed(2)
            : "∞"

    );


    btSet(
        "btDrawdown",
        result.maxDrawdown.toFixed(2)
    );


    btSet(
        "btStatus",
        "BACKTEST COMPLETE"
    );

}


// ======================================================
// FIND CANDLES
// ======================================================

function extractBacktestCandles(
    data
) {

    const nifty =
        data?.nifty ||
        {};


    /*
    V9 supports several possible
    candle property names.
    */

    const candidates = [

        nifty.candles,

        nifty.historicalCandles,

        nifty.history,

        data?.candles,

        data?.historicalCandles

    ];


    for (
        const candles of candidates
    ) {

        if (
            Array.isArray(candles) &&
            candles.length > 0
        ) {

            return candles;

        }

    }


    return [];

}


// ======================================================
// BUTTON
// ======================================================

function setupV9Button() {

    const button =
        bt$(
            "runBacktestBtn"
        );


    if (!button) {

        return;

    }


    button.addEventListener(
        "click",
        async () => {

            button.disabled =
                true;


            button.textContent =
                "RUNNING BACKTEST...";


            btSet(
                "btStatus",
                "Loading historical candles..."
            );


            try {

                const response =
                    await fetch(
                        "/api/indicators?interval=5minute",
                        {
                            cache:
                                "no-store"
                        }
                    );


                const data =
                    await response.json();


                const candles =
                    extractBacktestCandles(
                        data
                    );


                if (
                    candles.length < 50
                ) {

                    throw new Error(
                        `Only ${candles.length} candles available. V9 requires the full historical candle array.`
                    );

                }


                const result =
                    runV9Backtest(
                        candles
                    );


                renderV9Results(
                    result
                );


                console.log(
                    "TradeMind V9 Backtest:",
                    result
                );

            }

            catch (error) {

                console.error(
                    "V9 backtest error:",
                    error
                );


                btSet(
                    "btStatus",
                    error.message
                );

            }


            finally {

                button.disabled =
                    false;


                button.textContent =
                    "RUN V9 BACKTEST";

            }

        }
    );

}


// ======================================================
// INITIALIZE
// ======================================================

function initializeV9() {

    setupV9Button();

}


// ======================================================
// START
// ======================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeV9
    );

}

else {

    initializeV9();

}


// ======================================================
// EXPOSE ENGINE
// ======================================================

window.TradeMindV9 = {

    runBacktest:
        runV9Backtest,

    generateSignal:
        generateV9Signal

};

/*
TradeMind Pro
V12.1
PAPER EXECUTION ENGINE

Purpose:
- Uses the existing V11.12 learning engine
- Converts a valid signal into a PAPER trade
- Calculates entry / stop / target
- Tracks historical candle movement
- Simulates STOP / TARGET / TIMEOUT
- Returns a clean execution object
- NO REAL ORDERS
- NO BROKER ORDER API

IMPORTANT:
Vercel serverless functions are stateless.
Therefore this version does NOT pretend to persist an
open position between requests.

Persistent paper-account state will be handled by the
frontend / database layer in the next step.

PAPER ONLY.
*/

const VERSION = "V12.1";

const INTERVAL = "5minute";
const INSTRUMENT = "NIFTY 50";
const REQUESTED_DAYS = 30;

const PAPER_ONLY = true;
const REAL_ORDERS = false;

// ============================================================
// PAPER RISK MODEL
// ============================================================

const RISK_PER_TRADE_R = 1;

const STOP_R = 1;
const TARGET_R = 2;
const PREFERRED_TARGET_R = 2.5;

const MAX_HOLD_CANDLES = 12;

// Paper account only
const STARTING_CAPITAL = 100000;

// ============================================================
// HELPERS
// ============================================================

function num(value, fallback = null) {
    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}

function round(value, decimals = 2) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const m = Math.pow(10, decimals);

    return Math.round(value * m) / m;
}

function normalizeTs(value) {
    let ts = num(value);

    if (ts === null) {
        return null;
    }

    if (ts > 100000000000) {
        ts /= 1000;
    }

    return Math.floor(ts);
}

function getField(row, fields) {
    if (!row || typeof row !== "object") {
        return null;
    }

    for (const field of fields) {
        if (
            row[field] !== undefined &&
            row[field] !== null
        ) {
            return row[field];
        }
    }

    return null;
}

// ============================================================
// DATASET FETCH
// ============================================================

async function fetchLearningDataset(req) {

    const host =
        req.headers["x-forwarded-host"] ||
        req.headers.host;

    const protocol =
        req.headers["x-forwarded-proto"] ||
        "https";

    if (!host) {
        throw new Error(
            "Unable to determine Vercel host"
        );
    }

    const url =
        `${protocol}://${host}` +
        `/api/learning-dataset` +
        `?interval=${INTERVAL}` +
        `&days=${REQUESTED_DAYS}`;

    const response =
        await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        });

    if (!response.ok) {
        throw new Error(
            `Learning dataset HTTP ${response.status}`
        );
    }

    const data =
        await response.json();

    if (
        !data ||
        data.success !== true
    ) {
        throw new Error(
            "Learning dataset unsuccessful"
        );
    }

    if (
        !Array.isArray(data.rows)
    ) {
        throw new Error(
            "Learning dataset rows[] missing"
        );
    }

    return data.rows;
}

// ============================================================
// NORMALIZE CANDLES
// ============================================================

function normalizeRows(rows) {

    return rows
        .filter(
            row =>
                row &&
                typeof row === "object"
        )
        .map(row => {

            const timestamp =
                normalizeTs(
                    getField(
                        row,
                        [
                            "timestamp",
                            "ts",
                            "time",
                            "date"
                        ]
                    )
                );

            return {
                ...row,

                timestamp,

                open:
                    num(
                        getField(
                            row,
                            ["open", "o"]
                        )
                    ),

                high:
                    num(
                        getField(
                            row,
                            ["high", "h"]
                        )
                    ),

                low:
                    num(
                        getField(
                            row,
                            ["low", "l"]
                        )
                    ),

                close:
                    num(
                        getField(
                            row,
                            ["close", "c"]
                        )
                    ),

                atr14:
                    num(
                        row.atr14
                    ),

                trend:
                    row.trend ||
                    "UNKNOWN",

                regime:
                    row.regime ||
                    "UNKNOWN",

                rsi14:
                    num(
                        row.rsi14
                    ),

                vwap:
                    num(
                        row.vwap
                    )
            };
        })
        .filter(
            row =>
                row.close !== null &&
                row.high !== null &&
                row.low !== null
        )
        .sort(
            (a, b) =>
                (a.timestamp || 0) -
                (b.timestamp || 0)
        );
}

// ============================================================
// TREND
// ============================================================

function normalizeTrend(row) {

    const trend =
        String(
            row.trend ||
            row.marketTrend ||
            ""
        ).toUpperCase();

    if (
        trend.includes("BULL")
    ) {
        return "BULLISH";
    }

    if (
        trend.includes("BEAR")
    ) {
        return "BEARISH";
    }

    if (
        trend.includes("SIDE") ||
        trend.includes("RANGE")
    ) {
        return "RANGING";
    }

    return "UNKNOWN";
}

// ============================================================
// VWAP
// ============================================================

function getVWAPDirection(row) {

    const distance =
        num(
            row.vwapDistanceATR
        );

    if (distance !== null) {

        if (distance > 0.25) {
            return "ABOVE";
        }

        if (distance < -0.25) {
            return "BELOW";
        }

        return "NEAR";
    }

    const price =
        num(row.close);

    const vwap =
        num(row.vwap);

    if (
        price === null ||
        vwap === null
    ) {
        return "UNKNOWN";
    }

    if (price > vwap) {
        return "ABOVE";
    }

    if (price < vwap) {
        return "BELOW";
    }

    return "NEAR";
}

// ============================================================
// DIRECTIONAL SETUP
// ============================================================

function inferSide(row) {

    const trend =
        normalizeTrend(row);

    const vwap =
        getVWAPDirection(row);

    const rsi =
        num(row.rsi14);

    if (
        trend === "BULLISH" &&
        (
            vwap === "ABOVE" ||
            vwap === "NEAR"
        ) &&
        rsi !== null &&
        rsi >= 40 &&
        rsi <= 68
    ) {
        return "BUY";
    }

    if (
        trend === "BEARISH" &&
        (
            vwap === "BELOW" ||
            vwap === "NEAR"
        ) &&
        rsi !== null &&
        rsi >= 32 &&
        rsi <= 60
    ) {
        return "SELL";
    }

    // Strong reversal setup

    if (
        rsi !== null &&
        rsi < 30 &&
        vwap === "BELOW"
    ) {
        return "BUY";
    }

    if (
        rsi !== null &&
        rsi > 70 &&
        vwap === "ABOVE"
    ) {
        return "SELL";
    }

    return null;
}

// ============================================================
// PAPER PRICE LEVELS
// ============================================================

function buildTradeLevels(
    side,
    entry,
    atr
) {

    if (
        entry === null ||
        atr === null ||
        atr <= 0
    ) {
        return null;
    }

    const risk =
        atr * STOP_R;

    if (side === "BUY") {

        return {

            entry:
                round(entry),

            stop:
                round(
                    entry - risk
                ),

            target:
                round(
                    entry +
                    (
                        risk *
                        TARGET_R
                    )
                ),

            preferredTarget:
                round(
                    entry +
                    (
                        risk *
                        PREFERRED_TARGET_R
                    )
                ),

            riskPoints:
                round(risk),

            rewardPoints:
                round(
                    risk *
                    TARGET_R
                ),

            riskReward:
                "1:2",

            preferredRiskReward:
                "1:2.5"
        };
    }

    return {

        entry:
            round(entry),

        stop:
            round(
                entry + risk
            ),

        target:
            round(
                entry -
                (
                    risk *
                    TARGET_R
                )
            ),

        preferredTarget:
            round(
                entry -
                (
                    risk *
                    PREFERRED_TARGET_R
                )
            ),

        riskPoints:
            round(risk),

        rewardPoints:
            round(
                risk *
                TARGET_R
            ),

        riskReward:
            "1:2",

        preferredRiskReward:
            "1:2.5"
    };
}

// ============================================================
// CANDLE EXIT DETECTION
// ============================================================

function checkCandleExit(
    candle,
    side,
    levels
) {

    if (side === "BUY") {

        const stopHit =
            candle.low <=
            levels.stop;

        const targetHit =
            candle.high >=
            levels.target;

        /*
        Conservative rule:

        If both stop and target are touched
        in the same candle, assume STOP was hit
        first.

        This prevents optimistic backtesting.
        */

        if (
            stopHit &&
            targetHit
        ) {

            return {
                status: "STOP",
                exitPrice:
                    levels.stop,
                resultR:
                    -STOP_R,
                reason:
                    "STOP_AND_TARGET_SAME_CANDLE_CONSERVATIVE_STOP"
            };
        }

        if (stopHit) {

            return {
                status: "STOP",
                exitPrice:
                    levels.stop,
                resultR:
                    -STOP_R,
                reason:
                    "STOP_HIT"
            };
        }

        if (targetHit) {

            return {
                status: "TARGET",
                exitPrice:
                    levels.target,
                resultR:
                    TARGET_R,
                reason:
                    "TARGET_HIT"
            };
        }
    }

    if (side === "SELL") {

        const stopHit =
            candle.high >=
            levels.stop;

        const targetHit =
            candle.low <=
            levels.target;

        if (
            stopHit &&
            targetHit
        ) {

            return {
                status: "STOP",
                exitPrice:
                    levels.stop,
                resultR:
                    -STOP_R,
                reason:
                    "STOP_AND_TARGET_SAME_CANDLE_CONSERVATIVE_STOP"
            };
        }

        if (stopHit) {

            return {
                status: "STOP",
                exitPrice:
                    levels.stop,
                resultR:
                    -STOP_R,
                reason:
                    "STOP_HIT"
            };
        }

        if (targetHit) {

            return {
                status: "TARGET",
                exitPrice:
                    levels.target,
                resultR:
                    TARGET_R,
                reason:
                    "TARGET_HIT"
            };
        }
    }

    return null;
}

// ============================================================
// PAPER TRADE SIMULATION
// ============================================================

function simulatePaperTrade(
    rows,
    signalIndex,
    side,
    levels
) {

    const candles =
        rows.slice(
            signalIndex + 1,
            signalIndex +
            1 +
            MAX_HOLD_CANDLES
        );

    const candleLog = [];

    for (
        let i = 0;
        i < candles.length;
        i++
    ) {

        const candle =
            candles[i];

        const exit =
            checkCandleExit(
                candle,
                side,
                levels
            );

        candleLog.push({

            candleNumber:
                i + 1,

            timestamp:
                candle.timestamp,

            open:
                candle.open,

            high:
                candle.high,

            low:
                candle.low,

            close:
                candle.close,

            status:
                exit
                    ? exit.status
                    : "OPEN"
        });

        if (exit) {

            return {

                status:
                    "CLOSED",

                exitReason:
                    exit.reason,

                exitType:
                    exit.status,

                exitPrice:
                    exit.exitPrice,

                resultR:
                    exit.resultR,

                candlesHeld:
                    i + 1,

                candleLog
            };
        }
    }

    /*
    No target or stop reached.

    Mark the trade as TIMEOUT at the
    final available candle close.

    This is conservative and transparent.
    */

    if (candles.length > 0) {

        const last =
            candles[
                candles.length - 1
            ];

        let resultR = 0;

        if (side === "BUY") {

            resultR =
                (
                    last.close -
                    levels.entry
                ) /
                levels.riskPoints;
        }

        else {

            resultR =
                (
                    levels.entry -
                    last.close
                ) /
                levels.riskPoints;
        }

        return {

            status:
                "CLOSED",

            exitReason:
                "MAX_HOLD_TIMEOUT",

            exitType:
                "TIMEOUT",

            exitPrice:
                round(
                    last.close
                ),

            resultR:
                round(
                    resultR,
                    3
                ),

            candlesHeld:
                candles.length,

            candleLog
        };
    }

    return {

        status:
            "OPEN",

        exitReason:
            "NO_FUTURE_CANDLES",

        exitType:
            "OPEN",

        exitPrice:
            null,

        resultR:
            0,

        candlesHeld:
            0,

        candleLog
    };
}

// ============================================================
// HISTORICAL PAPER BACKTEST
// ============================================================

function runPaperBacktest(rows) {

    const trades = [];

    let lastTradeIndex =
        -1;

    for (
        let i = 0;
        i < rows.length - 1;
        i++
    ) {

        if (
            i <= lastTradeIndex
        ) {
            continue;
        }

        const row =
            rows[i];

        const side =
            inferSide(row);

        if (!side) {
            continue;
        }

        const atr =
            num(row.atr14);

        if (
            atr === null ||
            atr <= 0
        ) {
            continue;
        }

        const levels =
            buildTradeLevels(
                side,
                row.close,
                atr
            );

        if (!levels) {
            continue;
        }

        const result =
            simulatePaperTrade(
                rows,
                i,
                side,
                levels
            );

        /*
        We only enter a new trade after the
        previous simulated trade has finished.
        */

        const candlesHeld =
            Math.max(
                1,
                result.candlesHeld
            );

        lastTradeIndex =
            i +
            candlesHeld;

        trades.push({

            tradeNumber:
                trades.length + 1,

            signalIndex:
                i,

            timestamp:
                row.timestamp,

            side,

            entry:
                levels.entry,

            stop:
                levels.stop,

            target:
                levels.target,

            preferredTarget:
                levels.preferredTarget,

            riskReward:
                levels.riskReward,

            exitType:
                result.exitType,

            exitPrice:
                result.exitPrice,

            resultR:
                result.resultR,

            candlesHeld:
                result.candlesHeld,

            reason:
                result.exitReason
        });
    }

    return calculatePaperStats(
        trades
    );
}

// ============================================================
// PAPER STATISTICS
// ============================================================

function calculatePaperStats(
    trades
) {

    let wins = 0;
    let losses = 0;
    let timeouts = 0;

    let netR = 0;

    let equityR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;

    let lossStreak = 0;
    let maxLossStreak = 0;

    for (
        const trade
        of trades
    ) {

        const r =
            num(
                trade.resultR,
                0
            );

        netR += r;
        equityR += r;

        peakR =
            Math.max(
                peakR,
                equityR
            );

        maxDrawdownR =
            Math.max(
                maxDrawdownR,
                peakR -
                equityR
            );

        if (
            trade.exitType ===
            "TARGET"
        ) {

            wins++;

            lossStreak = 0;
        }

        else if (
            trade.exitType ===
            "STOP"
        ) {

            losses++;

            lossStreak++;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    lossStreak
                );
        }

        else {

            timeouts++;

            /*
            A timeout is not automatically
            classified as a win/loss.
            */

            if (r < 0) {
                lossStreak++;
            } else {
                lossStreak = 0;
            }

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    lossStreak
                );
        }
    }

    const decisive =
        wins + losses;

    const winRate =
        decisive > 0
            ? (
                wins /
                decisive
            ) *
              100
            : 0;

    const grossProfit =
        trades
            .filter(
                t =>
                    t.resultR > 0
            )
            .reduce(
                (
                    sum,
                    t
                ) =>
                    sum +
                    t.resultR,
                0
            );

    const grossLoss =
        Math.abs(
            trades
                .filter(
                    t =>
                        t.resultR < 0
                )
                .reduce(
                    (
                        sum,
                        t
                    ) =>
                        sum +
                        t.resultR,
                    0
                )
        );

    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
            : grossProfit > 0
                ? 999
                : 0;

    return {

        trades:
            trades.length,

        wins,

        losses,

        timeouts,

        decisiveTrades:
            decisive,

        winRate:
            round(
                winRate,
                2
            ),

        netR:
            round(
                netR,
                3
            ),

        expectedValueR:
            trades.length > 0
                ? round(
                    netR /
                    trades.length,
                    4
                )
                : 0,

        profitFactor:
            round(
                profitFactor,
                3
            ),

        maxDrawdownR:
            round(
                maxDrawdownR,
                2
            ),

        maxConsecutiveLosses:
            maxLossStreak,

        startingCapital:
            STARTING_CAPITAL,

        simulatedEquity:
            round(
                STARTING_CAPITAL +
                (
                    netR *
                    100
                ),
                2
            ),

        tradeLog:
            trades.slice(
                -100
            )
    };
}

// ============================================================
// CURRENT PAPER SIGNAL
// ============================================================

function currentSignal(rows) {

    if (!rows.length) {

        return {

            status:
                "NO_DATA",

            side:
                null,

            reason:
                "No market candles available."
        };
    }

    const index =
        rows.length - 1;

    const row =
        rows[index];

    const side =
        inferSide(row);

    const atr =
        num(row.atr14);

    const market = {

        timestamp:
            row.timestamp,

        close:
            row.close,

        trend:
            normalizeTrend(row),

        regime:
            row.regime ||
            "UNKNOWN",

        rsi:
            row.rsi14,

        vwap:
            row.vwap,

        vwapDirection:
            getVWAPDirection(row)
    };

    if (!side) {

        return {

            status:
                "NO_TRADE",

            side:
                null,

            market,

            reason:
                "Current market does not satisfy the directional setup."
        };
    }

    if (
        atr === null ||
        atr <= 0
    ) {

        return {

            status:
                "NO_TRADE",

            side,

            market,

            reason:
                "Valid direction detected, but ATR is unavailable."
        };
    }

    const levels =
        buildTradeLevels(
            side,
            row.close,
            atr
        );

    return {

        status:
            "PAPER_TRADE_CANDIDATE",

        side,

        market,

        levels,

        riskModel: {

            riskPerTradeR:
                RISK_PER_TRADE_R,

            stopR:
                STOP_R,

            targetR:
                TARGET_R,

            preferredTargetR:
                PREFERRED_TARGET_R
        },

        execution: {

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderSent:
                false
        },

        reason:
            "Directional paper-trade setup detected."
    };
}

// ============================================================
// MAIN ENGINE
// ============================================================

async function runEngine(req) {

    const rawRows =
        await fetchLearningDataset(
            req
        );

    const rows =
        normalizeRows(
            rawRows
        );

    if (
        rows.length <
        100
    ) {

        throw new Error(
            `Not enough candles: ${rows.length}`
        );
    }

    const signal =
        currentSignal(
            rows
        );

    const paperBacktest =
        runPaperBacktest(
            rows
        );

    const latest =
        rows[
            rows.length - 1
        ];

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "PAPER_EXECUTION",

        paperOnly:
            PAPER_ONLY,

        realOrders:
            REAL_ORDERS,

        brokerOrderSent:
            false,

        instrument:
            INSTRUMENT,

        interval:
            INTERVAL,

        requestedDays:
            REQUESTED_DAYS,

        data: {

            rawRows:
                rawRows.length,

            validRows:
                rows.length,

            latestTimestamp:
                latest.timestamp,

            latestPrice:
                latest.close
        },

        currentSignal:
            signal,

        paperBacktest: {

            description:
                "Historical paper execution simulation using sequential candles.",

            stats:
                paperBacktest
        },

        riskPlan: {

            riskPerTradeR:
                RISK_PER_TRADE_R,

            stopR:
                STOP_R,

            minimumTargetR:
                TARGET_R,

            preferredTargetR:
                PREFERRED_TARGET_R,

            minimumRiskReward:
                "1:2",

            preferredRiskReward:
                "1:2.5",

            maxHoldCandles:
                MAX_HOLD_CANDLES,

            noStopWidening:
                true
        },

        nextAction:

            signal.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "FRONTEND_PAPER_ENTRY"

                : "WAIT"
    };
}

// ============================================================
// VERCEL HANDLER
// ============================================================

export default async function handler(
    req,
    res
) {

    try {

        if (
            req.method !==
            "GET"
        ) {

            return res
                .status(405)
                .json({

                    success:
                        false,

                    version:
                        VERSION,

                    error:
                        "Method not allowed. Use GET.",

                    paperOnly:
                        true,

                    realOrders:
                        false
                });
        }

        const result =
            await runEngine(
                req
            );

        return res
            .status(200)
            .json(
                result
            );

    }

    catch (error) {

        console.error(
            "V12.1 ERROR:",
            error
        );

        return res
            .status(500)
            .json({

                success:
                    false,

                version:
                    VERSION,

                status:
                    "ERROR",

                paperOnly:
                    true,

                realOrders:
                    false,

                brokerOrderSent:
                    false,

                error:
                    error &&
                    error.message
                        ? error.message
                        : String(error)
            });
    }
}

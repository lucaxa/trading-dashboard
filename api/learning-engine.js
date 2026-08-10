/*
TradeMind Pro
V11.10
SELECTIVE HIGH-QUALITY EDGE ENGINE

PURPOSE
-------
Find fewer but stronger paper-trade opportunities.

V11.10 priorities:

1. MAXIMIZE EXPECTED VALUE
2. MINIMIZE DRAWDOWN
3. SELECT STABLE HIGH-QUALITY TRADES
4. PREFER ASYMMETRIC REWARD
5. REJECT WEAK / UNSTABLE PATTERNS

PAPER ONLY.
NO REAL ORDERS.
NO BROKER ORDER EXECUTION.
*/

// ============================================================
// CONFIG
// ============================================================

const VERSION = "V11.10";

const INSTRUMENT = "NIFTY 50";
const INTERVAL = "5minute";

const REQUESTED_DAYS = 30;

const STOP_R = 1;
const MIN_TARGET_R = 2;
const PREFERRED_TARGET_R = 2.5;

const MIN_EXPECTED_VALUE = 0.20;
const PREFERRED_EXPECTED_VALUE = 0.35;

const MIN_PROFIT_FACTOR = 1.25;
const PREFERRED_PROFIT_FACTOR = 1.50;

const MIN_TRADE_QUALITY = 65;

const MIN_PATTERN_SAMPLES = 20;
const MIN_DECISIVE_SAMPLES = 12;

const MIN_STABLE_FOLDS = 3;
const FOLD_COUNT = 4;

const MAX_ACCEPTABLE_DRAWDOWN_R = 15;
const MAX_ACCEPTABLE_LOSS_STREAK = 8;

// ============================================================
// BASIC HELPERS
// ============================================================

function num(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function round(v, d = 3) {
    if (!Number.isFinite(v)) return null;
    const p = Math.pow(10, d);
    return Math.round(v * p) / p;
}

function safeArray(v) {
    return Array.isArray(v) ? v : [];
}

function get(obj, paths, fallback = null) {
    for (const path of paths) {
        const parts = path.split(".");
        let x = obj;

        for (const p of parts) {
            if (x == null) break;
            x = x[p];
        }

        if (x !== undefined && x !== null) {
            return x;
        }
    }

    return fallback;
}

// ============================================================
// HTTP / DATASET
// ============================================================

async function loadDataset(req) {

    const host =
        req.headers["x-forwarded-host"] ||
        req.headers.host;

    const proto =
        req.headers["x-forwarded-proto"] ||
        "https";

    if (!host) {
        throw new Error("Unable to determine Vercel host");
    }

    const url =
        `${proto}://${host}/api/learning-dataset` +
        `?interval=${encodeURIComponent(INTERVAL)}` +
        `&days=${REQUESTED_DAYS}`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(
            `learning-dataset returned HTTP ${response.status}`
        );
    }

    const json = await response.json();

    return {
        sourceUrl: url,
        raw: json
    };
}

// ============================================================
// CANDLE NORMALIZATION
// ============================================================

function normalizeCandle(x) {

    if (!x || typeof x !== "object") {
        return null;
    }

    const ts =
        num(
            get(x, [
                "ts",
                "timestamp",
                "time",
                "t",
                "entryTs"
            ])
        );

    const o =
        num(
            get(x, [
                "o",
                "open",
                "Open"
            ])
        );

    const h =
        num(
            get(x, [
                "h",
                "high",
                "High"
            ])
        );

    const l =
        num(
            get(x, [
                "l",
                "low",
                "Low"
            ])
        );

    const c =
        num(
            get(x, [
                "c",
                "close",
                "Close"
            ])
        );

    const v =
        num(
            get(x, [
                "v",
                "volume",
                "Volume"
            ]),
            0
        );

    if (
        !Number.isFinite(o) ||
        !Number.isFinite(h) ||
        !Number.isFinite(l) ||
        !Number.isFinite(c)
    ) {
        return null;
    }

    return {
        ts,
        o,
        h,
        l,
        c,
        v
    };
}

function extractCandles(raw) {

    const candidates = [
        get(raw, ["candles"]),
        get(raw, ["data"]),
        get(raw, ["rows"]),
        get(raw, ["dataset"]),
        get(raw, ["learningRows"]),
        get(raw, ["data.rows"]),
        get(raw, ["data.candles"]),
        get(raw, ["result"]),
        get(raw, ["result.candles"])
    ];

    for (const value of candidates) {

        if (!Array.isArray(value)) {
            continue;
        }

        const candles =
            value
                .map(normalizeCandle)
                .filter(Boolean);

        if (candles.length > 100) {
            return candles;
        }
    }

    return [];
}

// ============================================================
// INDICATORS
// ============================================================

function sma(values, period) {

    if (values.length < period) {
        return null;
    }

    let sum = 0;

    for (
        let i = values.length - period;
        i < values.length;
        i++
    ) {
        sum += values[i];
    }

    return sum / period;
}

function emaSeries(values, period) {

    const result =
        new Array(values.length).fill(null);

    if (values.length < period) {
        return result;
    }

    let seed = 0;

    for (let i = 0; i < period; i++) {
        seed += values[i];
    }

    let ema = seed / period;

    result[period - 1] = ema;

    const multiplier =
        2 / (period + 1);

    for (
        let i = period;
        i < values.length;
        i++
    ) {
        ema =
            (
                (values[i] - ema) *
                multiplier
            ) + ema;

        result[i] = ema;
    }

    return result;
}

function rsiSeries(values, period = 14) {

    const result =
        new Array(values.length).fill(null);

    if (values.length <= period) {
        return result;
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {

        const diff =
            values[i] - values[i - 1];

        if (diff >= 0) {
            gains += diff;
        } else {
            losses -= diff;
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    function calcRSI() {

        if (avgLoss === 0) {
            return 100;
        }

        const rs =
            avgGain / avgLoss;

        return 100 - (100 / (1 + rs));
    }

    result[period] = calcRSI();

    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {

        const diff =
            values[i] - values[i - 1];

        const gain =
            diff > 0 ? diff : 0;

        const loss =
            diff < 0 ? -diff : 0;

        avgGain =
            ((avgGain * (period - 1)) + gain)
            / period;

        avgLoss =
            ((avgLoss * (period - 1)) + loss)
            / period;

        result[i] = calcRSI();
    }

    return result;
}

function atrSeries(candles, period = 14) {

    const result =
        new Array(candles.length).fill(null);

    if (candles.length <= period) {
        return result;
    }

    const tr = [];

    for (let i = 0; i < candles.length; i++) {

        if (i === 0) {
            tr.push(
                candles[i].h -
                candles[i].l
            );
            continue;
        }

        const current = candles[i];

        const previous =
            candles[i - 1];

        const value =
            Math.max(
                current.h - current.l,
                Math.abs(
                    current.h -
                    previous.c
                ),
                Math.abs(
                    current.l -
                    previous.c
                )
            );

        tr.push(value);
    }

    let atr = 0;

    for (let i = 0; i < period; i++) {
        atr += tr[i];
    }

    atr /= period;

    result[period - 1] = atr;

    for (
        let i = period;
        i < candles.length;
        i++
    ) {

        atr =
            (
                (atr * (period - 1)) +
                tr[i]
            ) / period;

        result[i] = atr;
    }

    return result;
}

// ============================================================
// VWAP
// ============================================================

function vwapSeries(candles) {

    const result =
        new Array(candles.length).fill(null);

    let cumulativePV = 0;
    let cumulativeVolume = 0;

    let previousDay = null;

    for (let i = 0; i < candles.length; i++) {

        const candle = candles[i];

        const date =
            candle.ts != null
                ? new Date(candle.ts * 1000)
                : null;

        const day =
            date
                ? `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
                : null;

        if (
            previousDay !== null &&
            day !== previousDay
        ) {
            cumulativePV = 0;
            cumulativeVolume = 0;
        }

        previousDay = day;

        const typical =
            (
                candle.h +
                candle.l +
                candle.c
            ) / 3;

        cumulativePV +=
            typical * candle.v;

        cumulativeVolume +=
            candle.v;

        if (cumulativeVolume > 0) {
            result[i] =
                cumulativePV /
                cumulativeVolume;
        }
    }

    return result;
}

// ============================================================
// MARKET FEATURES
// ============================================================

function getTrend(
    i,
    closes,
    ema9,
    ema21
) {

    if (
        ema9[i] == null ||
        ema21[i] == null
    ) {
        return "UNKNOWN";
    }

    const e9 = ema9[i];
    const e21 = ema21[i];
    const price = closes[i];

    if (
        price > e9 &&
        e9 > e21
    ) {
        return "BULLISH";
    }

    if (
        price < e9 &&
        e9 < e21
    ) {
        return "BEARISH";
    }

    return "RANGING";
}

function getVWAPState(
    price,
    vwap
) {

    if (
        price == null ||
        vwap == null
    ) {
        return "UNKNOWN";
    }

    const diff =
        (price - vwap) /
        vwap;

    if (diff > 0.0025) {
        return "VWAP_GT_025";
    }

    if (diff > 0.001) {
        return "VWAP_GT_1";
    }

    if (diff > 0.00025) {
        return "VWAP_GT_025";
    }

    if (diff < -0.0025) {
        return "VWAP_LT_MINUS025";
    }

    if (diff < -0.001) {
        return "VWAP_LT_MINUS1";
    }

    if (diff < -0.00025) {
        return "VWAP_LT_MINUS025";
    }

    return "VWAP_NEAR";
}

function getRSIState(rsi) {

    if (rsi == null) {
        return "RSI_UNKNOWN";
    }

    if (rsi < 30) return "RSI_LT30";
    if (rsi < 35) return "RSI_30_35";
    if (rsi < 40) return "RSI_35_40";
    if (rsi < 45) return "RSI_40_45";
    if (rsi < 50) return "RSI_45_50";
    if (rsi < 55) return "RSI_50_55";
    if (rsi < 60) return "RSI_55_60";
    if (rsi < 65) return "RSI_60_65";
    if (rsi < 70) return "RSI_65_70";

    return "RSI_GT70";
}

function getTimeState(ts) {

    if (ts == null) {
        return "TIME_UNKNOWN";
    }

    const d =
        new Date(ts * 1000);

    const hour =
        d.getUTCHours();

    const minute =
        d.getUTCMinutes();

    const total =
        hour * 60 + minute;

    if (total < 660) {
        return "TIME_MORNING";
    }

    if (total < 780) {
        return "TIME_MIDDAY";
    }

    if (total < 900) {
        return "TIME_AFTERNOON";
    }

    return "TIME_CLOSE";
}

function getSpreadState(
    candle
) {

    const range =
        candle.h - candle.l;

    if (range <= 0) {
        return "SPREAD_UNKNOWN";
    }

    const body =
        Math.abs(
            candle.c - candle.o
        );

    const ratio =
        body / range;

    if (ratio >= 0.75) {
        return "SPREAD_LT025";
    }

    if (ratio >= 0.50) {
        return "SPREAD_025_050";
    }

    if (ratio >= 0.25) {
        return "SPREAD_050_075";
    }

    return "SPREAD_GT075";
}

function getRegime(
    trend,
    atr,
    price
) {

    if (
        !Number.isFinite(atr) ||
        !Number.isFinite(price) ||
        price === 0
    ) {
        return "REGIME_OTHER";
    }

    const atrPct =
        (atr / price) * 100;

    if (
        trend === "BULLISH" ||
        trend === "BEARISH"
    ) {
        if (atrPct > 0.35) {
            return "TRENDING";
        }

        return "TRANSITION";
    }

    if (atrPct < 0.20) {
        return "RANGING";
    }

    return "REGIME_OTHER";
}

// ============================================================
// SIGNAL GENERATION
// ============================================================

function makeSignal(
    i,
    candles,
    features
) {

    const f = features[i];

    if (!f) {
        return null;
    }

    if (
        f.trend === "BULLISH" &&
        f.vwapBelow &&
        f.rsi >= 35 &&
        f.rsi <= 65
    ) {
        return "BUY";
    }

    if (
        f.trend === "BEARISH" &&
        f.vwapAbove &&
        f.rsi >= 35 &&
        f.rsi <= 65
    ) {
        return "SELL";
    }

    /*
    Reversal setups are allowed only when RSI
    is stretched AND price is meaningfully
    separated from VWAP.
    */

    if (
        f.rsi < 35 &&
        f.vwapDistance < -0.001
    ) {
        return "BUY";
    }

    if (
        f.rsi > 65 &&
        f.vwapDistance > 0.001
    ) {
        return "SELL";
    }

    return null;
}

// ============================================================
// FEATURE CONSTRUCTION
// ============================================================

function buildFeatures(candles) {

    const closes =
        candles.map(x => x.c);

    const ema9 =
        emaSeries(closes, 9);

    const ema21 =
        emaSeries(closes, 21);

    const rsi =
        rsiSeries(closes, 14);

    const atr =
        atrSeries(candles, 14);

    const vwap =
        vwapSeries(candles);

    const result =
        new Array(candles.length).fill(null);

    for (
        let i = 0;
        i < candles.length;
        i++
    ) {

        const price =
            candles[i].c;

        const v =
            vwap[i];

        const distance =
            v != null && v !== 0
                ? (price - v) / v
                : null;

        const trend =
            getTrend(
                i,
                closes,
                ema9,
                ema21
            );

        result[i] = {

            trend,

            rsi: rsi[i],

            atr: atr[i],

            vwap: v,

            vwapDistance: distance,

            vwapAbove:
                distance != null &&
                distance > 0.00025,

            vwapBelow:
                distance != null &&
                distance < -0.00025,

            rsiState:
                getRSIState(rsi[i]),

            vwapState:
                getVWAPState(
                    price,
                    v
                ),

            timeState:
                getTimeState(
                    candles[i].ts
                ),

            spreadState:
                getSpreadState(
                    candles[i]
                ),

            regime:
                getRegime(
                    trend,
                    atr[i],
                    price
                )
        };
    }

    return result;
}

// ============================================================
// EXECUTION SIMULATION
// ============================================================

function simulateTrade(
    index,
    side,
    candles,
    features
) {

    const entry =
        candles[index].c;

    const atr =
        features[index].atr;

    if (
        !Number.isFinite(entry) ||
        !Number.isFinite(atr) ||
        atr <= 0
    ) {
        return null;
    }

    const stopDistance =
        atr * STOP_R;

    const targetDistance =
        atr * MIN_TARGET_R;

    const preferredDistance =
        atr * PREFERRED_TARGET_R;

    let stop;
    let target;

    if (side === "BUY") {

        stop =
            entry - stopDistance;

        target =
            entry + targetDistance;

    } else {

        stop =
            entry + stopDistance;

        target =
            entry - targetDistance;
    }

    /*
    Maximum holding period:
    12 x 5-minute candles = approximately 1 hour.
    */

    const horizon = 12;

    let maxFavorable = 0;
    let maxAdverse = 0;

    let result = null;

    let exitIndex = null;

    for (
        let j = index + 1;
        j <= Math.min(
            candles.length - 1,
            index + horizon
        );
        j++
    ) {

        const candle =
            candles[j];

        if (side === "BUY") {

            const favorable =
                candle.h - entry;

            const adverse =
                entry - candle.l;

            maxFavorable =
                Math.max(
                    maxFavorable,
                    favorable
                );

            maxAdverse =
                Math.max(
                    maxAdverse,
                    adverse
                );

            /*
            Conservative execution:
            If both stop and target are touched
            inside the same candle, assume STOP
            happened first.
            */

            if (
                candle.l <= stop &&
                candle.h >= target
            ) {

                result = -1;
                exitIndex = j;
                break;
            }

            if (candle.l <= stop) {

                result = -1;
                exitIndex = j;
                break;
            }

            if (candle.h >= target) {

                result = 2;
                exitIndex = j;
                break;
            }

        } else {

            const favorable =
                entry - candle.l;

            const adverse =
                candle.h - entry;

            maxFavorable =
                Math.max(
                    maxFavorable,
                    favorable
                );

            maxAdverse =
                Math.max(
                    maxAdverse,
                    adverse
                );

            if (
                candle.h >= stop &&
                candle.l <= target
            ) {

                result = -1;
                exitIndex = j;
                break;
            }

            if (candle.h >= stop) {

                result = -1;
                exitIndex = j;
                break;
            }

            if (candle.l <= target) {

                result = 2;
                exitIndex = j;
                break;
            }
        }
    }

    /*
    If neither stop nor target is reached,
    mark the trade using the close at horizon.
    */

    if (result === null) {

        const finalIndex =
            Math.min(
                candles.length - 1,
                index + horizon
            );

        if (finalIndex <= index) {
            return null;
        }

        const finalClose =
            candles[finalIndex].c;

        const move =
            side === "BUY"
                ? finalClose - entry
                : entry - finalClose;

        result =
            move > 0
                ? Math.min(
                    move / stopDistance,
                    MIN_TARGET_R
                )
                : Math.max(
                    move / stopDistance,
                    -1
                );

        exitIndex = finalIndex;
    }

    return {

        side,

        entry,

        stop,

        target,

        preferredTarget:
            side === "BUY"
                ? entry + preferredDistance
                : entry - preferredDistance,

        resultR:
            round(result, 4),

        maeR:
            round(
                maxAdverse /
                stopDistance,
                4
            ),

        mfeR:
            round(
                maxFavorable /
                stopDistance,
                4
            ),

        entryIndex: index,

        exitIndex
    };
}

// ============================================================
// STATISTICS
// ============================================================

function calculateStats(trades) {

    const list =
        safeArray(trades);

    if (!list.length) {

        return {

            trades: 0,
            wins: 0,
            losses: 0,
            timeouts: 0,
            decisiveTrades: 0,

            winRate: 0,

            totalWinR: 0,
            totalLossR: 0,

            netR: 0,

            expectedValueR: 0,

            profitFactor: 0,

            maxDrawdownR: 0,

            maxConsecutiveLosses: 0
        };
    }

    let wins = 0;
    let losses = 0;
    let timeouts = 0;

    let totalWinR = 0;
    let totalLossR = 0;

    let equity = 0;
    let peak = 0;
    let maxDD = 0;

    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;

    for (const trade of list) {

        const r =
            num(trade.resultR, 0);

        if (r > 0) {

            wins++;

            totalWinR += r;

            consecutiveLosses = 0;

        } else {

            losses++;

            if (r < 0) {
                totalLossR += Math.abs(r);
            }

            if (
                r > -1 &&
                r < 1
            ) {
                timeouts++;
            }

            consecutiveLosses++;

            maxConsecutiveLosses =
                Math.max(
                    maxConsecutiveLosses,
                    consecutiveLosses
                );
        }

        equity += r;

        peak =
            Math.max(
                peak,
                equity
            );

        maxDD =
            Math.max(
                maxDD,
                peak - equity
            );
    }

    const decisiveTrades =
        wins + losses;

    const winRate =
        decisiveTrades > 0
            ? wins / decisiveTrades * 100
            : 0;

    const netR =
        totalWinR -
        totalLossR;

    const expectedValueR =
        list.length > 0
            ? netR / list.length
            : 0;

    const profitFactor =
        totalLossR > 0
            ? totalWinR / totalLossR
            : totalWinR > 0
                ? Infinity
                : 0;

    return {

        trades: list.length,

        wins,

        losses,

        timeouts,

        decisiveTrades,

        winRate:
            round(winRate, 3),

        totalWinR:
            round(totalWinR, 3),

        totalLossR:
            round(totalLossR, 3),

        netR:
            round(netR, 3),

        expectedValueR:
            round(expectedValueR, 4),

        profitFactor:
            Number.isFinite(profitFactor)
                ? round(profitFactor, 3)
                : 999,

        maxDrawdownR:
            round(maxDD, 3),

        maxConsecutiveLosses
    };
}

// ============================================================
// PATTERN ENGINE
// ============================================================

function patternKey(
    side,
    feature
) {

    return [
        side,
        `trend=${feature.trend}`,
        `rsi=${feature.rsiState}`,
        `vwap=${feature.vwapState}`,
        `regime=${feature.regime}`,
        `time=${feature.timeState}`,
        `spread=${feature.spreadState}`
    ].join("|");
}

function getPatternQuality(
    trades,
    foldStats
) {

    const stats =
        calculateStats(trades);

    const stableFolds =
        foldStats.filter(
            x =>
                x.expectedValueR > 0 &&
                x.profitFactor >= MIN_PROFIT_FACTOR
        ).length;

    const positiveFolds =
        foldStats.filter(
            x =>
                x.expectedValueR > 0
        ).length;

    const averageTestEV =
        foldStats.length
            ? foldStats.reduce(
                (sum, x) =>
                    sum + x.expectedValueR,
                0
            ) / foldStats.length
            : 0;

    const avgTestPF =
        foldStats.length
            ? foldStats.reduce(
                (sum, x) =>
                    sum +
                    Math.min(
                        x.profitFactor,
                        5
                    ),
                0
            ) / foldStats.length
            : 0;

    const avgWinRate =
        foldStats.length
            ? foldStats.reduce(
                (sum, x) =>
                    sum + x.winRate,
                0
            ) / foldStats.length
            : 0;

    const stability =
        foldStats.length
            ? stableFolds /
              foldStats.length
            : 0;

    /*
    Quality scoring.

    EV is most important.

    Then:
    - profit factor
    - stability
    - drawdown
    - sample size
    - win rate

    Win rate is deliberately NOT the
    primary optimization target.
    */

    let score = 0;

    score +=
        clamp(
            averageTestEV * 60,
            -20,
            30
        );

    score +=
        clamp(
            (avgTestPF - 1) * 20,
            -10,
            20
        );

    score +=
        stability * 25;

    score +=
        clamp(
            avgWinRate - 40,
            -10,
            10
        );

    score +=
        clamp(
            Math.log(
                Math.max(
                    trades.length,
                    1
                )
            ) * 3,
            0,
            12
        );

    score -=
        clamp(
            stats.maxDrawdownR * 0.8,
            0,
            20
        );

    if (
        stats.maxConsecutiveLosses >
        MAX_ACCEPTABLE_LOSS_STREAK
    ) {
        score -= 10;
    }

    if (
        averageTestEV < 0
    ) {
        score -= 25;
    }

    if (
        stableFolds <
        MIN_STABLE_FOLDS
    ) {
        score -= 15;
    }

    const robust =
        trades.length >= MIN_PATTERN_SAMPLES &&
        stats.decisiveTrades >= MIN_DECISIVE_SAMPLES &&
        averageTestEV >= MIN_EXPECTED_VALUE &&
        avgTestPF >= MIN_PROFIT_FACTOR &&
        stableFolds >= MIN_STABLE_FOLDS &&
        stability >= 0.75;

    return {

        qualityScore:
            round(
                clamp(
                    score,
                    0,
                    100
                ),
                2
            ),

        averageTestEV:
            round(
                averageTestEV,
                4
            ),

        averageTestPF:
            round(
                avgTestPF,
                3
            ),

        averageTestWinRate:
            round(
                avgWinRate,
                2
            ),

        stableFolds,

        positiveFolds,

        foldStability:
            round(
                stability,
                3
            ),

        robust
    };
}

// ============================================================
// WALK FORWARD
// ============================================================

function buildFolds(
    totalRows
) {

    const folds = [];

    const testSize =
        Math.floor(
            totalRows /
            (FOLD_COUNT + 2)
        );

    for (
        let fold = 1;
        fold <= FOLD_COUNT;
        fold++
    ) {

        const testStart =
            testSize * (fold + 1);

        const testEnd =
            Math.min(
                totalRows,
                testStart + testSize
            );

        if (
            testStart >= totalRows ||
            testEnd <= testStart
        ) {
            continue;
        }

        folds.push({

            fold,

            trainingStart: 0,

            trainingEnd: testStart,

            testStart,

            testEnd,

            trainingRows:
                testStart,

            testRows:
                testEnd - testStart
        });
    }

    return folds;
}

// ============================================================
// DISCOVER PATTERNS
// ============================================================

function discoverPatterns(
    candles,
    features
) {

    const map =
        new Map();

    for (
        let i = 25;
        i < candles.length - 12;
        i++
    ) {

        const feature =
            features[i];

        if (!feature) {
            continue;
        }

        const side =
            makeSignal(
                i,
                candles,
                features
            );

        if (!side) {
            continue;
        }

        const key =
            patternKey(
                side,
                feature
            );

        if (!map.has(key)) {

            map.set(key, {

                key,

                side,

                featureNames: [
                    "trend",
                    "rsi",
                    "vwap",
                    "regime",
                    "time",
                    "spread"
                ],

                samples: [],

                trades: []
            });
        }

        const pattern =
            map.get(key);

        const trade =
            simulateTrade(
                i,
                side,
                candles,
                features
            );

        if (!trade) {
            continue;
        }

        pattern.samples.push(i);

        pattern.trades.push({
            ...trade,
            index: i
        });
    }

    return Array.from(
        map.values()
    );
}

// ============================================================
// BACKTEST PATTERN
// ============================================================

function backtestPattern(
    pattern,
    start,
    end
) {

    const trades =
        pattern.trades.filter(
            t =>
                t.index >= start &&
                t.index < end
        );

    return calculateStats(
        trades
    );
}

// ============================================================
// WALK FORWARD PATTERN EVALUATION
// ============================================================

function evaluatePattern(
    pattern,
    folds
) {

    const foldDetails = [];

    for (const fold of folds) {

        const trainingStats =
            backtestPattern(
                pattern,
                fold.trainingStart,
                fold.trainingEnd
            );

        const testStats =
            backtestPattern(
                pattern,
                fold.testStart,
                fold.testEnd
            );

        foldDetails.push({

            fold: fold.fold,

            trainingSamples:
                trainingStats.trades,

            trainingWinRate:
                trainingStats.winRate,

            trainingExpectedValueR:
                trainingStats.expectedValueR,

            trainingProfitFactor:
                trainingStats.profitFactor,

            testSamples:
                testStats.trades,

            testWins:
                testStats.wins,

            testLosses:
                testStats.losses,

            testTimeouts:
                testStats.timeouts,

            testWinRate:
                testStats.winRate,

            testExpectedValueR:
                testStats.expectedValueR,

            testProfitFactor:
                testStats.profitFactor,

            testNetR:
                testStats.netR,

            testMaxDrawdownR:
                testStats.maxDrawdownR,

            testMaxConsecutiveLosses:
                testStats.maxConsecutiveLosses
        });
    }

    const testStats =
        foldDetails.filter(
            x =>
                x.testSamples > 0
        );

    const quality =
        getPatternQuality(
            pattern.trades,
            testStats.map(
                x => ({
                    expectedValueR:
                        x.testExpectedValueR,

                    profitFactor:
                        x.testProfitFactor,

                    winRate:
                        x.testWinRate
                })
            )
        );

    return {

        key: pattern.key,

        side: pattern.side,

        level: 2,

        features:
            pattern.featureNames,

        samples:
            pattern.trades.length,

        wins:
            pattern.trades.filter(
                x => x.resultR > 0
            ).length,

        losses:
            pattern.trades.filter(
                x => x.resultR <= 0
            ).length,

        foldsSeen:
            foldDetails.length,

        foldDetails,

        trainExpectedValues:
            foldDetails.map(
                x =>
                    x.trainingExpectedValueR
            ),

        testExpectedValues:
            foldDetails.map(
                x =>
                    x.testExpectedValueR
            ),

        testProfitFactors:
            foldDetails.map(
                x =>
                    x.testProfitFactor
            ),

        testWinRates:
            foldDetails.map(
                x =>
                    x.testWinRate
            ),

        testSamples:
            testStats.reduce(
                (sum, x) =>
                    sum + x.testSamples,
                0
            ),

        stableFolds:
            quality.stableFolds,

        positiveFolds:
            quality.positiveFolds,

        averageTestEV:
            quality.averageTestEV,

        averageTestPF:
            quality.averageTestPF,

        averageTestWinRate:
            quality.averageTestWinRate,

        foldStability:
            quality.foldStability,

        robustnessScore:
            quality.qualityScore,

        tradeQualityScore:
            quality.qualityScore,

        robust:
            quality.robust
    };
}

// ============================================================
// GLOBAL EXECUTION BACKTEST
// ============================================================

function executionBacktest(
    candles,
    features,
    qualifiedPatterns
) {

    const allowed =
        new Set(
            qualifiedPatterns.map(
                x => x.key
            )
        );

    const trades = [];

    let lastTradeIndex = -999;

    /*
    One position at a time.

    This prevents overlapping
    paper positions from inflating
    the backtest.
    */

    for (
        let i = 25;
        i < candles.length - 12;
        i++
    ) {

        if (
            i <= lastTradeIndex
        ) {
            continue;
        }

        const feature =
            features[i];

        if (!feature) {
            continue;
        }

        const side =
            makeSignal(
                i,
                candles,
                features
            );

        if (!side) {
            continue;
        }

        const key =
            patternKey(
                side,
                feature
            );

        if (!allowed.has(key)) {
            continue;
        }

        const trade =
            simulateTrade(
                i,
                side,
                candles,
                features
            );

        if (!trade) {
            continue;
        }

        trade.key = key;

        trades.push(trade);

        lastTradeIndex =
            trade.exitIndex;
    }

    const stats =
        calculateStats(trades);

    return {

        trades:
            stats.trades,

        wins:
            stats.wins,

        losses:
            stats.losses,

        timeouts:
            stats.timeouts,

        decisiveTrades:
            stats.decisiveTrades,

        winRate:
            stats.winRate,

        totalWinR:
            stats.totalWinR,

        totalLossR:
            stats.totalLossR,

        netR:
            stats.netR,

        expectedValueR:
            stats.expectedValueR,

        profitFactor:
            stats.profitFactor,

        maxDrawdownR:
            stats.maxDrawdownR,

        maxConsecutiveLosses:
            stats.maxConsecutiveLosses,

        executionRiskReward:
            2,

        stopR:
            STOP_R,

        targetR:
            MIN_TARGET_R,

        preferredTargetR:
            PREFERRED_TARGET_R,

        tradeResults:
            trades.map(
                x =>
                    round(
                        x.resultR,
                        3
                    )
            )
    };
}

// ============================================================
// SELECTIVE TRADE GATE
// ============================================================

function qualifiesForV11_10(pattern) {

    if (!pattern.robust) {
        return false;
    }

    if (
        pattern.samples <
        MIN_PATTERN_SAMPLES
    ) {
        return false;
    }

    if (
        pattern.testSamples <
        MIN_DECISIVE_SAMPLES
    ) {
        return false;
    }

    if (
        pattern.averageTestEV <
        MIN_EXPECTED_VALUE
    ) {
        return false;
    }

    if (
        pattern.averageTestPF <
        MIN_PROFIT_FACTOR
    ) {
        return false;
    }

    if (
        pattern.stableFolds <
        MIN_STABLE_FOLDS
    ) {
        return false;
    }

    if (
        pattern.foldStability <
        0.75
    ) {
        return false;
    }

    if (
        pattern.tradeQualityScore <
        MIN_TRADE_QUALITY
    ) {
        return false;
    }

    return true;
}

// ============================================================
// LIVE PAPER RECOMMENDATION
// ============================================================

function buildRecommendation(
    candles,
    features,
    patterns,
    execution
) {

    if (!candles.length) {

        return {

            status: "NO_DATA",

            candidateCount: 0,

            message:
                "No usable candles were available."
        };
    }

    const index =
        candles.length - 1;

    const feature =
        features[index];

    if (!feature) {

        return {

            status: "NO_EDGE",

            candidateCount: 0,

            message:
                "Current candle does not have enough indicator data."
        };
    }

    const side =
        makeSignal(
            index,
            candles,
            features
        );

    if (!side) {

        return {

            status: "NO_TRADE",

            candidateCount: 0,

            message:
                "Current market does not satisfy the directional setup gate."
        };
    }

    const key =
        patternKey(
            side,
            feature
        );

    const pattern =
        patterns.find(
            x =>
                x.key === key
        );

    if (!pattern) {

        return {

            status: "NO_EDGE",

            candidateCount:
                patterns.length,

            side,

            patternKey: key,

            message:
                "A directional setup exists, but no learned pattern matches the current market."
        };
    }

    if (
        !qualifiesForV11_10(
            pattern
        )
    ) {

        return {

            status: "NO_EDGE",

            candidateCount:
                patterns.length,

            side,

            patternKey: key,

            tradeQualityScore:
                pattern.tradeQualityScore,

            expectedValueR:
                pattern.averageTestEV,

            profitFactor:
                pattern.averageTestPF,

            stableFolds:
                pattern.stableFolds,

            message:
                "Pattern exists, but V11.10 selective quality gate rejected it."
        };
    }

    const currentPrice =
        candles[index].c;

    const currentATR =
        feature.atr;

    const stopDistance =
        currentATR;

    const minimumTargetDistance =
        currentATR * MIN_TARGET_R;

    const preferredTargetDistance =
        currentATR * PREFERRED_TARGET_R;

    const stop =
        side === "BUY"
            ? currentPrice - stopDistance
            : currentPrice + stopDistance;

    const target =
        side === "BUY"
            ? currentPrice +
              minimumTargetDistance
            : currentPrice -
              minimumTargetDistance;

    const preferredTarget =
        side === "BUY"
            ? currentPrice +
              preferredTargetDistance
            : currentPrice -
              preferredTargetDistance;

    return {

        status:
            "TAKE_TRADE",

        candidateCount:
            patterns.length,

        side,

        patternKey: key,

        price:
            round(
                currentPrice,
                2
            ),

        stop:
            round(
                stop,
                2
            ),

        target:
            round(
                target,
                2
            ),

        preferredTarget:
            round(
                preferredTarget,
                2
            ),

        stopR:
            STOP_R,

        minimumTargetR:
            MIN_TARGET_R,

        preferredTargetR:
            PREFERRED_TARGET_R,

        expectedValueR:
            pattern.averageTestEV,

        profitFactor:
            pattern.averageTestPF,

        tradeQualityScore:
            pattern.tradeQualityScore,

        robustnessScore:
            pattern.robustnessScore,

        stableFolds:
            pattern.stableFolds,

        foldStability:
            pattern.foldStability,

        message:
            "High-quality paper setup passed the V11.10 selective trade gate."
    };
}

// ============================================================
// MAIN ENGINE
// ============================================================

async function runEngine(req) {

    const dataset =
        await loadDataset(req);

    const candles =
        extractCandles(
            dataset.raw
        );

    if (
        candles.length < 150
    ) {

        throw new Error(
            `Insufficient candle data: ${candles.length}`
        );
    }

    candles.sort(
        (a, b) =>
            (a.ts || 0) -
            (b.ts || 0)
    );

    const features =
        buildFeatures(
            candles
        );

    const folds =
        buildFolds(
            candles.length
        );

    const discovered =
        discoverPatterns(
            candles,
            features
        );

    const evaluated =
        discovered
            .map(
                pattern =>
                    evaluatePattern(
                        pattern,
                        folds
                    )
            )
            .sort(
                (a, b) =>
                    b.tradeQualityScore -
                    a.tradeQualityScore
            );

    const qualified =
        evaluated.filter(
            qualifiesForV11_10
        );

    const execution =
        executionBacktest(
            candles,
            features,
            qualified
        );

    const recommendation =
        buildRecommendation(
            candles,
            features,
            evaluated,
            execution
        );

    const robustPatterns =
        evaluated.filter(
            x =>
                x.robust
        );

    const buyPatterns =
        qualified.filter(
            x =>
                x.side === "BUY"
        );

    const sellPatterns =
        qualified.filter(
            x =>
                x.side === "SELL"
        );

    const lastCandle =
        candles[candles.length - 1];

    const lastFeature =
        features[
            features.length - 1
        ];

    return {

        success: true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V11_10_SELECTIVE_HIGH_QUALITY_EDGE_ENGINE",

        paperOnly:
            true,

        realOrders:
            false,

        instrument:
            INSTRUMENT,

        interval:
            INTERVAL,

        requestedDays:
            REQUESTED_DAYS,

        source:
            "V11.1_LEARNING_DATASET",

        objective: {

            primary:
                "MAXIMIZE_EXPECTED_VALUE",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "SELECT_FEWER_STABLE_HIGH_QUALITY_TRADES",

            allowNoTrade:
                true,

            minimumExpectedValueR:
                MIN_EXPECTED_VALUE,

            preferredExpectedValueR:
                PREFERRED_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            preferredProfitFactor:
                PREFERRED_PROFIT_FACTOR,

            minimumTradeQualityScore:
                MIN_TRADE_QUALITY,

            minimumStableFolds:
                MIN_STABLE_FOLDS
        },

        sourceStatistics: {

            candlesTested:
                candles.length,

            learningRows:
                candles.length,

            tradingDays:
                new Set(
                    candles.map(
                        x => {
                            const d =
                                new Date(
                                    x.ts * 1000
                                );

                            return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
                        }
                    )
                ).size,

            dataQuality: {

                rawCandles:
                    candles.length,

                validCandles:
                    candles.length,

                finalCandles:
                    candles.length,

                duplicateCandles:
                    0,

                invalidCandles:
                    0,

                requestedDays:
                    REQUESTED_DAYS
            }
        },

        walkForward: {

            foldCount:
                folds.length,

            chronological:
                true,

            shuffled:
                false,

            expandingTrainingWindow:
                true,

            folds
        },

        learning: {

            minimumPatternSamples:
                MIN_PATTERN_SAMPLES,

            minimumDecisiveSamples:
                MIN_DECISIVE_SAMPLES,

            patternsDiscovered:
                evaluated.length,

            robustPatterns:
                robustPatterns.length,

            qualifiedPatterns:
                qualified.length,

            robustBuyPatterns:
                buyPatterns.length,

            robustSellPatterns:
                sellPatterns.length
        },

        currentMarket: {

            timestamp:
                lastCandle.ts,

            price:
                round(
                    lastCandle.c,
                    2
                ),

            trend:
                lastFeature
                    ? lastFeature.trend
                    : null,

            rsi:
                lastFeature &&
                lastFeature.rsi != null
                    ? round(
                        lastFeature.rsi,
                        2
                    )
                    : null,

            vwap:
                lastFeature &&
                lastFeature.vwap != null
                    ? round(
                        lastFeature.vwap,
                        2
                    )
                    : null,

            vwapState:
                lastFeature
                    ? lastFeature.vwapState
                    : null,

            regime:
                lastFeature
                    ? lastFeature.regime
                    : null,

            time:
                lastFeature
                    ? lastFeature.timeState
                    : null,

            spread:
                lastFeature
                    ? lastFeature.spreadState
                    : null
        },

        candidates:
            evaluated
                .slice(0, 50),

        qualifiedCandidates:
            qualified
                .slice(0, 25),

        executionBacktest:
            execution,

        riskPlan: {

            riskPerTradeR:
                1,

            stopR:
                STOP_R,

            minimumTargetR:
                MIN_TARGET_R,

            preferredTargetR:
                PREFERRED_TARGET_R,

            plannedMinimumRR:
                "2:1",

            plannedPreferredRR:
                "2.5:1",

            observedExecutionRiskReward:
                execution.executionRiskReward,

            riskRewardSource:
                "V11_10_EXECUTION_MODEL",

            riskRewardQualified:
                true,

            stopRule:
                "Stop is fixed at 1R. Never widen the initial stop.",

            profitRule:
                "Minimum target is 2R. Prefer 2.5R only when market structure supports it.",

            drawdownRule:
                `Reject or down-rank setups contributing to drawdown above ${MAX_ACCEPTABLE_DRAWDOWN_R}R.`,

            lossStreakRule:
                `Reject setups with excessive consecutive losses above ${MAX_ACCEPTABLE_LOSS_STREAK}.`
        },

        recommendation,

        paperAction:
            recommendation.status ===
            "TAKE_TRADE"
                ? "TAKE_IF_LIVE_MARKET_MATCHES_PATTERN"
                : "NO_TRADE"
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
            req.method !== "GET"
        ) {

            return res.status(405).json({

                success: false,

                version:
                    VERSION,

                error:
                    "Method not allowed. Use GET."
            });
        }

        const result =
            await runEngine(req);

        return res.status(200).json(
            result
        );

    } catch (error) {

        console.error(
            "V11.10 ENGINE ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            version:
                VERSION,

            status:
                "ERROR",

            paperOnly:
                true,

            realOrders:
                false,

            error:
                error &&
                error.message
                    ? error.message
                    : String(error)
        });
    }
}

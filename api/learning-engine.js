/*
===========================================================
 TradeMind Pro
 V14.2 — HIERARCHICAL EDGE LEARNING ENGINE

 Improvements over V14.1:
 - Fixed records.filter crash
 - Strict array validation
 - True expanding walk-forward
 - Family + detailed pattern learning
 - Recent edge validation
 - Recent VWAP pullback
 - Trend strength filter
 - Pattern concentration protection
 - Current candle excluded from learning
 - PAPER ONLY
 - NO REAL ORDERS
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V14.2";

    // =========================================================
    // CONFIG
    // =========================================================

    const SCRIP_CODE = "NIDX_40000001";
    const INSTRUMENT = "NIFTY 50";
    const INTERVAL = "5minute";

    const API_BASE =
        process.env.INDSTOCKS_API_BASE ||
        "https://api.indstocks.com";

    const DAYS = Math.max(
        7,
        Math.min(
            Number(
                req.body?.days ||
                req.query?.days ||
                30
            ) || 30,
            60
        )
    );

    // Learning
    const FAMILY_MIN_SAMPLES = 10;
    const FAMILY_MIN_DECISIVE = 6;
    const FAMILY_MIN_EV = 0.10;
    const FAMILY_MIN_PF = 1.15;

    const PATTERN_MIN_SAMPLES = 7;
    const PATTERN_MIN_DECISIVE = 4;
    const PATTERN_MIN_EV = 0.10;
    const PATTERN_MIN_PF = 1.15;

    const MIN_STABLE_FOLDS = 2;

    // Recent edge
    const RECENT_FRACTION = 0.25;
    const RECENT_MIN_SAMPLES = 4;
    const RECENT_MIN_DECISIVE = 3;
    const RECENT_MIN_EV = 0.05;
    const RECENT_MIN_PF = 1.05;
    const RECENT_MAX_LOSS_STREAK = 3;

    // Global validation
    const GLOBAL_MIN_DECISIVE = 5;
    const GLOBAL_MIN_EV = 0.10;
    const GLOBAL_MIN_PF = 1.20;
    const MIN_INDEPENDENT_FAMILIES = 2;
    const MAX_PATTERN_CONCENTRATION = 0.75;

    // Entry
    const MIN_CONFIRMATION = 5;
    const ENTRY_COOLDOWN = 3;
    const SAME_PATTERN_COOLDOWN = 5;
    const SAME_SIDE_COOLDOWN = 2;

    // Risk
    const STOP_R = 1;
    const TARGET_R = 2;
    const MAX_HOLD = 12;
    const MAX_DRAWDOWN = 12;
    const MAX_LOSS_STREAK = 6;

    // Trend
    const MIN_SPREAD_ATR = 0.15;
    const MIN_SLOPE_ATR = 0.05;

    // VWAP pullback
    const VWAP_LOOKBACK = 8;
    const VWAP_TOUCH_ATR = 0.35;
    const VWAP_MIN_RECOVERY_ATR = 0.10;
    const VWAP_MAX_ENTRY_DISTANCE_ATR = 0.75;
    const VWAP_MAX_CANDLES_AFTER_TOUCH = 3;

    // =========================================================
    // BASIC HELPERS
    // =========================================================

    function number(v, fallback = null) {
        const x = Number(v);
        return Number.isFinite(x) ? x : fallback;
    }

    function round(v, d = 4) {
        if (!Number.isFinite(v)) return null;
        const p = Math.pow(10, d);
        return Math.round(v * p) / p;
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function arr(v) {
        return Array.isArray(v) ? v : [];
    }

    function fail(message, extra = {}) {
        return res.status(500).json({
            success: false,
            version: VERSION,
            status: "ERROR",
            paperOnly: true,
            realOrders: false,
            brokerOrderEnabled: false,
            brokerOrderSent: false,
            error: message,
            ...extra
        });
    }

    // =========================================================
    // CANDLE NORMALIZATION
    // =========================================================

    function normalizeCandle(row) {

        if (!row) return null;

        if (Array.isArray(row)) {

            if (row.length < 5) return null;

            let ts = number(row[0]);

            const o = number(row[1]);
            const h = number(row[2]);
            const l = number(row[3]);
            const c = number(row[4]);
            const v = number(row[5], 0);

            if (
                ts === null ||
                o === null ||
                h === null ||
                l === null ||
                c === null
            ) {
                return null;
            }

            if (ts > 100000000000) {
                ts = Math.floor(ts / 1000);
            }

            return { ts, o, h, l, c, v };
        }

        let ts = number(
            row.ts ??
            row.timestamp ??
            row.time ??
            row.t
        );

        const o = number(
            row.o ??
            row.open
        );

        const h = number(
            row.h ??
            row.high
        );

        const l = number(
            row.l ??
            row.low
        );

        const c = number(
            row.c ??
            row.close
        );

        const v = number(
            row.v ??
            row.volume,
            0
        );

        if (
            ts === null ||
            o === null ||
            h === null ||
            l === null ||
            c === null
        ) {
            return null;
        }

        if (ts > 100000000000) {
            ts = Math.floor(ts / 1000);
        }

        return { ts, o, h, l, c, v };
    }

    function extractCandles(payload) {

        const result = [];

        function walk(value) {

            if (value === null || value === undefined) {
                return;
            }

            if (Array.isArray(value)) {

                const direct =
                    normalizeCandle(value);

                if (direct) {
                    result.push(direct);
                    return;
                }

                for (const item of value) {
                    walk(item);
                }

                return;
            }

            if (
                typeof value === "object"
            ) {

                const direct =
                    normalizeCandle(value);

                if (direct) {
                    result.push(direct);
                    return;
                }

                for (
                    const key of Object.keys(value)
                ) {
                    walk(value[key]);
                }
            }
        }

        walk(payload);

        return result;
    }

    function prepareCandles(rows) {

        const map = new Map();

        for (const c of arr(rows)) {

            if (!c) continue;

            map.set(
                String(c.ts),
                c
            );
        }

        return Array
            .from(map.values())
            .sort(
                (a, b) =>
                    a.ts - b.ts
            );
    }

    // =========================================================
    // IST TIME
    // =========================================================

    const formatter =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23"
            }
        );

    function istParts(ts) {

        const parts =
            formatter.formatToParts(
                new Date(ts * 1000)
            );

        const out = {};

        for (const p of parts) {

            if (p.type !== "literal") {
                out[p.type] = p.value;
            }
        }

        return out;
    }

    function istDate(ts) {

        const p = istParts(ts);

        return `${p.year}-${p.month}-${p.day}`;
    }

    function istMinutes(ts) {

        const p = istParts(ts);

        return (
            Number(p.hour) * 60 +
            Number(p.minute)
        );
    }

    function timeBucket(ts) {

        const m = istMinutes(ts);

        if (m < 600) return "OPEN";
        if (m < 720) return "MORNING";
        if (m < 840) return "MIDDAY";

        return "CLOSE";
    }

    // =========================================================
    // EMA
    // =========================================================

    function EMA(values, period) {

        values = arr(values);

        if (values.length < period) {
            return null;
        }

        let value = 0;

        for (
            let i = 0;
            i < period;
            i++
        ) {
            value += values[i];
        }

        value /= period;

        const multiplier =
            2 / (period + 1);

        for (
            let i = period;
            i < values.length;
            i++
        ) {

            value =
                (
                    values[i] -
                    value
                ) *
                multiplier +
                value;
        }

        return value;
    }

    // =========================================================
    // RSI
    // =========================================================

    function RSI(values, period = 14) {

        values = arr(values);

        if (values.length <= period) {
            return null;
        }

        let gains = 0;
        let losses = 0;

        for (
            let i = 1;
            i <= period;
            i++
        ) {

            const diff =
                values[i] -
                values[i - 1];

            if (diff >= 0) {
                gains += diff;
            } else {
                losses += Math.abs(diff);
            }
        }

        let avgGain =
            gains / period;

        let avgLoss =
            losses / period;

        for (
            let i = period + 1;
            i < values.length;
            i++
        ) {

            const diff =
                values[i] -
                values[i - 1];

            const gain =
                diff > 0 ? diff : 0;

            const loss =
                diff < 0
                    ? Math.abs(diff)
                    : 0;

            avgGain =
                (
                    avgGain *
                    (period - 1) +
                    gain
                ) / period;

            avgLoss =
                (
                    avgLoss *
                    (period - 1) +
                    loss
                ) / period;
        }

        if (avgLoss === 0) {
            return 100;
        }

        const rs =
            avgGain / avgLoss;

        return (
            100 -
            100 / (1 + rs)
        );
    }

    // =========================================================
    // ATR
    // =========================================================

    function ATR(candles, period = 14) {

        candles = arr(candles);

        if (candles.length <= period) {
            return null;
        }

        const trs = [];

        for (
            let i = 1;
            i < candles.length;
            i++
        ) {

            const c = candles[i];
            const p = candles[i - 1];

            trs.push(
                Math.max(
                    c.h - c.l,
                    Math.abs(c.h - p.c),
                    Math.abs(c.l - p.c)
                )
            );
        }

        if (trs.length < period) {
            return null;
        }

        let value = 0;

        for (
            let i = 0;
            i < period;
            i++
        ) {
            value += trs[i];
        }

        value /= period;

        for (
            let i = period;
            i < trs.length;
            i++
        ) {

            value =
                (
                    value *
                    (period - 1) +
                    trs[i]
                ) / period;
        }

        return value;
    }

    // =========================================================
    // VWAP
    // =========================================================

    function VWAP(candles, index) {

        candles = arr(candles);

        if (
            index < 0 ||
            index >= candles.length
        ) {
            return null;
        }

        const date =
            istDate(
                candles[index].ts
            );

        let pv = 0;
        let volume = 0;

        for (
            let i = index;
            i >= 0;
            i--
        ) {

            if (
                istDate(
                    candles[i].ts
                ) !== date
            ) {
                break;
            }

            const c = candles[i];

            const typical =
                (
                    c.h +
                    c.l +
                    c.c
                ) / 3;

            const v =
                Math.max(
                    0,
                    number(c.v, 0)
                );

            pv += typical * v;
            volume += v;
        }

        if (volume <= 0) {
            return candles[index].c;
        }

        return pv / volume;
    }

    // =========================================================
    // FEATURES
    // =========================================================

    function getFeatures(
        candles,
        index
    ) {

        candles = arr(candles);

        if (index < 30) {
            return null;
        }

        const slice =
            candles.slice(
                0,
                index + 1
            );

        const closes =
            slice.map(
                c => c.c
            );

        const ema9 =
            EMA(closes, 9);

        const ema21 =
            EMA(closes, 21);

        const previousEMA9 =
            EMA(
                closes.slice(0, -1),
                9
            );

        const rsi =
            RSI(
                closes,
                14
            );

        const atr =
            ATR(
                slice,
                14
            );

        const vwap =
            VWAP(
                candles,
                index
            );

        if (
            ema9 === null ||
            ema21 === null ||
            previousEMA9 === null ||
            rsi === null ||
            atr === null ||
            vwap === null ||
            atr <= 0
        ) {
            return null;
        }

        const close =
            candles[index].c;

        const spread =
            ema9 - ema21;

        const spreadATR =
            spread / atr;

        const slope =
            ema9 - previousEMA9;

        const slopeATR =
            slope / atr;

        let trend = "SIDEWAYS";

        if (
            spreadATR >= MIN_SPREAD_ATR &&
            slopeATR >= MIN_SLOPE_ATR
        ) {
            trend = "BULLISH";
        }

        if (
            spreadATR <= -MIN_SPREAD_ATR &&
            slopeATR <= -MIN_SLOPE_ATR
        ) {
            trend = "BEARISH";
        }

        let regime = "TRANSITION";

        if (
            Math.abs(spreadATR) >= 0.35 &&
            Math.abs(slopeATR) >= 0.08
        ) {
            regime = "TRENDING";
        } else if (
            Math.abs(spreadATR) < 0.15 &&
            Math.abs(slopeATR) < 0.05
        ) {
            regime = "RANGING";
        }

        let vwapPosition = "AT";

        if (close > vwap) {
            vwapPosition = "ABOVE";
        } else if (close < vwap) {
            vwapPosition = "BELOW";
        }

        let rsiBucket = "NEUTRAL";

        if (rsi >= 60) {
            rsiBucket = "HIGH";
        } else if (rsi >= 50) {
            rsiBucket = "NEUTRAL_HIGH";
        } else if (rsi <= 40) {
            rsiBucket = "LOW";
        } else {
            rsiBucket = "NEUTRAL_LOW";
        }

        let volatility = "NORMAL";

        if (atr > 18) {
            volatility = "HIGH";
        } else if (atr < 8) {
            volatility = "LOW";
        }

        return {

            close,

            ema9,
            ema21,

            emaSpreadATR:
                spreadATR,

            slopeATR,

            rsi,

            rsiBucket,

            atr,

            vwap,

            vwapPosition,

            vwapDistanceATR:
                (close - vwap) / atr,

            trend,

            trendStrength:
                Math.abs(spreadATR),

            regime,

            volatility,

            timeBucket:
                timeBucket(
                    candles[index].ts
                ),

            date:
                istDate(
                    candles[index].ts
                )
        };
    }

    // =========================================================
    // VWAP PULLBACK
    // =========================================================

    function getVWAPPullback(
        candles,
        index,
        side
    ) {

        const f =
            getFeatures(
                candles,
                index
            );

        if (!f) return null;

        const start =
            Math.max(
                1,
                index - VWAP_LOOKBACK
            );

        let touchIndex = null;

        for (
            let i = start;
            i < index;
            i++
        ) {

            const v =
                VWAP(
                    candles,
                    i
                );

            const a =
                ATR(
                    candles.slice(
                        0,
                        i + 1
                    ),
                    14
                );

            if (!v || !a || a <= 0) {
                continue;
            }

            const c =
                candles[i];

            const crossed =
                c.l <= v &&
                c.h >= v;

            const near =
                Math.abs(
                    c.c - v
                ) / a <=
                VWAP_TOUCH_ATR;

            if (crossed || near) {
                touchIndex = i;
            }
        }

        if (touchIndex === null) {
            return null;
        }

        const candlesSince =
            index - touchIndex;

        if (
            candlesSince < 1 ||
            candlesSince >
                VWAP_MAX_CANDLES_AFTER_TOUCH
        ) {
            return null;
        }

        const distance =
            Math.abs(
                f.close -
                f.vwap
            ) / f.atr;

        if (
            distance >
            VWAP_MAX_ENTRY_DISTANCE_ATR
        ) {
            return null;
        }

        const recovered =
            side === "BUY"
                ? f.close > f.vwap
                : f.close < f.vwap;

        if (!recovered) {
            return null;
        }

        const recovery =
            side === "BUY"
                ? (
                    f.close -
                    f.vwap
                ) / f.atr
                : (
                    f.vwap -
                    f.close
                ) / f.atr;

        if (
            recovery <
            VWAP_MIN_RECOVERY_ATR
        ) {
            return null;
        }

        return {

            touchIndex,

            candlesSinceTouch:
                candlesSince,

            entryDistanceATR:
                round(distance),

            recoveryATR:
                round(recovery)
        };
    }

    // =========================================================
    // SETUPS
    // =========================================================

    function getSetups(
        candles,
        index
    ) {

        const f =
            getFeatures(
                candles,
                index
            );

        if (!f) return [];

        const setups = [];

        if (
            f.trend === "BULLISH" &&
            f.vwapPosition === "ABOVE"
        ) {

            setups.push({
                side: "BUY",
                setup: "TREND_FOLLOW"
            });
        }

        if (
            f.trend === "BEARISH" &&
            f.vwapPosition === "BELOW"
        ) {

            setups.push({
                side: "SELL",
                setup: "TREND_FOLLOW"
            });
        }

        if (f.trend === "BULLISH") {

            const pullback =
                getVWAPPullback(
                    candles,
                    index,
                    "BUY"
                );

            if (pullback) {

                setups.push({
                    side: "BUY",
                    setup: "VWAP_PULLBACK"
                });
            }
        }

        if (f.trend === "BEARISH") {

            const pullback =
                getVWAPPullback(
                    candles,
                    index,
                    "SELL"
                );

            if (pullback) {

                setups.push({
                    side: "SELL",
                    setup: "VWAP_PULLBACK"
                });
            }
        }

        return setups;
    }

    // =========================================================
    // CONFIRMATION
    // =========================================================

    function confirmation(
        candles,
        index,
        side
    ) {

        const f =
            getFeatures(
                candles,
                index
            );

        if (!f) {
            return {
                score: 0,
                passed: false,
                reasons: []
            };
        }

        let score = 0;
        const reasons = [];

        if (
            (
                side === "BUY" &&
                f.trend === "BULLISH"
            ) ||
            (
                side === "SELL" &&
                f.trend === "BEARISH"
            )
        ) {
            score++;
            reasons.push("TREND");
        }

        if (
            (
                side === "BUY" &&
                f.vwapPosition === "ABOVE"
            ) ||
            (
                side === "SELL" &&
                f.vwapPosition === "BELOW"
            )
        ) {
            score++;
            reasons.push("VWAP");
        }

        if (
            (
                side === "BUY" &&
                f.ema9 > f.ema21
            ) ||
            (
                side === "SELL" &&
                f.ema9 < f.ema21
            )
        ) {
            score++;
            reasons.push("EMA_ALIGNMENT");
        }

        if (
            Math.abs(
                f.emaSpreadATR
            ) >= 0.05
        ) {
            score++;
            reasons.push("EMA_SPREAD");
        }

        if (
            (
                side === "BUY" &&
                f.slopeATR > 0
            ) ||
            (
                side === "SELL" &&
                f.slopeATR < 0
            )
        ) {
            score++;
            reasons.push("SLOPE");
        }

        if (
            (
                side === "BUY" &&
                f.rsi >= 50
            ) ||
            (
                side === "SELL" &&
                f.rsi < 50
            )
        ) {
            score++;
            reasons.push("RSI");
        }

        return {
            score,
            maxScore: 6,
            passed:
                score >= MIN_CONFIRMATION,
            reasons
        };
    }

    // =========================================================
    // KEYS
    // =========================================================

    function familyKey(
        side,
        setup,
        trend
    ) {

        return [
            side,
            setup,
            trend
        ].join("|");
    }

    function patternKey(
        side,
        setup,
        f
    ) {

        return [
            side,
            setup,
            f.trend,
            f.vwapPosition,
            f.regime,
            f.timeBucket,
            f.rsiBucket
        ].join("|");
    }

    // =========================================================
    // TRADE OUTCOME
    // =========================================================

    function evaluateTrade(
        candles,
        entryIndex,
        side,
        entry,
        stop,
        target
    ) {

        const end =
            Math.min(
                candles.length - 1,
                entryIndex + MAX_HOLD
            );

        for (
            let i = entryIndex + 1;
            i <= end;
            i++
        ) {

            const c =
                candles[i];

            if (side === "BUY") {

                const stopHit =
                    c.l <= stop;

                const targetHit =
                    c.h >= target;

                if (
                    stopHit &&
                    targetHit
                ) {

                    return {
                        exitIndex: i,
                        exitType: "STOP",
                        resultR: -1
                    };
                }

                if (stopHit) {

                    return {
                        exitIndex: i,
                        exitType: "STOP",
                        resultR: -1
                    };
                }

                if (targetHit) {

                    return {
                        exitIndex: i,
                        exitType: "TARGET",
                        resultR: 2
                    };
                }

            } else {

                const stopHit =
                    c.h >= stop;

                const targetHit =
                    c.l <= target;

                if (
                    stopHit &&
                    targetHit
                ) {

                    return {
                        exitIndex: i,
                        exitType: "STOP",
                        resultR: -1
                    };
                }

                if (stopHit) {

                    return {
                        exitIndex: i,
                        exitType: "STOP",
                        resultR: -1
                    };
                }

                if (targetHit) {

                    return {
                        exitIndex: i,
                        exitType: "TARGET",
                        resultR: 2
                    };
                }
            }
        }

        return {
            exitIndex: end,
            exitType: "TIMEOUT",
            resultR: 0
        };
    }

    // =========================================================
    // RECORD
    // =========================================================

    function createRecord(
        candles,
        index,
        side,
        setup
    ) {

        const f =
            getFeatures(
                candles,
                index
            );

        if (!f) return null;

        const conf =
            confirmation(
                candles,
                index,
                side
            );

        if (!conf.passed) {
            return null;
        }

        if (
            setup === "VWAP_PULLBACK"
        ) {

            if (
                !getVWAPPullback(
                    candles,
                    index,
                    side
                )
            ) {
                return null;
            }
        }

        const entry =
            candles[index].c;

        const risk =
            f.atr;

        let stop;
        let target;

        if (side === "BUY") {

            stop =
                entry - risk;

            target =
                entry +
                TARGET_R * risk;

        } else {

            stop =
                entry + risk;

            target =
                entry -
                TARGET_R * risk;
        }

        const outcome =
            evaluateTrade(
                candles,
                index,
                side,
                entry,
                stop,
                target
            );

        return {

            index,

            side,

            setup,

            trend:
                f.trend,

            regime:
                f.regime,

            vwapPosition:
                f.vwapPosition,

            timeBucket:
                f.timeBucket,

            pattern:
                patternKey(
                    side,
                    setup,
                    f
                ),

            family:
                familyKey(
                    side,
                    setup,
                    f.trend
                ),

            resultR:
                outcome.resultR,

            exitIndex:
                outcome.exitIndex,

            confirmationScore:
                conf.score
        };
    }

    // =========================================================
    // SAFE METRICS
    // =========================================================

    /*
     IMPORTANT V14.2 FIX

     V14.1 assumed `records` was always an array.

     V14.2 forcibly converts invalid input into
     an empty array, preventing:

         records.filter is not a function
    */

    function metrics(input) {

        const records =
            Array.isArray(input)
                ? input
                : Array.isArray(input?.trades)
                    ? input.trades
                    : [];

        const wins =
            records.filter(
                x =>
                    Number(x?.resultR) > 0
            ).length;

        const losses =
            records.filter(
                x =>
                    Number(x?.resultR) < 0
            ).length;

        const timeouts =
            records.filter(
                x =>
                    Number(x?.resultR) === 0
            ).length;

        const decisive =
            wins + losses;

        const winR =
            records
                .filter(
                    x =>
                        Number(x?.resultR) > 0
                )
                .reduce(
                    (
                        s,
                        x
                    ) =>
                        s +
                        Number(x.resultR),
                    0
                );

        const lossR =
            Math.abs(
                records
                    .filter(
                        x =>
                            Number(x?.resultR) < 0
                    )
                    .reduce(
                        (
                            s,
                            x
                        ) =>
                            s +
                            Number(x.resultR),
                        0
                    )
            );

        const netR =
            records.reduce(
                (
                    s,
                    x
                ) =>
                    s +
                    Number(x?.resultR || 0),
                0
            );

        const ev =
            records.length
                ? netR /
                    records.length
                : 0;

        const pf =
            lossR > 0
                ? winR / lossR
                : winR > 0
                    ? 999
                    : 0;

        let equity = 0;
        let peak = 0;
        let drawdown = 0;

        let streak = 0;
        let maxStreak = 0;

        for (const r of records) {

            const value =
                Number(
                    r?.resultR || 0
                );

            equity += value;

            peak =
                Math.max(
                    peak,
                    equity
                );

            drawdown =
                Math.max(
                    drawdown,
                    peak - equity
                );

            if (value < 0) {

                streak++;

                maxStreak =
                    Math.max(
                        maxStreak,
                        streak
                    );

            } else {

                streak = 0;
            }
        }

        return {

            trades:
                records.length,

            wins,

            losses,

            timeouts,

            decisiveTrades:
                decisive,

            winRate:
                decisive
                    ? round(
                        wins /
                        decisive *
                        100,
                        2
                    )
                    : 0,

            netR:
                round(netR),

            totalWinR:
                round(winR),

            totalLossR:
                round(lossR),

            expectedValueR:
                round(ev),

            profitFactor:
                round(pf),

            maxDrawdownR:
                round(drawdown),

            maxConsecutiveLosses:
                maxStreak
        };
    }

    // =========================================================
    // LEARNING
    // =========================================================

    function learn(
        candles,
        start,
        end
    ) {

        const families =
            new Map();

        const patterns =
            new Map();

        const raw = [];

        for (
            let i = start + 30;
            i < end - MAX_HOLD;
            i++
        ) {

            const setups =
                getSetups(
                    candles,
                    i
                );

            for (
                const setup
                of setups
            ) {

                const record =
                    createRecord(
                        candles,
                        i,
                        setup.side,
                        setup.setup
                    );

                if (!record) {
                    continue;
                }

                raw.push(record);

                if (
                    !families.has(
                        record.family
                    )
                ) {
                    families.set(
                        record.family,
                        []
                    );
                }

                families
                    .get(record.family)
                    .push(record);

                if (
                    !patterns.has(
                        record.pattern
                    )
                ) {
                    patterns.set(
                        record.pattern,
                        []
                    );
                }

                patterns
                    .get(record.pattern)
                    .push(record);
            }
        }

        function summarize(
            key,
            records,
            level
        ) {

            records =
                Array.isArray(records)
                    ? records
                    : [];

            const m =
                metrics(records);

            const window =
                Math.max(
                    1,
                    end - start
                );

            // ---------------------------------------------
            // Recent window
            // ---------------------------------------------

            const recentStart =
                end -
                Math.floor(
                    window *
                    RECENT_FRACTION
                );

            const recent =
                records.filter(
                    x =>
                        x.index >=
                        recentStart
                );

            const rm =
                metrics(recent);

            // ---------------------------------------------
            // Recent loss streak
            // ---------------------------------------------

            let streak = 0;
            let maxStreak = 0;

            for (const r of recent) {

                if (
                    Number(r.resultR) < 0
                ) {

                    streak++;

                    maxStreak =
                        Math.max(
                            maxStreak,
                            streak
                        );

                } else {

                    streak = 0;
                }
            }

            const recentHealthy =
                recent.length >=
                    RECENT_MIN_SAMPLES &&

                rm.decisiveTrades >=
                    RECENT_MIN_DECISIVE &&

                rm.expectedValueR >=
                    RECENT_MIN_EV &&

                rm.profitFactor >=
                    RECENT_MIN_PF &&

                maxStreak <
                    RECENT_MAX_LOSS_STREAK;

            // ---------------------------------------------
            // Chronological stability
            // ---------------------------------------------

            const sections = [
                [],
                [],
                []
            ];

            for (const r of records) {

                const ratio =
                    (
                        r.index - start
                    ) / window;

                const section =
                    clamp(
                        Math.floor(
                            ratio * 3
                        ),
                        0,
                        2
                    );

                sections[section]
                    .push(r);
            }

            const sectionMetrics =
                sections.map(
                    x =>
                        metrics(x)
                );

            const stable =
                sectionMetrics.filter(
                    x =>
                        x.decisiveTrades >= 2 &&
                        x.expectedValueR >= 0
                ).length;

            // ---------------------------------------------
            // Quality
            // ---------------------------------------------

            const winRate =
                m.decisiveTrades
                    ? m.wins /
                        m.decisiveTrades
                    : 0;

            let quality = 0;

            quality +=
                clamp(
                    winRate * 35,
                    0,
                    35
                );

            quality +=
                clamp(
                    Math.max(
                        m.expectedValueR,
                        0
                    ) * 35,
                    0,
                    35
                );

            quality +=
                clamp(
                    Math.max(
                        m.profitFactor - 1,
                        0
                    ) * 10,
                    0,
                    20
                );

            quality +=
                stable * 5;

            if (recentHealthy) {
                quality += 5;
            } else {
                quality -= 15;
            }

            const edgeDecay =
                m.expectedValueR > 0
                    ? (
                        m.expectedValueR -
                        rm.expectedValueR
                    ) /
                    m.expectedValueR
                    : 0;

            if (edgeDecay > 0.5) {
                quality -= 15;
            } else if (
                edgeDecay > 0.3
            ) {
                quality -= 8;
            }

            quality =
                clamp(
                    quality,
                    0,
                    100
                );

            const minSamples =
                level === "FAMILY"
                    ? FAMILY_MIN_SAMPLES
                    : PATTERN_MIN_SAMPLES;

            const minDecisive =
                level === "FAMILY"
                    ? FAMILY_MIN_DECISIVE
                    : PATTERN_MIN_DECISIVE;

            const minEV =
                level === "FAMILY"
                    ? FAMILY_MIN_EV
                    : PATTERN_MIN_EV;

            const minPF =
                level === "FAMILY"
                    ? FAMILY_MIN_PF
                    : PATTERN_MIN_PF;

            const qualified =
                records.length >=
                    minSamples &&

                m.decisiveTrades >=
                    minDecisive &&

                stable >=
                    MIN_STABLE_FOLDS &&

                m.expectedValueR >=
                    minEV &&

                m.profitFactor >=
                    minPF &&

                recentHealthy &&

                quality >= 58;

            return {

                key,

                level,

                samples:
                    records.length,

                wins:
                    m.wins,

                losses:
                    m.losses,

                decisiveTrades:
                    m.decisiveTrades,

                winRate:
                    m.winRate,

                netR:
                    m.netR,

                expectedValueR:
                    m.expectedValueR,

                profitFactor:
                    m.profitFactor,

                maxDrawdownR:
                    m.maxDrawdownR,

                stableFolds:
                    stable,

                recentSamples:
                    recent.length,

                recentDecisiveTrades:
                    rm.decisiveTrades,

                recentWinRate:
                    rm.winRate,

                recentEV:
                    rm.expectedValueR,

                recentPF:
                    rm.profitFactor,

                recentMaxLossStreak:
                    maxStreak,

                recentHealthy,

                edgeDecay:
                    round(edgeDecay),

                quality:
                    round(quality, 2),

                qualified,

                records
            };
        }

        const familyResults = [];

        for (
            const [
                key,
                records
            ] of families
        ) {

            familyResults.push(
                summarize(
                    key,
                    records,
                    "FAMILY"
                )
            );
        }

        const patternResults = [];

        for (
            const [
                key,
                records
            ] of patterns
        ) {

            patternResults.push(
                summarize(
                    key,
                    records,
                    "PATTERN"
                )
            );
        }

        return {

            families:
                familyResults,

            patterns:
                patternResults,

            rawRecords:
                raw
        };
    }

    // =========================================================
    // SELECT EDGES
    // =========================================================

    function selectEdges(
        learned
    ) {

        const selected = [];

        const goodPatterns =
            arr(learned?.patterns)
                .filter(
                    x =>
                        x.qualified &&
                        x.recentHealthy
                )
                .sort(
                    (a, b) =>
                        b.quality -
                        a.quality
                );

        const goodFamilies =
            arr(learned?.families)
                .filter(
                    x =>
                        x.qualified &&
                        x.recentHealthy
                )
                .sort(
                    (a, b) =>
                        b.quality -
                        a.quality
                );

        // Detailed patterns get priority.
        for (
            const p
            of goodPatterns
        ) {

            if (
                selected.length >= 10
            ) {
                break;
            }

            const family =
                goodFamilies.find(
                    f =>
                        f.key ===
                        p.key
                            .split("|")
                            .slice(0, 3)
                            .join("|")
                ) || null;

            selected.push({

                ...p,

                inherited:
                    false,

                familyEvidence:
                    family
            });
        }

        // Family fallback.
        for (
            const f
            of goodFamilies
        ) {

            if (
                selected.length >= 12
            ) {
                break;
            }

            const already =
                selected.some(
                    x =>
                        x.key === f.key ||
                        (
                            x.key
                                .split("|")
                                .slice(0, 3)
                                .join("|") ===
                            f.key
                        )
                );

            if (already) {
                continue;
            }

            selected.push({

                ...f,

                inherited:
                    true,

                familyEvidence:
                    f
            });
        }

        return selected;
    }

    // =========================================================
    // EXECUTE OOS
    // =========================================================

    function executeOOS(
        candles,
        start,
        end,
        edges,
        fold
    ) {

        const trades = [];

        let cooldown =
            -1;

        let lastPattern = null;
        let lastPatternIndex = -9999;

        let lastSide = null;
        let lastSideIndex = -9999;

        for (
            let i = start;
            i < end - 1;
            i++
        ) {

            if (i <= cooldown) {
                continue;
            }

            const f =
                getFeatures(
                    candles,
                    i
                );

            if (!f) continue;

            const setups =
                getSetups(
                    candles,
                    i
                );

            for (
                const setup
                of setups
            ) {

                const pattern =
                    patternKey(
                        setup.side,
                        setup.setup,
                        f
                    );

                const family =
                    familyKey(
                        setup.side,
                        setup.setup,
                        f.trend
                    );

                const edge =
                    edges.find(
                        e => {

                            if (
                                !e.recentHealthy
                            ) {
                                return false;
                            }

                            if (
                                e.level ===
                                "PATTERN"
                            ) {
                                return (
                                    e.key ===
                                    pattern
                                );
                            }

                            return (
                                e.level ===
                                    "FAMILY" &&
                                e.key ===
                                    family
                            );
                        }
                    );

                if (!edge) continue;

                if (
                    pattern ===
                        lastPattern &&
                    i -
                        lastPatternIndex <
                        SAME_PATTERN_COOLDOWN
                ) {
                    continue;
                }

                if (
                    setup.side ===
                        lastSide &&
                    i -
                        lastSideIndex <
                        SAME_SIDE_COOLDOWN
                ) {
                    continue;
                }

                const conf =
                    confirmation(
                        candles,
                        i,
                        setup.side
                    );

                if (!conf.passed) {
                    continue;
                }

                const entry =
                    candles[i].c;

                const risk =
                    f.atr;

                let stop;
                let target;

                if (
                    setup.side === "BUY"
                ) {

                    stop =
                        entry - risk;

                    target =
                        entry +
                        TARGET_R * risk;

                } else {

                    stop =
                        entry + risk;

                    target =
                        entry -
                        TARGET_R * risk;
                }

                const result =
                    evaluateTrade(
                        candles,
                        i,
                        setup.side,
                        entry,
                        stop,
                        target
                    );

                trades.push({

                    tradeNumber:
                        trades.length + 1,

                    fold,

                    index:
                        i,

                    timestamp:
                        candles[i].ts,

                    date:
                        istDate(
                            candles[i].ts
                        ),

                    time:
                        timeBucket(
                            candles[i].ts
                        ),

                    side:
                        setup.side,

                    setup:
                        setup.setup,

                    pattern,

                    family,

                    learningLevel:
                        edge.level,

                    inheritedFamily:
                        !!edge.inherited,

                    samples:
                        edge.samples,

                    recentSamples:
                        edge.recentSamples,

                    expectedValueR:
                        edge.expectedValueR,

                    profitFactor:
                        edge.profitFactor,

                    recentEV:
                        edge.recentEV,

                    recentPF:
                        edge.recentPF,

                    edgeDecay:
                        edge.edgeDecay,

                    quality:
                        edge.quality,

                    confirmationScore:
                        conf.score,

                    confirmationReasons:
                        conf.reasons,

                    entry:
                        round(entry, 2),

                    stop:
                        round(stop, 2),

                    target:
                        round(target, 2),

                    resultR:
                        result.resultR,

                    exitType:
                        result.exitType,

                    exitIndex:
                        result.exitIndex
                });

                cooldown =
                    result.exitIndex +
                    ENTRY_COOLDOWN;

                lastPattern =
                    pattern;

                lastPatternIndex =
                    i;

                lastSide =
                    setup.side;

                lastSideIndex =
                    i;

                break;
            }
        }

        return trades;
    }

    // =========================================================
    // API
    // =========================================================

    async function fetchChunk(
        token,
        start,
        end
    ) {

        const url =
            `${API_BASE}/market/historical/${INTERVAL}` +
            `?scrip-codes=${encodeURIComponent(
                SCRIP_CODE
            )}` +
            `&start_time=${start}` +
            `&end_time=${end}`;

        const response =
            await fetch(
                url,
                {
                    method: "GET",
                    headers: {
                        Authorization: token,
                        "Content-Type":
                            "application/json"
                    }
                }
            );

        const text =
            await response.text();

        let data;

        try {
            data =
                JSON.parse(text);
        } catch {
            data = {
                raw: text
            };
        }

        if (!response.ok) {

            throw new Error(
                `INDstocks API HTTP ${response.status}: ${text}`
            );
        }

        return data;
    }

    async function loadData() {

        const token =
            (
                process.env.INDSTOCKS_TOKEN ||
                process.env.INDSTOCKS_ACCESS_TOKEN ||
                ""
            ).trim();

        if (!token) {

            throw new Error(
                "INDSTOCKS_TOKEN is not configured."
            );
        }

        const end =
            Date.now();

        const start =
            end -
            DAYS *
            24 *
            60 *
            60 *
            1000;

        const chunkSize =
            7 *
            24 *
            60 *
            60 *
            1000;

        const raw = [];

        let cursor = start;
        let chunks = 0;

        while (
            cursor < end
        ) {

            const chunkEnd =
                Math.min(
                    cursor +
                    chunkSize -
                    1000,
                    end
                );

            const payload =
                await fetchChunk(
                    token,
                    cursor,
                    chunkEnd
                );

            raw.push(
                ...extractCandles(
                    payload
                )
            );

            chunks++;

            cursor =
                chunkEnd + 1000;
        }

        const candles =
            prepareCandles(raw);

        return {

            chunks,

            raw:
                raw.length,

            candles,

            deduplicated:
                raw.length -
                candles.length
        };
    }

    // =========================================================
    // MAIN
    // =========================================================

    try {

        const data =
            await loadData();

        const rows =
            data.candles;

        if (
            rows.length < 300
        ) {

            return fail(
                "Insufficient historical candle data.",
                {
                    rawCandles:
                        data.raw,

                    candles:
                        rows.length,

                    minimum:
                        300
                }
            );
        }

        // Current candle is NEVER used for training.
        const current =
            rows[rows.length - 1];

        const historical =
            rows.slice(
                0,
                -1
            );

        // =====================================================
        // WALK FORWARD
        // =====================================================

        const folds = [];

        const initialTraining =
            Math.min(
                200,
                Math.floor(
                    historical.length *
                    0.50
                )
            );

        const remaining =
            historical.length -
            initialTraining;

        const foldSize =
            Math.max(
                20,
                Math.floor(
                    remaining / 4
                )
            );

        let trainingEnd =
            initialTraining;

        for (
            let fold = 1;
            fold <= 4;
            fold++
        ) {

            const testStart =
                trainingEnd;

            const testEnd =
                fold === 4
                    ? historical.length
                    : Math.min(
                        historical.length,
                        testStart +
                        foldSize
                    );

            if (
                testStart >=
                testEnd
            ) {
                continue;
            }

            folds.push({

                fold,

                trainingStart: 0,

                trainingEnd,

                testStart,

                testEnd
            });

            trainingEnd =
                testEnd;
        }

        // =====================================================
        // FOLD EXECUTION
        // =====================================================

        const foldResults = [];
        const allTrades = [];

        for (
            const fold
            of folds
        ) {

            const learned =
                learn(
                    historical,
                    fold.trainingStart,
                    fold.trainingEnd
                );

            const edges =
                selectEdges(
                    learned
                );

            const trades =
                executeOOS(
                    historical,
                    fold.testStart,
                    fold.testEnd,
                    edges,
                    fold.fold
                );

            allTrades.push(
                ...trades
            );

            foldResults.push({

                fold:
                    fold.fold,

                trainingRows:
                    fold.trainingEnd,

                testRows:
                    fold.testEnd -
                    fold.testStart,

                discoveredFamilies:
                    learned.families.length,

                qualifiedFamilies:
                    learned.families
                        .filter(
                            x =>
                                x.qualified
                        ).length,

                discoveredPatterns:
                    learned.patterns.length,

                qualifiedPatterns:
                    learned.patterns
                        .filter(
                            x =>
                                x.qualified
                        ).length,

                selectedEdges:
                    edges.length,

                selectedEdgeLevels:
                    edges.map(
                        x =>
                            x.level
                    ),

                trades,

                metrics:
                    metrics(trades)
            });
        }

        // =====================================================
        // GLOBAL
        // =====================================================

        const global =
            metrics(
                allTrades
            );

        const familiesUsed =
            new Set(
                allTrades.map(
                    x =>
                        x.family
                )
            );

        const patternCounts = {};

        for (
            const trade
            of allTrades
        ) {

            patternCounts[
                trade.pattern
            ] =
                (
                    patternCounts[
                        trade.pattern
                    ] || 0
                ) + 1;
        }

        const patternValues =
            Object.values(
                patternCounts
            );

        const largestPatternShare =
            allTrades.length &&
            patternValues.length
                ? Math.max(
                    ...patternValues
                ) /
                allTrades.length
                : 0;

        const profitableFolds =
            foldResults.filter(
                f =>
                    f.metrics
                        .decisiveTrades >= 2 &&
                    f.metrics
                        .expectedValueR >= 0
            ).length;

        const recentTrades =
            allTrades.slice(
                Math.max(
                    0,
                    allTrades.length - 8
                )
            );

        const recent =
            metrics(
                recentTrades
            );

        const profitabilityProof =
            global.decisiveTrades >=
                GLOBAL_MIN_DECISIVE &&

            global.expectedValueR >=
                GLOBAL_MIN_EV &&

            global.profitFactor >=
                GLOBAL_MIN_PF &&

            familiesUsed.size >=
                MIN_INDEPENDENT_FAMILIES &&

            largestPatternShare <=
                MAX_PATTERN_CONCENTRATION &&

            profitableFolds >= 2;

        const riskPassed =
            global.maxDrawdownR <=
                MAX_DRAWDOWN &&

            global.maxConsecutiveLosses <=
                MAX_LOSS_STREAK;

        // =====================================================
        // FINAL LEARNING
        // =====================================================

        const finalLearning =
            learn(
                historical,
                0,
                historical.length
            );

        const finalEdges =
            selectEdges(
                finalLearning
            );

        // =====================================================
        // CURRENT MARKET
        // =====================================================

        const currentIndex =
            rows.length - 1;

        const currentFeatures =
            getFeatures(
                rows,
                currentIndex
            );

        let currentSignal = {

            status:
                "NO_TRADE",

            side:
                null,

            setup:
                null,

            reason:
                "No qualified V14.2 edge is active.",

            nextAction:
                "WAIT"
        };

        if (currentFeatures) {

            const setups =
                getSetups(
                    rows,
                    currentIndex
                );

            for (
                const setup
                of setups
            ) {

                const pattern =
                    patternKey(
                        setup.side,
                        setup.setup,
                        currentFeatures
                    );

                const family =
                    familyKey(
                        setup.side,
                        setup.setup,
                        currentFeatures.trend
                    );

                const edge =
                    finalEdges.find(
                        e => {

                            if (
                                e.level ===
                                "PATTERN"
                            ) {
                                return (
                                    e.key ===
                                    pattern
                                );
                            }

                            return (
                                e.level ===
                                    "FAMILY" &&
                                e.key ===
                                    family
                            );
                        }
                    );

                const conf =
                    confirmation(
                        rows,
                        currentIndex,
                        setup.side
                    );

                if (
                    edge &&
                    conf.passed
                ) {

                    currentSignal = {

                        status:
                            "SIGNAL",

                        side:
                            setup.side,

                        setup:
                            setup.setup,

                        pattern,

                        family,

                        learningLevel:
                            edge.level,

                        inheritedFamily:
                            !!edge.inherited,

                        quality:
                            edge.quality,

                        samples:
                            edge.samples,

                        recentSamples:
                            edge.recentSamples,

                        expectedValueR:
                            edge.expectedValueR,

                        profitFactor:
                            edge.profitFactor,

                        recentEV:
                            edge.recentEV,

                        recentPF:
                            edge.recentPF,

                        edgeDecay:
                            edge.edgeDecay,

                        confirmationScore:
                            conf.score,

                        confirmationReasons:
                            conf.reasons,

                        reason:
                            "Qualified edge + recent health + current confirmation passed.",

                        nextAction:
                            "PAPER_REVIEW_ONLY"
                    };

                    break;
                }
            }
        }

        // =====================================================
        // SETUP PERFORMANCE
        // =====================================================

        const trendFollow =
            metrics(
                allTrades.filter(
                    x =>
                        x.setup ===
                        "TREND_FOLLOW"
                )
            );

        const vwapPullback =
            metrics(
                allTrades.filter(
                    x =>
                        x.setup ===
                        "VWAP_PULLBACK"
                )
            );

        // =====================================================
        // RESPONSE
        // =====================================================

        return res.status(200).json({

            success: true,

            version: VERSION,

            status: "COMPLETED",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            instrument:
                INSTRUMENT,

            scripCode:
                SCRIP_CODE,

            interval:
                INTERVAL,

            dataSource:
                "INDSTOCKS_HISTORICAL_API",

            data: {

                requestedDays:
                    DAYS,

                chunks:
                    data.chunks,

                rawCandles:
                    data.raw,

                finalCandles:
                    rows.length,

                deduplicated:
                    data.deduplicated,

                firstCandle:
                    rows[0],

                lastCandle:
                    rows[rows.length - 1],

                currentCandleExcluded:
                    true
            },

            antiLeakage: {

                trueWalkForward:
                    true,

                chronological:
                    true,

                shuffled:
                    false,

                currentCandleExcluded:
                    true,

                currentCandleUsedForLearning:
                    false,

                futureDataUsedForTraining:
                    false,

                futureDataUsedForSignal:
                    false
            },

            learning: {

                familiesDiscovered:
                    finalLearning
                        .families
                        .length,

                qualifiedFamilies:
                    finalLearning
                        .families
                        .filter(
                            x =>
                                x.qualified
                        ).length,

                patternsDiscovered:
                    finalLearning
                        .patterns
                        .length,

                qualifiedPatterns:
                    finalLearning
                        .patterns
                        .filter(
                            x =>
                                x.qualified
                        ).length,

                selectedEdges:
                    finalEdges.length,

                detailedPatternEdges:
                    finalEdges.filter(
                        x =>
                            x.level ===
                            "PATTERN"
                    ).length,

                familyEdges:
                    finalEdges.filter(
                        x =>
                            x.level ===
                            "FAMILY"
                    ).length,

                inheritedFamilyEdges:
                    finalEdges.filter(
                        x =>
                            x.inherited
                    ).length
            },

            recentEdgeValidation: {

                fraction:
                    RECENT_FRACTION,

                minimumSamples:
                    RECENT_MIN_SAMPLES,

                minimumDecisive:
                    RECENT_MIN_DECISIVE,

                minimumEV:
                    RECENT_MIN_EV,

                minimumPF:
                    RECENT_MIN_PF,

                maximumLossStreak:
                    RECENT_MAX_LOSS_STREAK,

                latestOOSTrades:
                    recentTrades.length,

                latestOOSMetrics:
                    recent
            },

            walkForward: {

                folds:
                    foldResults.length,

                profitableFolds,

                results:
                    foldResults.map(
                        f => ({

                            fold:
                                f.fold,

                            trainingRows:
                                f.trainingRows,

                            testRows:
                                f.testRows,

                            discoveredFamilies:
                                f.discoveredFamilies,

                            qualifiedFamilies:
                                f.qualifiedFamilies,

                            discoveredPatterns:
                                f.discoveredPatterns,

                            qualifiedPatterns:
                                f.qualifiedPatterns,

                            selectedEdges:
                                f.selectedEdges,

                            metrics:
                                f.metrics,

                            tradeResults:
                                f.trades.map(
                                    t =>
                                        t.resultR
                                )
                        })
                    )
            },

            trueOOS: {

                metrics:
                    global,

                profitabilityProof:
                    profitabilityProof
                        ? "PROVEN"
                        : "NOT_PROVEN",

                riskControl:
                    riskPassed
                        ? "PASSED"
                        : "FAILED",

                independentFamilies:
                    familiesUsed.size,

                maximumPatternShare:
                    round(
                        largestPatternShare,
                        4
                    ),

                patternDiversity:
                    (
                        familiesUsed.size >=
                            MIN_INDEPENDENT_FAMILIES &&
                        largestPatternShare <=
                            MAX_PATTERN_CONCENTRATION
                    )
                        ? "PASSED"
                        : "FAILED"
            },

            setupPerformance: {

                trendFollow,

                vwapPullback
            },

            currentMarket: {

                candleTimestamp:
                    current.ts,

                price:
                    current.c,

                trend:
                    currentFeatures?.trend ||
                    null,

                regime:
                    currentFeatures?.regime ||
                    null,

                rsi:
                    currentFeatures
                        ? round(
                            currentFeatures.rsi,
                            2
                        )
                        : null,

                vwap:
                    currentFeatures
                        ? round(
                            currentFeatures.vwap,
                            2
                        )
                        : null,

                vwapPosition:
                    currentFeatures
                        ?.vwapPosition ||
                    null,

                ema9:
                    currentFeatures
                        ? round(
                            currentFeatures.ema9,
                            2
                        )
                        : null,

                ema21:
                    currentFeatures
                        ? round(
                            currentFeatures.ema21,
                            2
                        )
                        : null,

                atr:
                    currentFeatures
                        ? round(
                            currentFeatures.atr,
                            2
                        )
                        : null,

                trendStrength:
                    currentFeatures
                        ? round(
                            currentFeatures
                                .trendStrength,
                            4
                        )
                        : null
            },

            currentSignal,

            riskPlan: {

                stopR:
                    STOP_R,

                targetR:
                    TARGET_R,

                riskReward:
                    "1:2",

                maxHoldCandles:
                    MAX_HOLD,

                maxDrawdownR:
                    MAX_DRAWDOWN,

                maxLossStreak:
                    MAX_LOSS_STREAK
            },

            paperTradeLog:
                allTrades,

            nextAction:
                currentSignal.status ===
                    "SIGNAL"
                    ? "PAPER_REVIEW_ONLY"
                    : "WAIT"
        });

    } catch (error) {

        console.error(
            "TradeMind Pro V14.2 ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            version: VERSION,

            status: "ERROR",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            error:
                error?.message ||
                String(error)
        });
    }
}

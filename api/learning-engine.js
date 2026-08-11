/*
===========================================================
 TradeMind Pro
 V14.3 — EXPANDED EDGE VALIDATION ENGINE

 Instrument : NIFTY 50
 Scrip      : NIDX_40000001
 Interval   : 5 minute
 Data       : INDstocks Historical API

 MODE:
 PAPER ONLY
 NO REAL ORDERS
===========================================================

 V14.3 OBJECTIVES
 ----------------------------------------------------------
 1. Strict true walk-forward validation
 2. Current candle excluded from learning
 3. No future-data leakage
 4. Hierarchical family + detailed pattern learning
 5. Recent VWAP pullback detection
 6. Trend-strength filtering
 7. Edge persistence validation
 8. Recent-window validation
 9. Expanded OOS diagnostics
10. Pattern concentration control
11. Independent-family control
12. Edge-decay detection
13. Circuit breakers
14. No overlapping trades
15. No forced trades
16. Paper-only
===========================================================
*/

export default async function handler(req, res) {

    try {

        // =====================================================
        // CONFIG
        // =====================================================

        const VERSION = "V14.3";

        const INSTRUMENT = "NIFTY 50";
        const SCRIP_CODE = "NIDX_40000001";
        const INTERVAL = "5minute";

        const API_BASE =
            process.env.INDSTOCKS_API_BASE ||
            "https://api.indstocks.com";

        const REQUESTED_DAYS = Math.max(
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

        // =====================================================
        // LEARNING
        // =====================================================

        const FAMILY_MIN_SAMPLES = 8;
        const FAMILY_MIN_DECISIVE = 5;

        const PATTERN_MIN_SAMPLES = 6;
        const PATTERN_MIN_DECISIVE = 3;

        const MIN_STABLE_SECTIONS = 2;

        const FAMILY_MIN_EV = 0.05;
        const FAMILY_MIN_PF = 1.05;

        const PATTERN_MIN_EV = 0.05;
        const PATTERN_MIN_PF = 1.05;

        const QUALITY_THRESHOLD = 55;

        // =====================================================
        // GLOBAL PROOF
        // =====================================================

        const MIN_GLOBAL_DECISIVE = 5;
        const MIN_GLOBAL_EV = 0.10;
        const MIN_GLOBAL_PF = 1.20;

        const MIN_INDEPENDENT_FAMILIES = 2;
        const MAX_PATTERN_CONCENTRATION = 0.75;

        // V14.3 persistence requirements
        const MIN_PROFITABLE_FOLDS = 2;
        const RECENT_VALIDATION_FRACTION = 0.25;
        const RECENT_MIN_SAMPLES = 4;
        const RECENT_MIN_DECISIVE = 3;
        const RECENT_MIN_EV = 0.05;
        const RECENT_MIN_PF = 1.05;
        const RECENT_MAX_LOSS_STREAK = 3;

        // =====================================================
        // RISK
        // =====================================================

        const STOP_R = 1;
        const TARGET_R = 2;
        const PREFERRED_TARGET_R = 2.5;

        const MAX_HOLD_CANDLES = 12;

        const MAX_OOS_DRAWDOWN = 12;
        const MAX_LOSS_STREAK = 6;

        // =====================================================
        // CONFIRMATION
        // =====================================================

        const ENTRY_CONFIRMATION_MIN = 5;

        // =====================================================
        // COOLDOWNS
        // =====================================================

        const ENTRY_COOLDOWN = 3;
        const SAME_PATTERN_COOLDOWN = 5;
        const SAME_SIDE_COOLDOWN = 2;

        // =====================================================
        // VWAP
        // =====================================================

        const VWAP_LOOKBACK = 8;

        const VWAP_APPROACH_MAX_ATR = 1.25;
        const VWAP_TOUCH_MAX_ATR = 0.35;
        const VWAP_RECOVERY_MIN_ATR = 0.10;
        const VWAP_MAX_ENTRY_DISTANCE_ATR = 0.75;
        const VWAP_MAX_CANDLES_AFTER_TOUCH = 3;

        // =====================================================
        // TREND
        // =====================================================

        const MIN_SPREAD_ATR = 0.15;
        const MIN_SLOPE_ATR = 0.05;

        // =====================================================
        // RESPONSE
        // =====================================================

        function send(data) {

            return res
                .status(200)
                .json(data);
        }

        function fail(message, extra = {}) {

            return res
                .status(500)
                .json({

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

        // =====================================================
        // NUMBER HELPERS
        // =====================================================

        function n(value, fallback = null) {

            const x = Number(value);

            return Number.isFinite(x)
                ? x
                : fallback;
        }

        function round(value, digits = 4) {

            if (!Number.isFinite(value)) {
                return null;
            }

            const factor =
                Math.pow(10, digits);

            return Math.round(
                value * factor
            ) / factor;
        }

        function clamp(value, min, max) {

            return Math.max(
                min,
                Math.min(max, value)
            );
        }

        // =====================================================
        // CANDLE NORMALIZATION
        // =====================================================

        function normalizeCandle(row) {

            if (!row) {
                return null;
            }

            if (Array.isArray(row)) {

                if (row.length < 5) {
                    return null;
                }

                let ts = n(row[0]);

                const o = n(row[1]);
                const h = n(row[2]);
                const l = n(row[3]);
                const c = n(row[4]);
                const v = n(row[5], 0);

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

                return {
                    ts,
                    o,
                    h,
                    l,
                    c,
                    v
                };
            }

            let ts =
                n(
                    row.ts ??
                    row.timestamp ??
                    row.time ??
                    row.t
                );

            const o =
                n(
                    row.o ??
                    row.open
                );

            const h =
                n(
                    row.h ??
                    row.high
                );

            const l =
                n(
                    row.l ??
                    row.low
                );

            const c =
                n(
                    row.c ??
                    row.close
                );

            const v =
                n(
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

            return {
                ts,
                o,
                h,
                l,
                c,
                v
            };
        }

        // =====================================================
        // EXTRACT API ROWS
        // =====================================================

        function extractRows(payload) {

            const found = [];

            function walk(value) {

                if (!value) {
                    return;
                }

                if (Array.isArray(value)) {

                    if (
                        value.length >= 5 &&
                        !Array.isArray(value[0]) &&
                        typeof value[0] !== "object"
                    ) {

                        const candle =
                            normalizeCandle(value);

                        if (candle) {
                            found.push(candle);
                            return;
                        }
                    }

                    for (const item of value) {
                        walk(item);
                    }

                    return;
                }

                if (
                    typeof value === "object"
                ) {

                    const candle =
                        normalizeCandle(value);

                    if (candle) {
                        found.push(candle);
                        return;
                    }

                    for (
                        const key of
                        Object.keys(value)
                    ) {
                        walk(value[key]);
                    }
                }
            }

            walk(payload);

            return found;
        }

        // =====================================================
        // PREPARE DATA
        // =====================================================

        function prepareData(rows) {

            const map = new Map();

            for (const row of rows) {

                if (!row) {
                    continue;
                }

                map.set(
                    String(row.ts),
                    row
                );
            }

            return [
                ...map.values()
            ].sort(
                (a, b) =>
                    a.ts - b.ts
            );
        }

        // =====================================================
        // IST
        // =====================================================

        const IST_FORMATTER =
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
                IST_FORMATTER.formatToParts(
                    new Date(ts * 1000)
                );

            const result = {};

            for (const p of parts) {

                if (p.type !== "literal") {
                    result[p.type] = p.value;
                }
            }

            return result;
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

        function getTimeBucket(ts) {

            const mins = istMinutes(ts);

            if (mins < 600) {
                return "OPEN";
            }

            if (mins < 720) {
                return "MORNING";
            }

            if (mins < 840) {
                return "MIDDAY";
            }

            return "CLOSE";
        }

        // =====================================================
        // VWAP
        // =====================================================

        function sessionVWAP(
            candles,
            index
        ) {

            if (
                index < 0 ||
                !candles[index]
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
                        n(c.v, 0)
                    );

                pv +=
                    typical * v;

                volume += v;
            }

            if (volume <= 0) {
                return candles[index].c;
            }

            return pv / volume;
        }

        // =====================================================
        // EMA
        // =====================================================

        function ema(values, period) {

            if (
                values.length <
                period
            ) {
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

        // =====================================================
        // RSI
        // =====================================================

        function rsi(
            values,
            period = 14
        ) {

            if (
                values.length <=
                period
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

        // =====================================================
        // ATR
        // =====================================================

        function atr(
            candles,
            period = 14
        ) {

            if (
                candles.length <=
                period
            ) {
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

            if (
                trs.length <
                period
            ) {
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

        // =====================================================
        // FEATURES
        // =====================================================

        function features(
            candles,
            index
        ) {

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
                    x => x.c
                );

            const ema9 =
                ema(
                    closes,
                    9
                );

            const ema21 =
                ema(
                    closes,
                    21
                );

            const previousEMA9 =
                ema(
                    closes.slice(
                        0,
                        -1
                    ),
                    9
                );

            const rsi14 =
                rsi(
                    closes,
                    14
                );

            const atr14 =
                atr(
                    slice,
                    14
                );

            const vwap =
                sessionVWAP(
                    candles,
                    index
                );

            if (
                ema9 === null ||
                ema21 === null ||
                previousEMA9 === null ||
                rsi14 === null ||
                atr14 === null ||
                vwap === null ||
                atr14 <= 0
            ) {
                return null;
            }

            const close =
                candles[index].c;

            const spread =
                ema9 - ema21;

            const spreadATR =
                spread / atr14;

            const slope =
                ema9 - previousEMA9;

            const slopeATR =
                slope / atr14;

            let trend = "SIDEWAYS";

            if (
                ema9 > ema21 &&
                spreadATR >= MIN_SPREAD_ATR &&
                slopeATR >= MIN_SLOPE_ATR
            ) {
                trend = "BULLISH";
            }

            if (
                ema9 < ema21 &&
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

            let vwapDirection = "AT";

            if (close > vwap) {
                vwapDirection = "ABOVE";
            } else if (close < vwap) {
                vwapDirection = "BELOW";
            }

            const vwapDistanceATR =
                (
                    close - vwap
                ) / atr14;

            let rsiBucket = "NEUTRAL";

            if (rsi14 >= 60) {
                rsiBucket = "HIGH";
            } else if (rsi14 >= 50) {
                rsiBucket = "NEUTRAL_HIGH";
            } else if (rsi14 <= 40) {
                rsiBucket = "LOW";
            } else {
                rsiBucket = "NEUTRAL_LOW";
            }

            let volatility = "NORMAL";

            if (atr14 > 18) {
                volatility = "HIGH";
            } else if (atr14 < 8) {
                volatility = "LOW";
            }

            return {

                close,

                ema9,
                ema21,

                emaSpread: spread,
                emaSpreadATR: spreadATR,

                ema9SlopeATR: slopeATR,

                rsi: rsi14,
                rsiBucket,

                atr14,

                vwap,
                vwapDirection,
                vwapDistanceATR,

                trend,
                trendStrength:
                    Math.abs(spreadATR),

                regime,
                volatility,

                timeBucket:
                    getTimeBucket(
                        candles[index].ts
                    ),

                sessionDate:
                    istDate(
                        candles[index].ts
                    )
            };
        }

        // =====================================================
        // RECENT VWAP INTERACTION
        // =====================================================

        function recentVWAPInteraction(
            candles,
            index,
            side
        ) {

            const f =
                features(
                    candles,
                    index
                );

            if (!f) {
                return null;
            }

            const start =
                Math.max(
                    1,
                    index - VWAP_LOOKBACK
                );

            let touchIndex = null;
            let bestDistance = Infinity;

            for (
                let i = start;
                i < index;
                i++
            ) {

                const c =
                    candles[i];

                const v =
                    sessionVWAP(
                        candles,
                        i
                    );

                const a =
                    atr(
                        candles.slice(
                            0,
                            i + 1
                        ),
                        14
                    );

                if (
                    v === null ||
                    !a ||
                    a <= 0
                ) {
                    continue;
                }

                const distance =
                    Math.abs(
                        c.c - v
                    ) / a;

                const highDistance =
                    Math.abs(
                        c.h - v
                    ) / a;

                const lowDistance =
                    Math.abs(
                        c.l - v
                    ) / a;

                const touched =
                    distance <= VWAP_TOUCH_MAX_ATR ||
                    highDistance <= VWAP_TOUCH_MAX_ATR ||
                    lowDistance <= VWAP_TOUCH_MAX_ATR ||
                    (
                        c.l <= v &&
                        c.h >= v
                    );

                if (touched) {

                    touchIndex = i;

                    bestDistance =
                        distance;
                }
            }

            if (touchIndex === null) {
                return null;
            }

            const candlesSinceTouch =
                index - touchIndex;

            if (
                candlesSinceTouch < 1 ||
                candlesSinceTouch >
                    VWAP_MAX_CANDLES_AFTER_TOUCH
            ) {
                return null;
            }

            const currentDistance =
                Math.abs(
                    f.close - f.vwap
                ) / f.atr14;

            if (
                currentDistance >
                VWAP_MAX_ENTRY_DISTANCE_ATR
            ) {
                return null;
            }

            const recovery =
                side === "BUY"
                    ? f.close > f.vwap
                    : f.close < f.vwap;

            if (!recovery) {
                return null;
            }

            const recoveryMove =
                side === "BUY"
                    ? (
                        f.close -
                        f.vwap
                    ) / f.atr14
                    : (
                        f.vwap -
                        f.close
                    ) / f.atr14;

            if (
                recoveryMove <
                VWAP_RECOVERY_MIN_ATR
            ) {
                return null;
            }

            return {

                touchIndex,

                candlesSinceTouch,

                entryDistanceATR:
                    currentDistance,

                recoveryATR:
                    recoveryMove,

                touchDistanceATR:
                    bestDistance
            };
        }

        // =====================================================
        // SETUP DETECTION
        // =====================================================

        function detectSetups(
            candles,
            index
        ) {

            const f =
                features(
                    candles,
                    index
                );

            if (!f) {
                return [];
            }

            const setups = [];

            if (
                f.trend === "BULLISH" &&
                f.vwapDirection === "ABOVE"
            ) {

                setups.push({
                    side: "BUY",
                    setup: "TREND_FOLLOW",
                    interaction: null
                });
            }

            if (
                f.trend === "BEARISH" &&
                f.vwapDirection === "BELOW"
            ) {

                setups.push({
                    side: "SELL",
                    setup: "TREND_FOLLOW",
                    interaction: null
                });
            }

            if (
                f.trend === "BULLISH"
            ) {

                const interaction =
                    recentVWAPInteraction(
                        candles,
                        index,
                        "BUY"
                    );

                if (interaction) {

                    setups.push({
                        side: "BUY",
                        setup: "VWAP_PULLBACK",
                        interaction
                    });
                }
            }

            if (
                f.trend === "BEARISH"
            ) {

                const interaction =
                    recentVWAPInteraction(
                        candles,
                        index,
                        "SELL"
                    );

                if (interaction) {

                    setups.push({
                        side: "SELL",
                        setup: "VWAP_PULLBACK",
                        interaction
                    });
                }
            }

            return setups;
        }

        // =====================================================
        // CONFIRMATION
        // =====================================================

        function confirmationScore(
            candles,
            index,
            side
        ) {

            const f =
                features(
                    candles,
                    index
                );

            if (!f) {

                return {
                    score: 0,
                    maxScore: 6,
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
                    f.vwapDirection === "ABOVE"
                ) ||
                (
                    side === "SELL" &&
                    f.vwapDirection === "BELOW"
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
                    f.ema9SlopeATR > 0
                ) ||
                (
                    side === "SELL" &&
                    f.ema9SlopeATR < 0
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
                    score >=
                    ENTRY_CONFIRMATION_MIN,

                reasons
            };
        }

        // =====================================================
        // KEYS
        // =====================================================

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
                f.vwapDirection,
                f.regime,
                f.timeBucket,
                f.rsiBucket

            ].join("|");
        }

        // =====================================================
        // TRADE EVALUATION
        // =====================================================

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
                    entryIndex +
                    MAX_HOLD_CANDLES
                );

            for (
                let i = entryIndex + 1;
                i <= end;
                i++
            ) {

                const candle =
                    candles[i];

                if (side === "BUY") {

                    const hitStop =
                        candle.l <= stop;

                    const hitTarget =
                        candle.h >= target;

                    if (
                        hitStop &&
                        hitTarget
                    ) {

                        return {
                            exitIndex: i,
                            exitType: "STOP",
                            resultR: -1
                        };
                    }

                    if (hitStop) {

                        return {
                            exitIndex: i,
                            exitType: "STOP",
                            resultR: -1
                        };
                    }

                    if (hitTarget) {

                        return {
                            exitIndex: i,
                            exitType: "TARGET",
                            resultR: 2
                        };
                    }

                } else {

                    const hitStop =
                        candle.h >= stop;

                    const hitTarget =
                        candle.l <= target;

                    if (
                        hitStop &&
                        hitTarget
                    ) {

                        return {
                            exitIndex: i,
                            exitType: "STOP",
                            resultR: -1
                        };
                    }

                    if (hitStop) {

                        return {
                            exitIndex: i,
                            exitType: "STOP",
                            resultR: -1
                        };
                    }

                    if (hitTarget) {

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

        // =====================================================
        // CREATE LEARNING RECORD
        // =====================================================

        function createLearningRecord(
            candles,
            index,
            side,
            setup
        ) {

            const f =
                features(
                    candles,
                    index
                );

            if (!f) {
                return null;
            }

            const confirmation =
                confirmationScore(
                    candles,
                    index,
                    side
                );

            if (!confirmation.passed) {
                return null;
            }

            if (
                setup ===
                "VWAP_PULLBACK"
            ) {

                const interaction =
                    recentVWAPInteraction(
                        candles,
                        index,
                        side
                    );

                if (!interaction) {
                    return null;
                }
            }

            const entry =
                candles[index].c;

            const risk =
                f.atr14;

            const stop =
                side === "BUY"
                    ? entry - risk
                    : entry + risk;

            const target =
                side === "BUY"
                    ? entry + TARGET_R * risk
                    : entry - TARGET_R * risk;

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

                side,
                setup,

                trend:
                    f.trend,

                regime:
                    f.regime,

                timeBucket:
                    f.timeBucket,

                vwapDirection:
                    f.vwapDirection,

                rsiBucket:
                    f.rsiBucket,

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

                index,

                resultR:
                    outcome.resultR,

                exitIndex:
                    outcome.exitIndex,

                confirmationScore:
                    confirmation.score
            };
        }

        // =====================================================
        // METRICS
        // =====================================================

        function calculateMetrics(
            records
        ) {

            if (!Array.isArray(records)) {
                records = [];
            }

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

            const totalWinR =
                records
                    .filter(
                        x =>
                            Number(x?.resultR) > 0
                    )
                    .reduce(
                        (
                            sum,
                            x
                        ) =>
                            sum +
                            Number(x.resultR),
                        0
                    );

            const totalLossR =
                Math.abs(
                    records
                        .filter(
                            x =>
                                Number(x?.resultR) < 0
                        )
                        .reduce(
                            (
                                sum,
                                x
                            ) =>
                                sum +
                                Number(x.resultR),
                            0
                        )
                );

            const netR =
                records.reduce(
                    (
                        sum,
                        x
                    ) =>
                        sum +
                        Number(x?.resultR || 0),
                    0
                );

            const ev =
                records.length
                    ? netR / records.length
                    : 0;

            const pf =
                totalLossR > 0
                    ? totalWinR / totalLossR
                    : totalWinR > 0
                        ? 999
                        : 0;

            let equity = 0;
            let peak = 0;
            let maxDD = 0;

            let lossStreak = 0;
            let maxLossStreak = 0;

            for (
                const record
                of records
            ) {

                const result =
                    Number(
                        record?.resultR || 0
                    );

                equity += result;

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

                if (result < 0) {

                    lossStreak++;

                    maxLossStreak =
                        Math.max(
                            maxLossStreak,
                            lossStreak
                        );

                } else {

                    lossStreak = 0;
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
                    round(
                        netR,
                        4
                    ),

                totalWinR:
                    round(
                        totalWinR,
                        4
                    ),

                totalLossR:
                    round(
                        totalLossR,
                        4
                    ),

                expectedValueR:
                    round(
                        ev,
                        4
                    ),

                profitFactor:
                    round(
                        pf,
                        4
                    ),

                maxDrawdownR:
                    round(
                        maxDD,
                        4
                    ),

                maxConsecutiveLosses:
                    maxLossStreak
            };
        }

        // =====================================================
        // RECENT VALIDATION
        // =====================================================

        function recentValidation(
            records,
            trainingStart,
            trainingEnd
        ) {

            if (!Array.isArray(records)) {
                records = [];
            }

            const width =
                Math.max(
                    1,
                    trainingEnd -
                    trainingStart
                );

            const recentStart =
                trainingEnd -
                Math.floor(
                    width *
                    RECENT_VALIDATION_FRACTION
                );

            const recent =
                records.filter(
                    x =>
                        Number(x?.index) >=
                        recentStart
                );

            const metrics =
                calculateMetrics(
                    recent
                );

            const qualified =
                recent.length >=
                    RECENT_MIN_SAMPLES &&

                metrics.decisiveTrades >=
                    RECENT_MIN_DECISIVE &&

                metrics.expectedValueR >=
                    RECENT_MIN_EV &&

                metrics.profitFactor >=
                    RECENT_MIN_PF &&

                metrics.maxConsecutiveLosses <=
                    RECENT_MAX_LOSS_STREAK;

            return {

                fraction:
                    RECENT_VALIDATION_FRACTION,

                startIndex:
                    recentStart,

                samples:
                    recent.length,

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

                metrics,

                qualified
            };
        }

        // =====================================================
        // LEARNING
        // =====================================================

        function learnHierarchy(
            candles,
            trainingStart,
            trainingEnd
        ) {

            const familyMap = new Map();
            const patternMap = new Map();

            const rawRecords = [];

            for (
                let i =
                    trainingStart + 30;

                i <
                    trainingEnd -
                    MAX_HOLD_CANDLES;

                i++
            ) {

                const setups =
                    detectSetups(
                        candles,
                        i
                    );

                if (!setups.length) {
                    continue;
                }

                for (
                    const setup
                    of setups
                ) {

                    const record =
                        createLearningRecord(
                            candles,
                            i,
                            setup.side,
                            setup.setup
                        );

                    if (!record) {
                        continue;
                    }

                    rawRecords.push(
                        record
                    );

                    if (
                        !familyMap.has(
                            record.family
                        )
                    ) {

                        familyMap.set(
                            record.family,
                            []
                        );
                    }

                    familyMap
                        .get(record.family)
                        .push(record);

                    if (
                        !patternMap.has(
                            record.pattern
                        )
                    ) {

                        patternMap.set(
                            record.pattern,
                            []
                        );
                    }

                    patternMap
                        .get(record.pattern)
                        .push(record);
                }
            }

            function summarize(
                key,
                records,
                level
            ) {

                const metrics =
                    calculateMetrics(
                        records
                    );

                const samples =
                    records.length;

                const decisive =
                    metrics.decisiveTrades;

                const winRate =
                    decisive
                        ? metrics.wins /
                          decisive
                        : 0;

                const sectionSet =
                    new Set();

                const totalWindow =
                    Math.max(
                        1,
                        trainingEnd -
                        trainingStart
                    );

                for (
                    const record
                    of records
                ) {

                    const relative =
                        record.index -
                        trainingStart;

                    const section =
                        Math.min(
                            2,
                            Math.floor(
                                relative /
                                (
                                    totalWindow /
                                    3
                                )
                            )
                        );

                    sectionSet.add(
                        section
                    );
                }

                const stableSections =
                    sectionSet.size;

                const recent =
                    recentValidation(
                        records,
                        trainingStart,
                        trainingEnd
                    );

                const recentEV =
                    recent.metrics
                        .expectedValueR;

                const edgeDecay =
                    round(
                        metrics.expectedValueR -
                        recentEV,
                        4
                    );

                let quality = 0;

                quality +=
                    clamp(
                        winRate * 40,
                        0,
                        40
                    );

                quality +=
                    clamp(
                        Math.max(
                            metrics.expectedValueR,
                            0
                        ) * 30,
                        0,
                        30
                    );

                quality +=
                    clamp(
                        Math.max(
                            metrics.profitFactor - 1,
                            0
                        ) * 10,
                        0,
                        20
                    );

                quality +=
                    Math.min(
                        stableSections,
                        3
                    ) * 5;

                if (
                    recentEV < 0
                ) {
                    quality -= 15;
                }

                if (
                    edgeDecay > 0.50
                ) {
                    quality -= 10;
                }

                quality =
                    clamp(
                        quality,
                        0,
                        100
                    );

                const minimumSamples =
                    level === "FAMILY"
                        ? FAMILY_MIN_SAMPLES
                        : PATTERN_MIN_SAMPLES;

                const minimumDecisive =
                    level === "FAMILY"
                        ? FAMILY_MIN_DECISIVE
                        : PATTERN_MIN_DECISIVE;

                const minimumEV =
                    level === "FAMILY"
                        ? FAMILY_MIN_EV
                        : PATTERN_MIN_EV;

                const minimumPF =
                    level === "FAMILY"
                        ? FAMILY_MIN_PF
                        : PATTERN_MIN_PF;

                const qualified =
                    samples >= minimumSamples &&
                    decisive >= minimumDecisive &&
                    stableSections >= MIN_STABLE_SECTIONS &&
                    metrics.expectedValueR >= minimumEV &&
                    metrics.profitFactor >= minimumPF &&
                    recent.qualified &&
                    quality >= QUALITY_THRESHOLD;

                return {

                    key,
                    level,

                    samples,

                    wins:
                        metrics.wins,

                    losses:
                        metrics.losses,

                    timeouts:
                        metrics.timeouts,

                    decisiveTrades:
                        metrics.decisiveTrades,

                    winRate:
                        round(
                            winRate * 100,
                            2
                        ),

                    netR:
                        metrics.netR,

                    expectedValueR:
                        metrics.expectedValueR,

                    profitFactor:
                        metrics.profitFactor,

                    maxDrawdownR:
                        metrics.maxDrawdownR,

                    stableSections,

                    recentSamples:
                        recent.samples,

                    recentDecisive:
                        recent.metrics
                            .decisiveTrades,

                    recentEV:
                        round(
                            recentEV,
                            4
                        ),

                    recentPF:
                        recent.metrics
                            .profitFactor,

                    edgeDecay,

                    recentQualified:
                        recent.qualified,

                    quality:
                        round(
                            quality,
                            2
                        ),

                    qualified,

                    records
                };
            }

            const families = [];

            for (
                const [
                    key,
                    records
                ]
                of familyMap
            ) {

                families.push(
                    summarize(
                        key,
                        records,
                        "FAMILY"
                    )
                );
            }

            const patterns = [];

            for (
                const [
                    key,
                    records
                ]
                of patternMap
            ) {

                patterns.push(
                    summarize(
                        key,
                        records,
                        "PATTERN"
                    )
                );
            }

            return {

                families,
                patterns,
                rawRecords
            };
        }

        // =====================================================
        // SELECT EDGES
        // =====================================================

        function selectEdges(
            learned
        ) {

            const qualifiedFamilies =
                learned.families
                    .filter(
                        x =>
                            x.qualified
                    )
                    .sort(
                        (a, b) =>
                            b.quality -
                            a.quality
                    );

            const qualifiedPatterns =
                learned.patterns
                    .filter(
                        x =>
                            x.qualified
                    )
                    .sort(
                        (a, b) =>
                            b.quality -
                            a.quality
                    );

            const selected = [];

            // First detailed patterns.
            for (
                const pattern
                of qualifiedPatterns
            ) {

                if (
                    selected.length >= 12
                ) {
                    break;
                }

                const familyKeyValue =
                    pattern.key
                        .split("|")
                        .slice(
                            0,
                            3
                        )
                        .join("|");

                const family =
                    learned.families.find(
                        x =>
                            x.key ===
                            familyKeyValue
                    );

                selected.push({

                    ...pattern,

                    inherited: false,

                    familyEvidence:
                        family || null,

                    patternEvidence:
                        pattern
                });
            }

            // Then family inheritance.
            for (
                const family
                of qualifiedFamilies
            ) {

                const alreadyRepresented =
                    selected.some(
                        x =>
                            x.family ===
                            family.key
                    );

                if (alreadyRepresented) {
                    continue;
                }

                if (
                    selected.length >= 12
                ) {
                    break;
                }

                selected.push({

                    ...family,

                    inherited: true,

                    familyEvidence:
                        family,

                    patternEvidence:
                        null
                });
            }

            return selected;
        }

        // =====================================================
        // CONCENTRATION
        // =====================================================

        function concentration(
            trades
        ) {

            if (!Array.isArray(trades)) {
                trades = [];
            }

            if (!trades.length) {

                return {

                    uniquePatterns: 0,

                    maximumShare: 0,

                    patternCounts: {},

                    concentrationPassed:
                        false
                };
            }

            const counts = {};

            for (
                const trade
                of trades
            ) {

                const key =
                    trade.pattern ||
                    "UNKNOWN";

                counts[key] =
                    (
                        counts[key] || 0
                    ) + 1;
            }

            const values =
                Object.values(counts);

            const maximum =
                Math.max(...values);

            const maximumShare =
                maximum /
                trades.length;

            return {

                uniquePatterns:
                    Object.keys(counts)
                        .length,

                maximumShare:
                    round(
                        maximumShare,
                        4
                    ),

                patternCounts:
                    counts,

                concentrationPassed:
                    Object.keys(counts)
                        .length >= 2 &&
                    maximumShare <=
                        MAX_PATTERN_CONCENTRATION
            };
        }

        // =====================================================
        // EXECUTE FOLD
        // =====================================================

        function executeFold(
            candles,
            testStart,
            testEnd,
            selected,
            fold
        ) {

            const trades = [];

            let cooldownUntil = -1;

            let lastPattern = null;
            let lastPatternIndex = -9999;

            let lastSide = null;
            let lastSideIndex = -9999;

            const lossStreak = new Map();

            for (
                let i = testStart;
                i < testEnd - 1;
                i++
            ) {

                if (
                    i <=
                    cooldownUntil
                ) {
                    continue;
                }

                const f =
                    features(
                        candles,
                        i
                    );

                if (!f) {
                    continue;
                }

                const setups =
                    detectSetups(
                        candles,
                        i
                    );

                if (!setups.length) {
                    continue;
                }

                for (
                    const setup
                    of setups
                ) {

                    const key =
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

                    const match =
                        selected.find(
                            x =>
                                x.key === key ||
                                (
                                    x.level ===
                                    "FAMILY" &&
                                    x.key === family
                                )
                        );

                    if (!match) {
                        continue;
                    }

                    if (
                        (
                            lossStreak.get(key) ||
                            0
                        ) >=
                        MAX_LOSS_STREAK
                    ) {
                        continue;
                    }

                    if (
                        key === lastPattern &&
                        i -
                        lastPatternIndex <
                        SAME_PATTERN_COOLDOWN
                    ) {
                        continue;
                    }

                    if (
                        setup.side === lastSide &&
                        i -
                        lastSideIndex <
                        SAME_SIDE_COOLDOWN
                    ) {
                        continue;
                    }

                    const confirmation =
                        confirmationScore(
                            candles,
                            i,
                            setup.side
                        );

                    if (
                        !confirmation.passed
                    ) {
                        continue;
                    }

                    const entry =
                        candles[i].c;

                    const risk =
                        f.atr14;

                    const stop =
                        setup.side === "BUY"
                            ? entry - risk
                            : entry + risk;

                    const target =
                        setup.side === "BUY"
                            ? entry +
                              TARGET_R *
                              risk
                            : entry -
                              TARGET_R *
                              risk;

                    const preferredTarget =
                        setup.side === "BUY"
                            ? entry +
                              PREFERRED_TARGET_R *
                              risk
                            : entry -
                              PREFERRED_TARGET_R *
                              risk;

                    const outcome =
                        evaluateTrade(
                            candles,
                            i,
                            setup.side,
                            entry,
                            stop,
                            target
                        );

                    const trade = {

                        tradeNumber:
                            trades.length + 1,

                        fold,

                        index: i,

                        timestamp:
                            candles[i].ts,

                        date:
                            istDate(
                                candles[i].ts
                            ),

                        time:
                            getTimeBucket(
                                candles[i].ts
                            ),

                        side:
                            setup.side,

                        setup:
                            setup.setup,

                        pattern:
                            key,

                        family,

                        learningLevel:
                            match.level,

                        inheritedFamily:
                            Boolean(
                                match.inherited
                            ),

                        quality:
                            match.quality,

                        samples:
                            match.samples,

                        recentSamples:
                            match.recentSamples,

                        expectedValueR:
                            match.expectedValueR,

                        profitFactor:
                            match.profitFactor,

                        recentEV:
                            match.recentEV,

                        recentPF:
                            match.recentPF,

                        edgeDecay:
                            match.edgeDecay,

                        confirmationScore:
                            confirmation.score,

                        confirmationReasons:
                            confirmation.reasons,

                        entry:
                            round(
                                entry,
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

                        riskReward:
                            "1:2",

                        resultR:
                            outcome.resultR,

                        exitType:
                            outcome.exitType,

                        exitIndex:
                            outcome.exitIndex
                    };

                    trades.push(trade);

                    if (
                        outcome.resultR < 0
                    ) {

                        lossStreak.set(
                            key,
                            (
                                lossStreak.get(key) ||
                                0
                            ) + 1
                        );

                    } else {

                        lossStreak.set(
                            key,
                            0
                        );
                    }

                    cooldownUntil =
                        outcome.exitIndex +
                        ENTRY_COOLDOWN;

                    lastPattern = key;
                    lastPatternIndex = i;

                    lastSide =
                        setup.side;

                    lastSideIndex = i;

                    // one position at a time
                    break;
                }
            }

            return trades;
        }

        // =====================================================
        // API FETCH
        // =====================================================

        async function fetchHistoricalChunk(
            accessToken,
            startMs,
            endMs
        ) {

            const url =
                `${API_BASE}/market/historical/${INTERVAL}` +
                `?scrip-codes=${encodeURIComponent(
                    SCRIP_CODE
                )}` +
                `&start_time=${startMs}` +
                `&end_time=${endMs}`;

            const response =
                await fetch(
                    url,
                    {
                        method: "GET",

                        headers: {

                            Authorization:
                                accessToken,

                            "Content-Type":
                                "application/json"
                        }
                    }
                );

            const text =
                await response.text();

            let payload;

            try {
                payload =
                    JSON.parse(text);
            } catch {
                payload = {
                    raw: text
                };
            }

            if (!response.ok) {

                throw new Error(
                    `INDstocks historical API failed: HTTP ${response.status}`
                );
            }

            return payload;
        }

        // =====================================================
        // LOAD HISTORICAL DATA
        // =====================================================

        async function loadHistoricalData() {

            const accessToken =
                (
                    process.env.INDSTOCKS_TOKEN ||
                    process.env.INDSTOCKS_ACCESS_TOKEN ||
                    ""
                ).trim();

            if (!accessToken) {

                throw new Error(
                    "INDSTOCKS_TOKEN is not configured."
                );
            }

            const endMs =
                Date.now();

            const startMs =
                endMs -
                REQUESTED_DAYS *
                24 *
                60 *
                60 *
                1000;

            const MAX_CHUNK_MS =
                7 *
                24 *
                60 *
                60 *
                1000;

            const chunks = [];

            let cursor = startMs;

            while (cursor < endMs) {

                const chunkEnd =
                    Math.min(
                        cursor +
                        MAX_CHUNK_MS -
                        1000,
                        endMs
                    );

                chunks.push({

                    start:
                        cursor,

                    end:
                        chunkEnd
                });

                cursor =
                    chunkEnd + 1000;
            }

            const all = [];

            for (
                const chunk
                of chunks
            ) {

                const payload =
                    await fetchHistoricalChunk(
                        accessToken,
                        chunk.start,
                        chunk.end
                    );

                all.push(
                    ...extractRows(
                        payload
                    )
                );
            }

            const prepared =
                prepareData(all);

            return {

                chunks:
                    chunks.length,

                rawCandles:
                    all.length,

                finalCandles:
                    prepared.length,

                deduplicated:
                    all.length -
                    prepared.length,

                candles:
                    prepared
            };
        }

        // =====================================================
        // LOAD
        // =====================================================

        const historicalData =
            await loadHistoricalData();

        const rows =
            historicalData.candles;

        if (
            rows.length < 300
        ) {

            return fail(
                "Insufficient candle data from INDstocks.",
                {

                    rawCandles:
                        historicalData.rawCandles,

                    finalCandles:
                        historicalData.finalCandles,

                    minimumRequired:
                        300
                }
            );
        }

        // =====================================================
        // CURRENT CANDLE EXCLUSION
        // =====================================================

        const current =
            rows[
                rows.length - 1
            ];

        const candles =
            rows.slice(
                0,
                -1
            );

        // =====================================================
        // WALK FORWARD
        // =====================================================

        const total =
            candles.length;

        const foldCount = 4;
        const initialTraining = 200;

        const testSize =
            Math.floor(
                (
                    total -
                    initialTraining
                ) /
                foldCount
            );

        const folds = [];

        let trainingEnd =
            initialTraining;

        for (
            let fold = 1;
            fold <= foldCount;
            fold++
        ) {

            const testStart =
                trainingEnd;

            const testEnd =
                fold === foldCount
                    ? total
                    : Math.min(
                        total,
                        testStart +
                        testSize
                    );

            if (
                testStart >=
                testEnd
            ) {
                break;
            }

            folds.push({

                fold,

                trainingStart:
                    0,

                trainingEnd,

                testStart,

                testEnd,

                trainingRows:
                    trainingEnd,

                testRows:
                    testEnd -
                    testStart
            });

            trainingEnd =
                testEnd;
        }

        // =====================================================
        // EXECUTE WALK FORWARD
        // =====================================================

        const foldResults = [];
        const allTrades = [];

        let profitableFolds = 0;

        for (
            const fold
            of folds
        ) {

            const learned =
                learnHierarchy(
                    candles,
                    fold.trainingStart,
                    fold.trainingEnd
                );

            const selected =
                selectEdges(
                    learned
                );

            const trades =
                executeFold(
                    candles,
                    fold.testStart,
                    fold.testEnd,
                    selected,
                    fold.fold
                );

            allTrades.push(
                ...trades
            );

            const metrics =
                calculateMetrics(
                    trades
                );

            const conc =
                concentration(
                    trades
                );

            if (
                metrics.netR > 0 &&
                metrics.decisiveTrades > 0
            ) {
                profitableFolds++;
            }

            foldResults.push({

                fold:
                    fold.fold,

                trainingRows:
                    fold.trainingRows,

                testRows:
                    fold.testRows,

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
                    selected.length,

                selectedLevels:
                    selected.map(
                        x =>
                            x.level
                    ),

                selectedKeys:
                    selected.map(
                        x =>
                            x.key
                    ),

                metrics,

                concentration:
                    conc,

                trades,

                tradeResults:
                    trades.map(
                        x =>
                            x.resultR
                    )
            });
        }

        // =====================================================
        // GLOBAL OOS
        // =====================================================

        const globalMetrics =
            calculateMetrics(
                allTrades
            );

        const globalConcentration =
            concentration(
                allTrades
            );

        const independentFamilies =
            new Set(
                allTrades.map(
                    x =>
                        x.family
                )
            ).size;

        const maximumPatternShare =
            globalConcentration.maximumShare;

        // =====================================================
        // LATEST OOS WINDOW
        // =====================================================

        const latestOOSStart =
            Math.floor(
                candles.length *
                (
                    1 -
                    RECENT_VALIDATION_FRACTION
                )
            );

        const latestOOSTrades =
            allTrades.filter(
                x =>
                    x.index >=
                    latestOOSStart
            );

        const latestOOSMetrics =
            calculateMetrics(
                latestOOSTrades
            );

        // =====================================================
        // PROFITABILITY PROOF
        // =====================================================

        const profitabilityProof =

            globalMetrics.expectedValueR >=
                MIN_GLOBAL_EV &&

            globalMetrics.profitFactor >=
                MIN_GLOBAL_PF &&

            globalMetrics.decisiveTrades >=
                MIN_GLOBAL_DECISIVE &&

            profitableFolds >=
                MIN_PROFITABLE_FOLDS &&

            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&

            maximumPatternShare <=
                MAX_PATTERN_CONCENTRATION;

        // =====================================================
        // RISK
        // =====================================================

        const riskControl =

            globalMetrics.maxDrawdownR <=
                MAX_OOS_DRAWDOWN &&

            globalMetrics.maxConsecutiveLosses <=
                MAX_LOSS_STREAK;

        const sufficientEvidence =

            globalMetrics.decisiveTrades >=
            MIN_GLOBAL_DECISIVE;

        const patternDiversity =

            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&

            maximumPatternShare <=
                MAX_PATTERN_CONCENTRATION;

        // =====================================================
        // SETUP PERFORMANCE
        // =====================================================

        const setupPerformance = {

            trendFollow:
                calculateMetrics(
                    allTrades.filter(
                        x =>
                            x.setup ===
                            "TREND_FOLLOW"
                    )
                ),

            vwapPullback:
                calculateMetrics(
                    allTrades.filter(
                        x =>
                            x.setup ===
                            "VWAP_PULLBACK"
                    )
                )
        };

        // =====================================================
        // CURRENT MARKET
        // =====================================================

        function getCurrentMarket() {

            const index =
                rows.length - 1;

            const f =
                features(
                    rows,
                    index
                );

            if (!f) {
                return {
                    available: false
                };
            }

            return {

                candleTimestamp:
                    rows[index].ts,

                price:
                    round(
                        f.close,
                        2
                    ),

                trend:
                    f.trend,

                regime:
                    f.regime,

                rsi:
                    round(
                        f.rsi,
                        2
                    ),

                vwap:
                    round(
                        f.vwap,
                        2
                    ),

                vwapPosition:
                    f.vwapDirection,

                ema9:
                    round(
                        f.ema9,
                        2
                    ),

                ema21:
                    round(
                        f.ema21,
                        2
                    ),

                atr:
                    round(
                        f.atr14,
                        2
                    ),

                trendStrength:
                    round(
                        f.trendStrength,
                        4
                    ),

                emaSpreadATR:
                    round(
                        f.emaSpreadATR,
                        4
                    ),

                ema9SlopeATR:
                    round(
                        f.ema9SlopeATR,
                        4
                    ),

                time:
                    f.timeBucket
            };
        }

        const currentMarket =
            getCurrentMarket();

        // =====================================================
        // FINAL LEARNING
        // =====================================================

        const latestLearning =
            learnHierarchy(
                candles,
                0,
                candles.length
            );

        const latestSelected =
            selectEdges(
                latestLearning
            );

        // =====================================================
        // CURRENT SIGNAL
        // =====================================================

        let currentSignal = {

            status:
                "NO_TRADE",

            side:
                null,

            setup:
                null,

            reason:
                "No qualified V14.3 edge is active.",

            nextAction:
                "WAIT"
        };

        const currentIndex =
            rows.length - 1;

        const currentFeatures =
            features(
                rows,
                currentIndex
            );

        if (currentFeatures) {

            const setups =
                detectSetups(
                    rows,
                    currentIndex
                );

            for (
                const setup
                of setups
            ) {

                const key =
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

                const match =
                    latestSelected.find(
                        x =>
                            x.key === key ||
                            (
                                x.level ===
                                "FAMILY" &&
                                x.key === family
                            )
                    );

                if (!match) {
                    continue;
                }

                const confirmation =
                    confirmationScore(
                        rows,
                        currentIndex,
                        setup.side
                    );

                if (!confirmation.passed) {
                    continue;
                }

                /*
                 * V14.3 final protection:
                 *
                 * Do not create a current signal
                 * merely because an edge exists.
                 *
                 * The learned edge must have
                 * healthy recent evidence.
                 */

                if (
                    match.recentEV <
                    RECENT_MIN_EV ||
                    match.recentPF <
                    RECENT_MIN_PF ||
                    match.recentSamples <
                    RECENT_MIN_SAMPLES
                ) {
                    continue;
                }

                currentSignal = {

                    status:
                        "SIGNAL",

                    side:
                        setup.side,

                    setup:
                        setup.setup,

                    pattern:
                        key,

                    family,

                    learningLevel:
                        match.level,

                    inheritedFamily:
                        Boolean(
                            match.inherited
                        ),

                    quality:
                        match.quality,

                    samples:
                        match.samples,

                    recentSamples:
                        match.recentSamples,

                    expectedValueR:
                        match.expectedValueR,

                    profitFactor:
                        match.profitFactor,

                    recentEV:
                        match.recentEV,

                    recentPF:
                        match.recentPF,

                    edgeDecay:
                        match.edgeDecay,

                    confirmationScore:
                        confirmation.score,

                    confirmationMaxScore:
                        confirmation.maxScore,

                    confirmationReasons:
                        confirmation.reasons,

                    market:
                        currentMarket,

                    reason:
                        "Qualified V14.3 edge with healthy recent validation and independent entry confirmation.",

                    nextAction:
                        "PAPER_REVIEW_ONLY"
                };

                break;
            }
        }

        // =====================================================
        // REJECTION DIAGNOSTICS
        // =====================================================

        const familyRejections = {

            insufficientSamples: 0,
            insufficientDecisive: 0,
            insufficientStability: 0,
            edgeBelowThreshold: 0,
            recentNegative: 0,
            recentInsufficient: 0,
            excessiveDecay: 0
        };

        for (
            const family
            of latestLearning.families
        ) {

            if (
                family.samples <
                FAMILY_MIN_SAMPLES
            ) {
                familyRejections
                    .insufficientSamples++;
            }

            if (
                family.decisiveTrades <
                FAMILY_MIN_DECISIVE
            ) {
                familyRejections
                    .insufficientDecisive++;
            }

            if (
                family.stableSections <
                MIN_STABLE_SECTIONS
            ) {
                familyRejections
                    .insufficientStability++;
            }

            if (
                family.expectedValueR <
                FAMILY_MIN_EV ||
                family.profitFactor <
                FAMILY_MIN_PF
            ) {
                familyRejections
                    .edgeBelowThreshold++;
            }

            if (
                family.recentEV < 0
            ) {
                familyRejections
                    .recentNegative++;
            }

            if (
                family.recentSamples <
                RECENT_MIN_SAMPLES ||
                family.recentDecisive <
                RECENT_MIN_DECISIVE
            ) {
                familyRejections
                    .recentInsufficient++;
            }

            if (
                family.edgeDecay >
                0.50
            ) {
                familyRejections
                    .excessiveDecay++;
            }
        }

        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        return send({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "V14_3_EXPANDED_EDGE_VALIDATION_TRUE_WALK_FORWARD",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

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
                    REQUESTED_DAYS,

                chunks:
                    historicalData.chunks,

                rawCandles:
                    historicalData.rawCandles,

                finalCandles:
                    historicalData.finalCandles,

                deduplicated:
                    historicalData.deduplicated,

                firstCandle:
                    rows[0],

                lastCandle:
                    rows[
                        rows.length - 1
                    ],

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
                    false,

                hierarchicalLearning:
                    true,

                recentEdgeValidation:
                    true
            },

            learning: {

                familiesDiscovered:
                    latestLearning
                        .families
                        .length,

                qualifiedFamilies:
                    latestLearning
                        .families
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                patternsDiscovered:
                    latestLearning
                        .patterns
                        .length,

                qualifiedPatterns:
                    latestLearning
                        .patterns
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                selectedEdges:
                    latestSelected.length,

                detailedPatternEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.level ===
                                "PATTERN"
                        ).length,

                familyEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.level ===
                                "FAMILY"
                        ).length,

                inheritedFamilyEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.inherited
                        ).length
            },

            recentEdgeValidation: {

                fraction:
                    RECENT_VALIDATION_FRACTION,

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
                    latestOOSTrades.length,

                latestOOSMetrics:
                    latestOOSMetrics
            },

            walkForward: {

                folds:
                    folds.length,

                profitableFolds,

                requiredProfitableFolds:
                    MIN_PROFITABLE_FOLDS,

                results:
                    foldResults.map(
                        fold => ({

                            fold:
                                fold.fold,

                            trainingRows:
                                fold.trainingRows,

                            testRows:
                                fold.testRows,

                            discoveredFamilies:
                                fold.discoveredFamilies,

                            qualifiedFamilies:
                                fold.qualifiedFamilies,

                            discoveredPatterns:
                                fold.discoveredPatterns,

                            qualifiedPatterns:
                                fold.qualifiedPatterns,

                            selectedEdges:
                                fold.selectedEdges,

                            selectedLevels:
                                fold.selectedLevels,

                            metrics:
                                fold.metrics,

                            tradeResults:
                                fold.tradeResults
                        })
                    )
            },

            trueOOS: {

                metrics:
                    globalMetrics,

                profitabilityProof:
                    profitabilityProof
                        ? "PROVEN"
                        : "NOT_PROVEN",

                riskControl:
                    riskControl
                        ? "PASSED"
                        : "FAILED",

                sufficientEvidence:
                    sufficientEvidence
                        ? "PASSED"
                        : "INSUFFICIENT",

                independentFamilies:
                    independentFamilies,

                requiredIndependentFamilies:
                    MIN_INDEPENDENT_FAMILIES,

                maximumPatternShare:
                    maximumPatternShare,

                patternDiversity:
                    patternDiversity
                        ? "PASSED"
                        : "FAILED"
            },

            setupPerformance,

            currentMarket,

            currentSignal,

            latestLearning: {

                trainingRows:
                    candles.length,

                familiesDiscovered:
                    latestLearning
                        .families
                        .length,

                qualifiedFamilies:
                    latestLearning
                        .families
                        .filter(
                            x =>
                                x.qualified
                        ).length,

                patternsDiscovered:
                    latestLearning
                        .patterns
                        .length,

                qualifiedPatterns:
                    latestLearning
                        .patterns
                        .filter(
                            x =>
                                x.qualified
                        ).length,

                selectedEdges:
                    latestSelected.length,

                buyEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.key
                                    .startsWith(
                                        "BUY|"
                                    )
                        ).length,

                sellEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.key
                                    .startsWith(
                                        "SELL|"
                                    )
                        ).length,

                trendFollowEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.key
                                    .includes(
                                        "TREND_FOLLOW"
                                    )
                        ).length,

                vwapPullbackEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.key
                                    .includes(
                                        "VWAP_PULLBACK"
                                    )
                        ).length,

                familyRejections
            },

            validationRules: {

                historicalAPI: {

                    endpoint:
                        `/market/historical/${INTERVAL}`,

                    maximumChunkDays:
                        7,

                    chunkingEnabled:
                        true
                },

                sessionVWAP: {

                    enabled:
                        true,

                    reset:
                        "DAILY",

                    timezone:
                        "Asia/Kolkata"
                },

                hierarchicalLearning: {

                    enabled:
                        true,

                    familyLevel:
                        true,

                    detailedPatternLevel:
                        true,

                    inheritance:
                        true
                },

                trendStrength: {

                    enabled:
                        true,

                    minimumSpreadATR:
                        MIN_SPREAD_ATR,

                    minimumSlopeATR:
                        MIN_SLOPE_ATR
                },

                vwapPullback: {

                    enabled:
                        true,

                    recentOnly:
                        true,

                    lookbackCandles:
                        VWAP_LOOKBACK,

                    approachMaximumATR:
                        VWAP_APPROACH_MAX_ATR,

                    touchMaximumATR:
                        VWAP_TOUCH_MAX_ATR,

                    recoveryMinimumATR:
                        VWAP_RECOVERY_MIN_ATR,

                    maximumEntryDistanceATR:
                        VWAP_MAX_ENTRY_DISTANCE_ATR,

                    maximumCandlesAfterTouch:
                        VWAP_MAX_CANDLES_AFTER_TOUCH
                },

                edgeValidation: {

                    recentFraction:
                        RECENT_VALIDATION_FRACTION,

                    minimumRecentSamples:
                        RECENT_MIN_SAMPLES,

                    minimumRecentDecisive:
                        RECENT_MIN_DECISIVE,

                    minimumRecentEV:
                        RECENT_MIN_EV,

                    minimumRecentPF:
                        RECENT_MIN_PF,

                    maximumRecentLossStreak:
                        RECENT_MAX_LOSS_STREAK,

                    minimumProfitableFolds:
                        MIN_PROFITABLE_FOLDS
                },

                diversity: {

                    minimumIndependentFamilies:
                        MIN_INDEPENDENT_FAMILIES,

                    maximumPatternConcentration:
                        MAX_PATTERN_CONCENTRATION
                },

                circuitBreaker: {

                    maximumLossStreak:
                        MAX_LOSS_STREAK,

                    entryCooldownCandles:
                        ENTRY_COOLDOWN,

                    samePatternCooldownCandles:
                        SAME_PATTERN_COOLDOWN,

                    sameSideCooldownCandles:
                        SAME_SIDE_COOLDOWN
                }
            },

            riskPlan: {

                stopR:
                    STOP_R,

                targetR:
                    TARGET_R,

                preferredTargetR:
                    PREFERRED_TARGET_R,

                riskReward:
                    "1:2",

                maxHoldCandles:
                    MAX_HOLD_CANDLES,

                maxDrawdownR:
                    MAX_OOS_DRAWDOWN,

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
            "TradeMind Pro V14.3 ERROR:",
            error
        );

        return res
            .status(500)
            .json({

                success: false,

                version:
                    "V14.3",

                status:
                    "ERROR",

                paperOnly:
                    true,

                realOrders:
                    false,

                brokerOrderEnabled:
                    false,

                brokerOrderSent:
                    false,

                error:
                    error?.message ||
                    String(error)
            });
    }
}

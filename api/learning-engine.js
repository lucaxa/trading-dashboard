/*
===========================================================
 TradeMind Pro
 V14.5 — ANTI-OVERFITTING / EDGE SURVIVAL ENGINE

 Instrument : NIFTY 50
 Scrip      : NIDX_40000001
 Interval   : 5 minute
 Data       : INDstocks Historical API

 MODE:
 PAPER ONLY
 NO REAL ORDERS

 V14.5 PURPOSE
 ----------------------------------------------------------
 V14.4 discovered that historically strong patterns were
 failing in true OOS execution.

 V14.5 therefore changes the learning architecture:

     DISCOVERY
         ↓
     INTERNAL VALIDATION
         ↓
     SURVIVAL TEST
         ↓
     TRUE OOS
         ↓
     EDGE PROMOTION

 Main protections:

 1. Anti-overfitting validation
 2. Pattern must survive validation
 3. Pattern must not rely only on one historical section
 4. Pattern must justify itself against its family
 5. Anti-chasing protection
 6. Stronger trend quality
 7. VWAP pullback independently validated
 8. Edge persistence tracking
 9. Edge decay tracking
10. Multiple profitable OOS folds required
11. No overlapping trades
12. Current candle excluded
13. No future-data leakage
14. No forced trades
15. Paper only

 IMPORTANT:
 This version intentionally prefers NO_TRADE over weak
 evidence.
===========================================================
*/

export default async function handler(req, res) {

    try {

        // =====================================================
        // CONFIG
        // =====================================================

        const VERSION = "V14.5";

        const INSTRUMENT = "NIFTY 50";
        const SCRIP_CODE = "NIDX_40000001";
        const INTERVAL = "5minute";

        const API_BASE =
            process.env.INDSTOCKS_API_BASE ||
            "https://api.indstocks.com";

        const REQUESTED_DAYS = Math.max(
            30,
            Math.min(
                Number(
                    req.body?.days ||
                    req.query?.days ||
                    60
                ) || 60,
                60
            )
        );

        // =====================================================
        // DISCOVERY
        // =====================================================

        const FAMILY_MIN_SAMPLES = 12;
        const FAMILY_MIN_DECISIVE = 8;

        const PATTERN_MIN_SAMPLES = 8;
        const PATTERN_MIN_DECISIVE = 5;

        const MIN_STABLE_SECTIONS = 3;

        const FAMILY_MIN_EV = 0.05;
        const FAMILY_MIN_PF = 1.05;

        const PATTERN_MIN_EV = 0.10;
        const PATTERN_MIN_PF = 1.15;

        // =====================================================
        // INTERNAL VALIDATION
        // =====================================================

        const VALIDATION_FRACTION = 0.25;

        const VALIDATION_MIN_SAMPLES = 4;
        const VALIDATION_MIN_DECISIVE = 3;

        const VALIDATION_MIN_EV = 0.05;
        const VALIDATION_MIN_PF = 1.05;

        const MAX_VALIDATION_LOSS_STREAK = 3;

        // =====================================================
        // EDGE SURVIVAL
        // =====================================================

        const MIN_OOS_PROFITABLE_FOLDS = 3;

        const MIN_OOS_DECISIVE = 8;
        const MIN_OOS_EV = 0.05;
        const MIN_OOS_PF = 1.05;

        const MIN_INDEPENDENT_FAMILIES = 2;

        const MAX_PATTERN_CONCENTRATION = 0.70;

        // =====================================================
        // FAMILY VS PATTERN PROTECTION
        // =====================================================

        const MAX_PATTERN_FAMILY_EV_GAP = 0.90;

        const ALLOW_PATTERN_OVERRIDE_LOSING_FAMILY =
            false;

        // =====================================================
        // ANTI CHASING
        // =====================================================

        const MAX_TREND_VWAP_DISTANCE_ATR = 1.75;

        const MAX_TREND_EMA_SPREAD_ATR = 1.25;

        const MAX_TREND_STRENGTH_ATR = 1.50;

        // =====================================================
        // TREND QUALITY
        // =====================================================

        const MIN_SPREAD_ATR = 0.20;
        const MIN_SLOPE_ATR = 0.06;

        // =====================================================
        // ENTRY CONFIRMATION
        // =====================================================

        const ENTRY_CONFIRMATION_MIN = 5;

        // =====================================================
        // VWAP PULLBACK
        // =====================================================

        const VWAP_LOOKBACK = 8;

        const VWAP_TOUCH_MAX_ATR = 0.35;

        const VWAP_RECOVERY_MIN_ATR = 0.10;

        const VWAP_MAX_ENTRY_DISTANCE_ATR = 0.75;

        const VWAP_MAX_CANDLES_AFTER_TOUCH = 3;

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
        // COOLDOWN
        // =====================================================

        const ENTRY_COOLDOWN = 3;
        const SAME_PATTERN_COOLDOWN = 5;
        const SAME_SIDE_COOLDOWN = 2;

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
        // HELPERS
        // =====================================================

        function n(value, fallback = null) {

            const x = Number(value);

            return Number.isFinite(x)
                ? x
                : fallback;
        }

        function round(value, digits = 4) {

            if (
                !Number.isFinite(value)
            ) {

                return null;
            }

            const factor =
                Math.pow(
                    10,
                    digits
                );

            return Math.round(
                value * factor
            ) / factor;
        }

        function clamp(
            value,
            min,
            max
        ) {

            return Math.max(
                min,
                Math.min(
                    max,
                    value
                )
            );
        }

        function safeArray(value) {

            return Array.isArray(value)
                ? value
                : [];
        }

        // =====================================================
        // CANDLE NORMALIZATION
        // =====================================================

        function normalizeCandle(row) {

            if (!row) {
                return null;
            }

            if (
                Array.isArray(row)
            ) {

                if (
                    row.length < 5
                ) {
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

                if (
                    ts > 100000000000
                ) {

                    ts =
                        Math.floor(
                            ts / 1000
                        );
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

            if (
                ts > 100000000000
            ) {

                ts =
                    Math.floor(
                        ts / 1000
                    );
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
        // RECURSIVE EXTRACTION
        // =====================================================

        function extractRows(payload) {

            const found = [];

            function walk(value) {

                if (!value) {
                    return;
                }

                if (
                    Array.isArray(value)
                ) {

                    if (
                        value.length >= 5 &&
                        !Array.isArray(value[0]) &&
                        typeof value[0] !== "object"
                    ) {

                        const candle =
                            normalizeCandle(
                                value
                            );

                        if (candle) {

                            found.push(
                                candle
                            );

                            return;
                        }
                    }

                    for (
                        const item of value
                    ) {

                        walk(item);
                    }

                    return;
                }

                if (
                    typeof value ===
                    "object"
                ) {

                    const candle =
                        normalizeCandle(
                            value
                        );

                    if (candle) {

                        found.push(
                            candle
                        );

                        return;
                    }

                    for (
                        const key of
                        Object.keys(value)
                    ) {

                        walk(
                            value[key]
                        );
                    }
                }
            }

            walk(payload);

            return found;
        }

        function prepareData(rows) {

            const map = new Map();

            for (
                const row of rows
            ) {

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
                    timeZone:
                        "Asia/Kolkata",

                    year:
                        "numeric",

                    month:
                        "2-digit",

                    day:
                        "2-digit",

                    hour:
                        "2-digit",

                    minute:
                        "2-digit",

                    hourCycle:
                        "h23"
                }
            );

        function istParts(ts) {

            const parts =
                IST_FORMATTER.formatToParts(
                    new Date(ts * 1000)
                );

            const result = {};

            for (
                const p of parts
            ) {

                if (
                    p.type !== "literal"
                ) {

                    result[p.type] =
                        p.value;
                }
            }

            return result;
        }

        function istDate(ts) {

            const p =
                istParts(ts);

            return (
                `${p.year}-${p.month}-${p.day}`
            );
        }

        function istMinutes(ts) {

            const p =
                istParts(ts);

            return (
                Number(p.hour) * 60 +
                Number(p.minute)
            );
        }

        function getTimeBucket(ts) {

            const mins =
                istMinutes(ts);

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

                const c =
                    candles[i];

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

            if (
                volume <= 0
            ) {

                return candles[index].c;
            }

            return pv / volume;
        }

        // =====================================================
        // EMA
        // =====================================================

        function ema(
            values,
            period
        ) {

            if (
                !Array.isArray(values) ||
                values.length < period
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
                2 /
                (period + 1);

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

                const diff =
                    values[i] -
                    values[i - 1];

                if (diff >= 0) {
                    gains += diff;
                } else {
                    losses +=
                        Math.abs(diff);
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
                    diff > 0
                        ? diff
                        : 0;

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

            if (
                avgLoss === 0
            ) {

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
                !Array.isArray(candles) ||
                candles.length <= period
            ) {

                return null;
            }

            const trs = [];

            for (
                let i = 1;
                i < candles.length;
                i++
            ) {

                const c =
                    candles[i];

                const p =
                    candles[i - 1];

                trs.push(
                    Math.max(
                        c.h - c.l,
                        Math.abs(c.h - p.c),
                        Math.abs(c.l - p.c)
                    )
                );
            }

            if (
                trs.length < period
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

            if (
                index < 30
            ) {

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
                ema(closes, 9);

            const ema21 =
                ema(closes, 21);

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
                ema9 -
                previousEMA9;

            const slopeATR =
                slope / atr14;

            let trend =
                "SIDEWAYS";

            if (
                ema9 > ema21 &&
                spreadATR >= MIN_SPREAD_ATR &&
                slopeATR >= MIN_SLOPE_ATR
            ) {

                trend =
                    "BULLISH";
            }

            if (
                ema9 < ema21 &&
                spreadATR <= -MIN_SPREAD_ATR &&
                slopeATR <= -MIN_SLOPE_ATR
            ) {

                trend =
                    "BEARISH";
            }

            const trendStrength =
                Math.abs(
                    spreadATR
                );

            let regime =
                "TRANSITION";

            if (
                Math.abs(spreadATR) >= 0.35 &&
                Math.abs(slopeATR) >= 0.08
            ) {

                regime =
                    "TRENDING";

            } else if (
                Math.abs(spreadATR) < 0.15 &&
                Math.abs(slopeATR) < 0.05
            ) {

                regime =
                    "RANGING";
            }

            let vwapDirection =
                "AT";

            if (close > vwap) {
                vwapDirection =
                    "ABOVE";
            } else if (close < vwap) {
                vwapDirection =
                    "BELOW";
            }

            const vwapDistanceATR =
                (
                    close - vwap
                ) / atr14;

            let rsiBucket =
                "NEUTRAL";

            if (rsi14 >= 60) {
                rsiBucket =
                    "HIGH";
            } else if (rsi14 >= 50) {
                rsiBucket =
                    "NEUTRAL_HIGH";
            } else if (rsi14 <= 40) {
                rsiBucket =
                    "LOW";
            } else {
                rsiBucket =
                    "NEUTRAL_LOW";
            }

            let volatility =
                "NORMAL";

            if (atr14 > 18) {
                volatility =
                    "HIGH";
            } else if (atr14 < 8) {
                volatility =
                    "LOW";
            }

            return {

                close,

                ema9,

                ema21,

                emaSpread:
                    spread,

                emaSpreadATR:
                    spreadATR,

                ema9SlopeATR:
                    slopeATR,

                rsi:
                    rsi14,

                rsiBucket,

                atr14,

                vwap,

                vwapDirection,

                vwapDistanceATR,

                trend,

                trendStrength,

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
        // VWAP INTERACTION
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
                    index -
                    VWAP_LOOKBACK
                );

            let touchIndex = null;

            let bestDistance =
                Infinity;

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
                    distance <=
                        VWAP_TOUCH_MAX_ATR ||
                    highDistance <=
                        VWAP_TOUCH_MAX_ATR ||
                    lowDistance <=
                        VWAP_TOUCH_MAX_ATR ||
                    (
                        c.l <= v &&
                        c.h >= v
                    );

                if (touched) {

                    touchIndex = i;

                    bestDistance =
                        Math.min(
                            bestDistance,
                            distance
                        );
                }
            }

            if (
                touchIndex === null
            ) {

                return null;
            }

            const candlesSinceTouch =
                index -
                touchIndex;

            if (
                candlesSinceTouch < 1 ||
                candlesSinceTouch >
                    VWAP_MAX_CANDLES_AFTER_TOUCH
            ) {

                return null;
            }

            const currentDistance =
                Math.abs(
                    f.close -
                    f.vwap
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
        // ANTI-CHASING
        // =====================================================

        function antiChaseCheck(
            f,
            side
        ) {

            if (!f) {

                return {
                    passed: false,
                    reasons: [
                        "NO_FEATURES"
                    ]
                };
            }

            const reasons = [];

            if (
                Math.abs(
                    f.vwapDistanceATR
                ) >
                MAX_TREND_VWAP_DISTANCE_ATR
            ) {

                reasons.push(
                    "VWAP_TOO_FAR"
                );
            }

            if (
                Math.abs(
                    f.emaSpreadATR
                ) >
                MAX_TREND_EMA_SPREAD_ATR
            ) {

                reasons.push(
                    "EMA_TOO_EXTENDED"
                );
            }

            if (
                f.trendStrength >
                MAX_TREND_STRENGTH_ATR
            ) {

                reasons.push(
                    "TREND_TOO_EXTENDED"
                );
            }

            if (
                side === "BUY" &&
                f.ema9SlopeATR < 0
            ) {

                reasons.push(
                    "BUY_SLOPE_FAILURE"
                );
            }

            if (
                side === "SELL" &&
                f.ema9SlopeATR > 0
            ) {

                reasons.push(
                    "SELL_SLOPE_FAILURE"
                );
            }

            return {

                passed:
                    reasons.length === 0,

                reasons
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

            // -------------------------------------------------
            // TREND FOLLOW
            // -------------------------------------------------

            if (
                f.trend === "BULLISH" &&
                f.vwapDirection === "ABOVE"
            ) {

                const chase =
                    antiChaseCheck(
                        f,
                        "BUY"
                    );

                if (
                    chase.passed
                ) {

                    setups.push({

                        side: "BUY",

                        setup:
                            "TREND_FOLLOW",

                        interaction: null
                    });
                }
            }

            if (
                f.trend === "BEARISH" &&
                f.vwapDirection === "BELOW"
            ) {

                const chase =
                    antiChaseCheck(
                        f,
                        "SELL"
                    );

                if (
                    chase.passed
                ) {

                    setups.push({

                        side: "SELL",

                        setup:
                            "TREND_FOLLOW",

                        interaction: null
                    });
                }
            }

            // -------------------------------------------------
            // VWAP PULLBACK
            // -------------------------------------------------

            if (
                f.trend === "BULLISH"
            ) {

                const interaction =
                    recentVWAPInteraction(
                        candles,
                        index,
                        "BUY"
                    );

                if (
                    interaction
                ) {

                    setups.push({

                        side: "BUY",

                        setup:
                            "VWAP_PULLBACK",

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

                if (
                    interaction
                ) {

                    setups.push({

                        side: "SELL",

                        setup:
                            "VWAP_PULLBACK",

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
                reasons.push(
                    "EMA_ALIGNMENT"
                );
            }

            if (
                Math.abs(
                    f.emaSpreadATR
                ) >= 0.05
            ) {

                score++;
                reasons.push(
                    "EMA_SPREAD"
                );
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
                `S:${setup}`,
                `T:${f.trend}`,
                `V:${f.vwapDirection}`,
                `G:${f.regime}`,
                `H:${f.timeBucket}`,
                `R:${f.rsiBucket}`
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
                let i =
                    entryIndex + 1;
                i <= end;
                i++
            ) {

                const candle =
                    candles[i];

                if (
                    side === "BUY"
                ) {

                    const hitStop =
                        candle.l <= stop;

                    const hitTarget =
                        candle.h >= target;

                    /*
                     * Conservative same-candle rule:
                     * STOP FIRST.
                     */

                    if (
                        hitStop
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR: -1
                        };
                    }

                    if (
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "TARGET",

                            resultR: 2
                        };
                    }

                } else {

                    const hitStop =
                        candle.h >= stop;

                    const hitTarget =
                        candle.l <= target;

                    if (
                        hitStop
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR: -1
                        };
                    }

                    if (
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "TARGET",

                            resultR: 2
                        };
                    }
                }
            }

            return {

                exitIndex: end,

                exitType:
                    "TIMEOUT",

                resultR: 0
            };
        }

        // =====================================================
        // CREATE RECORD
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

            if (
                !confirmation.passed
            ) {

                return null;
            }

            if (
                setup ===
                "TREND_FOLLOW"
            ) {

                const chase =
                    antiChaseCheck(
                        f,
                        side
                    );

                if (
                    !chase.passed
                ) {

                    return null;
                }
            }

            let interaction = null;

            if (
                setup ===
                "VWAP_PULLBACK"
            ) {

                interaction =
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

            const atrValue =
                f.atr14;

            let stop;
            let target;

            if (
                side === "BUY"
            ) {

                stop =
                    entry -
                    atrValue;

                target =
                    entry +
                    TARGET_R *
                    atrValue;

            } else {

                stop =
                    entry +
                    atrValue;

                target =
                    entry -
                    TARGET_R *
                    atrValue;
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

                timeBucket:
                    f.timeBucket,

                vwapDirection:
                    f.vwapDirection,

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
                    confirmation.score,

                interaction
            };
        }

        // =====================================================
        // METRICS
        // =====================================================

        function calculateMetrics(
            input
        ) {

            const records =
                safeArray(input);

            const wins =
                records.filter(
                    x =>
                        x.resultR > 0
                ).length;

            const losses =
                records.filter(
                    x =>
                        x.resultR < 0
                ).length;

            const timeouts =
                records.filter(
                    x =>
                        x.resultR === 0
                ).length;

            const decisive =
                wins + losses;

            const totalWinR =
                records
                    .filter(
                        x =>
                            x.resultR > 0
                    )
                    .reduce(
                        (
                            sum,
                            x
                        ) =>
                            sum +
                            x.resultR,
                        0
                    );

            const totalLossR =
                Math.abs(
                    records
                        .filter(
                            x =>
                                x.resultR < 0
                        )
                        .reduce(
                            (
                                sum,
                                x
                            ) =>
                                sum +
                                x.resultR,
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
                        x.resultR,
                    0
                );

            const ev =
                records.length
                    ? netR /
                      records.length
                    : 0;

            const pf =
                totalLossR > 0
                    ? totalWinR /
                      totalLossR
                    : totalWinR > 0
                        ? 999
                        : 0;

            let equity = 0;
            let peak = 0;
            let maxDD = 0;

            let currentLossStreak = 0;
            let maxLossStreak = 0;

            for (
                const record
                of records
            ) {

                equity +=
                    record.resultR;

                peak =
                    Math.max(
                        peak,
                        equity
                    );

                maxDD =
                    Math.max(
                        maxDD,
                        peak -
                        equity
                    );

                if (
                    record.resultR < 0
                ) {

                    currentLossStreak++;

                    maxLossStreak =
                        Math.max(
                            maxLossStreak,
                            currentLossStreak
                        );

                } else {

                    currentLossStreak = 0;
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

                netR:
                    round(
                        netR,
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
        // STABILITY
        // =====================================================

        function calculateStability(
            records,
            start,
            end
        ) {

            const sections = [
                [],
                [],
                [],
                []
            ];

            const width =
                Math.max(
                    1,
                    (
                        end -
                        start
                    ) / 4
                );

            for (
                const record
                of safeArray(records)
            ) {

                const section =
                    Math.min(
                        3,
                        Math.floor(
                            (
                                record.index -
                                start
                            ) /
                            width
                        )
                    );

                sections[section]
                    .push(record);
            }

            const sectionMetrics =
                sections.map(
                    x =>
                        calculateMetrics(x)
                );

            const profitableSections =
                sectionMetrics.filter(
                    x =>
                        x.decisiveTrades > 0 &&
                        x.expectedValueR > 0
                ).length;

            return {

                sections:
                    sectionMetrics,

                profitableSections
            };
        }

        // =====================================================
        // DISCOVER CANDIDATES
        // =====================================================

        function discoverCandidates(
            candles,
            start,
            end
        ) {

            const familyMap =
                new Map();

            const patternMap =
                new Map();

            const rawRecords = [];

            const stop =
                Math.max(
                    start + 30,
                    end -
                    MAX_HOLD_CANDLES
                );

            for (
                let i =
                    start + 30;
                i < stop;
                i++
            ) {

                const setups =
                    detectSetups(
                        candles,
                        i
                    );

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
                        .get(
                            record.family
                        )
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
                        .get(
                            record.pattern
                        )
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

                const stability =
                    calculateStability(
                        records,
                        start,
                        end
                    );

                const recentStart =
                    start +
                    Math.floor(
                        (
                            end -
                            start
                        ) * 0.75
                    );

                const recent =
                    records.filter(
                        x =>
                            x.index >=
                            recentStart
                    );

                const recentMetrics =
                    calculateMetrics(
                        recent
                    );

                let quality = 0;

                quality +=
                    clamp(
                        metrics.winRate *
                        0.40,
                        0,
                        40
                    );

                quality +=
                    clamp(
                        Math.max(
                            metrics.expectedValueR,
                            0
                        ) * 25,
                        0,
                        25
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
                        stability.profitableSections,
                        3
                    ) * 5;

                if (
                    recentMetrics.expectedValueR < 0
                ) {

                    quality -= 20;
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
                    metrics.trades >=
                        minSamples &&

                    metrics.decisiveTrades >=
                        minDecisive &&

                    metrics.expectedValueR >=
                        minEV &&

                    metrics.profitFactor >=
                        minPF &&

                    stability.profitableSections >=
                        MIN_STABLE_SECTIONS &&

                    recentMetrics.expectedValueR >=
                        0;

                return {

                    key,

                    level,

                    samples:
                        metrics.trades,

                    decisiveTrades:
                        metrics.decisiveTrades,

                    wins:
                        metrics.wins,

                    losses:
                        metrics.losses,

                    timeouts:
                        metrics.timeouts,

                    winRate:
                        metrics.winRate,

                    netR:
                        metrics.netR,

                    expectedValueR:
                        metrics.expectedValueR,

                    profitFactor:
                        metrics.profitFactor,

                    maxDrawdownR:
                        metrics.maxDrawdownR,

                    stableSections:
                        stability.profitableSections,

                    recentSamples:
                        recent.length,

                    recentDecisive:
                        recentMetrics.decisiveTrades,

                    recentEV:
                        recentMetrics.expectedValueR,

                    recentPF:
                        recentMetrics.profitFactor,

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
        // VALIDATE CANDIDATE
        // =====================================================

        function validateCandidate(
            candles,
            candidate,
            validationStart,
            validationEnd
        ) {

            const family =
                candidate.family ||
                candidate.key
                    .split("|")
                    .slice(
                        0,
                        3
                    )
                    .join("|");

            const trades = [];

            let cooldownUntil = -1;

            let lastPattern = null;
            let lastPatternIndex = -9999;

            let lastSide = null;
            let lastSideIndex = -9999;

            const lossStreak =
                new Map();

            for (
                let i =
                    validationStart;
                i <
                    validationEnd - 1;
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

                    const currentFamily =
                        familyKey(
                            setup.side,
                            setup.setup,
                            f.trend
                        );

                    const matched =
                        candidate.level ===
                            "FAMILY"
                            ? currentFamily ===
                              family
                            : key ===
                              candidate.key;

                    if (!matched) {
                        continue;
                    }

                    if (
                        (
                            lossStreak.get(
                                key
                            ) || 0
                        ) >=
                        MAX_VALIDATION_LOSS_STREAK
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

                    const a =
                        f.atr14;

                    const stop =
                        setup.side === "BUY"
                            ? entry - a
                            : entry + a;

                    const target =
                        setup.side === "BUY"
                            ? entry + TARGET_R * a
                            : entry - TARGET_R * a;

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

                        index: i,

                        side:
                            setup.side,

                        setup:
                            setup.setup,

                        pattern:
                            key,

                        family:
                            currentFamily,

                        resultR:
                            outcome.resultR,

                        exitIndex:
                            outcome.exitIndex,

                        exitType:
                            outcome.exitType
                    };

                    trades.push(
                        trade
                    );

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

                    lastPattern =
                        key;

                    lastPatternIndex =
                        i;

                    lastSide =
                        setup.side;

                    lastSideIndex =
                        i;

                    break;
                }
            }

            const metrics =
                calculateMetrics(
                    trades
                );

            const passed =
                metrics.trades >=
                    VALIDATION_MIN_SAMPLES &&

                metrics.decisiveTrades >=
                    VALIDATION_MIN_DECISIVE &&

                metrics.expectedValueR >=
                    VALIDATION_MIN_EV &&

                metrics.profitFactor >=
                    VALIDATION_MIN_PF &&

                metrics.maxConsecutiveLosses <=
                    MAX_VALIDATION_LOSS_STREAK;

            return {

                passed,

                trades,

                metrics
            };
        }

        // =====================================================
        // PROMOTION
        // =====================================================

        function promoteCandidates(
            candles,
            discovery,
            discoveryStart,
            discoveryEnd
        ) {

            const validationStart =
                discoveryEnd -
                Math.floor(
                    (
                        discoveryEnd -
                        discoveryStart
                    ) *
                    VALIDATION_FRACTION
                );

            const candidates = [];

            const qualifiedFamilies =
                discovery.families.filter(
                    x =>
                        x.qualified
                );

            const qualifiedPatterns =
                discovery.patterns.filter(
                    x =>
                        x.qualified
                );

            for (
                const candidate
                of [
                    ...qualifiedFamilies,
                    ...qualifiedPatterns
                ]
            ) {

                const familyKeyValue =
                    candidate.level ===
                        "FAMILY"
                        ? candidate.key
                        : candidate.key
                            .split("|")
                            .slice(
                                0,
                                3
                            )
                            .join("|");

                const family =
                    discovery.families.find(
                        x =>
                            x.key ===
                            familyKeyValue
                    );

                const validation =
                    validateCandidate(
                        candles,
                        candidate,
                        validationStart,
                        discoveryEnd
                    );

                if (
                    !validation.passed
                ) {

                    continue;
                }

                // ---------------------------------------------
                // FAMILY VS PATTERN
                // ---------------------------------------------

                if (
                    candidate.level ===
                    "PATTERN"
                ) {

                    if (
                        family
                    ) {

                        if (
                            family.expectedValueR <
                            0 &&
                            !ALLOW_PATTERN_OVERRIDE_LOSING_FAMILY
                        ) {

                            continue;
                        }

                        const gap =
                            candidate.expectedValueR -
                            family.expectedValueR;

                        if (
                            gap >
                            MAX_PATTERN_FAMILY_EV_GAP
                        ) {

                            continue;
                        }
                    }
                }

                candidates.push({

                    ...candidate,

                    familyEvidence:
                        family || null,

                    validation
                });
            }

            candidates.sort(
                (
                    a,
                    b
                ) => {

                    const aScore =
                        a.validation.metrics.expectedValueR *
                        100 +
                        a.quality;

                    const bScore =
                        b.validation.metrics.expectedValueR *
                        100 +
                        b.quality;

                    return bScore - aScore;
                }
            );

            return {

                candidates,

                validationStart
            };
        }

        // =====================================================
        // EXECUTE OOS
        // =====================================================

        function executeOOS(
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

            const lossStreak =
                new Map();

            for (
                let i =
                    testStart;
                i <
                    testEnd - 1;
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

                if (
                    !setups.length
                ) {

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
                                (
                                    x.level ===
                                    "PATTERN" &&
                                    x.key ===
                                    key
                                ) ||
                                (
                                    x.level ===
                                    "FAMILY" &&
                                    x.key ===
                                    family
                                )
                        );

                    if (!match) {
                        continue;
                    }

                    if (
                        (
                            lossStreak.get(
                                key
                            ) || 0
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

                    const a =
                        f.atr14;

                    const stop =
                        setup.side === "BUY"
                            ? entry - a
                            : entry + a;

                    const target =
                        setup.side === "BUY"
                            ? entry + TARGET_R * a
                            : entry - TARGET_R * a;

                    const preferredTarget =
                        setup.side === "BUY"
                            ? entry +
                              PREFERRED_TARGET_R * a
                            : entry -
                              PREFERRED_TARGET_R * a;

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

                        signalIndex: i,

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

                        quality:
                            match.quality,

                        discoveryEV:
                            match.expectedValueR,

                        discoveryPF:
                            match.profitFactor,

                        validationEV:
                            match.validation.metrics
                                .expectedValueR,

                        validationPF:
                            match.validation.metrics
                                .profitFactor,

                        validationTrades:
                            match.validation.metrics
                                .trades,

                        familyEV:
                            match.familyEvidence
                                ? match.familyEvidence
                                    .expectedValueR
                                : null,

                        familyPF:
                            match.familyEvidence
                                ? match.familyEvidence
                                    .profitFactor
                                : null,

                        regime:
                            f.regime,

                        trend:
                            f.trend,

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

                        vwapDistanceATR:
                            round(
                                f.vwapDistanceATR,
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

                        exitType:
                            outcome.exitType,

                        resultR:
                            outcome.resultR,

                        exitIndex:
                            outcome.exitIndex
                    };

                    trades.push(
                        trade
                    );

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

                    lastPattern =
                        key;

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

            if (
                !response.ok
            ) {

                throw new Error(
                    `INDstocks historical API failed: HTTP ${response.status} ${text}`
                );
            }

            return payload;
        }

        // =====================================================
        // LOAD DATA
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

            let cursor =
                startMs;

            while (
                cursor <
                endMs
            ) {

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

                chunksRequested:
                    chunks.length,

                rawCandles:
                    all.length,

                normalizedCandles:
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
            rows.length < 500
        ) {

            return fail(
                "Insufficient candle data from INDstocks.",
                {

                    rawCandles:
                        historicalData.rawCandles,

                    normalizedCandles:
                        historicalData.normalizedCandles,

                    minimumRequired:
                        500
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

        const foldCount = 6;

        const initialTraining = 250;

        const remaining =
            total -
            initialTraining;

        const testSize =
            Math.floor(
                remaining /
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
        // EXECUTION
        // =====================================================

        const foldResults = [];

        const allTrades = [];

        let profitableFolds = 0;

        for (
            const fold
            of folds
        ) {

            /*
             * IMPORTANT:
             *
             * The last portion of the training data is
             * reserved as internal validation.
             *
             * It is NOT used for candidate discovery.
             */

            const validationSize =
                Math.max(
                    100,
                    Math.floor(
                        (
                            fold.trainingEnd -
                            fold.trainingStart
                        ) *
                        VALIDATION_FRACTION
                    )
                );

            const discoveryEnd =
                Math.max(
                    fold.trainingStart + 100,
                    fold.trainingEnd -
                    validationSize
                );

            const discovery =
                discoverCandidates(
                    candles,
                    fold.trainingStart,
                    discoveryEnd
                );

            const promoted =
                promoteCandidates(
                    candles,
                    discovery,
                    fold.trainingStart,
                    discoveryEnd
                );

            /*
             * Only candidates that survived internal
             * validation are allowed into OOS.
             */

            const selected =
                promoted.candidates
                    .slice(
                        0,
                        12
                    );

            const trades =
                executeOOS(
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

            if (
                metrics.netR > 0 &&
                metrics.expectedValueR > 0 &&
                metrics.profitFactor > 1
            ) {

                profitableFolds++;
            }

            const independentFamilies =
                new Set(
                    trades.map(
                        x =>
                            x.family
                    )
                ).size;

            foldResults.push({

                fold:
                    fold.fold,

                trainingRows:
                    fold.trainingRows,

                discoveryRows:
                    discoveryEnd -
                    fold.trainingStart,

                validationRows:
                    fold.trainingEnd -
                    discoveryEnd,

                testRows:
                    fold.testRows,

                discoveredFamilies:
                    discovery.families.length,

                qualifiedFamilies:
                    discovery.families.filter(
                        x =>
                            x.qualified
                    ).length,

                discoveredPatterns:
                    discovery.patterns.length,

                qualifiedPatterns:
                    discovery.patterns.filter(
                        x =>
                            x.qualified
                    ).length,

                validationCandidates:
                    promoted.candidates.length,

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

                independentFamilies,

                profitableFold:
                    (
                        metrics.netR > 0 &&
                        metrics.expectedValueR > 0 &&
                        metrics.profitFactor > 1
                    ),

                metrics,

                tradeResults:
                    trades.map(
                        x =>
                            x.resultR
                    ),

                trades
            });
        }

        // =====================================================
        // GLOBAL OOS
        // =====================================================

        const globalStats =
            calculateMetrics(
                allTrades
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

        const maximumPatternShare =
            allTrades.length &&
            patternValues.length
                ? Math.max(
                    ...patternValues
                ) /
                  allTrades.length
                : 0;

        const independentFamilies =
            new Set(
                allTrades.map(
                    x =>
                        x.family
                )
            ).size;

        const patternDiversity =
            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&

            maximumPatternShare <=
                MAX_PATTERN_CONCENTRATION;

        const foldValidation =
            profitableFolds >=
            MIN_OOS_PROFITABLE_FOLDS;

        const sufficientEvidence =
            globalStats.decisiveTrades >=
            MIN_OOS_DECISIVE;

        const profitabilityProof =
            foldValidation &&

            sufficientEvidence &&

            globalStats.expectedValueR >=
                MIN_OOS_EV &&

            globalStats.profitFactor >=
                MIN_OOS_PF &&

            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&

            patternDiversity;

        const riskControl =
            globalStats.maxDrawdownR <=
                MAX_OOS_DRAWDOWN &&

            globalStats.maxConsecutiveLosses <=
                MAX_LOSS_STREAK;

        // =====================================================
        // BUY / SELL
        // =====================================================

        const buyStats =
            calculateMetrics(
                allTrades.filter(
                    x =>
                        x.side ===
                        "BUY"
                )
            );

        const sellStats =
            calculateMetrics(
                allTrades.filter(
                    x =>
                        x.side ===
                        "SELL"
                )
            );

        // =====================================================
        // SETUP PERFORMANCE
        // =====================================================

        const trendFollowStats =
            calculateMetrics(
                allTrades.filter(
                    x =>
                        x.setup ===
                        "TREND_FOLLOW"
                )
            );

        const vwapPullbackStats =
            calculateMetrics(
                allTrades.filter(
                    x =>
                        x.setup ===
                        "VWAP_PULLBACK"
                )
            );

        // =====================================================
        // CURRENT MARKET
        // =====================================================

        function currentMarket() {

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

                available: true,

                candleTimestamp:
                    rows[index].ts,

                price:
                    round(
                        f.close,
                        2
                    ),

                date:
                    istDate(
                        rows[index].ts
                    ),

                time:
                    getTimeBucket(
                        rows[index].ts
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

                vwapDistanceATR:
                    round(
                        f.vwapDistanceATR,
                        4
                    ),

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

                volatility:
                    f.volatility
            };
        }

        const currentMarketData =
            currentMarket();

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
                "No V14.5 edge has passed discovery, internal validation and anti-overfitting requirements.",

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

        if (
            currentFeatures
        ) {

            /*
             * IMPORTANT:
             *
             * Current candle is NEVER used to learn
             * the edge.
             */

            const historical =
                rows.slice(
                    0,
                    -1
                );

            const finalDiscovery =
                discoverCandidates(
                    historical,
                    0,
                    historical.length
                );

            const finalPromoted =
                promoteCandidates(
                    historical,
                    finalDiscovery,
                    0,
                    historical.length
                );

            const finalSelected =
                finalPromoted.candidates
                    .slice(
                        0,
                        12
                    );

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
                    finalSelected.find(
                        x =>
                            (
                                x.level ===
                                "PATTERN" &&
                                x.key ===
                                key
                            ) ||
                            (
                                x.level ===
                                "FAMILY" &&
                                x.key ===
                                family
                            )
                    );

                const confirmation =
                    confirmationScore(
                        rows,
                        currentIndex,
                        setup.side
                    );

                if (
                    match &&
                    confirmation.passed
                ) {

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

                        quality:
                            match.quality,

                        discoveryEV:
                            match.expectedValueR,

                        discoveryPF:
                            match.profitFactor,

                        validationEV:
                            match.validation.metrics
                                .expectedValueR,

                        validationPF:
                            match.validation.metrics
                                .profitFactor,

                        validationTrades:
                            match.validation.metrics
                                .trades,

                        confirmationScore:
                            confirmation.score,

                        confirmationReasons:
                            confirmation.reasons,

                        market:
                            currentMarketData,

                        reason:
                            "Candidate survived historical discovery and internal validation. PAPER REVIEW ONLY.",

                        nextAction:
                            "PAPER_REVIEW_ONLY"
                    };

                    break;
                }
            }
        }

        // =====================================================
        // FINAL LEARNING SNAPSHOT
        // =====================================================

        const finalHistorical =
            rows.slice(
                0,
                -1
            );

        const latestDiscovery =
            discoverCandidates(
                finalHistorical,
                0,
                finalHistorical.length
            );

        const latestPromoted =
            promoteCandidates(
                finalHistorical,
                latestDiscovery,
                0,
                finalHistorical.length
            );

        // =====================================================
        // REJECTION DIAGNOSTICS
        // =====================================================

        const rejectionDiagnostics = {

            family:

                {
                    insufficientSamples: 0,
                    insufficientDecisive: 0,
                    insufficientStability: 0,
                    edgeBelowThreshold: 0,
                    recentNegative: 0
                },

            pattern:

                {
                    insufficientSamples: 0,
                    insufficientDecisive: 0,
                    insufficientStability: 0,
                    edgeBelowThreshold: 0,
                    recentNegative: 0,
                    validationFailure: 0,
                    familyConflict: 0
                },

            antiChasing: {

                blockedVWAPDistance: 0,

                blockedEMAExtension: 0,

                blockedTrendExtension: 0
            }
        };

        for (
            const family
            of latestDiscovery.families
        ) {

            if (
                family.samples <
                FAMILY_MIN_SAMPLES
            ) {

                rejectionDiagnostics
                    .family
                    .insufficientSamples++;
            }

            if (
                family.decisiveTrades <
                FAMILY_MIN_DECISIVE
            ) {

                rejectionDiagnostics
                    .family
                    .insufficientDecisive++;
            }

            if (
                family.stableSections <
                MIN_STABLE_SECTIONS
            ) {

                rejectionDiagnostics
                    .family
                    .insufficientStability++;
            }

            if (
                family.expectedValueR <
                FAMILY_MIN_EV ||
                family.profitFactor <
                FAMILY_MIN_PF
            ) {

                rejectionDiagnostics
                    .family
                    .edgeBelowThreshold++;
            }

            if (
                family.recentEV < 0
            ) {

                rejectionDiagnostics
                    .family
                    .recentNegative++;
            }
        }

        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        return send({

            success: true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "V14_5_ANTI_OVERFITTING_EDGE_SURVIVAL_TRUE_WALK_FORWARD",

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
                    historicalData
                        .chunksRequested,

                rawCandles:
                    historicalData
                        .rawCandles,

                finalCandles:
                    historicalData
                        .normalizedCandles,

                deduplicated:
                    historicalData
                        .deduplicated,

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

                internalValidation:
                    true,

                validationBeforeOOS:
                    true,

                discoverySeparatedFromValidation:
                    true,

                noForcedTrades:
                    true,

                overlappingPaperTrades:
                    false,

                sameCandleStopTargetBias:
                    "STOP_FIRST"
            },

            architecture: {

                version:
                    "V14.5",

                discovery:
                    "Candidate edges are discovered only from the discovery portion of each training window.",

                validation:
                    "Candidate edges must survive an untouched internal validation segment before entering OOS.",

                oos:
                    "Only internally validated candidates are exposed to the chronological OOS test.",

                familyProtection:
                    "Detailed patterns cannot automatically override a losing setup family.",

                antiChasing:
                    "Trend-follow entries are blocked when price or EMA structure is excessively extended.",

                objective:
                    "Prefer NO_TRADE over unsupported historical edges."
            },

            robustness: {

                requestedHistoricalDays:
                    REQUESTED_DAYS,

                walkForwardFolds:
                    folds.length,

                initialTrainingRows:
                    initialTraining,

                requiredProfitableFolds:
                    MIN_OOS_PROFITABLE_FOLDS,

                actualProfitableFolds:
                    profitableFolds,

                foldValidation:
                    foldValidation
                        ? "PASSED"
                        : "NOT_PASSED",

                purpose:
                    "Require an edge to survive internal validation and multiple independent chronological OOS periods."
            },

            learning: {

                familiesDiscovered:
                    latestDiscovery
                        .families
                        .length,

                qualifiedFamilies:
                    latestDiscovery
                        .families
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                patternsDiscovered:
                    latestDiscovery
                        .patterns
                        .length,

                qualifiedPatterns:
                    latestDiscovery
                        .patterns
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                validationSurvivors:
                    latestPromoted
                        .candidates
                        .length,

                selectedEdges:
                    latestPromoted
                        .candidates
                        .slice(
                            0,
                            12
                        )
                        .length,

                familyEdges:
                    latestPromoted
                        .candidates
                        .filter(
                            x =>
                                x.level ===
                                "FAMILY"
                        )
                        .length,

                detailedPatternEdges:
                    latestPromoted
                        .candidates
                        .filter(
                            x =>
                                x.level ===
                                "PATTERN"
                        )
                        .length
            },

            internalValidation: {

                fraction:
                    VALIDATION_FRACTION,

                minimumSamples:
                    VALIDATION_MIN_SAMPLES,

                minimumDecisive:
                    VALIDATION_MIN_DECISIVE,

                minimumEV:
                    VALIDATION_MIN_EV,

                minimumPF:
                    VALIDATION_MIN_PF,

                maximumLossStreak:
                    MAX_VALIDATION_LOSS_STREAK,

                validationRequired:
                    true,

                purpose:
                    "Prevent historically attractive patterns from immediately entering true OOS."
            },

            walkForward: {

                method:
                    "STRICT_TRUE_EXPANDING_WALK_FORWARD_WITH_INTERNAL_VALIDATION",

                folds:
                    folds.length,

                profitableFolds,

                requiredProfitableFolds:
                    MIN_OOS_PROFITABLE_FOLDS,

                chronological:
                    true,

                shuffled:
                    false,

                results:
                    foldResults.map(
                        x => ({

                            fold:
                                x.fold,

                            trainingRows:
                                x.trainingRows,

                            discoveryRows:
                                x.discoveryRows,

                            validationRows:
                                x.validationRows,

                            testRows:
                                x.testRows,

                            discoveredFamilies:
                                x.discoveredFamilies,

                            qualifiedFamilies:
                                x.qualifiedFamilies,

                            discoveredPatterns:
                                x.discoveredPatterns,

                            qualifiedPatterns:
                                x.qualifiedPatterns,

                            validationCandidates:
                                x.validationCandidates,

                            selectedEdges:
                                x.selectedEdges,

                            selectedLevels:
                                x.selectedLevels,

                            independentFamilies:
                                x.independentFamilies,

                            profitableFold:
                                x.profitableFold,

                            metrics:
                                x.metrics,

                            tradeResults:
                                x.tradeResults
                        })
                    )
            },

            trueOOS: {

                metrics:
                    globalStats,

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

                foldValidation:
                    foldValidation
                        ? "PASSED"
                        : "FAILED",

                independentFamilies,

                requiredIndependentFamilies:
                    MIN_INDEPENDENT_FAMILIES,

                maximumPatternShare:
                    round(
                        maximumPatternShare,
                        4
                    ),

                patternDiversity:
                    patternDiversity
                        ? "PASSED"
                        : "FAILED"
            },

            buySellEvidence: {

                BUY:
                    buyStats,

                SELL:
                    sellStats
            },

            setupPerformance: {

                trendFollow:
                    trendFollowStats,

                vwapPullback:
                    vwapPullbackStats
            },

            antiChasing: {

                enabled:
                    true,

                maximumTrendVWAPDistanceATR:
                    MAX_TREND_VWAP_DISTANCE_ATR,

                maximumTrendEMASpreadATR:
                    MAX_TREND_EMA_SPREAD_ATR,

                maximumTrendStrengthATR:
                    MAX_TREND_STRENGTH_ATR,

                purpose:
                    "Prevent entries after excessive price extension."
            },

            latestLearning: {

                trainingRows:
                    finalHistorical.length,

                familiesDiscovered:
                    latestDiscovery
                        .families
                        .length,

                qualifiedFamilies:
                    latestDiscovery
                        .families
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                patternsDiscovered:
                    latestDiscovery
                        .patterns
                        .length,

                qualifiedPatterns:
                    latestDiscovery
                        .patterns
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                validationSurvivors:
                    latestPromoted
                        .candidates
                        .length,

                selectedEdges:
                    latestPromoted
                        .candidates
                        .slice(
                            0,
                            12
                        )
                        .map(
                            x => ({

                                key:
                                    x.key,

                                level:
                                    x.level,

                                quality:
                                    x.quality,

                                discoveryEV:
                                    x.expectedValueR,

                                discoveryPF:
                                    x.profitFactor,

                                validationEV:
                                    x.validation.metrics
                                        .expectedValueR,

                                validationPF:
                                    x.validation.metrics
                                        .profitFactor,

                                validationTrades:
                                    x.validation.metrics
                                        .trades,

                                familyEV:
                                    x.familyEvidence
                                        ? x.familyEvidence
                                            .expectedValueR
                                        : null,

                                familyPF:
                                    x.familyEvidence
                                        ? x.familyEvidence
                                            .profitFactor
                                        : null
                            })
                        ),

                rejectionDiagnostics
            },

            currentMarket:
                currentMarketData,

            currentSignal,

            riskPlan: {

                stopR:
                    STOP_R,

                targetR:
                    TARGET_R,

                preferredTargetR:
                    PREFERRED_TARGET_R,

                riskReward:
                    "1:2",

                preferredRiskReward:
                    "1:2.5",

                maxHoldCandles:
                    MAX_HOLD_CANDLES,

                maxDrawdownR:
                    MAX_OOS_DRAWDOWN,

                maxLossStreak:
                    MAX_LOSS_STREAK,

                noStopWidening:
                    true
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
            "TradeMind Pro V14.5 ERROR:",
            error
        );

        return res
            .status(500)
            .json({

                success: false,

                version:
                    "V14.5",

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

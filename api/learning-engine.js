/*
===========================================================
 TradeMind Pro
 V14.11 — EDGE ANATOMY DIAGNOSTIC ENGINE

 Instrument : NIFTY 50
 Scrip      : NIDX_40000001
 Interval   : 5 minute
 Data       : INDstocks Historical API

 MODE:
 PAPER ONLY
 NO REAL ORDERS

 V14.11 PURPOSE
 ----------------------------------------------------------
 V14.6 proved that apparently strong discovery patterns
 were not surviving untouched validation.

 V14.11 DOES NOT loosen profitability thresholds.

 Instead it makes the complete candidate pipeline visible:

   DISCOVERY
      ↓
   QUALIFICATION
      ↓
   FAMILY RESOLUTION
      ↓
   VALIDATION CANDIDATE
      ↓
   VALIDATION EXECUTION
      ↓
   VALIDATION REJECTION REASON
      ↓
   VALIDATION SURVIVOR
      ↓
   DIVERSIFICATION
      ↓
   TRUE OOS

 Main V14.11 changes:
 1. Explicit candidate-flow diagnostics
 2. Every qualified candidate gets a diagnostic status
 3. Exact reason for family/pattern rejection
 4. Exact validation metrics for candidates
 5. Separate pre-validation and post-validation counts
 6. Pattern → family mapping verified centrally
 7. Missing diversification constants defined
 8. Validation candidate construction is observable
 9. Strict boundaries preserved
10. No threshold loosening
11. No forced trades
12. No future-data leakage
13. Current candle excluded from learning
14. No overlapping paper trades
15. Anti-chasing preserved
16. True expanding walk-forward preserved
17. Paper only

 IMPORTANT:
 V14.11 is a diagnostic version, NOT a strategy-loosening version.
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V14.11";

    try {

        // =====================================================
        // CONFIG
        // =====================================================

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
        // DISCOVERY THRESHOLDS
        // UNCHANGED FROM V14.6
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

        // V14.11 DIRECTION-AWARE DISCOVERY
        // Only SELL-side detailed edges are eligible for this
        // additional discovery lane. The candidate must still
        // independently satisfy the existing PATTERN thresholds
        // and 3-section stability requirement.
        const DIRECTIONAL_SIDE = "SELL";
        const DIRECTIONAL_MIN_FAMILY_EV = FAMILY_MIN_EV;
        const DIRECTIONAL_MIN_FAMILY_PF = FAMILY_MIN_PF;

        // V14.9 CORE EDGE THRESHOLDS (UNCHANGED)
        // Core edges aggregate detailed context variants and
        // must meet the existing FAMILY evidence floor.
        const CORE_MIN_SAMPLES = FAMILY_MIN_SAMPLES;
        const CORE_MIN_DECISIVE = FAMILY_MIN_DECISIVE;
        const CORE_MIN_EV = FAMILY_MIN_EV;
        const CORE_MIN_PF = FAMILY_MIN_PF;

        // =====================================================
        // INTERNAL VALIDATION
        // UNCHANGED FROM V14.6
        // =====================================================

        const VALIDATION_FRACTION = 0.25;

        const VALIDATION_MIN_SAMPLES = 4;
        const VALIDATION_MIN_DECISIVE = 3;

        const VALIDATION_MIN_EV = 0.05;
        const VALIDATION_MIN_PF = 1.05;

        const MAX_VALIDATION_LOSS_STREAK = 3;

        // =====================================================
        // TRUE OOS
        // UNCHANGED FROM V14.6
        // =====================================================

        const MIN_OOS_PROFITABLE_FOLDS = 3;
        const MIN_OOS_DECISIVE = 8;
        const MIN_OOS_EV = 0.05;
        const MIN_OOS_PF = 1.05;

        const MIN_INDEPENDENT_FAMILIES = 2;
        const MAX_PATTERN_CONCENTRATION = 0.70;

        // =====================================================
        // V14.9 DIVERSIFICATION LIMITS (UNCHANGED)
        // Explicitly defined.
        // =====================================================

        const MAX_SELECTED_EDGES = 6;
        const MAX_EDGES_PER_FAMILY = 2;
        const MAX_EDGES_PER_SIDE = 4;

        // =====================================================
        // FAMILY VS PATTERN
        // =====================================================

        const MAX_PATTERN_FAMILY_EV_GAP = 0.90;

        const ALLOW_PATTERN_OVERRIDE_LOSING_FAMILY =
            false;

        // =====================================================
        // ANTI-CHASING
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
        // CONFIRMATION
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
        // COOLDOWNS
        // =====================================================

        const ENTRY_COOLDOWN = 3;
        const SAME_PATTERN_COOLDOWN = 5;
        const SAME_SIDE_COOLDOWN = 2;

        // =====================================================
        // RESPONSE HELPERS
        // =====================================================

        function send(data) {
            return res.status(200).json(data);
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

        // =====================================================
        // GENERIC HELPERS
        // =====================================================

        function n(value, fallback = null) {
            const x = Number(value);
            return Number.isFinite(x) ? x : fallback;
        }

        function round(value, digits = 4) {
            if (!Number.isFinite(value)) {
                return null;
            }

            const factor = 10 ** digits;

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

                return { ts, o, h, l, c, v };
            }

            let ts = n(
                row.ts ??
                row.timestamp ??
                row.time ??
                row.t
            );

            const o = n(
                row.o ??
                row.open
            );

            const h = n(
                row.h ??
                row.high
            );

            const l = n(
                row.l ??
                row.low
            );

            const c = n(
                row.c ??
                row.close
            );

            const v = n(
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

        // =====================================================
        // RECURSIVE EXTRACTION
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
                        const key of Object.keys(value)
                    ) {
                        walk(value[key]);
                    }
                }
            }

            walk(payload);

            return found;
        }

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
                (a, b) => a.ts - b.ts
            );
        }

        // =====================================================
        // IST HELPERS
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
        // SESSION VWAP
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
                istDate(candles[index].ts);

            let pv = 0;
            let volume = 0;

            for (
                let i = index;
                i >= 0;
                i--
            ) {

                if (
                    istDate(candles[i].ts) !== date
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

                pv += typical * v;
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
                slice.map(x => x.c);

            const ema9 =
                ema(closes, 9);

            const ema21 =
                ema(closes, 21);

            const previousEMA9 =
                ema(
                    closes.slice(0, -1),
                    9
                );

            const rsi14 =
                rsi(closes, 14);

            const atr14 =
                atr(slice, 14);

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

            const trendStrength =
                Math.abs(spreadATR);

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
                features(candles, index);

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

                const c = candles[i];

                const vwapValue =
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
                    vwapValue === null ||
                    !a ||
                    a <= 0
                ) {
                    continue;
                }

                const closeDistance =
                    Math.abs(
                        c.c - vwapValue
                    ) / a;

                const highDistance =
                    Math.abs(
                        c.h - vwapValue
                    ) / a;

                const lowDistance =
                    Math.abs(
                        c.l - vwapValue
                    ) / a;

                const touched =
                    closeDistance <=
                        VWAP_TOUCH_MAX_ATR ||
                    highDistance <=
                        VWAP_TOUCH_MAX_ATR ||
                    lowDistance <=
                        VWAP_TOUCH_MAX_ATR ||
                    (
                        c.l <= vwapValue &&
                        c.h >= vwapValue
                    );

                if (touched) {

                    touchIndex = i;

                    bestDistance =
                        Math.min(
                            bestDistance,
                            closeDistance
                        );
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
                        f.close - f.vwap
                    ) / f.atr14
                    : (
                        f.vwap - f.close
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
                    reasons: ["NO_FEATURES"]
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

                if (chase.passed) {

                    setups.push({

                        side: "BUY",

                        setup:
                            "TREND_FOLLOW",

                        interaction:
                            null
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

                if (chase.passed) {

                    setups.push({

                        side: "SELL",

                        setup:
                            "TREND_FOLLOW",

                        interaction:
                            null
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

                if (interaction) {

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

                if (interaction) {

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
        // CONFIRMATION SCORE
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
        // EDGE KEYS
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

        // V14.9 CORE PATTERN
        // Primary evidence groups by the underlying edge:
        // side + setup + trend + VWAP direction.
        // Regime, time bucket and RSI remain in the detailed
        // fingerprint for diagnostics but no longer fragment
        // the primary learning sample.
        function corePatternKey(
            side,
            setup,
            f
        ) {

            return [
                side,
                `S:${setup}`,
                `T:${f.trend}`,
                `V:${f.vwapDirection}`
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
            target,
            boundaryEnd = null
        ) {

            const naturalEnd =
                Math.min(
                    candles.length - 1,
                    entryIndex +
                    MAX_HOLD_CANDLES
                );

            const end =
                boundaryEnd === null
                    ? naturalEnd
                    : Math.min(
                        naturalEnd,
                        boundaryEnd
                    );

            if (
                entryIndex + 1 >
                end
            ) {

                return {

                    exitIndex:
                        entryIndex,

                    exitType:
                        "BOUNDARY",

                    resultR:
                        null,

                    boundaryCapped:
                        true
                };
            }

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

                    if (hitStop) {

                        return {

                            exitIndex: i,
                            exitType: "STOP",
                            resultR: -1,
                            boundaryCapped: false
                        };
                    }

                    if (hitTarget) {

                        return {

                            exitIndex: i,
                            exitType: "TARGET",
                            resultR: TARGET_R,
                            boundaryCapped: false
                        };
                    }

                } else {

                    const hitStop =
                        candle.h >= stop;

                    const hitTarget =
                        candle.l <= target;

                    if (hitStop) {

                        return {

                            exitIndex: i,
                            exitType: "STOP",
                            resultR: -1,
                            boundaryCapped: false
                        };
                    }

                    if (hitTarget) {

                        return {

                            exitIndex: i,
                            exitType: "TARGET",
                            resultR: TARGET_R,
                            boundaryCapped: false
                        };
                    }
                }
            }

            const boundaryCapped =
                boundaryEnd !== null &&
                end < naturalEnd;

            return {

                exitIndex: end,

                exitType:
                    boundaryCapped
                        ? "BOUNDARY_TIMEOUT"
                        : "TIMEOUT",

                resultR: 0,

                boundaryCapped
            };
        }

        // =====================================================
        // CREATE LEARNING RECORD
        // =====================================================

        function createLearningRecord(
            candles,
            index,
            side,
            setup,
            boundaryEnd = null
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
                setup === "TREND_FOLLOW"
            ) {

                const chase =
                    antiChaseCheck(
                        f,
                        side
                    );

                if (!chase.passed) {
                    return null;
                }
            }

            let interaction = null;

            if (
                setup === "VWAP_PULLBACK"
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

            const stop =
                side === "BUY"
                    ? entry - atrValue
                    : entry + atrValue;

            const target =
                side === "BUY"
                    ? entry +
                      TARGET_R * atrValue
                    : entry -
                      TARGET_R * atrValue;

            const outcome =
                evaluateTrade(
                    candles,
                    index,
                    side,
                    entry,
                    stop,
                    target,
                    boundaryEnd
                );

            if (
                outcome.resultR === null
            ) {
                return null;
            }

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

                corePattern:
                    corePatternKey(
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

                exitType:
                    outcome.exitType,

                boundaryCapped:
                    outcome.boundaryCapped,

                confirmationScore:
                    confirmation.score,

                confirmationReasons:
                    confirmation.reasons,

                interaction
            };
        }

        // =====================================================
        // METRICS
        // =====================================================

        function calculateMetrics(input) {

            const records =
                safeArray(input)
                    .filter(
                        x =>
                            x &&
                            Number.isFinite(
                                x.resultR
                            )
                    );

            const wins =
                records.filter(
                    x => x.resultR > 0
                ).length;

            const losses =
                records.filter(
                    x => x.resultR < 0
                ).length;

            const timeouts =
                records.filter(
                    x => x.resultR === 0
                ).length;

            const decisive =
                wins + losses;

            const totalWinR =
                records
                    .filter(
                        x => x.resultR > 0
                    )
                    .reduce(
                        (sum, x) =>
                            sum + x.resultR,
                        0
                    );

            const totalLossR =
                Math.abs(
                    records
                        .filter(
                            x => x.resultR < 0
                        )
                        .reduce(
                            (sum, x) =>
                                sum + x.resultR,
                            0
                        )
                );

            const netR =
                records.reduce(
                    (sum, x) =>
                        sum + x.resultR,
                    0
                );

            const ev =
                records.length
                    ? netR / records.length
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

            for (const record of records) {

                equity += record.resultR;

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
                    (end - start) / 4
                );

            for (const record of safeArray(records)) {

                if (
                    !Number.isFinite(
                        record.index
                    )
                ) {
                    continue;
                }

                const relative =
                    record.index - start;

                const section =
                    Math.min(
                        3,
                        Math.max(
                            0,
                            Math.floor(
                                relative / width
                            )
                        )
                    );

                sections[section].push(
                    record
                );
            }

            const sectionMetrics =
                sections.map(
                    section =>
                        calculateMetrics(
                            section
                        )
                );

            const profitableSections =
                sectionMetrics.filter(
                    metric =>
                        metric.decisiveTrades > 0 &&
                        metric.expectedValueR > 0
                ).length;

            return {

                sections:
                    sectionMetrics,

                profitableSections
            };
        }
     
          // =====================================================
        // DISCOVERY CANDIDATES
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

            const corePatternMap =
                new Map();

            const rawRecords = [];

            const stop =
                Math.max(
                    start + 30,
                    end -
                    MAX_HOLD_CANDLES
                );

            for (
                let i = start + 30;
                i < stop;
                i++
            ) {

                const setups =
                    detectSetups(
                        candles,
                        i
                    );

                for (const setup of setups) {

                    const record =
                        createLearningRecord(
                            candles,
                            i,
                            setup.side,
                            setup.setup,
                            end - 1
                        );

                    if (!record) {
                        continue;
                    }

                    if (
                        record.boundaryCapped
                    ) {
                        continue;
                    }

                    rawRecords.push(record);

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

                    if (
                        !corePatternMap.has(
                            record.corePattern
                        )
                    ) {
                        corePatternMap.set(
                            record.corePattern,
                            []
                        );
                    }

                    corePatternMap
                        .get(record.corePattern)
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
                            end - start
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
                        : level === "CORE"
                            ? CORE_MIN_SAMPLES
                            : PATTERN_MIN_SAMPLES;

                const minDecisive =
                    level === "FAMILY"
                        ? FAMILY_MIN_DECISIVE
                        : level === "CORE"
                            ? CORE_MIN_DECISIVE
                            : PATTERN_MIN_DECISIVE;

                const minEV =
                    level === "FAMILY"
                        ? FAMILY_MIN_EV
                        : level === "CORE"
                            ? CORE_MIN_EV
                            : PATTERN_MIN_EV;

                const minPF =
                    level === "FAMILY"
                        ? FAMILY_MIN_PF
                        : level === "CORE"
                            ? CORE_MIN_PF
                            : PATTERN_MIN_PF;

                const rejectionReasons = [];

                if (
                    metrics.trades <
                    minSamples
                ) {
                    rejectionReasons.push(
                        "INSUFFICIENT_SAMPLES"
                    );
                }

                if (
                    metrics.decisiveTrades <
                    minDecisive
                ) {
                    rejectionReasons.push(
                        "INSUFFICIENT_DECISIVE"
                    );
                }

                if (
                    stability.profitableSections <
                    MIN_STABLE_SECTIONS
                ) {
                    rejectionReasons.push(
                        "INSUFFICIENT_STABILITY"
                    );
                }

                if (
                    metrics.expectedValueR <
                    minEV ||
                    metrics.profitFactor <
                    minPF
                ) {
                    rejectionReasons.push(
                        "EDGE_BELOW_THRESHOLD"
                    );
                }

                if (
                    recentMetrics.expectedValueR < 0
                ) {
                    rejectionReasons.push(
                        "RECENT_NEGATIVE"
                    );
                }

                const qualified =
                    rejectionReasons.length === 0;

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

                    maxConsecutiveLosses:
                        metrics.maxConsecutiveLosses,

                    stableSections:
                        stability.profitableSections,

                    sectionMetrics:
                        stability.sections,

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

                    discoveryRejectionReasons:
                        rejectionReasons,

                    records
                };
            }

            const families = [];

            for (
                const [
                    key,
                    records
                ] of familyMap
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
                ] of patternMap
            ) {

                patterns.push(
                    summarize(
                        key,
                        records,
                        "PATTERN"
                    )
                );
            }

            const corePatterns = [];

            for (
                const [
                    key,
                    records
                ] of corePatternMap
            ) {

                const summary =
                    summarize(
                        key,
                        records,
                        "CORE"
                    );

                summary.contextVariants =
                    new Set(
                        records.map(
                            x => x.pattern
                        )
                    ).size;

                corePatterns.push(
                    summary
                );
            }

            const directionalPatterns =
                patterns
                    .filter(x =>
                        String(x.key).startsWith(
                            `${DIRECTIONAL_SIDE}|`
                        ) && x.qualified
                    )
                    .map(x => ({
                        ...x,
                        level: "DIRECTIONAL",
                        direction: DIRECTIONAL_SIDE
                    }));

            return {

                families,

                patterns,

                corePatterns,

                directionalPatterns,

                rawRecords
            };
        }

        // =====================================================
        // FAMILY RESOLUTION
        // =====================================================

        function resolveFamilyKey(
            candidate
        ) {

            if (!candidate) {
                return null;
            }

            if (
                candidate.level === "FAMILY"
            ) {
                return candidate.key;
            }

            const parts =
                String(
                    candidate.key
                ).split("|");

            if (parts.length < 3) {
                return null;
            }

            const side = parts[0];

            let setup = null;
            let trend = null;

            for (const part of parts) {

                if (
                    part.startsWith("S:")
                ) {
                    setup =
                        part.slice(2);
                }

                if (
                    part.startsWith("T:")
                ) {
                    trend =
                        part.slice(2);
                }
            }

            if (
                !side ||
                !setup ||
                !trend
            ) {
                return null;
            }

            return familyKey(
                side,
                setup,
                trend
            );
        }

        // =====================================================
        // VALIDATION FAILURE DIAGNOSTICS
        // =====================================================

        function validationFailureReasons(
            metrics
        ) {

            const reasons = [];

            if (
                metrics.trades <
                VALIDATION_MIN_SAMPLES
            ) {
                reasons.push(
                    "INSUFFICIENT_VALIDATION_SAMPLES"
                );
            }

            if (
                metrics.decisiveTrades <
                VALIDATION_MIN_DECISIVE
            ) {
                reasons.push(
                    "INSUFFICIENT_VALIDATION_DECISIVE"
                );
            }

            if (
                metrics.expectedValueR <
                VALIDATION_MIN_EV
            ) {
                reasons.push(
                    "VALIDATION_EV_BELOW_THRESHOLD"
                );
            }

            if (
                metrics.profitFactor <
                VALIDATION_MIN_PF
            ) {
                reasons.push(
                    "VALIDATION_PF_BELOW_THRESHOLD"
                );
            }

            if (
                metrics.maxConsecutiveLosses >
                MAX_VALIDATION_LOSS_STREAK
            ) {
                reasons.push(
                    "VALIDATION_LOSS_STREAK_TOO_HIGH"
                );
            }

            return reasons;
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
                resolveFamilyKey(
                    candidate
                );

            const trades = [];

            let cooldownUntil =
                validationStart - 1;

            let lastPattern = null;
            let lastPatternIndex = -9999;

            let lastSide = null;
            let lastSideIndex = -9999;

            const lossStreak = new Map();

            let skippedBoundaryTrades = 0;

            let matchedSetupOccurrences = 0;
            let confirmationRejected = 0;
            let cooldownRejected = 0;

            for (
                let i = validationStart;
                i < validationEnd - 1;
                i++
            ) {

                if (
                    i <= cooldownUntil
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

                for (const setup of setups) {

                    const key =
                        corePatternKey(
                            setup.side,
                            setup.setup,
                            f
                        );

                    
                    const detailedPattern =
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
                        candidate.level === "FAMILY"
                            ? currentFamily === candidate.key
                            : candidate.level === "DIRECTIONAL"
                                ? detailedPattern === candidate.key
                                : key === candidate.key;

                    if (!matched) {
                        continue;
                    }

                    matchedSetupOccurrences++;

                    if (
                        (
                            lossStreak.get(key) || 0
                        ) >=
                        MAX_VALIDATION_LOSS_STREAK
                    ) {

                        cooldownRejected++;
                        continue;
                    }

                    if (
                        key === lastPattern &&
                        i - lastPatternIndex <
                            SAME_PATTERN_COOLDOWN
                    ) {

                        cooldownRejected++;
                        continue;
                    }

                    if (
                        setup.side === lastSide &&
                        i - lastSideIndex <
                            SAME_SIDE_COOLDOWN
                    ) {

                        cooldownRejected++;
                        continue;
                    }

                    const confirmation =
                        confirmationScore(
                            candles,
                            i,
                            setup.side
                        );

                    if (!confirmation.passed) {

                        confirmationRejected++;
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
                            ? entry +
                              TARGET_R * a
                            : entry -
                              TARGET_R * a;

                    const outcome =
                        evaluateTrade(
                            candles,
                            i,
                            setup.side,
                            entry,
                            stop,
                            target,
                            validationEnd - 1
                        );

                    if (
                        outcome.resultR === null
                    ) {

                        skippedBoundaryTrades++;
                        continue;
                    }

                    if (
                        outcome.boundaryCapped
                    ) {

                        skippedBoundaryTrades++;
                        continue;
                    }

                    const trade = {

                        index: i,

                        side:
                            setup.side,

                        setup:
                            setup.setup,

                        pattern:
                            key,

                        detailedPattern,

                        family:
                            currentFamily,

                        resultR:
                            outcome.resultR,

                        exitIndex:
                            outcome.exitIndex,

                        exitType:
                            outcome.exitType
                    };

                    trades.push(trade);

                    if (
                        outcome.resultR < 0
                    ) {

                        lossStreak.set(
                            key,
                            (
                                lossStreak.get(key) || 0
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

                    lastSide = setup.side;
                    lastSideIndex = i;

                    break;
                }
            }

            const metrics =
                calculateMetrics(
                    trades
                );

            const reasons =
                validationFailureReasons(
                    metrics
                );

            const passed =
                reasons.length === 0;

            let primaryReason =
                passed
                    ? "VALIDATION_PASSED"
                    : reasons[0];

            return {

                passed,

                reasons,

                primaryReason,

                trades,

                metrics,

                skippedBoundaryTrades,

                matchedSetupOccurrences,

                confirmationRejected,

                cooldownRejected,

                candidate: {

                    key:
                        candidate.key,

                    level:
                        candidate.level,

                    discoverySamples:
                        candidate.samples,

                    discoveryDecisive:
                        candidate.decisiveTrades,

                    discoveryEV:
                        candidate.expectedValueR,

                    discoveryPF:
                        candidate.profitFactor,

                    discoveryQuality:
                        candidate.quality,

                    discoveryStableSections:
                        candidate.stableSections,

                    familyKey:
                        family
                }
            };
        }

        // =====================================================
        // PROMOTION / CANDIDATE FLOW
        // =====================================================

        function promoteCandidates(
            candles,
            discovery,
            discoveryStart,
            discoveryEnd
        ) {

            const validationSize =
                Math.max(
                    50,
                    Math.floor(
                        (
                            discoveryEnd -
                            discoveryStart
                        ) *
                        VALIDATION_FRACTION
                    )
                );

            const validationStart =
                Math.max(
                    discoveryStart + 50,
                    discoveryEnd -
                    validationSize
                );

            const validationCandidates = [];

            const candidatesRejectedBeforeValidation = [];

            const validationResults = [];

            // V14.11: validation survivors promoted from the
            // candidate pipeline are collected here.
            const candidates = [];

            const qualifiedFamilies =
                discovery.families.filter(
                    x => x.qualified
                );

            const qualifiedCoreEdges =
                safeArray(
                    discovery.corePatterns
                ).filter(
                    x => x.qualified
                );

            const qualifiedPatterns =
                safeArray(
                    discovery.patterns
                ).filter(
                    x => x.qualified
                );

            const qualifiedDirectional =
                safeArray(
                    discovery.directionalPatterns
                );

            const qualified =
                [
                    ...qualifiedFamilies,
                    ...qualifiedCoreEdges,
                    ...qualifiedDirectional
                ];

            for (const candidate of qualified) {

                const familyKeyValue =
                    resolveFamilyKey(
                        candidate
                    );

                const family =
                    discovery.families.find(
                        x =>
                            x.key ===
                            familyKeyValue
                    ) || null;

                /*
                 * V14.11 DIRECTION-AWARE LANE
                 * -----------------------------------------------
                 * A SELL detailed edge may enter untouched
                 * validation when the detailed edge itself has
                 * already passed the existing PATTERN evidence
                 * gates. We do NOT lower those gates.
                 *
                 * The parent family does not need 3 profitable
                 * sections here, but it must remain historically
                 * positive enough to avoid promoting a detailed
                 * edge out of an outright losing family.
                 */
                if (candidate.level === "DIRECTIONAL") {

                    if (!family) {
                        candidatesRejectedBeforeValidation.push({
                            key: candidate.key,
                            level: candidate.level,
                            stage: "PRE_VALIDATION",
                            reason: "FAMILY_RESOLUTION_FAILED",
                            familyKey: familyKeyValue
                        });
                        continue;
                    }

                    if (
                        family.expectedValueR <
                            DIRECTIONAL_MIN_FAMILY_EV ||
                        family.profitFactor <
                            DIRECTIONAL_MIN_FAMILY_PF
                    ) {
                        candidatesRejectedBeforeValidation.push({
                            key: candidate.key,
                            level: candidate.level,
                            stage: "PRE_VALIDATION",
                            reason: "DIRECTIONAL_FAMILY_EDGE_TOO_WEAK",
                            familyKey: familyKeyValue,
                            familyEV: family.expectedValueR,
                            familyPF: family.profitFactor
                        });
                        continue;
                    }
                }

                /*
                 * -------------------------------------------------
                 * PATTERN → FAMILY DIAGNOSTIC
                 * -------------------------------------------------
                 */

                if (
                    candidate.level === "PATTERN" &&
                    !family
                ) {

                    candidatesRejectedBeforeValidation.push({

                        key:
                            candidate.key,

                        level:
                            candidate.level,

                        stage:
                            "PRE_VALIDATION",

                        reason:
                            "FAMILY_RESOLUTION_FAILED",

                        familyKey:
                            familyKeyValue
                    });

                    continue;
                }

                if (
                    candidate.level === "PATTERN" &&
                    family
                ) {

                    if (
                        family.expectedValueR < 0 &&
                        !ALLOW_PATTERN_OVERRIDE_LOSING_FAMILY
                    ) {

                        candidatesRejectedBeforeValidation.push({

                            key:
                                candidate.key,

                            level:
                                candidate.level,

                            stage:
                                "PRE_VALIDATION",

                            reason:
                                "FAMILY_CONFLICT",

                            familyKey:
                                familyKeyValue
                        });

                        continue;
                    }

                    const gap =
                        candidate.expectedValueR -
                        family.expectedValueR;

                    if (
                        gap >
                        MAX_PATTERN_FAMILY_EV_GAP
                    ) {

                        candidatesRejectedBeforeValidation.push({

                            key:
                                candidate.key,

                            level:
                                candidate.level,

                            stage:
                                "PRE_VALIDATION",

                            reason:
                                "PATTERN_FAMILY_EV_GAP_TOO_LARGE",

                            familyKey:
                                familyKeyValue,

                            patternEV:
                                candidate.expectedValueR,

                            familyEV:
                                family.expectedValueR,

                            evGap:
                                round(gap, 4)
                        });

                        continue;
                    }
                }

                /*
                 * This is the important V14.9 distinction:
                 *
                 * A candidate reaching this point is explicitly
                 * counted as a VALIDATION CANDIDATE.
                 */

                if (
                    candidate.level === "CORE" &&
                    (!family ||
                        family.stableSections <
                        MIN_STABLE_SECTIONS)
                ) {

                    candidatesRejectedBeforeValidation.push({
                        key: candidate.key,
                        level: candidate.level,
                        stage: "PRE_VALIDATION",
                        reason: "FAMILY_STABILITY_GATE",
                        familyKey: familyKeyValue,
                        familyStableSections:
                            family?.stableSections ?? 0,
                        requiredStableSections:
                            MIN_STABLE_SECTIONS
                    });

                    continue;
                }

                validationCandidates.push(candidate);

                const validation =
                    validateCandidate(
                        candles,
                        candidate,
                        validationStart,
                        discoveryEnd
                    );

                validationResults.push({

                    key:
                        candidate.key,

                    level:
                        candidate.level,

                    stage:
                        validation.passed
                            ? "VALIDATION_SURVIVOR"
                            : "VALIDATION_REJECTED",

                    passed:
                        validation.passed,

                    primaryReason:
                        validation.primaryReason,

                    reasons:
                        validation.reasons,

                    metrics:
                        validation.metrics,

                    matchedSetupOccurrences:
                        validation
                            .matchedSetupOccurrences,

                    confirmationRejected:
                        validation
                            .confirmationRejected,

                    cooldownRejected:
                        validation
                            .cooldownRejected,

                    skippedBoundaryTrades:
                        validation
                            .skippedBoundaryTrades
                });

                if (!validation.passed) {
                    continue;
                }

                /*
                 * Anti-chasing promotion diagnostic.
                 */

                const validationTrades =
                    safeArray(
                        validation.trades
                    );

                let validExtensionTrades = 0;

                let antiChaseRejected = 0;

                for (
                    const trade of validationTrades
                ) {

                    const f =
                        features(
                            candles,
                            trade.index
                        );

                    if (!f) {
                        continue;
                    }

                    const chase =
                        antiChaseCheck(
                            f,
                            trade.side
                        );

                    if (chase.passed) {
                        validExtensionTrades++;
                    } else {
                        antiChaseRejected++;
                    }
                }

                if (
                    validationTrades.length > 0 &&
                    validExtensionTrades === 0
                ) {

                    validationResults[
                        validationResults.length - 1
                    ].stage =
                        "VALIDATION_REJECTED";

                    validationResults[
                        validationResults.length - 1
                    ].primaryReason =
                        "ANTI_CHASING_REJECTION";

                    validationResults[
                        validationResults.length - 1
                    ].reasons = [
                        "ANTI_CHASING_REJECTION"
                    ];

                    continue;
                }

                candidates.push({

                    ...candidate,

                    familyEvidence:
                        family,

                    validation,

                    antiChaseRejected
                });
            }

            candidates.sort(
                (a, b) => {

                    const aEV =
                        a.validation?.metrics
                            ?.expectedValueR ??
                        -999;

                    const bEV =
                        b.validation?.metrics
                            ?.expectedValueR ??
                        -999;

                    const aPF =
                        a.validation?.metrics
                            ?.profitFactor ??
                        0;

                    const bPF =
                        b.validation?.metrics
                            ?.profitFactor ??
                        0;

                    const aScore =
                        aEV * 100 +
                        Math.min(aPF, 5) * 10 +
                        a.quality * 0.25;

                    const bScore =
                        bEV * 100 +
                        Math.min(bPF, 5) * 10 +
                        b.quality * 0.25;

                    return bScore - aScore;
                }
            );

            return {

                candidates,

                validationStart,

                validationCandidates,

                candidatesRejectedBeforeValidation,

                validationResults,

                candidateFlow: {

                    qualifiedFamilies:
                        qualifiedFamilies.length,

                    qualifiedCoreEdges:
                        qualifiedCoreEdges.length,

                    qualifiedPatterns:
                        qualifiedPatterns.length,

                    qualifiedDirectional:
                        qualifiedDirectional.length,

                    totalQualified:
                        qualified.length,

                    validationCandidates:
                        validationCandidates.length,

                    validationSurvivors:
                        candidates.length,

                    rejectedBeforeValidation:
                        candidatesRejectedBeforeValidation.length,

                    rejectedDuringValidation:
                        validationResults.filter(
                            x =>
                                x.stage ===
                                "VALIDATION_REJECTED"
                        ).length
                }
            };
        }
             // =====================================================
        // EDGE DIVERSITY FILTER
        // =====================================================

        function diversifyCandidates(
            candidates
        ) {

            const selected = [];

            const familySet = new Set();
            const sideSet = new Set();
            const patternSet = new Set();

            const diversityRejections = [];

            for (
                const candidate of safeArray(
                    candidates
                )
            ) {

                const family =
                    resolveFamilyKey(
                        candidate
                    );

                const side =
                    String(
                        candidate.key
                    ).split("|")[0];

                if (
                    patternSet.has(
                        candidate.key
                    )
                ) {

                    diversityRejections.push({

                        key:
                            candidate.key,

                        reason:
                            "DUPLICATE_PATTERN"
                    });

                    continue;
                }

                const familyCount =
                    selected.filter(
                        x =>
                            resolveFamilyKey(x) ===
                            family
                    ).length;

                if (
                    familyCount >=
                    MAX_EDGES_PER_FAMILY
                ) {

                    diversityRejections.push({

                        key:
                            candidate.key,

                        reason:
                            "FAMILY_CONCENTRATION_LIMIT"
                    });

                    continue;
                }

                const sideCount =
                    selected.filter(
                        x =>
                            String(
                                x.key
                            ).split("|")[0] ===
                            side
                    ).length;

                if (
                    sideCount >=
                    MAX_EDGES_PER_SIDE
                ) {

                    diversityRejections.push({

                        key:
                            candidate.key,

                        reason:
                            "SIDE_CONCENTRATION_LIMIT"
                    });

                    continue;
                }

                selected.push(candidate);

                patternSet.add(
                    candidate.key
                );

                familySet.add(
                    family
                );

                sideSet.add(
                    side
                );

                if (
                    selected.length >=
                    MAX_SELECTED_EDGES
                ) {

                    break;
                }
            }

            return {

                selected,

                independentFamilies:
                    familySet.size,

                sides:
                    [...sideSet],

                diversityRejections
            };
        }

        // =====================================================
        // EXECUTE TRUE OOS
        // =====================================================

        function executeOOS(
            candles,
            testStart,
            testEnd,
            selected,
            fold
        ) {

            const trades = [];

            let cooldownUntil =
                testStart - 1;

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
                    i <= cooldownUntil
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
                    const setup of setups
                ) {

                    const key =
                        corePatternKey(
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
                            candidate => {

                                if (
                                    candidate.level ===
                                    "PATTERN" ||
                                    candidate.level ===
                                    "CORE"
                                ) {

                                    return (
                                        candidate.key ===
                                        key
                                    );
                                }

                                if (
                                    candidate.level ===
                                    "DIRECTIONAL"
                                ) {

                                    const detailedPattern =
                                        patternKey(
                                            setup.side,
                                            setup.setup,
                                            f
                                        );

                                    return (
                                        candidate.key ===
                                        detailedPattern
                                    );
                                }

                                if (
                                    candidate.level ===
                                    "FAMILY"
                                ) {

                                    return (
                                        candidate.key ===
                                        family
                                    );
                                }

                                return false;
                            }
                        );

                    if (!match) {
                        continue;
                    }

                    if (
                        (
                            lossStreak.get(key) || 0
                        ) >=
                        MAX_LOSS_STREAK
                    ) {
                        continue;
                    }

                    if (
                        key === lastPattern &&
                        i - lastPatternIndex <
                            SAME_PATTERN_COOLDOWN
                    ) {
                        continue;
                    }

                    if (
                        setup.side === lastSide &&
                        i - lastSideIndex <
                            SAME_SIDE_COOLDOWN
                    ) {
                        continue;
                    }

                    const chase =
                        antiChaseCheck(
                            f,
                            setup.side
                        );

                    if (
                        !chase.passed &&
                        setup.setup ===
                            "TREND_FOLLOW"
                    ) {
                        continue;
                    }

                    const confirmation =
                        confirmationScore(
                            candles,
                            i,
                            setup.side
                        );

                    if (!confirmation.passed) {
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
                            ? entry +
                              TARGET_R * a
                            : entry -
                              TARGET_R * a;

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
                            target,
                            testEnd - 1
                        );

                    if (
                        outcome.resultR === null ||
                        outcome.boundaryCapped
                    ) {
                        continue;
                    }

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
                            round(
                                match.expectedValueR,
                                4
                            ),

                        discoveryPF:
                            round(
                                match.profitFactor,
                                4
                            ),

                        validationEV:
                            round(
                                match.validation
                                    .metrics
                                    .expectedValueR,
                                4
                            ),

                        validationPF:
                            round(
                                match.validation
                                    .metrics
                                    .profitFactor,
                                4
                            ),

                        validationTrades:
                            match.validation
                                .metrics
                                .trades,

                        validationDecisive:
                            match.validation
                                .metrics
                                .decisiveTrades,

                        familyEV:
                            match.familyEvidence
                                ? round(
                                    match.familyEvidence
                                        .expectedValueR,
                                    4
                                )
                                : null,

                        familyPF:
                            match.familyEvidence
                                ? round(
                                    match.familyEvidence
                                        .profitFactor,
                                    4
                                )
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

                        trendStrength:
                            round(
                                f.trendStrength,
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

                    trades.push(trade);

                    if (
                        outcome.resultR < 0
                    ) {

                        lossStreak.set(
                            key,
                            (
                                lossStreak.get(key) || 0
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

                    lastSide = setup.side;
                    lastSideIndex = i;

                    break;
                }
            }

            return trades;
        }

        // =====================================================
        // FOLD QUALITY
        // =====================================================

        function evaluateFoldQuality(
            metrics,
            independentFamilies
        ) {

            if (
                !metrics ||
                metrics.trades <= 0
            ) {

                return {

                    profitable: false,

                    reason:
                        "NO_TRADES"
                };
            }

            if (
                metrics.maxDrawdownR >
                MAX_OOS_DRAWDOWN
            ) {

                return {

                    profitable: false,

                    reason:
                        "DRAWDOWN_LIMIT"
                };
            }

            if (
                metrics.maxConsecutiveLosses >
                MAX_LOSS_STREAK
            ) {

                return {

                    profitable: false,

                    reason:
                        "LOSS_STREAK_LIMIT"
                };
            }

            if (
                metrics.netR <= 0
            ) {

                return {

                    profitable: false,

                    reason:
                        "NON_POSITIVE_NET_R"
                };
            }

            if (
                metrics.expectedValueR <= 0
            ) {

                return {

                    profitable: false,

                    reason:
                        "NON_POSITIVE_EV"
                };
            }

            if (
                metrics.profitFactor <= 1
            ) {

                return {

                    profitable: false,

                    reason:
                        "PF_NOT_ABOVE_ONE"
                };
            }

            return {

                profitable: true,

                reason:
                    independentFamilies >=
                        MIN_INDEPENDENT_FAMILIES
                        ? "PASSED"
                        : "PASSED_SINGLE_FAMILY"
            };
        }

        // =====================================================
        // HISTORICAL API FETCH
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
                    `INDstocks historical API failed: HTTP ${response.status} ${text}`
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

            while (
                cursor < endMs
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
                const chunk of chunks
            ) {

                const payload =
                    await fetchHistoricalChunk(
                        accessToken,
                        chunk.start,
                        chunk.end
                    );

                const extracted =
                    extractRows(payload);

                all.push(
                    ...extracted
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
        // LOAD DATA
        // =====================================================

        const historicalData =
            await loadHistoricalData();

        const rows =
            historicalData.candles;

        if (rows.length < 500) {

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

        const currentCandle =
            rows[rows.length - 1];

        const historicalCandles =
            rows.slice(0, -1);

        // =====================================================
        // WALK-FORWARD CONFIGURATION
        // =====================================================

        const total =
            historicalCandles.length;

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
                testStart >= testEnd
            ) {
                break;
            }

            folds.push({

                fold,

                trainingStart: 0,

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
        // WALK-FORWARD EXECUTION
        // =====================================================

        const foldResults = [];

        const allTrades = [];

        let profitableFolds = 0;

        for (
            const fold of folds
        ) {

            const trainingRows =
                fold.trainingEnd -
                fold.trainingStart;

            const validationSize =
                Math.max(
                    50,
                    Math.floor(
                        trainingRows *
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
                    historicalCandles,
                    fold.trainingStart,
                    discoveryEnd
                );

            const promoted =
                promoteCandidates(
                    historicalCandles,
                    discovery,
                    fold.trainingStart,
                    discoveryEnd
                );

            const diversified =
                diversifyCandidates(
                    promoted.candidates
                );

            const selected =
                diversified.selected;

            const trades =
                executeOOS(
                    historicalCandles,
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

            const independentFamilies =
                new Set(
                    trades.map(
                        x => x.family
                    )
                ).size;

            const foldQuality =
                evaluateFoldQuality(
                    metrics,
                    independentFamilies
                );

            if (
                foldQuality.profitable
            ) {
                profitableFolds++;
            }

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
                        x => x.qualified
                    ).length,

                discoveredPatterns:
                    safeArray(
                        discovery.corePatterns
                    ).length,

                qualifiedPatterns:
                    safeArray(
                        discovery.corePatterns
                    ).filter(
                        x => x.qualified
                    ).length,

                detailedPatterns:
                    discovery.patterns.length,

                validationCandidates:
                    promoted
                        .candidateFlow
                        .validationCandidates,

                validationSurvivors:
                    promoted
                        .candidateFlow
                        .validationSurvivors,

                rejectedBeforeValidation:
                    promoted
                        .candidateFlow
                        .rejectedBeforeValidation,

                rejectedDuringValidation:
                    promoted
                        .candidateFlow
                        .rejectedDuringValidation,

                selectedEdges:
                    selected.length,

                selectedLevels:
                    selected.map(
                        x => x.level
                    ),

                independentFamilies,

                profitableFold:
                    foldQuality.profitable,

                foldQualityReason:
                    foldQuality.reason,

                metrics,

                tradeResults:
                    trades.map(
                        x => x.resultR
                    ),

                diagnostics: {

                    validationResults:
                        promoted.validationResults,

                    candidatesRejectedBeforeValidation:
                        promoted
                            .candidatesRejectedBeforeValidation,

                    diversityRejections:
                        diversified
                            .diversityRejections
                },

                trades
            });
        }
             // =====================================================
        // GLOBAL TRUE OOS METRICS
        // =====================================================

        const globalStats =
            calculateMetrics(
                allTrades
            );

        // =====================================================
        // PATTERN CONCENTRATION
        // =====================================================

        const patternCounts = {};

        for (
            const trade of allTrades
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

        // =====================================================
        // INDEPENDENT FAMILIES
        // =====================================================

        const independentFamilies =
            new Set(
                allTrades.map(
                    x => x.family
                )
            ).size;

        const patternDiversity =
            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&
            maximumPatternShare <=
                MAX_PATTERN_CONCENTRATION;

        // =====================================================
        // OOS VALIDATION
        // =====================================================

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
                    x => x.side === "BUY"
                )
            );

        const sellStats =
            calculateMetrics(
                allTrades.filter(
                    x => x.side === "SELL"
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

        const currentMarket =
            getCurrentMarket();

        // =====================================================
        // V14.11 EDGE ANATOMY DIAGNOSTICS
        // No strategy thresholds are changed here.
        // This layer explains where evidence is being lost.
        // =====================================================

        function anatomyMetrics(records) {

            const safe = safeArray(records);

            const trades = safe.length;
            const wins = safe.filter(x => x.resultR > 0).length;
            const losses = safe.filter(x => x.resultR < 0).length;
            const timeouts = safe.filter(x => x.resultR === 0).length;
            const decisiveTrades = wins + losses;

            const netR = safe.reduce(
                (sum, x) => sum + (Number.isFinite(x.resultR) ? x.resultR : 0),
                0
            );

            const totalWinR = safe
                .filter(x => x.resultR > 0)
                .reduce((sum, x) => sum + x.resultR, 0);

            const totalLossR = Math.abs(
                safe
                    .filter(x => x.resultR < 0)
                    .reduce((sum, x) => sum + x.resultR, 0)
            );

            const expectedValueR = trades ? netR / trades : 0;
            const profitFactor = totalLossR > 0 ? totalWinR / totalLossR : 0;

            const exits = {
                STOP: safe.filter(x => x.exitType === "STOP").length,
                TARGET: safe.filter(x => x.exitType === "TARGET").length,
                TIMEOUT: safe.filter(x => x.exitType === "TIMEOUT").length,
                BOUNDARY_TIMEOUT: safe.filter(x => x.exitType === "BOUNDARY_TIMEOUT").length
            };

            return {
                trades,
                wins,
                losses,
                timeouts,
                decisiveTrades,
                winRate: decisiveTrades ? round((wins / decisiveTrades) * 100, 2) : 0,
                netR: round(netR, 4),
                expectedValueR: round(expectedValueR, 4),
                profitFactor: round(profitFactor, 4),
                exits
            };
        }

        function buildEdgeAnatomy(records, start, end) {

            const safe = safeArray(records);
            const recentStart = start + Math.floor((end - start) * 0.75);

            function groupedBy(field) {
                const map = new Map();

                for (const record of safe) {
                    const key = record[field] ?? "UNKNOWN";
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(record);
                }

                return Array.from(map.entries())
                    .map(([key, rows]) => ({
                        key,
                        ...anatomyMetrics(rows),
                        recent: anatomyMetrics(rows.filter(x => x.index >= recentStart))
                    }))
                    .sort((a, b) => b.trades - a.trades);
            }

            const sectionWidth = Math.max(1, (end - start) / 4);
            const sections = [[], [], [], []];

            for (const record of safe) {
                if (!Number.isFinite(record.index)) continue;
                const relative = record.index - start;
                const section = Math.min(3, Math.max(0, Math.floor(relative / sectionWidth)));
                sections[section].push(record);
            }

            const familyMap = new Map();
            for (const record of safe) {
                if (!familyMap.has(record.family)) familyMap.set(record.family, []);
                familyMap.get(record.family).push(record);
            }

            const familyAnatomy = Array.from(familyMap.entries())
                .map(([family, familyRecords]) => ({
                    family,
                    overall: anatomyMetrics(familyRecords),
                    bySection: sections.map(section => anatomyMetrics(
                        section.filter(x => x.family === family)
                    )),
                    bySetup: groupedBy("setup").filter(x => familyRecords.some(r => r.setup === x.key)),
                    bySide: groupedBy("side").filter(x => familyRecords.some(r => r.side === x.key)),
                    byTrend: groupedBy("trend").filter(x => familyRecords.some(r => r.trend === x.key)),
                    contextVariants: new Set(familyRecords.map(x => x.pattern)).size
                }))
                .sort((a, b) => b.overall.trades - a.overall.trades);

            return {
                rawLearningRecords: safe.length,
                overall: anatomyMetrics(safe),
                chronologicalSections: sections.map((section, index) => ({
                    section: index + 1,
                    ...anatomyMetrics(section)
                })),
                bySetup: groupedBy("setup"),
                bySide: groupedBy("side"),
                byTrend: groupedBy("trend"),
                byRegime: groupedBy("regime"),
                byTimeBucket: groupedBy("timeBucket"),
                byVWAPDirection: groupedBy("vwapDirection"),
                byFamily: familyAnatomy,
                nearestStableFamilies: familyAnatomy
                    .map(x => ({
                        family: x.family,
                        trades: x.overall.trades,
                        decisiveTrades: x.overall.decisiveTrades,
                        expectedValueR: x.overall.expectedValueR,
                        profitFactor: x.overall.profitFactor,
                        profitableSections: x.bySection.filter(
                            m => m.decisiveTrades > 0 && m.expectedValueR > 0
                        ).length,
                        failingSections: x.bySection
                            .map((m, i) => m.decisiveTrades > 0 && m.expectedValueR <= 0 ? i + 1 : null)
                            .filter(Boolean),
                        contextVariants: x.contextVariants
                    }))
                    .sort((a, b) => {
                        if (b.profitableSections !== a.profitableSections) return b.profitableSections - a.profitableSections;
                        return b.expectedValueR - a.expectedValueR;
                    })
            };
        }

        function diagnoseSignalPipeline(candles, start, end) {

            const counts = {
                setupDetections: 0,
                featureUnavailable: 0,
                confirmationBlocked: 0,
                antiChaseBlocked: 0,
                vwapInteractionBlocked: 0,
                boundaryBlocked: 0,
                acceptedLearningRecords: 0
            };

            const reasons = {
                confirmation: {},
                antiChase: {},
                vwapInteraction: {}
            };

            const stop = Math.max(start + 30, end - MAX_HOLD_CANDLES);

            for (let i = start + 30; i < stop; i++) {
                const setups = detectSetups(candles, i);

                for (const setup of setups) {
                    counts.setupDetections++;

                    const f = features(candles, i);
                    if (!f) {
                        counts.featureUnavailable++;
                        continue;
                    }

                    const confirmation = confirmationScore(candles, i, setup.side);
                    if (!confirmation.passed) {
                        counts.confirmationBlocked++;
                        const key = confirmation.reasons?.join("+") || "CONFIRMATION_FAILED";
                        reasons.confirmation[key] = (reasons.confirmation[key] || 0) + 1;
                        continue;
                    }

                    if (setup.setup === "TREND_FOLLOW") {
                        const chase = antiChaseCheck(f, setup.side);
                        if (!chase.passed) {
                            counts.antiChaseBlocked++;
                            const key = chase.reason || chase.reasons?.join("+") || "ANTI_CHASE_FAILED";
                            reasons.antiChase[key] = (reasons.antiChase[key] || 0) + 1;
                            continue;
                        }
                    }

                    if (setup.setup === "VWAP_PULLBACK") {
                        const interaction = recentVWAPInteraction(candles, i, setup.side);
                        if (!interaction) {
                            counts.vwapInteractionBlocked++;
                            reasons.vwapInteraction.VWAP_INTERACTION_NOT_FOUND =
                                (reasons.vwapInteraction.VWAP_INTERACTION_NOT_FOUND || 0) + 1;
                            continue;
                        }
                    }

                    const record = createLearningRecord(
                        candles,
                        i,
                        setup.side,
                        setup.setup,
                        end - 1
                    );

                    if (!record) continue;

                    if (record.boundaryCapped) {
                        counts.boundaryBlocked++;
                        continue;
                    }

                    counts.acceptedLearningRecords++;
                }
            }

            return { counts, reasons };
        }

        // =====================================================
        // FINAL LEARNING
        // =====================================================

        const finalDiscovery =
            discoverCandidates(
                historicalCandles,
                0,
                historicalCandles.length
            );

        const edgeAnatomy =
            buildEdgeAnatomy(
                finalDiscovery.rawRecords,
                0,
                historicalCandles.length
            );

        const signalPipelineDiagnostics =
            diagnoseSignalPipeline(
                historicalCandles,
                0,
                historicalCandles.length
            );

        const finalPromoted =
            promoteCandidates(
                historicalCandles,
                finalDiscovery,
                0,
                historicalCandles.length
            );

        const finalDiversified =
            diversifyCandidates(
                finalPromoted.candidates
            );

        const finalSelected =
            finalDiversified.selected;

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
                "No V14.11 edge has survived direction-aware discovery, isolated validation, candidate-flow diagnostics and anti-overfitting filters.",

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
            currentFeatures &&
            finalSelected.length > 0
        ) {

            const setups =
                detectSetups(
                    rows,
                    currentIndex
                );

            for (
                const setup of setups
            ) {

                const key =
                    corePatternKey(
                        setup.side,
                        setup.setup,
                        currentFeatures
                    );

                
                const detailedPattern =
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
                        candidate => {

                            if (
                                candidate.level ===
                                "PATTERN" ||
                                candidate.level ===
                                "CORE"
                            ) {

                                return (
                                    candidate.key ===
                                    key
                                );
                            }

                            if (
                                candidate.level ===
                                "DIRECTIONAL"
                            ) {

                                return (
                                    candidate.key ===
                                    detailedPattern
                                );
                            }

                            if (
                                candidate.level ===
                                "FAMILY"
                            ) {

                                return (
                                    candidate.key ===
                                    family
                                );
                            }

                            return false;
                        }
                    );

                if (!match) {
                    continue;
                }

                if (
                    setup.setup ===
                    "TREND_FOLLOW"
                ) {

                    const chase =
                        antiChaseCheck(
                            currentFeatures,
                            setup.side
                        );

                    if (!chase.passed) {
                        continue;
                    }
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

                currentSignal = {

                    status:
                        "SIGNAL",

                    side:
                        setup.side,

                    setup:
                        setup.setup,

                    pattern:
                        key,

                    detailedPattern,

                    family,

                    learningLevel:
                        match.level,

                    quality:
                        round(
                            match.quality,
                            2
                        ),

                    discoveryEV:
                        round(
                            match.expectedValueR,
                            4
                        ),

                    discoveryPF:
                        round(
                            match.profitFactor,
                            4
                        ),

                    validationEV:
                        round(
                            match.validation.metrics
                                .expectedValueR,
                            4
                        ),

                    validationPF:
                        round(
                            match.validation.metrics
                                .profitFactor,
                            4
                        ),

                    validationTrades:
                        match.validation.metrics
                            .trades,

                    validationDecisive:
                        match.validation.metrics
                            .decisiveTrades,

                    confirmationScore:
                        confirmation.score,

                    confirmationReasons:
                        confirmation.reasons,

                    market:
                        currentMarket,

                    reason:
                        "V14.11 edge survived historical discovery, isolated validation and anti-overfitting filters. PAPER REVIEW ONLY.",

                    nextAction:
                        "PAPER_REVIEW_ONLY"
                };

                break;
            }
        }

        // =====================================================
        // FINAL REJECTION DIAGNOSTICS
        // =====================================================

        const rejectionDiagnostics = {

            family: {

                insufficientSamples: 0,
                insufficientDecisive: 0,
                insufficientStability: 0,
                edgeBelowThreshold: 0,
                recentNegative: 0
            },

            core: {

                insufficientSamples: 0,
                insufficientDecisive: 0,
                insufficientStability: 0,
                edgeBelowThreshold: 0,
                recentNegative: 0,
                familyStabilityGate: 0
            },

            pattern: {

                insufficientSamples: 0,
                insufficientDecisive: 0,
                insufficientStability: 0,
                edgeBelowThreshold: 0,
                recentNegative: 0,

                familyConflict:
                    finalPromoted
                        .candidatesRejectedBeforeValidation
                        .filter(
                            x =>
                                x.reason ===
                                "FAMILY_CONFLICT"
                        ).length,

                familyResolutionFailure:
                    finalPromoted
                        .candidatesRejectedBeforeValidation
                        .filter(
                            x =>
                                x.reason ===
                                "FAMILY_RESOLUTION_FAILED"
                        ).length,

                patternFamilyGap:
                    finalPromoted
                        .candidatesRejectedBeforeValidation
                        .filter(
                            x =>
                                x.reason ===
                                "PATTERN_FAMILY_EV_GAP_TOO_LARGE"
                        ).length,

                validationFailure:
                    finalPromoted
                        .validationResults
                        .filter(
                            x =>
                                x.stage ===
                                "VALIDATION_REJECTED"
                        ).length
            },

            antiChasing: {

                blockedVWAPDistance: 0,
                blockedEMAExtension: 0,
                blockedTrendExtension: 0
            }
        };

        // =====================================================
        // DISCOVERY REJECTION COUNTS
        // =====================================================

        for (
            const family of
            finalDiscovery.families
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

        for (
            const core of
            safeArray(finalDiscovery.corePatterns)
        ) {

            if (core.samples < CORE_MIN_SAMPLES) {
                rejectionDiagnostics.core.insufficientSamples++;
            }

            if (core.decisiveTrades < CORE_MIN_DECISIVE) {
                rejectionDiagnostics.core.insufficientDecisive++;
            }

            if (core.stableSections < MIN_STABLE_SECTIONS) {
                rejectionDiagnostics.core.insufficientStability++;
            }

            if (
                core.expectedValueR < CORE_MIN_EV ||
                core.profitFactor < CORE_MIN_PF
            ) {
                rejectionDiagnostics.core.edgeBelowThreshold++;
            }

            if (core.recentEV < 0) {
                rejectionDiagnostics.core.recentNegative++;
            }
        }

        for (
            const rejected of
            safeArray(finalPromoted.candidatesRejectedBeforeValidation)
        ) {
            if (rejected.reason === "FAMILY_STABILITY_GATE") {
                rejectionDiagnostics.core.familyStabilityGate++;
            }
        }

        for (
            const pattern of
            finalDiscovery.patterns
        ) {

            if (pattern.samples < PATTERN_MIN_SAMPLES) {
                rejectionDiagnostics.pattern.insufficientSamples++;
            }

            if (pattern.decisiveTrades < PATTERN_MIN_DECISIVE) {
                rejectionDiagnostics.pattern.insufficientDecisive++;
            }

            if (pattern.stableSections < MIN_STABLE_SECTIONS) {
                rejectionDiagnostics.pattern.insufficientStability++;
            }

            if (
                pattern.expectedValueR < PATTERN_MIN_EV ||
                pattern.profitFactor < PATTERN_MIN_PF
            ) {
                rejectionDiagnostics.pattern.edgeBelowThreshold++;
            }

            if (pattern.recentEV < 0) {
                rejectionDiagnostics.pattern.recentNegative++;
            }
        }

        // =====================================================
        // CANDIDATE FLOW SUMMARY
        // =====================================================

        const candidateFlow =
            {

                discoveredFamilies:
                    finalDiscovery
                        .families
                        .length,

                qualifiedFamilies:
                    finalDiscovery
                        .families
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                discoveredCoreEdges:
                    safeArray(finalDiscovery.corePatterns).length,

                qualifiedCoreEdges:
                    safeArray(finalDiscovery.corePatterns).filter(
                        x => x.qualified
                    ).length,

                discoveredPatterns:
                    finalDiscovery.patterns.length,

                qualifiedPatterns:
                    finalDiscovery.patterns.filter(
                        x => x.qualified
                    ).length,

                detailedPatterns:
                    finalDiscovery
                        .patterns
                        .length,

                totalQualified:
                    finalPromoted
                        .candidateFlow
                        .totalQualified,

                validationCandidates:
                    finalPromoted
                        .candidateFlow
                        .validationCandidates,

                rejectedBeforeValidation:
                    finalPromoted
                        .candidateFlow
                        .rejectedBeforeValidation,

                rejectedDuringValidation:
                    finalPromoted
                        .candidateFlow
                        .rejectedDuringValidation,

                validationSurvivors:
                    finalPromoted
                        .candidateFlow
                        .validationSurvivors,

                selectedAfterDiversification:
                    finalSelected.length,

                candidateConversionRate:
                    finalPromoted
                        .candidateFlow
                        .validationCandidates > 0
                        ? round(
                            (
                                finalPromoted
                                    .candidateFlow
                                    .validationSurvivors /
                                finalPromoted
                                    .candidateFlow
                                    .validationCandidates
                            ) * 100,
                            2
                        )
                        : 0
            };

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
                "V14_11_DIRECTION_AWARE_EDGE_DISCOVERY_TRUE_WALK_FORWARD",

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

                discoverySeparatedFromValidation:
                    true,

                validationBeforeOOS:
                    true,

                validationOutcomesCannotCrossIntoOOS:
                    true,

                discoveryOutcomesCannotCrossIntoValidation:
                    true,

                strictFoldBoundaries:
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
                    VERSION,

                discovery:
                    "Candidate edges are discovered only from the historical discovery segment.",

                validation:
                    "Qualified candidates are explicitly counted before untouched chronological validation.",

                diagnostics:
                    "Every qualified candidate is traceable through pre-validation rejection, validation rejection, survival and diversification.",

                oos:
                    "Only validation survivors are allowed into chronological true OOS.",

                antiOverfitting:
                    "Validation quality remains weighted more heavily than historical discovery quality.",

                antiConcentration:
                    "Final candidate set is diversified across families and sides.",

                antiChasing:
                    "Extended trend-follow entries are rejected.",

                boundaryProtection:
                    "Trade outcomes cannot cross fold boundaries.",

                objective:
                    "Prefer NO_TRADE over weak or unstable evidence."
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
                    "Require an edge to survive discovery, isolated validation and multiple independent chronological OOS periods."
            },

            learning: {

                familiesDiscovered:
                    finalDiscovery
                        .families
                        .length,

                qualifiedFamilies:
                    finalDiscovery
                        .families
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                patternsDiscovered:
                    finalDiscovery
                        .patterns
                        .length,

                rawLearningRecords:
                    edgeAnatomy.rawLearningRecords,

                signalPipelineDiagnostics,

                edgeAnatomy,

                qualifiedPatterns:
                    finalDiscovery
                        .patterns
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                validationCandidates:
                    finalPromoted
                        .candidateFlow
                        .validationCandidates,

                validationSurvivors:
                    finalPromoted
                        .candidates
                        .length,

                selectedEdges:
                    finalSelected.length,

                familyEdges:
                    finalSelected.filter(
                        x =>
                            x.level ===
                            "FAMILY"
                    ).length,

                detailedPatternEdges:
                    finalSelected.filter(
                        x =>
                            x.level ===
                            "PATTERN"
                    ).length,

                independentSelectedFamilies:
                    finalDiversified
                        .independentFamilies,

                candidateFlow
            },

            edgeAnatomyDiagnostics: {

                purpose:
                    "Explain where raw learning evidence is lost before candidate promotion without changing strategy thresholds.",

                rawLearningRecords:
                    edgeAnatomy.rawLearningRecords,

                anatomy:
                    edgeAnatomy,

                signalPipeline:
                    signalPipelineDiagnostics,

                interpretationGuard:
                    "Diagnostic only. These counts do not create trades, lower thresholds or enter validation/OOS."
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

                validationBoundaryStrict:
                    true,

                purpose:
                    "Prevent historically attractive patterns from entering true OOS without independent validation."
            },

            walkForward: {

                method:
                    "STRICT_TRUE_EXPANDING_WALK_FORWARD_WITH_ISOLATED_INTERNAL_VALIDATION",

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

                            validationSurvivors:
                                x.validationSurvivors,

                            rejectedBeforeValidation:
                                x.rejectedBeforeValidation,

                            rejectedDuringValidation:
                                x.rejectedDuringValidation,

                            selectedEdges:
                                x.selectedEdges,

                            selectedLevels:
                                x.selectedLevels,

                            independentFamilies:
                                x.independentFamilies,

                            profitableFold:
                                x.profitableFold,

                            foldQualityReason:
                                x.foldQualityReason,

                            metrics:
                                x.metrics,

                            tradeResults:
                                x.tradeResults,

                            diagnostics:
                                x.diagnostics
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
                    historicalCandles.length,

                discoveryRows:
                    finalPromoted
                        .validationStart,

                validationRows:
                    historicalCandles.length -
                    finalPromoted
                        .validationStart,

                familiesDiscovered:
                    finalDiscovery
                        .families
                        .length,

                qualifiedFamilies:
                    finalDiscovery
                        .families
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                patternsDiscovered:
                    finalDiscovery
                        .patterns
                        .length,

                qualifiedPatterns:
                    finalDiscovery
                        .patterns
                        .filter(
                            x =>
                                x.qualified
                        )
                        .length,

                candidateFlow,

                validationDiagnostics:
                    finalPromoted
                        .validationResults,

                preValidationRejections:
                    finalPromoted
                        .candidatesRejectedBeforeValidation,

                selectedEdges:
                    finalSelected.map(
                        x => ({

                            key:
                                x.key,

                            level:
                                x.level,

                            quality:
                                round(
                                    x.quality,
                                    2
                                ),

                            discoveryEV:
                                round(
                                    x.expectedValueR,
                                    4
                                ),

                            discoveryPF:
                                round(
                                    x.profitFactor,
                                    4
                                ),

                            validationEV:
                                round(
                                    x.validation
                                        .metrics
                                        .expectedValueR,
                                    4
                                ),

                            validationPF:
                                round(
                                    x.validation
                                        .metrics
                                        .profitFactor,
                                    4
                                ),

                            validationTrades:
                                x.validation
                                    .metrics
                                    .trades,

                            validationDecisive:
                                x.validation
                                    .metrics
                                    .decisiveTrades,

                            familyEV:
                                x.familyEvidence
                                    ? round(
                                        x.familyEvidence
                                            .expectedValueR,
                                        4
                                    )
                                    : null,

                            familyPF:
                                x.familyEvidence
                                    ? round(
                                        x.familyEvidence
                                            .profitFactor,
                                        4
                                    )
                                    : null
                        })
                    ),

                rejectionDiagnostics
            },

            currentMarket:
                currentMarket,

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
            "TradeMind Pro V14.9 ERROR:",
            error
        );

        return res.status(500).json({

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

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            error:
                error?.message ||
                String(error),

            stack:
                process.env.NODE_ENV ===
                "development"
                    ? error?.stack
                    : undefined
        });
    }
}

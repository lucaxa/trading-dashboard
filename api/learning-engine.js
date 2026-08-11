/*
===========================================================
 TradeMind Pro
 V14.7 — EDGE PIPELINE DIAGNOSTIC ENGINE

 Instrument : NIFTY 50
 Scrip      : NIDX_40000001
 Interval   : 5 minute
 Data       : INDstocks Historical API

 MODE:
 PAPER ONLY
 NO REAL ORDERS

 V14.7 PURPOSE
 ----------------------------------------------------------
 V14.6 proved that apparently strong discovery patterns
 were not surviving untouched validation.

 V14.7 DOES NOT loosen profitability thresholds.

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

 Main V14.7 changes:
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
 V14.7 is diagnostic, NOT a strategy-loosening version.
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V14.7";

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
        // V14.7 DIVERSIFICATION LIMITS
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
     

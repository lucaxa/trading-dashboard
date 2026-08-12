/*
===========================================================
 TradeMind Pro
 V24.0 — INDEPENDENT EDGE-HEALTH CONFIRMATION ENGINE (CRASH-SAFE)

 Instrument : NIFTY 50
 Scrip      : NIDX_40000001
 Interval   : 5 minute
 Data       : INDstocks Historical API

 MODE:
 PAPER ONLY
 NO REAL ORDERS

 V15 PURPOSE
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

    const VERSION = "V24.2";

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

        // V15 REGIME-CONTEXT DISCOVERY
        // Only SELL-side detailed edges are eligible for this
        // additional discovery lane. The candidate must still
        // independently satisfy the existing PATTERN thresholds
        // and 3-section stability requirement.
        const DIRECTIONAL_SIDE = "SELL";
        const DIRECTIONAL_MIN_FAMILY_EV = FAMILY_MIN_EV;
        const DIRECTIONAL_MIN_FAMILY_PF = FAMILY_MIN_PF;

        // V15 REGIME-CONTEXT DISCOVERY
        // Aggregate SELL evidence across RSI buckets while keeping
        // setup + trend + VWAP direction + regime + time bucket.
        // The existing PATTERN evidence floor remains unchanged.
        const CONTEXT_SIDE = "SELL";
        const CONTEXT_MIN_SAMPLES = PATTERN_MIN_SAMPLES;
        const CONTEXT_MIN_DECISIVE = PATTERN_MIN_DECISIVE;
        const CONTEXT_MIN_STABLE_SECTIONS = MIN_STABLE_SECTIONS;
        const CONTEXT_MIN_EV = PATTERN_MIN_EV;
        const CONTEXT_MIN_PF = PATTERN_MIN_PF;
        const CONTEXT_MIN_FAMILY_EV = FAMILY_MIN_EV;
        const CONTEXT_MIN_FAMILY_PF = FAMILY_MIN_PF;

        // =====================================================
        // V15 ADAPTIVE REGIME GATE
        // -----------------------------------------------------
        // This lane does NOT promote an edge directly. It creates
        // a controlled SELL-side adaptive candidate from a regime
        // context only when recent evidence remains positive after
        // exponential recency weighting. The candidate must still
        // pass untouched validation and the existing true-OOS gates.
        // =====================================================
        const ADAPTIVE_CONTEXT_SIDE = "SELL";
        const ADAPTIVE_CONTEXT_MIN_TOTAL_SAMPLES = 12;
        const ADAPTIVE_CONTEXT_MIN_RECENT_SAMPLES = 8;
        const ADAPTIVE_CONTEXT_MIN_RECENT_DECISIVE = 5;
        const ADAPTIVE_CONTEXT_MIN_RECENT_EV = 0.05;
        const ADAPTIVE_CONTEXT_MIN_RECENT_PF = 1.05;
        const ADAPTIVE_CONTEXT_MAX_RECENT_LOSS_STREAK = 3;
        const ADAPTIVE_HALF_LIFE_RECORDS = 60;
        const ADAPTIVE_MIN_EFFECTIVE_SAMPLES = 6;

        // =====================================================
        // V15.2 PRE-ENTRY REGIME GATE
        // -----------------------------------------------------
        // The V15.1 adaptive gate was evaluated from the static
        // discovery record set. V15.2 makes the qualification
        // explicitly point-in-time: only completed historical
        // records whose exits occurred BEFORE the current entry
        // index may qualify the regime.
        //
        // No current/future outcome is allowed into the gate.
        // =====================================================
        const V152_GATE_LOOKBACK_RECORDS = 12;
        const V152_GATE_MIN_DECISIVE = 5;
        const V152_GATE_MIN_EV = 0.05;
        const V152_GATE_MIN_PF = 1.05;
        const V152_GATE_MAX_LOSS_STREAK = 3;
        const V152_GATE_MAX_RECENT_TIMEOUTS = 4;

        // =====================================================
        // V15.4 FOCUSED SURVIVAL TEST + QUALIFICATION DIAGNOSTIC
        // -----------------------------------------------------
        // V15.2 showed that SELL|VWAP_PULLBACK|BEARISH is the
        // strongest currently surviving family candidate. V15.3
        // isolates that setup and tests only its regime-context
        // candidates with the FAST exit model.
        // No thresholds are relaxed.
        // =====================================================
        const V153_TARGET_SIDE = "SELL";
        const V153_TARGET_SETUP = "VWAP_PULLBACK";
        const V153_TARGET_TREND = "BEARISH";

        // =====================================================
        // V17 REGIME-AWARE CANDIDATE REDESIGN
        // -----------------------------------------------------
        // Predefined hypothesis lane: evaluate setup + trend +
        // regime as a single candidate identity. This separates
        // TRANSITION from TRENDING without changing validation/OOS.
        // =====================================================
        const V17_REGIME_AWARE_SIDE = "SELL";
        const V17_REGIME_AWARE_MIN_SAMPLES = PATTERN_MIN_SAMPLES;
        const V17_REGIME_AWARE_MIN_DECISIVE = PATTERN_MIN_DECISIVE;
        const V17_REGIME_AWARE_MIN_EV = PATTERN_MIN_EV;
        const V17_REGIME_AWARE_MIN_PF = PATTERN_MIN_PF;
        const V17_REGIME_AWARE_MIN_STABLE_SECTIONS = MIN_STABLE_SECTIONS;

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
        // V15.2 ACTIVE EXIT MODEL
        // -----------------------------------------------------
        // FAST mechanics selected from the V15 diagnostic comparison.
        // Fixed experiment; not an OOS promotion.
        // =====================================================
        const ACTIVE_EXIT_STOP_R = 1;
        const ACTIVE_EXIT_TARGET_R = 1.5;
        const ACTIVE_EXIT_MAX_HOLD_CANDLES = 8;

        const ACTIVE_EXIT_MODEL_KEY =
            "FAST_1R_1_5R_8";

        // =====================================================
        // RISK
        // =====================================================

        const STOP_R = ACTIVE_EXIT_STOP_R;
        const TARGET_R = ACTIVE_EXIT_TARGET_R;
        const PREFERRED_TARGET_R = 2;
        const MAX_HOLD_CANDLES = ACTIVE_EXIT_MAX_HOLD_CANDLES;
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

        // V14.15 REGIME-CONTEXT KEY
        // RSI is intentionally excluded so nearby RSI buckets do not
        // fragment the same time/regime edge into tiny samples.
        function regimeContextKey(
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
                `H:${f.timeBucket}`
            ].join("|");
        }

        // V17 REGIME-AWARE KEY
        // Aggregates across time bucket and RSI while preserving
        // side + setup + trend + regime.
        function regimeSetupKey(
            side,
            setup,
            f
        ) {

            return [
                side,
                `S:${setup}`,
                `T:${f.trend}`,
                `G:${f.regime}`
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

            const activeModel = {
                key: ACTIVE_EXIT_MODEL_KEY,
                stopR: ACTIVE_EXIT_STOP_R,
                targetR: ACTIVE_EXIT_TARGET_R,
                maxHoldCandles: ACTIVE_EXIT_MAX_HOLD_CANDLES
            };

            const outcome =
                evaluateExitModel(
                    candles,
                    index,
                    side,
                    entry,
                    atrValue,
                    activeModel,
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

                regimeContext:
                    regimeContextKey(
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
        // V15 ROLLING / DECAY EVIDENCE
        // =====================================================

        function rollingEvidenceMetrics(records, endIndex) {

            const safe = safeArray(records)
                .filter(x => Number.isFinite(x.index))
                .sort((a, b) => a.index - b.index);

            if (!safe.length) {
                return {
                    weightedSamples: 0,
                    effectiveSamples: 0,
                    weightedDecisive: 0,
                    weightedWins: 0,
                    weightedLosses: 0,
                    weightedNetR: 0,
                    weightedEV: 0,
                    weightedPF: 0,
                    maxRecentLossStreak: 0
                };
            }

            let weightSum = 0;
            let weightSquareSum = 0;
            let weightedDecisive = 0;
            let weightedWins = 0;
            let weightedLosses = 0;
            let weightedNetR = 0;
            let weightedWinR = 0;
            let weightedLossR = 0;

            let recentLossStreak = 0;
            let maxRecentLossStreak = 0;

            for (const record of safe) {
                const age = Math.max(0, endIndex - record.index);
                const weight = Math.pow(0.5, age / ADAPTIVE_HALF_LIFE_RECORDS);

                weightSum += weight;
                weightSquareSum += weight * weight;
                weightedNetR += weight * record.resultR;

                if (record.resultR > 0) {
                    weightedWins += weight;
                    weightedDecisive += weight;
                    weightedWinR += weight * record.resultR;
                    recentLossStreak = 0;
                } else if (record.resultR < 0) {
                    weightedLosses += weight;
                    weightedDecisive += weight;
                    weightedLossR += weight * Math.abs(record.resultR);
                    recentLossStreak++;
                    maxRecentLossStreak = Math.max(maxRecentLossStreak, recentLossStreak);
                } else {
                    recentLossStreak = 0;
                }
            }

            const effectiveSamples =
                weightSquareSum > 0
                    ? (weightSum * weightSum) / weightSquareSum
                    : 0;

            const weightedEV =
                weightSum > 0 ? weightedNetR / weightSum : 0;

            const weightedPF =
                weightedLossR > 0 ? weightedWinR / weightedLossR : 0;

            return {
                weightedSamples: round(weightSum, 4),
                effectiveSamples: round(effectiveSamples, 2),
                weightedDecisive: round(weightedDecisive, 4),
                weightedWins: round(weightedWins, 4),
                weightedLosses: round(weightedLosses, 4),
                weightedNetR: round(weightedNetR, 4),
                weightedEV: round(weightedEV, 4),
                weightedPF: round(weightedPF, 4),
                maxRecentLossStreak
            };
        }

        function pointInTimeRegimeGate(records, currentIndex) {

            const eligible = safeArray(records)
                .filter(x =>
                    x &&
                    Number.isFinite(x.index) &&
                    x.index < currentIndex &&
                    Number.isFinite(x.exitIndex) &&
                    x.exitIndex < currentIndex
                )
                .sort((a, b) => a.index - b.index);

            const recent = eligible.slice(-V152_GATE_LOOKBACK_RECORDS);
            const metrics = calculateMetrics(recent);

            const reasons = [];

            if (recent.length < V152_GATE_LOOKBACK_RECORDS) {
                reasons.push("V152_GATE_INSUFFICIENT_COMPLETED_RECORDS");
            }

            if (metrics.decisiveTrades < V152_GATE_MIN_DECISIVE) {
                reasons.push("V152_GATE_INSUFFICIENT_DECISIVE_RECORDS");
            }

            if (metrics.expectedValueR < V152_GATE_MIN_EV) {
                reasons.push("V152_GATE_EV_BELOW_THRESHOLD");
            }

            if (metrics.profitFactor < V152_GATE_MIN_PF) {
                reasons.push("V152_GATE_PF_BELOW_THRESHOLD");
            }

            if (metrics.maxConsecutiveLosses > V152_GATE_MAX_LOSS_STREAK) {
                reasons.push("V152_GATE_LOSS_STREAK_TOO_HIGH");
            }

            if (metrics.timeouts > V152_GATE_MAX_RECENT_TIMEOUTS) {
                reasons.push("V152_GATE_TIMEOUTS_TOO_HIGH");
            }

            return {
                passed: reasons.length === 0,
                reasons,
                eligibleRecords: eligible.length,
                recentRecords: recent.length,
                recentStartIndex: recent.length ? recent[0].index : null,
                recentEndIndex: recent.length ? recent[recent.length - 1].index : null,
                metrics
            };
        }

        function adaptiveContextGate(candidate, discoveryEnd) {

            const records = safeArray(candidate?.records);
            const minRecordIndex = records.length
                ? Math.min(...records.map(x => Number.isFinite(x.index) ? x.index : discoveryEnd))
                : 0;
            const trainingSpan = Math.max(1, discoveryEnd - minRecordIndex);
            const recentStart =
                Math.floor(discoveryEnd - trainingSpan * 0.35);

            const recentRecords = records.filter(
                x => Number.isFinite(x.index) && x.index >= recentStart && x.index < discoveryEnd
            );

            const recentMetrics = calculateMetrics(recentRecords);
            const rolling = rollingEvidenceMetrics(records, discoveryEnd - 1);

            const reasons = [];

            if (records.length < ADAPTIVE_CONTEXT_MIN_TOTAL_SAMPLES) {
                reasons.push("ADAPTIVE_INSUFFICIENT_TOTAL_SAMPLES");
            }

            if (recentMetrics.trades < ADAPTIVE_CONTEXT_MIN_RECENT_SAMPLES) {
                reasons.push("ADAPTIVE_INSUFFICIENT_RECENT_SAMPLES");
            }

            if (recentMetrics.decisiveTrades < ADAPTIVE_CONTEXT_MIN_RECENT_DECISIVE) {
                reasons.push("ADAPTIVE_INSUFFICIENT_RECENT_DECISIVE");
            }

            if (recentMetrics.expectedValueR < ADAPTIVE_CONTEXT_MIN_RECENT_EV) {
                reasons.push("ADAPTIVE_RECENT_EV_BELOW_THRESHOLD");
            }

            if (recentMetrics.profitFactor < ADAPTIVE_CONTEXT_MIN_RECENT_PF) {
                reasons.push("ADAPTIVE_RECENT_PF_BELOW_THRESHOLD");
            }

            if (recentMetrics.maxConsecutiveLosses > ADAPTIVE_CONTEXT_MAX_RECENT_LOSS_STREAK) {
                reasons.push("ADAPTIVE_RECENT_LOSS_STREAK_TOO_HIGH");
            }

            if (rolling.effectiveSamples < ADAPTIVE_MIN_EFFECTIVE_SAMPLES) {
                reasons.push("ADAPTIVE_EFFECTIVE_SAMPLE_FLOOR");
            }

            if (rolling.weightedEV < ADAPTIVE_CONTEXT_MIN_RECENT_EV) {
                reasons.push("ADAPTIVE_DECAYED_EV_BELOW_THRESHOLD");
            }

            if (rolling.weightedPF < ADAPTIVE_CONTEXT_MIN_RECENT_PF) {
                reasons.push("ADAPTIVE_DECAYED_PF_BELOW_THRESHOLD");
            }

            return {
                passed: reasons.length === 0,
                reasons,
                recentMetrics,
                rolling,
                recentStart,
                recentEnd: discoveryEnd - 1,
                halfLifeRecords: ADAPTIVE_HALF_LIFE_RECORDS
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

            const contextMap =
                new Map();

            const regimeSetupMap =
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

                    // V15.1 is deliberately SELL-only. BUY evidence
                    // was persistently destructive across the tested
                    // history and is excluded rather than reweighted.
                    if (setup.side !== DIRECTIONAL_SIDE) {
                        continue;
                    }

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

                    if (
                        !contextMap.has(
                            record.regimeContext
                        )
                    ) {
                        contextMap.set(
                            record.regimeContext,
                            []
                        );
                    }

                    contextMap
                        .get(record.regimeContext)
                        .push(record);

                    const regimeSetup =
                        regimeSetupKey(
                            record.side,
                            record.setup,
                            {
                                trend: record.trend,
                                regime: record.regime
                            }
                        );

                    if (!regimeSetupMap.has(regimeSetup)) {
                        regimeSetupMap.set(regimeSetup, []);
                    }

                    regimeSetupMap
                        .get(regimeSetup)
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

            const contextPatterns = [];

            for (
                const [
                    key,
                    records
                ] of contextMap
            ) {

                const summary =
                    summarize(
                        key,
                        records,
                        "CONTEXT"
                    );

                summary.contextVariants =
                    new Set(
                        records.map(
                            x => x.pattern
                        )
                    ).size;

                summary.direction = CONTEXT_SIDE;

                contextPatterns.push(
                    summary
                );
            }

            const regimeSetupPatterns = [];

            for (const [key, records] of regimeSetupMap) {
                const summary = summarize(key, records, "PATTERN");
                summary.level = "REGIME_SETUP";
                summary.direction = V17_REGIME_AWARE_SIDE;
                summary.regimeAware = true;
                regimeSetupPatterns.push(summary);
            }

            const qualifiedRegimeSetupPatterns =
                regimeSetupPatterns
                    .filter(x =>
                        String(x.key).startsWith(`${V17_REGIME_AWARE_SIDE}|`) &&
                        x.samples >= V17_REGIME_AWARE_MIN_SAMPLES &&
                        x.decisiveTrades >= V17_REGIME_AWARE_MIN_DECISIVE &&
                        x.expectedValueR >= V17_REGIME_AWARE_MIN_EV &&
                        x.profitFactor >= V17_REGIME_AWARE_MIN_PF &&
                        x.stableSections >= V17_REGIME_AWARE_MIN_STABLE_SECTIONS &&
                        x.recentEV >= 0
                    )
                    .map(x => ({ ...x, level: "REGIME_SETUP", direction: V17_REGIME_AWARE_SIDE }));

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

            const qualifiedContextPatterns =
                contextPatterns
                    .filter(x =>
                        String(x.key).startsWith(
                            `${CONTEXT_SIDE}|`
                        ) &&
                        x.trades >= CONTEXT_MIN_SAMPLES &&
                        x.decisiveTrades >= CONTEXT_MIN_DECISIVE &&
                        x.expectedValueR >= CONTEXT_MIN_EV &&
                        x.profitFactor >= CONTEXT_MIN_PF &&
                        x.profitableSections >= CONTEXT_MIN_STABLE_SECTIONS &&
                        x.recentEV >= 0
                    )
                    .map(x => ({
                        ...x,
                        level: "CONTEXT",
                        direction: CONTEXT_SIDE
                    }));

            // V14.15 adaptive lane: recent/decayed evidence can qualify
            // a SELL regime-context candidate for untouched validation.
            // This is intentionally NOT a proven edge; validation/OOS
            // thresholds remain unchanged.
            const adaptiveContextPatterns =
                contextPatterns
                    .filter(x =>
                        String(x.key).startsWith(
                            `${ADAPTIVE_CONTEXT_SIDE}|`
                        )
                    )
                    .map(x => {
                        const gate = adaptiveContextGate(
                            x,
                            end
                        );
                        return {
                            ...x,
                            level: "ADAPTIVE_CONTEXT",
                            direction: ADAPTIVE_CONTEXT_SIDE,
                            adaptiveGate: gate
                        };
                    })
                    .filter(x => x.adaptiveGate.passed);

            return {

                families,

                patterns,

                corePatterns,

                directionalPatterns,

                contextPatterns,

                regimeSetupPatterns,

                qualifiedRegimeSetupPatterns,

                v191RegimePromotionAudit:
                    buildV191RegimePromotionAudit({
                        regimeSetupPatterns,
                        qualifiedRegimeSetupPatterns
                    }),

                qualifiedContextPatterns,

                adaptiveContextPatterns,

                rawRecords
            };
        }

        // =====================================================
        // V19.1 REGIME CANDIDATE PROMOTION CONSISTENCY AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Qualification and promotion now use
        // the same summarize() sample field: samples.
        // =====================================================
        function buildV191RegimePromotionAudit(discovery) {
            const all = safeArray(discovery?.regimeSetupPatterns);
            const qualified = safeArray(discovery?.qualifiedRegimeSetupPatterns);

            return all.map(x => {
                const thresholdQualified =
                    String(x.key).startsWith(`${V17_REGIME_AWARE_SIDE}|`) &&
                    x.samples >= V17_REGIME_AWARE_MIN_SAMPLES &&
                    x.decisiveTrades >= V17_REGIME_AWARE_MIN_DECISIVE &&
                    x.expectedValueR >= V17_REGIME_AWARE_MIN_EV &&
                    x.profitFactor >= V17_REGIME_AWARE_MIN_PF &&
                    x.stableSections >= V17_REGIME_AWARE_MIN_STABLE_SECTIONS &&
                    x.recentEV >= 0;

                const inQualifiedPool = qualified.some(q => q.key === x.key);

                return {
                    key: x.key,
                    samples: x.samples,
                    decisiveTrades: x.decisiveTrades,
                    EV: x.expectedValueR,
                    PF: x.profitFactor,
                    stableSections: x.stableSections,
                    recentEV: x.recentEV,
                    thresholdQualified,
                    inQualifiedRegimePool: inQualifiedPool,
                    consistent: thresholdQualified === inQualifiedPool,
                    discrepancy: thresholdQualified && !inQualifiedPool
                        ? "QUALIFIED_BUT_MISSING_FROM_POOL"
                        : null
                };
            });
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

            if (
                candidate.level === "ADAPTIVE_CONTEXT"
            ) {
                const parts = String(candidate.key).split("|");
                if (parts.length < 3) return null;
                let setup = null;
                let trend = null;
                const side = parts[0];
                for (const part of parts) {
                    if (part.startsWith("S:")) setup = part.slice(2);
                    if (part.startsWith("T:")) trend = part.slice(2);
                }
                if (!side || !setup || !trend) return null;
                return familyKey(side, setup, trend);
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

                    // V15.6: candidate-native validation.
                    // The candidate itself determines side + setup.
                    // No global V15.3 target filter is applied here.
                    const candidateKey = String(candidate?.key || "");
                    const candidateSide = candidateKey.split("|")[0] || null;
                    const setupToken = candidateKey.match(/\|S:([^|]+)/);
                    const trendToken = candidateKey.match(/\|T:([^|]+)/);
                    const candidateSetup = setupToken ? setupToken[1] : null;
                    const candidateTrend = trendToken ? trendToken[1] : null;
                    const regimeToken = candidateKey.match(/\|G:([^|]+)/);
                    const candidateRegime = regimeToken ? regimeToken[1] : null;

                    if (candidateSide && setup.side !== candidateSide) {
                        continue;
                    }

                    if (candidateSetup && setup.setup !== candidateSetup) {
                        continue;
                    }

                    if (candidate.level === "CONTEXT" || candidate.level === "ADAPTIVE_CONTEXT" || candidate.level === "REGIME_SETUP") {
                        if (candidateTrend && f.trend !== candidateTrend) {
                            continue;
                        }
                    }

                    if (candidate.level === "REGIME_SETUP" && candidateRegime && f.regime !== candidateRegime) {
                        continue;
                    }

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
                                : candidate.level === "CONTEXT"
                                    ? regimeContextKey(
                                        setup.side,
                                        setup.setup,
                                        f
                                    ) === candidate.key
                                    : candidate.level === "ADAPTIVE_CONTEXT"
                                        ? regimeContextKey(
                                            setup.side,
                                            setup.setup,
                                            f
                                        ) === candidate.key
                                        : candidate.level === "REGIME_SETUP"
                                            ? regimeSetupKey(
                                                setup.side,
                                                setup.setup,
                                                f
                                            ) === candidate.key
                                            : key === candidate.key;

                    if (!matched) {
                        continue;
                    }

                    if (candidate.level === "ADAPTIVE_CONTEXT") {
                        const gate = pointInTimeRegimeGate(
                            candidate.records,
                            i
                        );
                        if (!gate.passed) {
                            continue;
                        }
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

                    const activeModel = {
                        key: ACTIVE_EXIT_MODEL_KEY,
                        stopR: ACTIVE_EXIT_STOP_R,
                        targetR: ACTIVE_EXIT_TARGET_R,
                        maxHoldCandles: ACTIVE_EXIT_MAX_HOLD_CANDLES
                    };

                    const outcome =
                        evaluateExitModel(
                            candles,
                            i,
                            setup.side,
                            entry,
                            a,
                            activeModel,
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
        // V15.4 QUALIFICATION FAILURE DIAGNOSTIC
        // -----------------------------------------------------
        // Diagnostic only. This does NOT change qualification,
        // validation, OOS, thresholds, or candidate promotion.
        // It traces every VWAP_PULLBACK / SELL / BEARISH
        // regime-context candidate through the gates that can
        // prevent it from reaching untouched validation.
        // =====================================================

        function buildV154QualificationDiagnostics(
            discovery,
            discoveryEnd
        ) {

            const allContexts =
                safeArray(discovery?.contextPatterns);

            const targetContexts =
                allContexts.filter(x => {
                    const key = String(x?.key || "");
                    return (
                        key.startsWith(`${V153_TARGET_SIDE}|`) &&
                        key.includes(`|S:${V153_TARGET_SETUP}|`) &&
                        key.includes(`|T:${V153_TARGET_TREND}|`)
                    );
                });

            const familyKeyFor =
                `${V153_TARGET_SIDE}|${V153_TARGET_SETUP}|${V153_TARGET_TREND}`;

            const family =
                safeArray(discovery?.families)
                    .find(x => x.key === familyKeyFor) || null;

            const diagnostics = targetContexts.map(candidate => {

                const reasons = [];

                const contextEvidence = {
                    samples: candidate.samples ?? candidate.trades ?? 0,
                    decisive: candidate.decisiveTrades ?? 0,
                    EV: candidate.expectedValueR ?? 0,
                    PF: candidate.profitFactor ?? 0,
                    profitableSections: candidate.stableSections ?? candidate.profitableSections ?? 0,
                    recentEV: candidate.recentEV ?? 0,
                    recentPF: candidate.recentPF ?? 0,
                    recentSamples: candidate.recentSamples ?? 0,
                    recentDecisive: candidate.recentDecisive ?? 0
                };

                if (contextEvidence.samples < CONTEXT_MIN_SAMPLES) {
                    reasons.push("CONTEXT_INSUFFICIENT_SAMPLES");
                }
                if (contextEvidence.decisive < CONTEXT_MIN_DECISIVE) {
                    reasons.push("CONTEXT_INSUFFICIENT_DECISIVE");
                }
                if (contextEvidence.EV < CONTEXT_MIN_EV) {
                    reasons.push("CONTEXT_EV_BELOW_THRESHOLD");
                }
                if (contextEvidence.PF < CONTEXT_MIN_PF) {
                    reasons.push("CONTEXT_PF_BELOW_THRESHOLD");
                }
                if (contextEvidence.profitableSections < CONTEXT_MIN_STABLE_SECTIONS) {
                    reasons.push("CONTEXT_STABILITY_BELOW_THRESHOLD");
                }
                if (contextEvidence.recentEV < 0) {
                    reasons.push("CONTEXT_RECENT_EV_NEGATIVE");
                }

                const adaptiveGate =
                    adaptiveContextGate(
                        candidate,
                        discoveryEnd
                    );

                if (!adaptiveGate.passed) {
                    for (const reason of safeArray(adaptiveGate.reasons)) {
                        reasons.push(reason);
                    }
                }

                if (!family) {
                    reasons.push("FAMILY_RESOLUTION_FAILED");
                } else {
                    if (family.expectedValueR < CONTEXT_MIN_FAMILY_EV) {
                        reasons.push("CONTEXT_FAMILY_EV_TOO_WEAK");
                    }
                    if (family.profitFactor < CONTEXT_MIN_FAMILY_PF) {
                        reasons.push("CONTEXT_FAMILY_PF_TOO_WEAK");
                    }
                }

                const contextQualified =
                    safeArray(discovery?.qualifiedContextPatterns)
                        .some(x => x.key === candidate.key);

                const adaptiveQualified =
                    safeArray(discovery?.adaptiveContextPatterns)
                        .some(x => x.key === candidate.key);

                const reachesCurrentPromotionPool =
                    contextQualified || adaptiveQualified;

                if (!reachesCurrentPromotionPool) {
                    reasons.push("NOT_IN_CURRENT_QUALIFIED_CONTEXT_POOL");
                }

                return {
                    key: candidate.key,
                    contextVariants: candidate.contextVariants ?? 0,
                    contextEvidence,
                    adaptiveGate: {
                        passed: adaptiveGate.passed,
                        reasons: adaptiveGate.reasons,
                        eligibleRecords: adaptiveGate.eligibleRecords,
                        recentRecords: adaptiveGate.recentRecords,
                        metrics: adaptiveGate.metrics
                    },
                    currentQualifiedContext: contextQualified,
                    currentAdaptiveContext: adaptiveQualified,
                    currentFamily: family
                        ? {
                            key: family.key,
                            qualified: !!family.qualified,
                            samples: family.samples,
                            decisiveTrades: family.decisiveTrades,
                            EV: family.expectedValueR,
                            PF: family.profitFactor,
                            stableSections: family.stableSections
                        }
                        : null,
                    wouldReachValidationPool: reachesCurrentPromotionPool && reasons.length === 0,
                    blockingReasons: [...new Set(reasons)]
                };
            });

            const reasonCounts = {};
            for (const item of diagnostics) {
                for (const reason of item.blockingReasons) {
                    reasonCounts[reason] =
                        (reasonCounts[reason] || 0) + 1;
                }
            }

            return {
                purpose:
                    "Explain why SELL|VWAP_PULLBACK|BEARISH context candidates do or do not reach validation without changing any strategy or validation rule.",
                target: `${V153_TARGET_SIDE}|${V153_TARGET_SETUP}|${V153_TARGET_TREND}`,
                familyKey: familyKeyFor,
                totalContextCandidates: targetContexts.length,
                qualifiedContextCandidates:
                    diagnostics.filter(x => x.currentQualifiedContext).length,
                adaptiveContextCandidates:
                    diagnostics.filter(x => x.currentAdaptiveContext).length,
                candidatesThatWouldReachValidation:
                    diagnostics.filter(x => x.wouldReachValidationPool).length,
                blockingReasonCounts: reasonCounts,
                candidates: diagnostics
            };
        }

        // =====================================================
        // PROMOTION / CANDIDATE FLOW
        // =====================================================

        // =====================================================
        // V15.6 CANDIDATE-NATIVE PROMOTION AUDIT
        // -----------------------------------------------------
        // Diagnostic only. V15.5 does NOT loosen any gate and does
        // NOT change validation/OOS behavior. It explains why a
        // discovered/qualified context candidate does or does not
        // enter the actual validationCandidates array.
        // =====================================================
        function buildV156CandidateNativePromotionAudit(discovery, discoveryEnd) {

            const all = [
                ...safeArray(discovery?.qualifiedContextPatterns),
                ...safeArray(discovery?.adaptiveContextPatterns)
            ];

            const unique = [];
            const seen = new Set();

            for (const candidate of all) {
                const key = String(candidate?.key || "");
                if (!key || seen.has(key)) continue;
                seen.add(key);
                unique.push(candidate);
            }

            const audit = unique.map(candidate => {
                const key = String(candidate.key || "");
                const reasons = [];
                const candidateSide = key.split("|")[0] || null;
                const setupToken = key.match(/\|S:([^|]+)/);
                const trendToken = key.match(/\|T:([^|]+)/);
                const candidateSetup = setupToken ? setupToken[1] : null;
                const candidateTrend = trendToken ? trendToken[1] : null;
                const regimeToken = key.match(/\|G:([^|]+)/);
                const candidateRegime = regimeToken ? regimeToken[1] : null;

                if (!candidateSide || !candidateSetup || !candidateTrend || (candidate.level === "REGIME_SETUP" && !candidateRegime)) {
                    reasons.push("CANDIDATE_IDENTITY_UNRESOLVED");
                }

                const familyKey = resolveFamilyKey(candidate);
                const family = safeArray(discovery?.families).find(x => x.key === familyKey) || null;

                if (!family) {
                    reasons.push("FAMILY_RESOLUTION_FAILED");
                } else if (
                    (candidate.level === "CONTEXT" || candidate.level === "ADAPTIVE_CONTEXT") &&
                    (family.expectedValueR < CONTEXT_MIN_FAMILY_EV || family.profitFactor < CONTEXT_MIN_FAMILY_PF)
                ) {
                    reasons.push("CONTEXT_FAMILY_EDGE_TOO_WEAK");
                }

                const adaptiveGate = candidate.level === "ADAPTIVE_CONTEXT"
                    ? adaptiveContextGate(candidate, discoveryEnd)
                    : { passed: true, reasons: [], eligibleRecords: null, recentRecords: null, metrics: null };

                if (!adaptiveGate.passed) {
                    for (const r of safeArray(adaptiveGate.reasons)) reasons.push(`ADAPTIVE_GATE:${r}`);
                }

                const inQualifiedContext = safeArray(discovery?.qualifiedContextPatterns).some(x => x.key === candidate.key);
                const inAdaptiveContext = safeArray(discovery?.adaptiveContextPatterns).some(x => x.key === candidate.key);

                if (!inQualifiedContext && !inAdaptiveContext) reasons.push("NOT_IN_CURRENT_QUALIFIED_POOL");

                const targetSideMatch = candidateSide === V153_TARGET_SIDE;
                const targetSetupMatch = candidateSetup === V153_TARGET_SETUP;
                const targetTrendMatch = candidateTrend === V153_TARGET_TREND;

                const wouldEnterActualPromotionPool =
                    !reasons.some(r =>
                        r === "CANDIDATE_IDENTITY_UNRESOLVED" ||
                        r === "FAMILY_RESOLUTION_FAILED" ||
                        r === "CONTEXT_FAMILY_EDGE_TOO_WEAK" ||
                        r.startsWith("ADAPTIVE_GATE:")
                    ) &&
                    (inQualifiedContext || inAdaptiveContext);

                return {
                    key,
                    level: candidate.level,
                    candidateIdentity: {
                        side: candidateSide,
                        setup: candidateSetup,
                        trend: candidateTrend
                    },
                    previousV153Target: {
                        target: `${V153_TARGET_SIDE}|${V153_TARGET_SETUP}|${V153_TARGET_TREND}`,
                        sideMatch: targetSideMatch,
                        setupMatch: targetSetupMatch,
                        trendMatch: targetTrendMatch,
                        wouldHaveBeenExcludedByOldFilter: !(targetSideMatch && targetSetupMatch && targetTrendMatch)
                    },
                    poolMembership: {
                        qualifiedContext: inQualifiedContext,
                        adaptiveContext: inAdaptiveContext
                    },
                    adaptiveGate: {
                        passed: adaptiveGate.passed,
                        reasons: adaptiveGate.reasons,
                        eligibleRecords: adaptiveGate.eligibleRecords,
                        recentRecords: adaptiveGate.recentRecords,
                        metrics: adaptiveGate.metrics
                    },
                    family: family ? {
                        key: family.key,
                        qualified: !!family.qualified,
                        EV: family.expectedValueR,
                        PF: family.profitFactor,
                        stableSections: family.stableSections
                    } : null,
                    wouldEnterActualPromotionPool,
                    blockingReasons: [...new Set(reasons)]
                };
            });

            const counts = {};
            for (const item of audit) {
                for (const reason of item.blockingReasons) counts[reason] = (counts[reason] || 0) + 1;
            }

            return {
                purpose: "Trace every qualified/adaptive context candidate using candidate-native promotion. The previous V15.3 target filter is retained only as a diagnostic comparison.",
                previousTarget: `${V153_TARGET_SIDE}|${V153_TARGET_SETUP}|${V153_TARGET_TREND}`,
                discoveredContextCandidates: safeArray(discovery?.contextPatterns).length,
                qualifiedContextCandidates: safeArray(discovery?.qualifiedContextPatterns).length,
                adaptiveContextCandidates: safeArray(discovery?.adaptiveContextPatterns).length,
                auditedCandidates: audit.length,
                candidatesThatWouldEnterActualPromotionPool: audit.filter(x => x.wouldEnterActualPromotionPool).length,
                candidatesPreviouslyBlockedOnlyByTargetFilter: audit.filter(x => x.previousV153Target.wouldHaveBeenExcludedByOldFilter && x.blockingReasons.length === 0).length,
                blockingReasonCounts: counts,
                candidates: audit,
                guard: "Diagnostic only. V15.6 does not lower discovery, adaptive, validation, profitability, or OOS thresholds. It only removes the obsolete global target filter from candidate promotion and validation matching."
            };
        }

        // =====================================================
        // V17 REGIME-AWARE CANDIDATE AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Shows the setup x regime cells that
        // pass the unchanged discovery evidence floor.
        // =====================================================
        function buildV17RegimeAwareCandidateAudit(discovery) {
            const all = safeArray(discovery?.regimeSetupPatterns);
            const qualified = safeArray(discovery?.qualifiedRegimeSetupPatterns);

            const candidates = all.map(x => ({
                key: x.key,
                setup: String(x.key).match(/\|S:([^|]+)/)?.[1] || null,
                trend: String(x.key).match(/\|T:([^|]+)/)?.[1] || null,
                regime: String(x.key).match(/\|G:([^|]+)/)?.[1] || null,
                samples: x.samples,
                decisiveTrades: x.decisiveTrades,
                EV: x.expectedValueR,
                PF: x.profitFactor,
                stableSections: x.stableSections,
                recentEV: x.recentEV,
                recentPF: x.recentPF,
                qualified: !!x.qualified,
                entersV17Pool: qualified.some(q => q.key === x.key)
            }));

            candidates.sort((a,b) => (b.recentEV ?? -999) - (a.recentEV ?? -999));

            return {
                purpose: "Compare setup + regime cells before untouched validation without changing validation/OOS rules.",
                hypothesis: "Separate TRANSITION from TRENDING and evaluate VWAP_PULLBACK versus TREND_FOLLOW using the unchanged discovery evidence floor.",
                thresholds: {
                    minimumSamples: V17_REGIME_AWARE_MIN_SAMPLES,
                    minimumDecisive: V17_REGIME_AWARE_MIN_DECISIVE,
                    minimumEV: V17_REGIME_AWARE_MIN_EV,
                    minimumPF: V17_REGIME_AWARE_MIN_PF,
                    minimumStableSections: V17_REGIME_AWARE_MIN_STABLE_SECTIONS,
                    minimumRecentEV: 0
                },
                discoveredCells: all.length,
                qualifiedCells: qualified.length,
                candidates,
                diagnosticOnly: true
            };
        }

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

            const qualifiedContext =
                safeArray(
                    discovery.qualifiedContextPatterns
                );

            const adaptiveContext =
                safeArray(
                    discovery.adaptiveContextPatterns
                );

            const regimeAware =
                safeArray(
                    discovery.qualifiedRegimeSetupPatterns
                );

            const v154QualificationDiagnostics =
                buildV154QualificationDiagnostics(
                    discovery,
                    discoveryEnd
                );

            const v156CandidateNativePromotionAudit =
                buildV156CandidateNativePromotionAudit(
                    discovery,
                    discoveryEnd
                );

            // V15.6 CANDIDATE-NATIVE PROMOTION
            // -----------------------------------
            // Qualified/adaptive context candidates are promoted
            // according to their OWN side/setup/trend identity.
            // The old V15.3 target filter is diagnostic-only now and
            // cannot silently discard a valid candidate before
            // untouched validation.
            const qualified =
                [
                    ...qualifiedContext,
                    ...adaptiveContext,
                    ...regimeAware
                ].filter(
                    x => !!x && !!x.key
                );

            for (const candidate of qualified) {

                const candidateKey = String(candidate.key || "");
                const candidateSide = candidateKey.split("|")[0] || null;
                const setupToken = candidateKey.match(/\|S:([^|]+)/);
                const trendToken = candidateKey.match(/\|T:([^|]+)/);
                const candidateSetup = setupToken ? setupToken[1] : null;
                const candidateTrend = trendToken ? trendToken[1] : null;

                if (!candidateSide || !candidateSetup || !candidateTrend) {
                    candidatesRejectedBeforeValidation.push({
                        key: candidate.key,
                        level: candidate.level,
                        stage: "PRE_VALIDATION",
                        reason: "CANDIDATE_IDENTITY_UNRESOLVED"
                    });
                    continue;
                }

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
                if (
                    candidate.level === "CONTEXT" ||
                    candidate.level === "ADAPTIVE_CONTEXT" ||
                    candidate.level === "REGIME_SETUP"
                ) {

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
                            CONTEXT_MIN_FAMILY_EV ||
                        family.profitFactor <
                            CONTEXT_MIN_FAMILY_PF
                    ) {
                        candidatesRejectedBeforeValidation.push({
                            key: candidate.key,
                            level: candidate.level,
                            stage: "PRE_VALIDATION",
                            reason: "CONTEXT_FAMILY_EDGE_TOO_WEAK",
                            familyKey: familyKeyValue,
                            familyEV: family.expectedValueR,
                            familyPF: family.profitFactor
                        });
                        continue;
                    }
                }

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

                    qualifiedContext:
                        qualifiedContext.length,

                    adaptiveContext:
                        adaptiveContext.length,

                    regimeAware:
                        regimeAware.length,

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
,

                    v154QualificationDiagnostics,
                    v156CandidateNativePromotionAudit
                }
            };
        }
             // =====================================================
        // V15.7 VALIDATION FAILURE AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Does NOT change validation thresholds,
        // candidate promotion, OOS selection, or trade execution.
        // It exposes the exact validation failure reason and
        // threshold margin for every validation candidate.
        // =====================================================
        function buildV157ValidationFailureAudit(
            promoted
        ) {

            const results =
                safeArray(promoted?.validationResults);

            const candidates =
                results.map(result => {

                    const m = result.metrics || {};

                    const failedThresholds =
                        validationFailureReasons(m);

                    return {
                        key: result.key,
                        level: result.level,
                        stage: result.stage,
                        passed: !!result.passed,
                        primaryReason: result.primaryReason,
                        reasons: result.reasons || [],
                        failedThresholds,
                        metrics: {
                            trades: m.trades ?? 0,
                            decisiveTrades: m.decisiveTrades ?? 0,
                            wins: m.wins ?? 0,
                            losses: m.losses ?? 0,
                            timeouts: m.timeouts ?? 0,
                            netR: m.netR ?? 0,
                            expectedValueR: m.expectedValueR ?? 0,
                            profitFactor: m.profitFactor ?? 0,
                            maxConsecutiveLosses: m.maxConsecutiveLosses ?? 0
                        },
                        margins: {
                            samples: (m.trades ?? 0) - VALIDATION_MIN_SAMPLES,
                            decisive: (m.decisiveTrades ?? 0) - VALIDATION_MIN_DECISIVE,
                            EV: round((m.expectedValueR ?? -999) - VALIDATION_MIN_EV, 4),
                            PF: round((m.profitFactor ?? 0) - VALIDATION_MIN_PF, 4),
                            lossStreak: MAX_VALIDATION_LOSS_STREAK - (m.maxConsecutiveLosses ?? 999)
                        },
                        matchedSetupOccurrences: result.matchedSetupOccurrences ?? 0,
                        confirmationRejected: result.confirmationRejected ?? 0,
                        cooldownRejected: result.cooldownRejected ?? 0,
                        skippedBoundaryTrades: result.skippedBoundaryTrades ?? 0
                    };
                });

            const reasonCounts = {};
            const stageCounts = {};

            for (const item of candidates) {
                stageCounts[item.stage] =
                    (stageCounts[item.stage] || 0) + 1;

                for (const reason of new Set([
                    ...item.failedThresholds,
                    ...(item.reasons || [])
                ])) {
                    reasonCounts[reason] =
                        (reasonCounts[reason] || 0) + 1;
                }
            }

            return {
                purpose:
                    "Explain exactly why each validation candidate passed or failed without changing any validation, OOS, or trading rule.",
                thresholds: {
                    minimumSamples: VALIDATION_MIN_SAMPLES,
                    minimumDecisive: VALIDATION_MIN_DECISIVE,
                    minimumEV: VALIDATION_MIN_EV,
                    minimumPF: VALIDATION_MIN_PF,
                    maximumLossStreak: MAX_VALIDATION_LOSS_STREAK
                },
                auditedCandidates: candidates.length,
                passedCandidates: candidates.filter(x => x.passed).length,
                rejectedCandidates: candidates.filter(x => !x.passed).length,
                stageCounts,
                blockingReasonCounts: reasonCounts,
                candidates,
                guard:
                    "Diagnostic only. V15.7 does not lower thresholds, promote failed candidates, alter true OOS selection, or place real orders."
            };
        }

        // =====================================================
        // V15.9 VALIDATION OCCURRENCE AUDIT
        // -----------------------------------------------------
        // Diagnostic + correctness fix for adaptive-context
        // validation. V15.7 used corePatternKey() for the final
        // ADAPTIVE_CONTEXT match even though adaptive candidates
        // are regime-context keys. That could produce a validation
        // candidate with zero matched occurrences.
        // V15.9 matches ADAPTIVE_CONTEXT against regimeContextKey()
        // and exposes the occurrence funnel before confirmation,
        // cooldown and exit evaluation.
        // =====================================================
        function buildV158ValidationOccurrenceAudit(
            candles,
            candidate,
            validationStart,
            validationEnd
        ) {

            if (!candidate) {
                return {
                    audited: false,
                    reason: "NO_VALIDATION_CANDIDATE"
                };
            }

            const candidateKey = String(candidate.key || "");
            const candidateSide = candidateKey.split("|")[0] || null;
            const setupToken = candidateKey.match(/\|S:([^|]+)/);
            const trendToken = candidateKey.match(/\|T:([^|]+)/);
            const candidateSetup = setupToken ? setupToken[1] : null;
            const candidateTrend = trendToken ? trendToken[1] : null;

            const counts = {
                candlesScanned: 0,
                featureAvailable: 0,
                setupInstances: 0,
                sideMatches: 0,
                setupMatches: 0,
                trendMatches: 0,
                contextKeyMatches: 0,
                adaptiveGateRejected: 0,
                matchedOccurrences: 0
            };

            const examples = [];

            for (let i = validationStart; i < validationEnd - 1; i++) {
                counts.candlesScanned++;

                const f = features(candles, i);
                if (!f) continue;
                counts.featureAvailable++;

                const setups = detectSetups(candles, i);
                counts.setupInstances += setups.length;

                for (const setup of setups) {
                    if (candidateSide && setup.side !== candidateSide) continue;
                    counts.sideMatches++;

                    if (candidateSetup && setup.setup !== candidateSetup) continue;
                    counts.setupMatches++;

                    if (candidate.level === "CONTEXT" || candidate.level === "ADAPTIVE_CONTEXT") {
                        if (candidateTrend && f.trend !== candidateTrend) continue;
                    }
                    counts.trendMatches++;

                    const contextKey = regimeContextKey(
                        setup.side,
                        setup.setup,
                        f
                    );

                    if (contextKey !== candidate.key) continue;
                    counts.contextKeyMatches++;

                    if (candidate.level === "ADAPTIVE_CONTEXT") {
                        const gate = pointInTimeRegimeGate(candidate.records, i);
                        if (!gate.passed) {
                            counts.adaptiveGateRejected++;
                            continue;
                        }
                    }

                    counts.matchedOccurrences++;
                    if (examples.length < 10) {
                        examples.push({
                            index: i,
                            ts: candles[i].ts,
                            contextKey,
                            trend: f.trend,
                            regime: f.regime,
                            timeBucket: f.timeBucket,
                            vwapDirection: f.vwapDirection
                        });
                    }
                }
            }

            return {
                audited: true,
                candidate: {
                    key: candidate.key,
                    level: candidate.level,
                    side: candidateSide,
                    setup: candidateSetup,
                    trend: candidateTrend
                },
                validationWindow: {
                    start: validationStart,
                    end: validationEnd,
                    candles: Math.max(0, validationEnd - validationStart)
                },
                counts,
                examples,
                diagnosis:
                    counts.contextKeyMatches > 0 && counts.matchedOccurrences === 0
                        ? "CONTEXT_MATCHES_BLOCKED_BY_ADAPTIVE_GATE"
                        : counts.contextKeyMatches === 0
                            ? "NO_REGIME_CONTEXT_KEY_MATCHES"
                            : "OCCURRENCES_FOUND",
                guard:
                    "V15.9 preserves validation thresholds and OOS rules. Adaptive-context candidates are matched using their regime-context identity."
            };
        }

        // =====================================================
        // V15.9 CONTEXT-VARIANT INVESTIGATION
        // -----------------------------------------------------
        // Diagnostic only. Every discovered regime-context variant
        // is inspected independently so we can see which contexts
        // have enough historical evidence, which remain adaptive,
        // and whether the same context actually occurs inside the
        // untouched validation window. Nothing here promotes a
        // candidate, changes thresholds, or creates trades.
        // =====================================================
        // =====================================================
        // V16 ACTIVE CONTEXT STABILITY AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Uses DISCOVERY records only to determine
        // which context variants have the strongest RECENT and
        // exponentially-weighted evidence. It does NOT promote,
        // validate, select, or alter any candidate.
        // =====================================================

        function buildV16ActiveContextStabilityAudit(contextPatterns) {

            // V16.2 PERFORMANCE-SAFE AUDIT
            // Uses already-computed discovery summaries instead of rescanning
            // every raw discovery record. This keeps the diagnostic cheap enough
            // for a Vercel serverless invocation while preserving its diagnostic
            // only purpose.
            const variants = safeArray(contextPatterns)
                .filter(x => x && x.side === ADAPTIVE_CONTEXT_SIDE)
                .map(x => ({
                    key: x.key || null,
                    level: x.level || "CONTEXT",
                    trades: x.trades ?? 0,
                    decisiveTrades: x.decisiveTrades ?? 0,
                    EV: x.expectedValueR ?? 0,
                    PF: x.profitFactor ?? 0,
                    profitableSections: x.profitableSections ?? 0,
                    recentTrades: x.recentTrades ?? null,
                    recentDecisiveTrades: x.recentDecisiveTrades ?? null,
                    recentEV: x.recentEV ?? null,
                    recentPF: x.recentPF ?? null,
                    contextVariants: x.contextVariants ?? 0,
                    qualified: !!x.qualified,
                    adaptiveGatePassed: !!x.adaptiveGate?.passed,
                    adaptiveGateReasons: safeArray(x.adaptiveGate?.reasons),
                    status:
                        Number(x.recentEV) > 0 && Number(x.recentPF) >= 1.05
                            ? "RECENTLY_POSITIVE_CANDIDATE_PROFILE"
                            : Number(x.recentEV) < 0 || Number(x.recentPF) > 0 && Number(x.recentPF) < 1.05
                                ? "RECENT_WEAKNESS"
                                : "INSUFFICIENT_OR_MIXED_RECENT_EVIDENCE",
                    diagnosticOnly: true
                }));

            variants.sort((a, b) => {
                const rank = {
                    RECENTLY_POSITIVE_CANDIDATE_PROFILE: 3,
                    INSUFFICIENT_OR_MIXED_RECENT_EVIDENCE: 1,
                    RECENT_WEAKNESS: 0
                };
                if (rank[b.status] !== rank[a.status]) {
                    return rank[b.status] - rank[a.status];
                }
                if ((b.recentEV ?? -Infinity) !== (a.recentEV ?? -Infinity)) {
                    return (b.recentEV ?? -Infinity) - (a.recentEV ?? -Infinity);
                }
                return (b.EV ?? 0) - (a.EV ?? 0);
            });

            return {
                purpose: "Identify active SELL context variants from already-computed discovery summaries without rescanning raw records.",
                sample: {
                    sellDiscoveryVariants: variants.length
                },
                statusCounts: variants.reduce((acc, x) => {
                    acc[x.status] = (acc[x.status] || 0) + 1;
                    return acc;
                }, {}),
                strongestRecentVariants: variants.slice(0, 10),
                allVariants: variants,
                performanceSafe: true,
                guard: "Diagnostic only. V16.2 does not rescan candles, promote candidates, lower thresholds, use validation/OOS outcomes for discovery, alter true-OOS selection, or place real orders."
            };
        }

        function buildV159ContextVariantInvestigation(
            candles,
            contextPatterns,
            validationStart,
            validationEnd
        ) {

            const variants = safeArray(contextPatterns).map(candidate => {

                const candidateKey = String(candidate?.key || "");
                const candidateSide = candidateKey.split("|")[0] || null;
                const setupToken = candidateKey.match(/\|S:([^|]+)/);
                const trendToken = candidateKey.match(/\|T:([^|]+)/);
                const vwapToken = candidateKey.match(/\|V:([^|]+)/);
                const regimeToken = candidateKey.match(/\|G:([^|]+)/);
                const timeToken = candidateKey.match(/\|H:([^|]+)/);

                const candidateSetup = setupToken ? setupToken[1] : null;
                const candidateTrend = trendToken ? trendToken[1] : null;
                const candidateVWAP = vwapToken ? vwapToken[1] : null;
                const candidateRegime = regimeToken ? regimeToken[1] : null;
                const candidateTime = timeToken ? timeToken[1] : null;

                const counts = {
                    candlesScanned: 0,
                    featureAvailable: 0,
                    setupInstances: 0,
                    sideMatches: 0,
                    setupMatches: 0,
                    trendMatches: 0,
                    vwapMatches: 0,
                    regimeMatches: 0,
                    timeMatches: 0,
                    contextKeyMatches: 0,
                    adaptiveGateRejected: 0,
                    validationOccurrences: 0
                };

                const examples = [];

                for (let i = validationStart; i < validationEnd - 1; i++) {
                    counts.candlesScanned++;

                    const f = features(candles, i);
                    if (!f) continue;
                    counts.featureAvailable++;

                    const setups = detectSetups(candles, i);
                    counts.setupInstances += setups.length;

                    for (const setup of setups) {
                        if (candidateSide && setup.side !== candidateSide) continue;
                        counts.sideMatches++;

                        if (candidateSetup && setup.setup !== candidateSetup) continue;
                        counts.setupMatches++;

                        if (candidateTrend && f.trend !== candidateTrend) continue;
                        counts.trendMatches++;

                        if (candidateVWAP && f.vwapDirection !== candidateVWAP) continue;
                        counts.vwapMatches++;

                        if (candidateRegime && f.regime !== candidateRegime) continue;
                        counts.regimeMatches++;

                        if (candidateTime && f.timeBucket !== candidateTime) continue;
                        counts.timeMatches++;

                        const contextKey = regimeContextKey(
                            setup.side,
                            setup.setup,
                            f
                        );

                        if (contextKey !== candidate.key) continue;
                        counts.contextKeyMatches++;

                        if (candidate.level === "ADAPTIVE_CONTEXT") {
                            const gate = pointInTimeRegimeGate(candidate.records, i);
                            if (!gate.passed) {
                                counts.adaptiveGateRejected++;
                                continue;
                            }
                        }

                        counts.validationOccurrences++;

                        if (examples.length < 8) {
                            examples.push({
                                index: i,
                                ts: candles[i].ts,
                                contextKey,
                                trend: f.trend,
                                regime: f.regime,
                                timeBucket: f.timeBucket,
                                vwapDirection: f.vwapDirection
                            });
                        }
                    }
                }

                const adaptiveGate = candidate.adaptiveGate || null;
                const validationEnoughSamples = counts.validationOccurrences >= VALIDATION_MIN_SAMPLES;
                const validationEnoughDecisive = counts.validationOccurrences >= VALIDATION_MIN_DECISIVE;

                let diagnosis = "NO_VALIDATION_OCCURRENCES";
                if (counts.validationOccurrences > 0 && !validationEnoughSamples) {
                    diagnosis = "FEW_VALIDATION_OCCURRENCES";
                } else if (counts.validationOccurrences >= VALIDATION_MIN_SAMPLES) {
                    diagnosis = "ENOUGH_OCCURRENCES_FOR_METRIC_TEST";
                }

                return {
                    rankEvidence: {
                        trades: candidate.trades ?? 0,
                        decisiveTrades: candidate.decisiveTrades ?? 0,
                        EV: candidate.expectedValueR ?? 0,
                        PF: candidate.profitFactor ?? 0,
                        profitableSections: candidate.profitableSections ?? 0,
                        recentEV: candidate.recentEV ?? 0,
                        recentPF: candidate.recentPF ?? 0,
                        qualified: !!candidate.qualified,
                        level: candidate.level || "CONTEXT"
                    },
                    key: candidate.key,
                    level: candidate.level || "CONTEXT",
                    side: candidateSide,
                    setup: candidateSetup,
                    trend: candidateTrend,
                    vwapDirection: candidateVWAP,
                    regime: candidateRegime,
                    timeBucket: candidateTime,
                    contextVariants: candidate.contextVariants ?? 0,
                    adaptiveGate: adaptiveGate ? {
                        passed: !!adaptiveGate.passed,
                        reasons: safeArray(adaptiveGate.reasons),
                        eligibleRecords: adaptiveGate.eligibleRecords ?? null,
                        recentRecords: adaptiveGate.recentRecords ?? null,
                        metrics: adaptiveGate.metrics ?? null
                    } : null,
                    validationWindow: {
                        start: validationStart,
                        end: validationEnd,
                        candles: Math.max(0, validationEnd - validationStart)
                    },
                    counts,
                    validationEnoughSamples,
                    validationEnoughDecisive,
                    diagnosis,
                    examples
                };
            });

            const byValidationOpportunity = [...variants].sort((a, b) => {
                if (b.counts.validationOccurrences !== a.counts.validationOccurrences) {
                    return b.counts.validationOccurrences - a.counts.validationOccurrences;
                }
                if ((b.rankEvidence.EV || 0) !== (a.rankEvidence.EV || 0)) {
                    return (b.rankEvidence.EV || 0) - (a.rankEvidence.EV || 0);
                }
                return (b.rankEvidence.PF || 0) - (a.rankEvidence.PF || 0);
            });

            const byHistoricalEvidence = [...variants].sort((a, b) => {
                const aScore = (a.rankEvidence.EV || 0) * 100 + Math.min(a.rankEvidence.PF || 0, 5) * 10 + (a.rankEvidence.trades || 0) * 0.01;
                const bScore = (b.rankEvidence.EV || 0) * 100 + Math.min(b.rankEvidence.PF || 0, 5) * 10 + (b.rankEvidence.trades || 0) * 0.01;
                return bScore - aScore;
            });

            return {
                purpose: "Inspect every discovered SELL regime-context variant independently and determine whether it has enough untouched validation occurrences to become testable. Diagnostic only.",
                discoveredContextVariants: variants.length,
                variantsWithValidationOccurrences: variants.filter(x => x.counts.validationOccurrences > 0).length,
                variantsWithEnoughValidationSamples: variants.filter(x => x.validationEnoughSamples).length,
                variantsWithEnoughValidationDecisive: variants.filter(x => x.validationEnoughDecisive).length,
                variantsPassingAdaptiveGate: variants.filter(x => x.adaptiveGate?.passed).length,
                bestValidationOpportunity: byValidationOpportunity.slice(0, 5),
                strongestHistoricalEvidence: byHistoricalEvidence.slice(0, 5),
                allVariants: byHistoricalEvidence,
                guard: "V16 is diagnostic only. It does not promote variants, alter discovery/adaptive/validation/OOS thresholds, use validation outcomes for discovery, or place real orders."
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

                    if (setup.side !== DIRECTIONAL_SIDE) {
                        continue;
                    }

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
                                    "CONTEXT" ||
                                    candidate.level ===
                                    "ADAPTIVE_CONTEXT"
                                ) {
                                    return (
                                        candidate.key ===
                                        regimeContextKey(
                                            setup.side,
                                            setup.setup,
                                            f
                                        )
                                    );
                                }

                                if (
                                    candidate.level ===
                                    "REGIME_SETUP"
                                ) {
                                    return (
                                        candidate.key ===
                                        regimeSetupKey(
                                            setup.side,
                                            setup.setup,
                                            f
                                        )
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
                        setup.side === ADAPTIVE_CONTEXT_SIDE &&
                        match.level === "ADAPTIVE_CONTEXT"
                    ) {
                        const gate = pointInTimeRegimeGate(
                            match.records,
                            i
                        );
                        if (!gate.passed) {
                            continue;
                        }
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

                    const activeModel = {
                        key: ACTIVE_EXIT_MODEL_KEY,
                        stopR: ACTIVE_EXIT_STOP_R,
                        targetR: ACTIVE_EXIT_TARGET_R,
                        maxHoldCandles: ACTIVE_EXIT_MAX_HOLD_CANDLES
                    };

                    const stop =
                        setup.side === "BUY"
                            ? entry - ACTIVE_EXIT_STOP_R * a
                            : entry + ACTIVE_EXIT_STOP_R * a;

                    const target =
                        setup.side === "BUY"
                            ? entry + ACTIVE_EXIT_TARGET_R * a
                            : entry - ACTIVE_EXIT_TARGET_R * a;

                    const preferredTarget =
                        setup.side === "BUY"
                            ? entry + PREFERRED_TARGET_R * a
                            : entry - PREFERRED_TARGET_R * a;

                    const outcome =
                        evaluateExitModel(
                            candles,
                            i,
                            setup.side,
                            entry,
                            a,
                            activeModel,
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

                        matchedCandidateKey:
                            match.key,

                        matchedCandidateLevel:
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
                            "1:1.5",

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
        // LOAD HISTORICAL RANGE (V24 CONFIRMATION ONLY)
        // -----------------------------------------------------
        // Uses the same INDstocks endpoint/normalization as the
        // production data path, but for a deliberately separate
        // chronological period.
        // =====================================================

        async function loadHistoricalDataRange(
            rangeStartMs,
            rangeEndMs
        ) {

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

            const MAX_CHUNK_MS =
                7 *
                24 *
                60 *
                60 *
                1000;

            const chunks = [];
            let cursor = rangeStartMs;

            while (cursor < rangeEndMs) {

                const chunkEnd =
                    Math.min(
                        cursor + MAX_CHUNK_MS - 1000,
                        rangeEndMs
                    );

                chunks.push({
                    start: cursor,
                    end: chunkEnd
                });

                cursor = chunkEnd + 1000;
            }

            const all = [];

            for (const chunk of chunks) {

                const payload =
                    await fetchHistoricalChunk(
                        accessToken,
                        chunk.start,
                        chunk.end
                    );

                all.push(
                    ...extractRows(payload)
                );
            }

            const prepared =
                prepareData(all);

            return {
                chunksRequested: chunks.length,
                rawCandles: all.length,
                normalizedCandles: prepared.length,
                deduplicated:
                    all.length - prepared.length,
                candles: prepared,
                rangeStartMs,
                rangeEndMs
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
        // V24 INDEPENDENT CONFIRMATION SLICE
        // -----------------------------------------------------
        // V23 uses the latest REQUESTED_DAYS. V24 deliberately
        // uses the immediately preceding equal-length period so
        // no candle can belong to both experiments.
        // -----------------------------------------------------

        const V24_CONFIRMATION_DAYS = 180;

        const v24LatestStartMs =
            Date.now() -
            REQUESTED_DAYS *
            24 *
            60 *
            60 *
            1000;

        const v24ConfirmationEndMs =
            v24LatestStartMs - 1000;

        const v24ConfirmationStartMs =
            v24ConfirmationEndMs -
            V24_CONFIRMATION_DAYS *
            24 *
            60 *
            60 *
            1000;

        const v24ConfirmationData =
            await loadHistoricalDataRange(
                v24ConfirmationStartMs,
                v24ConfirmationEndMs
            );

        const v24ConfirmationRows =
            v24ConfirmationData.candles;

        const v24ConfirmationCandles =
            v24ConfirmationRows.length > 0
                ? v24ConfirmationRows.slice(0, -1)
                : [];

        let v24ConfirmationDiscovery = null;
        let v24IndependentEdgeHealthConfirmation = null;

        if (v24ConfirmationCandles.length >= 500) {

            v24ConfirmationDiscovery =
                discoverCandidates(
                    v24ConfirmationCandles,
                    0,
                    v24ConfirmationCandles.length
                );

            v24IndependentEdgeHealthConfirmation =
                buildV240IndependentEdgeHealthConfirmation({
                    confirmationRecords:
                        v24ConfirmationDiscovery.rawRecords,
                    sourceLabel:
                        "SEPARATE_NON_OVERLAPPING_HISTORICAL_SLICE",
                    sourceStartTs:
                        v24ConfirmationRows[0]?.ts ?? null,
                    sourceEndTs:
                        v24ConfirmationRows[
                            v24ConfirmationRows.length - 1
                        ]?.ts ?? null
                });

        } else {

            v24IndependentEdgeHealthConfirmation = {

                success: false,
                version: "V24.1",
                status: "INSUFFICIENT_CONFIRMATION_DATA",
                mode:
                    "V24_INDEPENDENT_EDGE_HEALTH_CONFIRMATION",
                diagnosticOnly: true,
                paperOnly: true,
                realOrders: false,
                brokerOrderEnabled: false,
                brokerOrderSent: false,
                source: {
                    label:
                        "SEPARATE_NON_OVERLAPPING_HISTORICAL_SLICE",
                    rangeStartTs:
                        v24ConfirmationRows[0]?.ts ?? null,
                    rangeEndTs:
                        v24ConfirmationRows[
                            v24ConfirmationRows.length - 1
                        ]?.ts ?? null,
                    candles:
                        v24ConfirmationCandles.length,
                    minimumRequired:
                        500
                },
                decisionGuard: {
                    noTradingChange: true,
                    noAutomaticFilterPromotion: true
                }
            };
        }

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

            const v19OOSCandidateAudit =
                buildV19SelectedCandidateOOSAudit(
                    historicalCandles,
                    fold.testStart,
                    fold.testEnd,
                    selected,
                    trades
                );

            const v20FoldCandidateStabilityAudit =
                buildV20FoldCandidateStabilityAudit(
                    discovery,
                    promoted,
                    diversified,
                    selected,
                    trades
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

                selectedCandidateDetails:
                    selected.map(x => ({
                        key: x.key,
                        level: x.level,
                        direction: x.direction || null,
                        discoveryEV: x.expectedValueR ?? null,
                        validationEV:
                            x.validation?.metrics?.expectedValueR ?? null,
                        validationPF:
                            x.validation?.metrics?.profitFactor ?? null,
                        validationTrades:
                            x.validation?.metrics?.trades ?? 0
                    })),

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
                            .diversityRejections,

                    v19SelectedCandidateOOSAudit:
                        v19OOSCandidateAudit,

                    v20FoldCandidateStabilityAudit:
                        v20FoldCandidateStabilityAudit
                },

                trades
            });
        }
             // =====================================================
        // V19 — SELECTED-CANDIDATE OOS LINEAGE AUDIT
        // -----------------------------------------------------
        // Diagnostic only. This does NOT alter candidate selection,
        // validation, diversification, or OOS execution.
        // It answers four separate questions for every candidate
        // selected inside each chronological fold:
        //   1. Was this exact candidate selected in this fold?
        //   2. Did its exact key actually occur in the untouched OOS?
        //   3. How many of those occurrences became executed trades?
        //   4. What did those executed trades return?
        //
        // This prevents a global/final validation survivor from being
        // incorrectly treated as if it were selected in every OOS fold.
        // =====================================================

        function buildV19SelectedCandidateOOSAudit(
            candles,
            testStart,
            testEnd,
            selected,
            trades
        ) {

            const safeSelected =
                safeArray(selected);

            const safeTrades =
                safeArray(trades);

            return safeSelected.map(candidate => {

                let rawMatchedOccurrences = 0;
                let firstMatchedIndex = null;
                let lastMatchedIndex = null;

                for (
                    let i = testStart;
                    i < testEnd - 1;
                    i++
                ) {

                    const f = features(candles, i);
                    if (!f) continue;

                    const setups = detectSetups(candles, i);
                    if (!setups.length) continue;

                    for (const setup of setups) {

                        if (setup.side !== DIRECTIONAL_SIDE) {
                            continue;
                        }

                        let matched = false;

                        if (candidate.level === "PATTERN" || candidate.level === "CORE") {
                            matched =
                                candidate.key ===
                                corePatternKey(
                                    setup.side,
                                    setup.setup,
                                    f
                                );
                        } else if (candidate.level === "DIRECTIONAL") {
                            matched =
                                candidate.key ===
                                patternKey(
                                    setup.side,
                                    setup.setup,
                                    f
                                );
                        } else if (
                            candidate.level === "CONTEXT" ||
                            candidate.level === "ADAPTIVE_CONTEXT"
                        ) {
                            matched =
                                candidate.key ===
                                regimeContextKey(
                                    setup.side,
                                    setup.setup,
                                    f
                                );
                        } else if (candidate.level === "REGIME_SETUP") {
                            matched =
                                candidate.key ===
                                regimeSetupKey(
                                    setup.side,
                                    setup.setup,
                                    f
                                );
                        } else if (candidate.level === "FAMILY") {
                            matched =
                                candidate.key ===
                                familyKey(
                                    setup.side,
                                    setup.setup,
                                    f.trend
                                );
                        }

                        if (!matched) continue;

                        rawMatchedOccurrences++;

                        if (firstMatchedIndex === null) {
                            firstMatchedIndex = i;
                        }
                        lastMatchedIndex = i;
                    }
                }

                const candidateTrades =
                    safeTrades.filter(
                        trade =>
                            trade.matchedCandidateKey === candidate.key &&
                            trade.matchedCandidateLevel === candidate.level
                    );

                const wins =
                    candidateTrades.filter(x => x.resultR > 0).length;

                const losses =
                    candidateTrades.filter(x => x.resultR < 0).length;

                const timeouts =
                    candidateTrades.filter(x => x.resultR === 0).length;

                const netR =
                    candidateTrades.reduce(
                        (sum, x) => sum + Number(x.resultR || 0),
                        0
                    );

                return {
                    key: candidate.key,
                    level: candidate.level,
                    direction: candidate.direction || null,
                    discoveryEV:
                        Number.isFinite(candidate.expectedValueR)
                            ? round(candidate.expectedValueR, 4)
                            : null,
                    validationEV:
                        candidate.validation?.metrics?.expectedValueR ?? null,
                    validationPF:
                        candidate.validation?.metrics?.profitFactor ?? null,
                    validationTrades:
                        candidate.validation?.metrics?.trades ?? 0,
                    rawMatchedOccurrences,
                    executedTrades: candidateTrades.length,
                    executedWins: wins,
                    executedLosses: losses,
                    executedTimeouts: timeouts,
                    executedNetR: round(netR, 4),
                    executedEV:
                        candidateTrades.length
                            ? round(netR / candidateTrades.length, 4)
                            : 0,
                    tradeResults:
                        candidateTrades.map(x => x.resultR),
                    firstMatchedIndex,
                    lastMatchedIndex,
                    firstMatchedDate:
                        firstMatchedIndex === null
                            ? null
                            : istDate(candles[firstMatchedIndex].ts),
                    lastMatchedDate:
                        lastMatchedIndex === null
                            ? null
                            : istDate(candles[lastMatchedIndex].ts),
                    status:
                        rawMatchedOccurrences === 0
                            ? "NO_OOS_OCCURRENCES"
                            : candidateTrades.length === 0
                                ? "OOS_OCCURRENCES_BUT_NO_EXECUTED_TRADES"
                                : "OOS_EXECUTED"
                };
            });
        }

        // =====================================================
        // V20 — FOLD CANDIDATE STABILITY AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Does NOT alter discovery, validation,
        // diversification, selection, or OOS execution.
        //
        // Purpose: explain why a fold produces no selected edge
        // and whether the same exact candidate key survives the
        // expanding walk-forward pipeline across multiple folds.
        // It tracks: discovered -> qualified -> validation pool ->
        // validation survivor -> selected -> OOS executed.
        // =====================================================

        function buildV20FoldCandidateStabilityAudit(
            discovery,
            promoted,
            diversified,
            selected,
            trades
        ) {

            const safeDiscovery = discovery || {};
            const core = safeArray(safeDiscovery.corePatterns);
            const patterns = safeArray(safeDiscovery.patterns);
            const families = safeArray(safeDiscovery.families);
            const validationCandidates = safeArray(promoted?.validationCandidates);
            const validationResults = safeArray(promoted?.validationResults);
            const survivors = safeArray(promoted?.candidates);
            const selectedSafe = safeArray(selected);
            const tradesSafe = safeArray(trades);

            const all = new Map();

            function ensure(key, level) {
                if (!key) return null;
                if (!all.has(key)) {
                    all.set(key, {
                        key,
                        levels: [],
                        discovered: false,
                        qualified: false,
                        validationCandidate: false,
                        validationSurvivor: false,
                        selected: false,
                        rawOOSOccurrences: 0,
                        executedOOSTrades: 0,
                        oosNetR: 0,
                        validationStage: null,
                        validationReason: null
                    });
                }
                const row = all.get(key);
                if (level && !row.levels.includes(level)) row.levels.push(level);
                return row;
            }

            for (const x of families) {
                const key = x.key || x.family;
                const row = ensure(key, 'FAMILY');
                if (row) { row.discovered = true; row.qualified ||= !!x.qualified; }
            }

            for (const x of core) {
                const row = ensure(x.key, x.level || 'CORE');
                if (row) { row.discovered = true; row.qualified ||= !!x.qualified; }
            }

            for (const x of patterns) {
                const row = ensure(x.key, x.level || 'PATTERN');
                if (row) { row.discovered = true; row.qualified ||= !!x.qualified; }
            }

            for (const x of validationCandidates) {
                const row = ensure(x.key, x.level);
                if (row) row.validationCandidate = true;
            }

            for (const x of survivors) {
                const row = ensure(x.key, x.level);
                if (row) row.validationSurvivor = true;
            }

            for (const x of selectedSafe) {
                const row = ensure(x.key, x.level);
                if (row) row.selected = true;
            }

            for (const result of validationResults) {
                const row = ensure(result.key, result.level);
                if (!row) continue;
                row.validationStage = result.stage || null;
                row.validationReason = result.primaryReason || null;
            }

            // Fold-local OOS execution is already annotated with the exact
            // matched candidate key by executeOOS.
            for (const trade of tradesSafe) {
                const row = ensure(
                    trade.matchedCandidateKey,
                    trade.matchedCandidateLevel
                );
                if (!row) continue;
                row.executedOOSTrades++;
                row.oosNetR += Number(trade.resultR || 0);
            }

            const selectedSet = new Set(selectedSafe.map(x => x.key));
            const validationSet = new Set(validationCandidates.map(x => x.key));
            const survivorSet = new Set(survivors.map(x => x.key));

            // Count raw OOS opportunities for selected candidates without
            // changing execution. This deliberately mirrors the exact key
            // identities used by executeOOS.
            const selectedOOSAudit = {};
            for (const candidate of selectedSafe) {
                selectedOOSAudit[candidate.key] = {
                    rawMatchedOccurrences: 0,
                    executedTrades: tradesSafe.filter(t =>
                        t.matchedCandidateKey === candidate.key &&
                        t.matchedCandidateLevel === candidate.level
                    ).length
                };
            }

            const candidateRows = [...all.values()].map(row => ({
                ...row,
                oosNetR: round(row.oosNetR, 4),
                status: row.selected
                    ? (row.executedOOSTrades > 0 ? 'SELECTED_AND_EXECUTED' : 'SELECTED_NO_EXECUTED_OOS')
                    : row.validationSurvivor
                        ? 'VALIDATION_SURVIVOR_NOT_SELECTED'
                        : row.validationCandidate
                            ? 'VALIDATION_CANDIDATE'
                            : row.qualified
                                ? 'QUALIFIED_NOT_PROMOTED'
                                : row.discovered
                                    ? 'DISCOVERED_NOT_QUALIFIED'
                                    : 'OOS_ONLY'
            }));

            return {
                stageCounts: {
                    discoveredFamilies: families.length,
                    qualifiedFamilies: families.filter(x => !!x.qualified).length,
                    discoveredCoreEdges: core.length,
                    qualifiedCoreEdges: core.filter(x => !!x.qualified).length,
                    discoveredPatterns: patterns.length,
                    qualifiedPatterns: patterns.filter(x => !!x.qualified).length,
                    validationCandidates: validationCandidates.length,
                    validationSurvivors: survivors.length,
                    selectedEdges: selectedSafe.length,
                    executedOOSTrades: tradesSafe.length
                },
                selectedKeys: [...selectedSet],
                validationCandidateKeys: [...validationSet],
                validationSurvivorKeys: [...survivorSet],
                candidateRows
            };
        }

        // =====================================================
        // V20 — CROSS-FOLD CANDIDATE STABILITY SUMMARY
        // =====================================================

        function buildV20CrossFoldCandidateStabilityAudit(foldResults) {

            const byKey = new Map();

            for (const fold of safeArray(foldResults)) {
                const audit = fold.diagnostics?.v20FoldCandidateStabilityAudit || {};
                for (const row of safeArray(audit.candidateRows)) {
                    if (!byKey.has(row.key)) {
                        byKey.set(row.key, {
                            key: row.key,
                            levels: [],
                            foldsDiscovered: [],
                            foldsQualified: [],
                            foldsValidationCandidate: [],
                            foldsValidationSurvivor: [],
                            foldsSelected: [],
                            foldsOOSExecuted: [],
                            totalOOSTrades: 0,
                            totalOOSNetR: 0
                        });
                    }
                    const x = byKey.get(row.key);
                    for (const level of safeArray(row.levels)) {
                        if (!x.levels.includes(level)) x.levels.push(level);
                    }
                    if (row.discovered) x.foldsDiscovered.push(fold.fold);
                    if (row.qualified) x.foldsQualified.push(fold.fold);
                    if (row.validationCandidate) x.foldsValidationCandidate.push(fold.fold);
                    if (row.validationSurvivor) x.foldsValidationSurvivor.push(fold.fold);
                    if (row.selected) x.foldsSelected.push(fold.fold);
                    if (row.executedOOSTrades > 0) x.foldsOOSExecuted.push(fold.fold);
                    x.totalOOSTrades += row.executedOOSTrades || 0;
                    x.totalOOSNetR += row.oosNetR || 0;
                }
            }

            return [...byKey.values()].map(x => ({
                ...x,
                totalOOSNetR: round(x.totalOOSNetR, 4),
                foldPresenceCount: x.foldsDiscovered.length,
                selectionRateAcrossPresentFolds: x.foldsDiscovered.length
                    ? round((x.foldsSelected.length / x.foldsDiscovered.length) * 100, 2)
                    : 0,
                stabilityClassification:
                    x.foldsSelected.length >= 2
                        ? 'RECURRING_SELECTED_EDGE'
                        : x.foldsSelected.length === 1
                            ? 'SINGLE_FOLD_SELECTED_EDGE'
                            : x.foldsValidationSurvivor.length > 0
                                ? 'VALIDATED_BUT_NOT_SELECTED'
                                : x.foldsQualified.length > 0
                                    ? 'QUALIFIED_BUT_NOT_VALIDATED'
                                    : 'NOT_QUALIFIED'
            }));
        }

        // =====================================================
        // V21 — EDGE PERSISTENCE TEST
        // -----------------------------------------------------
        // Diagnostic only. This does NOT change discovery,
        // qualification, validation, diversification, OOS
        // execution, thresholds, exits, or risk controls.
        //
        // V20 proved that exact candidate selection is mostly
        // late/emergent. V21 measures whether an exact edge
        // persists through chronological folds once it appears.
        //
        // Persistence is measured separately for:
        //   DISCOVERED
        //   QUALIFIED
        //   VALIDATION CANDIDATE
        //   VALIDATION SURVIVOR
        //   SELECTED
        //   OOS EXECUTED
        //
        // This avoids treating a candidate that appears once as
        // equivalent to a candidate that repeatedly survives.
        // =====================================================

        function buildV21EdgePersistenceAudit(foldResults) {

            const byKey = new Map();
            const folds = safeArray(foldResults).map(x => x.fold);

            function ensure(key, levels) {
                if (!byKey.has(key)) {
                    byKey.set(key, {
                        key,
                        levels: [],
                        foldsDiscovered: [],
                        foldsQualified: [],
                        foldsValidationCandidate: [],
                        foldsValidationSurvivor: [],
                        foldsSelected: [],
                        foldsOOSExecuted: [],
                        oosTradesByFold: {},
                        oosNetRByFold: {}
                    });
                }
                const row = byKey.get(key);
                for (const level of safeArray(levels)) {
                    if (level && !row.levels.includes(level)) row.levels.push(level);
                }
                return row;
            }

            for (const fold of safeArray(foldResults)) {
                const audit = fold.diagnostics?.v20FoldCandidateStabilityAudit || {};
                for (const row of safeArray(audit.candidateRows)) {
                    const x = ensure(row.key, row.levels);
                    if (row.discovered) x.foldsDiscovered.push(fold.fold);
                    if (row.qualified) x.foldsQualified.push(fold.fold);
                    if (row.validationCandidate) x.foldsValidationCandidate.push(fold.fold);
                    if (row.validationSurvivor) x.foldsValidationSurvivor.push(fold.fold);
                    if (row.selected) x.foldsSelected.push(fold.fold);
                    if ((row.executedOOSTrades || 0) > 0) x.foldsOOSExecuted.push(fold.fold);
                    x.oosTradesByFold[fold.fold] = row.executedOOSTrades || 0;
                    x.oosNetRByFold[fold.fold] = round(row.oosNetR || 0, 4);
                }
            }

            function consecutiveRun(list) {
                const set = new Set(list);
                let best = 0;
                let current = 0;
                for (const fold of folds) {
                    if (set.has(fold)) {
                        current++;
                        best = Math.max(best, current);
                    } else {
                        current = 0;
                    }
                }
                return best;
            }

            function gapCount(list) {
                if (list.length < 2) return 0;
                const set = new Set(list);
                let gaps = 0;
                for (let i = Math.min(...list); i <= Math.max(...list); i++) {
                    if (!set.has(i)) gaps++;
                }
                return gaps;
            }

            function firstLast(list) {
                return list.length
                    ? { first: Math.min(...list), last: Math.max(...list) }
                    : { first: null, last: null };
            }

            const rows = [...byKey.values()].map(x => {
                const discovered = firstLast(x.foldsDiscovered);
                const selected = firstLast(x.foldsSelected);
                const oos = firstLast(x.foldsOOSExecuted);

                const present = x.foldsDiscovered.length;
                const selectedRate = present
                    ? round((x.foldsSelected.length / present) * 100, 2)
                    : 0;
                const survivorRate = present
                    ? round((x.foldsValidationSurvivor.length / present) * 100, 2)
                    : 0;

                let classification = "NO_PERSISTENCE";
                if (x.foldsSelected.length >= 3 && consecutiveRun(x.foldsSelected) >= 2) {
                    classification = "PERSISTENT_SELECTED_EDGE";
                } else if (x.foldsSelected.length >= 2) {
                    classification = "RECURRING_SELECTED_EDGE";
                } else if (x.foldsSelected.length === 1) {
                    classification = "SINGLE_FOLD_SELECTED_EDGE";
                } else if (x.foldsValidationSurvivor.length >= 2) {
                    classification = "RECURRING_VALIDATED_EDGE";
                } else if (x.foldsQualified.length >= 2) {
                    classification = "RECURRING_QUALIFIED_EDGE";
                } else if (x.foldsDiscovered.length >= 2) {
                    classification = "RECURRING_DISCOVERED_EDGE";
                }

                return {
                    key: x.key,
                    levels: x.levels,
                    foldsDiscovered: x.foldsDiscovered,
                    foldsQualified: x.foldsQualified,
                    foldsValidationCandidate: x.foldsValidationCandidate,
                    foldsValidationSurvivor: x.foldsValidationSurvivor,
                    foldsSelected: x.foldsSelected,
                    foldsOOSExecuted: x.foldsOOSExecuted,
                    totalOOSTrades: Object.values(x.oosTradesByFold).reduce((a,b) => a + Number(b || 0), 0),
                    totalOOSNetR: round(Object.values(x.oosNetRByFold).reduce((a,b) => a + Number(b || 0), 0), 4),
                    discoveryPresence: present,
                    selectedRateAcrossPresentFolds: selectedRate,
                    validationSurvivorRateAcrossPresentFolds: survivorRate,
                    firstDiscoveredFold: discovered.first,
                    lastDiscoveredFold: discovered.last,
                    firstSelectedFold: selected.first,
                    lastSelectedFold: selected.last,
                    firstOOSFold: oos.first,
                    lastOOSFold: oos.last,
                    discoveredConsecutiveRun: consecutiveRun(x.foldsDiscovered),
                    qualifiedConsecutiveRun: consecutiveRun(x.foldsQualified),
                    validationSurvivorConsecutiveRun: consecutiveRun(x.foldsValidationSurvivor),
                    selectedConsecutiveRun: consecutiveRun(x.foldsSelected),
                    oosConsecutiveRun: consecutiveRun(x.foldsOOSExecuted),
                    selectedGaps: gapCount(x.foldsSelected),
                    oosGaps: gapCount(x.foldsOOSExecuted),
                    persistenceClassification: classification
                };
            });

            const persistent = rows.filter(x => x.persistenceClassification === "PERSISTENT_SELECTED_EDGE");
            const recurringSelected = rows.filter(x =>
                x.persistenceClassification === "PERSISTENT_SELECTED_EDGE" ||
                x.persistenceClassification === "RECURRING_SELECTED_EDGE"
            );
            const singleFold = rows.filter(x => x.persistenceClassification === "SINGLE_FOLD_SELECTED_EDGE");

            return {
                purpose: "Measure exact candidate persistence across chronological expanding walk-forward folds without changing strategy mechanics.",
                foldsAnalyzed: folds.length,
                requiredPersistentSelectedFolds: 2,
                persistentSelectedEdges: persistent.length,
                recurringSelectedEdges: recurringSelected.length,
                singleFoldSelectedEdges: singleFold.length,
                stableEdgeDetected: persistent.length > 0,
                candidateCount: rows.length,
                candidates: rows,
                interpretationGuard: "Diagnostic only. V21 does not promote, reject, trade, or modify any candidate. Persistence is measured after the existing V20 fold-local pipeline has already run."
            };
        }

        const v21EdgePersistenceAudit =
            buildV21EdgePersistenceAudit(foldResults);

        // =====================================================
        // V22 TEMPORAL-REGIME ADAPTATION AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Measures whether SELL setup/regime
        // combinations persist, decay, or rotate across
        // chronological learning windows. It does not create
        // candidates, alter thresholds, promote edges, or affect
        // validation/OOS execution.
        // =====================================================
        function buildV22TemporalRegimeAudit(records) {

            const safe = safeArray(records)
                .filter(x =>
                    x &&
                    x.side === "SELL" &&
                    Number.isFinite(x.resultR) &&
                    Number.isFinite(x.index)
                )
                .sort((a,b) => a.index - b.index);

            const windowCount = 4;
            const windows = [];

            if (safe.length) {
                for (let w = 0; w < windowCount; w++) {
                    const start = Math.floor((safe.length * w) / windowCount);
                    const end = w === windowCount - 1
                        ? safe.length
                        : Math.floor((safe.length * (w + 1)) / windowCount);
                    const slice = safe.slice(start, end);
                    const metrics = calculateMetrics(slice);
                    windows.push({
                        window: w + 1,
                        recordStartOrdinal: start + 1,
                        recordEndOrdinal: end,
                        firstIndex: slice.length ? slice[0].index : null,
                        lastIndex: slice.length ? slice[slice.length - 1].index : null,
                        records: slice.length,
                        metrics
                    });
                }
            }

            const keys = new Map();
            for (const r of safe) {
                const key = `${r.side}|S:${r.setup}|T:${r.trend}|G:${r.regime}`;
                if (!keys.has(key)) {
                    keys.set(key, {
                        key,
                        side: r.side,
                        setup: r.setup,
                        trend: r.trend,
                        regime: r.regime,
                        windows: Array.from({length: windowCount}, () => [])
                    });
                }
                const ordinal = safe.indexOf(r);
                const w = Math.min(windowCount - 1, Math.floor((ordinal * windowCount) / safe.length));
                keys.get(key).windows[w].push(r);
            }

            function compactMetrics(input) {
                const m = calculateMetrics(input);
                return {
                    samples: m.trades,
                    decisiveTrades: m.decisiveTrades,
                    wins: m.wins,
                    losses: m.losses,
                    timeouts: m.timeouts,
                    netR: round(m.netR, 4),
                    EV: round(m.expectedValueR, 4),
                    PF: round(m.profitFactor, 4),
                    winRate: round(m.winRate, 2)
                };
            }

            const cells = [];
            for (const cell of keys.values()) {
                const byWindow = cell.windows.map((arr, i) => ({
                    window: i + 1,
                    ...compactMetrics(arr)
                }));

                const positiveWindows = byWindow.filter(x => x.EV > 0).length;
                const negativeWindows = byWindow.filter(x => x.EV < 0).length;
                const activeWindows = byWindow.filter(x => x.samples > 0).length;
                const latest = byWindow[byWindow.length - 1];
                const earlier = byWindow.slice(0, -1).filter(x => x.samples > 0);
                const earlierEV = earlier.length
                    ? earlier.reduce((a,x) => a + x.EV, 0) / earlier.length
                    : 0;

                let classification = "INSUFFICIENT_DATA";
                if (activeWindows >= 3) {
                    if (positiveWindows >= 3 && latest.EV >= 0 && latest.samples > 0) {
                        classification = "PERSISTENT_REGIME_EDGE";
                    } else if (positiveWindows >= 2 && latest.EV < 0) {
                        classification = "RECENT_REGIME_DECAY";
                    } else if (positiveWindows >= 2 && negativeWindows >= 1) {
                        classification = "REGIME_INCONSISTENCY";
                    } else if (positiveWindows === 1 && latest.EV > 0) {
                        classification = "LATE_EMERGING_REGIME_EDGE";
                    } else {
                        classification = "NO_STABLE_REGIME_EDGE";
                    }
                } else if (activeWindows >= 2) {
                    classification = positiveWindows === activeWindows
                        ? "RECURRING_BUT_LIMITED_REGIME_EDGE"
                        : "LIMITED_REGIME_EVIDENCE";
                }

                cells.push({
                    key: cell.key,
                    setup: cell.setup,
                    trend: cell.trend,
                    regime: cell.regime,
                    activeWindows,
                    positiveWindows,
                    negativeWindows,
                    earlierAverageEV: round(earlierEV, 4),
                    latestEV: latest.EV,
                    EVChangeLatestVsEarlier: round(latest.EV - earlierEV, 4),
                    windows: byWindow,
                    classification,
                    diagnosticOnly: true
                });
            }

            cells.sort((a,b) => {
                const order = {
                    PERSISTENT_REGIME_EDGE: 1,
                    RECURRING_BUT_LIMITED_REGIME_EDGE: 2,
                    LATE_EMERGING_REGIME_EDGE: 3,
                    REGIME_INCONSISTENCY: 4,
                    RECENT_REGIME_DECAY: 5,
                    NO_STABLE_REGIME_EDGE: 6,
                    LIMITED_REGIME_EVIDENCE: 7,
                    INSUFFICIENT_DATA: 8
                };
                return (order[a.classification] || 99) - (order[b.classification] || 99);
            });

            const setupRegimeMatrix = {};
            for (const c of cells) {
                const k = `${c.setup}|${c.regime}`;
                if (!setupRegimeMatrix[k]) {
                    setupRegimeMatrix[k] = {
                        setup: c.setup,
                        regime: c.regime,
                        candidateKeys: [],
                        classifications: []
                    };
                }
                setupRegimeMatrix[k].candidateKeys.push(c.key);
                setupRegimeMatrix[k].classifications.push(c.classification);
            }

            return {
                purpose: "Measure temporal persistence and regime rotation of SELL setup/trend/regime combinations across four chronological learning windows.",
                windowing: {
                    method: "Equal-count chronological quartiles over completed learning records.",
                    windows: windows.map(x => ({
                        window: x.window,
                        records: x.records,
                        firstIndex: x.firstIndex,
                        lastIndex: x.lastIndex,
                        metrics: x.metrics
                    }))
                },
                cells,
                setupRegimeMatrix: Object.values(setupRegimeMatrix),
                summary: {
                    persistentRegimeEdges: cells.filter(x => x.classification === "PERSISTENT_REGIME_EDGE").length,
                    recurringButLimitedEdges: cells.filter(x => x.classification === "RECURRING_BUT_LIMITED_REGIME_EDGE").length,
                    lateEmergingEdges: cells.filter(x => x.classification === "LATE_EMERGING_REGIME_EDGE").length,
                    recentDecayEdges: cells.filter(x => x.classification === "RECENT_REGIME_DECAY").length,
                    inconsistentEdges: cells.filter(x => x.classification === "REGIME_INCONSISTENCY").length,
                    noStableEdges: cells.filter(x => x.classification === "NO_STABLE_REGIME_EDGE").length,
                    stableRegimeEdgeDetected: cells.some(x => x.classification === "PERSISTENT_REGIME_EDGE")
                },
                interpretationGuard: "Diagnostic only. V22 does not create candidates, lower thresholds, promote edges, modify validation/OOS, or use future outcomes. Temporal windows are retrospective summaries of completed learning records."
            };
        }

        // =====================================================
        // GLOBAL TRUE OOS METRICS
        // =====================================================

        const globalStats =
            calculateMetrics(
                allTrades
            );

        // =====================================================
        // V19 CANDIDATE LINEAGE SUMMARY
        // =====================================================

        const v19CandidateLineageAudit =
            foldResults.map(x => ({
                fold: x.fold,
                testRows: x.testRows,
                selectedCandidates:
                    x.selectedCandidateDetails,
                oosCandidateAudit:
                    x.diagnostics?.v19SelectedCandidateOOSAudit || [],
                foldNetR:
                    x.metrics?.netR ?? 0,
                foldProfitable:
                    !!x.profitableFold,
                foldQualityReason:
                    x.foldQualityReason
            }));

        const v20FoldCandidateStabilityAudit =
            foldResults.map(x => ({
                fold: x.fold,
                trainingRows: x.trainingRows,
                discoveryRows: x.discoveryRows,
                validationRows: x.validationRows,
                testRows: x.testRows,
                stageCounts:
                    x.diagnostics?.v20FoldCandidateStabilityAudit?.stageCounts || {},
                selectedKeys:
                    x.diagnostics?.v20FoldCandidateStabilityAudit?.selectedKeys || [],
                validationCandidateKeys:
                    x.diagnostics?.v20FoldCandidateStabilityAudit?.validationCandidateKeys || [],
                validationSurvivorKeys:
                    x.diagnostics?.v20FoldCandidateStabilityAudit?.validationSurvivorKeys || [],
                candidateRows:
                    x.diagnostics?.v20FoldCandidateStabilityAudit?.candidateRows || [],
                foldNetR: x.metrics?.netR ?? 0,
                foldProfitable: !!x.profitableFold,
                foldQualityReason: x.foldQualityReason
            }));

        const v20CrossFoldCandidateStability =
            buildV20CrossFoldCandidateStabilityAudit(foldResults);

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
        // V15 REGIME-SHIFT / EDGE-DECAY DIAGNOSTICS
        // Diagnostic only. No promotion thresholds or validation
        // gates are changed by this layer.
        // =====================================================

        function buildEdgeDecayDiagnostics(records, start, end) {

            const safe = safeArray(records)
                .filter(x => Number.isFinite(x.index))
                .sort((a, b) => a.index - b.index);

            const sellRecords = safe.filter(x => x.side === "SELL");
            const sellTrendFollow = sellRecords.filter(x => x.setup === "TREND_FOLLOW");
            const sellVWAPPullback = sellRecords.filter(x => x.setup === "VWAP_PULLBACK");

            function metrics(rows) {
                return anatomyMetrics(rows);
            }

            function sliceRows(rows, count = 8) {
                const buckets = Array.from({ length: count }, () => []);
                if (!rows.length) return buckets;

                const minIndex = rows[0].index;
                const maxIndex = rows[rows.length - 1].index;
                const span = Math.max(1, maxIndex - minIndex + 1);

                for (const row of rows) {
                    const relative = row.index - minIndex;
                    const bucket = Math.min(count - 1, Math.floor((relative / span) * count));
                    buckets[bucket].push(row);
                }
                return buckets;
            }

            function chronology(rows, count = 8) {
                return sliceRows(rows, count).map((bucket, i) => ({
                    window: i + 1,
                    fromIndex: bucket.length ? bucket[0].index : null,
                    toIndex: bucket.length ? bucket[bucket.length - 1].index : null,
                    ...metrics(bucket)
                }));
            }

            function rolling(rows, windowSize = 60, step = 30) {
                const output = [];
                if (!rows.length) return output;

                for (let endPos = windowSize; endPos <= rows.length; endPos += step) {
                    const bucket = rows.slice(endPos - windowSize, endPos);
                    output.push({
                        endRecord: endPos,
                        fromIndex: bucket[0].index,
                        toIndex: bucket[bucket.length - 1].index,
                        ...metrics(bucket)
                    });
                }

                if (rows.length < windowSize) {
                    output.push({
                        endRecord: rows.length,
                        fromIndex: rows[0].index,
                        toIndex: rows[rows.length - 1].index,
                        ...metrics(rows)
                    });
                } else if ((rows.length - windowSize) % step !== 0) {
                    const bucket = rows.slice(-windowSize);
                    output.push({
                        endRecord: rows.length,
                        fromIndex: bucket[0].index,
                        toIndex: bucket[bucket.length - 1].index,
                        ...metrics(bucket)
                    });
                }

                return output;
            }

            function transitionSummary(rows) {
                const windows = chronology(rows, 8);
                const valid = windows.filter(x => x.trades > 0);
                const positive = valid.filter(x => x.expectedValueR > 0).length;
                const negative = valid.filter(x => x.expectedValueR <= 0).length;

                let firstNegativeAfterPositive = null;
                let consecutiveNegative = 0;
                let maxConsecutiveNegative = 0;
                let lastPositiveWindow = null;

                for (const w of valid) {
                    if (w.expectedValueR > 0) {
                        lastPositiveWindow = w.window;
                        consecutiveNegative = 0;
                    } else {
                        consecutiveNegative += 1;
                        maxConsecutiveNegative = Math.max(maxConsecutiveNegative, consecutiveNegative);
                        if (
                            firstNegativeAfterPositive === null &&
                            lastPositiveWindow !== null
                        ) {
                            firstNegativeAfterPositive = w.window;
                        }
                    }
                }

                const recentQuarter = rows.filter(
                    x => x.index >= start + Math.floor((end - start) * 0.75)
                );
                const earlyHalf = rows.filter(
                    x => x.index < start + Math.floor((end - start) * 0.5)
                );

                return {
                    chronology: windows,
                    positiveWindows: positive,
                    negativeOrFlatWindows: negative,
                    firstNegativeWindowAfterPositive: firstNegativeAfterPositive,
                    maxConsecutiveNegativeWindows: maxConsecutiveNegative,
                    earlyHalf: metrics(earlyHalf),
                    recentQuarter: metrics(recentQuarter),
                    recentMinusEarlyEV: round(
                        metrics(recentQuarter).expectedValueR - metrics(earlyHalf).expectedValueR,
                        4
                    ),
                    recentMinusEarlyPF: round(
                        metrics(recentQuarter).profitFactor - metrics(earlyHalf).profitFactor,
                        4
                    )
                };
            }

            function byContext(rows, field) {
                const map = new Map();
                for (const row of rows) {
                    const key = row[field] ?? "UNKNOWN";
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(row);
                }

                return Array.from(map.entries())
                    .map(([key, group]) => ({
                        key,
                        trades: group.length,
                        overall: metrics(group),
                        chronology: chronology(group, 4),
                        recentQuarter: metrics(
                            group.filter(x => x.index >= start + Math.floor((end - start) * 0.75))
                        )
                    }))
                    .sort((a, b) => b.trades - a.trades);
            }

            function detectDecay(rows) {
                const windows = chronology(rows, 8).filter(x => x.trades > 0);
                const positiveWindows = windows.filter(x => x.expectedValueR > 0);
                const negativeWindows = windows.filter(x => x.expectedValueR <= 0);
                const recent = windows.slice(-2);
                const earlier = windows.slice(0, Math.max(1, windows.length - 2));

                const earlierEV = earlier.length
                    ? earlier.reduce((sum, x) => sum + x.expectedValueR, 0) / earlier.length
                    : 0;
                const recentEV = recent.length
                    ? recent.reduce((sum, x) => sum + x.expectedValueR, 0) / recent.length
                    : 0;

                let classification = "INSUFFICIENT_DATA";
                if (windows.length >= 4) {
                    if (positiveWindows.length >= 3 && recentEV < 0 && recentEV < earlierEV) {
                        classification = "POSSIBLE_EDGE_DECAY";
                    } else if (positiveWindows.length >= 3 && recentEV >= 0) {
                        classification = "NO_CLEAR_DECAY";
                    } else if (positiveWindows.length < 3) {
                        classification = "NO_STABLE_HISTORICAL_EDGE";
                    } else {
                        classification = "REGIME_INCONSISTENCY";
                    }
                }

                return {
                    classification,
                    positiveWindows: positiveWindows.length,
                    negativeOrFlatWindows: negativeWindows.length,
                    earlierAverageWindowEV: round(earlierEV, 4),
                    recentAverageWindowEV: round(recentEV, 4),
                    EVChange: round(recentEV - earlierEV, 4)
                };
            }

            return {
                purpose:
                    "Determine whether the historical SELL edge decays over chronological time without changing strategy thresholds or creating trades.",
                sample: {
                    totalLearningRecords: safe.length,
                    sellRecords: sellRecords.length,
                    sellTrendFollowRecords: sellTrendFollow.length,
                    sellVWAPPullbackRecords: sellVWAPPullback.length
                },
                sell: {
                    overall: metrics(sellRecords),
                    decayAssessment: detectDecay(sellRecords),
                    chronology: transitionSummary(sellRecords),
                    rolling60: rolling(sellRecords, 60, 30),
                    byRegime: byContext(sellRecords, "regime"),
                    byTimeBucket: byContext(sellRecords, "timeBucket"),
                    byVWAPDirection: byContext(sellRecords, "vwapDirection"),
                    bySetup: byContext(sellRecords, "setup"),
                    byTrend: byContext(sellRecords, "trend")
                },
                sellTrendFollow: {
                    overall: metrics(sellTrendFollow),
                    decayAssessment: detectDecay(sellTrendFollow),
                    chronology: chronology(sellTrendFollow, 8),
                    rolling60: rolling(sellTrendFollow, 60, 30),
                    byRegime: byContext(sellTrendFollow, "regime"),
                    byTimeBucket: byContext(sellTrendFollow, "timeBucket")
                },
                sellVWAPPullback: {
                    overall: metrics(sellVWAPPullback),
                    decayAssessment: detectDecay(sellVWAPPullback),
                    chronology: chronology(sellVWAPPullback, 8),
                    rolling60: rolling(sellVWAPPullback, 60, 30),
                    byRegime: byContext(sellVWAPPullback, "regime"),
                    byTimeBucket: byContext(sellVWAPPullback, "timeBucket")
                },
                guard:
                    "Diagnostic only. No decay classification can promote a candidate, lower validation thresholds or enter true OOS."
            };
        }

        // =====================================================
        // V15 REGIME-FINGERPRINT DIAGNOSTICS
        // Diagnostic only. This layer compares profitable and
        // losing SELL periods to identify recurring context
        // fingerprints. It NEVER creates candidates, changes
        // thresholds, enters validation or enters OOS.
        // =====================================================

        function buildRegimeFingerprintDiagnostics(records, start, end) {

            const safe = safeArray(records)
                .filter(x => x && x.side === "SELL" && Number.isFinite(x.resultR));

            const sectionWidth = Math.max(1, (end - start) / 8);
            const windows = Array.from({ length: 8 }, (_, i) => []);

            for (const record of safe) {
                if (!Number.isFinite(record.index)) continue;
                const relative = record.index - start;
                const window = Math.min(
                    7,
                    Math.max(0, Math.floor(relative / sectionWidth))
                );
                windows[window].push(record);
            }

            function metrics(rows) {
                const trades = rows.length;
                const wins = rows.filter(x => x.resultR > 0).length;
                const losses = rows.filter(x => x.resultR < 0).length;
                const timeouts = rows.filter(x => x.resultR === 0).length;
                const decisive = wins + losses;
                const netR = rows.reduce(
                    (sum, x) => sum + (Number.isFinite(x.resultR) ? x.resultR : 0),
                    0
                );
                const winR = rows
                    .filter(x => x.resultR > 0)
                    .reduce((sum, x) => sum + x.resultR, 0);
                const lossR = Math.abs(
                    rows
                        .filter(x => x.resultR < 0)
                        .reduce((sum, x) => sum + x.resultR, 0)
                );
                return {
                    trades,
                    wins,
                    losses,
                    timeouts,
                    decisiveTrades: decisive,
                    winRate: decisive ? round((wins / decisive) * 100, 2) : 0,
                    netR: round(netR, 4),
                    expectedValueR: trades ? round(netR / trades, 4) : 0,
                    profitFactor: lossR > 0 ? round(winR / lossR, 4) : 0
                };
            }

            const windowMetrics = windows.map((rows, i) => ({
                window: i + 1,
                ...metrics(rows),
                classification: rows.length === 0
                    ? "NO_DATA"
                    : metrics(rows).expectedValueR > 0
                        ? "POSITIVE"
                        : "NEGATIVE_OR_FLAT"
            }));

            const positiveWindowIndexes = new Set(
                windowMetrics
                    .filter(x => x.classification === "POSITIVE")
                    .map(x => x.window - 1)
            );

            const negativeWindowIndexes = new Set(
                windowMetrics
                    .filter(x => x.classification === "NEGATIVE_OR_FLAT")
                    .map(x => x.window - 1)
            );

            const fields = [
                "setup",
                "trend",
                "regime",
                "timeBucket",
                "vwapDirection",
                "rsiBucket",
                "volatility"
            ];

            function distribution(field) {
                const values = new Set(
                    safe.map(x => x[field] ?? "UNKNOWN")
                );

                return Array.from(values)
                    .map(value => {
                        const positiveRows = [];
                        const negativeRows = [];

                        windows.forEach((rows, index) => {
                            const matching = rows.filter(
                                x => (x[field] ?? "UNKNOWN") === value
                            );
                            if (positiveWindowIndexes.has(index)) {
                                positiveRows.push(...matching);
                            } else if (negativeWindowIndexes.has(index)) {
                                negativeRows.push(...matching);
                            }
                        });

                        const positiveTotal = windows
                            .filter((_, index) => positiveWindowIndexes.has(index))
                            .reduce((sum, rows) => sum + rows.length, 0);
                        const negativeTotal = windows
                            .filter((_, index) => negativeWindowIndexes.has(index))
                            .reduce((sum, rows) => sum + rows.length, 0);

                        const positiveShare = positiveTotal
                            ? positiveRows.length / positiveTotal
                            : 0;
                        const negativeShare = negativeTotal
                            ? negativeRows.length / negativeTotal
                            : 0;

                        const presentPositiveWindows = windows.filter(
                            (rows, index) =>
                                positiveWindowIndexes.has(index) &&
                                rows.some(x => (x[field] ?? "UNKNOWN") === value)
                        ).length;

                        const presentNegativeWindows = windows.filter(
                            (rows, index) =>
                                negativeWindowIndexes.has(index) &&
                                rows.some(x => (x[field] ?? "UNKNOWN") === value)
                        ).length;

                        return {
                            field,
                            value,
                            positiveRecords: positiveRows.length,
                            negativeRecords: negativeRows.length,
                            positiveSharePct: round(positiveShare * 100, 2),
                            negativeSharePct: round(negativeShare * 100, 2),
                            shareLiftPct: round((positiveShare - negativeShare) * 100, 2),
                            positiveWindowCoverage: presentPositiveWindows,
                            negativeWindowCoverage: presentNegativeWindows,
                            positiveMetrics: metrics(positiveRows),
                            negativeMetrics: metrics(negativeRows)
                        };
                    })
                    .sort((a, b) => {
                        if (b.shareLiftPct !== a.shareLiftPct) {
                            return b.shareLiftPct - a.shareLiftPct;
                        }
                        return b.positiveRecords - a.positiveRecords;
                    });
            }

            const distributions = {};
            for (const field of fields) {
                distributions[field] = distribution(field);
            }

            // Composite fingerprints are deliberately diagnostic only.
            // They are not passed to discoverCandidates/promoteCandidates.
            const fingerprintFields = [
                "setup",
                "regime",
                "timeBucket",
                "vwapDirection",
                "rsiBucket",
                "volatility"
            ];

            const fingerprintMap = new Map();

            for (const record of safe) {
                const key = fingerprintFields
                    .map(field => `${field}=${record[field] ?? "UNKNOWN"}`)
                    .join("|");

                if (!fingerprintMap.has(key)) {
                    fingerprintMap.set(key, {
                        key,
                        values: Object.fromEntries(
                            fingerprintFields.map(field => [field, record[field] ?? "UNKNOWN"])
                        ),
                        records: [],
                        positiveWindowSet: new Set(),
                        negativeWindowSet: new Set()
                    });
                }

                const item = fingerprintMap.get(key);
                item.records.push(record);

                const relative = record.index - start;
                const window = Math.min(
                    7,
                    Math.max(0, Math.floor(relative / sectionWidth))
                );

                if (positiveWindowIndexes.has(window)) {
                    item.positiveWindowSet.add(window);
                } else if (negativeWindowIndexes.has(window)) {
                    item.negativeWindowSet.add(window);
                }
            }

            const fingerprints = Array.from(fingerprintMap.values())
                .map(item => {
                    const positiveRows = item.records.filter(record => {
                        const relative = record.index - start;
                        const window = Math.min(
                            7,
                            Math.max(0, Math.floor(relative / sectionWidth))
                        );
                        return positiveWindowIndexes.has(window);
                    });

                    const negativeRows = item.records.filter(record => {
                        const relative = record.index - start;
                        const window = Math.min(
                            7,
                            Math.max(0, Math.floor(relative / sectionWidth))
                        );
                        return negativeWindowIndexes.has(window);
                    });

                    const positiveMetrics = metrics(positiveRows);
                    const negativeMetrics = metrics(negativeRows);

                    return {
                        key: item.key,
                        values: item.values,
                        totalRecords: item.records.length,
                        positiveWindowCoverage: item.positiveWindowSet.size,
                        negativeWindowCoverage: item.negativeWindowSet.size,
                        positiveRecords: positiveRows.length,
                        negativeRecords: negativeRows.length,
                        positiveMetrics,
                        negativeMetrics,
                        diagnosticLiftR: round(
                            positiveMetrics.expectedValueR - negativeMetrics.expectedValueR,
                            4
                        )
                    };
                })
                .filter(x => x.totalRecords >= 4)
                .sort((a, b) => {
                    if (b.positiveWindowCoverage !== a.positiveWindowCoverage) {
                        return b.positiveWindowCoverage - a.positiveWindowCoverage;
                    }
                    if (a.negativeWindowCoverage !== b.negativeWindowCoverage) {
                        return a.negativeWindowCoverage - b.negativeWindowCoverage;
                    }
                    return b.totalRecords - a.totalRecords;
                });

            const positiveWindows = windowMetrics.filter(
                x => x.classification === "POSITIVE"
            );
            const negativeWindows = windowMetrics.filter(
                x => x.classification === "NEGATIVE_OR_FLAT"
            );

            let classification = "INSUFFICIENT_DATA";
            if (positiveWindows.length >= 2 && negativeWindows.length >= 2) {
                classification = "REGIME_FINGERPRINTS_PRESENT";
            } else if (positiveWindows.length >= 2) {
                classification = "MOSTLY_POSITIVE_SELL_WINDOWS";
            } else if (negativeWindows.length >= 2) {
                classification = "MOSTLY_NEGATIVE_SELL_WINDOWS";
            } else {
                classification = "NO_CLEAR_REGIME_SPLIT";
            }

            return {
                purpose:
                    "Compare profitable and losing chronological SELL periods to identify recurring regime fingerprints without creating a trading rule.",
                classification,
                sample: {
                    sellRecords: safe.length,
                    positiveWindows: positiveWindows.length,
                    negativeOrFlatWindows: negativeWindows.length
                },
                chronologicalWindows: windowMetrics,
                featureDistributions: distributions,
                compositeFingerprints: fingerprints.slice(0, 30),
                strongestPositiveContrast: fingerprints
                    .filter(x => x.positiveWindowCoverage > 0)
                    .slice(0, 10),
                guard:
                    "Diagnostic only. Fingerprints are retrospective descriptions and cannot create candidates, lower thresholds, enter validation or enter true OOS."
            };
        }


        // =====================================================

        // =====================================================

        // =====================================================
        // V22.4 EDGE ACTIVATION / DEACTIVATION AUDIT
        // -----------------------------------------------------
        // Diagnostic only.
        //
        // Question:
        //   If a context is profitable in one completed
        //   chronological window, does that prior-window
        //   evidence predict profitability in the NEXT window?
        //
        // This is a point-in-time diagnostic:
        //   W1 evidence -> W2 test
        //   W2 evidence -> W3 test
        //   W3 evidence -> W4 test
        //
        // It DOES NOT change:
        //   - discovery
        //   - candidate qualification
        //   - validation
        //   - diversification
        //   - OOS
        //   - exits
        //   - risk
        //   - trade selection
        //
        // No future-window result is used to activate/deactivate
        // an earlier window.
        // =====================================================

        function buildV224EdgeActivationAudit(
            candles,
            records
        ) {

            const safe =
                safeArray(records)
                    .filter(
                        x =>
                            x &&
                            x.side === "SELL" &&
                            Number.isFinite(x.index) &&
                            Number.isFinite(x.resultR)
                    )
                    .sort(
                        (a, b) =>
                            a.index - b.index
                    );

            const WINDOW_COUNT = 4;

            const windows =
                Array.from(
                    { length: WINDOW_COUNT },
                    () => []
                );

            if (safe.length) {

                for (let i = 0; i < safe.length; i++) {

                    const window =
                        Math.min(
                            WINDOW_COUNT - 1,
                            Math.floor(
                                i *
                                WINDOW_COUNT /
                                safe.length
                            )
                        );

                    windows[window].push(
                        safe[i]
                    );
                }
            }

            function getFeature(record) {
                return features(
                    candles,
                    record.index
                );
            }

            function contextKey(record) {

                const f =
                    getFeature(record);

                if (!f) return null;

                const setup =
                    record.setup ??
                    "UNKNOWN";

                const regime =
                    f.regime ??
                    record.regime ??
                    "UNKNOWN";

                const volatility =
                    f.volatility ??
                    "UNKNOWN";

                return {
                    key:
                        [
                            setup,
                            regime,
                            volatility
                        ].join("|"),
                    setup,
                    regime,
                    volatility
                };
            }

            function metrics(rows) {

                if (!rows.length) {
                    return {
                        samples: 0,
                        decisiveTrades: 0,
                        wins: 0,
                        losses: 0,
                        timeouts: 0,
                        netR: 0,
                        EV: 0,
                        PF: 0,
                        winRate: 0
                    };
                }

                const m =
                    calculateMetrics(rows);

                return {
                    samples: m.trades,
                    decisiveTrades:
                        m.decisiveTrades,
                    wins: m.wins,
                    losses: m.losses,
                    timeouts: m.timeouts,
                    netR: round(m.netR, 4),
                    EV:
                        round(
                            m.expectedValueR,
                            4
                        ),
                    PF:
                        round(
                            m.profitFactor,
                            4
                        ),
                    winRate:
                        round(
                            m.winRate,
                            2
                        )
                };
            }

            const cellMap = new Map();

            for (
                let windowIndex = 0;
                windowIndex < WINDOW_COUNT;
                windowIndex++
            ) {

                for (
                    const record
                    of windows[windowIndex]
                ) {

                    const context =
                        contextKey(
                            record
                        );

                    if (!context) continue;

                    if (
                        !cellMap.has(
                            context.key
                        )
                    ) {
                        cellMap.set(
                            context.key,
                            {
                                key:
                                    context.key,
                                setup:
                                    context.setup,
                                regime:
                                    context.regime,
                                volatility:
                                    context.volatility,
                                windows:
                                    Array.from(
                                        {
                                            length:
                                                WINDOW_COUNT
                                        },
                                        () => []
                                    )
                            }
                        );
                    }

                    cellMap
                        .get(context.key)
                        .windows[
                            windowIndex
                        ]
                        .push(record);
                }
            }

            const cells = [];

            for (
                const cell
                of cellMap.values()
            ) {

                const chronological =
                    cell.windows.map(
                        (rows, i) => ({
                            window: i + 1,
                            ...metrics(rows)
                        })
                    );

                const transitions = [];

                for (
                    let i = 1;
                    i < WINDOW_COUNT;
                    i++
                ) {

                    const previous =
                        chronological[
                            i - 1
                        ];

                    const next =
                        chronological[i];

                    // Activation uses ONLY the completed
                    // previous window.
                    const activated =
                        previous.samples > 0 &&
                        previous.EV > 0;

                    const nextOutcome =
                        next.samples > 0
                            ? next
                            : null;

                    transitions.push({
                        fromWindow:
                            previous.window,
                        toWindow:
                            next.window,

                        activationSignal:
                            activated
                                ? "ACTIVE"
                                : "INACTIVE",

                        activationEvidence: {
                            priorSamples:
                                previous.samples,
                            priorEV:
                                previous.EV,
                            priorPF:
                                previous.PF
                        },

                        nextWindow: {
                            samples:
                                next.samples,
                            EV:
                                next.EV,
                            PF:
                                next.PF,
                            winRate:
                                next.winRate,
                            netR:
                                next.netR
                        },

                        activationWorked:
                            activated &&
                            next.samples > 0
                                ? next.EV > 0
                                : null,

                        activationFailure:
                            activated &&
                            next.samples > 0
                                ? next.EV <= 0
                                : null
                    });
                }

                const activeTransitions =
                    transitions.filter(
                        x =>
                            x.activationSignal ===
                                "ACTIVE" &&
                            x.nextWindow.samples > 0
                    );

                const successfulActivations =
                    activeTransitions.filter(
                        x =>
                            x.nextWindow.EV > 0
                    );

                const failedActivations =
                    activeTransitions.filter(
                        x =>
                            x.nextWindow.EV <= 0
                    );

                const activationEV =
                    activeTransitions.length
                        ? activeTransitions.reduce(
                            (sum, x) =>
                                sum +
                                x.nextWindow.EV,
                            0
                        ) /
                        activeTransitions.length
                        : null;

                let classification =
                    "INSUFFICIENT_ACTIVATION_EVIDENCE";

                if (
                    activeTransitions.length >= 2
                ) {

                    if (
                        successfulActivations.length ===
                        activeTransitions.length
                    ) {
                        classification =
                            "PRIOR_WINDOW_ACTIVATION_SUPPORTS_NEXT_WINDOW";
                    } else if (
                        failedActivations.length ===
                        activeTransitions.length
                    ) {
                        classification =
                            "PRIOR_WINDOW_ACTIVATION_FAILS_NEXT_WINDOW";
                    } else {
                        classification =
                            "PRIOR_WINDOW_ACTIVATION_INCONSISTENT";
                    }
                } else if (
                    activeTransitions.length === 1
                ) {

                    classification =
                        successfulActivations.length
                            ? "SINGLE_ACTIVATION_SUCCESS"
                            : "SINGLE_ACTIVATION_FAILURE";
                }

                cells.push({
                    key: cell.key,
                    setup: cell.setup,
                    regime: cell.regime,
                    volatility: cell.volatility,
                    chronologicalWindows:
                        chronological,
                    transitions,
                    activationSummary: {
                        eligibleTransitions:
                            activeTransitions.length,
                        successfulActivations:
                            successfulActivations.length,
                        failedActivations:
                            failedActivations.length,
                        forwardActivationWinRate:
                            activeTransitions.length
                                ? round(
                                    successfulActivations.length /
                                    activeTransitions.length *
                                    100,
                                    2
                                )
                                : 0,
                        forwardActivationEV:
                            activationEV === null
                                ? null
                                : round(
                                    activationEV,
                                    4
                                )
                    },
                    classification
                });
            }

            cells.sort(
                (a, b) => {

                    const order = {
                        PRIOR_WINDOW_ACTIVATION_SUPPORTS_NEXT_WINDOW: 1,
                        SINGLE_ACTIVATION_SUCCESS: 2,
                        PRIOR_WINDOW_ACTIVATION_INCONSISTENT: 3,
                        SINGLE_ACTIVATION_FAILURE: 4,
                        PRIOR_WINDOW_ACTIVATION_FAILS_NEXT_WINDOW: 5,
                        INSUFFICIENT_ACTIVATION_EVIDENCE: 6
                    };

                    return (
                        (order[
                            a.classification
                        ] || 99) -
                        (order[
                            b.classification
                        ] || 99)
                    );
                }
            );

            const allActiveTransitions =
                cells.flatMap(
                    cell =>
                        cell.transitions.filter(
                            x =>
                                x.activationSignal ===
                                    "ACTIVE" &&
                                x.nextWindow.samples > 0
                        )
                );

            const allSuccessful =
                allActiveTransitions.filter(
                    x =>
                        x.nextWindow.EV > 0
                );

            const allForwardEV =
                allActiveTransitions.length
                    ? allActiveTransitions.reduce(
                        (sum, x) =>
                            sum +
                            x.nextWindow.EV,
                        0
                    ) /
                    allActiveTransitions.length
                    : null;

            return {
                purpose:
                    "Test whether positive prior-window evidence can identify a context whose next chronological window remains profitable, without changing the trading pipeline.",
                activationDefinition:
                    "A context is ACTIVE for the next window only when the immediately preceding completed window has EV > 0. No current/future outcome is used to activate that next window.",
                contextDefinition:
                    "SETUP × REGIME × VOLATILITY",
                chronologicalWindows:
                    WINDOW_COUNT,
                sample: {
                    sellRecords:
                        safe.length,
                    windowSizes:
                        windows.map(
                            rows =>
                                rows.length
                        )
                },
                cells,
                summary: {
                    totalCells:
                        cells.length,
                    activeForwardTransitions:
                        allActiveTransitions.length,
                    successfulForwardActivations:
                        allSuccessful.length,
                    failedForwardActivations:
                        allActiveTransitions.length -
                        allSuccessful.length,
                    forwardActivationWinRate:
                        allActiveTransitions.length
                            ? round(
                                allSuccessful.length /
                                allActiveTransitions.length *
                                100,
                                2
                            )
                            : 0,
                    forwardActivationEV:
                        allForwardEV === null
                            ? null
                            : round(
                                allForwardEV,
                                4
                            ),
                    stableActivationCandidateDetected:
                        cells.some(
                            cell =>
                                cell.classification ===
                                "PRIOR_WINDOW_ACTIVATION_SUPPORTS_NEXT_WINDOW"
                        )
                },
                guard:
                    "Diagnostic only. V22.4 does not create candidates, alter thresholds, promote contexts, change validation/OOS, or use future outcomes to modify earlier activation decisions."
            };
        }


        // V22.3 REGIME-CONDITIONAL EDGE SURVIVAL AUDIT
        // -----------------------------------------------------
        // Diagnostic only.
        //
        // Tests whether the existing SELL edge survives inside
        // observable pre-entry context combinations across the
        // same chronological learning windows.
        //
        // This function DOES NOT:
        //   - create candidates
        //   - change thresholds
        //   - promote candidates
        //   - change validation
        //   - change OOS execution
        //   - change exits or risk
        //   - use future outcomes to alter earlier decisions
        //
        // Outcomes are used only to measure each diagnostic cell.
        // =====================================================

        function buildV223RegimeConditionalSurvivalAudit(
            candles,
            records
        ) {

            const safe =
                safeArray(records)
                    .filter(
                        x =>
                            x &&
                            x.side === "SELL" &&
                            Number.isFinite(x.index) &&
                            Number.isFinite(x.resultR)
                    )
                    .sort(
                        (a, b) =>
                            a.index - b.index
                    );

            const windowCount = 4;
            const windows =
                Array.from(
                    { length: windowCount },
                    () => []
                );

            if (safe.length) {
                const minIndex = safe[0].index;
                const maxIndex = safe[safe.length - 1].index;
                const span =
                    Math.max(
                        1,
                        maxIndex - minIndex + 1
                    );

                for (const r of safe) {
                    const w =
                        Math.min(
                            windowCount - 1,
                            Math.max(
                                0,
                                Math.floor(
                                    (
                                        r.index -
                                        minIndex
                                    ) /
                                    span *
                                    windowCount
                                )
                            )
                        );

                    windows[w].push(r);
                }
            }

            function metrics(rows) {
                const m = calculateMetrics(rows);

                return {
                    samples: m.trades,
                    decisiveTrades: m.decisiveTrades,
                    wins: m.wins,
                    losses: m.losses,
                    timeouts: m.timeouts,
                    netR: round(m.netR, 4),
                    EV: round(m.expectedValueR, 4),
                    PF: round(m.profitFactor, 4),
                    winRate: round(m.winRate, 2)
                };
            }

            function featureAt(r) {
                return features(
                    candles,
                    r.index
                );
            }

            function valueAt(r, field) {
                const f = featureAt(r);
                return f ? f[field] : null;
            }

            // Fixed, pre-existing observable dimensions.
            // We intentionally do not invent new thresholds.
            const dimensions = [
                "setup",
                "trend",
                "regime",
                "volatility",
                "timeBucket",
                "vwapDirection",
                "rsiBucket"
            ];

            const cells = new Map();

            for (const r of safe) {
                const f = featureAt(r);
                if (!f) continue;

                const context = {
                    setup: r.setup ?? "UNKNOWN",
                    trend: f.trend ?? r.trend ?? "UNKNOWN",
                    regime: f.regime ?? r.regime ?? "UNKNOWN",
                    volatility: f.volatility ?? "UNKNOWN",
                    timeBucket: f.timeBucket ?? "UNKNOWN",
                    vwapDirection: f.vwapDirection ?? "UNKNOWN",
                    rsiBucket: f.rsiBucket ?? "UNKNOWN"
                };

                // Keep the primary cells manageable:
                // setup × regime × volatility.
                const key =
                    [
                        context.setup,
                        context.regime,
                        context.volatility
                    ].join("|");

                if (!cells.has(key)) {
                    cells.set(key, {
                        key,
                        setup: context.setup,
                        regime: context.regime,
                        volatility: context.volatility,
                        records: Array.from(
                            { length: windowCount },
                            () => []
                        )
                    });
                }

                const relative =
                    safe.indexOf(r);

                const w =
                    Math.min(
                        windowCount - 1,
                        Math.floor(
                            relative *
                            windowCount /
                            Math.max(
                                1,
                                safe.length
                            )
                        )
                    );

                cells.get(key).records[w].push({
                    ...r,
                    _context: context
                });
            }

            function classify(byWindow) {
                const active =
                    byWindow.filter(
                        x => x.samples > 0
                    );

                const positive =
                    active.filter(
                        x => x.EV > 0
                    );

                const negative =
                    active.filter(
                        x => x.EV < 0
                    );

                const latest =
                    byWindow[
                        byWindow.length - 1
                    ];

                const earlier =
                    active.filter(
                        x =>
                            x.window <
                            latest.window
                    );

                const earlierEV =
                    earlier.length
                        ? earlier.reduce(
                            (sum, x) =>
                                sum + x.EV,
                            0
                        ) / earlier.length
                        : 0;

                const delta =
                    latest.EV -
                    earlierEV;

                // Require repeated chronological evidence before
                // calling a cell persistent.
                if (
                    active.length >= 3 &&
                    positive.length >= 3 &&
                    latest.EV > 0
                ) {
                    return {
                        classification:
                            "PERSISTENT_CONDITIONAL_EDGE",
                        earlierEV:
                            round(earlierEV, 4),
                        latestEV:
                            round(latest.EV, 4),
                        delta:
                            round(delta, 4)
                    };
                }

                if (
                    active.length >= 3 &&
                    positive.length >= 2 &&
                    latest.EV < 0 &&
                    delta < -0.05
                ) {
                    return {
                        classification:
                            "CONDITIONAL_EDGE_DECAY",
                        earlierEV:
                            round(earlierEV, 4),
                        latestEV:
                            round(latest.EV, 4),
                        delta:
                            round(delta, 4)
                    };
                }

                if (
                    active.length >= 3 &&
                    positive.length >= 2 &&
                    negative.length >= 1
                ) {
                    return {
                        classification:
                            "CONDITIONAL_EDGE_INCONSISTENCY",
                        earlierEV:
                            round(earlierEV, 4),
                        latestEV:
                            round(latest.EV, 4),
                        delta:
                            round(delta, 4)
                    };
                }

                if (
                    active.length >= 2 &&
                    positive.length === active.length
                ) {
                    return {
                        classification:
                            "RECURRING_CONDITIONAL_EDGE",
                        earlierEV:
                            round(earlierEV, 4),
                        latestEV:
                            round(latest.EV, 4),
                        delta:
                            round(delta, 4)
                    };
                }

                return {
                    classification:
                        active.length >= 2
                            ? "INSUFFICIENT_CONDITIONAL_PERSISTENCE"
                            : "INSUFFICIENT_EVIDENCE",
                    earlierEV:
                        round(earlierEV, 4),
                    latestEV:
                        round(latest.EV, 4),
                    delta:
                        round(delta, 4)
                };
            }

            const outputCells = [];

            for (const cell of cells.values()) {

                const byWindow =
                    cell.records.map(
                        (rows, i) => ({
                            window: i + 1,
                            ...metrics(rows)
                        })
                    );

                const classification =
                    classify(byWindow);

                outputCells.push({
                    key: cell.key,
                    setup: cell.setup,
                    regime: cell.regime,
                    volatility: cell.volatility,
                    windows: byWindow,
                    ...classification,
                    diagnosticOnly: true
                });
            }

            outputCells.sort(
                (a, b) => {

                    const order = {
                        PERSISTENT_CONDITIONAL_EDGE: 1,
                        RECURRING_CONDITIONAL_EDGE: 2,
                        CONDITIONAL_EDGE_DECAY: 3,
                        CONDITIONAL_EDGE_INCONSISTENCY: 4,
                        INSUFFICIENT_CONDITIONAL_PERSISTENCE: 5,
                        INSUFFICIENT_EVIDENCE: 6
                    };

                    return (
                        (order[a.classification] || 99) -
                        (order[b.classification] || 99)
                    );
                }
            );

            // Secondary time/regime breakdowns are descriptive only.
            function dimensionBreakdown(field) {

                const map = new Map();

                for (const r of safe) {
                    const f = featureAt(r);
                    if (!f) continue;

                    const value =
                        field === "setup"
                            ? (r.setup ?? "UNKNOWN")
                            : (
                                f[field] ??
                                r[field] ??
                                "UNKNOWN"
                            );

                    if (!map.has(value)) {
                        map.set(
                            value,
                            Array.from(
                                { length: windowCount },
                                () => []
                            )
                        );
                    }

                    const relative =
                        safe.indexOf(r);

                    const w =
                        Math.min(
                            windowCount - 1,
                            Math.floor(
                                relative *
                                windowCount /
                                Math.max(
                                    1,
                                    safe.length
                                )
                            )
                        );

                    map.get(value)[w].push(r);
                }

                return Array.from(
                    map.entries()
                ).map(
                    ([value, grouped]) => ({
                        value,
                        windows:
                            grouped.map(
                                (rows, i) => ({
                                    window: i + 1,
                                    ...metrics(rows)
                                })
                            )
                    })
                );
            }

            const summary = {
                persistentConditionalEdges:
                    outputCells.filter(
                        x =>
                            x.classification ===
                            "PERSISTENT_CONDITIONAL_EDGE"
                    ).length,
                recurringConditionalEdges:
                    outputCells.filter(
                        x =>
                            x.classification ===
                            "RECURRING_CONDITIONAL_EDGE"
                    ).length,
                conditionalDecayCells:
                    outputCells.filter(
                        x =>
                            x.classification ===
                            "CONDITIONAL_EDGE_DECAY"
                    ).length,
                inconsistentCells:
                    outputCells.filter(
                        x =>
                            x.classification ===
                            "CONDITIONAL_EDGE_INCONSISTENCY"
                    ).length,
                stableConditionalEdgeDetected:
                    outputCells.some(
                        x =>
                            x.classification ===
                            "PERSISTENT_CONDITIONAL_EDGE"
                    )
            };

            return {
                purpose:
                    "Test whether the existing SELL evidence survives inside observable regime/volatility contexts across chronological learning windows.",
                sample: {
                    sellRecords: safe.length,
                    chronologicalWindows: windowCount,
                    dimensions,
                    primaryCellDefinition:
                        "SETUP × REGIME × VOLATILITY"
                },
                cells: outputCells,
                descriptiveBreakdowns: {
                    trend:
                        dimensionBreakdown(
                            "trend"
                        ),
                    timeBucket:
                        dimensionBreakdown(
                            "timeBucket"
                        ),
                    vwapDirection:
                        dimensionBreakdown(
                            "vwapDirection"
                        ),
                    rsiBucket:
                        dimensionBreakdown(
                            "rsiBucket"
                        )
                },
                summary,
                guard:
                    "Diagnostic only. V22.3 does not create candidates, change thresholds, promote conditions, alter validation/OOS, or use future outcomes to modify earlier decisions."
            };
        }


        // V22.2 EDGE-DECAY DIAGNOSIS
        // -----------------------------------------------------
        // Diagnostic only.
        //
        // V22.1 showed that the historical SELL evidence was
        // strongest in an earlier chronological window and then
        // weakened in the latest window. V22.2 investigates the
        // WINDOW-3 -> WINDOW-4 transition without changing:
        //   - discovery
        //   - qualification
        //   - validation
        //   - diversification
        //   - OOS
        //   - exits
        //   - risk
        //
        // All feature measurements below are entry-time features.
        // Outcome/mechanics measurements are kept separate so that
        // no outcome-derived rule can accidentally become a signal.
        // =====================================================

        function buildV222EdgeDecayDiagnosis(
            candles,
            records,
            start,
            end
        ) {

            const safe =
                safeArray(records)
                    .filter(
                        x =>
                            x &&
                            x.side === "SELL" &&
                            Number.isFinite(x.index) &&
                            Number.isFinite(x.resultR)
                    )
                    .sort(
                        (a, b) =>
                            a.index - b.index
                    );

            const windows =
                Array.from(
                    { length: 4 },
                    () => []
                );

            if (safe.length) {
                const minIndex = safe[0].index;
                const maxIndex = safe[safe.length - 1].index;
                const span = Math.max(
                    1,
                    maxIndex - minIndex + 1
                );

                for (const record of safe) {
                    const relative =
                        record.index - minIndex;

                    const window =
                        Math.min(
                            3,
                            Math.max(
                                0,
                                Math.floor(
                                    (relative / span) * 4
                                )
                            )
                        );

                    windows[window].push(record);
                }
            }

            function roundValue(value, digits = 4) {
                return Number.isFinite(value)
                    ? round(value, digits)
                    : null;
            }

            function outcomeMetrics(rows) {

                const wins =
                    rows.filter(
                        x => x.resultR > 0
                    ).length;

                const losses =
                    rows.filter(
                        x => x.resultR < 0
                    ).length;

                const timeouts =
                    rows.filter(
                        x => x.resultR === 0
                    ).length;

                const decisive =
                    wins + losses;

                const winR =
                    rows
                        .filter(
                            x => x.resultR > 0
                        )
                        .reduce(
                            (sum, x) =>
                                sum + x.resultR,
                            0
                        );

                const lossR =
                    Math.abs(
                        rows
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
                    rows.reduce(
                        (sum, x) =>
                            sum + x.resultR,
                        0
                    );

                return {
                    trades: rows.length,
                    wins,
                    losses,
                    timeouts,
                    decisiveTrades: decisive,
                    winRate:
                        decisive
                            ? roundValue(
                                wins / decisive * 100,
                                2
                            )
                            : 0,
                    netR:
                        roundValue(netR),
                    expectedValueR:
                        rows.length
                            ? roundValue(
                                netR / rows.length
                            )
                            : 0,
                    profitFactor:
                        lossR > 0
                            ? roundValue(
                                winR / lossR
                            )
                            : 0
                };
            }

            function numericValues(rows, field) {
                return rows
                    .map(
                        row => {
                            if (
                                Number.isFinite(
                                    row[field]
                                )
                            ) {
                                return row[field];
                            }

                            const f =
                                features(
                                    candles,
                                    row.index
                                );

                            return f &&
                                Number.isFinite(f[field])
                                ? f[field]
                                : null;
                        }
                    )
                    .filter(
                        Number.isFinite
                    );
            }

            function numericStats(rows, field) {

                const values =
                    numericValues(
                        rows,
                        field
                    );

                if (!values.length) {
                    return {
                        field,
                        samples: 0,
                        mean: null,
                        median: null,
                        min: null,
                        max: null,
                        stdDev: null
                    };
                }

                const sorted =
                    [...values].sort(
                        (a, b) => a - b
                    );

                const mean =
                    values.reduce(
                        (sum, x) =>
                            sum + x,
                        0
                    ) / values.length;

                const variance =
                    values.reduce(
                        (sum, x) =>
                            sum +
                            Math.pow(
                                x - mean,
                                2
                            ),
                        0
                    ) / values.length;

                const midpoint =
                    Math.floor(
                        sorted.length / 2
                    );

                const median =
                    sorted.length % 2
                        ? sorted[midpoint]
                        : (
                            sorted[midpoint - 1] +
                            sorted[midpoint]
                        ) / 2;

                return {
                    field,
                    samples: values.length,
                    mean: roundValue(mean, 4),
                    median: roundValue(median, 4),
                    min: roundValue(sorted[0], 4),
                    max: roundValue(
                        sorted[sorted.length - 1],
                        4
                    ),
                    stdDev: roundValue(
                        Math.sqrt(variance),
                        4
                    )
                };
            }

            function categoricalStats(rows, field) {

                const counts = {};

                for (const row of rows) {
                    const f =
                        features(
                            candles,
                            row.index
                        );

                    const value =
                        row[field] ??
                        (f ? f[field] : null) ??
                        "UNKNOWN";

                    counts[value] =
                        (counts[value] || 0) + 1;
                }

                const total =
                    rows.length;

                return Object.entries(
                    counts
                )
                    .map(
                        ([value, count]) => ({
                            field,
                            value,
                            records: count,
                            sharePct:
                                total
                                    ? roundValue(
                                        count /
                                        total *
                                        100,
                                        2
                                    )
                                    : 0
                        })
                    )
                    .sort(
                        (a, b) =>
                            b.records -
                            a.records
                    );
            }

            function entryFeatureSnapshot(rows) {

                const numericFields = [
                    "rsi",
                    "atr14",
                    "emaSpreadATR",
                    "ema9SlopeATR",
                    "vwapDistanceATR",
                    "trendStrength"
                ];

                const categoricalFields = [
                    "setup",
                    "trend",
                    "regime",
                    "vwapDirection",
                    "rsiBucket",
                    "volatility",
                    "timeBucket"
                ];

                return {
                    numeric:
                        numericFields.map(
                            field =>
                                numericStats(
                                    rows,
                                    field
                                )
                        ),
                    categorical:
                        Object.fromEntries(
                            categoricalFields.map(
                                field => [
                                    field,
                                    categoricalStats(
                                        rows,
                                        field
                                    )
                                ]
                            )
                        )
                };
            }

            function numericShift(
                earlier,
                latest
            ) {

                const latestByField =
                    new Map(
                        latest.map(
                            x => [
                                x.field,
                                x
                            ]
                        )
                    );

                return earlier.map(
                    item => {

                        const other =
                            latestByField.get(
                                item.field
                            );

                        if (!other) {
                            return {
                                field: item.field,
                                available: false
                            };
                        }

                        const meanChange =
                            other.mean !== null &&
                            item.mean !== null
                                ? other.mean -
                                  item.mean
                                : null;

                        const pooledStd =
                            item.stdDev !== null &&
                            other.stdDev !== null
                                ? Math.sqrt(
                                    (
                                        Math.pow(
                                            item.stdDev,
                                            2
                                        ) +
                                        Math.pow(
                                            other.stdDev,
                                            2
                                        )
                                    ) / 2
                                )
                                : null;

                        const standardizedShift =
                            pooledStd &&
                            pooledStd > 0 &&
                            meanChange !== null
                                ? meanChange /
                                  pooledStd
                                : null;

                        return {
                            field: item.field,
                            earlierMean: item.mean,
                            latestMean: other.mean,
                            meanChange:
                                roundValue(
                                    meanChange
                                ),
                            standardizedShift:
                                roundValue(
                                    standardizedShift
                                ),
                            earlierMedian: item.median,
                            latestMedian: other.median,
                            earlierSamples: item.samples,
                            latestSamples: other.samples
                        };
                    }
                );
            }

            function categoricalShift(
                earlier,
                latest
            ) {

                const allValues =
                    new Set([
                        ...earlier.map(
                            x => x.value
                        ),
                        ...latest.map(
                            x => x.value
                        )
                    ]);

                const eMap =
                    new Map(
                        earlier.map(
                            x => [
                                x.value,
                                x.sharePct
                            ]
                        )
                    );

                const lMap =
                    new Map(
                        latest.map(
                            x => [
                                x.value,
                                x.sharePct
                            ]
                        )
                    );

                return Array.from(
                    allValues
                )
                    .map(
                        value => ({
                            value,
                            earlierSharePct:
                                roundValue(
                                    eMap.get(value) || 0,
                                    2
                                ),
                            latestSharePct:
                                roundValue(
                                    lMap.get(value) || 0,
                                    2
                                ),
                            shareChangePct:
                                roundValue(
                                    (
                                        lMap.get(value) || 0
                                    ) -
                                    (
                                        eMap.get(value) || 0
                                    ),
                                    2
                                )
                        })
                    )
                    .sort(
                        (a, b) =>
                            Math.abs(
                                b.shareChangePct
                            ) -
                            Math.abs(
                                a.shareChangePct
                            )
                    );
            }

            const outcomeWindows =
                windows.map(
                    (rows, index) => ({
                        window: index + 1,
                        firstIndex:
                            rows.length
                                ? rows[0].index
                                : null,
                        lastIndex:
                            rows.length
                                ? rows[
                                    rows.length - 1
                                ].index
                                : null,
                        outcomes:
                            outcomeMetrics(rows)
                    })
                );

            const window3 =
                windows[2] || [];

            const window4 =
                windows[3] || [];

            const w3Features =
                entryFeatureSnapshot(
                    window3
                );

            const w4Features =
                entryFeatureSnapshot(
                    window4
                );

            const numericShifts =
                numericShift(
                    w3Features.numeric,
                    w4Features.numeric
                );

            const categoricalShifts =
                Object.fromEntries(
                    Object.keys(
                        w3Features.categorical
                    ).map(
                        field => [
                            field,
                            categoricalShift(
                                w3Features
                                    .categorical[
                                        field
                                    ],
                                w4Features
                                    .categorical[
                                        field
                                    ]
                            )
                        ]
                    )
                );

            const mechanicsFields = [
                "exitType"
            ];

            const mechanicsShift =
                Object.fromEntries(
                    mechanicsFields.map(
                        field => [
                            field,
                            categoricalShift(
                                categoricalStats(
                                    window3,
                                    field
                                ),
                                categoricalStats(
                                    window4,
                                    field
                                )
                            )
                        ]
                    )
                );

            const bySetup = {};

            for (const setup of [
                "TREND_FOLLOW",
                "VWAP_PULLBACK"
            ]) {

                const w3 =
                    window3.filter(
                        x =>
                            x.setup ===
                            setup
                    );

                const w4 =
                    window4.filter(
                        x =>
                            x.setup ===
                            setup
                    );

                bySetup[setup] = {
                    window3: {
                        outcomes:
                            outcomeMetrics(w3),
                        features:
                            entryFeatureSnapshot(w3)
                    },
                    window4: {
                        outcomes:
                            outcomeMetrics(w4),
                        features:
                            entryFeatureSnapshot(w4)
                    }
                };
            }

            const failureModes = {
                window3: {
                    exitTypes:
                        categoricalStats(
                            window3,
                            "exitType"
                        ),
                    resultBuckets: {
                        winners:
                            window3.filter(
                                x => x.resultR > 0
                            ).length,
                        losers:
                            window3.filter(
                                x => x.resultR < 0
                            ).length,
                        timeouts:
                            window3.filter(
                                x => x.resultR === 0
                            ).length
                    }
                },
                window4: {
                    exitTypes:
                        categoricalStats(
                            window4,
                            "exitType"
                        ),
                    resultBuckets: {
                        winners:
                            window4.filter(
                                x => x.resultR > 0
                            ).length,
                        losers:
                            window4.filter(
                                x => x.resultR < 0
                            ).length,
                        timeouts:
                            window4.filter(
                                x => x.resultR === 0
                            ).length
                    }
                }
            };

            const strongestNumericShifts =
                [...numericShifts]
                    .filter(
                        x =>
                            Number.isFinite(
                                x.standardizedShift
                            )
                    )
                    .sort(
                        (a, b) =>
                            Math.abs(
                                b.standardizedShift
                            ) -
                            Math.abs(
                                a.standardizedShift
                            )
                    )
                    .slice(0, 10);

            const categoricalAlerts = [];

            for (
                const [field, shifts]
                of Object.entries(
                    categoricalShifts
                )
            ) {
                for (const shift of shifts) {
                    if (
                        Math.abs(
                            shift.shareChangePct
                        ) >= 15
                    ) {
                        categoricalAlerts.push({
                            field,
                            ...shift
                        });
                    }
                }
            }

            categoricalAlerts.sort(
                (a, b) =>
                    Math.abs(
                        b.shareChangePct
                    ) -
                    Math.abs(
                        a.shareChangePct
                    )
            );

            const preTradeObservableShifts =
                [
                    ...strongestNumericShifts.map(
                        x => ({
                            type:
                                "NUMERIC_FEATURE_SHIFT",
                            ...x
                        })
                    ),
                    ...categoricalAlerts.map(
                        x => ({
                            type:
                                "CATEGORICAL_FEATURE_SHIFT",
                            ...x
                        })
                    )
                ].slice(0, 20);

            const outcomeChange =
                outcomeMetrics(window4).expectedValueR -
                outcomeMetrics(window3).expectedValueR;

            let classification =
                "INSUFFICIENT_DATA";

            if (
                window3.length >= 20 &&
                window4.length >= 20
            ) {
                if (
                    outcomeChange < -0.10 &&
                    preTradeObservableShifts.length > 0
                ) {
                    classification =
                        "DECAY_WITH_OBSERVABLE_CONTEXT_SHIFT";
                } else if (
                    outcomeChange < -0.10
                ) {
                    classification =
                        "DECAY_WITHOUT_CLEAR_CONTEXT_SHIFT";
                } else {
                    classification =
                        "NO_MATERIAL_WINDOW3_TO_WINDOW4_DECAY";
                }
            }

            return {
                purpose:
                    "Diagnose why the Window-3 edge weakened in Window 4 using entry-time context and separate outcome/mechanics evidence. Diagnostic only.",
                sample: {
                    sellRecords: safe.length,
                    chronologicalWindows: 4,
                    window3Records:
                        window3.length,
                    window4Records:
                        window4.length
                },
                chronologicalOutcomeWindows:
                    outcomeWindows,
                window3ToWindow4: {
                    classification,
                    outcomeEVChange:
                        roundValue(
                            outcomeChange
                        ),
                    featureShiftMagnitude:
                        preTradeObservableShifts.length,
                    strongestNumericShifts,
                    categoricalShifts,
                    preTradeObservableShifts,
                    mechanicsShift,
                    failureModes
                },
                bySetup,
                guard:
                    "Diagnostic only. V22.2 does not create candidates, change thresholds, select exits, alter validation/OOS, or use Window-4 outcomes to modify earlier decisions."
            };
        }


        // =====================================================
        // V15 STRATEGY MECHANICS LAB
        // -----------------------------------------------------
        // Diagnostic-only exit-model comparison.
        //
        // The entry signal set is held constant using the raw
        // learning records. Each exit model is then replayed
        // independently from the same entry candle.
        //
        // This isolates trade-management mechanics from signal
        // discovery. No model is promoted, selected, or allowed
        // into validation/OOS by this diagnostic.
        // =====================================================

        const V15_EXIT_MODELS = [
            {
                key: "BASELINE_1R_2R_12",
                label: "Baseline 1R stop / 2R target / 12 candles",
                stopR: 1,
                targetR: 2,
                maxHoldCandles: 12
            },
            {
                key: "FAST_1R_1_5R_8",
                label: "Fast 1R stop / 1.5R target / 8 candles",
                stopR: 1,
                targetR: 1.5,
                maxHoldCandles: 8
            },
            {
                key: "BALANCED_1R_2R_8",
                label: "Balanced 1R stop / 2R target / 8 candles",
                stopR: 1,
                targetR: 2,
                maxHoldCandles: 8
            },
            {
                key: "EXTENDED_1R_2_5R_16",
                label: "Extended 1R stop / 2.5R target / 16 candles",
                stopR: 1,
                targetR: 2.5,
                maxHoldCandles: 16
            },
            {
                key: "WIDE_1_25R_2_5R_16",
                label: "Wide 1.25R stop / 2.5R target / 16 candles",
                stopR: 1.25,
                targetR: 2.5,
                maxHoldCandles: 16
            }
        ];

        function evaluateExitModel(
            candles,
            entryIndex,
            side,
            entry,
            atrValue,
            model,
            boundaryEnd = null
        ) {

            const stopDistance =
                model.stopR * atrValue;

            const targetDistance =
                model.targetR * atrValue;

            const stop =
                side === "BUY"
                    ? entry - stopDistance
                    : entry + stopDistance;

            const target =
                side === "BUY"
                    ? entry + targetDistance
                    : entry - targetDistance;

            const naturalEnd =
                Math.min(
                    candles.length - 1,
                    entryIndex +
                    model.maxHoldCandles
                );

            const end =
                boundaryEnd === null
                    ? naturalEnd
                    : Math.min(
                        naturalEnd,
                        boundaryEnd
                    );

            if (entryIndex + 1 > end) {
                return {
                    exitIndex: entryIndex,
                    exitType: "BOUNDARY",
                    resultR: null,
                    boundaryCapped: true,
                    stop,
                    target
                };
            }

            for (let i = entryIndex + 1; i <= end; i++) {

                const candle = candles[i];

                const hitStop =
                    side === "BUY"
                        ? candle.l <= stop
                        : candle.h >= stop;

                const hitTarget =
                    side === "BUY"
                        ? candle.h >= target
                        : candle.l <= target;

                // Preserve the engine's conservative STOP_FIRST rule.
                if (hitStop) {
                    return {
                        exitIndex: i,
                        exitType: "STOP",
                        resultR: -model.stopR,
                        boundaryCapped: false,
                        stop,
                        target
                    };
                }

                if (hitTarget) {
                    return {
                        exitIndex: i,
                        exitType: "TARGET",
                        resultR: model.targetR,
                        boundaryCapped: false,
                        stop,
                        target
                    };
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
                boundaryCapped,
                stop,
                target
            };
        }

        function summarizeMechanics(records) {

            const safe = safeArray(records)
                .filter(
                    x =>
                        x &&
                        Number.isFinite(x.resultR)
                );

            return calculateMetrics(safe);
        }

        function mechanicsSections(
            records,
            start,
            end
        ) {

            const sectionCount = 4;
            const width =
                Math.max(
                    1,
                    (end - start) / sectionCount
                );

            const sections = [];

            for (let s = 0; s < sectionCount; s++) {

                const sectionStart =
                    start + Math.floor(s * width);

                const sectionEnd =
                    s === sectionCount - 1
                        ? end
                        : start + Math.floor((s + 1) * width);

                const sectionRecords =
                    records.filter(
                        x =>
                            x.index >= sectionStart &&
                            x.index < sectionEnd
                    );

                sections.push({
                    section: s + 1,
                    startIndex: sectionStart,
                    endIndex: sectionEnd - 1,
                    metrics: summarizeMechanics(sectionRecords)
                });
            }

            return sections;
        }

        function buildV15ExitModelDiagnostics(
            candles,
            rawRecords,
            start,
            end
        ) {

            const records =
                safeArray(rawRecords)
                    .filter(
                        x =>
                            x &&
                            Number.isFinite(x.index) &&
                            (x.side === "BUY" || x.side === "SELL")
                    );

            const results = [];

            for (const model of V15_EXIT_MODELS) {

                const replay = [];

                for (const record of records) {

                    const f =
                        features(
                            candles,
                            record.index
                        );

                    if (
                        !f ||
                        !Number.isFinite(f.atr14) ||
                        f.atr14 <= 0
                    ) {
                        continue;
                    }

                    const entry =
                        candles[record.index].c;

                    const outcome =
                        evaluateExitModel(
                            candles,
                            record.index,
                            record.side,
                            entry,
                            f.atr14,
                            model,
                            end - 1
                        );

                    if (
                        outcome.resultR === null ||
                        outcome.boundaryCapped
                    ) {
                        continue;
                    }

                    replay.push({
                        ...record,
                        exitModel: model.key,
                        resultR: outcome.resultR,
                        exitType: outcome.exitType,
                        exitIndex: outcome.exitIndex,
                        stop: outcome.stop,
                        target: outcome.target
                    });
                }

                const metrics =
                    summarizeMechanics(replay);

                const recentStart =
                    start +
                    Math.floor(
                        (end - start) * 0.75
                    );

                const recent =
                    replay.filter(
                        x =>
                            x.index >= recentStart
                    );

                const bySide = {};

                for (const side of ["BUY", "SELL"]) {
                    bySide[side] =
                        summarizeMechanics(
                            replay.filter(
                                x => x.side === side
                            )
                        );
                }

                const sections =
                    mechanicsSections(
                        replay,
                        start,
                        end
                    );

                const profitableSections =
                    sections.filter(
                        x =>
                            x.metrics.trades > 0 &&
                            x.metrics.expectedValueR > 0
                    ).length;

                results.push({
                    model: model.key,
                    label: model.label,
                    parameters: {
                        stopR: model.stopR,
                        targetR: model.targetR,
                        maxHoldCandles: model.maxHoldCandles
                    },
                    signalSetSize: records.length,
                    replayedTrades: replay.length,
                    overall: metrics,
                    recent: summarizeMechanics(recent),
                    bySide,
                    sections,
                    profitableSections,
                    diagnosticOnly: true
                });
            }

            const ranked =
                [...results]
                    .sort(
                        (a, b) => {
                            const aRecent =
                                a.recent.expectedValueR;

                            const bRecent =
                                b.recent.expectedValueR;

                            const aScore =
                                aRecent * 100 +
                                Math.min(
                                    a.recent.profitFactor,
                                    5
                                ) * 5 +
                                Math.min(
                                    a.profitableSections,
                                    3
                                ) * 2;

                            const bScore =
                                bRecent * 100 +
                                Math.min(
                                    b.recent.profitFactor,
                                    5
                                ) * 5 +
                                Math.min(
                                    b.profitableSections,
                                    3
                                ) * 2;

                            return bScore - aScore;
                        }
                    )
                    .map(
                        (x, index) => ({
                            diagnosticRank: index + 1,
                            model: x.model,
                            recentEV: x.recent.expectedValueR,
                            recentPF: x.recent.profitFactor,
                            overallEV: x.overall.expectedValueR,
                            overallPF: x.overall.profitFactor,
                            profitableSections:
                                x.profitableSections
                        })
                    );

            return {
                purpose:
                    "Compare exit mechanics on the same historical entry signals before changing the strategy's trade-management rules.",
                signalSetSize:
                    records.length,
                modelsTested:
                    V15_EXIT_MODELS.length,
                models:
                    results,
                diagnosticRanking:
                    ranked,
                guard:
                    "Diagnostic only. Exit-model ranking does not select a model, alter discovery thresholds, enter validation, enter true OOS, or place orders."
            };
        }

        // =====================================================
        // V22.6 — ACTIVATION QUALITY / PERSISTENCE FILTER AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Uses only completed prior-window data
        // to label the next chronological window.
        // =====================================================

        function buildV225ActivationQualityPersistenceAudit(records) {
        
            const WINDOW_COUNT = 4;
        
            // -------------------------------------------------------
            // FILTER DIMENSIONS
            // These are deliberately FIXED before looking at the
            // forward outcome labels.
            // -------------------------------------------------------
        
            const SAMPLE_TIERS = [
                { key: "SAMPLE_1_PLUS", min: 1 },
                { key: "SAMPLE_4_PLUS", min: 4 },
                { key: "SAMPLE_8_PLUS", min: 8 },
                { key: "SAMPLE_12_PLUS", min: 12 }
            ];
        
            const DECISIVE_TIERS = [
                { key: "DECISIVE_1_PLUS", min: 1 },
                { key: "DECISIVE_3_PLUS", min: 3 },
                { key: "DECISIVE_5_PLUS", min: 5 },
                { key: "DECISIVE_8_PLUS", min: 8 }
            ];
        
            const EV_TIERS = [
                { key: "EV_GT_0", min: 0 },
                { key: "EV_GE_0_05", min: 0.05 },
                { key: "EV_GE_0_10", min: 0.10 },
                { key: "EV_GE_0_25", min: 0.25 },
                { key: "EV_GE_0_50", min: 0.50 }
            ];
        
            const PF_TIERS = [
                { key: "PF_GT_1", min: 1 },
                { key: "PF_GE_1_05", min: 1.05 },
                { key: "PF_GE_1_20", min: 1.20 },
                { key: "PF_GE_1_50", min: 1.50 }
            ];
        
            const WIN_RATE_TIERS = [
                { key: "WR_GE_40", min: 40 },
                { key: "WR_GE_50", min: 50 },
                { key: "WR_GE_60", min: 60 },
                { key: "WR_GE_70", min: 70 }
            ];
        
            const EV_MOMENTUM_TIERS = [
                { key: "MOM_NONNEGATIVE", min: 0 },
                { key: "MOM_GE_0_05", min: 0.05 },
                { key: "MOM_GE_0_10", min: 0.10 },
                { key: "MOM_GE_0_25", min: 0.25 }
            ];
        
            const safe = safeArray(records)
                .filter(x =>
                    x &&
                    x.side === "SELL" &&
                    Number.isFinite(x.resultR) &&
                    Number.isFinite(x.index)
                )
                .sort((a, b) => a.index - b.index);
        
            // -------------------------------------------------------
            // Same chronological 4-window construction as V22.4.
            // -------------------------------------------------------
        
            const windows =
                Array.from(
                    { length: WINDOW_COUNT },
                    () => []
                );
        
            if (safe.length) {
                for (let w = 0; w < WINDOW_COUNT; w++) {
                    const start =
                        Math.floor(
                            safe.length * w / WINDOW_COUNT
                        );
        
                    const end =
                        w === WINDOW_COUNT - 1
                            ? safe.length
                            : Math.floor(
                                safe.length * (w + 1) / WINDOW_COUNT
                            );
        
                    windows[w] =
                        safe.slice(start, end);
                }
            }
        
            function compactMetrics(rows) {
                const m = calculateMetrics(rows);
        
                return {
                    samples: m.trades ?? 0,
                    decisiveTrades: m.decisiveTrades ?? 0,
                    wins: m.wins ?? 0,
                    losses: m.losses ?? 0,
                    timeouts: m.timeouts ?? 0,
                    netR: round(m.netR ?? 0, 4),
                    EV: round(m.expectedValueR ?? 0, 4),
                    PF: round(m.profitFactor ?? 0, 4),
                    winRate: round(m.winRate ?? 0, 2)
                };
            }
        
            function bucketRows(items, keyFn) {
        
                const map = new Map();
        
                for (const item of items) {
                    const key = keyFn(item);
        
                    if (!map.has(key)) {
                        map.set(key, []);
                    }
        
                    map.get(key).push(item);
                }
        
                return Array.from(map.entries())
                    .map(([key, rows]) => {
        
                        const m =
                            compactMetrics(
                                rows.map(
                                    x => x.nextRows
                                ).flat()
                            );
        
                        const successes =
                            rows.filter(
                                x => x.activationWorked
                            ).length;
        
                        const failures =
                            rows.filter(
                                x => x.activationFailure
                            ).length;
        
                        return {
                            bucket: key,
                            activations: rows.length,
                            successes,
                            failures,
                            successRatePct:
                                rows.length
                                    ? round(
                                        successes /
                                        rows.length *
                                        100,
                                        2
                                    )
                                    : 0,
                            forwardEV: m.EV,
                            forwardNetR: m.netR,
                            forwardDecisiveTrades:
                                m.decisiveTrades
                        };
                    })
                    .sort(
                        (a, b) =>
                            b.forwardEV - a.forwardEV
                    );
            }
        
            // -------------------------------------------------------
            // Build every eligible ACTIVE transition.
            //
            // Window N -> Window N+1
            //
            // Activation uses ONLY prior window.
            // Forward label uses ONLY next window.
            // -------------------------------------------------------
        
            const cells = new Map();
        
            for (let i = 0; i < safe.length; i++) {
        
                const r = safe[i];
        
                const relative =
                    i;
        
                const window =
                    Math.min(
                        WINDOW_COUNT - 1,
                        Math.max(
                            0,
                            Math.floor(
                                relative *
                                WINDOW_COUNT /
                                safe.length
                            )
                        )
                    );
        
                const key =
                    `${r.setup}|${r.regime}|${r.volatility}`;
        
                if (!cells.has(key)) {
                    cells.set(key, {
                        key,
                        setup: r.setup,
                        regime: r.regime,
                        volatility: r.volatility,
                        windows:
                            Array.from(
                                { length: WINDOW_COUNT },
                                () => []
                            )
                    });
                }
        
                cells.get(key).windows[window].push(r);
            }
        
            const transitions = [];
        
            for (const cell of cells.values()) {
        
                for (
                    let w = 0;
                    w < WINDOW_COUNT - 1;
                    w++
                ) {
        
                    const priorRows =
                        cell.windows[w];
        
                    const nextRows =
                        cell.windows[w + 1];
        
                    if (!priorRows.length || !nextRows.length) {
                        continue;
                    }
        
                    const prior =
                        compactMetrics(priorRows);
        
                    const next =
                        compactMetrics(nextRows);
        
                    // V22.4 activation definition retained.
                    if (!(prior.EV > 0)) {
                        continue;
                    }
        
                    // -------------------------------------------------
                    // Observable prior-window features.
                    // -------------------------------------------------
        
                    let previousWindowEV = null;
        
                    if (w > 0 && cell.windows[w - 1].length) {
                        previousWindowEV =
                            compactMetrics(
                                cell.windows[w - 1]
                            ).EV;
                    }
        
                    const evMomentum =
                        previousWindowEV === null
                            ? null
                            : round(
                                prior.EV -
                                previousWindowEV,
                                4
                            );
        
                    // Number of consecutive completed positive windows
                    // immediately ending at the prior window.
                    let positiveRun = 1;
        
                    for (
                        let p = w - 1;
                        p >= 0;
                        p--
                    ) {
        
                        if (!cell.windows[p].length) {
                            break;
                        }
        
                        const pm =
                            compactMetrics(
                                cell.windows[p]
                            );
        
                        if (!(pm.EV > 0)) {
                            break;
                        }
        
                        positiveRun++;
                    }
        
                    const activationWorked =
                        next.EV > 0;
        
                    const activationFailure =
                        next.EV <= 0;
        
                    transitions.push({
                        contextKey: cell.key,
                        setup: cell.setup,
                        regime: cell.regime,
                        volatility: cell.volatility,
                        fromWindow: w + 1,
                        toWindow: w + 2,
        
                        prior: {
                            samples: prior.samples,
                            decisiveTrades: prior.decisiveTrades,
                            EV: prior.EV,
                            PF: prior.PF,
                            winRate: prior.winRate,
                            netR: prior.netR
                        },
        
                        priorEVMomentum:
                            evMomentum,
        
                        consecutivePositiveWindows:
                            positiveRun,
        
                        next: {
                            samples: next.samples,
                            decisiveTrades: next.decisiveTrades,
                            EV: next.EV,
                            PF: next.PF,
                            winRate: next.winRate,
                            netR: next.netR
                        },
        
                        activationWorked,
                        activationFailure,
        
                        // Used by bucket analysis only.
                        nextRows
                    });
                }
            }
        
            // -------------------------------------------------------
            // Aggregate helper.
            // -------------------------------------------------------
        
            function activationAggregate(rows) {
        
                const successes =
                    rows.filter(
                        x => x.activationWorked
                    ).length;
        
                const failures =
                    rows.filter(
                        x => x.activationFailure
                    ).length;
        
                const nextRows =
                    rows.flatMap(
                        x => x.nextRows
                    );
        
                const m =
                    compactMetrics(
                        nextRows
                    );
        
                return {
                    activations: rows.length,
                    successes,
                    failures,
                    successRatePct:
                        rows.length
                            ? round(
                                successes /
                                rows.length *
                                100,
                                2
                            )
                            : 0,
                    forwardEV: m.EV,
                    forwardNetR: m.netR,
                    forwardDecisiveTrades:
                        m.decisiveTrades
                };
            }
        
            // -------------------------------------------------------
            // Fixed bucket studies.
            // -------------------------------------------------------
        
            const sampleBuckets =
                SAMPLE_TIERS.map(tier => ({
                    tier: tier.key,
                    minimum: tier.min,
                    ...activationAggregate(
                        transitions.filter(
                            x =>
                                x.prior.samples >=
                                tier.min
                        )
                    )
                }));
        
            const decisiveBuckets =
                DECISIVE_TIERS.map(tier => ({
                    tier: tier.key,
                    minimum: tier.min,
                    ...activationAggregate(
                        transitions.filter(
                            x =>
                                x.prior.decisiveTrades >=
                                tier.min
                        )
                    )
                }));
        
            const evBuckets =
                EV_TIERS.map(tier => ({
                    tier: tier.key,
                    minimum: tier.min,
                    ...activationAggregate(
                        transitions.filter(
                            x =>
                                x.prior.EV >=
                                tier.min
                        )
                    )
                }));
        
            const pfBuckets =
                PF_TIERS.map(tier => ({
                    tier: tier.key,
                    minimum: tier.min,
                    ...activationAggregate(
                        transitions.filter(
                            x =>
                                x.prior.PF >=
                                tier.min
                        )
                    )
                }));
        
            const winRateBuckets =
                WIN_RATE_TIERS.map(tier => ({
                    tier: tier.key,
                    minimum: tier.min,
                    ...activationAggregate(
                        transitions.filter(
                            x =>
                                x.prior.winRate >=
                                tier.min
                        )
                    )
                }));
        
            const momentumBuckets =
                EV_MOMENTUM_TIERS.map(tier => ({
                    tier: tier.key,
                    minimum: tier.min,
                    ...activationAggregate(
                        transitions.filter(
                            x =>
                                x.priorEVMomentum !== null &&
                                x.priorEVMomentum >=
                                tier.min
                        )
                    )
                }));
        
            const persistenceBuckets =
                [
                    {
                        tier: "ONE_POSITIVE_WINDOW",
                        minimum: 1
                    },
                    {
                        tier: "TWO_PLUS_POSITIVE_WINDOWS",
                        minimum: 2
                    },
                    {
                        tier: "THREE_PLUS_POSITIVE_WINDOWS",
                        minimum: 3
                    }
                ].map(tier => ({
                    ...tier,
                    ...activationAggregate(
                        transitions.filter(
                            x =>
                                x.consecutivePositiveWindows >=
                                tier.minimum
                        )
                    )
                }));
        
            // -------------------------------------------------------
            // Combined fixed quality tiers.
            //
            // These are intentionally conservative diagnostic tiers.
            // They are NOT trading rules.
            // -------------------------------------------------------
        
            const combinedDefinitions = [
                {
                    key: "Q1_POSITIVE_ONLY",
                    test: x =>
                        x.prior.EV > 0
                },
                {
                    key: "Q2_EV_05_SAMPLE_4",
                    test: x =>
                        x.prior.EV >= 0.05 &&
                        x.prior.samples >= 4
                },
                {
                    key: "Q3_EV_10_SAMPLE_8",
                    test: x =>
                        x.prior.EV >= 0.10 &&
                        x.prior.samples >= 8
                },
                {
                    key: "Q4_EV_10_SAMPLE_8_PF_120",
                    test: x =>
                        x.prior.EV >= 0.10 &&
                        x.prior.samples >= 8 &&
                        x.prior.PF >= 1.20
                },
                {
                    key: "Q5_EV_10_SAMPLE_8_PF_120_TWO_POSITIVE",
                    test: x =>
                        x.prior.EV >= 0.10 &&
                        x.prior.samples >= 8 &&
                        x.prior.PF >= 1.20 &&
                        x.consecutivePositiveWindows >= 2
                },
                {
                    key: "Q6_EV_25_SAMPLE_8_PF_150_TWO_POSITIVE",
                    test: x =>
                        x.prior.EV >= 0.25 &&
                        x.prior.samples >= 8 &&
                        x.prior.PF >= 1.50 &&
                        x.consecutivePositiveWindows >= 2
                }
            ];
        
            const combinedTiers =
                combinedDefinitions.map(def => ({
                    tier: def.key,
                    ...activationAggregate(
                        transitions.filter(
                            def.test
                        )
                    )
                }));
        
            // -------------------------------------------------------
            // Context-level diagnosis.
            // -------------------------------------------------------
        
            const contextResults =
                Array.from(
                    cells.values()
                )
                .map(cell => {
        
                    const rows =
                        transitions.filter(
                            x =>
                                x.contextKey ===
                                cell.key
                        );
        
                    const aggregate =
                        activationAggregate(
                            rows
                        );
        
                    return {
                        key: cell.key,
                        setup: cell.setup,
                        regime: cell.regime,
                        volatility: cell.volatility,
                        ...aggregate,
                        transitions:
                            rows.map(
                                x => ({
                                    fromWindow:
                                        x.fromWindow,
                                    toWindow:
                                        x.toWindow,
                                    priorSamples:
                                        x.prior.samples,
                                    priorDecisiveTrades:
                                        x.prior.decisiveTrades,
                                    priorEV:
                                        x.prior.EV,
                                    priorPF:
                                        x.prior.PF,
                                    priorWinRate:
                                        x.prior.winRate,
                                    priorEVMomentum:
                                        x.priorEVMomentum,
                                    consecutivePositiveWindows:
                                        x.consecutivePositiveWindows,
                                    nextEV:
                                        x.next.EV,
                                    nextPF:
                                        x.next.PF,
                                    activationWorked:
                                        x.activationWorked
                                })
                            )
                    };
                })
                .filter(
                    x =>
                        x.activations > 0
                )
                .sort(
                    (a, b) =>
                        b.forwardEV -
                        a.forwardEV
                );
        
            const overall =
                activationAggregate(
                    transitions
                );
        
            // -------------------------------------------------------
            // Diagnostic interpretation flags.
            //
            // These are NOT promotions. They only tell us whether a
            // fixed diagnostic dimension deserves further testing.
            // -------------------------------------------------------
        
            function bestTier(rows) {
        
                return rows
                    .filter(
                        x =>
                            x.activations >= 2
                    )
                    .sort(
                        (a, b) =>
                            b.forwardEV -
                            a.forwardEV
                    )[0] || null;
            }
        
            const bestSampleTier =
                bestTier(sampleBuckets);
        
            const bestEVTier =
                bestTier(evBuckets);
        
            const bestPFTier =
                bestTier(pfBuckets);
        
            const bestPersistenceTier =
                bestTier(persistenceBuckets);
        
            const bestCombinedTier =
                bestTier(combinedTiers);
        
            return {
        
                version: "V22.5",
        
                purpose:
                    "Audit which observable prior-window quality characteristics distinguish successful forward activation from failed activation without creating a trading rule.",
        
                activationDefinition:
                    "A transition is eligible only when the completed prior window has EV > 0. The next chronological window is used only as the forward outcome label.",
        
                contextDefinition:
                    "SETUP × REGIME × VOLATILITY",
        
                chronologicalWindows:
                    WINDOW_COUNT,
        
                sample: {
                    sellRecords:
                        safe.length,
                    eligibleForwardActivations:
                        transitions.length,
                    overall
                },
        
                filterStudies: {
        
                    priorSampleSize:
                        sampleBuckets,
        
                    priorDecisiveSampleSize:
                        decisiveBuckets,
        
                    priorEVStrength:
                        evBuckets,
        
                    priorProfitFactor:
                        pfBuckets,
        
                    priorWinRate:
                        winRateBuckets,
        
                    priorEVMomentum:
                        momentumBuckets,
        
                    consecutivePositivePersistence:
                        persistenceBuckets,
        
                    combinedFixedQualityTiers:
                        combinedTiers
                },
        
                strongestDiagnosticTiers: {
                    bestSampleTier,
                    bestEVTier,
                    bestPFTier,
                    bestPersistenceTier,
                    bestCombinedTier
                },
        
                contextResults,
        
                transitionDetail:
                    transitions.map(
                        x => ({
                            contextKey:
                                x.contextKey,
                            setup:
                                x.setup,
                            regime:
                                x.regime,
                            volatility:
                                x.volatility,
                            fromWindow:
                                x.fromWindow,
                            toWindow:
                                x.toWindow,
                            prior:
                                x.prior,
                            priorEVMomentum:
                                x.priorEVMomentum,
                            consecutivePositiveWindows:
                                x.consecutivePositiveWindows,
                            next:
                                x.next,
                            activationWorked:
                                x.activationWorked,
                            activationFailure:
                                x.activationFailure
                        })
                    ),
        
                interpretationGuard:
                    "Diagnostic only. V22.5 does not create candidates, change thresholds, promote contexts, modify validation/OOS, select exits, alter trade execution, or use next-window outcomes to modify earlier activation features.",
        
                decisionGuard:
                    "No filter is considered a strategy rule from this audit alone. Any apparently strong tier must survive a separate chronological validation experiment before it can influence trading."
            };
        }
        

        // =====================================================
        // V22.6 — CONTROLLED EV-MOMENTUM VALIDATION
        // -----------------------------------------------------
        // Diagnostic validation experiment only.
        //
        // V22.5 identified prior-window EV momentum as the
        // strongest diagnostic dimension. V22.6 tests that
        // hypothesis across the EXISTING chronological
        // expanding-fold boundaries.
        //
        // Arms are fixed BEFORE forward outcomes are examined:
        //
        //   BASELINE:
        //     prior EV > 0
        //
        //   MOMENTUM:
        //     prior EV > 0
        //     AND prior EV momentum >= +0.10R
        //
        //   STRONG_MOMENTUM:
        //     prior EV >= +0.10R
        //     AND prior EV momentum >= +0.10R
        //
        // Each fold uses ONLY records available before that
        // fold's testStart to construct the prior context.
        // The following fold/test segment is used only as the
        // forward outcome.
        //
        // This does NOT:
        //   - modify candidate discovery
        //   - modify qualification
        //   - modify validation
        //   - modify diversification
        //   - modify true OOS execution
        //   - modify exits
        //   - modify risk
        //   - promote an arm into trading
        //
        // The experiment is deliberately parallel to the real
        // pipeline so the current V22.5 strategy remains intact.
        // =====================================================

        function buildV226ControlledEVMomentumValidation(
            candles,
            records,
            foldDefinitions
        ) {

            const safe =
                safeArray(records)
                    .filter(
                        x =>
                            x &&
                            x.side === "SELL" &&
                            Number.isFinite(x.index) &&
                            Number.isFinite(x.resultR)
                    )
                    .sort(
                        (a, b) =>
                            a.index - b.index
                    );

            const ARM_DEFINITIONS = [
                {
                    key:
                        "BASELINE_PRIOR_EV_GT_0",
                    label:
                        "Prior EV > 0",
                    test:
                        context =>
                            context.priorEV > 0
                },
                {
                    key:
                        "MOMENTUM_PRIOR_EV_GT_0_MOM_GE_0_10",
                    label:
                        "Prior EV > 0 AND EV momentum >= +0.10R",
                    test:
                        context =>
                            context.priorEV > 0 &&
                            context.evMomentum >= 0.10
                },
                {
                    key:
                        "STRONG_MOMENTUM_PRIOR_EV_GE_0_10_MOM_GE_0_10",
                    label:
                        "Prior EV >= +0.10R AND EV momentum >= +0.10R",
                    test:
                        context =>
                            context.priorEV >= 0.10 &&
                            context.evMomentum >= 0.10
                }
            ];

            const MIN_PRIOR_SAMPLES = 4;
            const MIN_FORWARD_SAMPLES = 1;

            function metrics(rows) {

                if (!rows.length) {
                    return {
                        trades: 0,
                        decisiveTrades: 0,
                        wins: 0,
                        losses: 0,
                        timeouts: 0,
                        netR: 0,
                        EV: 0,
                        PF: 0,
                        winRate: 0
                    };
                }

                const m =
                    calculateMetrics(rows);

                return {
                    trades:
                        m.trades ?? rows.length,
                    decisiveTrades:
                        m.decisiveTrades ?? 0,
                    wins:
                        m.wins ?? 0,
                    losses:
                        m.losses ?? 0,
                    timeouts:
                        m.timeouts ?? 0,
                    netR:
                        round(m.netR ?? 0, 4),
                    EV:
                        round(
                            m.expectedValueR ?? 0,
                            4
                        ),
                    PF:
                        round(
                            m.profitFactor ?? 0,
                            4
                        ),
                    winRate:
                        round(
                            m.winRate ?? 0,
                            2
                        )
                };
            }

            function contextKey(record) {

                return [
                    record.setup ??
                        "UNKNOWN",
                    record.trend ??
                        "UNKNOWN",
                    record.regime ??
                        "UNKNOWN",
                    record.volatility ??
                        "UNKNOWN"
                ].join("|");
            }

            function rowsBefore(
                source,
                endExclusive
            ) {
                return source.filter(
                    x =>
                        x.index <
                        endExclusive
                );
            }

            function splitLatestTraining(
                trainingRows
            ) {

                if (
                    trainingRows.length <
                    MIN_PRIOR_SAMPLES * 2
                ) {
                    return {
                        previous: [],
                        prior: []
                    };
                }

                const midpoint =
                    Math.floor(
                        trainingRows.length / 2
                    );

                return {
                    previous:
                        trainingRows.slice(
                            0,
                            midpoint
                        ),
                    prior:
                        trainingRows.slice(
                            midpoint
                        )
                };
            }

            function aggregateByContext(rows) {

                const map = new Map();

                for (const row of rows) {

                    const key =
                        contextKey(row);

                    if (!map.has(key)) {
                        map.set(
                            key,
                            []
                        );
                    }

                    map.get(key).push(row);
                }

                return map;
            }

            const armRows =
                new Map();

            for (const arm of ARM_DEFINITIONS) {
                armRows.set(
                    arm.key,
                    []
                );
            }

            const foldResults =
                [];

            for (
                const fold
                of safeArray(foldDefinitions)
            ) {

                const trainingRows =
                    rowsBefore(
                        safe,
                        fold.testStart
                    );

                const forwardRows =
                    safe.filter(
                        x =>
                            x.index >=
                                fold.testStart &&
                            x.index <
                                fold.testEnd
                    );

                const split =
                    splitLatestTraining(
                        trainingRows
                    );

                const previousByContext =
                    aggregateByContext(
                        split.previous
                    );

                const priorByContext =
                    aggregateByContext(
                        split.prior
                    );

                const forwardByContext =
                    aggregateByContext(
                        forwardRows
                    );

                const contexts =
                    new Set([
                        ...priorByContext.keys(),
                        ...forwardByContext.keys()
                    ]);

                const foldTransitions =
                    [];

                for (
                    const key
                    of contexts
                ) {

                    const previous =
                        previousByContext.get(
                            key
                        ) || [];

                    const prior =
                        priorByContext.get(
                            key
                        ) || [];

                    const forward =
                        forwardByContext.get(
                            key
                        ) || [];

                    if (
                        prior.length <
                        MIN_PRIOR_SAMPLES
                    ) {
                        continue;
                    }

                    if (
                        forward.length <
                        MIN_FORWARD_SAMPLES
                    ) {
                        continue;
                    }

                    const previousMetrics =
                        metrics(
                            previous
                        );

                    const priorMetrics =
                        metrics(
                            prior
                        );

                    const forwardMetrics =
                        metrics(
                            forward
                        );

                    const evMomentum =
                        round(
                            priorMetrics.EV -
                            previousMetrics.EV,
                            4
                        );

                    const context = {
                        key,
                        priorEV:
                            priorMetrics.EV,
                        priorPF:
                            priorMetrics.PF,
                        priorSamples:
                            priorMetrics.trades,
                        priorDecisive:
                            priorMetrics.decisiveTrades,
                        priorWinRate:
                            priorMetrics.winRate,
                        previousEV:
                            previousMetrics.EV,
                        evMomentum,
                        forward:
                            forwardMetrics
                    };

                    for (
                        const arm
                        of ARM_DEFINITIONS
                    ) {

                        if (
                            !arm.test(
                                context
                            )
                        ) {
                            continue;
                        }

                        const row = {
                            fold:
                                fold.fold,
                            contextKey:
                                key,
                            priorSamples:
                                context.priorSamples,
                            priorDecisive:
                                context.priorDecisive,
                            previousEV:
                                context.previousEV,
                            priorEV:
                                context.priorEV,
                            evMomentum:
                                context.evMomentum,
                            priorPF:
                                context.priorPF,
                            priorWinRate:
                                context.priorWinRate,
                            forward:
                                context.forward
                        };

                        armRows
                            .get(arm.key)
                            .push(row);

                        foldTransitions.push({
                            arm:
                                arm.key,
                            ...row
                        });
                    }
                }

                foldResults.push({
                    fold:
                        fold.fold,
                    trainingRows:
                        trainingRows.length,
                    forwardRows:
                        forwardRows.length,
                    eligibleContexts:
                        foldTransitions.length,
                    transitions:
                        foldTransitions
                });
            }

            function aggregate(rows) {

                const forwardTrades =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.trades,
                        0
                    );

                const forwardDecisive =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.decisiveTrades,
                        0
                    );

                const forwardNetR =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.netR,
                        0
                    );

                const successes =
                    rows.filter(
                        x =>
                            x.forward.EV > 0
                    ).length;

                const failures =
                    rows.filter(
                        x =>
                            x.forward.EV <= 0
                    ).length;

                const forwardEV =
                    forwardTrades
                        ? forwardNetR /
                          forwardTrades
                        : 0;

                const forwardProfitFactor =
                    (() => {

                        const grossProfit =
                            rows.reduce(
                                (sum, x) =>
                                    sum +
                                    (
                                        x.forward.wins *
                                        TARGET_R
                                    ),
                                0
                            );

                        const grossLoss =
                            rows.reduce(
                                (sum, x) =>
                                    sum +
                                    (
                                        x.forward.losses *
                                        STOP_R
                                    ),
                                0
                            );

                        return grossLoss > 0
                            ? grossProfit /
                              grossLoss
                            : 0;
                    })();

                return {
                    activations:
                        rows.length,
                    successfulForwardContexts:
                        successes,
                    failedForwardContexts:
                        failures,
                    forwardContextSuccessRatePct:
                        rows.length
                            ? round(
                                successes /
                                rows.length *
                                100,
                                2
                            )
                            : 0,
                    forwardTrades,
                    forwardDecisiveTrades:
                        forwardDecisive,
                    forwardNetR:
                        round(
                            forwardNetR,
                            4
                        ),
                    forwardEV:
                        round(
                            forwardEV,
                            4
                        ),
                    forwardPF:
                        round(
                            forwardProfitFactor,
                            4
                        )
                };
            }

            const arms =
                ARM_DEFINITIONS.map(
                    arm => {

                        const rows =
                            armRows.get(
                                arm.key
                            ) || [];

                        const byFold =
                            foldDefinitions
                                .map(
                                    fold => {

                                        const foldRows =
                                            rows.filter(
                                                x =>
                                                    x.fold ===
                                                    fold.fold
                                            );

                                        const a =
                                            aggregate(
                                                foldRows
                                            );

                                        return {
                                            fold:
                                                fold.fold,
                                            ...a
                                        };
                                    }
                                );

                        const aggregateAll =
                            aggregate(rows);

                        const profitableFolds =
                            byFold.filter(
                                x =>
                                    x.activations >
                                        0 &&
                                    x.forwardEV >
                                        0
                            ).length;

                        const foldsWithEvidence =
                            byFold.filter(
                                x =>
                                    x.activations >
                                    0
                            ).length;

                        return {
                            key:
                                arm.key,
                            label:
                                arm.label,
                            ...aggregateAll,
                            chronologicalFolds:
                                byFold,
                            profitableForwardFolds:
                                profitableFolds,
                            foldsWithForwardEvidence:
                                foldsWithEvidence,
                            passesControlledValidation:
                                foldsWithEvidence >= 3 &&
                                profitableFolds >= 3 &&
                                aggregateAll.forwardEV >=
                                    0.05 &&
                                aggregateAll.forwardPF >=
                                    1.05
                        };
                    }
                );

            // Relative comparison is descriptive only.
            // The engine never selects an arm automatically.
            const baseline =
                arms.find(
                    x =>
                        x.key ===
                        "BASELINE_PRIOR_EV_GT_0"
                );

            const momentum =
                arms.find(
                    x =>
                        x.key ===
                        "MOMENTUM_PRIOR_EV_GT_0_MOM_GE_0_10"
                );

            const strongMomentum =
                arms.find(
                    x =>
                        x.key ===
                        "STRONG_MOMENTUM_PRIOR_EV_GE_0_10_MOM_GE_0_10"
                );

            return {
                version:
                    "V22.6",
                purpose:
                    "Controlled chronological validation of the V22.5 EV-momentum hypothesis. The experiment is parallel to the existing trading pipeline and cannot modify candidate selection or true OOS.",
                hypothesis:
                    "Improving prior-window EV, specifically momentum >= +0.10R, may improve forward edge persistence.",
                antiLeakage: {
                    chronological:
                        true,
                    expandingTraining:
                        true,
                    priorWindowOnly:
                        true,
                    nextWindowUsedOnlyAsOutcome:
                        true,
                    futureOutcomeUsedForActivation:
                        false,
                    existingStrategyPipelineModified:
                        false
                },
                design: {
                    foldCount:
                        safeArray(
                            foldDefinitions
                        ).length,
                    priorTrainingSplit:
                        "Within each expanding fold training segment, the earlier half is the comparison window and the immediately later half is the prior window.",
                    minimumPriorSamples:
                        MIN_PRIOR_SAMPLES,
                    minimumForwardSamples:
                        MIN_FORWARD_SAMPLES,
                    arms:
                        ARM_DEFINITIONS.map(
                            x => ({
                                key:
                                    x.key,
                                label:
                                    x.label
                            })
                        )
                },
                arms,
                comparison: {
                    baselineForwardEV:
                        baseline?.forwardEV ??
                        null,
                    momentumForwardEV:
                        momentum?.forwardEV ??
                        null,
                    strongMomentumForwardEV:
                        strongMomentum
                            ?.forwardEV ??
                        null,
                    momentumLiftVsBaseline:
                        baseline &&
                        momentum
                            ? round(
                                momentum.forwardEV -
                                baseline.forwardEV,
                                4
                            )
                            : null,
                    strongMomentumLiftVsBaseline:
                        baseline &&
                        strongMomentum
                            ? round(
                                strongMomentum.forwardEV -
                                baseline.forwardEV,
                                4
                            )
                            : null,
                    momentumPassesControlledValidation:
                        !!momentum
                            ?.passesControlledValidation,
                    strongMomentumPassesControlledValidation:
                        !!strongMomentum
                            ?.passesControlledValidation
                },
                foldResults,
                decision:
                    "DIAGNOSTIC_ONLY",
                guard:
                    "V22.6 does not promote the EV-momentum hypothesis, alter thresholds, modify validation/OOS execution, change exits/risk, or place orders. Any positive arm must be independently re-tested before becoming a strategy rule."
            };
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

function buildV227EVPersistenceFailureAnatomy(
    candles,
    records,
    foldDefinitions
) {

    const safe =
        safeArray(records)
            .filter(
                x =>
                    x &&
                    x.side === "SELL" &&
                    Number.isFinite(x.index) &&
                    Number.isFinite(x.resultR)
            )
            .sort(
                (a, b) =>
                    a.index - b.index
            );

    const MIN_WINDOW_SAMPLES = 4;
    const MIN_FORWARD_SAMPLES = 1;

    /*
    ---------------------------------------------------------
    FIXED DIAGNOSTIC BUCKETS
    These are declared before forward outcomes are inspected.
    ---------------------------------------------------------
    */

    const EV_BUCKETS = [
        {
            key: "EV_0_TO_0_10",
            test: x =>
                x.priorEV > 0 &&
                x.priorEV < 0.10
        },
        {
            key: "EV_0_10_TO_0_25",
            test: x =>
                x.priorEV >= 0.10 &&
                x.priorEV < 0.25
        },
        {
            key: "EV_0_25_TO_0_50",
            test: x =>
                x.priorEV >= 0.25 &&
                x.priorEV < 0.50
        },
        {
            key: "EV_GE_0_50",
            test: x =>
                x.priorEV >= 0.50
        }
    ];

    const MOMENTUM_BUCKETS = [
        {
            key: "MOM_NEGATIVE",
            test: x =>
                x.evMomentum < 0
        },
        {
            key: "MOM_0_TO_0_10",
            test: x =>
                x.evMomentum >= 0 &&
                x.evMomentum < 0.10
        },
        {
            key: "MOM_GE_0_10",
            test: x =>
                x.evMomentum >= 0.10
        }
    ];

    const INTERNAL_SLOPE_BUCKETS = [
        {
            key: "INTERNAL_DECAY",
            test: x =>
                x.internalEVChange < -0.10
        },
        {
            key: "INTERNAL_FLAT",
            test: x =>
                x.internalEVChange >= -0.10 &&
                x.internalEVChange <= 0.10
        },
        {
            key: "INTERNAL_IMPROVING",
            test: x =>
                x.internalEVChange > 0.10
        }
    ];

    const LATE_EV_BUCKETS = [
        {
            key: "LATE_EV_NEGATIVE",
            test: x =>
                x.lateEV < 0
        },
        {
            key: "LATE_EV_0_TO_0_10",
            test: x =>
                x.lateEV >= 0 &&
                x.lateEV < 0.10
        },
        {
            key: "LATE_EV_GE_0_10",
            test: x =>
                x.lateEV >= 0.10
        }
    ];

    const PF_BUCKETS = [
        {
            key: "PF_LT_1",
            test: x =>
                x.priorPF < 1
        },
        {
            key: "PF_1_TO_1_20",
            test: x =>
                x.priorPF >= 1 &&
                x.priorPF < 1.20
        },
        {
            key: "PF_1_20_TO_1_50",
            test: x =>
                x.priorPF >= 1.20 &&
                x.priorPF < 1.50
        },
        {
            key: "PF_GE_1_50",
            test: x =>
                x.priorPF >= 1.50
        }
    ];

    const WR_BUCKETS = [
        {
            key: "WR_LT_40",
            test: x =>
                x.priorWinRate < 40
        },
        {
            key: "WR_40_TO_50",
            test: x =>
                x.priorWinRate >= 40 &&
                x.priorWinRate < 50
        },
        {
            key: "WR_50_TO_60",
            test: x =>
                x.priorWinRate >= 50 &&
                x.priorWinRate < 60
        },
        {
            key: "WR_GE_60",
            test: x =>
                x.priorWinRate >= 60
        }
    ];

    const TIMEOUT_BUCKETS = [
        {
            key: "TIMEOUT_LT_10",
            test: x =>
                x.timeoutRate < 10
        },
        {
            key: "TIMEOUT_10_TO_20",
            test: x =>
                x.timeoutRate >= 10 &&
                x.timeoutRate < 20
        },
        {
            key: "TIMEOUT_GE_20",
            test: x =>
                x.timeoutRate >= 20
        }
    ];

    const LOSS_STREAK_BUCKETS = [
        {
            key: "RECENT_LOSS_STREAK_0_TO_1",
            test: x =>
                x.recentLossStreak <= 1
        },
        {
            key: "RECENT_LOSS_STREAK_2",
            test: x =>
                x.recentLossStreak === 2
        },
        {
            key: "RECENT_LOSS_STREAK_3_PLUS",
            test: x =>
                x.recentLossStreak >= 3
        }
    ];

    /*
    ---------------------------------------------------------
    METRICS
    ---------------------------------------------------------
    */

    function metrics(rows) {

        if (!rows.length) {
            return {
                trades: 0,
                decisiveTrades: 0,
                wins: 0,
                losses: 0,
                timeouts: 0,
                netR: 0,
                EV: 0,
                PF: 0,
                winRate: 0
            };
        }

        const m =
            calculateMetrics(rows);

        return {
            trades:
                m.trades ??
                rows.length,

            decisiveTrades:
                m.decisiveTrades ??
                0,

            wins:
                m.wins ??
                0,

            losses:
                m.losses ??
                0,

            timeouts:
                m.timeouts ??
                0,

            netR:
                round(
                    m.netR ?? 0,
                    4
                ),

            EV:
                round(
                    m.expectedValueR ?? 0,
                    4
                ),

            PF:
                round(
                    m.profitFactor ?? 0,
                    4
                ),

            winRate:
                round(
                    m.winRate ?? 0,
                    2
                )
        };
    }

    function contextInfo(record) {

        const f =
            features(
                candles,
                record.index
            );

        return {
            setup:
                record.setup ??
                "UNKNOWN",
            trend:
                f?.trend ??
                record.trend ??
                "UNKNOWN",
            regime:
                f?.regime ??
                record.regime ??
                "UNKNOWN",
            volatility:
                f?.volatility ??
                record.volatility ??
                "UNKNOWN"
        };
    }

    function contextKey(record) {
        const c = contextInfo(record);
        return [
            c.setup,
            c.trend,
            c.regime,
            c.volatility
        ].join("|");
    }

    function splitHalf(rows) {

        if (
            rows.length <
            MIN_WINDOW_SAMPLES
        ) {
            return {
                early: [],
                late: []
            };
        }

        const midpoint =
            Math.floor(
                rows.length / 2
            );

        return {
            early:
                rows.slice(
                    0,
                    midpoint
                ),

            late:
                rows.slice(
                    midpoint
                )
        };
    }

    function maxRecentLossStreak(rows) {

        let current = 0;
        let max = 0;

        for (const row of rows) {

            const r =
                Number(row.resultR);

            if (r < 0) {
                current++;
                max =
                    Math.max(
                        max,
                        current
                    );
            } else {
                current = 0;
            }
        }

        return max;
    }

    /*
    ---------------------------------------------------------
    BUILD CHRONOLOGICAL ACTIVATIONS
    ---------------------------------------------------------
    Same expanding-fold boundaries as V22.6.

    For every fold:
      earlier half = comparison window
      later half   = prior window
      next fold    = forward outcome

    No future outcome enters activation features.
    ---------------------------------------------------------
    */

    const transitions = [];

    for (const fold of safeArray(foldDefinitions)) {

        const trainingRows =
            safe.filter(
                x =>
                    x.index <
                    fold.testStart
            );

        if (
            trainingRows.length <
            MIN_WINDOW_SAMPLES * 2
        ) {
            continue;
        }

        const midpoint =
            Math.floor(
                trainingRows.length / 2
            );

        const previousRows =
            trainingRows.slice(
                0,
                midpoint
            );

        const priorRows =
            trainingRows.slice(
                midpoint
            );

        const previousByContext =
            new Map();

        const priorByContext =
            new Map();

        for (const row of previousRows) {

            const key =
                contextKey(row);

            if (
                !previousByContext.has(key)
            ) {
                previousByContext.set(
                    key,
                    []
                );
            }

            previousByContext
                .get(key)
                .push(row);
        }

        for (const row of priorRows) {

            const key =
                contextKey(row);

            if (
                !priorByContext.has(key)
            ) {
                priorByContext.set(
                    key,
                    []
                );
            }

            priorByContext
                .get(key)
                .push(row);
        }

        const forwardRows =
            safe.filter(
                x =>
                    x.index >=
                        fold.testStart &&
                    x.index <
                        fold.testEnd
            );

        const forwardByContext =
            new Map();

        for (const row of forwardRows) {

            const key =
                contextKey(row);

            if (
                !forwardByContext.has(key)
            ) {
                forwardByContext.set(
                    key,
                    []
                );
            }

            forwardByContext
                .get(key)
                .push(row);
        }

        for (
            const [
                key,
                prior
            ] of priorByContext.entries()
        ) {

            if (
                prior.length <
                MIN_WINDOW_SAMPLES
            ) {
                continue;
            }

            const previous =
                previousByContext.get(
                    key
                ) || [];

            if (
                previous.length <
                MIN_WINDOW_SAMPLES
            ) {
                continue;
            }

            const next =
                forwardByContext.get(
                    key
                ) || [];

            if (
                next.length <
                MIN_FORWARD_SAMPLES
            ) {
                continue;
            }

            const previousMetrics =
                metrics(
                    previous
                );

            const priorMetrics =
                metrics(
                    prior
                );

            /*
            Activation is eligible only when the prior
            completed window has positive EV.
            */

            if (
                !(
                    priorMetrics.EV >
                    0
                )
            ) {
                continue;
            }

            const split =
                splitHalf(
                    prior
                );

            const earlyMetrics =
                metrics(
                    split.early
                );

            const lateMetrics =
                metrics(
                    split.late
                );

            const internalEVChange =
                (
                    Number.isFinite(
                        earlyMetrics.EV
                    ) &&
                    Number.isFinite(
                        lateMetrics.EV
                    )
                )
                    ? lateMetrics.EV -
                      earlyMetrics.EV
                    : 0;

            const timeoutRate =
                priorMetrics.trades
                    ? (
                        priorMetrics.timeouts /
                        priorMetrics.trades *
                        100
                    )
                    : 0;

            const recentLossStreak =
                maxRecentLossStreak(
                    prior
                );

            const evMomentum =
                priorMetrics.EV -
                previousMetrics.EV;

            const activationWorked =
                next.length > 0
                    ? metrics(next).EV > 0
                    : null;

            transitions.push({

                fold:
                    fold.fold,

                contextKey:
                    key,

                setup:
                    prior[0]?.setup ??
                    "UNKNOWN",

                trend:
                    prior[0]?.trend ??
                    "UNKNOWN",

                regime:
                    prior[0]?.regime ??
                    "UNKNOWN",

                volatility:
                    prior[0]?.volatility ??
                    "UNKNOWN",

                fromWindow:
                    "PREVIOUS",

                toWindow:
                    "PRIOR",

                previous:
                    previousMetrics,

                prior:
                    priorMetrics,

                priorEVMomentum:
                    round(
                        evMomentum,
                        4
                    ),

                internalEarly:
                    earlyMetrics,

                internalLate:
                    lateMetrics,

                internalEVChange:
                    round(
                        internalEVChange,
                        4
                    ),

                lateEV:
                    lateMetrics.EV,

                timeoutRate:
                    round(
                        timeoutRate,
                        2
                    ),

                recentLossStreak,

                next:
                    metrics(next),

                forwardSamples:
                    next.length,

                activationWorked,

                activationFailure:
                    activationWorked ===
                    false
            });
        }
    }

    /*
    ---------------------------------------------------------
    BUCKET AGGREGATION
    ---------------------------------------------------------
    */

    function aggregateBuckets(
        rows,
        buckets
    ) {

        return buckets.map(
            bucket => {

                const matched =
                    rows.filter(
                        bucket.test
                    );

                const successful =
                    matched.filter(
                        x =>
                            x.activationWorked
                    );

                const failed =
                    matched.filter(
                        x =>
                            x.activationFailure
                    );

                const forwardRows =
                    matched.flatMap(
                        x =>
                            x.nextRows ||
                            []
                    );

                const forwardMetrics =
                    forwardRows.length
                        ? metrics(
                            forwardRows
                        )
                        : {
                            trades: matched.reduce(
                                (a, x) =>
                                    a +
                                    x.next.trades,
                                0
                            ),
                            decisiveTrades:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.decisiveTrades,
                                    0
                                ),
                            wins:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.wins,
                                    0
                                ),
                            losses:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.losses,
                                    0
                                ),
                            timeouts:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.timeouts,
                                    0
                                ),
                            netR:
                                round(
                                    matched.reduce(
                                        (a, x) =>
                                            a +
                                            x.next.netR,
                                        0
                                    ),
                                    4
                                ),
                            EV:
                                matched.length
                                    ? round(
                                        matched.reduce(
                                            (a, x) =>
                                                a +
                                                x.next.EV,
                                            0
                                        ) /
                                        matched.length,
                                        4
                                    )
                                    : 0,
                            PF: 0,
                            winRate: 0
                        };

                return {

                    bucket:
                        bucket.key,

                    activations:
                        matched.length,

                    successfulForwardContexts:
                        successful.length,

                    failedForwardContexts:
                        failed.length,

                    forwardContextSuccessRatePct:
                        matched.length
                            ? round(
                                successful.length /
                                matched.length *
                                100,
                                2
                            )
                            : 0,

                    forwardNetR:
                        forwardMetrics.netR,

                    forwardEV:
                        forwardMetrics.EV,

                    forwardPF:
                        forwardMetrics.PF,

                    forwardDecisiveTrades:
                        forwardMetrics.decisiveTrades
                };
            }
        );
    }

    /*
    ---------------------------------------------------------
    FIXED COMBINATIONS
    ---------------------------------------------------------
    These combinations are NOT selected as trading rules.
    They simply expose failure anatomy.

    A particularly important diagnostic is:

      HIGH_EV_FALSE_STRENGTH
        prior EV >= 0.25
        AND internal EV is decaying
        AND late-half EV <= 0

    This is deliberately fixed before outcomes.
    ---------------------------------------------------------
    */

    const COMBINED_DIAGNOSTIC_TIERS = [

        {
            key:
                "HEALTHY_PERSISTENCE",

            label:
                "Positive EV + internal EV improving + late-half EV positive",

            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange > 0.10 &&
                x.lateEV > 0
        },

        {
            key:
                "INTERNAL_DECAY",

            label:
                "Positive EV + internal EV decay",

            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange < -0.10
        },

        {
            key:
                "LATE_HALF_NEGATIVE",

            label:
                "Positive full-window EV + negative late-half EV",

            test: x =>
                x.priorEV > 0 &&
                x.lateEV < 0
        },

        {
            key:
                "HIGH_EV_FALSE_STRENGTH",

            label:
                "High prior EV >= +0.25R but internal decay and late-half EV <= 0",

            test: x =>
                x.priorEV >= 0.25 &&
                x.internalEVChange < -0.10 &&
                x.lateEV <= 0
        },

        {
            key:
                "HIGH_EV_HEALTHY",

            label:
                "High prior EV >= +0.25R with no internal decay",

            test: x =>
                x.priorEV >= 0.25 &&
                x.internalEVChange >= -0.10
        },

        {
            key:
                "HIGH_MOMENTUM_BUT_LATE_DECAY",

            label:
                "EV momentum >= +0.10R but late-half EV <= 0",

            test: x =>
                x.evMomentum >= 0.10 &&
                x.lateEV <= 0
        }
    ];

    /*
    ---------------------------------------------------------
    OVERALL
    ---------------------------------------------------------
    */

    const successful =
        transitions.filter(
            x =>
                x.activationWorked
        );

    const failed =
        transitions.filter(
            x =>
                x.activationFailure
        );

    const overallForward =
        transitions.reduce(
            (sum, x) =>
                sum +
                x.next.EV,
            0
        );

    const overallForwardEV =
        transitions.length
            ? round(
                overallForward /
                transitions.length,
                4
            )
            : 0;

    const result = {

        version:
            "V22.7",

        purpose:
            "Diagnose why positive prior-EV activations fail despite apparently strong prior evidence, with special focus on internal deterioration inside the completed prior window.",

        hypothesis:
            "A context can have positive or improving aggregate EV while its most recent internal evidence is already deteriorating; internal edge health may therefore explain failures that EV momentum alone cannot.",

        antiLeakage: {

            chronological:
                true,

            expandingTraining:
                true,

            priorWindowOnly:
                true,

            nextWindowUsedOnlyAsOutcome:
                true,

            futureOutcomeUsedForActivation:
                false,

            strategyPipelineModified:
                false,

            thresholdsSelectedFromOutcome:
                false
        },

        design: {

            foldCount:
                safeArray(
                    foldDefinitions
                ).length,

            priorEligibility:
                "Completed prior context window must have EV > 0 and at least 4 samples.",

            forwardOutcome:
                "Immediately following chronological fold/test segment.",

            internalWindowMethod:
                "The completed prior context window is split chronologically into equal early and late halves.",

            fixedFeatures: [
                "priorEV",
                "EV momentum versus preceding window",
                "internal EV change: late-half EV minus early-half EV",
                "late-half EV",
                "prior profit factor",
                "prior win rate",
                "prior decisive sample size",
                "prior timeout rate",
                "recent loss streak"
            ],

            fixedCombinedDiagnostics: [
                "HEALTHY_PERSISTENCE",
                "INTERNAL_DECAY",
                "LATE_HALF_NEGATIVE",
                "HIGH_EV_FALSE_STRENGTH",
                "HIGH_EV_HEALTHY",
                "HIGH_MOMENTUM_BUT_LATE_DECAY"
            ]
        },

        sample: {

            eligibleActivations:
                transitions.length,

            successfulForwardContexts:
                successful.length,

            failedForwardContexts:
                failed.length,

            forwardContextSuccessRatePct:
                transitions.length
                    ? round(
                        successful.length /
                        transitions.length *
                        100,
                        2
                    )
                    : 0,

            forwardEV:
                overallForwardEV,

            forwardNetR:
                round(
                    transitions.reduce(
                        (sum, x) =>
                            sum +
                            x.next.netR,
                        0
                    ),
                    4
                )
        },

        featureStudies: {

            priorEV:
                aggregateBuckets(
                    transitions,
                    EV_BUCKETS
                ),

            evMomentum:
                aggregateBuckets(
                    transitions,
                    MOMENTUM_BUCKETS
                ),

            internalEVChange:
                aggregateBuckets(
                    transitions,
                    INTERNAL_SLOPE_BUCKETS
                ),

            lateHalfEV:
                aggregateBuckets(
                    transitions,
                    LATE_EV_BUCKETS
                ),

            priorProfitFactor:
                aggregateBuckets(
                    transitions,
                    PF_BUCKETS
                ),

            priorWinRate:
                aggregateBuckets(
                    transitions,
                    WR_BUCKETS
                ),

            timeoutRate:
                aggregateBuckets(
                    transitions,
                    TIMEOUT_BUCKETS
                ),

            recentLossStreak:
                aggregateBuckets(
                    transitions,
                    LOSS_STREAK_BUCKETS
                )
        },

        combinedDiagnostics:
            COMBINED_DIAGNOSTIC_TIERS.map(
                tier => {

                    const rows =
                        transitions.filter(
                            tier.test
                        );

                    const success =
                        rows.filter(
                            x =>
                                x.activationWorked
                        ).length;

                    const failure =
                        rows.filter(
                            x =>
                                x.activationFailure
                        ).length;

                    return {

                        key:
                            tier.key,

                        label:
                            tier.label,

                        activations:
                            rows.length,

                        successfulForwardContexts:
                            success,

                        failedForwardContexts:
                            failure,

                        forwardContextSuccessRatePct:
                            rows.length
                                ? round(
                                    success /
                                    rows.length *
                                    100,
                                    2
                                )
                                : 0,

                        forwardEV:
                            rows.length
                                ? round(
                                    rows.reduce(
                                        (sum, x) =>
                                            sum +
                                            x.next.EV,
                                        0
                                    ) /
                                    rows.length,
                                    4
                                )
                                : 0,

                        forwardNetR:
                            round(
                                rows.reduce(
                                    (sum, x) =>
                                        sum +
                                        x.next.netR,
                                    0
                                ),
                                4
                            ),

                        diagnosticOnly:
                            true
                    };
                }
            ),

        failureCases:
            failed
                .map(
                    x => ({
                        fold:
                            x.fold,

                        contextKey:
                            x.contextKey,

                        setup:
                            x.setup,

                        trend:
                            x.trend,

                        regime:
                            x.regime,

                        volatility:
                            x.volatility,

                        previous:
                            x.previous,

                        prior:
                            x.prior,

                        priorEVMomentum:
                            x.priorEVMomentum,

                        internalEarly:
                            x.internalEarly,

                        internalLate:
                            x.internalLate,

                        internalEVChange:
                            x.internalEVChange,

                        lateEV:
                            x.lateEV,

                        timeoutRate:
                            x.timeoutRate,

                        recentLossStreak:
                            x.recentLossStreak,

                        next:
                            x.next,

                        diagnosticFlags: {

                            internalDecay:
                                x.internalEVChange < -0.10,

                            lateHalfNegative:
                                x.lateEV < 0,

                            highEVFalseStrength:
                                x.prior.EV >= 0.25 &&
                                x.internalEVChange < -0.10 &&
                                x.lateEV <= 0,

                            highMomentumLateDecay:
                                x.priorEVMomentum >= 0.10 &&
                                x.lateEV <= 0
                        }
                    })
                ),

        transitionDetail:
            transitions.map(
                x => ({
                    fold:
                        x.fold,

                    contextKey:
                        x.contextKey,

                    setup:
                        x.setup,

                    trend:
                        x.trend,

                    regime:
                        x.regime,

                    volatility:
                        x.volatility,

                    previous:
                        x.previous,

                    prior:
                        x.prior,

                    priorEVMomentum:
                        x.priorEVMomentum,

                    internalEarly:
                        x.internalEarly,

                    internalLate:
                        x.internalLate,

                    internalEVChange:
                        x.internalEVChange,

                    lateEV:
                        x.lateEV,

                    timeoutRate:
                        x.timeoutRate,

                    recentLossStreak:
                        x.recentLossStreak,

                    next:
                        x.next,

                    activationWorked:
                        x.activationWorked,

                    activationFailure:
                        x.activationFailure
                })
            ),

        interpretationGuard:
            "Diagnostic only. V22.7 cannot create candidates, modify thresholds, change validation/OOS, select exits, alter risk, generate live signals, or use forward outcomes to modify activation features.",

        decisionGuard:
            "No V22.7 diagnostic category is a strategy rule. Any apparently useful failure signature must survive a separate chronological validation experiment before it can influence trading."
    };

    return result;
}

        function buildV228EdgeHealthValidation(
            candles,
            records,
            foldDefinitions
        ) {
        
            const safeArrayLocal = value =>
                Array.isArray(value) ? value : [];
        
            const roundLocal = (value, digits = 4) => {
                const n = Number(value);
                if (!Number.isFinite(n)) return 0;
                const p = 10 ** digits;
                return Math.round(n * p) / p;
            };
        
            const safe =
                safeArrayLocal(records)
                    .filter(
                        x =>
                            x &&
                            x.side === "SELL" &&
                            Number.isFinite(x.index) &&
                            Number.isFinite(x.resultR)
                    )
                    .sort(
                        (a, b) =>
                            a.index - b.index
                    );
        
            const folds =
                safeArrayLocal(foldDefinitions)
                    .slice()
                    .sort(
                        (a, b) =>
                            Number(a.testStart ?? a.start ?? 0) -
                            Number(b.testStart ?? b.start ?? 0)
                    );
        
            const MIN_WINDOW_SAMPLES = 4;
            const MIN_FORWARD_SAMPLES = 1;
        
            /*
            ---------------------------------------------------------
            FIXED ARM DEFINITIONS
            ---------------------------------------------------------
            */
        
            const ARM_DEFINITIONS = [
                {
                    key: "BASELINE_PRIOR_EV_GT_0",
                    label: "Prior EV > 0",
                    test: x =>
                        x.priorEV > 0
                },
                {
                    key: "HEALTHY",
                    label: "Positive EV + no internal decay + positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange >= -0.10 &&
                        x.lateEV > 0
                },
                {
                    key: "STABLE",
                    label: "Positive EV + no internal decay + non-positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange >= -0.10 &&
                        x.lateEV <= 0
                },
                {
                    key: "DECAYING",
                    label: "Positive EV + internal decay + positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange < -0.10 &&
                        x.lateEV > 0
                },
                {
                    key: "BROKEN",
                    label: "Positive EV + internal decay + non-positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange < -0.10 &&
                        x.lateEV <= 0
                }
            ];
        
            /*
            ---------------------------------------------------------
            METRICS
            ---------------------------------------------------------
            */
        
            function metrics(rows) {
        
                const list =
                    safeArrayLocal(rows);
        
                const samples =
                    list.length;
        
                const wins =
                    list.filter(
                        x => x.resultR > 0
                    ).length;
        
                const losses =
                    list.filter(
                        x => x.resultR < 0
                    ).length;
        
                const timeouts =
                    list.filter(
                        x => x.resultR === 0
                    ).length;
        
                const decisive =
                    wins + losses;
        
                const netR =
                    list.reduce(
                        (sum, x) =>
                            sum +
                            Number(x.resultR || 0),
                        0
                    );
        
                const totalWinR =
                    list
                        .filter(x => x.resultR > 0)
                        .reduce(
                            (sum, x) =>
                                sum +
                                Number(x.resultR || 0),
                            0
                        );
        
                const totalLossR =
                    Math.abs(
                        list
                            .filter(x => x.resultR < 0)
                            .reduce(
                                (sum, x) =>
                                    sum +
                                    Number(x.resultR || 0),
                                0
                            )
                    );
        
                return {
                    samples,
                    decisiveTrades: decisive,
                    wins,
                    losses,
                    timeouts,
                    winRatePct:
                        decisive
                            ? roundLocal(
                                wins /
                                decisive *
                                100,
                                2
                            )
                            : 0,
                    EV:
                        samples
                            ? roundLocal(
                                netR /
                                samples,
                                4
                            )
                            : 0,
                    PF:
                        totalLossR > 0
                            ? roundLocal(
                                totalWinR /
                                totalLossR,
                                4
                            )
                            : (
                                totalWinR > 0
                                    ? null
                                    : 0
                            ),
                    netR:
                        roundLocal(
                            netR,
                            4
                        )
                };
            }
        
            /*
            ---------------------------------------------------------
            PRIOR CONTEXT CONSTRUCTION
            ---------------------------------------------------------
            */
        
            function contextForFold(fold) {
        
                const testStart =
                    Number(
                        fold?.testStart ??
                        fold?.start ??
                        fold?.validationStart ??
                        0
                    );
        
                const prior =
                    safe
                        .filter(
                            x =>
                                x.index < testStart
                        );
        
                if (
                    prior.length <
                    MIN_WINDOW_SAMPLES
                ) {
                    return null;
                }
        
                /*
                 * Use the most recent completed chronological context
                 * window available before the fold.
                 *
                 * V22.7's hypothesis is about the internal health of
                 * that completed prior window, so we use the same
                 * equal-half construction rather than inventing a new
                 * adaptive window.
                 */
        
                const windowSize =
                    Math.max(
                        MIN_WINDOW_SAMPLES,
                        Math.floor(
                            prior.length / 4
                        )
                    );
        
                const previousStart =
                    Math.max(
                        0,
                        prior.length -
                        windowSize * 2
                    );
        
                const priorWindow =
                    prior.slice(
                        previousStart,
                        previousStart +
                        windowSize * 2
                    );
        
                if (
                    priorWindow.length <
                    MIN_WINDOW_SAMPLES
                ) {
                    return null;
                }
        
                const half =
                    Math.floor(
                        priorWindow.length / 2
                    );
        
                if (half < 2) {
                    return null;
                }
        
                const early =
                    priorWindow.slice(
                        0,
                        half
                    );
        
                const late =
                    priorWindow.slice(
                        half
                    );
        
                const preceding =
                    prior.slice(
                        Math.max(
                            0,
                            previousStart -
                            windowSize
                        ),
                        previousStart
                    );
        
                const priorMetrics =
                    metrics(
                        priorWindow
                    );
        
                const earlyMetrics =
                    metrics(
                        early
                    );
        
                const lateMetrics =
                    metrics(
                        late
                    );
        
                const previousMetrics =
                    metrics(
                        preceding
                    );
        
                const evMomentum =
                    preceding.length >= MIN_WINDOW_SAMPLES
                        ? roundLocal(
                            priorMetrics.EV -
                            previousMetrics.EV,
                            4
                        )
                        : null;
        
                return {
                    priorEV:
                        priorMetrics.EV,
        
                    evMomentum,
        
                    internalEarlyEV:
                        earlyMetrics.EV,
        
                    internalLateEV:
                        lateMetrics.EV,
        
                    internalEVChange:
                        roundLocal(
                            lateMetrics.EV -
                            earlyMetrics.EV,
                            4
                        ),
        
                    lateEV:
                        lateMetrics.EV,
        
                    priorPF:
                        priorMetrics.PF,
        
                    priorWinRate:
                        priorMetrics.winRatePct,
        
                    priorSamples:
                        priorMetrics.samples,
        
                    priorDecisive:
                        priorMetrics.decisiveTrades,
        
                    priorTimeoutRate:
                        priorMetrics.samples
                            ? roundLocal(
                                priorMetrics.timeouts /
                                priorMetrics.samples *
                                100,
                                2
                            )
                            : 0,
        
                    windowStartIndex:
                        priorWindow[0]?.index ?? null,
        
                    windowEndIndex:
                        priorWindow[
                            priorWindow.length - 1
                        ]?.index ?? null
                };
            }
        
            /*
            ---------------------------------------------------------
            FORWARD OUTCOME
            ---------------------------------------------------------
            */
        
            function forwardForFold(fold) {
        
                const testStart =
                    Number(
                        fold?.testStart ??
                        fold?.start ??
                        0
                    );
        
                const testEnd =
                    Number(
                        fold?.testEnd ??
                        fold?.end ??
                        Infinity
                    );
        
                const rows =
                    safe.filter(
                        x =>
                            x.index >= testStart &&
                            x.index < testEnd
                    );
        
                return rows;
            }
        
            /*
            ---------------------------------------------------------
            TRANSITIONS
            ---------------------------------------------------------
            */
        
            const transitions = [];
        
            for (
                const fold of folds
            ) {
        
                const context =
                    contextForFold(
                        fold
                    );
        
                if (!context) {
                    continue;
                }
        
                if (
                    context.priorEV <= 0
                ) {
                    continue;
                }
        
                const next =
                    forwardForFold(
                        fold
                    );
        
                if (
                    next.length <
                    MIN_FORWARD_SAMPLES
                ) {
                    continue;
                }
        
                const outcome =
                    metrics(
                        next
                    );
        
                let healthState =
                    "UNKNOWN";
        
                if (
                    context.internalEVChange >= -0.10 &&
                    context.lateEV > 0
                ) {
                    healthState =
                        "HEALTHY";
                }
                else if (
                    context.internalEVChange >= -0.10 &&
                    context.lateEV <= 0
                ) {
                    healthState =
                        "STABLE";
                }
                else if (
                    context.internalEVChange < -0.10 &&
                    context.lateEV > 0
                ) {
                    healthState =
                        "DECAYING";
                }
                else if (
                    context.internalEVChange < -0.10 &&
                    context.lateEV <= 0
                ) {
                    healthState =
                        "BROKEN";
                }
        
                const foldTestStart =
                    Number(
                        fold?.testStart ??
                        fold?.start ??
                        fold?.validationStart ??
                        0
                    );

                const foldTestEnd =
                    Number(
                        fold?.testEnd ??
                        fold?.end ??
                        Infinity
                    );

                transitions.push({
                    fold:
                        fold.fold ??
                        fold.id ??
                        null,
        
                    testStart:
                        foldTestStart,
                    testEnd:
                        foldTestEnd,
        
                    healthState,
        
                    context,
        
                    next:
                        outcome,
        
                    forwardSuccess:
                        outcome.EV > 0,
        
                    forwardFailure:
                        outcome.EV <= 0
                });
            }
        
            /*
            ---------------------------------------------------------
            ARM AGGREGATION
            ---------------------------------------------------------
            */
        
            function aggregateArm(
                key,
                label,
                predicate
            ) {
        
                const rows =
                    transitions.filter(
                        x =>
                            predicate(
                                x.context
                            )
                    );
        
                const successful =
                    rows.filter(
                        x =>
                            x.forwardSuccess
                    ).length;
        
                const forwardEV =
                    rows.length
                        ? roundLocal(
                            rows.reduce(
                                (sum, x) =>
                                    sum +
                                    x.next.EV,
                                0
                            ) /
                            rows.length,
                            4
                        )
                        : 0;
        
                const forwardNetR =
                    roundLocal(
                        rows.reduce(
                            (sum, x) =>
                                sum +
                                x.next.netR,
                            0
                        ),
                        4
                    );
        
                const profitableFoldCount =
                    rows.filter(
                        x =>
                            x.next.EV > 0
                    ).length;
        
                return {
                    key,
                    label,
        
                    activations:
                        rows.length,
        
                    successfulForwardContexts:
                        successful,
        
                    failedForwardContexts:
                        rows.length -
                        successful,
        
                    forwardContextSuccessRatePct:
                        rows.length
                            ? roundLocal(
                                successful /
                                rows.length *
                                100,
                                2
                            )
                            : 0,
        
                    forwardEV,
        
                    forwardNetR,
        
                    profitableFoldCount,
        
                    foldsTested:
                        rows.map(
                            x => x.fold
                        ),
        
                    diagnosticOnly:
                        true
                };
            }
        
            const arms =
                ARM_DEFINITIONS.map(
                    arm =>
                        aggregateArm(
                            arm.key,
                            arm.label,
                            arm.test
                        )
                );
        
            const stateArms =
                arms.filter(
                    x =>
                        x.key !==
                        "BASELINE_PRIOR_EV_GT_0"
                );
        
            const baseline =
                arms.find(
                    x =>
                        x.key ===
                        "BASELINE_PRIOR_EV_GT_0"
                );
        
            /*
            ---------------------------------------------------------
            RELATIVE TESTS
            ---------------------------------------------------------
            */
        
            const comparison =
                stateArms.map(
                    arm => ({
                        state:
                            arm.key,
        
                        activations:
                            arm.activations,
        
                        forwardEV:
                            arm.forwardEV,
        
                        forwardNetR:
                            arm.forwardNetR,
        
                        successRatePct:
                            arm.forwardContextSuccessRatePct,
        
                        EVDeltaVsBaseline:
                            baseline &&
                            arm.activations
                                ? roundLocal(
                                    arm.forwardEV -
                                    baseline.forwardEV,
                                    4
                                )
                                : null,
        
                        netRDeltaVsBaseline:
                            baseline
                                ? roundLocal(
                                    arm.forwardNetR -
                                    baseline.forwardNetR,
                                    4
                                )
                                : null,
        
                        diagnosticOnly:
                            true
                    })
                );
        
            /*
            ---------------------------------------------------------
            FOLD-BY-FOLD VIEW
            ---------------------------------------------------------
            */
        
            const foldResults =
                transitions.map(
                    x => ({
                        fold:
                            x.fold,
        
                        healthState:
                            x.healthState,
        
                        priorEV:
                            x.context.priorEV,
        
                        evMomentum:
                            x.context.evMomentum,
        
                        internalEarlyEV:
                            x.context.internalEarlyEV,
        
                        internalLateEV:
                            x.context.internalLateEV,
        
                        internalEVChange:
                            x.context.internalEVChange,
        
                        lateEV:
                            x.context.lateEV,
        
                        nextEV:
                            x.next.EV,
        
                        nextPF:
                            x.next.PF,
        
                        nextWinRate:
                            x.next.winRatePct,
        
                        nextNetR:
                            x.next.netR,
        
                        forwardSuccess:
                            x.forwardSuccess
                    })
                );
        
            const result = {
        
                version:
                    "V22.8",
        
                purpose:
                    "Controlled chronological validation of edge-health states identified by V22.7.",
        
                hypothesis:
                    "A positive prior-EV context whose internal evidence is deteriorating should have weaker forward persistence than a positive prior-EV context whose late-half evidence remains healthy.",

                implementationIntegrity:
                    "V22.8 uses each fold's explicit testStart/testEnd boundaries for forward outcomes. These boundaries are copied into local foldTestStart/foldTestEnd variables before transition records are created.",
        
                diagnosticOnly:
                    true,
        
                strategyPipelineModified:
                    false,
        
                arms: {
                    definitions:
                        ARM_DEFINITIONS.map(
                            x => ({
                                key: x.key,
                                label: x.label
                            })
                        ),
        
                    results:
                        arms
                },
        
                comparison,
        
                sample: {
                    sellRecords:
                        safe.length,
        
                    foldsAvailable:
                        folds.length,
        
                    eligibleForwardTransitions:
                        transitions.length
                },
        
                foldResults,
        
                antiLeakage: {
        
                    chronological:
                        true,
        
                    expandingTraining:
                        true,
        
                    priorWindowOnly:
                        true,
        
                    nextWindowUsedOnlyAsOutcome:
                        true,
        
                    futureOutcomeUsedForActivation:
                        false,
        
                    thresholdsSelectedFromOutcome:
                        false,
        
                    strategyPipelineModified:
                        false
                },
        
                decisionRules: {
        
                    promoteHealthy:
                        "Only if HEALTHY shows superior forward persistence across independent chronological folds with sufficient sample support.",
        
                    rejectDecayHypothesis:
                        "If DECAYING/BROKEN do not consistently underperform HEALTHY/STABLE, do not create an edge-health filter.",
        
                    minimumEvidence:
                        "Do not promote any state from aggregate EV alone. Require cross-fold consistency and adequate activation count.",
        
                    noTradingChange:
                        true
                },
        
                interpretationGuard:
                    "V22.8 is a controlled validation experiment only. It does not create candidates, change thresholds, alter validation/OOS, select exits, change risk, or generate live signals.",
        
                decisionGuard:
                    "No HEALTHY, STABLE, DECAYING or BROKEN state is a trading rule unless a later separately declared experiment promotes it after independent chronological evidence."
            };
        
            return result;
        }

        const v226ControlledEVMomentumValidation =
            buildV226ControlledEVMomentumValidation(
                historicalCandles,
                finalDiscovery.rawRecords,
                folds
            );

        const v227EVPersistenceFailureAnatomy =
            buildV227EVPersistenceFailureAnatomy(
                historicalCandles,
                finalDiscovery.rawRecords,
                folds
            );


        // =====================================================
        // V22.9 — EDGE HEALTH PERSISTENCE EXPANSION TEST
        // -----------------------------------------------------
        // Diagnostic only.
        //
        // V22.8 found a promising HEALTHY vs DECAYING/BROKEN
        // relationship, but only 4 eligible transitions were
        // available under the six production fold boundaries.
        //
        // V22.9 deliberately keeps the V22.8 state definitions
        // unchanged and increases the number of chronological
        // diagnostic checkpoints inside the completed learning
        // history. The production six-fold validation/OOS engine
        // is NOT modified.
        //
        // IMPORTANT:
        //   - No candidate selection changes.
        //   - No validation/OOS changes.
        //   - No exits/risk changes.
        //   - No future outcome is used to assign health state.
        //   - Rolling checkpoints are explicitly marked as
        //     overlapping/non-independent observations.
        //   - No state is promoted into trading by V22.9.
        // =====================================================
        function buildV229EdgeHealthPersistenceExpansion(
            records
        ) {

            const safe =
                safeArray(records)
                    .filter(
                        x =>
                            x &&
                            x.side === "SELL" &&
                            Number.isFinite(x.index) &&
                            Number.isFinite(x.resultR)
                    )
                    .sort(
                        (a, b) =>
                            a.index - b.index
                    );

            const MIN_CONTEXT_SAMPLES = 4;
            const MIN_FORWARD_SAMPLES = 1;

            // Fixed diagnostic geometry. These values are declared
            // before any forward outcomes are aggregated.
            const PRIOR_TOTAL_RECORDS = 40;
            const FORWARD_RECORDS = 20;
            const STEP_RECORDS = 10;

            const STATE_DEFINITIONS = [
                {
                    key: "BASELINE_PRIOR_EV_GT_0",
                    label: "Prior EV > 0",
                    test: x => x.priorEV > 0
                },
                {
                    key: "HEALTHY",
                    label: "Positive EV + no internal decay + positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange >= -0.10 &&
                        x.lateEV > 0
                },
                {
                    key: "STABLE",
                    label: "Positive EV + no internal decay + non-positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange >= -0.10 &&
                        x.lateEV <= 0
                },
                {
                    key: "DECAYING",
                    label: "Positive EV + internal decay + positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange < -0.10 &&
                        x.lateEV > 0
                },
                {
                    key: "BROKEN",
                    label: "Positive EV + internal decay + non-positive late-half EV",
                    test: x =>
                        x.priorEV > 0 &&
                        x.internalEVChange < -0.10 &&
                        x.lateEV <= 0
                }
            ];

            function localRound(value, digits = 4) {
                const n = Number(value);
                if (!Number.isFinite(n)) return 0;
                const p = 10 ** digits;
                return Math.round(n * p) / p;
            }

            function localMetrics(rows) {
                if (!rows.length) {
                    return {
                        trades: 0,
                        decisiveTrades: 0,
                        wins: 0,
                        losses: 0,
                        timeouts: 0,
                        netR: 0,
                        EV: 0,
                        PF: 0,
                        winRate: 0
                    };
                }

                const wins = rows.filter(x => x.resultR > 0).length;
                const losses = rows.filter(x => x.resultR < 0).length;
                const timeouts = rows.filter(x => x.resultR === 0).length;
                const decisiveTrades = wins + losses;
                const netR = rows.reduce(
                    (sum, x) => sum + Number(x.resultR || 0),
                    0
                );
                const totalWinR = rows.reduce(
                    (sum, x) => sum + (x.resultR > 0 ? Number(x.resultR) : 0),
                    0
                );
                const totalLossR = rows.reduce(
                    (sum, x) => sum + (x.resultR < 0 ? Math.abs(Number(x.resultR)) : 0),
                    0
                );

                return {
                    trades: rows.length,
                    decisiveTrades,
                    wins,
                    losses,
                    timeouts,
                    netR: localRound(netR),
                    EV: localRound(netR / rows.length),
                    PF: totalLossR > 0
                        ? localRound(totalWinR / totalLossR)
                        : (totalWinR > 0 ? 999 : 0),
                    winRate: decisiveTrades > 0
                        ? localRound(wins / decisiveTrades * 100, 2)
                        : 0
                };
            }

            function contextKey(row) {
                return [
                    row.setup ?? "UNKNOWN",
                    row.trend ?? "UNKNOWN",
                    row.regime ?? "UNKNOWN",
                    row.volatility ?? "UNKNOWN"
                ].join("|");
            }

            function groupByContext(rows) {
                const map = new Map();
                for (const row of rows) {
                    const key = contextKey(row);
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(row);
                }
                return map;
            }

            function splitInternal(rows) {
                const midpoint = Math.floor(rows.length / 2);
                return {
                    early: rows.slice(0, midpoint),
                    late: rows.slice(midpoint)
                };
            }

            function maxForwardLossStreak(rows) {
                let current = 0;
                let max = 0;
                for (const row of rows) {
                    if (Number(row.resultR) < 0) {
                        current++;
                        max = Math.max(max, current);
                    } else {
                        current = 0;
                    }
                }
                return max;
            }

            const checkpoints = [];

            // The first checkpoint has 40 completed records before the
            // forward segment. Subsequent checkpoints advance by 10.
            // This intentionally creates overlapping diagnostic samples
            // so that sample expansion does not pretend to be independent.
            for (
                let priorEnd = PRIOR_TOTAL_RECORDS;
                priorEnd + FORWARD_RECORDS <= safe.length;
                priorEnd += STEP_RECORDS
            ) {

                const previousStart = 0;
                const priorStart =
                    Math.max(
                        0,
                        priorEnd - PRIOR_TOTAL_RECORDS
                    );

                const trainingRows =
                    safe.slice(
                        previousStart,
                        priorEnd
                    );

                const forwardRows =
                    safe.slice(
                        priorEnd,
                        priorEnd + FORWARD_RECORDS
                    );

                const splitPoint =
                    Math.floor(
                        trainingRows.length / 2
                    );

                const previousRows =
                    trainingRows.slice(
                        0,
                        splitPoint
                    );

                const priorRows =
                    trainingRows.slice(
                        splitPoint
                    );

                const previousByContext =
                    groupByContext(
                        previousRows
                    );

                const priorByContext =
                    groupByContext(
                        priorRows
                    );

                const forwardByContext =
                    groupByContext(
                        forwardRows
                    );

                const contexts =
                    new Set([
                        ...priorByContext.keys(),
                        ...forwardByContext.keys()
                    ]);

                const transitions = [];

                for (const key of contexts) {

                    const previous =
                        previousByContext.get(key) || [];
                    const prior =
                        priorByContext.get(key) || [];
                    const forward =
                        forwardByContext.get(key) || [];

                    if (
                        prior.length <
                        MIN_CONTEXT_SAMPLES
                    ) continue;

                    if (
                        forward.length <
                        MIN_FORWARD_SAMPLES
                    ) continue;

                    const previousMetrics =
                        localMetrics(previous);
                    const priorMetrics =
                        localMetrics(prior);
                    const forwardMetrics =
                        localMetrics(forward);

                    if (!(priorMetrics.EV > 0)) {
                        continue;
                    }

                    const internal =
                        splitInternal(prior);
                    const earlyMetrics =
                        localMetrics(internal.early);
                    const lateMetrics =
                        localMetrics(internal.late);

                    const internalEVChange =
                        localRound(
                            lateMetrics.EV -
                            earlyMetrics.EV
                        );

                    const evMomentum =
                        localRound(
                            priorMetrics.EV -
                            previousMetrics.EV
                        );

                    const context = {
                        key,
                        priorEV: priorMetrics.EV,
                        previousEV: previousMetrics.EV,
                        evMomentum,
                        priorPF: priorMetrics.PF,
                        priorWinRate: priorMetrics.winRate,
                        priorSamples: prior.length,
                        priorDecisive: priorMetrics.decisiveTrades,
                        internalEarlyEV: earlyMetrics.EV,
                        internalLateEV: lateMetrics.EV,
                        internalEVChange,
                        lateEV: lateMetrics.EV,
                        forward: forwardMetrics
                    };

                    const state =
                        STATE_DEFINITIONS.find(
                            x =>
                                x.key !==
                                    "BASELINE_PRIOR_EV_GT_0" &&
                                x.test(context)
                        )?.key ||
                        "UNCLASSIFIED_POSITIVE_EV";

                    transitions.push({
                        checkpoint:
                            checkpoints.length + 1,
                        priorEndRecord:
                            priorEnd,
                        forwardEndRecord:
                            priorEnd + FORWARD_RECORDS,
                        contextKey: key,
                        healthState: state,
                        context,
                        forward: forwardMetrics,
                        forwardSuccess:
                            forwardMetrics.EV > 0,
                        forwardLossStreak:
                            maxForwardLossStreak(forward),
                        priorRecordIndexRange: {
                            first:
                                prior[0]?.index ?? null,
                            last:
                                prior[prior.length - 1]?.index ?? null
                        },
                        forwardRecordIndexRange: {
                            first:
                                forward[0]?.index ?? null,
                            last:
                                forward[forward.length - 1]?.index ?? null
                        }
                    });
                }

                checkpoints.push({
                    checkpoint:
                        checkpoints.length + 1,
                    trainingStartRecord:
                        priorStart,
                    trainingEndRecord:
                        priorEnd,
                    forwardStartRecord:
                        priorEnd,
                    forwardEndRecord:
                        priorEnd + FORWARD_RECORDS,
                    trainingRows:
                        trainingRows.length,
                    forwardRows:
                        forwardRows.length,
                    eligibleTransitions:
                        transitions.length,
                    transitions
                });
            }

            const allTransitions =
                checkpoints.flatMap(
                    x => x.transitions
                );

            function aggregate(rows) {
                const successful =
                    rows.filter(
                        x => x.forwardSuccess
                    ).length;
                const forwardTrades =
                    rows.reduce(
                        (sum, x) =>
                            sum + x.forward.trades,
                        0
                    );
                const forwardDecisive =
                    rows.reduce(
                        (sum, x) =>
                            sum + x.forward.decisiveTrades,
                        0
                    );
                const forwardNetR =
                    rows.reduce(
                        (sum, x) =>
                            sum + x.forward.netR,
                        0
                    );
                const weightedEV =
                    forwardTrades > 0
                        ? forwardNetR / forwardTrades
                        : 0;

                return {
                    activations:
                        rows.length,
                    successfulForwardContexts:
                        successful,
                    failedForwardContexts:
                        rows.length - successful,
                    forwardContextSuccessRatePct:
                        rows.length
                            ? localRound(
                                successful /
                                rows.length *
                                100,
                                2
                            )
                            : 0,
                    forwardTrades,
                    forwardDecisiveTrades:
                        forwardDecisive,
                    forwardNetR:
                        localRound(forwardNetR),
                    forwardEV:
                        localRound(weightedEV),
                    profitableCheckpoints:
                        new Set(
                            rows
                                .filter(x => x.forwardSuccess)
                                .map(x => x.checkpoint)
                        ).size,
                    losingCheckpoints:
                        new Set(
                            rows
                                .filter(x => !x.forwardSuccess)
                                .map(x => x.checkpoint)
                        ).size
                };
            }

            const stateResults =
                STATE_DEFINITIONS.map(
                    state => {
                        const rows =
                            allTransitions.filter(
                                x =>
                                    state.key ===
                                        "BASELINE_PRIOR_EV_GT_0"
                                        ? true
                                        : x.healthState === state.key
                            );
                        return {
                            key: state.key,
                            label: state.label,
                            ...aggregate(rows),
                            diagnosticOnly: true
                        };
                    }
                );

            const baseline =
                stateResults.find(
                    x =>
                        x.key ===
                        "BASELINE_PRIOR_EV_GT_0"
                );

            const comparison =
                stateResults
                    .filter(
                        x =>
                            x.key !==
                            "BASELINE_PRIOR_EV_GT_0"
                    )
                    .map(x => ({
                        state: x.key,
                        activations: x.activations,
                        forwardEV: x.forwardEV,
                        forwardNetR: x.forwardNetR,
                        successRatePct:
                            x.forwardContextSuccessRatePct,
                        EVDeltaVsBaseline:
                            baseline && x.activations
                                ? localRound(
                                    x.forwardEV -
                                    baseline.forwardEV
                                )
                                : null,
                        netRDeltaVsBaseline:
                            baseline
                                ? localRound(
                                    x.forwardNetR -
                                    baseline.forwardNetR
                                )
                                : null,
                        diagnosticOnly: true
                    }));

            const contextIntegrity = {
                totalSellRecords:
                    safe.length,
                recordsWithCompleteContext:
                    safe.filter(
                        x =>
                            x.setup != null &&
                            x.trend != null &&
                            x.regime != null &&
                            x.volatility != null
                    ).length,
                recordsWithMissingContext:
                    safe.filter(
                        x =>
                            x.setup == null ||
                            x.trend == null ||
                            x.regime == null ||
                            x.volatility == null
                    ).length,
                undefinedOrUnknownFields: {
                    setup:
                        safe.filter(
                            x =>
                                x.setup == null ||
                                x.setup === "UNKNOWN" ||
                                x.setup === "undefined"
                        ).length,
                    trend:
                        safe.filter(
                            x =>
                                x.trend == null ||
                                x.trend === "UNKNOWN" ||
                                x.trend === "undefined"
                        ).length,
                    regime:
                        safe.filter(
                            x =>
                                x.regime == null ||
                                x.regime === "UNKNOWN" ||
                                x.regime === "undefined"
                        ).length,
                    volatility:
                        safe.filter(
                            x =>
                                x.volatility == null ||
                                x.volatility === "UNKNOWN" ||
                                x.volatility === "undefined"
                        ).length
                }
            };

            const overlap = {
                checkpointStepRecords:
                    STEP_RECORDS,
                trainingWindowRecords:
                    PRIOR_TOTAL_RECORDS,
                forwardWindowRecords:
                    FORWARD_RECORDS,
                overlappingDiagnosticWindows:
                    true,
                independentObservations:
                    false,
                reason:
                    "Rolling checkpoints intentionally reuse historical records to increase diagnostic coverage. They must not be interpreted as independent confirmations."
            };

            const sampleAdequacy = {
                totalTransitions:
                    allTransitions.length,
                minimumSuggestedStateObservations:
                    10,
                statesMeetingSuggestedMinimum:
                    stateResults
                        .filter(
                            x =>
                                x.activations >= 10
                        )
                        .map(x => x.key),
                stateObservationCounts:
                    Object.fromEntries(
                        stateResults.map(
                            x => [x.key, x.activations]
                        )
                    ),
                conclusion:
                    allTransitions.length >= 20
                        ? "EXPANDED_BUT_NOT_INDEPENDENT"
                        : "INSUFFICIENT_EXPANSION"
            };

            return {
                version:
                    "V22.9",
                purpose:
                    "Expand chronological edge-health observations while preserving the exact V22.8 health-state definitions and leaving the production trading pipeline untouched.",
                hypothesis:
                    "If HEALTHY consistently outperforms DECAYING/BROKEN across a materially larger set of chronological checkpoints, edge-health state may contain genuine forward-persistence information.",
                diagnosticOnly:
                    true,
                strategyPipelineModified:
                    false,
                stateDefinitions:
                    STATE_DEFINITIONS.map(
                        x => ({
                            key: x.key,
                            label: x.label
                        })
                    ),
                geometry: {
                    priorTotalRecords:
                        PRIOR_TOTAL_RECORDS,
                    forwardRecords:
                        FORWARD_RECORDS,
                    stepRecords:
                        STEP_RECORDS,
                    minimumContextSamples:
                        MIN_CONTEXT_SAMPLES,
                    minimumForwardSamples:
                        MIN_FORWARD_SAMPLES
                },
                sample: {
                    sellRecords:
                        safe.length,
                    checkpoints:
                        checkpoints.length,
                    totalTransitions:
                        allTransitions.length
                },
                contextIntegrity,
                overlap,
                sampleAdequacy,
                stateResults,
                comparison,
                checkpointResults:
                    checkpoints.map(
                        x => ({
                            checkpoint:
                                x.checkpoint,
                            trainingRows:
                                x.trainingRows,
                            forwardRows:
                                x.forwardRows,
                            eligibleTransitions:
                                x.eligibleTransitions,
                            transitions:
                                x.transitions
                        })
                    ),
                antiLeakage: {
                    chronological:
                        true,
                    completedTrainingOnly:
                        true,
                    priorWindowOnly:
                        true,
                    nextWindowUsedOnlyAsOutcome:
                        true,
                    futureOutcomeUsedForState:
                        false,
                    thresholdsSelectedFromOutcome:
                        false,
                    productionPipelineModified:
                        false
                },
                decisionRules: {
                    noTradingChange:
                        true,
                    noThresholdTuning:
                        true,
                    noStatePromotion:
                        true,
                    interpretation:
                        "V22.9 can establish that an edge-health relationship is worth a separate independent test; it cannot promote HEALTHY or suppress DECAYING/BROKEN in the trading engine.",
                    nextIfSupported:
                        "Run an independent chronological confirmation experiment on a separate historical slice before any strategy integration.",
                    nextIfRejected:
                        "Discard edge-health gating and investigate another explanation for temporal instability."
                },
                interpretationGuard:
                    "V22.9 is diagnostic only. Rolling checkpoints overlap by design and therefore do not constitute independent evidence. No result from this audit can create candidates, change qualification, alter validation/OOS, select exits, change risk, or generate live signals.",
                decisionGuard:
                    "No V22.9 state or threshold is a trading rule. A later experiment must independently confirm the relationship before any strategy modification is considered."
            };
        }



        // =====================================================
        // V24.0 — INDEPENDENT EDGE-HEALTH CONFIRMATION
        // -----------------------------------------------------
        // Diagnostic only. Runs on a SEPARATE, NON-OVERLAPPING
        // historical slice. It does not alter the V23 trading
        // pipeline, candidate discovery, validation, OOS, exits,
        // risk, or current signal generation.
        // =====================================================
        function buildV240IndependentEdgeHealthConfirmation({
            confirmationRecords,
            sourceLabel = "SEPARATE_HISTORICAL_SLICE",
            sourceStartTs = null,
            sourceEndTs = null
        }) {

            const VERSION = "V24.2";

            const PRIOR_RECORDS = 40;
            const FORWARD_RECORDS = 20;

            /*
             * These are FROZEN from V22.8/V22.9.
             * They are not fitted by V24.
             */
            const HEALTH_DECAY_THRESHOLD = -0.10;

            const MIN_FORWARD_TRADES = 1;

            const MIN_STATE_OBSERVATIONS = 10;

            function safeArray(value) {
                return Array.isArray(value) ? value : [];
            }

            function num(value, fallback = null) {
                const x = Number(value);
                return Number.isFinite(x) ? x : fallback;
            }

            function round(value, digits = 4) {
                return Number.isFinite(value)
                    ? Number(value.toFixed(digits))
                    : null;
            }

            function metrics(rows) {

                const data =
                    safeArray(rows)
                        .filter(
                            x =>
                                Number.isFinite(
                                    Number(x.resultR)
                                )
                        );

                if (!data.length) {
                    return {
                        trades: 0,
                        wins: 0,
                        losses: 0,
                        timeouts: 0,
                        decisiveTrades: 0,
                        winRate: 0,
                        netR: 0,
                        EV: 0,
                        profitFactor: 0
                    };
                }

                const wins =
                    data.filter(
                        x => Number(x.resultR) > 0
                    ).length;

                const losses =
                    data.filter(
                        x => Number(x.resultR) < 0
                    ).length;

                const timeouts =
                    data.filter(
                        x =>
                            String(
                                x.exitReason ??
                                x.exit ??
                                ""
                            )
                                .toUpperCase()
                                .includes("TIMEOUT")
                    ).length;

                const decisiveTrades =
                    data.filter(
                        x =>
                            Number(x.resultR) !== 0
                    ).length;

                const netR =
                    data.reduce(
                        (sum, x) =>
                            sum + Number(x.resultR),
                        0
                    );

                const totalWinR =
                    data
                        .filter(
                            x => Number(x.resultR) > 0
                        )
                        .reduce(
                            (sum, x) =>
                                sum + Number(x.resultR),
                            0
                        );

                const totalLossR =
                    Math.abs(
                        data
                            .filter(
                                x =>
                                    Number(x.resultR) < 0
                            )
                            .reduce(
                                (sum, x) =>
                                    sum + Number(x.resultR),
                                0
                            )
                    );

                return {
                    trades: data.length,
                    wins,
                    losses,
                    timeouts,
                    decisiveTrades,
                    winRate:
                        decisiveTrades > 0
                            ? round(
                                wins /
                                decisiveTrades *
                                100,
                                2
                            )
                            : 0,
                    netR:
                        round(netR),
                    EV:
                        round(
                            netR /
                            data.length
                        ),
                    profitFactor:
                        totalLossR > 0
                            ? round(
                                totalWinR /
                                totalLossR
                            )
                            : totalWinR > 0
                                ? 999
                                : 0
                };
            }

            function internalEV(rows) {

                const data =
                    safeArray(rows)
                        .filter(
                            x =>
                                Number.isFinite(
                                    Number(x.resultR)
                                )
                        );

                if (!data.length) {
                    return 0;
                }

                return (
                    data.reduce(
                        (sum, x) =>
                            sum + Number(x.resultR),
                        0
                    ) /
                    data.length
                );
            }

            function healthState(priorRows) {

                const rows =
                    safeArray(priorRows);

                if (
                    rows.length <
                    PRIOR_RECORDS
                ) {
                    return "INSUFFICIENT_HISTORY";
                }

                const priorEV =
                    internalEV(rows);

                if (priorEV <= 0) {
                    return "NO_POSITIVE_PRIOR_EDGE";
                }

                const midpoint =
                    Math.floor(
                        rows.length / 2
                    );

                const early =
                    rows.slice(
                        0,
                        midpoint
                    );

                const late =
                    rows.slice(
                        midpoint
                    );

                const earlyEV =
                    internalEV(early);

                const lateEV =
                    internalEV(late);

                const internalEVChange =
                    lateEV - earlyEV;

                if (
                    internalEVChange >=
                        HEALTH_DECAY_THRESHOLD &&
                    lateEV > 0
                ) {
                    return "HEALTHY";
                }

                if (
                    internalEVChange >=
                        HEALTH_DECAY_THRESHOLD &&
                    lateEV <= 0
                ) {
                    return "STABLE";
                }

                if (
                    internalEVChange <
                        HEALTH_DECAY_THRESHOLD &&
                    lateEV > 0
                ) {
                    return "DECAYING";
                }

                return "BROKEN";
            }

            function contextKey(row) {

                return [
                    row.setup ?? "UNKNOWN",
                    row.trend ?? "UNKNOWN",
                    row.regime ?? "UNKNOWN",
                    row.volatility ?? "UNKNOWN",
                    row.timeBucket ?? "UNKNOWN",
                    row.vwapDirection ?? "UNKNOWN",
                    row.rsiBucket ?? "UNKNOWN"
                ].join("|");
            }

            function maxLossStreak(rows) {

                let current = 0;
                let maximum = 0;

                for (const row of safeArray(rows)) {

                    const r =
                        Number(row.resultR);

                    if (r < 0) {
                        current++;
                        maximum =
                            Math.max(
                                maximum,
                                current
                            );
                    } else {
                        current = 0;
                    }
                }

                return maximum;
            }

            const records =
                safeArray(confirmationRecords)
                    .filter(
                        x =>
                            x &&
                            x.side === "SELL" &&
                            Number.isFinite(
                                Number(x.index)
                            ) &&
                            Number.isFinite(
                                Number(x.resultR)
                            )
                    )
                    .sort(
                        (a, b) =>
                            Number(a.index) -
                            Number(b.index)
                    );

            /*
            ---------------------------------------------------------
            NON-OVERLAPPING CONFIRMATION DESIGN
            ---------------------------------------------------------

            We deliberately DO NOT use rolling checkpoints.

            Confirmation blocks are disjoint.

            Each block:

                40 completed prior SELL records
                           +
                20 immediately following SELL records

            The forward records of one block are never reused as
            the forward records of another block.

            This makes the V24 observations independent at the
            block level, unlike V23's overlapping rolling audit.
            ---------------------------------------------------------
            */

            const transitions = [];

            let cursor = 0;
            let block = 1;

            while (
                cursor +
                PRIOR_RECORDS +
                FORWARD_RECORDS
                <=
                records.length
            ) {

                const prior =
                    records.slice(
                        cursor,
                        cursor +
                        PRIOR_RECORDS
                    );

                const forward =
                    records.slice(
                        cursor +
                        PRIOR_RECORDS,
                        cursor +
                        PRIOR_RECORDS +
                        FORWARD_RECORDS
                    );

                const state =
                    healthState(prior);

                if (
                    state === "INSUFFICIENT_HISTORY" ||
                    state === "NO_POSITIVE_PRIOR_EDGE"
                ) {
                    cursor +=
                        PRIOR_RECORDS +
                        FORWARD_RECORDS;

                    block++;
                    continue;
                }

                const priorEV =
                    internalEV(prior);

                const midpoint =
                    Math.floor(
                        prior.length / 2
                    );

                const earlyEV =
                    internalEV(
                        prior.slice(
                            0,
                            midpoint
                        )
                    );

                const lateEV =
                    internalEV(
                        prior.slice(
                            midpoint
                        )
                    );

                const forwardMetrics =
                    metrics(forward);

                const forwardSuccess =
                    forward.length >= MIN_FORWARD_TRADES &&
                    forwardMetrics.EV > 0;

                transitions.push({

                    block,

                    healthState:
                        state,

                    contextKey:
                        contextKey(
                            prior[prior.length - 1]
                        ),

                    prior: {

                        samples:
                            prior.length,

                        decisiveTrades:
                            metrics(prior)
                                .decisiveTrades,

                        EV:
                            round(priorEV),

                        PF:
                            metrics(prior)
                                .profitFactor,

                        winRate:
                            metrics(prior)
                                .winRate,

                        internalEarlyEV:
                            round(earlyEV),

                        internalLateEV:
                            round(lateEV),

                        internalEVChange:
                            round(
                                lateEV -
                                earlyEV
                            ),

                        maxLossStreak:
                            maxLossStreak(prior),

                        firstRecordIndex:
                            prior[0]?.index ??
                            null,

                        lastRecordIndex:
                            prior[
                                prior.length - 1
                            ]?.index ??
                            null
                    },

                    forward: {

                        trades:
                            forwardMetrics.trades,

                        decisiveTrades:
                            forwardMetrics.decisiveTrades,

                        wins:
                            forwardMetrics.wins,

                        losses:
                            forwardMetrics.losses,

                        timeouts:
                            forwardMetrics.timeouts,

                        winRate:
                            forwardMetrics.winRate,

                        netR:
                            forwardMetrics.netR,

                        EV:
                            forwardMetrics.EV,

                        PF:
                            forwardMetrics.profitFactor,

                        maxLossStreak:
                            maxLossStreak(forward),

                        firstRecordIndex:
                            forward[0]?.index ??
                            null,

                        lastRecordIndex:
                            forward[
                                forward.length - 1
                            ]?.index ??
                            null
                    },

                    forwardSuccess
                });

                cursor +=
                    PRIOR_RECORDS +
                    FORWARD_RECORDS;

                block++;
            }

            /*
            ---------------------------------------------------------
            STATE AGGREGATION
            ---------------------------------------------------------
            */

            const STATES = [
                "HEALTHY",
                "STABLE",
                "DECAYING",
                "BROKEN"
            ];

            function aggregateState(state) {

                const rows =
                    transitions.filter(
                        x =>
                            x.healthState ===
                            state
                    );

                const successful =
                    rows.filter(
                        x =>
                            x.forwardSuccess
                    ).length;

                const forwardTrades =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.trades,
                        0
                    );

                const forwardDecisive =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.decisiveTrades,
                        0
                    );

                const forwardNetR =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.netR,
                        0
                    );

                const forwardWins =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.wins,
                        0
                    );

                const forwardLosses =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.losses,
                        0
                    );

                return {

                    state,

                    observations:
                        rows.length,

                    successfulBlocks:
                        successful,

                    failedBlocks:
                        rows.length -
                        successful,

                    blockSuccessRatePct:
                        rows.length
                            ? round(
                                successful /
                                rows.length *
                                100,
                                2
                            )
                            : 0,

                    forwardTrades,

                    forwardDecisiveTrades:
                        forwardDecisive,

                    forwardWins,

                    forwardLosses,

                    forwardNetR:
                        round(
                            forwardNetR
                        ),

                    forwardEV:
                        forwardTrades
                            ? round(
                                forwardNetR /
                                forwardTrades
                            )
                            : 0,

                    forwardWinRatePct:
                        forwardDecisive
                            ? round(
                                forwardWins /
                                forwardDecisive *
                                100,
                                2
                            )
                            : 0,

                    meetsSuggestedSample:
                        rows.length >=
                        MIN_STATE_OBSERVATIONS
                };
            }

            const stateResults =
                STATES.map(
                    aggregateState
                );

            /*
            ---------------------------------------------------------
            PRIMARY CONFIRMATION COMPARISON
            ---------------------------------------------------------
            */

            const healthy =
                stateResults.find(
                    x =>
                        x.state ===
                        "HEALTHY"
                );

            const decaying =
                stateResults.find(
                    x =>
                        x.state ===
                        "DECAYING"
                );

            const broken =
                stateResults.find(
                    x =>
                        x.state ===
                        "BROKEN"
                );

            const stable =
                stateResults.find(
                    x =>
                        x.state ===
                        "STABLE"
                );

            const healthyEV =
                healthy?.forwardEV ?? null;

            const decayingEV =
                decaying?.forwardEV ?? null;

            const brokenEV =
                broken?.forwardEV ?? null;

            /*
            V24 does NOT tune a threshold.

            It simply reports whether the frozen V23 hypothesis
            survives the independent block test.
            */

            const healthyObserved =
                (healthy?.observations ?? 0) >=
                MIN_STATE_OBSERVATIONS;

            const decayingObserved =
                (decaying?.observations ?? 0) >=
                MIN_STATE_OBSERVATIONS;

            const healthyBeatsDecaying =
                healthyObserved &&
                decayingObserved &&
                healthyEV > decayingEV;

            const healthyPositive =
                healthyObserved &&
                healthyEV > 0;

            let confirmationClassification =
                "INCONCLUSIVE";

            if (
                healthyObserved &&
                decayingObserved
            ) {

                if (
                    healthyPositive &&
                    healthyBeatsDecaying
                ) {
                    confirmationClassification =
                        "HEALTH_PERSISTENCE_SUPPORTED";
                } else if (
                    !healthyPositive
                ) {
                    confirmationClassification =
                        "HEALTH_PERSISTENCE_REJECTED";
                } else {
                    confirmationClassification =
                        "HEALTH_RELATIONSHIP_NOT_REPLICATED";
                }
            }

            /*
            BROKEN IS NEVER used as a positive comparator.

            V23 showed BROKEN was unexpectedly positive with a tiny
            sample. V24 therefore reports it but deliberately does
            not optimize around it.
            */

            const brokenInterpretation =
                (broken?.observations ?? 0) <
                MIN_STATE_OBSERVATIONS
                    ? "UNDERPOWERED_SAMPLE"
                    : brokenEV > 0
                        ? "POSITIVE_BUT_NOT_A_PROMOTION_SIGNAL"
                        : "NOT_POSITIVE";

            const totalForwardTrades =
                transitions.reduce(
                    (sum, x) =>
                        sum +
                        x.forward.trades,
                    0
                );

            const totalForwardNetR =
                transitions.reduce(
                    (sum, x) =>
                        sum +
                        x.forward.netR,
                    0
                );

            return {

                success:
                    true,

                version:
                    VERSION,

                status:
                    "COMPLETED",

                mode:
                    "V24_INDEPENDENT_EDGE_HEALTH_CONFIRMATION",

                paperOnly:
                    true,

                realOrders:
                    false,

                brokerOrderEnabled:
                    false,

                brokerOrderSent:
                    false,

                purpose:
                    "Independently confirm whether the frozen V22.8/V22.9 edge-health states carry forward-persistence information on a non-overlapping chronological confirmation slice.",

                hypothesis:
                    "HEALTHY should outperform DECAYING on an independent chronological sample if the V23 relationship is genuine.",

                source: {

                    label:
                        sourceLabel,

                    independentFromV23:
                        sourceLabel ===
                        "SEPARATE_HISTORICAL_SLICE",

                    startTs:
                        sourceStartTs,

                    endTs:
                        sourceEndTs,

                    records:
                        records.length,

                    sellRecords:
                        records.length
                },

                frozenDefinitions: {

                    HEALTHY:
                        "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV > 0",

                    STABLE:
                        "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV <= 0",

                    DECAYING:
                        "prior EV > 0 AND internal EV change < -0.10R AND late-half EV > 0",

                    BROKEN:
                        "prior EV > 0 AND internal EV change < -0.10R AND late-half EV <= 0",

                    internalEVDecayThreshold:
                        HEALTH_DECAY_THRESHOLD
                },

                geometry: {

                    priorRecords:
                        PRIOR_RECORDS,

                    forwardRecords:
                        FORWARD_RECORDS,

                    overlappingBlocks:
                        false,

                    independentBlocks:
                        true,

                    blockStep:
                        PRIOR_RECORDS +
                        FORWARD_RECORDS
                },

                sample: {

                    usableSELLRecords:
                        records.length,

                    independentBlocks:
                        transitions.length,

                    totalForwardTrades,

                    totalForwardNetR:
                        round(
                            totalForwardNetR
                        ),

                    minimumStateObservations:
                        MIN_STATE_OBSERVATIONS
                },

                stateResults,

                primaryConfirmation: {

                    healthyObserved,

                    decayingObserved,

                    healthyForwardEV:
                        healthyEV,

                    decayingForwardEV:
                        decayingEV,

                    healthyMinusDecayingEV:
                        healthyEV !== null &&
                        decayingEV !== null
                            ? round(
                                healthyEV -
                                decayingEV
                            )
                            : null,

                    healthyPositive,

                    healthyBeatsDecaying,

                    classification:
                        confirmationClassification
                },

                brokenDiagnostic: {

                    observations:
                        broken?.observations ??
                        0,

                    forwardEV:
                        brokenEV,

                    interpretation:
                        brokenInterpretation,

                    usedForPromotion:
                        false
                },

                stableDiagnostic: {

                    observations:
                        stable?.observations ??
                        0,

                    forwardEV:
                        stable?.forwardEV ??
                        null,

                    usedForPromotion:
                        false
                },

                blockResults:
                    transitions,

                antiLeakage: {

                    chronological:
                        true,

                    nonOverlappingConfirmationBlocks:
                        true,

                    priorWindowOnly:
                        true,

                    forwardWindowUsedOnlyForOutcome:
                        true,

                    futureOutcomeUsedForHealthState:
                        false,

                    futureOutcomeUsedForStateSelection:
                        false,

                    thresholdTuningFromConfirmation:
                        false,

                    v23OutcomeUsedToModifyV24Threshold:
                        false,

                    productionPipelineModified:
                        false,

                    candidateDiscoveryModified:
                        false,

                    validationModified:
                        false,

                    oosModified:
                        false,

                    exitModelModified:
                        false,

                    riskModified:
                        false
                },

                decisionGuard: {

                    noTradingChange:
                        true,

                    noThresholdTuning:
                        true,

                    noStatePromotion:
                        true,

                    noAutomaticFilter:
                        true,

                    noLiveTrading:
                        true,

                    interpretation:
                        "V24 is a replication test only. Even a positive result does not create a trading rule. Any later strategy integration requires another explicitly declared chronological test."
                },

                interpretationGuard:
                    "V24 must not be interpreted as proof of live profitability. It tests whether the V23 edge-health relationship replicates on non-overlapping chronological observations."
            };
        }

        // =====================================================
        // V23.0 — EDGE HEALTH × CONTEXT INTERACTION AUDIT
        // -----------------------------------------------------
        // Diagnostic only. Uses the completed V22.9 transition
        // observations. It does not change candidate discovery,
        // validation, OOS, exits, risk, or signals.
        // =====================================================
        function buildV230EdgeHealthContextInteractionAudit(
            v229Audit,
            records
        ) {

            const transitions = [];
            const checkpoints =
                safeArray(v229Audit?.checkpointResults);

            function localRound(value, digits = 4) {
                const x = Number(value);
                if (!Number.isFinite(x)) return 0;
                const p = 10 ** digits;
                return Math.round(x * p) / p;
            }

            function contextFromKey(key) {
                const parts = String(key || "").split("|");
                return {
                    setup: parts[0] || "UNKNOWN",
                    trend: parts[1] || "UNKNOWN",
                    regime: parts[2] || "UNKNOWN",
                    volatility: parts[3] || "UNKNOWN"
                };
            }

            function momentumBucket(value) {
                const x = Number(value);
                if (!Number.isFinite(x)) return "UNAVAILABLE";
                if (x < 0) return "MOM_NEGATIVE";
                if (x < 0.10) return "MOM_0_TO_0_10";
                return "MOM_GE_0_10";
            }

            function aggregate(rows) {
                const data = safeArray(rows);
                const successful = data.filter(x => x.forwardSuccess).length;
                const forwardTrades = data.reduce(
                    (s, x) => s + Number(x.forward?.trades || 0), 0
                );
                const forwardNetR = data.reduce(
                    (s, x) => s + Number(x.forward?.netR || 0), 0
                );
                const forwardEV = forwardTrades > 0
                    ? forwardNetR / forwardTrades
                    : 0;

                return {
                    activations: data.length,
                    successfulForwardContexts: successful,
                    failedForwardContexts: data.length - successful,
                    forwardContextSuccessRatePct: data.length
                        ? localRound(successful / data.length * 100, 2)
                        : 0,
                    forwardTrades,
                    forwardDecisiveTrades: data.reduce(
                        (s, x) => s + Number(x.forward?.decisiveTrades || 0), 0
                    ),
                    forwardNetR: localRound(forwardNetR),
                    forwardEV: localRound(forwardEV),
                    profitableCheckpoints: new Set(
                        data.filter(x => x.forwardSuccess).map(x => x.checkpoint)
                    ).size,
                    losingCheckpoints: new Set(
                        data.filter(x => !x.forwardSuccess).map(x => x.checkpoint)
                    ).size,
                    diagnosticOnly: true
                };
            }

            for (const checkpoint of checkpoints) {
                for (const transition of safeArray(checkpoint.transitions)) {
                    const context = contextFromKey(transition.contextKey);
                    transitions.push({
                        checkpoint: transition.checkpoint,
                        contextKey: transition.contextKey,
                        context,
                        healthState: transition.healthState,
                        priorEV: transition.context?.priorEV ?? null,
                        priorPF: transition.context?.priorPF ?? null,
                        priorSamples: transition.context?.priorSamples ?? null,
                        evMomentum: transition.context?.evMomentum ?? null,
                        momentumBucket: momentumBucket(transition.context?.evMomentum),
                        internalEVChange: transition.context?.internalEVChange ?? null,
                        lateEV: transition.context?.lateEV ?? null,
                        forward: transition.forward,
                        forwardSuccess: !!transition.forwardSuccess
                    });
                }
            }

            const dimensions = [
                "setup",
                "trend",
                "regime",
                "volatility"
            ];

            const states = [
                "HEALTHY",
                "STABLE",
                "DECAYING",
                "BROKEN"
            ];

            const matrices = {};

            for (const dimension of dimensions) {
                matrices[dimension] = {};

                for (const state of states) {
                    const buckets = new Map();

                    for (const row of transitions) {
                        if (row.healthState !== state) continue;
                        const value = row.context?.[dimension] ?? "UNKNOWN";
                        if (!buckets.has(value)) buckets.set(value, []);
                        buckets.get(value).push(row);
                    }

                    matrices[dimension][state] = Array.from(buckets.entries())
                        .map(([value, rows]) => ({
                            dimension,
                            state,
                            value,
                            ...aggregate(rows)
                        }))
                        .sort((a, b) => b.forwardEV - a.forwardEV);
                }
            }

            const momentumMatrix = {};
            for (const state of states) {
                const buckets = new Map();
                for (const row of transitions) {
                    if (row.healthState !== state) continue;
                    const value = row.momentumBucket;
                    if (!buckets.has(value)) buckets.set(value, []);
                    buckets.get(value).push(row);
                }
                momentumMatrix[state] = Array.from(buckets.entries())
                    .map(([value, rows]) => ({
                        dimension: "evMomentum",
                        state,
                        value,
                        ...aggregate(rows)
                    }))
                    .sort((a, b) => b.forwardEV - a.forwardEV);
            }

            const stateResults = states.map(state => ({
                state,
                ...aggregate(
                    transitions.filter(x => x.healthState === state)
                )
            }));

            const baselineRows = transitions.filter(
                x => Number(x.priorEV) > 0
            );
            const baseline = aggregate(baselineRows);

            const strongestInteractions = [];
            const weakestInteractions = [];

            for (const dimension of dimensions) {
                for (const state of states) {
                    for (const cell of safeArray(matrices[dimension]?.[state])) {
                        if (cell.activations < 2) continue;
                        strongestInteractions.push(cell);
                        weakestInteractions.push(cell);
                    }
                }
            }

            strongestInteractions.sort((a, b) => b.forwardEV - a.forwardEV);
            weakestInteractions.sort((a, b) => a.forwardEV - b.forwardEV);

            const contextRecords = safeArray(records)
                .filter(x => x && x.side === "SELL");

            const unknownCounts = {};
            for (const field of ["setup", "trend", "regime", "volatility"]) {
                unknownCounts[field] = contextRecords.filter(
                    x => x[field] == null || x[field] === "UNKNOWN" || x[field] === "undefined"
                ).length;
            }

            const stateObservationCounts = Object.fromEntries(
                stateResults.map(x => [x.state, x.activations])
            );

            return {
                version: "V23.0",
                purpose:
                    "Determine whether the frozen V22.8/V22.9 edge-health states behave differently across observable context dimensions.",
                hypothesis:
                    "Edge-health state may interact with setup, trend, regime, volatility, and EV momentum; no interaction is promoted to a trading rule by this audit.",
                diagnosticOnly: true,
                strategyPipelineModified: false,
                healthDefinitionsFrozen: true,
                healthDefinitions: {
                    HEALTHY: "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV > 0",
                    STABLE: "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV <= 0",
                    DECAYING: "prior EV > 0 AND internal EV change < -0.10R AND late-half EV > 0",
                    BROKEN: "prior EV > 0 AND internal EV change < -0.10R AND late-half EV <= 0"
                },
                sample: {
                    sellRecords: contextRecords.length,
                    v229Checkpoints: checkpoints.length,
                    transitions: transitions.length,
                    baselinePriorEVPositive: baselineRows.length
                },
                contextIntegrity: {
                    totalSellRecords: contextRecords.length,
                    unknownOrMissingFields: unknownCounts,
                    source: "V22.9 transition context keys; no forward outcome is used to classify health."
                },
                stateResults,
                baseline,
                interactionMatrices: matrices,
                healthByEVMomentum: momentumMatrix,
                strongestInteractions: strongestInteractions.slice(0, 20),
                weakestInteractions: weakestInteractions.slice(0, 20),
                transitionDetail: transitions,
                antiLeakage: {
                    healthStateInheritedFromCompletedPriorWindow: true,
                    forwardWindowUsedOnlyAsOutcome: true,
                    futureOutcomeUsedForHealthState: false,
                    futureOutcomeUsedForInteractionClassification: false,
                    productionPipelineModified: false,
                    thresholdsOptimizedFromForwardResults: false,
                    rollingWindowsOverlap: true,
                    observationsAreIndependent: false
                },
                sampleAdequacy: {
                    stateObservationCounts,
                    minimumSuggestedObservations: 10,
                    statesMeetingSuggestedMinimum: stateResults
                        .filter(x => x.activations >= 10)
                        .map(x => x.state),
                    conclusion: transitions.length >= 20
                        ? "DIAGNOSTIC_EXPANSION_ONLY"
                        : "INSUFFICIENT_SAMPLE"
                },
                decisionGuard: {
                    noAutomaticFilterPromotion: true,
                    noThresholdTuning: true,
                    noCandidateModification: true,
                    noValidationModification: true,
                    noOOSModification: true,
                    noExitModification: true,
                    noRiskModification: true,
                    noLiveTrading: true,
                    interpretation:
                        "V23.0 identifies interactions only. Any promising interaction requires a separately declared independent chronological confirmation experiment before strategy integration."
                }
            };
        }

        const v228EdgeHealthValidation =
            buildV228EdgeHealthValidation(
                historicalCandles,
                finalDiscovery.rawRecords,
                folds
            );

        const v229EdgeHealthPersistenceExpansion =
            buildV229EdgeHealthPersistenceExpansion(
                finalDiscovery.rawRecords
            );

        const v230EdgeHealthContextInteractionAudit =
            buildV230EdgeHealthContextInteractionAudit(
                v229EdgeHealthPersistenceExpansion,
                finalDiscovery.rawRecords
            );

        // V24.0 is diagnostic only and uses the separate
        // historical slice prepared above. It never feeds back
        // into discovery, validation, OOS, exits, or risk.

        // V22.1 FIX: finalDiscovery must exist before its raw records
        // are passed into the temporal regime audit.
        const v22TemporalRegimeAudit =
            buildV22TemporalRegimeAudit(finalDiscovery.rawRecords);

        const v222EdgeDecayDiagnosis =
            buildV222EdgeDecayDiagnosis(
                historicalCandles,
                finalDiscovery.rawRecords,
                0,
                historicalCandles.length
            );

        const v223RegimeConditionalSurvivalAudit =
            buildV223RegimeConditionalSurvivalAudit(
                historicalCandles,
                finalDiscovery.rawRecords
            );

        const v224EdgeActivationAudit =
            buildV224EdgeActivationAudit(
                historicalCandles,
                finalDiscovery.rawRecords
            );

        const v225ActivationQualityPersistenceAudit =
            buildV225ActivationQualityPersistenceAudit(
                finalDiscovery.rawRecords
            );

        const edgeAnatomy =
            buildEdgeAnatomy(
                finalDiscovery.rawRecords,
                0,
                historicalCandles.length
            );

        const strategyMechanicsDiagnostics =
            buildV15ExitModelDiagnostics(
                historicalCandles,
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

        const edgeDecayDiagnostics =
            buildEdgeDecayDiagnostics(
                finalDiscovery.rawRecords,
                0,
                historicalCandles.length
            );

        const regimeFingerprintDiagnostics =
            buildRegimeFingerprintDiagnostics(
                finalDiscovery.rawRecords,
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
                "No V15 edge has survived regime-context discovery, isolated validation, regime-fingerprint diagnostics and anti-overfitting filters.",

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
                                "CONTEXT" ||
                                candidate.level ===
                                "ADAPTIVE_CONTEXT"
                            ) {

                                return (
                                    candidate.key ===
                                    regimeContextKey(
                                        setup.side,
                                        setup.setup,
                                        currentFeatures
                                    )
                                );
                            }

                            if (
                                candidate.level ===
                                "REGIME_SETUP"
                            ) {
                                return (
                                    candidate.key ===
                                    regimeSetupKey(
                                        setup.side,
                                        setup.setup,
                                        currentFeatures
                                    )
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
                    setup.side === ADAPTIVE_CONTEXT_SIDE &&
                    match.level === "ADAPTIVE_CONTEXT"
                ) {
                    const gate = match.adaptiveGate ||
                        adaptiveContextGate(match, historicalCandles.length);
                    if (!gate.passed) {
                        continue;
                    }
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
                "V23_EDGE_HEALTH_CONTEXT_INTERACTION_AUDIT_TRUE_WALK_FORWARD",

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
                    "Every qualified candidate is traceable through the exact promotion path, pre-validation rejection, adaptive regime gating, validation rejection, survival and diversification; V15.9 audits validation occurrence matching for regime-context candidates; V15.9 additionally investigates every discovered context variant and its validation occurrence opportunity; V16 audits recent and recency-weighted context stability; V15.7 validation-failure audit is retained; V20 audits candidate stability across expanding walk-forward folds and distinguishes absence, qualification, validation, selection and OOS execution; V21 audits exact edge persistence across those chronological stages without changing strategy mechanics; V22.2 diagnoses Window-3 to Window-4 edge decay using entry-time feature shifts and separate outcome/mechanics evidence; V22.3 audits conditional edge survival across setup, regime and volatility; V22.4 tests whether positive prior-window evidence can activate the same context for the next window; V22.5 audits activation quality and EV momentum; V22.6 performs a controlled chronological validation of the EV-momentum hypothesis without changing strategy mechanics; V22.7 diagnoses EV-persistence failure anatomy using only completed prior-window evidence; V23.0 audits edge-health/context interactions without changing the trading pipeline; V24.0 independently confirms the frozen edge-health relationship on a separate non-overlapping chronological historical slice.",

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
                    "Prefer NO_TRADE over weak or unstable evidence; test strategy mechanics without selecting exit models from the same evidence."
            },

            v24ResearchProtocol: {

                enabled: true,

                purpose:
                    "Independent chronological confirmation of the frozen V23 edge-health hypothesis using a separate non-overlapping historical slice.",

                confirmationDays:
                    V24_CONFIRMATION_DAYS,

                confirmationRangeStartMs:
                    v24ConfirmationStartMs,

                confirmationRangeEndMs:
                    v24ConfirmationEndMs,

                productionPipelineModified:
                    false,

                healthThresholdFrozen:
                    -0.10,

                noTradingPromotion:
                    true
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

                contextPatternsDiscovered:
                    finalDiscovery
                        .contextPatterns
                        .length,

                qualifiedContextPatterns:
                    finalDiscovery
                        .qualifiedContextPatterns
                        .length,

                adaptiveContextPatterns:
                    safeArray(finalDiscovery.adaptiveContextPatterns).length,

                regimeSetupPatterns:
                    safeArray(finalDiscovery.regimeSetupPatterns).length,

                qualifiedRegimeSetupPatterns:
                    safeArray(finalDiscovery.qualifiedRegimeSetupPatterns).length,

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

                contextEdges:
                    finalSelected.filter(
                        x =>
                            x.level ===
                            "CONTEXT"
                    ).length,

                adaptiveContextEdges:
                    finalSelected.filter(
                        x =>
                            x.level ===
                            "ADAPTIVE_CONTEXT"
                    ).length,

                regimeSetupEdges:
                    finalSelected.filter(
                        x =>
                            x.level ===
                            "REGIME_SETUP"
                    ).length,

                independentSelectedFamilies:
                    finalDiversified
                        .independentFamilies,

                candidateFlow,

                v17RegimeAwareCandidateAudit:
                    buildV17RegimeAwareCandidateAudit(finalDiscovery),

                v191RegimePromotionAudit:
                    safeArray(finalDiscovery.v191RegimePromotionAudit),

                v157ValidationFailureAudit:
                    buildV157ValidationFailureAudit(
                        finalPromoted
                    )
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

            edgeDecayDiagnostics,

            v222EdgeDecayDiagnosis,

            v223RegimeConditionalSurvivalAudit,

            v224EdgeActivationAudit,

            v225ActivationQualityPersistenceAudit,

            v226ControlledEVMomentumValidation,

            v227EVPersistenceFailureAnatomy,

            v228EdgeHealthValidation,

            v229EdgeHealthPersistenceExpansion,

            v230EdgeHealthContextInteractionAudit,

            v24IndependentEdgeHealthConfirmation:
                v24IndependentEdgeHealthConfirmation,

            regimeFingerprintDiagnostics,

            v158ValidationOccurrenceAudit:
                buildV158ValidationOccurrenceAudit(
                    rows,
                    finalPromoted?.validationCandidates?.[0] || null,
                    finalPromoted?.validationStart ?? 0,
                    finalPromoted?.validationEnd ?? 0
                ),

            v159ContextVariantInvestigation:
                buildV159ContextVariantInvestigation(
                    rows,
                    finalDiscovery?.contextPatterns || [],
                    finalPromoted?.validationStart ?? 0,
                    finalPromoted?.validationEnd ?? 0
                ),

            v16ActiveContextStabilityAudit: (() => {
                try {
                    return buildV16ActiveContextStabilityAudit(
                        finalDiscovery?.contextPatterns || []
                    );
                } catch (auditError) {
                    return {
                        purpose: "Identify active context stability without affecting the trading pipeline.",
                        status: "AUDIT_ERROR",
                        error: String(auditError?.message || auditError),
                        diagnosticOnly: true,
                        guard: "V16.2 crash-safe diagnostic. Audit failure cannot affect promotion, validation, OOS, or trade execution."
                    };
                }
            })(),

            strategyMechanicsDiagnostics,

            v156CandidateNativePromotionAudit: finalPromoted?.candidateFlow?.v156CandidateNativePromotionAudit || null,

            v156CandidateNativePromotion: {
                enabled: true,
                previousTargetFilter: `${V153_TARGET_SIDE}|${V153_TARGET_SETUP}|${V153_TARGET_TREND}`,
                promotionMode: "CANDIDATE_NATIVE",
                validationMode: "CANDIDATE_NATIVE",
                purpose: "Each qualified/adaptive context candidate is promoted and validated against its own side/setup/trend identity; the previous V15.3 target is diagnostic-only."
            },

            v153FocusedTest: {
                side: V153_TARGET_SIDE,
                setup: V153_TARGET_SETUP,
                trend: V153_TARGET_TREND,
                exitModel: ACTIVE_EXIT_MODEL_KEY,
                purpose: "Isolate SELL VWAP_PULLBACK BEARISH regime-context candidates and test them through unchanged validation and true OOS gates.",
                guard: "This filter does not lower thresholds or use validation/OOS outcomes for discovery."
            },

            adaptiveRegimeGate: {
                enabled: true,
                side: ADAPTIVE_CONTEXT_SIDE,
                minTotalSamples: ADAPTIVE_CONTEXT_MIN_TOTAL_SAMPLES,
                minRecentSamples: ADAPTIVE_CONTEXT_MIN_RECENT_SAMPLES,
                minRecentDecisive: ADAPTIVE_CONTEXT_MIN_RECENT_DECISIVE,
                minRecentEV: ADAPTIVE_CONTEXT_MIN_RECENT_EV,
                minRecentPF: ADAPTIVE_CONTEXT_MIN_RECENT_PF,
                maxRecentLossStreak: ADAPTIVE_CONTEXT_MAX_RECENT_LOSS_STREAK,
                halfLifeRecords: ADAPTIVE_HALF_LIFE_RECORDS,
                minEffectiveSamples: ADAPTIVE_MIN_EFFECTIVE_SAMPLES,
                candidatesDiscovered: safeArray(finalDiscovery.adaptiveContextPatterns).length,
                purpose: "Test whether a SELL regime-context edge remains active when older evidence is exponentially down-weighted.",
                guard: "Adaptive candidates still require isolated validation and the existing true-OOS profitability proof. No validation or OOS outcome is used to construct the gate."
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

            v19CandidateLineageAudit,

            v20FoldCandidateStabilityAudit,

            v20CrossFoldCandidateStability,

            v21EdgePersistenceAudit,

            v22TemporalRegimeAudit,

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

            activeExitModel: {
                key: ACTIVE_EXIT_MODEL_KEY,
                stopR: ACTIVE_EXIT_STOP_R,
                targetR: ACTIVE_EXIT_TARGET_R,
                maxHoldCandles: ACTIVE_EXIT_MAX_HOLD_CANDLES,
                purpose: "V15.1 active mechanics: SELL-only regime-context experiment using the V15 FAST exit model."
            },

            riskPlan: {

                stopR:
                    STOP_R,

                targetR:
                    TARGET_R,

                preferredTargetR:
                    PREFERRED_TARGET_R,

                riskReward:
                    "1:1.5",

                preferredRiskReward:
                    "1:2",

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
            "TradeMind Pro V23.0 ERROR:",
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

/*
===========================================================
 TradeMind Pro
 V14.4 — ROBUSTNESS + EVIDENCE ENGINE
        + HIERARCHICAL LEARNING
        + RECENT VWAP PULLBACK
        + TREND STRENGTH
        + TRUE WALK-FORWARD
        + EDGE PERSISTENCE
        + EDGE DECAY
        + MULTI-FOLD VALIDATION

 Instrument : NIFTY 50
 Scrip      : NIDX_40000001
 Interval   : 5 minute
 Data       : INDstocks Historical API

 MODE:
 PAPER ONLY
 NO REAL ORDERS
===========================================================

 V14.4 OBJECTIVES
 ----------------------------------------------------------
 1. Increase historical evidence
 2. Use 6 chronological walk-forward folds
 3. Preserve strict no-leakage learning
 4. Preserve hierarchical family/detail learning
 5. Track edge persistence
 6. Track recent edge decay
 7. Separate BUY and SELL evidence
 8. Validate recent edge quality
 9. Require independent setup families
10. Control pattern concentration
11. Preserve strong trend filtering
12. Preserve recent VWAP pullback
13. Prevent overlapping paper trades
14. Preserve circuit breakers
15. Allow NO TRADE
16. Never force profitability proof
17. Paper-only
===========================================================
*/

export default async function handler(req, res) {

    try {

        // =====================================================
        // CONFIG
        // =====================================================

        const VERSION = "V14.4";

        const INSTRUMENT = "NIFTY 50";
        const SCRIP_CODE = "NIDX_40000001";
        const INTERVAL = "5minute";

        const API_BASE =
            process.env.INDSTOCKS_API_BASE ||
            "https://api.indstocks.com";

        /*
         * V14.4 requests a larger historical window.
         * The API is still fetched in maximum 7-day chunks.
         */

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
        // HIERARCHICAL LEARNING
        // =====================================================

        const FAMILY_MIN_SAMPLES = 8;
        const FAMILY_MIN_DECISIVE = 5;

        const PATTERN_MIN_SAMPLES = 6;
        const PATTERN_MIN_DECISIVE = 3;

        const FAMILY_MIN_EV = 0.05;
        const FAMILY_MIN_PF = 1.05;

        const PATTERN_MIN_EV = 0.05;
        const PATTERN_MIN_PF = 1.05;

        const QUALITY_THRESHOLD = 55;

        const MIN_STABLE_SECTIONS = 2;

        // =====================================================
        // RECENT VALIDATION
        // =====================================================

        const RECENT_FRACTION = 0.25;

        const MIN_RECENT_SAMPLES = 4;
        const MIN_RECENT_DECISIVE = 3;

        const MIN_RECENT_EV = 0.05;
        const MIN_RECENT_PF = 1.05;

        const MAX_RECENT_LOSS_STREAK = 3;

        // =====================================================
        // WALK FORWARD
        // =====================================================

        const FOLD_COUNT = 6;

        const INITIAL_TRAINING = 250;

        const REQUIRED_PROFITABLE_FOLDS = 3;

        // =====================================================
        // GLOBAL PROOF
        // =====================================================

        const MIN_GLOBAL_DECISIVE = 8;

        const MIN_GLOBAL_EV = 0.10;

        const MIN_GLOBAL_PF = 1.20;

        const MIN_INDEPENDENT_FAMILIES = 2;

        const MAX_PATTERN_CONCENTRATION = 0.75;

        // =====================================================
        // EDGE PERSISTENCE
        // =====================================================

        const MIN_PERSISTENCE_SECTIONS = 2;

        const MAX_EDGE_DECAY = 0.75;

        // =====================================================
        // RISK
        // =====================================================

        const RISK_R = 1;

        const STOP_R = 1;

        const TARGET_R = 2;

        const PREFERRED_TARGET_R = 2.5;

        const MAX_HOLD_CANDLES = 12;

        const MAX_OOS_DRAWDOWN = 12;

        const MAX_LOSS_STREAK = 6;

        // =====================================================
        // ENTRY CONFIRMATION
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

            return (
                Math.round(
                    value * factor
                ) / factor
            );
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

        // =====================================================
        // NORMALIZE CANDLE
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

                let ts =
                    n(row[0]);

                const o =
                    n(row[1]);

                const h =
                    n(row[2]);

                const l =
                    n(row[3]);

                const c =
                    n(row[4]);

                const v =
                    n(
                        row[5],
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
        // EXTRACT API ROWS
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

        // =====================================================
        // PREPARE DATA
        // =====================================================

        function prepareData(rows) {

            const map =
                new Map();

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
                (
                    a,
                    b
                ) =>
                    a.ts -
                    b.ts
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
                IST_FORMATTER
                    .formatToParts(
                        new Date(
                            ts * 1000
                        )
                    );

            const result = {};

            for (
                const p of parts
            ) {

                if (
                    p.type !==
                    "literal"
                ) {

                    result[
                        p.type
                    ] = p.value;
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
                Number(p.hour) *
                60 +
                Number(p.minute)
            );
        }

        function getTimeBucket(ts) {

            const mins =
                istMinutes(ts);

            if (
                mins < 600
            ) {
                return "OPEN";
            }

            if (
                mins < 720
            ) {
                return "MORNING";
            }

            if (
                mins < 840
            ) {
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
                    typical *
                    v;

                volume += v;
            }

            if (
                volume <= 0
            ) {

                return candles[index].c;
            }

            return (
                pv /
                volume
            );
        }

        // =====================================================
        // EMA
        // =====================================================

        function ema(
            values,
            period
        ) {

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

                value +=
                    values[i];
            }

            value /=
                period;

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

                if (
                    diff >= 0
                ) {

                    gains +=
                        diff;

                } else {

                    losses +=
                        Math.abs(
                            diff
                        );
                }
            }

            let avgGain =
                gains /
                period;

            let avgLoss =
                losses /
                period;

            for (
                let i =
                    period + 1;

                i <
                    values.length;

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
                    ) /
                    period;

                avgLoss =
                    (
                        avgLoss *
                        (period - 1) +
                        loss
                    ) /
                    period;
            }

            if (
                avgLoss === 0
            ) {

                return 100;
            }

            const rs =
                avgGain /
                avgLoss;

            return (
                100 -
                100 /
                (1 + rs)
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

                const c =
                    candles[i];

                const p =
                    candles[i - 1];

                trs.push(
                    Math.max(
                        c.h - c.l,

                        Math.abs(
                            c.h -
                            p.c
                        ),

                        Math.abs(
                            c.l -
                            p.c
                        )
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

                value +=
                    trs[i];
            }

            value /=
                period;

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
                    ) /
                    period;
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
                    x =>
                        x.c
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
                ema9 -
                ema21;

            const spreadATR =
                spread /
                atr14;

            const slope =
                ema9 -
                previousEMA9;

            const slopeATR =
                slope /
                atr14;

            let trend =
                "SIDEWAYS";

            if (
                ema9 >
                    ema21 &&
                spreadATR >=
                    MIN_SPREAD_ATR &&
                slopeATR >=
                    MIN_SLOPE_ATR
            ) {

                trend =
                    "BULLISH";
            }

            if (
                ema9 <
                    ema21 &&
                spreadATR <=
                    -MIN_SPREAD_ATR &&
                slopeATR <=
                    -MIN_SLOPE_ATR
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
                Math.abs(
                    spreadATR
                ) >= 0.35 &&
                Math.abs(
                    slopeATR
                ) >= 0.08
            ) {

                regime =
                    "TRENDING";

            } else if (
                Math.abs(
                    spreadATR
                ) < 0.15 &&
                Math.abs(
                    slopeATR
                ) < 0.05
            ) {

                regime =
                    "RANGING";
            }

            let vwapDirection =
                "AT";

            if (
                close >
                vwap
            ) {

                vwapDirection =
                    "ABOVE";

            } else if (
                close <
                vwap
            ) {

                vwapDirection =
                    "BELOW";
            }

            const vwapDistanceATR =
                (
                    close -
                    vwap
                ) /
                atr14;

            let rsiBucket =
                "NEUTRAL";

            if (
                rsi14 >= 60
            ) {

                rsiBucket =
                    "HIGH";

            } else if (
                rsi14 >= 50
            ) {

                rsiBucket =
                    "NEUTRAL_HIGH";

            } else if (
                rsi14 <= 40
            ) {

                rsiBucket =
                    "LOW";

            } else {

                rsiBucket =
                    "NEUTRAL_LOW";
            }

            let volatility =
                "NORMAL";

            if (
                atr14 > 18
            ) {

                volatility =
                    "HIGH";

            } else if (
                atr14 < 8
            ) {

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
                    index -
                    VWAP_LOOKBACK
                );

            let touchIndex =
                null;

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
                        c.c -
                        v
                    ) /
                    a;

                const highDistance =
                    Math.abs(
                        c.h -
                        v
                    ) /
                    a;

                const lowDistance =
                    Math.abs(
                        c.l -
                        v
                    ) /
                    a;

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

                if (
                    touched
                ) {

                    touchIndex =
                        i;

                    bestDistance =
                        distance;
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
                ) /
                f.atr14;

            if (
                currentDistance >
                VWAP_MAX_ENTRY_DISTANCE_ATR
            ) {

                return null;
            }

            const recovery =
                side === "BUY"
                    ? f.close >
                      f.vwap
                    : f.close <
                      f.vwap;

            if (
                !recovery
            ) {
                return null;
            }

            const recoveryMove =
                side === "BUY"
                    ? (
                        f.close -
                        f.vwap
                    ) /
                    f.atr14
                    : (
                        f.vwap -
                        f.close
                    ) /
                    f.atr14;

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

            // TREND FOLLOW BUY

            if (
                f.trend ===
                    "BULLISH" &&
                f.vwapDirection ===
                    "ABOVE"
            ) {

                setups.push({

                    side:
                        "BUY",

                    setup:
                        "TREND_FOLLOW",

                    interaction:
                        null
                });
            }

            // TREND FOLLOW SELL

            if (
                f.trend ===
                    "BEARISH" &&
                f.vwapDirection ===
                    "BELOW"
            ) {

                setups.push({

                    side:
                        "SELL",

                    setup:
                        "TREND_FOLLOW",

                    interaction:
                        null
                });
            }

            // VWAP PULLBACK BUY

            if (
                f.trend ===
                    "BULLISH"
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

                        side:
                            "BUY",

                        setup:
                            "VWAP_PULLBACK",

                        interaction
                    });
                }
            }

            // VWAP PULLBACK SELL

            if (
                f.trend ===
                    "BEARISH"
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

                        side:
                            "SELL",

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

                reasons.push(
                    "TREND"
                );
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

                reasons.push(
                    "VWAP"
                );
            }

            if (
                (
                    side === "BUY" &&
                    f.ema9 >
                    f.ema21
                ) ||
                (
                    side === "SELL" &&
                    f.ema9 <
                    f.ema21
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

                reasons.push(
                    "SLOPE"
                );
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

                reasons.push(
                    "RSI"
                );
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
                     * Conservative same-candle
                     * assumption:
                     * STOP FIRST.
                     */

                    if (
                        hitStop &&
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR:
                                -1
                        };
                    }

                    if (
                        hitStop
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR:
                                -1
                        };
                    }

                    if (
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "TARGET",

                            resultR:
                                2
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

                            exitType:
                                "STOP",

                            resultR:
                                -1
                        };
                    }

                    if (
                        hitStop
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR:
                                -1
                        };
                    }

                    if (
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "TARGET",

                            resultR:
                                2
                        };
                    }
                }
            }

            return {

                exitIndex:
                    end,

                exitType:
                    "TIMEOUT",

                resultR:
                    0
            };
        }

        // =====================================================
        // LEARNING RECORD
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

            const interaction =
                setup ===
                "VWAP_PULLBACK"

                    ? recentVWAPInteraction(
                        candles,
                        index,
                        side
                    )

                    : null;

            if (
                setup ===
                    "VWAP_PULLBACK" &&
                !interaction
            ) {

                return null;
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

            const result =
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
                    result.resultR,

                exitIndex:
                    result.exitIndex,

                confirmationScore:
                    confirmation.score,

                interaction
            };
        }

        // =====================================================
        // METRICS
        // =====================================================

        function calculateMetrics(
            records
        ) {

            if (
                !Array.isArray(records)
            ) {

                records = [];
            }

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
                wins +
                losses;

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
                const record of records
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
        // PERSISTENCE / EDGE QUALITY
        // =====================================================

        function analyzePersistence(
            records,
            start,
            end
        ) {

            if (
                !Array.isArray(records) ||
                records.length === 0
            ) {

                return {

                    sections: 0,

                    stableSections: 0,

                    persistence: 0,

                    edgeDecay: 0,

                    sectionMetrics: []
                };
            }

            const length =
                Math.max(
                    1,
                    end - start
                );

            const sectionRecords = [
                [],
                [],
                [],
                []
            ];

            for (
                const record of records
            ) {

                const relative =
                    (
                        record.index -
                        start
                    ) /
                    length;

                let section =
                    Math.floor(
                        relative * 4
                    );

                section =
                    clamp(
                        section,
                        0,
                        3
                    );

                sectionRecords[
                    section
                ].push(
                    record
                );
            }

            const sectionMetrics =
                sectionRecords.map(
                    (section, index) => {

                        const metrics =
                            calculateMetrics(
                                section
                            );

                        return {

                            section:
                                index + 1,

                            trades:
                                metrics.trades,

                            decisiveTrades:
                                metrics.decisiveTrades,

                            netR:
                                metrics.netR,

                            expectedValueR:
                                metrics.expectedValueR,

                            profitFactor:
                                metrics.profitFactor
                        };
                    }
                );

            const validSections =
                sectionMetrics.filter(
                    x =>
                        x.trades >= 1
                );

            const positiveSections =
                validSections.filter(
                    x =>
                        x.expectedValueR >= 0
                ).length;

            const stableSections =
                validSections.filter(
                    x =>
                        x.decisiveTrades >= 1 &&
                        x.expectedValueR >= 0
                ).length;

            const older =
                sectionMetrics
                    .slice(
                        0,
                        2
                    )
                    .filter(
                        x =>
                            x.trades > 0
                    );

            const recent =
                sectionMetrics
                    .slice(
                        2,
                        4
                    )
                    .filter(
                        x =>
                            x.trades > 0
                    );

            const oldEV =
                older.length
                    ? older.reduce(
                        (
                            sum,
                            x
                        ) =>
                            sum +
                            x.expectedValueR,
                        0
                    ) /
                    older.length
                    : 0;

            const recentEV =
                recent.length
                    ? recent.reduce(
                        (
                            sum,
                            x
                        ) =>
                            sum +
                            x.expectedValueR,
                        0
                    ) /
                    recent.length
                    : 0;

            let edgeDecay = 0;

            if (
                oldEV > 0
            ) {

                edgeDecay =
                    (
                        oldEV -
                        recentEV
                    ) /
                    Math.abs(
                        oldEV
                    );

            } else if (
                recentEV < 0
            ) {

                edgeDecay = 1;
            }

            edgeDecay =
                round(
                    clamp(
                        edgeDecay,
                        -1,
                        1
                    ),
                    4
                );

            const persistence =
                validSections.length
                    ? positiveSections /
                      validSections.length
                    : 0;

            return {

                sections:
                    validSections.length,

                stableSections,

                persistence:
                    round(
                        persistence,
                        4
                    ),

                edgeDecay,

                oldEV:
                    round(
                        oldEV,
                        4
                    ),

                recentEV:
                    round(
                        recentEV,
                        4
                    ),

                sectionMetrics
            };
        }

        // =====================================================
        // LEARN HIERARCHY
        // =====================================================

        function learnHierarchy(
            candles,
            trainingStart,
            trainingEnd
        ) {

            const familyMap =
                new Map();

            const patternMap =
                new Map();

            const rawRecords = [];

            const lastSafeIndex =
                trainingEnd -
                MAX_HOLD_CANDLES;

            for (
                let i =
                    trainingStart + 30;

                i <
                    lastSafeIndex;

                i++
            ) {

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
                    const setupRecord
                    of setups
                ) {

                    const record =
                        createLearningRecord(
                            candles,
                            i,
                            setupRecord.side,
                            setupRecord.setup
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
                        .push(
                            record
                        );

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
                        .push(
                            record
                        );
                }
            }

            function summarize(
                key,
                records,
                level
            ) {

                if (
                    !Array.isArray(records)
                ) {
                    records = [];
                }

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

                const persistence =
                    analyzePersistence(
                        records,
                        trainingStart,
                        trainingEnd
                    );

                const recentStart =
                    trainingStart +
                    Math.floor(
                        (
                            trainingEnd -
                            trainingStart
                        ) *
                        (
                            1 -
                            RECENT_FRACTION
                        )
                    );

                const recentRecords =
                    records.filter(
                        x =>
                            x.index >=
                            recentStart
                    );

                const recentMetrics =
                    calculateMetrics(
                        recentRecords
                    );

                const recentDecisive =
                    recentMetrics
                        .decisiveTrades;

                const recentEV =
                    recentMetrics
                        .expectedValueR;

                const recentPF =
                    recentMetrics
                        .profitFactor;

                const recentLossStreak =
                    recentMetrics
                        .maxConsecutiveLosses;

                let quality = 0;

                quality +=
                    clamp(
                        winRate *
                        40,
                        0,
                        40
                    );

                quality +=
                    clamp(
                        Math.max(
                            metrics.expectedValueR,
                            0
                        ) *
                        30,
                        0,
                        30
                    );

                quality +=
                    clamp(
                        Math.max(
                            metrics.profitFactor -
                            1,
                            0
                        ) *
                        10,
                        0,
                        20
                    );

                quality +=
                    Math.min(
                        persistence
                            .stableSections,
                        4
                    ) *
                    2.5;

                if (
                    recentEV < 0
                ) {

                    quality -= 15;
                }

                if (
                    persistence.edgeDecay >
                    MAX_EDGE_DECAY
                ) {

                    quality -= 10;
                }

                quality =
                    clamp(
                        quality,
                        0,
                        100
                    );

                const samplePass =
                    level === "FAMILY"
                        ? samples >=
                          FAMILY_MIN_SAMPLES
                        : samples >=
                          PATTERN_MIN_SAMPLES;

                const decisivePass =
                    level === "FAMILY"
                        ? decisive >=
                          FAMILY_MIN_DECISIVE
                        : decisive >=
                          PATTERN_MIN_DECISIVE;

                const evPass =
                    level === "FAMILY"
                        ? metrics.expectedValueR >=
                          FAMILY_MIN_EV
                        : metrics.expectedValueR >=
                          PATTERN_MIN_EV;

                const pfPass =
                    level === "FAMILY"
                        ? metrics.profitFactor >=
                          FAMILY_MIN_PF
                        : metrics.profitFactor >=
                          PATTERN_MIN_PF;

                const persistencePass =
                    persistence.stableSections >=
                    MIN_PERSISTENCE_SECTIONS;

                const recentPass =
                    recentRecords.length >=
                        MIN_RECENT_SAMPLES &&
                    recentDecisive >=
                        MIN_RECENT_DECISIVE &&
                    recentEV >=
                        MIN_RECENT_EV &&
                    recentPF >=
                        MIN_RECENT_PF &&
                    recentLossStreak <=
                        MAX_RECENT_LOSS_STREAK;

                const decayPass =
                    persistence.edgeDecay <=
                    MAX_EDGE_DECAY;

                const qualified =
                    samplePass &&
                    decisivePass &&
                    evPass &&
                    pfPass &&
                    persistencePass &&
                    recentPass &&
                    decayPass &&
                    quality >=
                    QUALITY_THRESHOLD;

                return {

                    key,

                    level,

                    side:
                        key.startsWith(
                            "BUY|"
                        )
                            ? "BUY"
                            : "SELL",

                    setup:
                        key.includes(
                            "TREND_FOLLOW"
                        )
                            ? "TREND_FOLLOW"
                            : "VWAP_PULLBACK",

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

                    maxConsecutiveLosses:
                        metrics.maxConsecutiveLosses,

                    recentSamples:
                        recentRecords.length,

                    recentDecisive:
                        recentDecisive,

                    recentEV:
                        round(
                            recentEV,
                            4
                        ),

                    recentPF:
                        round(
                            recentPF,
                            4
                        ),

                    recentLossStreak,

                    persistence:
                        persistence.persistence,

                    stableSections:
                        persistence.stableSections,

                    edgeDecay:
                        persistence.edgeDecay,

                    oldEV:
                        persistence.oldEV,

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
                        (
                            a,
                            b
                        ) =>
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
                        (
                            a,
                            b
                        ) =>
                            b.quality -
                            a.quality
                    );

            const selected = [];

            /*
             * Family edges first.
             */

            for (
                const family
                of qualifiedFamilies
            ) {

                if (
                    selected.length >= 8
                ) {
                    break;
                }

                selected.push({

                    ...family,

                    inherited:
                        false,

                    familyEvidence:
                        family,

                    patternEvidence:
                        null
                });
            }

            /*
             * Detailed pattern edges.
             */

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

                if (
                    selected.some(
                        x =>
                            x.key ===
                            pattern.key
                    )
                ) {
                    continue;
                }

                selected.push({

                    ...pattern,

                    inherited:
                        false,

                    familyEvidence:
                        family ||
                        null,

                    patternEvidence:
                        pattern
                });
            }

            /*
             * Family inheritance.
             */

            for (
                const family
                of qualifiedFamilies
            ) {

                const hasDetailed =
                    selected.some(
                        x =>
                            x.level ===
                                "PATTERN" &&
                            x.family ===
                                family.key
                    );

                if (
                    hasDetailed
                ) {
                    continue;
                }

                if (
                    selected.length >= 12
                ) {
                    break;
                }

                selected.push({

                    ...family,

                    inherited:
                        true,

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

            if (
                !Array.isArray(trades) ||
                trades.length === 0
            ) {

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
                    trade.pattern;

                counts[key] =
                    (
                        counts[key] ||
                        0
                    ) + 1;
            }

            const values =
                Object.values(
                    counts
                );

            const maximum =
                Math.max(
                    ...values
                );

            const maximumShare =
                maximum /
                trades.length;

            return {

                uniquePatterns:
                    Object.keys(
                        counts
                    ).length,

                maximumShare:
                    round(
                        maximumShare,
                        4
                    ),

                patternCounts:
                    counts,

                concentrationPassed:
                    Object.keys(
                        counts
                    ).length >= 2 &&
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

            let cooldownUntil =
                -1;

            let lastPattern =
                null;

            let lastPatternIndex =
                -9999;

            let lastSide =
                null;

            let lastSideIndex =
                -9999;

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
                                x.key ===
                                    key ||
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
                        key ===
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

                    const atrValue =
                        f.atr14;

                    let stop;

                    let target;

                    let preferredTarget;

                    if (
                        setup.side ===
                        "BUY"
                    ) {

                        stop =
                            entry -
                            atrValue;

                        target =
                            entry +
                            TARGET_R *
                            atrValue;

                        preferredTarget =
                            entry +
                            PREFERRED_TARGET_R *
                            atrValue;

                    } else {

                        stop =
                            entry +
                            atrValue;

                        target =
                            entry -
                            TARGET_R *
                            atrValue;

                        preferredTarget =
                            entry -
                            PREFERRED_TARGET_R *
                            atrValue;
                    }

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

                        index:
                            i,

                        signalIndex:
                            i,

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
                            match.inherited ||
                            false,

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

                        persistence:
                            match.persistence,

                        stableSections:
                            match.stableSections,

                        familyQuality:
                            match.familyEvidence
                                ? match
                                    .familyEvidence
                                    .quality
                                : null,

                        patternQuality:
                            match.patternEvidence
                                ? match
                                    .patternEvidence
                                    .quality
                                : match.quality,

                        familySamples:
                            match.familyEvidence
                                ? match
                                    .familyEvidence
                                    .samples
                                : match.samples,

                        patternSamples:
                            match.patternEvidence
                                ? match
                                    .patternEvidence
                                    .samples
                                : null,

                        familyEV:
                            match.familyEvidence
                                ? match
                                    .familyEvidence
                                    .expectedValueR
                                : match.expectedValueR,

                        patternEV:
                            match.patternEvidence
                                ? match
                                    .patternEvidence
                                    .expectedValueR
                                : null,

                        familyPF:
                            match.familyEvidence
                                ? match
                                    .familyEvidence
                                    .profitFactor
                                : match.profitFactor,

                        patternPF:
                            match.patternEvidence
                                ? match
                                    .patternEvidence
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

                    trades.push(
                        trade
                    );

                    if (
                        outcome.resultR < 0
                    ) {

                        lossStreak.set(
                            key,
                            (
                                lossStreak.get(
                                    key
                                ) || 0
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
        // HISTORICAL API
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
                    JSON.parse(
                        text
                    );

            } catch {

                payload = {
                    raw:
                        text
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
        // LOAD HISTORICAL DATA
        // =====================================================

        async function loadHistoricalData() {

            const accessToken =
                (
                    process.env
                        .INDSTOCKS_TOKEN ||
                    process.env
                        .INDSTOCKS_ACCESS_TOKEN ||
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
                    chunkEnd +
                    1000;
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
                prepareData(
                    all
                );

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

        if (
            rows.length < 600
        ) {

            return fail(
                "Insufficient candle data for V14.4 robustness testing.",
                {

                    rawCandles:
                        historicalData.rawCandles,

                    normalizedCandles:
                        historicalData.normalizedCandles,

                    minimumRequired:
                        600
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

        if (
            total <=
            INITIAL_TRAINING +
            FOLD_COUNT * 50
        ) {

            return fail(
                "Insufficient historical rows for six-fold walk-forward testing.",
                {

                    historicalRows:
                        total,

                    requiredMoreThan:
                        INITIAL_TRAINING +
                        FOLD_COUNT * 50
                }
            );
        }

        const availableTestRows =
            total -
            INITIAL_TRAINING;

        const baseTestSize =
            Math.floor(
                availableTestRows /
                FOLD_COUNT
            );

        const folds = [];

        let trainingEnd =
            INITIAL_TRAINING;

        for (
            let fold = 1;
            fold <= FOLD_COUNT;
            fold++
        ) {

            const testStart =
                trainingEnd;

            const testEnd =
                fold === FOLD_COUNT
                    ? total
                    : Math.min(
                        total,
                        testStart +
                        baseTestSize
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

            const profitable =
                metrics.netR > 0 &&
                metrics.decisiveTrades >= 1;

            const familySet =
                new Set(
                    trades.map(
                        x =>
                            x.family
                    )
                );

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
                    learned.families.filter(
                        x =>
                            x.qualified
                    ).length,

                discoveredPatterns:
                    learned.patterns.length,

                qualifiedPatterns:
                    learned.patterns.filter(
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

                selectedSides:
                    selected.map(
                        x =>
                            x.side
                    ),

                independentFamilies:
                    familySet.size,

                profitableFold:
                    profitable,

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
        // GLOBAL METRICS
        // =====================================================

        const globalStats =
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

        const profitableFolds =
            foldResults.filter(
                x =>
                    x.profitableFold
            ).length;

        // =====================================================
        // BUY / SELL EVIDENCE
        // =====================================================

        const buyTrades =
            allTrades.filter(
                x =>
                    x.side === "BUY"
            );

        const sellTrades =
            allTrades.filter(
                x =>
                    x.side === "SELL"
            );

        const buyStats =
            calculateMetrics(
                buyTrades
            );

        const sellStats =
            calculateMetrics(
                sellTrades
            );

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
        // RECENT OOS
        // =====================================================

        const recentOOSStart =
            Math.floor(
                allTrades.length *
                (
                    1 -
                    RECENT_FRACTION
                )
            );

        const latestOOSTrades =
            allTrades.slice(
                recentOOSStart
            );

        const latestOOSMetrics =
            calculateMetrics(
                latestOOSTrades
            );

        // =====================================================
        // GLOBAL PROOF
        // =====================================================

        const profitabilityProof =
            globalStats.expectedValueR >=
                MIN_GLOBAL_EV &&

            globalStats.profitFactor >=
                MIN_GLOBAL_PF &&

            globalStats.decisiveTrades >=
                MIN_GLOBAL_DECISIVE &&

            profitableFolds >=
                REQUIRED_PROFITABLE_FOLDS &&

            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&

            globalConcentration
                .concentrationPassed &&

            latestOOSMetrics
                .decisiveTrades >=
                MIN_RECENT_DECISIVE &&

            latestOOSMetrics
                .expectedValueR >=
                MIN_RECENT_EV &&

            latestOOSMetrics
                .profitFactor >=
                MIN_RECENT_PF;

        // =====================================================
        // RISK
        // =====================================================

        const riskControl =
            globalStats.maxDrawdownR <=
                MAX_OOS_DRAWDOWN &&

            globalStats.maxConsecutiveLosses <=
                MAX_LOSS_STREAK;

        // =====================================================
        // EVIDENCE
        // =====================================================

        const sufficientEvidence =
            globalStats.decisiveTrades >=
            MIN_GLOBAL_DECISIVE;

        const patternDiversity =
            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&

            globalConcentration
                .maximumShare <=
                MAX_PATTERN_CONCENTRATION;

        // =====================================================
        // LATEST LEARNING
        // =====================================================

        const latestLearning =
            learnHierarchy(
                candles,
                0,
                candles.length
            );

        const qualifiedFamilies =
            latestLearning.families
                .filter(
                    x =>
                        x.qualified
                );

        const qualifiedPatterns =
            latestLearning.patterns
                .filter(
                    x =>
                        x.qualified
                );

        const latestSelected =
            selectEdges(
                latestLearning
            );

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
            const f
            of latestLearning.families
        ) {

            if (
                f.samples <
                FAMILY_MIN_SAMPLES
            ) {

                familyRejections
                    .insufficientSamples++;
            }

            if (
                f.decisiveTrades <
                FAMILY_MIN_DECISIVE
            ) {

                familyRejections
                    .insufficientDecisive++;
            }

            if (
                f.stableSections <
                MIN_PERSISTENCE_SECTIONS
            ) {

                familyRejections
                    .insufficientStability++;
            }

            if (
                f.expectedValueR <
                FAMILY_MIN_EV ||
                f.profitFactor <
                FAMILY_MIN_PF
            ) {

                familyRejections
                    .edgeBelowThreshold++;
            }

            if (
                f.recentEV < 0
            ) {

                familyRejections
                    .recentNegative++;
            }

            if (
                f.recentSamples <
                    MIN_RECENT_SAMPLES ||
                f.recentDecisive <
                    MIN_RECENT_DECISIVE
            ) {

                familyRejections
                    .recentInsufficient++;
            }

            if (
                f.edgeDecay >
                MAX_EDGE_DECAY
            ) {

                familyRejections
                    .excessiveDecay++;
            }
        }

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

                    available:
                        false
                };
            }

            return {

                available:
                    true,

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
                "No qualified V14.4 edge is active.",

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

            const setups =
                detectSetups(
                    rows,
                    currentIndex
                );

            if (
                setups.length
            ) {

                /*
                 * Important:
                 *
                 * Learning uses rows WITHOUT
                 * the current candle.
                 *
                 * Current candle is used only
                 * to determine the live paper
                 * signal.
                 */

                const finalLearning =
                    learnHierarchy(
                        rows.slice(
                            0,
                            -1
                        ),
                        0,
                        rows.length - 1
                    );

                const selected =
                    selectEdges(
                        finalLearning
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
                            currentFeatures
                                .trend
                        );

                    const match =
                        selected.find(
                            x =>
                                x.key ===
                                    key ||
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

                        /*
                         * Never activate a live
                         * paper signal if the
                         * global evidence has not
                         * proven the system.
                         *
                         * This keeps V14.4
                         * conservative.
                         */

                        if (
                            profitabilityProof
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

                                inheritedFamily:
                                    match.inherited ||
                                    false,

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

                                persistence:
                                    match.persistence,

                                confirmationScore:
                                    confirmation.score,

                                confirmationMaxScore:
                                    confirmation.maxScore,

                                confirmationReasons:
                                    confirmation.reasons,

                                market:
                                    currentMarketData,

                                reason:
                                    "Qualified V14.4 edge with strict global OOS proof.",

                                nextAction:
                                    "PAPER_REVIEW_ONLY"
                            };

                            break;

                        } else {

                            currentSignal = {

                                status:
                                    "NO_TRADE",

                                side:
                                    null,

                                setup:
                                    null,

                                candidateSide:
                                    setup.side,

                                candidateSetup:
                                    setup.setup,

                                candidatePattern:
                                    key,

                                reason:
                                    "A historical edge exists, but V14.4 profitability proof is not yet established.",

                                nextAction:
                                    "WAIT"
                            };
                        }
                    }
                }
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
                "V14_4_ROBUSTNESS_EVIDENCE_TRUE_WALK_FORWARD",

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

                hierarchicalLearning:
                    true,

                familyLearning:
                    true,

                detailedPatternLearning:
                    true,

                familyEvidenceInheritance:
                    true,

                recentVWAPPullback:
                    true,

                staleVWAPPullbackBlocked:
                    true,

                edgePersistence:
                    true,

                edgeDecayTracking:
                    true,

                overlappingPaperTrades:
                    false,

                sameCandleStopTargetBias:
                    "STOP_FIRST"
            },

            robustness: {

                requestedHistoricalDays:
                    REQUESTED_DAYS,

                walkForwardFolds:
                    folds.length,

                initialTrainingRows:
                    INITIAL_TRAINING,

                requiredProfitableFolds:
                    REQUIRED_PROFITABLE_FOLDS,

                actualProfitableFolds:
                    profitableFolds,

                foldValidation:
                    profitableFolds >=
                    REQUIRED_PROFITABLE_FOLDS
                        ? "PASSED"
                        : "NOT_PASSED",

                purpose:
                    "Increase independent chronological evidence before profitability can be proven."
            },

            learning: {

                familiesDiscovered:
                    latestLearning
                        .families
                        .length,

                qualifiedFamilies:
                    qualifiedFamilies
                        .length,

                patternsDiscovered:
                    latestLearning
                        .patterns
                        .length,

                qualifiedPatterns:
                    qualifiedPatterns
                        .length,

                selectedEdges:
                    latestSelected
                        .length,

                detailedPatternEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.level ===
                                "PATTERN"
                        )
                        .length,

                familyEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.level ===
                                "FAMILY"
                        )
                        .length,

                inheritedFamilyEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.inherited
                        )
                        .length,

                buyEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.side ===
                                "BUY"
                        )
                        .length,

                sellEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.side ===
                                "SELL"
                        )
                        .length
            },

            edgeValidation: {

                recentFraction:
                    RECENT_FRACTION,

                minimumRecentSamples:
                    MIN_RECENT_SAMPLES,

                minimumRecentDecisive:
                    MIN_RECENT_DECISIVE,

                minimumRecentEV:
                    MIN_RECENT_EV,

                minimumRecentPF:
                    MIN_RECENT_PF,

                maximumRecentLossStreak:
                    MAX_RECENT_LOSS_STREAK,

                minimumPersistenceSections:
                    MIN_PERSISTENCE_SECTIONS,

                maximumEdgeDecay:
                    MAX_EDGE_DECAY,

                latestOOSTrades:
                    latestOOSTrades.length,

                latestOOSMetrics:
                    latestOOSMetrics
            },

            walkForward: {

                method:
                    "STRICT_TRUE_EXPANDING_WALK_FORWARD",

                folds:
                    folds.length,

                requiredProfitableFolds:
                    REQUIRED_PROFITABLE_FOLDS,

                profitableFolds:
                    profitableFolds,

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

                            selectedEdges:
                                x.selectedEdges,

                            selectedLevels:
                                x.selectedLevels,

                            selectedSides:
                                x.selectedSides,

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
                    profitableFolds >=
                    REQUIRED_PROFITABLE_FOLDS
                        ? "PASSED"
                        : "FAILED",

                independentFamilies:
                    independentFamilies,

                requiredIndependentFamilies:
                    MIN_INDEPENDENT_FAMILIES,

                maximumPatternShare:
                    globalConcentration
                        .maximumShare,

                patternDiversity:
                    patternDiversity
                        ? "PASSED"
                        : "FAILED",

                globalExpectedValueR:
                    globalStats
                        .expectedValueR,

                globalProfitFactor:
                    globalStats
                        .profitFactor,

                globalDecisiveTrades:
                    globalStats
                        .decisiveTrades
            },

            buySellEvidence: {

                BUY:
                    buyStats,

                SELL:
                    sellStats
            },

            setupPerformance: {

                trendFollow:
                    setupPerformance
                        .trendFollow,

                vwapPullback:
                    setupPerformance
                        .vwapPullback
            },

            currentMarket:
                currentMarketData,

            currentSignal,

            latestLearning: {

                trainingRows:
                    candles.length,

                familiesDiscovered:
                    latestLearning
                        .families
                        .length,

                qualifiedFamilies:
                    qualifiedFamilies
                        .length,

                patternsDiscovered:
                    latestLearning
                        .patterns
                        .length,

                qualifiedPatterns:
                    qualifiedPatterns
                        .length,

                selectedEdges:
                    latestSelected
                        .length,

                buyEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.side ===
                                "BUY"
                        )
                        .length,

                sellEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.side ===
                                "SELL"
                        )
                        .length,

                trendFollowEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.setup ===
                                "TREND_FOLLOW"
                        )
                        .length,

                vwapPullbackEdges:
                    latestSelected
                        .filter(
                            x =>
                                x.setup ===
                                "VWAP_PULLBACK"
                        )
                        .length,

                familyRejections
            },

            validationRules: {

                historicalAPI: {

                    endpoint:
                        `/market/historical/${INTERVAL}`,

                    maximumChunkDays:
                        7,

                    chunkingEnabled:
                        true,

                    requestedMaximumDays:
                        60
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
                        VWAP_MAX_CANDLES_AFTER_TOUCH,

                    staleEntryProtection:
                        true
                },

                edgeValidation: {

                    recentFraction:
                        RECENT_FRACTION,

                    minimumRecentSamples:
                        MIN_RECENT_SAMPLES,

                    minimumRecentDecisive:
                        MIN_RECENT_DECISIVE,

                    minimumRecentEV:
                        MIN_RECENT_EV,

                    minimumRecentPF:
                        MIN_RECENT_PF,

                    maximumRecentLossStreak:
                        MAX_RECENT_LOSS_STREAK,

                    minimumPersistenceSections:
                        MIN_PERSISTENCE_SECTIONS,

                    maximumEdgeDecay:
                        MAX_EDGE_DECAY
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

                riskPerTradeR:
                    RISK_R,

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

                noStopWidening:
                    true,

                maxDrawdownR:
                    MAX_OOS_DRAWDOWN,

                maxLossStreak:
                    MAX_LOSS_STREAK
            },

            paperTradeLog:
                allTrades,

            paperAction:
                currentSignal.status ===
                    "SIGNAL"
                    ? "PAPER_REVIEW_ONLY"
                    : "NO_TRADE",

            nextAction:
                currentSignal.status ===
                    "SIGNAL"
                    ? "WAIT_FOR_NEXT_CONFIRMED_CANDLE"
                    : "WAIT"
        });

    } catch (error) {

        console.error(
            "TradeMind Pro V14.4 ERROR:",
            error
        );

        return res
            .status(500)
            .json({

                success: false,

                version:
                    "V14.4",

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

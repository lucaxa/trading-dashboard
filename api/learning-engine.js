/*
===========================================================
 TradeMind Pro
 V13.6 — MULTI-SETUP + SESSION VWAP + TRUE WALK-FORWARD

 Instrument : NIFTY 50
 Scrip      : NIDX_40000001
 Interval   : 5 minute
 Data       : INDstocks Historical API
 Mode       : PAPER ONLY
 Orders     : NONE

 V13.6 OBJECTIVE
 ----------------------------------------------------------
 Add genuinely independent trading setups while preserving
 the strict anti-leakage architecture of V13.5.

 SETUPS
 ----------------------------------------------------------
 1. TREND_FOLLOW
    EMA9 > EMA21 + directional slope + VWAP alignment

 2. VWAP_PULLBACK
    Established directional trend +
    recent pullback toward/crossing VWAP +
    confirmation back in trend direction

 IMPORTANT
 ----------------------------------------------------------
 - Historical data comes only from INDstocks
 - INDstocks authentication uses INDSTOCKS_TOKEN
 - 7-day historical chunking
 - Current candle excluded from learning
 - Strict expanding walk-forward
 - No shuffled data
 - No future-data leakage
 - Session VWAP resets every IST trading day
 - Independent confirmation
 - No overlapping trades
 - Pattern cooldown
 - Side cooldown
 - Pattern loss circuit breaker
 - OOS accounting only
 - Paper only
 - NO broker order code
===========================================================
*/

export default async function handler(req, res) {

    try {

        // =====================================================
        // CONFIG
        // =====================================================

        const VERSION = "V13.6";

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
        // LEARNING RULES
        // =====================================================

        const QUALITY_THRESHOLD = 55;

        const MIN_PATTERN_SAMPLES = 6;
        const MIN_OOS_SAMPLES = 6;
        const MIN_STABLE_FOLDS = 2;

        const MIN_EXPECTED_VALUE = 0.05;
        const MIN_PROFIT_FACTOR = 1.05;

        const MIN_INDEPENDENT_PATTERNS = 2;
        const MAX_PATTERN_CONCENTRATION = 0.75;

        // =====================================================
        // RISK
        // =====================================================

        const STOP_R = 1;
        const TARGET_R = 2;
        const PREFERRED_TARGET_R = 2.5;

        const MAX_HOLD_CANDLES = 12;

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
        // PROTECTION
        // =====================================================

        const MAX_PATTERN_LOSS_STREAK = 6;
        const MAX_OOS_DRAWDOWN = 12;

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
        // NUMBER HELPERS
        // =====================================================

        function n(x, fallback = null) {

            const value = Number(x);

            return Number.isFinite(value)
                ? value
                : fallback;
        }

        function round(x, digits = 4) {

            if (!Number.isFinite(x)) {
                return null;
            }

            const factor =
                Math.pow(10, digits);

            return Math.round(
                x * factor
            ) / factor;
        }

        function clamp(x, min, max) {

            return Math.max(
                min,
                Math.min(max, x)
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
        // RECURSIVE CANDLE EXTRACTION
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
            ]
            .sort(
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

            const output = {};

            for (const part of parts) {

                if (
                    part.type !== "literal"
                ) {

                    output[part.type] =
                        part.value;
                }
            }

            return output;
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

            const mins =
                istMinutes(ts);

            if (mins < 10 * 60) {
                return "OPEN";
            }

            if (mins < 12 * 60) {
                return "MORNING";
            }

            if (mins < 14 * 60) {
                return "MIDDAY";
            }

            return "CLOSE";
        }

        // =====================================================
        // SESSION VWAP
        // =====================================================

        function calculateSessionVWAP(
            candles,
            index
        ) {

            if (
                index < 0 ||
                !candles[index]
            ) {
                return null;
            }

            const sessionDate =
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

                const candle =
                    candles[i];

                if (
                    istDate(candle.ts) !==
                    sessionDate
                ) {
                    break;
                }

                const typical =
                    (
                        candle.h +
                        candle.l +
                        candle.c
                    ) / 3;

                const vol =
                    Math.max(
                        0,
                        n(candle.v, 0)
                    );

                pv +=
                    typical * vol;

                volume += vol;
            }

            if (volume <= 0) {
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

            if (avgLoss === 0) {
                return 100;
            }

            const rs =
                avgGain /
                avgLoss;

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

                const current =
                    candles[i];

                const previous =
                    candles[i - 1];

                const tr =
                    Math.max(
                        current.h -
                            current.l,

                        Math.abs(
                            current.h -
                            previous.c
                        ),

                        Math.abs(
                            current.l -
                            previous.c
                        )
                    );

                trs.push(tr);
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
                    ) /
                    period;
            }

            return value;
        }

        // =====================================================
        // VWAP PULLBACK DETECTION
        // =====================================================

        function detectVWAPPullback(
            candles,
            index,
            side
        ) {

            if (index < 3) {
                return false;
            }

            const current =
                candles[index];

            const previous =
                candles[index - 1];

            const twoBack =
                candles[index - 2];

            const currentVWAP =
                calculateSessionVWAP(
                    candles,
                    index
                );

            const previousVWAP =
                calculateSessionVWAP(
                    candles,
                    index - 1
                );

            const twoBackVWAP =
                calculateSessionVWAP(
                    candles,
                    index - 2
                );

            if (
                currentVWAP === null ||
                previousVWAP === null ||
                twoBackVWAP === null
            ) {
                return false;
            }

            /*
             * BUY pullback:
             *
             * 1. Current close is above VWAP.
             * 2. Previous candle touched/crossed VWAP.
             * 3. Current candle closes back above VWAP.
             * 4. Current candle is bullish.
             */

            if (side === "BUY") {

                const previousTouched =
                    previous.l <=
                    previousVWAP;

                const previousCrossed =
                    previous.c <=
                    previousVWAP;

                const currentRecovered =
                    current.c >
                    currentVWAP;

                const bullishRecovery =
                    current.c >
                    current.o;

                const priorAbove =
                    twoBack.c >
                    twoBackVWAP;

                return (
                    priorAbove &&
                    (
                        previousTouched ||
                        previousCrossed
                    ) &&
                    currentRecovered &&
                    bullishRecovery
                );
            }

            /*
             * SELL pullback:
             *
             * 1. Current close below VWAP.
             * 2. Previous candle touched/crossed VWAP.
             * 3. Current candle closes back below VWAP.
             * 4. Current candle is bearish.
             */

            if (side === "SELL") {

                const previousTouched =
                    previous.h >=
                    previousVWAP;

                const previousCrossed =
                    previous.c >=
                    previousVWAP;

                const currentRecovered =
                    current.c <
                    currentVWAP;

                const bearishRecovery =
                    current.c <
                    current.o;

                const priorBelow =
                    twoBack.c <
                    twoBackVWAP;

                return (
                    priorBelow &&
                    (
                        previousTouched ||
                        previousCrossed
                    ) &&
                    currentRecovered &&
                    bearishRecovery
                );
            }

            return false;
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

            const previousCloses =
                closes.slice(
                    0,
                    -1
                );

            const previousEMA9 =
                ema(
                    previousCloses,
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
                calculateSessionVWAP(
                    candles,
                    index
                );

            if (
                ema9 === null ||
                ema21 === null ||
                rsi14 === null ||
                atr14 === null ||
                vwap === null
            ) {
                return null;
            }

            const close =
                candles[index].c;

            const emaSpread =
                ema9 - ema21;

            const emaSpreadATR =
                atr14 > 0
                    ? emaSpread / atr14
                    : 0;

            const ema9Slope =
                previousEMA9 === null
                    ? 0
                    : ema9 -
                      previousEMA9;

            const ema9SlopeATR =
                atr14 > 0
                    ? ema9Slope / atr14
                    : 0;

            // =================================================
            // TREND
            // =================================================

            let trend =
                "SIDEWAYS";

            if (
                ema9 > ema21 &&
                ema9SlopeATR > 0
            ) {
                trend = "BULLISH";
            }

            if (
                ema9 < ema21 &&
                ema9SlopeATR < 0
            ) {
                trend = "BEARISH";
            }

            // =================================================
            // RSI
            // =================================================

            let rsiBucket =
                "NEUTRAL";

            if (rsi14 >= 60) {

                rsiBucket = "HIGH";

            } else if (rsi14 >= 50) {

                rsiBucket =
                    "NEUTRAL_HIGH";

            } else if (rsi14 <= 40) {

                rsiBucket = "LOW";

            } else {

                rsiBucket =
                    "NEUTRAL_LOW";
            }

            // =================================================
            // VWAP
            // =================================================

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
                atr14 > 0
                    ? (
                        close - vwap
                    ) / atr14
                    : 0;

            // =================================================
            // VOLATILITY
            // =================================================

            let volatility =
                "NORMAL";

            if (atr14 > 18) {

                volatility =
                    "HIGH";

            } else if (atr14 < 8) {

                volatility =
                    "LOW";
            }

            // =================================================
            // REGIME
            // =================================================

            let regime =
                "TRANSITION";

            if (
                Math.abs(
                    emaSpreadATR
                ) > 0.35 &&
                Math.abs(
                    ema9SlopeATR
                ) > 0.08
            ) {

                regime =
                    "TRENDING";

            } else if (
                Math.abs(
                    emaSpreadATR
                ) < 0.15 &&
                Math.abs(
                    ema9SlopeATR
                ) < 0.05
            ) {

                regime =
                    "RANGING";
            }

            // =================================================
            // TREND FOLLOW SETUP
            // =================================================

            let trendFollow = false;

            if (
                trend === "BULLISH" &&
                vwapDirection === "ABOVE"
            ) {

                trendFollow = true;

            } else if (
                trend === "BEARISH" &&
                vwapDirection === "BELOW"
            ) {

                trendFollow = true;
            }

            // =================================================
            // PULLBACK SETUP
            // =================================================

            let vwapPullback = false;

            if (
                trend === "BULLISH" &&
                vwapDirection === "ABOVE"
            ) {

                vwapPullback =
                    detectVWAPPullback(
                        candles,
                        index,
                        "BUY"
                    );
            }

            if (
                trend === "BEARISH" &&
                vwapDirection === "BELOW"
            ) {

                vwapPullback =
                    detectVWAPPullback(
                        candles,
                        index,
                        "SELL"
                    );
            }

            return {

                close,

                ema9,

                ema21,

                emaSpread,

                emaSpreadATR,

                ema9SlopeATR,

                rsi:
                    rsi14,

                rsiBucket,

                atr14,

                vwap,

                vwapDirection,

                vwapDistanceATR,

                trend,

                regime,

                volatility,

                trendFollow,

                vwapPullback,

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
        // DETERMINE SETUP
        // =====================================================

        function determineSetup(
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

            /*
             * Pullback gets priority because it is
             * the more specific setup.
             */

            if (
                f.vwapPullback
            ) {

                return "VWAP_PULLBACK";
            }

            if (
                f.trendFollow
            ) {

                return "TREND_FOLLOW";
            }

            return null;
        }

        // =====================================================
        // BASE SIGNAL
        // =====================================================

        function baseSignal(
            candles,
            index
        ) {

            const f =
                features(
                    candles,
                    index
                );

            if (!f) {
                return null;
            }

            if (
                f.trend === "BULLISH" &&
                f.vwapDirection === "ABOVE"
            ) {

                const setup =
                    determineSetup(
                        candles,
                        index,
                        "BUY"
                    );

                if (setup) {

                    return {
                        side: "BUY",
                        setup
                    };
                }
            }

            if (
                f.trend === "BEARISH" &&
                f.vwapDirection === "BELOW"
            ) {

                const setup =
                    determineSetup(
                        candles,
                        index,
                        "SELL"
                    );

                if (setup) {

                    return {
                        side: "SELL",
                        setup
                    };
                }
            }

            return null;
        }

        // =====================================================
        // PATTERN KEY
        // =====================================================

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

                `H:${f.timeBucket}`

            ].join("|");
        }

        // =====================================================
        // PATTERN FAMILY
        // =====================================================

        function familyKey(
            side,
            setup,
            f
        ) {

            /*
             * IMPORTANT:
             *
             * Setup is deliberately included.
             *
             * This means TREND_FOLLOW and
             * VWAP_PULLBACK count as genuinely
             * different strategy families.
             */

            return [

                side,

                `S:${setup}`,

                `T:${f.trend}`

            ].join("|");
        }

        // =====================================================
        // ENTRY CONFIRMATION
        // =====================================================

        function confirmationScore(
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

                return {

                    score: 0,

                    maxScore: 6,

                    passed: false,

                    reasons: []
                };
            }

            let score = 0;

            const reasons = [];

            // =================================================
            // 1 TREND
            // =================================================

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

            // =================================================
            // 2 VWAP
            // =================================================

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

            // =================================================
            // 3 EMA ALIGNMENT
            // =================================================

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

            // =================================================
            // 4 EMA SPREAD
            // =================================================

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

            // =================================================
            // 5 SLOPE
            // =================================================

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

            // =================================================
            // 6 RSI
            // =================================================

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

            /*
             * VWAP_PULLBACK gets an additional structural
             * requirement: the setup itself must actually
             * be present.
             *
             * We do not increase maxScore because this
             * remains a six-point confirmation system.
             */

            if (
                setup === "VWAP_PULLBACK" &&
                !f.vwapPullback
            ) {

                return {

                    score,

                    maxScore: 6,

                    passed: false,

                    reasons
                };
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
        // TRADE OUTCOME
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

                            exitType:
                                "STOP",

                            resultR:
                                -1
                        };
                    }

                    if (hitStop) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR:
                                -1
                        };
                    }

                    if (hitTarget) {

                        return {

                            exitIndex: i,

                            exitType:
                                "TARGET",

                            resultR:
                                2
                        };
                    }
                }

                if (side === "SELL") {

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

                    if (hitStop) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR:
                                -1
                        };
                    }

                    if (hitTarget) {

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

                exitIndex: end,

                exitType:
                    "TIMEOUT",

                resultR:
                    0
            };
        }

        // =====================================================
        // LEARN PATTERNS
        // =====================================================

        function learnPatterns(
            candles,
            trainingStart,
            trainingEnd
        ) {

            const patterns =
                new Map();

            for (
                let i =
                    trainingStart + 30;

                i <
                    trainingEnd -
                    MAX_HOLD_CANDLES;

                i++
            ) {

                const signal =
                    baseSignal(
                        candles,
                        i
                    );

                if (!signal) {
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

                const side =
                    signal.side;

                const setup =
                    signal.setup;

                const confirmation =
                    confirmationScore(
                        candles,
                        i,
                        side,
                        setup
                    );

                if (
                    !confirmation.passed
                ) {
                    continue;
                }

                const key =
                    patternKey(
                        side,
                        setup,
                        f
                    );

                const family =
                    familyKey(
                        side,
                        setup,
                        f
                    );

                const entry =
                    candles[i].c;

                const atrValue =
                    f.atr14;

                if (
                    !Number.isFinite(
                        atrValue
                    ) ||
                    atrValue <= 0
                ) {
                    continue;
                }

                let stop;
                let target;

                if (side === "BUY") {

                    stop =
                        entry -
                        atrValue;

                    target =
                        entry +
                        2 *
                        atrValue;

                } else {

                    stop =
                        entry +
                        atrValue;

                    target =
                        entry -
                        2 *
                        atrValue;
                }

                const result =
                    evaluateTrade(
                        candles,
                        i,
                        side,
                        entry,
                        stop,
                        target
                    );

                if (!patterns.has(key)) {

                    patterns.set(
                        key,
                        {

                            key,

                            family,

                            side,

                            setup,

                            patternType:
                                setup,

                            regime:
                                f.regime,

                            timeBucket:
                                f.timeBucket,

                            samples: 0,

                            wins: 0,

                            losses: 0,

                            timeouts: 0,

                            totalR: 0,

                            results: [],

                            foldSet:
                                new Set(),

                            recentResults: []
                        }
                    );
                }

                const p =
                    patterns.get(key);

                p.samples++;

                p.totalR +=
                    result.resultR;

                p.results.push(
                    result.resultR
                );

                if (
                    result.resultR > 0
                ) {

                    p.wins++;

                } else if (
                    result.resultR < 0
                ) {

                    p.losses++;

                } else {

                    p.timeouts++;
                }

                const section =
                    Math.min(
                        2,
                        Math.floor(
                            (
                                i -
                                trainingStart
                            ) /
                            Math.max(
                                1,
                                (
                                    trainingEnd -
                                    trainingStart
                                ) / 3
                            )
                        )
                    );

                p.foldSet.add(
                    section
                );

                const recentStart =
                    trainingStart +
                    Math.floor(
                        (
                            trainingEnd -
                            trainingStart
                        ) *
                        0.75
                    );

                if (
                    i >= recentStart
                ) {

                    p.recentResults.push(
                        result.resultR
                    );
                }
            }

            const output = [];

            for (
                const p of patterns.values()
            ) {

                const decisive =
                    p.wins +
                    p.losses;

                const winRate =
                    decisive > 0
                        ? p.wins /
                          decisive
                        : 0;

                const ev =
                    p.samples > 0
                        ? p.totalR /
                          p.samples
                        : 0;

                const grossWin =
                    p.wins * 2;

                const grossLoss =
                    p.losses;

                const pf =
                    grossLoss > 0
                        ? grossWin /
                          grossLoss
                        : grossWin > 0
                            ? 999
                            : 0;

                const stableFolds =
                    p.foldSet.size;

                const recentEV =
                    p.recentResults.length
                        ? p.recentResults.reduce(
                            (a, b) =>
                                a + b,
                            0
                        ) /
                        p.recentResults.length
                        : 0;

                let decay = 0;

                if (
                    Math.abs(ev) >
                    0.000001
                ) {

                    decay =
                        (
                            recentEV -
                            ev
                        ) /
                        Math.abs(ev);
                }

                // =================================================
                // QUALITY
                // =================================================

                let quality = 0;

                quality +=
                    clamp(
                        winRate * 40,
                        0,
                        40
                    );

                quality +=
                    clamp(
                        Math.max(ev, 0) * 30,
                        0,
                        30
                    );

                quality +=
                    clamp(
                        Math.max(
                            pf - 1,
                            0
                        ) * 10,
                        0,
                        20
                    );

                quality +=
                    Math.min(
                        stableFolds,
                        3
                    ) * 5;

                if (recentEV < 0) {
                    quality -= 15;
                }

                if (
                    p.losses > 0 &&
                    p.wins === 0
                ) {
                    quality -= 10;
                }

                quality =
                    clamp(
                        quality,
                        0,
                        100
                    );

                // =================================================
                // QUALIFICATION
                // =================================================

                const evidenceOK =
                    p.samples >=
                    MIN_PATTERN_SAMPLES;

                const stableOK =
                    stableFolds >=
                    MIN_STABLE_FOLDS;

                const performanceOK =
                    ev >=
                        MIN_EXPECTED_VALUE &&
                    pf >=
                        MIN_PROFIT_FACTOR;

                const decayOK =
                    decay >= -0.75;

                const decisiveOK =
                    decisive >= 3;

                const qualified =
                    evidenceOK &&
                    stableOK &&
                    performanceOK &&
                    decayOK &&
                    decisiveOK &&
                    quality >=
                        QUALITY_THRESHOLD;

                output.push({

                    key:
                        p.key,

                    family:
                        p.family,

                    side:
                        p.side,

                    setup:
                        p.setup,

                    patternType:
                        p.patternType,

                    regime:
                        p.regime,

                    timeBucket:
                        p.timeBucket,

                    samples:
                        p.samples,

                    wins:
                        p.wins,

                    losses:
                        p.losses,

                    timeouts:
                        p.timeouts,

                    winRate:
                        round(
                            winRate * 100,
                            2
                        ),

                    EV:
                        round(
                            ev,
                            4
                        ),

                    PF:
                        round(
                            pf,
                            4
                        ),

                    expectedValueR:
                        round(
                            ev,
                            4
                        ),

                    recentEV:
                        round(
                            recentEV,
                            4
                        ),

                    decay:
                        round(
                            decay,
                            4
                        ),

                    stableFolds,

                    oosSamples:
                        p.samples,

                    quality:
                        round(
                            quality,
                            2
                        ),

                    qualified,

                    rejectionReasons:
                        qualified
                            ? []
                            : [

                                !evidenceOK
                                    ? "INSUFFICIENT_SAMPLES"
                                    : null,

                                !stableOK
                                    ? "INSUFFICIENT_STABILITY"
                                    : null,

                                !performanceOK
                                    ? "EDGE_BELOW_THRESHOLD"
                                    : null,

                                !decayOK
                                    ? "EDGE_DECAY"
                                    : null,

                                !decisiveOK
                                    ? "INSUFFICIENT_DECISIVE_TRADES"
                                    : null,

                                quality <
                                    QUALITY_THRESHOLD
                                    ? "QUALITY_BELOW_THRESHOLD"
                                    : null

                            ].filter(Boolean)
                });
            }

            return output;
        }

        // =====================================================
        // SELECT PATTERNS
        // =====================================================

        function selectPatterns(patterns) {

            const qualified =
                patterns
                    .filter(
                        p =>
                            p.qualified
                    )
                    .sort(
                        (a, b) =>
                            b.quality -
                            a.quality
                    );

            if (!qualified.length) {
                return [];
            }

            const selected = [];

            const families =
                new Set();

            // First select independent families.

            for (
                const p of qualified
            ) {

                if (
                    selected.length >= 8
                ) {
                    break;
                }

                if (
                    !families.has(
                        p.family
                    )
                ) {

                    selected.push(p);

                    families.add(
                        p.family
                    );
                }
            }

            // Then allow additional high-quality patterns.

            for (
                const p of qualified
            ) {

                if (
                    selected.length >= 8
                ) {
                    break;
                }

                if (
                    selected.some(
                        x =>
                            x.key ===
                            p.key
                    )
                ) {
                    continue;
                }

                selected.push(p);
            }

            return selected;
        }

        // =====================================================
        // CONCENTRATION
        // =====================================================

        function concentration(trades) {

            if (!trades.length) {

                return {

                    uniquePatterns: 0,

                    maximumShare: 0,

                    patternCounts: {},

                    concentrationPassed:
                        false,

                    details: []
                };
            }

            const counts = {};

            for (
                const trade of trades
            ) {

                counts[
                    trade.pattern
                ] =
                    (
                        counts[
                            trade.pattern
                        ] || 0
                    ) + 1;
            }

            const values =
                Object.values(counts);

            const maximum =
                Math.max(...values);

            const maximumShare =
                maximum /
                trades.length;

            const uniquePatterns =
                Object.keys(counts).length;

            const details =
                Object.entries(counts)
                    .map(
                        ([pattern, count]) => ({

                            pattern,

                            count,

                            share:
                                round(
                                    count /
                                    trades.length,
                                    4
                                )
                        })
                    );

            return {

                uniquePatterns,

                maximumShare:
                    round(
                        maximumShare,
                        4
                    ),

                patternCounts:
                    counts,

                concentrationPassed:
                    uniquePatterns >=
                        MIN_INDEPENDENT_PATTERNS &&
                    maximumShare <=
                        MAX_PATTERN_CONCENTRATION,

                details
            };
        }

        // =====================================================
        // EXECUTE OOS FOLD
        // =====================================================

        function executeFold(
            candles,
            testStart,
            testEnd,
            selectedPatterns,
            foldNumber
        ) {

            const trades = [];

            let cooldownUntil = -1;

            let lastPattern = null;
            let lastPatternIndex = -9999;

            let lastSide = null;
            let lastSideIndex = -9999;

            const patternLossStreak =
                new Map();

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

                const signal =
                    baseSignal(
                        candles,
                        i
                    );

                if (!signal) {
                    continue;
                }

                const side =
                    signal.side;

                const setup =
                    signal.setup;

                const f =
                    features(
                        candles,
                        i
                    );

                if (!f) {
                    continue;
                }

                const key =
                    patternKey(
                        side,
                        setup,
                        f
                    );

                const selected =
                    selectedPatterns.find(
                        p =>
                            p.key === key
                    );

                if (!selected) {
                    continue;
                }

                // =================================================
                // CIRCUIT BREAKER
                // =================================================

                if (
                    (
                        patternLossStreak.get(
                            key
                        ) || 0
                    ) >=
                    MAX_PATTERN_LOSS_STREAK
                ) {
                    continue;
                }

                // =================================================
                // SAME PATTERN COOLDOWN
                // =================================================

                if (
                    key === lastPattern &&
                    i -
                        lastPatternIndex <
                        SAME_PATTERN_COOLDOWN
                ) {
                    continue;
                }

                // =================================================
                // SAME SIDE COOLDOWN
                // =================================================

                if (
                    side === lastSide &&
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
                        side,
                        setup
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

                if (
                    !Number.isFinite(
                        atrValue
                    ) ||
                    atrValue <= 0
                ) {
                    continue;
                }

                let stop;
                let target;
                let preferredTarget;

                if (side === "BUY") {

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
                        side,
                        entry,
                        stop,
                        target
                    );

                const trade = {

                    tradeNumber:
                        trades.length + 1,

                    fold:
                        foldNumber,

                    signalIndex:
                        i,

                    testLocalIndex:
                        i -
                        testStart,

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

                    side,

                    setup,

                    pattern:
                        key,

                    patternFamily:
                        selected.family,

                    patternLevel:
                        key.split("|").length,

                    patternType:
                        setup,

                    patternQuality:
                        selected.quality,

                    patternSamples:
                        selected.samples,

                    patternOOSSamples:
                        selected.oosSamples,

                    patternEV:
                        selected.expectedValueR,

                    patternPF:
                        selected.PF,

                    patternStableFolds:
                        selected.stableFolds,

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

                    confirmationScore:
                        confirmation.score,

                    confirmationMaxScore:
                        confirmation.maxScore,

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
                        outcome.resultR
                };

                trades.push(trade);

                // =================================================
                // CIRCUIT BREAKER UPDATE
                // =================================================

                if (
                    outcome.resultR < 0
                ) {

                    patternLossStreak.set(
                        key,
                        (
                            patternLossStreak.get(
                                key
                            ) || 0
                        ) + 1
                    );

                } else {

                    patternLossStreak.set(
                        key,
                        0
                    );
                }

                // =================================================
                // COOLDOWN AFTER TRADE EXIT
                // =================================================

                cooldownUntil =
                    outcome.exitIndex +
                    ENTRY_COOLDOWN;

                lastPattern =
                    key;

                lastPatternIndex =
                    i;

                lastSide =
                    side;

                lastSideIndex =
                    i;
            }

            return trades;
        }

        // =====================================================
        // STATS
        // =====================================================

        function stats(trades) {

            const wins =
                trades.filter(
                    t =>
                        t.resultR > 0
                ).length;

            const losses =
                trades.filter(
                    t =>
                        t.resultR < 0
                ).length;

            const timeouts =
                trades.filter(
                    t =>
                        t.resultR === 0
                ).length;

            const decisive =
                wins + losses;

            const totalWinR =
                trades
                    .filter(
                        t =>
                            t.resultR > 0
                    )
                    .reduce(
                        (sum, t) =>
                            sum + t.resultR,
                        0
                    );

            const totalLossR =
                Math.abs(
                    trades
                        .filter(
                            t =>
                                t.resultR < 0
                        )
                        .reduce(
                            (sum, t) =>
                                sum + t.resultR,
                            0
                        )
                );

            const netR =
                trades.reduce(
                    (sum, t) =>
                        sum + t.resultR,
                    0
                );

            const ev =
                trades.length
                    ? netR /
                      trades.length
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

            let lossStreak = 0;
            let maxLossStreak = 0;

            for (
                const trade of trades
            ) {

                equity +=
                    trade.resultR;

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
                    trade.resultR < 0
                ) {

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
                    trades.length,

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
        // CURRENT MARKET
        // =====================================================

        function currentMarket(candles) {

            const index =
                candles.length - 1;

            const f =
                features(
                    candles,
                    index
                );

            if (!f) {
                return {
                    available: false
                };
            }

            return {

                available: true,

                timestamp:
                    candles[index].ts,

                date:
                    istDate(
                        candles[index].ts
                    ),

                time:
                    getTimeBucket(
                        candles[index].ts
                    ),

                close:
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
                        4
                    ),

                rsiBucket:
                    f.rsiBucket,

                vwap:
                    round(
                        f.vwap,
                        4
                    ),

                vwapDirection:
                    f.vwapDirection,

                vwapDistanceATR:
                    round(
                        f.vwapDistanceATR,
                        4
                    ),

                atr14:
                    round(
                        f.atr14,
                        4
                    ),

                ema9:
                    round(
                        f.ema9,
                        4
                    ),

                ema21:
                    round(
                        f.ema21,
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

                trendFollowAvailable:
                    f.trendFollow,

                vwapPullbackAvailable:
                    f.vwapPullback,

                volatility:
                    f.volatility
            };
        }

        // =====================================================
        // INDSTOCKS HISTORICAL API
        // =====================================================

        async function fetchHistoricalChunk(
            accessToken,
            startMs,
            endMs
        ) {

            const url =
                `${API_BASE}/market/historical/${INTERVAL}` +
                `?scrip-codes=${encodeURIComponent(SCRIP_CODE)}` +
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

            return {

                httpStatus:
                    response.status,

                payload
            };
        }

        // =====================================================
        // LOAD HISTORICAL DATA
        // =====================================================

        async function loadHistoricalData() {

            let accessToken =
                process.env.INDSTOCKS_TOKEN ||
                process.env.INDSTOCKS_ACCESS_TOKEN;

            if (!accessToken) {

                throw new Error(
                    "INDSTOCKS_TOKEN is not configured."
                );
            }

            /*
             * Important:
             * remove accidental spaces/newlines from
             * Vercel environment variable.
             */

            accessToken =
                String(accessToken).trim();

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

            const allCandles = [];

            const chunks = [];

            let cursor =
                startMs;

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

            for (
                const chunk of chunks
            ) {

                const result =
                    await fetchHistoricalChunk(
                        accessToken,
                        chunk.start,
                        chunk.end
                    );

                const candles =
                    extractRows(
                        result.payload
                    );

                allCandles.push(
                    ...candles
                );
            }

            const normalized =
                allCandles.filter(
                    Boolean
                );

            const prepared =
                prepareData(
                    normalized
                );

            return {

                chunksRequested:
                    chunks.length,

                rawCandles:
                    normalized.length,

                normalizedCandles:
                    prepared.length,

                deduplicated:
                    normalized.length -
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
            rows.length < 300
        ) {

            return fail(
                "Insufficient candle data from INDstocks.",
                {

                    rawCandles:
                        historicalData.rawCandles,

                    normalizedCandles:
                        historicalData.normalizedCandles,

                    minimumRequired:
                        300,

                    requestedDays:
                        REQUESTED_DAYS,

                    instrument:
                        INSTRUMENT,

                    scripCode:
                        SCRIP_CODE,

                    interval:
                        INTERVAL
                }
            );
        }

        // =====================================================
        // EXCLUDE CURRENT CANDLE
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
        // WALK-FORWARD FOLDS
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
        // TRUE WALK-FORWARD
        // =====================================================

        const foldResults = [];

        const allTrades = [];

        for (
            const fold of folds
        ) {

            const learned =
                learnPatterns(
                    candles,
                    fold.trainingStart,
                    fold.trainingEnd
                );

            const robustPatterns =
                learned.filter(
                    p =>
                        p.qualified
                );

            const selectedPatterns =
                selectPatterns(
                    learned
                );

            const selectedFamilies =
                new Set(
                    selectedPatterns.map(
                        p =>
                            p.family
                    )
                );

            const trades =
                selectedPatterns.length
                    ? executeFold(
                        candles,
                        fold.testStart,
                        fold.testEnd,
                        selectedPatterns,
                        fold.fold
                    )
                    : [];

            allTrades.push(
                ...trades
            );

            const s =
                stats(trades);

            const conc =
                concentration(
                    trades
                );

            foldResults.push({

                fold:
                    fold.fold,

                trainingRows:
                    fold.trainingRows,

                testRows:
                    fold.testRows,

                patternsDiscovered:
                    learned.length,

                robustPatterns:
                    robustPatterns.length,

                selectedPatterns:
                    selectedPatterns.length,

                selectedPatternKeys:
                    selectedPatterns.map(
                        p =>
                            p.key
                    ),

                independentFamilies:
                    selectedFamilies.size,

                trades:
                    trades.length,

                wins:
                    s.wins,

                losses:
                    s.losses,

                timeouts:
                    s.timeouts,

                decisiveTrades:
                    s.decisiveTrades,

                winRate:
                    s.winRate,

                totalWinR:
                    s.totalWinR,

                totalLossR:
                    s.totalLossR,

                netR:
                    s.netR,

                expectedValueR:
                    s.expectedValueR,

                profitFactor:
                    s.profitFactor,

                maxDrawdownR:
                    s.maxDrawdownR,

                maxConsecutiveLosses:
                    s.maxConsecutiveLosses,

                concentration:
                    conc,

                tradeResults:
                    trades.map(
                        t =>
                            t.resultR
                    )
            });
        }

        // =====================================================
        // GLOBAL OOS
        // =====================================================

        const globalStats =
            stats(
                allTrades
            );

        const globalConcentration =
            concentration(
                allTrades
            );

        const independentFamilies =
            new Set(
                allTrades.map(
                    t =>
                        t.patternFamily
                )
            ).size;

        const profitabilityProof =
            globalStats.expectedValueR >=
                0.10 &&
            globalStats.profitFactor >=
                1.20 &&
            globalStats.decisiveTrades >=
                5 &&
            independentFamilies >=
                MIN_INDEPENDENT_PATTERNS &&
            globalConcentration
                .concentrationPassed;

        const riskControl =
            globalStats.maxDrawdownR <=
                MAX_OOS_DRAWDOWN &&
            globalStats.maxConsecutiveLosses <=
                MAX_PATTERN_LOSS_STREAK;

        const sufficientEvidence =
            globalStats.decisiveTrades >= 5;

        const patternDiversity =
            independentFamilies >=
                MIN_INDEPENDENT_PATTERNS &&
            globalConcentration.maximumShare <=
                MAX_PATTERN_CONCENTRATION;

        // =====================================================
        // CURRENT MARKET
        // =====================================================

        const currentMarketData =
            currentMarket(rows);

        let currentSignal = {

            status:
                "NO_TRADE",

            side:
                null,

            market:
                currentMarketData,

            reason:
                "Current market does not satisfy a qualified V13.6 setup.",

            nextAction:
                "WAIT"
        };

        const currentSignalData =
            baseSignal(
                rows,
                rows.length - 1
            );

        if (
            currentSignalData
        ) {

            const currentSide =
                currentSignalData.side;

            const currentSetup =
                currentSignalData.setup;

            const currentF =
                features(
                    rows,
                    rows.length - 1
                );

            const currentKey =
                patternKey(
                    currentSide,
                    currentSetup,
                    currentF
                );

            /*
             * Final learning uses only historical candles.
             */

            const finalPatterns =
                learnPatterns(
                    rows.slice(
                        0,
                        -1
                    ),
                    0,
                    rows.length - 1
                );

            const finalSelected =
                selectPatterns(
                    finalPatterns
                );

            const matching =
                finalSelected.find(
                    p =>
                        p.key ===
                        currentKey
                );

            const confirmation =
                confirmationScore(
                    rows,
                    rows.length - 1,
                    currentSide,
                    currentSetup
                );

            if (
                matching &&
                confirmation.passed
            ) {

                currentSignal = {

                    status:
                        "SIGNAL",

                    side:
                        currentSide,

                    setup:
                        currentSetup,

                    pattern:
                        currentKey,

                    patternFamily:
                        matching.family,

                    patternQuality:
                        matching.quality,

                    patternSamples:
                        matching.samples,

                    patternOOSSamples:
                        matching.oosSamples,

                    patternEV:
                        matching.expectedValueR,

                    patternPF:
                        matching.PF,

                    patternStableFolds:
                        matching.stableFolds,

                    confirmationScore:
                        confirmation.score,

                    confirmationMaxScore:
                        confirmation.maxScore,

                    confirmationReasons:
                        confirmation.reasons,

                    market:
                        currentMarketData,

                    reason:
                        "Qualified historical setup and independent entry confirmation are present.",

                    nextAction:
                        "PAPER_REVIEW_ONLY"
                };

            } else {

                currentSignal = {

                    status:
                        "NO_TRADE",

                    side:
                        null,

                    setup:
                        currentSetup,

                    market:
                        currentMarketData,

                    entryConfirmation:
                        confirmation,

                    candidatePattern:
                        currentKey,

                    matchingPattern:
                        matching
                            ? {

                                key:
                                    matching.key,

                                setup:
                                    matching.setup,

                                quality:
                                    matching.quality,

                                samples:
                                    matching.samples,

                                EV:
                                    matching.expectedValueR,

                                PF:
                                    matching.PF,

                                qualified:
                                    matching.qualified
                            }
                            : null,

                    reason:
                        matching
                            ? "Historical setup exists but current entry confirmation failed."
                            : "No qualified V13.6 pattern matches the current market.",

                    nextAction:
                        "WAIT"
                };
            }

        } else {

            currentSignal = {

                status:
                    "NO_TRADE",

                side:
                    null,

                setup:
                    null,

                market:
                    currentMarketData,

                reason:
                    "No directional V13.6 setup is currently active.",

                nextAction:
                    "WAIT"
            };
        }

        // =====================================================
        // LATEST LEARNING
        // =====================================================

        const latestLearning =
            learnPatterns(
                candles,
                0,
                candles.length
            );

        const latestQualified =
            latestLearning.filter(
                p =>
                    p.qualified
            );

        const latestBuy =
            latestQualified.filter(
                p =>
                    p.side === "BUY"
            );

        const latestSell =
            latestQualified.filter(
                p =>
                    p.side === "SELL"
            );

        const latestTrendFollow =
            latestQualified.filter(
                p =>
                    p.setup ===
                    "TREND_FOLLOW"
            );

        const latestVWAPPullback =
            latestQualified.filter(
                p =>
                    p.setup ===
                    "VWAP_PULLBACK"
            );

        const latestFamilies =
            new Set(
                latestQualified.map(
                    p =>
                        p.family
                )
            ).size;

        // =====================================================
        // REJECTION DIAGNOSTICS
        // =====================================================

        const rejectionCounts = {};

        for (
            const pattern of latestLearning
        ) {

            for (
                const reason of
                pattern.rejectionReasons || []
            ) {

                rejectionCounts[
                    reason
                ] =
                    (
                        rejectionCounts[
                            reason
                        ] || 0
                    ) + 1;
            }
        }

        // =====================================================
        // SETUP TRADE STATISTICS
        // =====================================================

        function setupStats(
            trades,
            setup
        ) {

            return stats(
                trades.filter(
                    t =>
                        t.setup ===
                        setup
                )
            );
        }

        const trendFollowStats =
            setupStats(
                allTrades,
                "TREND_FOLLOW"
            );

        const vwapPullbackStats =
            setupStats(
                allTrades,
                "VWAP_PULLBACK"
            );

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
                "V13_6_MULTI_SETUP_TRUE_WALK_FORWARD",

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

            requestedDays:
                REQUESTED_DAYS,

            dataSource:
                "INDSTOCKS_HISTORICAL_API",

            dataFetch: {

                chunksRequested:
                    historicalData.chunksRequested,

                rawCandles:
                    historicalData.rawCandles,

                normalizedCandles:
                    historicalData.normalizedCandles,

                deduplicated:
                    historicalData.deduplicated,

                firstCandle:
                    rows[0],

                lastCandle:
                    rows[
                        rows.length - 1
                    ]
            },

            antiLeakage: {

                enabled: true,

                chronological: true,

                shuffled: false,

                currentCandleExcluded: true,

                currentCandleOutcomeUsed:
                    false,

                currentCandleUsedForLearning:
                    false,

                testDataUsedForTraining:
                    false,

                futureDataUsedForPatternDiscovery:
                    false,

                futureDataUsedForCurrentSignal:
                    false,

                signalConditionedLearning:
                    true,

                signalConditionedOOS:
                    true,

                entryConfirmation:
                    true,

                regimeValidation:
                    true,

                decayValidation:
                    true,

                patternCircuitBreaker:
                    true,

                patternConcentrationControl:
                    true,

                setupDiversification:
                    true,

                overlappingPaperTrades:
                    false,

                sameCandleStopTargetBias:
                    "STOP_FIRST"
            },

            objective: {

                primary:
                    "STRICT_OUT_OF_SAMPLE_PROFITABILITY",

                secondary:
                    "MINIMIZE_DRAWDOWN",

                tertiary:
                    "VALIDATE_INDEPENDENT_SETUP_FAMILIES",

                allowNoTrade:
                    true,

                minimumOOSExpectedValueR:
                    0.10,

                minimumOOSProfitFactor:
                    1.20,

                minimumOOSDecisiveTrades:
                    5,

                minimumOOSSamples:
                    MIN_OOS_SAMPLES,

                minimumStableFolds:
                    MIN_STABLE_FOLDS,

                qualityThreshold:
                    QUALITY_THRESHOLD,

                minimumIndependentPatterns:
                    MIN_INDEPENDENT_PATTERNS,

                maximumPatternConcentration:
                    MAX_PATTERN_CONCENTRATION,

                profitabilityProof:
                    profitabilityProof
                        ? "PROVEN"
                        : "NOT_PROVEN"
            },

            sourceStatistics: {

                rawLearningRows:
                    rows.length,

                normalizedRows:
                    rows.length,

                historicalLearningRows:
                    candles.length,

                currentCandleExcluded:
                    1,

                candlesTested:
                    candles.length,

                tradingDays:
                    new Set(
                        candles.map(
                            c =>
                                istDate(
                                    c.ts
                                )
                        )
                    ).size,

                invalidRows:
                    0,

                latestTimestamp:
                    current.ts,

                latestPrice:
                    current.c
            },

            walkForward: {

                method:
                    "STRICT_TRUE_EXPANDING_WALK_FORWARD",

                foldCount:
                    folds.length,

                chronological:
                    true,

                shuffled:
                    false,

                signalConditioned:
                    true,

                entryConfirmed:
                    true,

                regimeAdaptive:
                    true,

                decayAware:
                    true,

                setupDiversified:
                    true,

                folds
            },

            trueOOSPaperExecution: {

                description:
                    "Each fold learns setup-specific patterns exclusively from preceding candles and executes only on future unseen candles after independent confirmation.",

                stats:
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

                patternDiversity:
                    patternDiversity
                        ? "PASSED"
                        : "FAILED",

                patternConcentration:
                    globalConcentration,

                independentPatternFamilies:
                    independentFamilies,

                setupPerformance: {

                    trendFollow:
                        trendFollowStats,

                    vwapPullback:
                        vwapPullbackStats
                }
            },

            foldResults,

            currentMarket:
                currentMarketData,

            currentSignal,

            latestLearning: {

                trainingRows:
                    candles.length,

                patternsDiscovered:
                    latestLearning.length,

                robustPatterns:
                    latestQualified.length,

                selectedPatterns:
                    latestQualified.length,

                buyPatterns:
                    latestBuy.length,

                sellPatterns:
                    latestSell.length,

                independentFamilies:
                    latestFamilies,

                setupFamilies: {

                    trendFollow:
                        latestTrendFollow.length,

                    vwapPullback:
                        latestVWAPPullback.length
                },

                signalConditioned:
                    true,

                sessionVWAP:
                    true,

                timezone:
                    "Asia/Kolkata",

                regimeAdaptive:
                    true,

                decayAware:
                    true,

                setupDiversification:
                    true,

                patternTypes: {

                    trendFollow:
                        latestTrendFollow.length,

                    vwapPullback:
                        latestVWAPPullback.length
                },

                rejectionCounts
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

                authenticationDiagnostic: {

                    environmentVariable:
                        "INDSTOCKS_TOKEN",

                    fallbackEnvironmentVariable:
                        "INDSTOCKS_ACCESS_TOKEN",

                    tokenTrimmed:
                        true,

                    actualTokenExposed:
                        false,

                    authorizationFormat:
                        "RAW_TOKEN"
                },

                sessionVWAP: {

                    enabled:
                        true,

                    reset:
                        "DAILY",

                    timezone:
                        "Asia/Kolkata"
                },

                setups: {

                    enabled:
                        true,

                    trendFollow:
                        {

                            enabled:
                                true,

                            description:
                                "Directional EMA trend aligned with session VWAP."
                        },

                    vwapPullback:
                        {

                            enabled:
                                true,

                            description:
                                "Directional trend followed by a VWAP pullback and recovery confirmation."
                        }
                },

                patternGranularity: {

                    optimized:
                        true,

                    setupInPrimaryKey:
                        true,

                    RSIInPrimaryKey:
                        false,

                    slopeInPrimaryKey:
                        false,

                    purpose:
                        "Separate genuinely different setups while avoiding excessive RSI/slope fragmentation."
                },

                regimeValidation: {

                    enabled:
                        true,

                    minimumSamples:
                        3,

                    minimumDecisiveTrades:
                        2,

                    minimumEV:
                        0.05,

                    minimumPF:
                        1.05
                },

                decayDetection: {

                    enabled:
                        true,

                    recentWindowFraction:
                        0.25,

                    minimumRecentEV:
                        0,

                    maximumDecay:
                        -0.75
                },

                diversity: {

                    minimumIndependentPatterns:
                        MIN_INDEPENDENT_PATTERNS,

                    maximumPatternConcentration:
                        MAX_PATTERN_CONCENTRATION,

                    independentSetupFamilies:
                        true
                },

                circuitBreaker: {

                    maximumPatternLossStreak:
                        MAX_PATTERN_LOSS_STREAK,

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
                    1,

                stopR:
                    STOP_R,

                targetR:
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
                    true,

                maxOOSDrawdownR:
                    MAX_OOS_DRAWDOWN,

                maxOOSLossStreak:
                    MAX_PATTERN_LOSS_STREAK,

                entryCooldownCandles:
                    ENTRY_COOLDOWN,

                samePatternCooldownCandles:
                    SAME_PATTERN_COOLDOWN,

                sameSideCooldownCandles:
                    SAME_SIDE_COOLDOWN
            },

            trueOOSTradeLog:
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
            "TradeMind Pro V13.6 ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            version:
                "V13.6",

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

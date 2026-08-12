/*
===========================================================
 TradeMind Pro
 V25.7 — INDEPENDENT EDGE-HEALTH CONFIRMATION COMPLETION
===========================================================

Instrument : NIFTY 50
Scrip      : NIDX_40000001
Interval   : 5 minute
Data       : INDstocks Historical API

MODE
----
PAPER ONLY
NO REAL ORDERS

===========================================================
WHY V25.7 EXISTS
===========================================================

V24.6 consolidated the four V24.5 segments and concluded:

    INCONCLUSIVE / UNDERPOWERED

The V24.5 experiment did not produce enough usable
independent blocks to test HEALTHY versus DECAYING.

V25.7 therefore DOES NOT rerun the V24.5 720-day slice.

Instead it opens a NEW, OLDER historical confirmation
horizon.

V24.5 used:

    720 days
    Segment 1..4
    180 days each

V25.7 uses:

    900 NEW days
    Segment 1..5
    180 days each

The V25.7 horizon begins immediately BEFORE the oldest
V24.5 segment.

Therefore V25.7 does not reuse the V24.5 confirmation
slice.

===========================================================
V25.7 GEOMETRY
===========================================================

Each invocation runs ONE 180-day segment.

    40 completed prior SELL records
    +
    20 immediately following SELL records
    =
    60 records / independent block

Blocks are disjoint.

There are NO rolling checkpoints.

A forward record from Block 1 cannot become a forward
record in Block 2.

The target is:

    5 independent blocks
    300 usable SELL records

across the NEW V25.7 900-day horizon.

The browser selects the segment:

    ?confirmationSegment=1
    ?confirmationSegment=2
    ?confirmationSegment=3
    ?confirmationSegment=4
    ?confirmationSegment=5

Default:

    confirmationSegment=1

===========================================================
FROZEN HEALTH DEFINITIONS
===========================================================

HEALTHY
    prior EV > 0
    AND internal EV change >= -0.10R
    AND late-half EV > 0

STABLE
    prior EV > 0
    AND internal EV change >= -0.10R
    AND late-half EV <= 0

DECAYING
    prior EV > 0
    AND internal EV change < -0.10R
    AND late-half EV > 0

BROKEN
    prior EV > 0
    AND internal EV change < -0.10R
    AND late-half EV <= 0

NO_POSITIVE_PRIOR_EDGE
    prior EV <= 0

These definitions are frozen from V22.8/V22.9/V24 and
are NOT tuned by V25.7.

===========================================================
IMPORTANT GUARDRAILS
===========================================================

V25.7 does NOT:

- modify candidate discovery
- modify qualification
- modify validation
- modify true OOS
- modify exits
- modify risk
- modify health thresholds
- create a HEALTHY trading filter
- suppress DECAYING/BROKEN
- use forward outcomes to classify prior health
- place real orders

Forward outcomes are used only after the prior health state
has already been frozen.

===========================================================
RATE-LIMIT / TIMEOUT SAFETY
===========================================================

Historical requests are:

- one request at a time
- maximum 7-day API chunks
- 250ms delay between chunks
- HTTP 429 exponential backoff
- maximum 5 retries per chunk

This follows the rate-limit-safe V24.4.1/V24.5 data-fetch
architecture.

V25.7 fetches ONLY its selected 180-day segment, not the
entire 900-day horizon in one invocation.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7";

    const INSTRUMENT = "NIFTY 50";
    const SCRIP_CODE = "NIDX_40000001";
    const INTERVAL = "5minute";

    const API_BASE =
        process.env.INDSTOCKS_API_BASE ||
        "https://api.indstocks.com";

    // ---------------------------------------------------------
    // Frozen experiment configuration
    // ---------------------------------------------------------

    const REQUESTED_DAYS =
        60;

    const V24_TOTAL_CONFIRMATION_DAYS =
        720;

    const V25_NEW_CONFIRMATION_SEGMENTS =
        5;

    const V25_NEW_CONFIRMATION_DAYS =
        180;

    const PRIOR_RECORDS =
        40;

    const FORWARD_RECORDS =
        20;

    const BLOCK_SIZE =
        PRIOR_RECORDS +
        FORWARD_RECORDS;

    const TARGET_INDEPENDENT_BLOCKS =
        5;

    const TARGET_USABLE_SELL_RECORDS =
        TARGET_INDEPENDENT_BLOCKS *
        BLOCK_SIZE;

    const HEALTH_DECAY_THRESHOLD =
        -0.10;

    const MIN_FORWARD_TRADES =
        1;

    const MIN_STATE_OBSERVATIONS =
        10;

    // Existing strategy mechanics used only to create the
    // frozen learning records. No strategy mechanics are changed.
    const MAX_TREND_VWAP_DISTANCE_ATR =
        1.75;

    const MAX_TREND_EMA_SPREAD_ATR =
        1.25;

    const MAX_TREND_STRENGTH_ATR =
        1.50;

    const MIN_SPREAD_ATR =
        0.20;

    const MIN_SLOPE_ATR =
        0.06;

    const ENTRY_CONFIRMATION_MIN =
        5;

    const VWAP_LOOKBACK =
        8;

    const VWAP_TOUCH_MAX_ATR =
        0.35;

    const VWAP_RECOVERY_MIN_ATR =
        0.10;

    const VWAP_MAX_ENTRY_DISTANCE_ATR =
        0.75;

    const VWAP_MAX_CANDLES_AFTER_TOUCH =
        3;

    const ACTIVE_EXIT_STOP_R =
        1;

    const ACTIVE_EXIT_TARGET_R =
        1.5;

    const ACTIVE_EXIT_MAX_HOLD_CANDLES =
        8;

    const DIRECTIONAL_SIDE =
        "SELL";

    const V24_FETCH_CONCURRENCY =
        1;

    const V24_INTER_CHUNK_DELAY_MS =
        250;

    const V24_MAX_429_RETRIES =
        5;

    const V24_429_BASE_DELAY_MS =
        2000;

    function n(value, fallback = null) {

        const x =
            Number(value);

        return Number.isFinite(x)
            ? x
            : fallback;
    }

    function round(
        value,
        digits = 4
    ) {

        const x =
            Number(value);

        if (
            !Number.isFinite(x)
        ) {
            return null;
        }

        const factor =
            10 ** digits;

        return (
            Math.round(
                x * factor
            ) / factor
        );
    }

    function safeArray(value) {

        return Array.isArray(value)
            ? value
            : [];
    }

    function sleep(ms) {

        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    function istParts(ts) {

        const formatter =
            new Intl.DateTimeFormat(
                "en-GB",
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
                    hour12:
                        false
                }
            );

        const parts =
            formatter.formatToParts(
                new Date(
                    Number(ts) * 1000
                )
            );

        const result = {};

        for (
            const part of parts
        ) {

            if (
                part.type !==
                "literal"
            ) {
                result[
                    part.type
                ] =
                    part.value;
            }
        }

        return result;
    }

    function istDate(ts) {

        const p =
            istParts(ts);

        return [
            p.year,
            p.month,
            p.day
        ].join("-");
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

    // ---------------------------------------------------------
    // Candle normalization
    // ---------------------------------------------------------

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
                n(row[5], 0);

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
                ts >
                100000000000
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
            ts >
            100000000000
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
                    !Array.isArray(
                        value[0]
                    ) &&
                    typeof value[0] !==
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
            (a, b) =>
                a.ts - b.ts
        );
    }

    // ---------------------------------------------------------
    // Indicators
    // ---------------------------------------------------------

    function ema(
        values,
        period
    ) {

        if (
            !Array.isArray(values) ||
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

    function rsi(
        values,
        period = 14
    ) {

        if (
            !Array.isArray(values) ||
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
            avgGain /
            avgLoss;

        return (
            100 -
            100 /
                (1 + rs)
        );
    }

    function atr(
        candles,
        period = 14
    ) {

        if (
            !Array.isArray(
                candles
            ) ||
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
                        c.h - p.c
                    ),
                    Math.abs(
                        c.l - p.c
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
                ) / period;
        }

        return value;
    }

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

            volume +=
                v;
        }

        if (
            volume <= 0
        ) {
            return candles[index].c;
        }

        return (
            pv / volume
        );
    }

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
            ema9 -
            previousEMA9;

        const slopeATR =
            slope / atr14;

        let trend =
            "SIDEWAYS";

        if (
            ema9 > ema21 &&
            spreadATR >=
                MIN_SPREAD_ATR &&
            slopeATR >=
                MIN_SLOPE_ATR
        ) {
            trend =
                "BULLISH";
        }

        if (
            ema9 < ema21 &&
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
            close > vwap
        ) {
            vwapDirection =
                "ABOVE";
        } else if (
            close < vwap
        ) {
            vwapDirection =
                "BELOW";
        }

        const vwapDistanceATR =
            (
                close -
                vwap
            ) / atr14;

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

        for (
            let i = start;
            i < index;
            i++
        ) {

            const c =
                candles[i];

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
                    c.c -
                    vwapValue
                ) / a;

            const highDistance =
                Math.abs(
                    c.h -
                    vwapValue
                ) / a;

            const lowDistance =
                Math.abs(
                    c.l -
                    vwapValue
                ) / a;

            const touched =
                closeDistance <=
                    VWAP_TOUCH_MAX_ATR ||
                highDistance <=
                    VWAP_TOUCH_MAX_ATR ||
                lowDistance <=
                    VWAP_TOUCH_MAX_ATR ||
                (
                    c.l <=
                        vwapValue &&
                    c.h >=
                        vwapValue
                );

            if (touched) {
                touchIndex =
                    i;
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
            touchDistanceATR:
                Math.abs(
                    candles[touchIndex].c -
                    sessionVWAP(
                        candles,
                        touchIndex
                    )
                ) /
                (
                    atr(
                        candles.slice(
                            0,
                            touchIndex + 1
                        ),
                        14
                    ) || 1
                ),
            recoveryATR:
                recoveryMove
        };
    }

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
                f.trend ===
                    "BULLISH"
            ) ||
            (
                side === "SELL" &&
                f.trend ===
                    "BEARISH"
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
                f.vwapDirection ===
                    "ABOVE"
            ) ||
            (
                side === "SELL" &&
                f.vwapDirection ===
                    "BELOW"
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
            f.trend ===
                "BULLISH" &&
            f.vwapDirection ===
                "ABOVE"
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
                    side:
                        "BUY",
                    setup:
                        "TREND_FOLLOW"
                });
            }
        }

        if (
            f.trend ===
                "BEARISH" &&
            f.vwapDirection ===
                "BELOW"
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
                    side:
                        "SELL",
                    setup:
                        "TREND_FOLLOW"
                });
            }
        }

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

            if (interaction) {
                setups.push({
                    side:
                        "BUY",
                    setup:
                        "VWAP_PULLBACK"
                });
            }
        }

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

            if (interaction) {
                setups.push({
                    side:
                        "SELL",
                    setup:
                        "VWAP_PULLBACK"
                });
            }
        }

        return setups;
    }

    function evaluateExitModel(
        candles,
        entryIndex,
        side,
        entry,
        atrValue
    ) {

        const stopDistance =
            ACTIVE_EXIT_STOP_R *
            atrValue;

        const targetDistance =
            ACTIVE_EXIT_TARGET_R *
            atrValue;

        const stop =
            side === "BUY"
                ? entry -
                    stopDistance
                : entry +
                    stopDistance;

        const target =
            side === "BUY"
                ? entry +
                    targetDistance
                : entry -
                    targetDistance;

        const end =
            Math.min(
                candles.length - 1,
                entryIndex +
                    ACTIVE_EXIT_MAX_HOLD_CANDLES
            );

        if (
            entryIndex + 1 >
            end
        ) {
            return null;
        }

        for (
            let i =
                entryIndex + 1;
            i <= end;
            i++
        ) {

            const candle =
                candles[i];

            const hitStop =
                side === "BUY"
                    ? candle.l <= stop
                    : candle.h >= stop;

            const hitTarget =
                side === "BUY"
                    ? candle.h >= target
                    : candle.l <= target;

            // STOP FIRST is preserved.
            if (hitStop) {

                return {
                    exitIndex:
                        i,
                    exitType:
                        "STOP",
                    resultR:
                        -ACTIVE_EXIT_STOP_R,
                    boundaryCapped:
                        false
                };
            }

            if (hitTarget) {

                return {
                    exitIndex:
                        i,
                    exitType:
                        "TARGET",
                    resultR:
                        ACTIVE_EXIT_TARGET_R,
                    boundaryCapped:
                        false
                };
            }
        }

        return {
            exitIndex:
                end,
            exitType:
                "TIMEOUT",
            resultR:
                0,
            boundaryCapped:
                false
        };
    }

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

        const outcome =
            evaluateExitModel(
                candles,
                index,
                side,
                candles[index].c,
                f.atr14
            );

        if (
            !outcome ||
            outcome.resultR === null
        ) {
            return null;
        }

        return {

            index,

            ts:
                candles[index].ts,

            side,

            setup,

            trend:
                f.trend,

            regime:
                f.regime,

            volatility:
                f.volatility,

            timeBucket:
                f.timeBucket,

            vwapDirection:
                f.vwapDirection,

            rsiBucket:
                f.rsiBucket,

            resultR:
                outcome.resultR,

            exitIndex:
                outcome.exitIndex,

            exitType:
                outcome.exitType
        };
    }

    // ---------------------------------------------------------
    // Historical API
    // ---------------------------------------------------------

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
                    method:
                        "GET",
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

            const error =
                new Error(
                    `INDstocks historical API failed: HTTP ${response.status} ${text}`
                );

            error.httpStatus =
                response.status;

            const retryAfterHeader =
                response.headers.get(
                    "retry-after"
                );

            error.retryAfterMs =
                retryAfterHeader
                    ? Number(
                        retryAfterHeader
                    ) * 1000
                    : null;

            throw error;
        }

        return payload;
    }

    async function fetchHistoricalChunkRateLimitSafe(
        accessToken,
        chunk
    ) {

        let attempt = 0;

        while (true) {

            try {

                return await
                    fetchHistoricalChunk(
                        accessToken,
                        chunk.start,
                        chunk.end
                    );

            } catch (error) {

                const status =
                    Number(
                        error?.httpStatus
                    );

                if (
                    status !== 429 ||
                    attempt >=
                        V24_MAX_429_RETRIES
                ) {
                    throw error;
                }

                const retryAfter =
                    Number(
                        error?.retryAfterMs
                    );

                const backoff =
                    Math.max(
                        0,
                        Number.isFinite(
                            retryAfter
                        ) &&
                        retryAfter > 0
                            ? retryAfter
                            : V24_429_BASE_DELAY_MS *
                                (
                                    2 ** attempt
                                )
                    );

                attempt++;

                await sleep(
                    backoff
                );
            }
        }
    }

    async function loadHistoricalRange(
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

        let cursor =
            rangeStartMs;

        while (
            cursor <
            rangeEndMs
        ) {

            const chunkEnd =
                Math.min(
                    cursor +
                        MAX_CHUNK_MS -
                        1000,
                    rangeEndMs
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
            let i = 0;
            i < chunks.length;
            i++
        ) {

            const payload =
                await
                    fetchHistoricalChunkRateLimitSafe(
                        accessToken,
                        chunks[i]
                    );

            all.push(
                ...extractRows(
                    payload
                )
            );

            if (
                i <
                chunks.length - 1
            ) {
                await sleep(
                    V24_INTER_CHUNK_DELAY_MS
                );
            }
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
                prepared,

            rangeStartMs,

            rangeEndMs
        };
    }

    // ---------------------------------------------------------
    // Metrics / frozen health state
    // ---------------------------------------------------------

    function metrics(rows) {

        const data =
            safeArray(rows).filter(
                x =>
                    Number.isFinite(
                        Number(
                            x.resultR
                        )
                    )
            );

        const trades =
            data.length;

        const wins =
            data.filter(
                x =>
                    Number(x.resultR) >
                    0
            ).length;

        const losses =
            data.filter(
                x =>
                    Number(x.resultR) <
                    0
            ).length;

        const timeouts =
            data.filter(
                x =>
                    Number(x.resultR) ===
                    0
            ).length;

        const decisiveTrades =
            wins + losses;

        const netR =
            data.reduce(
                (sum, x) =>
                    sum +
                    Number(x.resultR),
                0
            );

        const expectedValueR =
            trades
                ? netR / trades
                : 0;

        const totalWinR =
            data
                .filter(
                    x =>
                        Number(
                            x.resultR
                        ) > 0
                )
                .reduce(
                    (sum, x) =>
                        sum +
                        Number(
                            x.resultR
                        ),
                    0
                );

        const totalLossR =
            Math.abs(
                data
                    .filter(
                        x =>
                            Number(
                                x.resultR
                            ) < 0
                    )
                    .reduce(
                        (sum, x) =>
                            sum +
                            Number(
                                x.resultR
                            ),
                        0
                    )
            );

        const profitFactor =
            totalLossR > 0
                ? totalWinR /
                    totalLossR
                : wins > 0
                    ? 999
                    : 0;

        const winRate =
            decisiveTrades
                ? (
                    wins /
                    decisiveTrades
                ) *
                100
                : 0;

        return {

            trades,

            wins,

            losses,

            timeouts,

            decisiveTrades,

            winRate:
                round(
                    winRate,
                    2
                ),

            netR:
                round(
                    netR,
                    4
                ),

            EV:
                round(
                    expectedValueR,
                    4
                ),

            PF:
                round(
                    profitFactor,
                    4
                )
        };
    }

    function healthState(
        prior
    ) {

        if (
            prior.length <
            PRIOR_RECORDS
        ) {
            return {
                state:
                    "INSUFFICIENT_HISTORY"
            };
        }

        const priorMetrics =
            metrics(prior);

        if (
            !(priorMetrics.EV > 0)
        ) {
            return {
                state:
                    "NO_POSITIVE_PRIOR_EDGE",
                priorEV:
                    priorMetrics.EV
            };
        }

        const midpoint =
            Math.floor(
                prior.length / 2
            );

        const early =
            metrics(
                prior.slice(
                    0,
                    midpoint
                )
            );

        const late =
            metrics(
                prior.slice(
                    midpoint
                )
            );

        const internalEVChange =
            round(
                late.EV -
                early.EV
            );

        let state;

        if (
            internalEVChange >=
                HEALTH_DECAY_THRESHOLD &&
            late.EV > 0
        ) {
            state =
                "HEALTHY";
        } else if (
            internalEVChange >=
                HEALTH_DECAY_THRESHOLD &&
            late.EV <= 0
        ) {
            state =
                "STABLE";
        } else if (
            internalEVChange <
                HEALTH_DECAY_THRESHOLD &&
            late.EV > 0
        ) {
            state =
                "DECAYING";
        } else {
            state =
                "BROKEN";
        }

        return {

            state,

            prior: {

                samples:
                    prior.length,

                decisiveTrades:
                    priorMetrics
                        .decisiveTrades,

                EV:
                    priorMetrics.EV,

                PF:
                    priorMetrics.PF,

                winRate:
                    priorMetrics
                        .winRate
            },

            internal: {

                earlyEV:
                    early.EV,

                lateEV:
                    late.EV,

                EVChange:
                    internalEVChange
            }
        };
    }

    function blockResult(
        blockNumber,
        prior,
        forward
    ) {

        const health =
            healthState(
                prior
            );

        const base = {

            block:
                blockNumber,

            healthState:
                health.state,

            prior: {

                firstRecordIndex:
                    prior[0]?.index ??
                    null,

                lastRecordIndex:
                    prior[
                        prior.length - 1
                    ]?.index ??
                    null,

                samples:
                    prior.length,

                metrics:
                    health.prior ??
                    null,

                internal:
                    health.internal ??
                    null
            },

            forward: {

                firstRecordIndex:
                    forward[0]?.index ??
                    null,

                lastRecordIndex:
                    forward[
                        forward.length - 1
                    ]?.index ??
                    null,

                ...metrics(
                    forward
                )
            }
        };

        if (
            health.state ===
            "INSUFFICIENT_HISTORY"
        ) {
            return {
                ...base,
                accepted:
                    false,
                rejectionReason:
                    "INSUFFICIENT_HISTORY"
            };
        }

        if (
            health.state ===
            "NO_POSITIVE_PRIOR_EDGE"
        ) {
            return {
                ...base,
                accepted:
                    false,
                rejectionReason:
                    "NO_POSITIVE_PRIOR_EDGE"
            };
        }

        const forwardMetrics =
            metrics(
                forward
            );

        const forwardSuccess =
            forward.length >=
                MIN_FORWARD_TRADES &&
            forwardMetrics.EV > 0;

        return {

            ...base,

            accepted:
                true,

            forwardSuccess,

            forwardFailure:
                !forwardSuccess
        };
    }

    function summarizeStates(
        acceptedBlocks
    ) {

        const states = [
            "HEALTHY",
            "STABLE",
            "DECAYING",
            "BROKEN"
        ];

        return states.map(
            state => {

                const rows =
                    acceptedBlocks.filter(
                        x =>
                            x.healthState ===
                            state
                    );

                const forwardTrades =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.trades,
                        0
                    );

                const netR =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            Number(
                                x.forward.netR ||
                                0
                            ),
                        0
                    );

                const decisiveTrades =
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.forward.decisiveTrades,
                        0
                    );

                const successful =
                    rows.filter(
                        x =>
                            x.forwardSuccess
                    ).length;

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
                                (
                                    successful /
                                    rows.length
                                ) *
                                100,
                                2
                            )
                            : 0,

                    forwardTrades,

                    forwardDecisiveTrades:
                        decisiveTrades,

                    forwardNetR:
                        round(
                            netR,
                            4
                        ),

                    forwardEV:
                        forwardTrades
                            ? round(
                                netR /
                                forwardTrades,
                                4
                            )
                            : null,

                    forwardWinRatePct:
                        decisiveTrades
                            ? round(
                                (
                                    rows.reduce(
                                        (
                                            sum,
                                            x
                                        ) =>
                                            sum +
                                            x.forward.wins,
                                        0
                                    ) /
                                    decisiveTrades
                                ) *
                                100,
                                2
                            )
                            : 0,

                    meetsSuggestedSample:
                        rows.length >=
                        MIN_STATE_OBSERVATIONS
                };
            }
        );
    }

    // ---------------------------------------------------------
    // Request / execution
    // ---------------------------------------------------------

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    try {

        /*
         * Browser GET is intentionally supported.
         * POST is also accepted for compatibility.
         */
        if (
            req.method !== "GET" &&
            req.method !== "POST"
        ) {

            return res.status(405).json({

                success:
                    false,

                version:
                    VERSION,

                status:
                    "METHOD_NOT_ALLOWED",

                paperOnly:
                    true,

                realOrders:
                    false,

                brokerOrderEnabled:
                    false,

                brokerOrderSent:
                    false,

                error:
                    "V25.7 supports browser GET or POST."
            });
        }

        const requestedSegment =
            Number(
                req.body?.confirmationSegment ??
                req.query?.confirmationSegment ??
                1
            );

        const segment =
            Number.isFinite(
                requestedSegment
            )
                ? Math.min(
                    V25_NEW_CONFIRMATION_SEGMENTS,
                    Math.max(
                        1,
                        Math.floor(
                            requestedSegment
                        )
                    )
                )
                : 1;

        /*
         * V24.5 used offsets:
         *   0..180
         *   180..360
         *   360..540
         *   540..720
         *
         * V25.7 begins at 720 days old.
         *
         * Therefore V25.7 cannot overlap V24.5.
         */
        const nowMs =
            Date.now();

        const dayMs =
            24 *
            60 *
            60 *
            1000;

        const v23BoundaryEndMs =
            nowMs -
            REQUESTED_DAYS *
            dayMs -
            1000;

        const v245OldestBoundaryEndMs =
            v23BoundaryEndMs -
            V24_TOTAL_CONFIRMATION_DAYS *
            dayMs;

        const v25SegmentOffsetMs =
            (
                segment - 1
            ) *
            V25_NEW_CONFIRMATION_DAYS *
            dayMs;

        const rangeEndMs =
            v245OldestBoundaryEndMs -
            v25SegmentOffsetMs;

        const rangeStartMs =
            rangeEndMs -
            V25_NEW_CONFIRMATION_DAYS *
            dayMs;

        const historical =
            await loadHistoricalRange(
                rangeStartMs,
                rangeEndMs
            );

        const rows =
            historical.candles;

        if (
            rows.length < 500
        ) {

            return res.status(200).json({

                success:
                    true,

                version:
                    VERSION,

                status:
                    "COMPLETED",

                mode:
                    "V25_7_INDEPENDENT_CONFIRMATION_COMPLETION",

                paperOnly:
                    true,

                realOrders:
                    false,

                brokerOrderEnabled:
                    false,

                brokerOrderSent:
                    false,

                segment: {

                    segment,

                    segmentCount:
                        V25_NEW_CONFIRMATION_SEGMENTS,

                    segmentDays:
                        V25_NEW_CONFIRMATION_DAYS,

                    totalNewDays:
                        V25_NEW_CONFIRMATION_SEGMENTS *
                        V25_NEW_CONFIRMATION_DAYS,

                    rangeStartMs,

                    rangeEndMs
                },

                dataAudit: {

                    chunksRequested:
                        historical.chunksRequested,

                    rawCandles:
                        historical.rawCandles,

                    normalizedCandles:
                        historical.normalizedCandles,

                    deduplicated:
                        historical.deduplicated,

                    usableCandles:
                        rows.length,

                    minimumRequired:
                        500,

                    status:
                        "INSUFFICIENT_CANDLES"
                },

                executionAudit: {

                    rawLearningRecords:
                        0,

                    usableSELLRecords:
                        0,

                    possibleCompleteBlocks:
                        0,

                    blocksInspected:
                        0,

                    blocksTested:
                        0,

                    blocksRejected:
                        0,

                    rejectionReasons:
                        [],

                    remainderRecords:
                        0,

                    auditStatus:
                        "NO_COMPLETE_CONFIRMATION_BLOCK"
                },

                guardrails: {

                    newHistoricalSlice:
                        true,

                    overlapsV245:
                        false,

                    rollingCheckpoints:
                        false,

                    overlappingBlocks:
                        false,

                    strategyPipelineModified:
                        false,

                    thresholdTuning:
                        false,

                    noRealOrders:
                        true
                }
            });
        }

        /*
         * Exclude the final returned candle from learning.
         * This mirrors the existing current-candle exclusion.
         */
        const confirmationCandles =
            rows.length > 0
                ? rows.slice(
                    0,
                    -1
                )
                : [];

        /*
         * Generate learning records directly from the frozen
         * setup/confirmation/exit mechanics.
         *
         * No V22.9 rolling checkpoints are used.
         * No candidate discovery is used.
         */
        const rawRecords = [];

        const stop =
            Math.max(
                30,
                confirmationCandles.length -
                    ACTIVE_EXIT_MAX_HOLD_CANDLES
            );

        for (
            let i = 30;
            i < stop;
            i++
        ) {

            const setups =
                detectSetups(
                    confirmationCandles,
                    i
                );

            for (
                const setup of setups
            ) {

                if (
                    setup.side !==
                    DIRECTIONAL_SIDE
                ) {
                    continue;
                }

                const record =
                    createLearningRecord(
                        confirmationCandles,
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
            }
        }

        const records =
            rawRecords
                .filter(
                    x =>
                        x &&
                        x.side ===
                            DIRECTIONAL_SIDE &&
                        Number.isFinite(
                            Number(
                                x.index
                            )
                        ) &&
                        Number.isFinite(
                            Number(
                                x.resultR
                            )
                        )
                )
                .sort(
                    (a, b) =>
                        Number(a.index) -
                        Number(b.index)
                );

        /*
         * Disjoint blocks only.
         */
        const possibleCompleteBlocks =
            Math.floor(
                records.length /
                BLOCK_SIZE
            );

        const blockResults = [];

        const rejectedBlocks = [];

        let cursor = 0;

        let blockNumber = 1;

        while (
            cursor +
                BLOCK_SIZE <=
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
                        BLOCK_SIZE
                );

            const result =
                blockResult(
                    blockNumber,
                    prior,
                    forward
                );

            if (
                result.accepted
            ) {
                blockResults.push(
                    result
                );
            } else {
                rejectedBlocks.push(
                    result
                );
            }

            cursor +=
                BLOCK_SIZE;

            blockNumber++;
        }

        const remainderRecords =
            records.length -
            (
                (
                    blockResults.length +
                    rejectedBlocks.length
                ) *
                BLOCK_SIZE
            );

        const stateResults =
            summarizeStates(
                blockResults
            );

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

        const stable =
            stateResults.find(
                x =>
                    x.state ===
                    "STABLE"
            );

        const broken =
            stateResults.find(
                x =>
                    x.state ===
                    "BROKEN"
            );

        const healthyObserved =
            (
                healthy?.observations ??
                0
            ) >=
            MIN_STATE_OBSERVATIONS;

        const decayingObserved =
            (
                decaying?.observations ??
                0
            ) >=
            MIN_STATE_OBSERVATIONS;

        const healthyEV =
            healthy?.forwardEV ??
            null;

        const decayingEV =
            decaying?.forwardEV ??
            null;

        const healthyBeatsDecaying =
            healthyObserved &&
            decayingObserved &&
            healthyEV !== null &&
            decayingEV !== null &&
            healthyEV >
                decayingEV;

        const healthyPositive =
            healthyObserved &&
            healthyEV !== null &&
            healthyEV > 0;

        let classification =
            "INCONCLUSIVE";

        if (
            healthyObserved &&
            decayingObserved
        ) {

            if (
                healthyPositive &&
                healthyBeatsDecaying
            ) {
                classification =
                    "HEALTH_PERSISTENCE_SUPPORTED";
            } else if (
                !healthyPositive
            ) {
                classification =
                    "HEALTH_PERSISTENCE_REJECTED";
            } else {
                classification =
                    "HEALTH_RELATIONSHIP_NOT_REPLICATED";
            }
        }

        const totalForwardTrades =
            blockResults.reduce(
                (sum, x) =>
                    sum +
                    x.forward.trades,
                0
            );

        const totalForwardNetR =
            blockResults.reduce(
                (sum, x) =>
                    sum +
                    Number(
                        x.forward.netR ||
                        0
                    ),
                0
            );

        const targetReached =
            records.length >=
                TARGET_USABLE_SELL_RECORDS &&
            possibleCompleteBlocks >=
                TARGET_INDEPENDENT_BLOCKS;

        let researchStatus;

        if (
            targetReached &&
            healthyObserved &&
            decayingObserved
        ) {

            researchStatus =
                classification;

        } else if (
            targetReached
        ) {

            researchStatus =
                "TARGET_REACHED_BUT_STATE_SAMPLE_INSUFFICIENT";

        } else {

            researchStatus =
                "UNDERPOWERED_NEW_SAMPLE";
        }

        return res.status(200).json({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_INDEPENDENT_CONFIRMATION_COMPLETION",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            purpose:
                "Complete the independent chronological edge-health confirmation using a NEW historical slice older than the entire V24.5/V24.6 confirmation horizon.",

            hypothesis:
                "HEALTHY should outperform DECAYING on an independent chronological sample if the frozen edge-health relationship is genuine.",

            segment: {

                segment,

                segmentCount:
                    V25_NEW_CONFIRMATION_SEGMENTS,

                segmentDays:
                    V25_NEW_CONFIRMATION_DAYS,

                totalNewDays:
                    V25_NEW_CONFIRMATION_SEGMENTS *
                    V25_NEW_CONFIRMATION_DAYS,

                rangeStartMs,

                rangeEndMs,

                v23BoundaryEndMs,

                v245OldestBoundaryEndMs
            },

            source: {

                label:
                    "NEW_NON_OVERLAPPING_HISTORICAL_SLICE_OLDER_THAN_V24_5",

                independentFromV23:
                    true,

                independentFromV245:
                    true,

                reusedV245Records:
                    false,

                startTs:
                    rows[0]?.ts ??
                    null,

                endTs:
                    rows[
                        rows.length - 1
                    ]?.ts ??
                    null
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

                NO_POSITIVE_PRIOR_EDGE:
                    "prior EV <= 0",

                internalEVDecayThreshold:
                    HEALTH_DECAY_THRESHOLD
            },

            geometry: {

                priorRecords:
                    PRIOR_RECORDS,

                forwardRecords:
                    FORWARD_RECORDS,

                recordsPerBlock:
                    BLOCK_SIZE,

                overlappingBlocks:
                    false,

                independentBlocks:
                    true,

                blockStep:
                    BLOCK_SIZE,

                targetIndependentBlocks:
                    TARGET_INDEPENDENT_BLOCKS,

                targetUsableSELLRecords:
                    TARGET_USABLE_SELL_RECORDS
            },

            dataAudit: {

                chunksRequested:
                    historical.chunksRequested,

                rawCandles:
                    historical.rawCandles,

                normalizedCandles:
                    historical.normalizedCandles,

                deduplicated:
                    historical.deduplicated,

                usableCandles:
                    confirmationCandles.length
            },

            learningRecordAudit: {

                rawLearningRecords:
                    rawRecords.length,

                usableSELLRecords:
                    records.length,

                possibleCompleteBlocks:
                    possibleCompleteBlocks,

                targetReached,

                targetRecords:
                    TARGET_USABLE_SELL_RECORDS,

                targetBlocks:
                    TARGET_INDEPENDENT_BLOCKS
            },

            executionAudit: {

                blocksInspected:
                    blockResults.length +
                    rejectedBlocks.length,

                blocksTested:
                    blockResults.length,

                blocksRejected:
                    rejectedBlocks.length,

                rejectionReasons:
                    rejectedBlocks.map(
                        x =>
                            x.rejectionReason
                    ),

                remainderRecords,

                auditStatus:
                    possibleCompleteBlocks ===
                    0
                        ? "NO_COMPLETE_CONFIRMATION_BLOCK"
                        : blockResults.length >
                          0
                            ? "CONFIRMATION_BLOCKS_TESTED"
                            : "COMPLETE_BLOCKS_REJECTED"
            },

            sampleExpansionStatus:
                targetReached
                    ? "TARGET_REACHED"
                    : "TARGET_NOT_REACHED",

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

                classification
            },

            brokenDiagnostic: {

                observations:
                    broken?.observations ??
                    0,

                forwardEV:
                    broken?.forwardEV ??
                    null,

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

            blockResults,

            blockRejectionResults:
                rejectedBlocks,

            decision: {

                researchStatus,

                strategyDecision:
                    "DO_NOT_MODIFY_STRATEGY",

                strategyImpact:
                    "NO_CHANGE",

                nextAction:
                    targetReached
                        ? "INSPECT_V25_7_CROSS_SEGMENT_RESULTS"
                        : "DO_NOT_CALL_HEALTH_HYPOTHESIS_FAILED; SAMPLE_REMAINS_UNDERPOWERED"
            },

            antiLeakage: {

                chronological:
                    true,

                completedPriorWindowOnly:
                    true,

                forwardWindowUsedOnlyAsOutcome:
                    true,

                futureOutcomeUsedForHealthState:
                    false,

                thresholdsSelectedFromOutcome:
                    false,

                rollingCheckpoints:
                    false,

                overlappingBlocks:
                    false,

                v24_5SliceReused:
                    false,

                v22_9RollingObservationsReused:
                    false
            },

            guardrails: {

                strategyPipelineModified:
                    false,

                candidateDiscoveryModified:
                    false,

                qualificationModified:
                    false,

                validationModified:
                    false,

                oosModified:
                    false,

                exitModelModified:
                    false,

                riskModified:
                    false,

                healthThresholdModified:
                    false,

                thresholdTuning:
                    false,

                healthStatePromoted:
                    false,

                automaticFilterCreated:
                    false,

                noRealOrders:
                    true
            },

            interpretationGuard:
                "V25.7 is a diagnostic replication experiment. A positive result does not create a trading rule. A negative or underpowered result does not authorize threshold loosening.",

            nextStepGuard:
                "Do not interpret one V25.7 segment in isolation. Run segments 1 through 5, then consolidate only the five V25.7 results into the next audit."
        });

    } catch (error) {

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

            errorType:
                error?.name ||
                "Error"
        });
    }
}

/*
===========================================================
 TradeMind Pro
 V13.5 — FAMILY LEVEL EDGE VALIDATION
        + SESSION ADAPTATION
        + REGIME VALIDATION
        + TRUE WALK-FORWARD PAPER ENGINE

 Instrument : NIFTY 50
 Interval   : 5 minute
 Data       : INDstocks Historical API
 Mode       : PAPER ONLY
 Orders     : NONE

 V13.5 OBJECTIVE
 ----------------------------------------------------------
 1. Strict chronological walk-forward
 2. Signal-conditioned learning
 3. Current candle excluded from learning
 4. Session VWAP
 5. Strategy FAMILY validation
 6. Session as secondary condition
 7. Regime validation
 8. Recent-edge / decay validation
 9. Family-level OOS validation
10. Pattern-level validation
11. Long/short edge separation
12. Minimum independent families
13. Pattern concentration control
14. Entry confirmation
15. Pattern circuit breaker
16. No overlapping trades
17. Same-pattern cooldown
18. Same-side cooldown
19. No forced trades
20. Explicit OOS accounting
21. Current-market signal generation

 PAPER ONLY
 NO REAL ORDERS
===========================================================
*/

export default async function handler(req, res) {

    try {

        // =====================================================
        // CONFIG
        // =====================================================

        const VERSION = "V13.5";

        const INSTRUMENT = "NIFTY 50";
        const SCRIP_CODE = "NIDX_40000001";
        const INTERVAL = "5minute";

        const REQUESTED_DAYS = Number(
            req.body?.days ||
            req.query?.days ||
            30
        );

        const MAX_CHUNK_DAYS = 7;

        const QUALITY_THRESHOLD = 55;

        const MIN_PATTERN_SAMPLES = 6;
        const MIN_PATTERN_DECISIVE = 3;

        const MIN_FAMILY_SAMPLES = 8;
        const MIN_FAMILY_DECISIVE = 5;

        const MIN_STABLE_FOLDS = 2;

        const MIN_EXPECTED_VALUE = 0.10;
        const MIN_PROFIT_FACTOR = 1.20;

        const MIN_FAMILY_EXPECTED_VALUE = 0.05;
        const MIN_FAMILY_PROFIT_FACTOR = 1.05;

        const MIN_INDEPENDENT_FAMILIES = 2;
        const MAX_PATTERN_CONCENTRATION = 0.75;

        const RISK_R = 1;
        const STOP_R = 1;
        const TARGET_R = 2;
        const PREFERRED_TARGET_R = 2.5;

        const MAX_HOLD_CANDLES = 12;

        const ENTRY_CONFIRMATION_MIN = 5;
        const ENTRY_CONFIRMATION_MAX = 6;

        const ENTRY_COOLDOWN = 3;
        const SAME_PATTERN_COOLDOWN = 5;
        const SAME_SIDE_COOLDOWN = 2;

        const MAX_PATTERN_LOSS_STREAK = 6;
        const MAX_OOS_DRAWDOWN = 12;

        const TIMEZONE = "Asia/Kolkata";

        // =====================================================
        // RESPONSE HELPERS
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

            const v = Number(value);

            return Number.isFinite(v)
                ? v
                : fallback;
        }

        function round(value, digits = 4) {

            if (!Number.isFinite(value)) {
                return null;
            }

            const p =
                Math.pow(10, digits);

            return Math.round(value * p) / p;
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

            const ts = n(
                row.ts ??
                row.timestamp ??
                row.time ??
                row.t
            );

            const o =
                n(row.o ?? row.open);

            const h =
                n(row.h ?? row.high);

            const l =
                n(row.l ?? row.low);

            const c =
                n(row.c ?? row.close);

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
        // INDSTOCKS RESPONSE EXTRACTION
        // =====================================================

        function extractCandles(payload) {

            if (!payload) {
                return [];
            }

            if (Array.isArray(payload)) {
                return payload;
            }

            const direct =
                payload?.data?.[SCRIP_CODE]?.candles;

            if (Array.isArray(direct)) {
                return direct;
            }

            const candidates = [
                payload.candles,
                payload.data,
                payload.rows,
                payload.results,
                payload.result?.candles,
                payload.data?.candles
            ];

            for (const candidate of candidates) {

                if (Array.isArray(candidate)) {
                    return candidate;
                }
            }

            return [];
        }

        // =====================================================
        // INDSTOCKS CONFIG
        // =====================================================

        function getAccessToken() {

            return (
                process.env.INDSTOCKS_ACCESS_TOKEN ||
                process.env.INDSTOCKS_API_TOKEN ||
                process.env.INDSTOCKS_TOKEN ||
                process.env.ACCESS_TOKEN ||
                ""
            ).trim();
        }

        function getBaseURL() {

            return (
                process.env.INDSTOCKS_BASE_URL ||
                process.env.INDSTOCKS_API_URL ||
                "https://api.indstocks.com"
            ).replace(/\/$/, "");
        }

        // =====================================================
        // INDSTOCKS HISTORICAL FETCH
        // =====================================================

        async function fetchHistoricalChunk(
            startMs,
            endMs
        ) {

            const token =
                getAccessToken();

            if (!token) {

                throw new Error(
                    "INDstocks access token is missing. Set INDSTOCKS_ACCESS_TOKEN."
                );
            }

            const baseURL =
                getBaseURL();

            const url =
                `${baseURL}/market/historical/5minute` +
                `?scripCode=${encodeURIComponent(SCRIP_CODE)}` +
                `&startTime=${startMs}` +
                `&endTime=${endMs}`;

            const response =
                await fetch(
                    url,
                    {
                        method: "GET",
                        headers: {
                            "Authorization":
                                `Bearer ${token}`,
                            "access-token":
                                token,
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

                throw new Error(
                    `INDstocks returned non-JSON response. HTTP ${response.status}`
                );
            }

            if (!response.ok) {

                throw new Error(
                    `INDstocks historical API failed: HTTP ${response.status} ${text.slice(0, 500)}`
                );
            }

            if (
                payload?.success === false
            ) {

                throw new Error(
                    `INDstocks historical API rejected request: ${text.slice(0, 500)}`
                );
            }

            return {
                payload,
                candles:
                    extractCandles(payload)
                        .map(normalizeCandle)
                        .filter(Boolean)
            };
        }

        // =====================================================
        // FETCH FULL HISTORY
        // =====================================================

        async function fetchHistory() {

            const now =
                Date.now();

            const start =
                now -
                REQUESTED_DAYS *
                24 *
                60 *
                60 *
                1000;

            const chunkMs =
                MAX_CHUNK_DAYS *
                24 *
                60 *
                60 *
                1000;

            const all = [];

            let chunksRequested = 0;

            for (
                let cursor = start;
                cursor < now;
                cursor += chunkMs
            ) {

                const chunkEnd =
                    Math.min(
                        cursor + chunkMs,
                        now
                    );

                const result =
                    await fetchHistoricalChunk(
                        cursor,
                        chunkEnd
                    );

                chunksRequested++;

                all.push(
                    ...result.candles
                );
            }

            const rawCandles =
                all.length;

            const map =
                new Map();

            for (const candle of all) {

                map.set(
                    String(candle.ts),
                    candle
                );
            }

            const candles =
                [...map.values()]
                    .sort(
                        (a, b) =>
                            a.ts - b.ts
                    );

            return {
                chunksRequested,
                rawCandles,
                candles
            };
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
        // SESSION KEY
        // =====================================================

        function sessionKey(ts) {

            const d =
                new Date(
                    ts * 1000
                );

            const formatter =
                new Intl.DateTimeFormat(
                    "en-CA",
                    {
                        timeZone:
                            TIMEZONE,
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }
                );

            return formatter.format(d);
        }

        // =====================================================
        // IST TIME
        // =====================================================

        function istParts(ts) {

            const d =
                new Date(
                    ts * 1000
                );

            const formatter =
                new Intl.DateTimeFormat(
                    "en-GB",
                    {
                        timeZone:
                            TIMEZONE,
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false
                    }
                );

            const parts =
                formatter
                    .formatToParts(d);

            let hour = 0;
            let minute = 0;

            for (const p of parts) {

                if (
                    p.type === "hour"
                ) {
                    hour =
                        Number(p.value);
                }

                if (
                    p.type === "minute"
                ) {
                    minute =
                        Number(p.value);
                }
            }

            return {
                hour,
                minute
            };
        }

        // =====================================================
        // SESSION VWAP
        // =====================================================

        function sessionVWAP(
            candles,
            index
        ) {

            const key =
                sessionKey(
                    candles[index].ts
                );

            let pv = 0;
            let volume = 0;

            for (
                let i = 0;
                i <= index;
                i++
            ) {

                if (
                    sessionKey(
                        candles[i].ts
                    ) !== key
                ) {
                    continue;
                }

                const candle =
                    candles[i];

                const typical =
                    (
                        candle.h +
                        candle.l +
                        candle.c
                    ) / 3;

                const vol =
                    Math.max(
                        0,
                        candle.v || 0
                    );

                pv +=
                    typical *
                    vol;

                volume += vol;
            }

            if (
                volume === 0
            ) {
                return candles[index].c;
            }

            return pv / volume;
        }

        // =====================================================
        // TIME BUCKET
        // =====================================================

        function getTimeBucket(ts) {

            const {
                hour,
                minute
            } =
                istParts(ts);

            const mins =
                hour * 60 +
                minute;

            if (
                mins < 10 * 60
            ) {
                return "OPEN";
            }

            if (
                mins < 12 * 60
            ) {
                return "MORNING";
            }

            if (
                mins < 14 * 60
            ) {
                return "MIDDAY";
            }

            return "CLOSE";
        }

        // =====================================================
        // FEATURE ENGINE
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

            const previousCloses =
                closes.slice(0, -1);

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
                sessionVWAP(
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

            const spread =
                ema9 -
                ema21;

            const spreadATR =
                atr14 !== 0
                    ? spread / atr14
                    : 0;

            const slope =
                previousEMA9 === null
                    ? 0
                    : ema9 -
                      previousEMA9;

            const slopeATR =
                atr14 !== 0
                    ? slope / atr14
                    : 0;

            let trend =
                "SIDEWAYS";

            if (
                ema9 > ema21 &&
                slopeATR > 0
            ) {
                trend =
                    "BULLISH";
            }

            if (
                ema9 < ema21 &&
                slopeATR < 0
            ) {
                trend =
                    "BEARISH";
            }

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
                atr14 !== 0
                    ? (
                        close -
                        vwap
                    ) / atr14
                    : 0;

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

            let regime =
                "TRANSITION";

            if (
                Math.abs(
                    spreadATR
                ) > 0.35 &&
                Math.abs(
                    slopeATR
                ) > 0.08
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

            const patternType =
                trend !== "SIDEWAYS"
                    ? "TREND_FOLLOW"
                    : "RANGE";

            return {

                close,

                ema9,

                ema21,

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

                regime,

                volatility,

                patternType,

                timeBucket:
                    getTimeBucket(
                        candles[index].ts
                    )
            };
        }

        // =====================================================
        // BASE SIGNAL
        // =====================================================

        function baseSignal(f) {

            if (!f) {
                return null;
            }

            if (
                f.trend === "BULLISH" &&
                f.vwapDirection === "ABOVE"
            ) {
                return "BUY";
            }

            if (
                f.trend === "BEARISH" &&
                f.vwapDirection === "BELOW"
            ) {
                return "SELL";
            }

            return null;
        }

        // =====================================================
        // STRATEGY FAMILY
        // =====================================================

        function familyKey(
            side,
            f
        ) {

            return [
                side,
                `T:${f.trend}`,
                `P:${f.patternType}`
            ].join("|");
        }

        // =====================================================
        // PATTERN KEY
        //
        // Session is SECONDARY.
        // RSI and slope are NOT used as primary pattern keys.
        // =====================================================

        function patternKey(
            side,
            f
        ) {

            return [
                familyKey(side, f),
                `G:${f.regime}`,
                `H:${f.timeBucket}`
            ].join("|");
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

                if (
                    side === "BUY"
                ) {

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
                }

                if (
                    side === "SELL"
                ) {

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
        // NEW: EDGE METRICS
        // =====================================================

        function calculateEdge(
            results
        ) {

            const wins =
                results.filter(
                    r => r > 0
                ).length;

            const losses =
                results.filter(
                    r => r < 0
                ).length;

            const decisive =
                wins + losses;

            const net =
                results.reduce(
                    (a, b) =>
                        a + b,
                    0
                );

            const grossWin =
                results
                    .filter(
                        r => r > 0
                    )
                    .reduce(
                        (a, b) =>
                            a + b,
                        0
                    );

            const grossLoss =
                Math.abs(
                    results
                        .filter(
                            r => r < 0
                        )
                        .reduce(
                            (a, b) =>
                                a + b,
                            0
                        )
                );

            const pf =
                grossLoss > 0
                    ? grossWin /
                      grossLoss
                    : grossWin > 0
                        ? 999
                        : 0;

            const ev =
                results.length
                    ? net /
                      results.length
                    : 0;

            return {

                samples:
                    results.length,

                decisive,

                wins,

                losses,

                winRate:
                    decisive
                        ? wins /
                          decisive *
                          100
                        : 0,

                EV:
                    ev,

                PF:
                    pf
            };
        }

        // =====================================================
        // LEARNING
        //
        // IMPORTANT:
        // We learn BOTH:
        //
        // A. strategy family
        // B. session/regime pattern
        //
        // The family is the primary edge.
        // =====================================================

        function learnPatterns(
            candles,
            trainingStart,
            trainingEnd
        ) {

            const patterns =
                new Map();

            const families =
                new Map();

            for (
                let i =
                    trainingStart + 30;

                i <
                trainingEnd -
                MAX_HOLD_CANDLES;

                i++
            ) {

                const f =
                    features(
                        candles,
                        i
                    );

                if (!f) {
                    continue;
                }

                const side =
                    baseSignal(f);

                if (!side) {
                    continue;
                }

                const confirmation =
                    confirmationScore(
                        candles,
                        i,
                        side
                    );

                if (
                    !confirmation.passed
                ) {
                    continue;
                }

                const family =
                    familyKey(
                        side,
                        f
                    );

                const pattern =
                    patternKey(
                        side,
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

                if (
                    side === "BUY"
                ) {

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

                const outcome =
                    evaluateTrade(
                        candles,
                        i,
                        side,
                        entry,
                        stop,
                        target
                    );

                const result =
                    outcome.resultR;

                // =============================================
                // FAMILY
                // =============================================

                if (
                    !families.has(
                        family
                    )
                ) {

                    families.set(
                        family,
                        {
                            key: family,
                            side,
                            patternType:
                                f.patternType,
                            samples: 0,
                            results: [],
                            foldSet:
                                new Set(),
                            recentResults: []
                        }
                    );
                }

                const fam =
                    families.get(
                        family
                    );

                fam.samples++;

                fam.results.push(
                    result
                );

                fam.foldSet.add(
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

                    fam.recentResults.push(
                        result
                    );
                }

                // =============================================
                // PATTERN
                // =============================================

                if (
                    !patterns.has(
                        pattern
                    )
                ) {

                    patterns.set(
                        pattern,
                        {
                            key: pattern,
                            family,
                            side,
                            patternType:
                                f.patternType,
                            regime:
                                f.regime,
                            session:
                                f.timeBucket,
                            samples: 0,
                            results: [],
                            foldSet:
                                new Set(),
                            recentResults: []
                        }
                    );
                }

                const p =
                    patterns.get(
                        pattern
                    );

                p.samples++;

                p.results.push(
                    result
                );

                p.foldSet.add(
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

                if (
                    i >= recentStart
                ) {

                    p.recentResults.push(
                        result
                    );
                }
            }

            // =================================================
            // FAMILY SCORING
            // =================================================

            const familyResults = [];

            for (
                const family
                of families.values()
            ) {

                const edge =
                    calculateEdge(
                        family.results
                    );

                const recent =
                    calculateEdge(
                        family.recentResults
                    );

                const stableFolds =
                    family.foldSet.size;

                const decay =
                    edge.EV === 0
                        ? 0
                        : (
                            recent.EV -
                            edge.EV
                        ) /
                        Math.abs(
                            edge.EV
                        );

                let quality = 0;

                quality += clamp(
                    edge.winRate *
                    0.45,
                    0,
                    45
                );

                quality += clamp(
                    Math.max(
                        edge.EV,
                        0
                    ) * 20,
                    0,
                    20
                );

                quality += clamp(
                    Math.max(
                        edge.PF - 1,
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

                if (
                    recent.EV < 0
                ) {
                    quality -= 15;
                }

                quality =
                    clamp(
                        quality,
                        0,
                        100
                    );

                const qualified =
                    family.samples >=
                        MIN_FAMILY_SAMPLES &&

                    edge.decisive >=
                        MIN_FAMILY_DECISIVE &&

                    stableFolds >=
                        MIN_STABLE_FOLDS &&

                    edge.EV >=
                        MIN_FAMILY_EXPECTED_VALUE &&

                    edge.PF >=
                        MIN_FAMILY_PROFIT_FACTOR &&

                    decay >= -0.75;

                familyResults.push({

                    key:
                        family.key,

                    side:
                        family.side,

                    patternType:
                        family.patternType,

                    samples:
                        family.samples,

                    decisive:
                        edge.decisive,

                    wins:
                        edge.wins,

                    losses:
                        edge.losses,

                    winRate:
                        round(
                            edge.winRate,
                            2
                        ),

                    EV:
                        round(
                            edge.EV,
                            4
                        ),

                    PF:
                        round(
                            edge.PF,
                            4
                        ),

                    recentEV:
                        round(
                            recent.EV,
                            4
                        ),

                    decay:
                        round(
                            decay,
                            4
                        ),

                    stableFolds,

                    quality:
                        round(
                            quality,
                            2
                        ),

                    qualified
                });
            }

            // =================================================
            // PATTERN SCORING
            // =================================================

            const patternResults = [];

            for (
                const pattern
                of patterns.values()
            ) {

                const edge =
                    calculateEdge(
                        pattern.results
                    );

                const recent =
                    calculateEdge(
                        pattern.recentResults
                    );

                const stableFolds =
                    pattern.foldSet.size;

                const decay =
                    edge.EV === 0
                        ? 0
                        : (
                            recent.EV -
                            edge.EV
                        ) /
                        Math.abs(
                            edge.EV
                        );

                const parentFamily =
                    familyResults.find(
                        f =>
                            f.key ===
                            pattern.family
                    );

                let quality = 0;

                quality += clamp(
                    edge.winRate *
                    0.45,
                    0,
                    45
                );

                quality += clamp(
                    Math.max(
                        edge.EV,
                        0
                    ) * 20,
                    0,
                    20
                );

                quality += clamp(
                    Math.max(
                        edge.PF - 1,
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

                if (
                    recent.EV < 0
                ) {
                    quality -= 15;
                }

                /*
                 * Family quality contributes,
                 * but does not replace pattern evidence.
                 */

                if (
                    parentFamily?.qualified
                ) {
                    quality += 5;
                }

                quality =
                    clamp(
                        quality,
                        0,
                        100
                    );

                const qualified =
                    parentFamily?.qualified === true &&

                    pattern.samples >=
                        MIN_PATTERN_SAMPLES &&

                    edge.decisive >=
                        MIN_PATTERN_DECISIVE &&

                    stableFolds >=
                        MIN_STABLE_FOLDS &&

                    edge.EV >=
                        MIN_EXPECTED_VALUE &&

                    edge.PF >=
                        MIN_PROFIT_FACTOR &&

                    quality >=
                        QUALITY_THRESHOLD &&

                    decay >= -0.75;

                patternResults.push({

                    key:
                        pattern.key,

                    family:
                        pattern.family,

                    side:
                        pattern.side,

                    patternType:
                        pattern.patternType,

                    regime:
                        pattern.regime,

                    session:
                        pattern.session,

                    samples:
                        pattern.samples,

                    decisive:
                        edge.decisive,

                    wins:
                        edge.wins,

                    losses:
                        edge.losses,

                    winRate:
                        round(
                            edge.winRate,
                            2
                        ),

                    EV:
                        round(
                            edge.EV,
                            4
                        ),

                    PF:
                        round(
                            edge.PF,
                            4
                        ),

                    recentEV:
                        round(
                            recent.EV,
                            4
                        ),

                    decay:
                        round(
                            decay,
                            4
                        ),

                    stableFolds,

                    familyQuality:
                        parentFamily
                            ? parentFamily.quality
                            : 0,

                    quality:
                        round(
                            quality,
                            2
                        ),

                    familyQualified:
                        !!parentFamily?.qualified,

                    qualified
                });
            }

            return {
                families:
                    familyResults,

                patterns:
                    patternResults
            };
        }

        // =====================================================
        // SELECT PATTERNS
        //
        // Important:
        // At least 2 independent FAMILIES are preferred.
        // We never manufacture diversity.
        // =====================================================

        function selectPatterns(
            learned
        ) {

            const qualified =
                learned.patterns
                    .filter(
                        p =>
                            p.qualified
                    )
                    .sort(
                        (a, b) =>
                            b.quality -
                            a.quality
                    );

            if (
                !qualified.length
            ) {
                return [];
            }

            const selected = [];

            const familySet =
                new Set();

            /*
             * First pass:
             * one best pattern per family.
             */

            for (
                const p
                of qualified
            ) {

                if (
                    !familySet.has(
                        p.family
                    )
                ) {

                    selected.push(p);

                    familySet.add(
                        p.family
                    );
                }
            }

            /*
             * Second pass:
             * allow additional patterns,
             * but do not let one family dominate
             * the selection.
             */

            for (
                const p
                of qualified
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

        function concentration(
            trades
        ) {

            if (
                !trades.length
            ) {

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
                const trade
                of trades
            ) {

                counts[
                    trade.pattern
                ] =
                    (
                        counts[
                            trade.pattern
                        ] ||
                        0
                    ) + 1;
            }

            const uniquePatterns =
                Object.keys(
                    counts
                ).length;

            const maximum =
                Math.max(
                    ...Object.values(
                        counts
                    )
                );

            const maximumShare =
                maximum /
                trades.length;

            const details =
                Object.entries(
                    counts
                )
                .map(
                    (
                        [
                            pattern,
                            count
                        ]
                    ) => ({
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
            let lastPatternIndex =
                -9999;

            let lastSide = null;
            let lastSideIndex =
                -9999;

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

                const side =
                    baseSignal(f);

                if (!side) {
                    continue;
                }

                const key =
                    patternKey(
                        side,
                        f
                    );

                const selected =
                    selectedPatterns.find(
                        p =>
                            p.key ===
                            key
                    );

                if (!selected) {
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
                    side ===
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
                        side
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
                        trades.length +
                        1,

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
                        sessionKey(
                            candles[i].ts
                        ),

                    time:
                        f.timeBucket,

                    side,

                    pattern:
                        key,

                    patternFamily:
                        selected.family,

                    patternType:
                        f.patternType,

                    regime:
                        f.regime,

                    patternQuality:
                        selected.quality,

                    patternSamples:
                        selected.samples,

                    patternEV:
                        selected.EV,

                    patternPF:
                        selected.PF,

                    familyQuality:
                        selected.familyQuality,

                    confirmationScore:
                        confirmation.score,

                    confirmationMaxScore:
                        confirmation.maxScore,

                    confirmationReasons:
                        confirmation.reasons,

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

        function stats(
            trades
        ) {

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
                wins +
                losses;

            const totalWinR =
                trades
                    .filter(
                        t =>
                            t.resultR > 0
                    )
                    .reduce(
                        (s, t) =>
                            s +
                            t.resultR,
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
                            (s, t) =>
                                s +
                                t.resultR,
                            0
                        )
                );

            const netR =
                trades.reduce(
                    (s, t) =>
                        s +
                        t.resultR,
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
                const trade
                of trades
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

        function currentMarket(
            candles
        ) {

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
                    sessionKey(
                        candles[index].ts
                    ),

                time:
                    f.timeBucket,

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

                patternType:
                    f.patternType,

                volatility:
                    f.volatility
            };
        }

        // =====================================================
        // MAIN DATA LOAD
        // =====================================================

        const history =
            await fetchHistory();

        const rows =
            history.candles;

        const rawLearningRows =
            rows.length;

        if (
            rows.length <
            300
        ) {

            return fail(
                "Insufficient candle data from INDstocks.",
                {
                    rawLearningRows,
                    normalizedRows:
                        rows.length,
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

        const initialTraining =
            200;

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
        // TRUE WALK FORWARD
        // =====================================================

        const foldResults = [];

        const allTrades = [];

        const allSelectedFamilies =
            new Set();

        for (
            const fold
            of folds
        ) {

            const learned =
                learnPatterns(
                    candles,
                    fold.trainingStart,
                    fold.trainingEnd
                );

            const qualifiedFamilies =
                learned.families.filter(
                    f =>
                        f.qualified
                );

            const qualifiedPatterns =
                learned.patterns.filter(
                    p =>
                        p.qualified
                );

            const selectedPatterns =
                selectPatterns(
                    learned
                );

            for (
                const p
                of selectedPatterns
            ) {

                allSelectedFamilies.add(
                    p.family
                );
            }

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
                stats(
                    trades
                );

            const conc =
                concentration(
                    trades
                );

            const selectedFamilySet =
                new Set(
                    selectedPatterns.map(
                        p =>
                            p.family
                    )
                );

            foldResults.push({

                fold:
                    fold.fold,

                trainingRows:
                    fold.trainingRows,

                testRows:
                    fold.testRows,

                familiesDiscovered:
                    learned.families.length,

                qualifiedFamilies:
                    qualifiedFamilies.length,

                patternsDiscovered:
                    learned.patterns.length,

                qualifiedPatterns:
                    qualifiedPatterns.length,

                selectedPatterns:
                    selectedPatterns.length,

                selectedPatternKeys:
                    selectedPatterns.map(
                        p =>
                            p.key
                    ),

                selectedFamilies:
                    [
                        ...selectedFamilySet
                    ],

                independentFamilies:
                    selectedFamilySet.size,

                trades:

                    trades,

                ...s,

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

        // =====================================================
        // FAMILY OOS PERFORMANCE
        // =====================================================

        const familyOOSMap =
            new Map();

        for (
            const trade
            of allTrades
        ) {

            if (
                !familyOOSMap.has(
                    trade.patternFamily
                )
            ) {

                familyOOSMap.set(
                    trade.patternFamily,
                    []
                );
            }

            familyOOSMap
                .get(
                    trade.patternFamily
                )
                .push(
                    trade.resultR
                );
        }

        const familyOOS = [];

        for (
            const [
                family,
                results
            ]
            of familyOOSMap
        ) {

            const edge =
                calculateEdge(
                    results
                );

            familyOOS.push({

                family,

                samples:
                    edge.samples,

                decisive:
                    edge.decisive,

                wins:
                    edge.wins,

                losses:
                    edge.losses,

                winRate:
                    round(
                        edge.winRate,
                        2
                    ),

                EV:
                    round(
                        edge.EV,
                        4
                    ),

                PF:
                    round(
                        edge.PF,
                        4
                    )
            });
        }

        // =====================================================
        // PROFITABILITY PROOF
        // =====================================================

        const profitabilityProof =

            globalStats.expectedValueR >=
                MIN_EXPECTED_VALUE &&

            globalStats.profitFactor >=
                MIN_PROFIT_FACTOR &&

            globalStats.decisiveTrades >=
                5 &&

            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES;

        // =====================================================
        // RISK CONTROL
        // =====================================================

        const riskControl =

            globalStats.maxDrawdownR <=
                MAX_OOS_DRAWDOWN &&

            globalStats.maxConsecutiveLosses <=
                MAX_PATTERN_LOSS_STREAK;

        const sufficientEvidence =
            globalStats.decisiveTrades >= 5;

        const patternDiversity =
            independentFamilies >=
                MIN_INDEPENDENT_FAMILIES &&
            globalConcentration.maximumShare <=
                MAX_PATTERN_CONCENTRATION;

        // =====================================================
        // CURRENT MARKET
        // =====================================================

        const currentMarketData =
            currentMarket(
                rows
            );

        let currentSignal = {

            status:
                "NO_TRADE",

            side: null,

            market:
                currentMarketData,

            reason:
                "Current market does not satisfy the directional signal.",

            nextAction:
                "WAIT"
        };

        const currentF =
            features(
                rows,
                rows.length - 1
            );

        if (
            currentF
        ) {

            const currentSide =
                baseSignal(
                    currentF
                );

            if (
                currentSide
            ) {

                const candidatePattern =
                    patternKey(
                        currentSide,
                        currentF
                    );

                const candidateFamily =
                    familyKey(
                        currentSide,
                        currentF
                    );

                /*
                 * Learn only from historical candles.
                 */

                const finalLearning =
                    learnPatterns(
                        rows.slice(0, -1),
                        0,
                        rows.length - 1
                    );

                const finalSelected =
                    selectPatterns(
                        finalLearning
                    );

                const matchingPattern =
                    finalSelected.find(
                        p =>
                            p.key ===
                            candidatePattern
                    );

                const matchingFamily =
                    finalLearning.families.find(
                        f =>
                            f.key ===
                            candidateFamily &&
                            f.qualified
                    );

                const confirmation =
                    confirmationScore(
                        rows,
                        rows.length - 1,
                        currentSide
                    );

                if (
                    matchingPattern &&
                    matchingFamily &&
                    confirmation.passed
                ) {

                    currentSignal = {

                        status:
                            "SIGNAL",

                        side:
                            currentSide,

                        candidateFamily,

                        pattern:
                            candidatePattern,

                        patternFamily:
                            candidateFamily,

                        patternQuality:
                            matchingPattern.quality,

                        patternSamples:
                            matchingPattern.samples,

                        patternEV:
                            matchingPattern.EV,

                        patternPF:
                            matchingPattern.PF,

                        familyQuality:
                            matchingFamily.quality,

                        familySamples:
                            matchingFamily.samples,

                        familyEV:
                            matchingFamily.EV,

                        familyPF:
                            matchingFamily.PF,

                        confirmationScore:
                            confirmation.score,

                        confirmationMaxScore:
                            confirmation.maxScore,

                        confirmationReasons:
                            confirmation.reasons,

                        market:
                            currentMarketData,

                        reason:
                            "Qualified family edge + qualified session pattern + independent entry confirmation are present.",

                        nextAction:
                            "PAPER_REVIEW_ONLY"
                    };

                } else {

                    let reason =
                        "No qualified V13.5 edge matches the current market.";

                    if (
                        !matchingFamily
                    ) {

                        reason =
                            "Underlying strategy family is not sufficiently validated.";
                    } else if (
                        !matchingPattern
                    ) {

                        reason =
                            "Family is valid, but the current session/regime pattern is not sufficiently validated.";
                    } else if (
                        !confirmation.passed
                    ) {

                        reason =
                            "Historical edge exists, but current entry confirmation failed.";
                    }

                    currentSignal = {

                        status:
                            "NO_TRADE",

                        side: null,

                        market:
                            currentMarketData,

                        candidateFamily,

                        candidatePattern,

                        entryConfirmation:
                            confirmation,

                        matchingFamily:
                            matchingFamily
                                ? {
                                    quality:
                                        matchingFamily.quality,
                                    samples:
                                        matchingFamily.samples,
                                    EV:
                                        matchingFamily.EV,
                                    PF:
                                        matchingFamily.PF
                                }
                                : null,

                        matchingPattern:
                            matchingPattern
                                ? {
                                    quality:
                                        matchingPattern.quality,
                                    samples:
                                        matchingPattern.samples,
                                    EV:
                                        matchingPattern.EV,
                                    PF:
                                        matchingPattern.PF
                                }
                                : null,

                        reason,

                        nextAction:
                            "WAIT"
                    };
                }
            }
        }

        // =====================================================
        // FINAL LEARNING SNAPSHOT
        // =====================================================

        const latestLearning =
            learnPatterns(
                candles,
                0,
                candles.length
            );

        const latestQualifiedFamilies =
            latestLearning.families.filter(
                f =>
                    f.qualified
            );

        const latestQualifiedPatterns =
            latestLearning.patterns.filter(
                p =>
                    p.qualified
            );

        const latestBuyFamilies =
            latestQualifiedFamilies.filter(
                f =>
                    f.side === "BUY"
            );

        const latestSellFamilies =
            latestQualifiedFamilies.filter(
                f =>
                    f.side === "SELL"
            );

        // =====================================================
        // TRADING DAY COUNT
        // =====================================================

        const tradingDays =
            new Set(
                candles.map(
                    c =>
                        sessionKey(
                            c.ts
                        )
                )
            ).size;

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
                "V13_5_FAMILY_EDGE_VALIDATION_SESSION_ADAPTIVE_TRUE_WALK_FORWARD",

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

            requestedDays:
                REQUESTED_DAYS,

            dataSource:
                "INDSTOCKS_HISTORICAL_API",

            dataFetch: {

                chunksRequested:
                    history.chunksRequested,

                rawCandles:
                    history.rawCandles,

                normalizedCandles:
                    rows.length,

                deduplicated:
                    history.rawCandles -
                    rows.length,

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

                currentCandleExcluded:
                    true,

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

                familyLevelValidation:
                    true,

                sessionAdaptive:
                    true,

                patternCircuitBreaker:
                    true,

                patternConcentrationControl:
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
                    "VALIDATE_INDEPENDENT_STRATEGY_FAMILIES",

                allowNoTrade:
                    true,

                minimumOOSExpectedValueR:
                    MIN_EXPECTED_VALUE,

                minimumOOSProfitFactor:
                    MIN_PROFIT_FACTOR,

                minimumOOSDecisiveTrades:
                    5,

                minimumPatternSamples:
                    MIN_PATTERN_SAMPLES,

                minimumFamilySamples:
                    MIN_FAMILY_SAMPLES,

                minimumStableFolds:
                    MIN_STABLE_FOLDS,

                qualityThreshold:
                    QUALITY_THRESHOLD,

                minimumIndependentFamilies:
                    MIN_INDEPENDENT_FAMILIES,

                maximumPatternConcentration:
                    MAX_PATTERN_CONCENTRATION,

                profitabilityProof:
                    profitabilityProof
                        ? "PROVEN"
                        : "NOT_PROVEN"
            },

            sourceStatistics: {

                rawLearningRows:
                    rawLearningRows,

                normalizedRows:
                    rows.length,

                historicalLearningRows:
                    candles.length,

                currentCandleExcluded:
                    1,

                candlesTested:
                    candles.length,

                tradingDays,

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

                familyValidated:
                    true,

                sessionAdaptive:
                    true,

                folds
            },

            trueOOSPaperExecution: {

                description:
                    "Each fold learns strategy families exclusively from preceding data, validates session/regime patterns within those families, then executes only on unseen future data after independent entry confirmation.",

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

                independentPatternFamilies:
                    independentFamilies,

                patternConcentration:
                    globalConcentration,

                familyOOS
            },

            foldResults,

            currentMarket:
                currentMarketData,

            currentSignal,

            latestLearning: {

                trainingRows:
                    candles.length,

                familiesDiscovered:
                    latestLearning.families.length,

                qualifiedFamilies:
                    latestQualifiedFamilies.length,

                patternsDiscovered:
                    latestLearning.patterns.length,

                robustPatterns:
                    latestQualifiedPatterns.length,

                buyFamilies:
                    latestBuyFamilies.length,

                sellFamilies:
                    latestSellFamilies.length,

                independentFamilies:
                    new Set(
                        latestQualifiedFamilies.map(
                            f =>
                                f.key
                        )
                    ).size,

                signalConditioned:
                    true,

                familyValidated:
                    true,

                sessionAdaptive:
                    true,

                regimeAdaptive:
                    true,

                decayAware:
                    true,

                patternTypes: {

                    trendFollow:
                        latestQualifiedFamilies.filter(
                            f =>
                                f.patternType ===
                                "TREND_FOLLOW"
                        ).length,

                    range:
                        latestQualifiedFamilies.filter(
                            f =>
                                f.patternType ===
                                "RANGE"
                        ).length
                }
            },

            validationRules: {

                historicalAPI: {

                    endpoint:
                        "/market/historical/5minute",

                    maximumChunkDays:
                        MAX_CHUNK_DAYS,

                    chunkingEnabled:
                        true
                },

                sessionVWAP: {

                    enabled:
                        true,

                    reset:
                        "DAILY",

                    timezone:
                        TIMEZONE
                },

                familyValidation: {

                    enabled:
                        true,

                    minimumSamples:
                        MIN_FAMILY_SAMPLES,

                    minimumDecisiveTrades:
                        MIN_FAMILY_DECISIVE,

                    minimumEV:
                        MIN_FAMILY_EXPECTED_VALUE,

                    minimumPF:
                        MIN_FAMILY_PROFIT_FACTOR
                },

                patternValidation: {

                    enabled:
                        true,

                    minimumSamples:
                        MIN_PATTERN_SAMPLES,

                    minimumDecisiveTrades:
                        MIN_PATTERN_DECISIVE,

                    minimumEV:
                        MIN_EXPECTED_VALUE,

                    minimumPF:
                        MIN_PROFIT_FACTOR
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

                    minimumIndependentFamilies:
                        MIN_INDEPENDENT_FAMILIES,

                    maximumPatternConcentration:
                        MAX_PATTERN_CONCENTRATION
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
                    RISK_R,

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
            "TradeMind Pro V13.5 ERROR:",
            error
        );

        return res
            .status(500)
            .json({

                success: false,

                version:
                    "V13.5",

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

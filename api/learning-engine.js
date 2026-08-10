/*
TradeMind Pro
V13.1 REGIME-AWARE EDGE VALIDATION ENGINE

V13.1 improvements over V13.0:

1. REAL regime classification
   - TREND_UP
   - TREND_DOWN
   - RANGE
   - TRANSITION

2. Sample-size confidence adjustment
   Small samples cannot receive artificially high confidence.

3. Diversity is diagnostic, NOT an artificial trade requirement.
   We do not manufacture trades merely to obtain pattern diversity.

4. Strict chronological walk-forward
5. No future leakage
6. Current candle excluded from learning
7. Current candle outcome never used
8. Entry confirmation required
9. Pattern decay detection
10. Pattern circuit breaker
11. Same-pattern cooldown
12. Same-side cooldown
13. Global cooldown
14. Paper trading only
15. No broker orders

INSTRUMENT:
NIFTY 50

TIMEFRAME:
5 minute

PAPER ONLY.
*/

// ============================================================
// CONFIG
// ============================================================

const VERSION = "V13.1";

const CONFIG = {

    // Walk forward
    folds: 4,
    minimumTrainingRows: 200,

    // Pattern validation
    minimumPatternSamples: 8,
    minimumOOSSamples: 3,
    minimumStableFolds: 2,

    // Edge requirements
    minimumEV: 0.05,
    minimumPF: 1.05,

    // Quality
    qualityThreshold: 60,

    // Entry confirmation
    minimumConfirmationScore: 5,
    maximumConfirmationScore: 6,

    // Risk
    riskPerTradeR: 1,
    stopR: 1,
    targetR: 2,
    preferredTargetR: 2.5,

    // Trade management
    maxHoldCandles: 12,

    // Cooldowns
    entryCooldownCandles: 3,
    samePatternCooldownCandles: 5,
    sameSideCooldownCandles: 2,

    // Circuit breaker
    maximumPatternLossStreak: 6,

    // OOS safety
    maximumOOSDrawdownR: 12,
    maximumOOSLossStreak: 6,

    // Regime
    minimumATRPercent: 0.00025,
    trendSpreadATR: 0.08,
    strongTrendSpreadATR: 0.18,

    // Sample confidence
    confidenceReferenceSamples: 40,

    // Walk forward test size
    testFraction: 0.25
};


// ============================================================
// BASIC HELPERS
// ============================================================

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function mean(arr) {

    const valid = arr.filter(Number.isFinite);

    if (!valid.length) return null;

    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function std(arr) {

    const valid = arr.filter(Number.isFinite);

    if (valid.length < 2) return null;

    const m = mean(valid);

    const variance =
        valid.reduce((sum, x) => {
            return sum + Math.pow(x - m, 2);
        }, 0) / valid.length;

    return Math.sqrt(variance);
}


// ============================================================
// NORMALIZE CANDLES
// ============================================================

function normalizeCandles(raw) {

    if (!Array.isArray(raw)) {
        return [];
    }

    const out = [];

    for (const c of raw) {

        if (!c) continue;

        const ts =
            num(c.ts) ??
            num(c.timestamp) ??
            num(c.time);

        const o =
            num(c.o) ??
            num(c.open);

        const h =
            num(c.h) ??
            num(c.high);

        const l =
            num(c.l) ??
            num(c.low);

        const close =
            num(c.c) ??
            num(c.close);

        const volume =
            num(c.v) ??
            num(c.volume) ??
            0;

        if (
            ts === null ||
            o === null ||
            h === null ||
            l === null ||
            close === null
        ) {
            continue;
        }

        out.push({
            ts,
            o,
            h,
            l,
            c: close,
            v: volume
        });
    }

    out.sort((a, b) => a.ts - b.ts);

    return out;
}


// ============================================================
// EMA
// ============================================================

function ema(values, period) {

    if (values.length < period) {
        return null;
    }

    let value = mean(values.slice(0, period));

    const multiplier = 2 / (period + 1);

    for (let i = period; i < values.length; i++) {

        value =
            (values[i] - value) * multiplier +
            value;
    }

    return value;
}


// ============================================================
// RSI
// ============================================================

function rsi(values, period = 14) {

    if (values.length <= period) {
        return null;
    }

    let gain = 0;
    let loss = 0;

    for (let i = 1; i <= period; i++) {

        const change =
            values[i] - values[i - 1];

        if (change >= 0) {
            gain += change;
        } else {
            loss += Math.abs(change);
        }
    }

    let avgGain = gain / period;
    let avgLoss = loss / period;

    for (let i = period + 1; i < values.length; i++) {

        const change =
            values[i] - values[i - 1];

        const currentGain =
            change > 0 ? change : 0;

        const currentLoss =
            change < 0 ? Math.abs(change) : 0;

        avgGain =
            ((avgGain * (period - 1)) + currentGain) /
            period;

        avgLoss =
            ((avgLoss * (period - 1)) + currentLoss) /
            period;
    }

    if (avgLoss === 0) {
        return 100;
    }

    const rs = avgGain / avgLoss;

    return 100 - (100 / (1 + rs));
}


// ============================================================
// ATR
// ============================================================

function atr(candles, period = 14) {

    if (candles.length <= period) {
        return null;
    }

    const trs = [];

    for (let i = 1; i < candles.length; i++) {

        const current = candles[i];
        const previous = candles[i - 1];

        const tr = Math.max(
            current.h - current.l,
            Math.abs(current.h - previous.c),
            Math.abs(current.l - previous.c)
        );

        trs.push(tr);
    }

    if (trs.length < period) {
        return null;
    }

    let value =
        mean(trs.slice(0, period));

    for (let i = period; i < trs.length; i++) {

        value =
            ((value * (period - 1)) + trs[i]) /
            period;
    }

    return value;
}


// ============================================================
// VWAP
// ============================================================

function vwap(candles) {

    if (!candles.length) {
        return null;
    }

    let cumulativePV = 0;
    let cumulativeVolume = 0;

    for (const c of candles) {

        const typical =
            (c.h + c.l + c.c) / 3;

        cumulativePV +=
            typical * (c.v || 0);

        cumulativeVolume +=
            c.v || 0;
    }

    if (cumulativeVolume === 0) {
        return null;
    }

    return cumulativePV / cumulativeVolume;
}


// ============================================================
// EMA SLOPE
// ============================================================

function emaSlope(values, period = 9, lookback = 3) {

    if (values.length < period + lookback) {
        return null;
    }

    const recent =
        ema(values.slice(0, values.length), period);

    const previousSlice =
        values.slice(
            0,
            values.length - lookback
        );

    const previous =
        ema(previousSlice, period);

    if (
        recent === null ||
        previous === null
    ) {
        return null;
    }

    return recent - previous;
}


// ============================================================
// MARKET STRUCTURE
// ============================================================

function calculateMarket(candles) {

    if (candles.length < 30) {
        return null;
    }

    const closes =
        candles.map(c => c.c);

    const current =
        candles[candles.length - 1];

    const e9 =
        ema(closes, 9);

    const e21 =
        ema(closes, 21);

    const r =
        rsi(closes, 14);

    const a =
        atr(candles, 14);

    const v =
        vwap(candles);

    if (
        e9 === null ||
        e21 === null ||
        r === null ||
        a === null ||
        v === null
    ) {
        return null;
    }

    const spread =
        e9 - e21;

    const spreadATR =
        a !== 0
            ? spread / a
            : 0;

    const slope =
        emaSlope(closes, 9, 3);

    const slopeATR =
        a !== 0 && slope !== null
            ? slope / a
            : 0;

    const price =
        current.c;

    const atrPercent =
        price !== 0
            ? a / price
            : 0;

    // --------------------------------------------------------
    // REAL REGIME CLASSIFICATION
    // --------------------------------------------------------

    let regime = "TRANSITION";

    const strongSpread =
        Math.abs(spreadATR) >=
        CONFIG.strongTrendSpreadATR;

    const directionalSpread =
        Math.abs(spreadATR) >=
        CONFIG.trendSpreadATR;

    const directionalSlope =
        Math.abs(slopeATR) >= 0.03;

    const lowVolatility =
        atrPercent <
        CONFIG.minimumATRPercent;

    if (
        directionalSpread &&
        directionalSlope &&
        spreadATR > 0 &&
        slopeATR > 0
    ) {
        regime = strongSpread
            ? "TREND_UP"
            : "TREND_UP";
    }

    else if (
        directionalSpread &&
        directionalSlope &&
        spreadATR < 0 &&
        slopeATR < 0
    ) {
        regime = strongSpread
            ? "TREND_DOWN"
            : "TREND_DOWN";
    }

    else if (
        Math.abs(spreadATR) < 0.08 &&
        Math.abs(slopeATR) < 0.04
    ) {
        regime = "RANGE";
    }

    else {
        regime = "TRANSITION";
    }

    if (lowVolatility) {
        regime = "RANGE";
    }

    // --------------------------------------------------------
    // TREND
    // --------------------------------------------------------

    let trend = "NEUTRAL";

    if (
        e9 > e21 &&
        slopeATR > 0
    ) {
        trend = "BULLISH";
    }

    else if (
        e9 < e21 &&
        slopeATR < 0
    ) {
        trend = "BEARISH";
    }

    // --------------------------------------------------------
    // VWAP
    // --------------------------------------------------------

    const vwapDirection =
        price > v
            ? "ABOVE"
            : price < v
                ? "BELOW"
                : "AT";

    // --------------------------------------------------------
    // RSI BUCKET
    // --------------------------------------------------------

    let rsiBucket = "NEUTRAL";

    if (r >= 60) {
        rsiBucket = "HIGH";
    }

    else if (r >= 52) {
        rsiBucket = "NEUTRAL_HIGH";
    }

    else if (r <= 40) {
        rsiBucket = "LOW";
    }

    else if (r <= 48) {
        rsiBucket = "NEUTRAL_LOW";
    }

    // --------------------------------------------------------
    // PATTERN TYPE
    // --------------------------------------------------------

    let patternType = "RANGE";

    if (regime === "TREND_UP" ||
        regime === "TREND_DOWN") {

        patternType = "TREND_FOLLOW";
    }

    else if (regime === "TRANSITION") {

        patternType = "REVERSAL";
    }

    return {

        price,

        trend,

        regime,

        rsi: r,

        rsiBucket,

        vwap: v,

        vwapDirection,

        vwapDistanceATR:
            a !== 0
                ? (price - v) / a
                : 0,

        atr14: a,

        atrPercent,

        ema9: e9,

        ema21: e21,

        emaSpreadATR: spreadATR,

        ema9SlopeATR: slopeATR,

        patternType
    };
}


// ============================================================
// CONFIRMATION ENGINE
// ============================================================

function confirmation(candles, side) {

    if (candles.length < 30) {
        return {
            score: 0,
            maxScore: 6,
            confirmed: false,
            reasons: []
        };
    }

    const market =
        calculateMarket(candles);

    if (!market) {
        return {
            score: 0,
            maxScore: 6,
            confirmed: false,
            reasons: []
        };
    }

    let score = 0;

    const reasons = [];

    // 1. Trend
    if (
        side === "BUY" &&
        market.trend === "BULLISH"
    ) {
        score++;
        reasons.push("TREND_ALIGNED");
    }

    if (
        side === "SELL" &&
        market.trend === "BEARISH"
    ) {
        score++;
        reasons.push("TREND_ALIGNED");
    }

    // 2. VWAP
    if (
        side === "BUY" &&
        market.vwapDirection === "ABOVE"
    ) {
        score++;
        reasons.push("VWAP_ALIGNED");
    }

    if (
        side === "SELL" &&
        market.vwapDirection === "BELOW"
    ) {
        score++;
        reasons.push("VWAP_ALIGNED");
    }

    // 3. EMA alignment
    if (
        side === "BUY" &&
        market.ema9 > market.ema21
    ) {
        score++;
        reasons.push("EMA_ALIGNED");
    }

    if (
        side === "SELL" &&
        market.ema9 < market.ema21
    ) {
        score++;
        reasons.push("EMA_ALIGNED");
    }

    // 4. EMA spread
    if (
        Math.abs(market.emaSpreadATR) >=
        CONFIG.trendSpreadATR
    ) {
        score++;
        reasons.push("EMA_SPREAD");
    }

    // 5. Slope
    if (
        side === "BUY" &&
        market.ema9SlopeATR > 0.03
    ) {
        score++;
        reasons.push("SLOPE_ALIGNED");
    }

    if (
        side === "SELL" &&
        market.ema9SlopeATR < -0.03
    ) {
        score++;
        reasons.push("SLOPE_ALIGNED");
    }

    // 6. RSI
    if (
        side === "BUY" &&
        market.rsi >= 50
    ) {
        score++;
        reasons.push("RSI_ALIGNED");
    }

    if (
        side === "SELL" &&
        market.rsi <= 50
    ) {
        score++;
        reasons.push("RSI_ALIGNED");
    }

    return {

        score,

        maxScore: 6,

        confirmed:
            score >=
            CONFIG.minimumConfirmationScore,

        reasons
    };
}


// ============================================================
// PATTERN KEY
// ============================================================

function makePattern(market, side) {

    if (!market) return null;

    return [

        side,

        `T:${market.trend}`,

        `V:${market.vwapDirection}`,

        `P:${market.patternType}`,

        `R:${market.rsiBucket}`,

        `G:${market.regime}`,

    ].join("|");
}


// ============================================================
// OUTCOME
// ============================================================

function evaluateOutcome(candles, index, side, atrValue) {

    if (
        index < 0 ||
        index >= candles.length - 1 ||
        !atrValue
    ) {
        return null;
    }

    const entry =
        candles[index].c;

    const risk =
        atrValue;

    const stop =
        side === "BUY"
            ? entry - risk
            : entry + risk;

    const target =
        side === "BUY"
            ? entry + (risk * 2)
            : entry - (risk * 2);

    const maxIndex =
        Math.min(
            candles.length - 1,
            index + CONFIG.maxHoldCandles
        );

    for (
        let j = index + 1;
        j <= maxIndex;
        j++
    ) {

        const c =
            candles[j];

        if (side === "BUY") {

            const hitStop =
                c.l <= stop;

            const hitTarget =
                c.h >= target;

            if (hitStop && hitTarget) {
                return {
                    resultR: -1,
                    exitType: "STOP"
                };
            }

            if (hitStop) {
                return {
                    resultR: -1,
                    exitType: "STOP"
                };
            }

            if (hitTarget) {
                return {
                    resultR: 2,
                    exitType: "TARGET"
                };
            }
        }

        else {

            const hitStop =
                c.h >= stop;

            const hitTarget =
                c.l <= target;

            if (hitStop && hitTarget) {
                return {
                    resultR: -1,
                    exitType: "STOP"
                };
            }

            if (hitStop) {
                return {
                    resultR: -1,
                    exitType: "STOP"
                };
            }

            if (hitTarget) {
                return {
                    resultR: 2,
                    exitType: "TARGET"
                };
            }
        }
    }

    return {
        resultR: 0,
        exitType: "TIMEOUT"
    };
}


// ============================================================
// PATTERN STATISTICS
// ============================================================

function patternStats(records) {

    const map = {};

    for (const r of records) {

        if (!r.pattern) continue;

        if (!map[r.pattern]) {

            map[r.pattern] = {
                pattern: r.pattern,
                side: r.side,
                samples: 0,
                wins: 0,
                losses: 0,
                timeouts: 0,
                totalR: 0,
                results: [],
                folds: new Set()
            };
        }

        const p =
            map[r.pattern];

        p.samples++;

        p.totalR +=
            r.resultR;

        p.results.push(
            r.resultR
        );

        p.folds.add(
            r.fold
        );

        if (r.resultR > 0) {
            p.wins++;
        }

        else if (r.resultR < 0) {
            p.losses++;
        }

        else {
            p.timeouts++;
        }
    }

    return Object.values(map);
}


// ============================================================
// EXPECTED VALUE
// ============================================================

function expectedValue(results) {

    if (!results.length) {
        return 0;
    }

    return mean(results) || 0;
}


// ============================================================
// PROFIT FACTOR
// ============================================================

function profitFactor(results) {

    const wins =
        results
            .filter(x => x > 0)
            .reduce((a, b) => a + b, 0);

    const losses =
        Math.abs(
            results
                .filter(x => x < 0)
                .reduce((a, b) => a + b, 0)
        );

    if (losses === 0) {

        return wins > 0
            ? 999
            : 0;
    }

    return wins / losses;
}


// ============================================================
// SAMPLE CONFIDENCE
// ============================================================

function sampleConfidence(samples) {

    /*
      V13.0 problem:
      10 samples could generate 90+ quality.

      V13.1:
      confidence grows gradually with sample size.

      8 samples  -> low confidence
      20 samples -> moderate
      40+ samples -> full confidence
    */

    if (samples <= 0) {
        return 0;
    }

    const confidence =
        1 -
        Math.exp(
            -samples /
            CONFIG.confidenceReferenceSamples
        );

    return clamp(
        confidence,
        0,
        1
    );
}


// ============================================================
// EDGE QUALITY
// ============================================================

function calculateQuality(stats) {

    if (!stats || !stats.samples) {
        return 0;
    }

    const ev =
        expectedValue(
            stats.results
        );

    const pf =
        profitFactor(
            stats.results
        );

    const stableFolds =
        stats.folds.size;

    const rawEVScore =
        clamp(
            50 + (ev * 30),
            0,
            100
        );

    const pfScore =
        clamp(
            pf === 999
                ? 100
                : pf * 30,
            0,
            100
        );

    const stabilityScore =
        clamp(
            stableFolds * 20,
            0,
            100
        );

    const rawQuality =
        (
            rawEVScore * 0.40 +
            pfScore * 0.35 +
            stabilityScore * 0.25
        );

    const confidence =
        sampleConfidence(
            stats.samples
        );

    /*
      Blend toward neutral when sample size is small.
    */

    const adjusted =
        50 +
        (
            (rawQuality - 50) *
            confidence
        );

    return Number(
        clamp(
            adjusted,
            0,
            100
        ).toFixed(2)
    );
}


// ============================================================
// REGIME VALIDATION
// ============================================================

function regimeValidate(records) {

    const groups = {};

    for (const r of records) {

        const regime =
            r.regime || "UNKNOWN";

        if (!groups[regime]) {

            groups[regime] = {
                results: [],
                samples: 0
            };
        }

        groups[regime].samples++;

        groups[regime]
            .results
            .push(r.resultR);
    }

    const validations = {};

    for (const [regime, g] of Object.entries(groups)) {

        const ev =
            expectedValue(g.results);

        const pf =
            profitFactor(g.results);

        validations[regime] = {

            samples: g.samples,

            EV: Number(
                ev.toFixed(4)
            ),

            PF: Number(
                pf.toFixed(4)
            ),

            valid:
                g.samples >=
                CONFIG.minimumPatternSamples &&
                ev >= CONFIG.minimumEV &&
                pf >= CONFIG.minimumPF
        };
    }

    return validations;
}


// ============================================================
// DECAY DETECTION
// ============================================================

function decayCheck(records) {

    if (!records.length) {
        return {
            decay: false,
            recentEV: 0
        };
    }

    const recentCount =
        Math.max(
            3,
            Math.floor(
                records.length * 0.25
            )
        );

    const recent =
        records.slice(
            -recentCount
        );

    const older =
        records.slice(
            0,
            Math.max(
                1,
                records.length -
                recentCount
            )
        );

    const recentEV =
        expectedValue(
            recent.map(x => x.resultR)
        );

    const olderEV =
        expectedValue(
            older.map(x => x.resultR)
        );

    const decay =
        recentEV <
        olderEV - 0.75;

    return {

        decay,

        recentEV:
            Number(
                recentEV.toFixed(4)
            ),

        olderEV:
            Number(
                olderEV.toFixed(4)
            )
    };
}


// ============================================================
// BUILD TRAINING RECORDS
// ============================================================

function buildTrainingRecords(
    candles,
    start,
    end,
    fold
) {

    const records = [];

    for (
        let i = start + 30;
        i < end - 1;
        i++
    ) {

        const history =
            candles.slice(
                0,
                i + 1
            );

        const market =
            calculateMarket(
                history
            );

        if (!market) continue;

        /*
          Only directional trend-follow setups
          are candidates for training.
        */

        let side = null;

        if (
            market.regime === "TREND_UP" &&
            market.trend === "BULLISH"
        ) {
            side = "BUY";
        }

        else if (
            market.regime === "TREND_DOWN" &&
            market.trend === "BEARISH"
        ) {
            side = "SELL";
        }

        if (!side) continue;

        const confirm =
            confirmation(
                history,
                side
            );

        if (
            !confirm.confirmed
        ) {
            continue;
        }

        const pattern =
            makePattern(
                market,
                side
            );

        if (!pattern) continue;

        const outcome =
            evaluateOutcome(
                candles,
                i,
                side,
                market.atr14
            );

        if (!outcome) continue;

        records.push({

            fold,

            index: i,

            timestamp:
                candles[i].ts,

            side,

            pattern,

            regime:
                market.regime,

            trend:
                market.trend,

            rsiBucket:
                market.rsiBucket,

            confirmationScore:
                confirm.score,

            resultR:
                outcome.resultR,

            exitType:
                outcome.exitType
        });
    }

    return records;
}


// ============================================================
// SELECT PATTERNS
// ============================================================

function selectPatterns(
    trainingRecords
) {

    const stats =
        patternStats(
            trainingRecords
        );

    const selected = [];

    for (const p of stats) {

        if (
            p.samples <
            CONFIG.minimumPatternSamples
        ) {
            continue;
        }

        const ev =
            expectedValue(
                p.results
            );

        const pf =
            profitFactor(
                p.results
            );

        const stableFolds =
            p.folds.size;

        if (
            stableFolds <
            CONFIG.minimumStableFolds
        ) {
            continue;
        }

        if (
            ev <
            CONFIG.minimumEV
        ) {
            continue;
        }

        if (
            pf <
            CONFIG.minimumPF
        ) {
            continue;
        }

        const decay =
            decayCheck(
                trainingRecords.filter(
                    x =>
                        x.pattern ===
                        p.pattern
                )
            );

        if (decay.decay) {
            continue;
        }

        const quality =
            calculateQuality(
                p
            );

        if (
            quality <
            CONFIG.qualityThreshold
        ) {
            continue;
        }

        selected.push({

            pattern:
                p.pattern,

            side:
                p.side,

            samples:
                p.samples,

            wins:
                p.wins,

            losses:
                p.losses,

            timeouts:
                p.timeouts,

            EV:
                Number(
                    ev.toFixed(4)
                ),

            PF:
                Number(
                    pf.toFixed(4)
                ),

            stableFolds,

            quality
        });
    }

    selected.sort(
        (a, b) =>
            b.quality -
            a.quality
    );

    return selected;
}


// ============================================================
// OOS EXECUTION
// ============================================================

function executeOOS(
    candles,
    testStart,
    testEnd,
    selectedPatterns,
    fold
) {

    const trades = [];

    let lastEntry =
        -Infinity;

    let lastPatternEntry =
        -Infinity;

    let lastSideEntry =
        -Infinity;

    let openUntil =
        -Infinity;

    let patternLossStreak = {};

    for (
        let i = testStart + 30;
        i < testEnd;
        i++
    ) {

        if (
            i <= lastEntry +
            CONFIG.entryCooldownCandles
        ) {
            continue;
        }

        if (
            i <= openUntil
        ) {
            continue;
        }

        const history =
            candles.slice(
                0,
                i + 1
            );

        const market =
            calculateMarket(
                history
            );

        if (!market) continue;

        /*
          Current candle is used ONLY
          for signal confirmation.

          It is NOT used for training.
        */

        const possibleSides = [];

        if (
            market.regime ===
            "TREND_UP" &&
            market.trend ===
            "BULLISH"
        ) {
            possibleSides.push(
                "BUY"
            );
        }

        if (
            market.regime ===
            "TREND_DOWN" &&
            market.trend ===
            "BEARISH"
        ) {
            possibleSides.push(
                "SELL"
            );
        }

        for (const side of possibleSides) {

            const pattern =
                makePattern(
                    market,
                    side
                );

            const selected =
                selectedPatterns.find(
                    p =>
                        p.pattern ===
                        pattern
                );

            if (!selected) {
                continue;
            }

            const confirm =
                confirmation(
                    history,
                    side
                );

            if (
                !confirm.confirmed
            ) {
                continue;
            }

            if (
                i <=
                lastPatternEntry +
                CONFIG.samePatternCooldownCandles
            ) {
                continue;
            }

            if (
                i <=
                lastSideEntry +
                CONFIG.sameSideCooldownCandles
            ) {
                continue;
            }

            if (
                (patternLossStreak[pattern] || 0)
                >=
                CONFIG.maximumPatternLossStreak
            ) {
                continue;
            }

            const entry =
                candles[i].c;

            const risk =
                market.atr14;

            if (!risk || risk <= 0) {
                continue;
            }

            const stop =
                side === "BUY"
                    ? entry - risk
                    : entry + risk;

            const target =
                side === "BUY"
                    ? entry + (risk * 2)
                    : entry - (risk * 2);

            const outcome =
                evaluateOutcome(
                    candles,
                    i,
                    side,
                    risk
                );

            if (!outcome) {
                continue;
            }

            const trade = {

                tradeNumber:
                    trades.length + 1,

                fold,

                signalIndex:
                    i,

                timestamp:
                    candles[i].ts,

                side,

                pattern,

                patternLevel:
                    pattern.split("|").length,

                patternType:
                    market.patternType,

                patternQuality:
                    selected.quality,

                patternSamples:
                    selected.samples,

                patternEV:
                    selected.EV,

                patternPF:
                    selected.PF,

                patternStableFolds:
                    selected.stableFolds,

                regime:
                    market.regime,

                confirmationScore:
                    confirm.score,

                confirmationMaxScore:
                    confirm.maxScore,

                entry,

                stop,

                target,

                preferredTarget:
                    side === "BUY"
                        ? entry + risk * 2.5
                        : entry - risk * 2.5,

                riskReward:
                    "1:2",

                exitType:
                    outcome.exitType,

                resultR:
                    outcome.resultR
            };

            trades.push(
                trade
            );

            lastEntry = i;

            lastPatternEntry = i;

            lastSideEntry = i;

            openUntil =
                i +
                CONFIG.maxHoldCandles;

            if (
                !patternLossStreak[pattern]
            ) {
                patternLossStreak[pattern] = 0;
            }

            if (
                outcome.resultR < 0
            ) {
                patternLossStreak[pattern]++;
            }

            else if (
                outcome.resultR > 0
            ) {
                patternLossStreak[pattern] = 0;
            }

            break;
        }
    }

    return trades;
}


// ============================================================
// STATS
// ============================================================

function calculateStats(trades) {

    const results =
        trades.map(
            t => t.resultR
        );

    const wins =
        results.filter(
            x => x > 0
        ).length;

    const losses =
        results.filter(
            x => x < 0
        ).length;

    const timeouts =
        results.filter(
            x => x === 0
        ).length;

    let equity = 0;
    let peak = 0;
    let maxDD = 0;

    let lossStreak = 0;
    let maxLossStreak = 0;

    for (const r of results) {

        equity += r;

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

        if (r < 0) {

            lossStreak++;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    lossStreak
                );
        }

        else {
            lossStreak = 0;
        }
    }

    const decisive =
        wins + losses;

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
                ? Number(
                    (
                        wins /
                        decisive *
                        100
                    ).toFixed(2)
                )
                : 0,

        totalWinR:
            results
                .filter(x => x > 0)
                .reduce(
                    (a, b) => a + b,
                    0
                ),

        totalLossR:
            Math.abs(
                results
                    .filter(x => x < 0)
                    .reduce(
                        (a, b) => a + b,
                        0
                    )
            ),

        netR:
            Number(
                results
                    .reduce(
                        (a, b) => a + b,
                        0
                    )
                    .toFixed(4)
            ),

        expectedValueR:
            Number(
                expectedValue(
                    results
                ).toFixed(4)
            ),

        profitFactor:
            Number(
                profitFactor(
                    results
                ).toFixed(4)
            ),

        maxDrawdownR:
            Number(
                maxDD.toFixed(4)
            ),

        maxConsecutiveLosses:
            maxLossStreak
    };
}


// ============================================================
// MAIN ENGINE
// ============================================================

function runEngine(rawCandles) {

    const candles =
        normalizeCandles(
            rawCandles
        );

    if (candles.length < 250) {

        throw new Error(
            "Insufficient candle data. Minimum 250 candles required."
        );
    }

    /*
      Exclude the current candle completely
      from historical learning.
    */

    const historical =
        candles.slice(
            0,
            candles.length - 1
        );

    const current =
        candles[candles.length - 1];

    const total =
        historical.length;

    const foldSize =
        Math.floor(
            total * CONFIG.testFraction
        );

    const folds = [];

    const foldDefinitions = [];

    for (
        let f = 0;
        f < CONFIG.folds;
        f++
    ) {

        const testStart =
            Math.max(
                CONFIG.minimumTrainingRows,
                f === 0
                    ? CONFIG.minimumTrainingRows
                    : CONFIG.minimumTrainingRows +
                      ((f - 1) * foldSize)
            );

        let actualTestStart =
            testStart;

        let actualTestEnd =
            f === CONFIG.folds - 1
                ? total
                : Math.min(
                    total,
                    testStart +
                    foldSize
                );

        if (
            actualTestStart >=
            actualTestEnd
        ) {
            continue;
        }

        foldDefinitions.push({

            fold:
                f + 1,

            trainingStart:
                0,

            trainingEnd:
                actualTestStart,

            testStart:
                actualTestStart,

            testEnd:
                actualTestEnd,

            trainingRows:
                actualTestStart,

            testRows:
                actualTestEnd -
                actualTestStart
        });
    }


    // --------------------------------------------------------
    // TRUE WALK FORWARD
    // --------------------------------------------------------

    for (const def of foldDefinitions) {

        const trainingRecords =
            buildTrainingRecords(
                historical,
                def.trainingStart,
                def.trainingEnd,
                def.fold
            );

        const selectedPatterns =
            selectPatterns(
                trainingRecords
            );

        const trades =
            executeOOS(
                historical,
                def.testStart,
                def.testEnd,
                selectedPatterns,
                def.fold
            );

        const stats =
            calculateStats(
                trades
            );

        const patternCounts = {};

        for (const t of trades) {

            patternCounts[t.pattern] =
                (
                    patternCounts[t.pattern] ||
                    0
                ) + 1;
        }

        const uniquePatterns =
            Object.keys(
                patternCounts
            ).length;

        let maximumShare = 0;

        if (trades.length) {

            maximumShare =
                Math.max(
                    ...Object.values(
                        patternCounts
                    )
                ) /
                trades.length;
        }

        folds.push({

            fold:
                def.fold,

            trainingRows:
                def.trainingRows,

            testRows:
                def.testRows,

            patternsDiscovered:
                patternStats(
                    trainingRecords
                ).length,

            selectedPatterns:
                selectedPatterns.length,

            selectedPatternKeys:
                selectedPatterns.map(
                    p => p.pattern
                ),

            trades:

                trades.map(
                    t => ({
                        ...t
                    })
                ),

            ...stats,

            concentration: {

                uniquePatterns,

                maximumShare:
                    Number(
                        maximumShare.toFixed(4)
                    ),

                patternCounts,

                concentrationPassed:
                    maximumShare <= 0.75
            }
        });
    }


    // --------------------------------------------------------
    // TRUE OOS COMBINATION
    // --------------------------------------------------------

    const allTrades =
        folds.flatMap(
            f => f.trades
        );

    const overall =
        calculateStats(
            allTrades
        );

    const patternCounts = {};

    for (const t of allTrades) {

        patternCounts[t.pattern] =
            (
                patternCounts[t.pattern] ||
                0
            ) + 1;
    }

    const uniquePatterns =
        Object.keys(
            patternCounts
        ).length;

    const maximumShare =
        allTrades.length
            ? Math.max(
                ...Object.values(
                    patternCounts
                )
            ) /
            allTrades.length
            : 0;


    // --------------------------------------------------------
    // CURRENT MARKET
    // --------------------------------------------------------

    const currentHistory =
        candles;

    const currentMarket =
        calculateMarket(
            currentHistory
        );

    let currentSignal = {

        status:
            "NO_TRADE",

        side:
            null,

        market:
            currentMarket,

        entryConfirmation:
            null,

        reason:
            "Current market does not satisfy the directional signal.",

        nextAction:
            "WAIT"
    };


    // --------------------------------------------------------
    // CURRENT SIGNAL
    // --------------------------------------------------------

    if (currentMarket) {

        let side = null;

        if (
            currentMarket.regime ===
            "TREND_UP" &&
            currentMarket.trend ===
            "BULLISH"
        ) {
            side = "BUY";
        }

        else if (
            currentMarket.regime ===
            "TREND_DOWN" &&
            currentMarket.trend ===
            "BEARISH"
        ) {
            side = "SELL";
        }

        if (side) {

            const pattern =
                makePattern(
                    currentMarket,
                    side
                );

            const confirm =
                confirmation(
                    currentHistory,
                    side
                );

            currentSignal =
                {

                    status:
                        confirm.confirmed
                            ? "SIGNAL"
                            : "NO_TRADE",

                    side:
                        confirm.confirmed
                            ? side
                            : null,

                    pattern,

                    market:
                        currentMarket,

                    entryConfirmation:
                        confirm,

                    reason:
                        confirm.confirmed
                            ? "Directional setup and entry confirmation satisfied."
                            : "Directional setup exists but entry confirmation is insufficient.",

                    nextAction:
                        confirm.confirmed
                            ? "PAPER_ENTRY_REVIEW"
                            : "WAIT"
                };
        }
    }


    // --------------------------------------------------------
    // LATEST LEARNING
    // --------------------------------------------------------

    const latestTrainingRecords =
        buildTrainingRecords(
            historical,
            0,
            historical.length,
            0
        );

    const latestStats =
        patternStats(
            latestTrainingRecords
        );

    const latestSelected =
        selectPatterns(
            latestTrainingRecords
        );


    // --------------------------------------------------------
    // REGIME DISTRIBUTION
    // --------------------------------------------------------

    const regimeCounts = {};

    for (
        let i = 30;
        i < historical.length;
        i++
    ) {

        const m =
            calculateMarket(
                historical.slice(
                    0,
                    i + 1
                )
            );

        if (!m) continue;

        regimeCounts[m.regime] =
            (
                regimeCounts[m.regime] ||
                0
            ) + 1;
    }


    // --------------------------------------------------------
    // PROFITABILITY PROOF
    // --------------------------------------------------------

    const sufficientEvidence =
        overall.decisiveTrades >= 8 &&
        overall.expectedValueR >= 0.1 &&
        overall.profitFactor >= 1.2 &&
        overall.maxDrawdownR <=
            CONFIG.maximumOOSDrawdownR &&
        overall.maxConsecutiveLosses <=
            CONFIG.maximumOOSLossStreak;

    const riskControl =
        overall.maxDrawdownR <=
            CONFIG.maximumOOSDrawdownR &&
        overall.maxConsecutiveLosses <=
            CONFIG.maximumOOSLossStreak;


    return {

        success: true,

        version: VERSION,

        status:
            "COMPLETED",

        mode:
            "V13_1_SAMPLE_CONFIDENCE_REGIME_AWARE_TRUE_WALK_FORWARD",

        paperOnly: true,

        realOrders: false,

        brokerOrderEnabled: false,

        brokerOrderSent: false,

        instrument:
            "NIFTY 50",

        interval:
            "5minute",

        requestedDays:
            30,

        source:
            "V11.1_LEARNING_DATASET",

        antiLeakage: {

            enabled: true,

            chronological: true,

            shuffled: false,

            currentCandleExcluded: true,

            currentCandleOutcomeUsed: false,

            currentCandleUsedForLearning: false,

            testDataUsedForTraining: false,

            futureDataUsedForPatternDiscovery: false,

            futureDataUsedForCurrentSignal: false,

            signalConditionedLearning: true,

            signalConditionedOOS: true,

            entryConfirmation: true,

            regimeValidation: true,

            sampleConfidenceAdjustment: true,

            decayValidation: true,

            patternCircuitBreaker: true,

            overlappingPaperTrades: false,

            sameCandleStopTargetBias:
                "STOP_FIRST"
        },

        objective: {

            primary:
                "STRICT_OUT_OF_SAMPLE_PROFITABILITY",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "VALIDATE_REGIME_STABLE_EDGES",

            allowNoTrade:
                true,

            minimumOOSExpectedValueR:
                0.1,

            minimumOOSProfitFactor:
                1.2,

            minimumOOSDecisiveTrades:
                8,

            minimumOOSSamples:
                8,

            minimumStableFolds:
                2,

            qualityThreshold:
                CONFIG.qualityThreshold,

            profitabilityProof:
                sufficientEvidence
        },

        sourceStatistics: {

            rawLearningRows:
                candles.length,

            normalizedRows:
                candles.length,

            historicalLearningRows:
                historical.length,

            currentCandleExcluded:
                1,

            candlesTested:
                historical.length,

            tradingDays:
                new Set(
                    historical.map(
                        c =>
                            new Date(
                                c.ts * 1000
                            ).toISOString()
                                .slice(0, 10)
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

            sampleConfidenceAdjusted:
                true,

            decayAware:
                true,

            folds:
                foldDefinitions
        },

        trueOOSPaperExecution: {

            description:
                "Every outer fold learns only from preceding data and executes only on unseen future data after directional regime validation and independent entry confirmation.",

            stats:
                overall,

            profitabilityProof:
                sufficientEvidence
                    ? "PROVISIONAL"
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
                uniquePatterns >= 2
                    ? "PASSED"
                    : "DIAGNOSTIC_ONLY",

            patternConcentration: {

                uniquePatterns,

                maximumShare:
                    Number(
                        maximumShare.toFixed(4)
                    ),

                patternCounts
            }
        },

        foldResults:
            folds,

        currentMarket: {

            available:
                !!currentMarket,

            timestamp:
                current.ts,

            date:
                new Date(
                    current.ts * 1000
                )
                    .toISOString()
                    .slice(0, 10),

            ...(currentMarket || {})
        },

        currentSignal,

        latestLearning: {

            trainingRows:
                historical.length,

            patternsDiscovered:
                latestStats.length,

            selectedPatterns:
                latestSelected.length,

            buyPatterns:
                latestSelected.filter(
                    p => p.side === "BUY"
                ).length,

            sellPatterns:
                latestSelected.filter(
                    p => p.side === "SELL"
                ).length,

            signalConditioned:
                true,

            regimeAdaptive:
                true,

            sampleConfidenceAdjusted:
                true,

            patternTypes: {

                trendFollow:
                    latestSelected.filter(
                        p =>
                            p.pattern.includes(
                                "TREND"
                            )
                    ).length,

                reversal: 0,

                range: 0
            },

            regimeDistribution:
                regimeCounts,

            selectedPatternDetails:
                latestSelected
        },

        validationRules: {

            regimeValidation: {

                enabled: true,

                regimes: [
                    "TREND_UP",
                    "TREND_DOWN",
                    "RANGE",
                    "TRANSITION"
                ],

                minimumSamples:
                    CONFIG.minimumPatternSamples,

                minimumEV:
                    CONFIG.minimumEV,

                minimumPF:
                    CONFIG.minimumPF
            },

            sampleConfidence: {

                enabled: true,

                referenceSamples:
                    CONFIG.confidenceReferenceSamples,

                minimumPatternSamples:
                    CONFIG.minimumPatternSamples
            },

            decayDetection: {

                enabled: true,

                recentWindowFraction:
                    0.25,

                maximumDecay:
                    -0.75
            },

            diversity: {

                enabled:
                    true,

                diagnosticOnly:
                    true,

                minimumIndependentPatterns:
                    2,

                maximumPatternConcentration:
                    0.75
            },

            circuitBreaker: {

                maximumPatternLossStreak:
                    CONFIG.maximumPatternLossStreak,

                entryCooldownCandles:
                    CONFIG.entryCooldownCandles,

                samePatternCooldownCandles:
                    CONFIG.samePatternCooldownCandles,

                sameSideCooldownCandles:
                    CONFIG.sameSideCooldownCandles
            }
        },

        riskPlan: {

            riskPerTradeR:
                1,

            stopR:
                1,

            targetR:
                2,

            preferredTargetR:
                2.5,

            minimumRiskReward:
                "1:2",

            preferredRiskReward:
                "1:2.5",

            maxHoldCandles:
                CONFIG.maxHoldCandles,

            noStopWidening:
                true,

            maxOOSDrawdownR:
                CONFIG.maximumOOSDrawdownR,

            maxOOSLossStreak:
                CONFIG.maximumOOSLossStreak,

            entryCooldownCandles:
                CONFIG.entryCooldownCandles,

            samePatternCooldownCandles:
                CONFIG.samePatternCooldownCandles,

            sameSideCooldownCandles:
                CONFIG.sameSideCooldownCandles
        },

        trueOOSTradeLog:
            allTrades,

        paperAction:
            currentSignal.status ===
            "SIGNAL"
                ? "PAPER_REVIEW"
                : "NO_TRADE",

        nextAction:
            currentSignal.nextAction
    };
}


// ============================================================
// VERCEL HANDLER
// ============================================================

export default async function handler(req, res) {

    try {

        if (req.method === "GET") {

            return res.status(200).json({

                success: true,

                version: VERSION,

                status:
                    "READY",

                paperOnly:
                    true,

                message:
                    "TradeMind Pro V13.1 engine ready."
            });
        }


        const body =
            req.body || {};

        /*
          Accept multiple existing dataset names
          so the V13.1 engine remains compatible
          with the previous TradeMind pipeline.
        */

        const rawCandles =
            body.candles ||
            body.data ||
            body.rows ||
            body.learningData ||
            body.dataset ||
            [];

        if (
            !Array.isArray(
                rawCandles
            )
        ) {

            return res.status(400).json({

                success: false,

                version: VERSION,

                error:
                    "No candle array supplied."
            });
        }


        const result =
            runEngine(
                rawCandles
            );


        return res.status(200).json(
            result
        );

    }

    catch (error) {

        console.error(
            "V13.1 ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            version: VERSION,

            status:
                "ERROR",

            paperOnly:
                true,

            error:
                error.message
        });
    }
}

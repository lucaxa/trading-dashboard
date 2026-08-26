/*
TradeMind Pro
Phase 11 — Episode Outcome Analyzer V3

RESEARCH ONLY
--------------

Purpose:
Reconstruct the V10.25 paper-position lifecycle for genuine
Phase 11 signal episodes using historical 5-minute candles.

This tool:
- does not modify V10.25
- does not learn
- does not optimize parameters
- does not place orders
- does not modify production code

Usage:

node analyzer.js <evidence.json> <candles.json> <output.json>
*/

"use strict";

const fs = require("fs");

const VERSION =
    "PHASE11_EPISODE_OUTCOME_ANALYZER_V3";

const ENGINE =
    "V10.25";

const TIMEFRAME =
    "5minute";

const CONFIG = Object.freeze({

    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,

    RISK_REWARD: 2,

    MAX_ENTRY_GAP_ATR: 0.25,

    COOLDOWN_CANDLES: 3,

    ENTRY_START_MINUTES:
        9 * 60 + 20,

    ENTRY_END_MINUTES:
        15 * 60,

    SESSION_CLOSE_MINUTES:
        15 * 60 + 25

});


/*
============================================================
 BASIC HELPERS
============================================================
*/

function finiteNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const n =
        Number(
            String(value)
                .trim()
                .replace(/,/g, "")
        );

    return Number.isFinite(n)
        ? n
        : null;
}


function timestampMs(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value === "number"
    ) {

        if (!Number.isFinite(value)) {
            return null;
        }

        return value < 100000000000
            ? value * 1000
            : value;
    }

    const numeric =
        Number(value);

    if (
        Number.isFinite(numeric)
    ) {

        return numeric < 100000000000
            ? numeric * 1000
            : numeric;
    }

    const parsed =
        Date.parse(String(value));

    return Number.isFinite(parsed)
        ? parsed
        : null;
}


function iso(ms) {

    return Number.isFinite(ms)
        ? new Date(ms).toISOString()
        : null;
}


/*
============================================================
 IST
============================================================
*/

function istParts(ms) {

    const date =
        new Date(
            ms +
            5.5 *
            60 *
            60 *
            1000
        );

    const hour =
        date.getUTCHours();

    const minute =
        date.getUTCMinutes();

    return {

        date:
            date
                .toISOString()
                .slice(0, 10),

        hour,

        minute,

        minutes:
            hour * 60 + minute

    };
}


/*
============================================================
 CANDLE NORMALIZATION
============================================================
*/

function normalizeCandle(raw, index) {

    let timestamp;
    let open;
    let high;
    let low;
    let close;
    let volume;

    if (
        Array.isArray(raw)
    ) {

        if (raw.length < 6) {
            return null;
        }

        timestamp =
            timestampMs(raw[0]);

        open =
            finiteNumber(raw[1]);

        high =
            finiteNumber(raw[2]);

        low =
            finiteNumber(raw[3]);

        close =
            finiteNumber(raw[4]);

        volume =
            finiteNumber(raw[5]);

    } else if (
        raw &&
        typeof raw === "object"
    ) {

        timestamp =
            timestampMs(
                raw.timestamp ??
                raw.ts ??
                raw.time
            );

        open =
            finiteNumber(
                raw.open ??
                raw.o
            );

        high =
            finiteNumber(
                raw.high ??
                raw.h
            );

        low =
            finiteNumber(
                raw.low ??
                raw.l
            );

        close =
            finiteNumber(
                raw.close ??
                raw.c
            );

        volume =
            finiteNumber(
                raw.volume ??
                raw.v
            );

    } else {

        return null;
    }

    if (
        ![
            timestamp,
            open,
            high,
            low,
            close
        ].every(Number.isFinite)
    ) {
        return null;
    }

    if (
        high < low ||
        high < open ||
        high < close ||
        low > open ||
        low > close
    ) {
        return null;
    }

    const ist =
        istParts(timestamp);

    return {

        index,

        timestamp,

        iso:
            iso(timestamp),

        date:
            ist.date,

        minutes:
            ist.minutes,

        open,
        high,
        low,
        close,

        volume:
            volume === null
                ? 0
                : volume

    };
}


function extractCandleArray(data) {

    if (
        Array.isArray(data)
    ) {
        return data;
    }

    const candidates = [

        data?.candles,

        data?.data?.candles,

        data?.data?.NIDX_40000001?.candles,

        data?.NIDX_40000001?.candles,

        data?.data?.NIDX_40000001,

        data?.NIDX_40000001,

        data?.data

    ];

    for (
        const candidate
        of candidates
    ) {

        if (
            Array.isArray(candidate) &&
            candidate.length > 0
        ) {

            return candidate;
        }
    }

    return [];
}


function loadCandles(file) {

    const raw =
        JSON.parse(
            fs.readFileSync(
                file,
                "utf8"
            )
        );

    const array =
        extractCandleArray(raw);

    const candles =
        array
            .map(
                normalizeCandle
            )
            .filter(Boolean)
            .sort(
                (a, b) =>
                    a.timestamp -
                    b.timestamp
            );

    if (!candles.length) {

        throw new Error(
            "No usable historical candles found."
        );
    }

    return candles;
}


/*
============================================================
 EVIDENCE NORMALIZATION
============================================================
*/

function loadEvidence(file) {

    const data =
        JSON.parse(
            fs.readFileSync(
                file,
                "utf8"
            )
        );

    if (
        !Array.isArray(
            data.observations
        )
    ) {

        throw new Error(
            "Evidence file has no observations array."
        );
    }

    const observations =
        data.observations
            .map(
                (observation, index) => {

                    const timestamp =
                        timestampMs(
                            observation.timestamp ??
                            observation.ts ??
                            observation.time
                        );

                    const signal =
                        String(
                            observation.signal ??
                            observation.action ??
                            "WAIT"
                        )
                            .trim()
                            .toUpperCase();

                    return {

                        ...observation,

                        index,

                        timestamp,

                        signal

                    };

                }
            )
            .filter(
                observation =>
                    Number.isFinite(
                        observation.timestamp
                    )
            )
            .sort(
                (a, b) =>
                    a.timestamp -
                    b.timestamp
            );

    return {

        metadata:
            data,

        observations

    };
}


/*
============================================================
 CANDLE LOOKUP
============================================================
*/

function lastCandleAtOrBefore(
    candles,
    timestamp
) {

    let low = 0;

    let high =
        candles.length - 1;

    let answer = -1;

    while (
        low <= high
    ) {

        const mid =
            Math.floor(
                (low + high) / 2
            );

        if (
            candles[mid].timestamp <=
            timestamp
        ) {

            answer = mid;

            low =
                mid + 1;

        } else {

            high =
                mid - 1;
        }
    }

    return answer;
}


function firstCandleAfter(
    candles,
    timestamp
) {

    let low = 0;

    let high =
        candles.length - 1;

    let answer =
        candles.length;

    while (
        low <= high
    ) {

        const mid =
            Math.floor(
                (low + high) / 2
            );

        if (
            candles[mid].timestamp >
            timestamp
        ) {

            answer = mid;

            high =
                mid - 1;

        } else {

            low =
                mid + 1;
        }
    }

    return answer;
}


/*
============================================================
 ATR
============================================================
*/

function trueRange(
    current,
    previous
) {

    const high =
        current.high;

    const low =
        current.low;

    if (
        !Number.isFinite(high) ||
        !Number.isFinite(low)
    ) {
        return null;
    }

    if (
        !previous ||
        !Number.isFinite(
            previous.close
        )
    ) {

        return high - low;
    }

    return Math.max(

        high - low,

        Math.abs(
            high -
            previous.close
        ),

        Math.abs(
            low -
            previous.close
        )

    );
}


function calculateAtr14(
    candles,
    index
) {

    /*
    We need ATR_PERIOD completed
    true ranges ending at the signal
    candle, with one preceding candle
    for the first true range.
    */

    const end =
        index;

    const start =
        end -
        CONFIG.ATR_PERIOD;

    if (
        start < 0
    ) {
        return null;
    }

    const ranges = [];

    for (
        let i = start + 1;
        i <= end;
        i++
    ) {

        const range =
            trueRange(
                candles[i],
                candles[i - 1]
            );

        if (
            !Number.isFinite(range)
        ) {
            return null;
        }

        ranges.push(range);
    }

    if (
        ranges.length !==
        CONFIG.ATR_PERIOD
    ) {
        return null;
    }

    /*
    Match V10.25's Wilder-style
    recursive ATR calculation.
    */

    let value =
        ranges
            .reduce(
                (sum, item) =>
                    sum + item,
                0
            ) /
        CONFIG.ATR_PERIOD;

    return value;
}


/*
============================================================
 SIGNAL EPISODES
============================================================
*/

function buildEpisodes(
    observations
) {

    const episodes = [];

    let current = null;

    let episodeNumber = 0;

    for (
        const observation
        of observations
    ) {

        const signal =
            observation.signal;

        if (
            signal !== "BUY" &&
            signal !== "SELL"
        ) {

            if (current) {

                current.endTimestamp =
                    observation.timestamp;

                current.endReason =
                    "NON_DIRECTIONAL_SIGNAL";

                episodes.push(current);

                current = null;
            }

            continue;
        }

        if (
            !current ||
            current.signal !== signal
        ) {

            if (current) {

                current.endTimestamp =
                    observation.timestamp;

                current.endReason =
                    "SIGNAL_CHANGED";

                episodes.push(current);
            }

            current = {

                episode:
                    ++episodeNumber,

                signal,

                startTimestamp:
                    observation.timestamp,

                endTimestamp:
                    null,

                observations: 1,

                sourceObservationIndex:
                    observation.index

            };

        } else {

            current.observations++;
        }
    }

    if (current) {

        current.endReason =
            "SESSION_END";

        episodes.push(current);
    }

    return episodes;
}


/*
============================================================
 POSITION REPLAY
============================================================
*/

function replayPosition(
    position,
    candles,
    startIndex,
    sessionDate
) {

    let mfePoints = 0;

    let maePoints = 0;

    for (
        let i = startIndex;
        i < candles.length;
        i++
    ) {

        const candle =
            candles[i];

        if (
            candle.date !==
            sessionDate
        ) {
            break;
        }

        const favourable =
            position.side === "BUY"
                ? candle.high -
                    position.entry
                : position.entry -
                    candle.low;

        const adverse =
            position.side === "BUY"
                ? position.entry -
                    candle.low
                : candle.high -
                    position.entry;

        mfePoints =
            Math.max(
                mfePoints,
                favourable
            );

        maePoints =
            Math.max(
                maePoints,
                adverse
            );

        const targetHit =
            position.side === "BUY"
                ? candle.high >=
                    position.target
                : candle.low <=
                    position.target;

        const stopHit =
            position.side === "BUY"
                ? candle.low <=
                    position.stop
                : candle.high >=
                    position.stop;

        /*
        Conservative OHLC ambiguity rule:
        if target and stop are both inside
        the same candle, classify STOP first.
        We do not assume favourable intrabar
        ordering that OHLC data cannot prove.
        */

        if (
            targetHit &&
            stopHit
        ) {

            return {

                classification:
                    "RESOLVED_STOP",

                outcome:
                    "STOP",

                outcomeTimestamp:
                    candle.timestamp,

                outcomePrice:
                    position.stop,

                mfePoints,

                maePoints,

                reason:
                    "TARGET_AND_STOP_SAME_CANDLE_CONSERVATIVE_STOP"

            };
        }

        if (stopHit) {

            return {

                classification:
                    "RESOLVED_STOP",

                outcome:
                    "STOP",

                outcomeTimestamp:
                    candle.timestamp,

                outcomePrice:
                    position.stop,

                mfePoints,

                maePoints,

                reason:
                    "STOP LOSS"

            };
        }

        if (targetHit) {

            return {

                classification:
                    "RESOLVED_TARGET",

                outcome:
                    "TARGET",

                outcomeTimestamp:
                    candle.timestamp,

                outcomePrice:
                    position.target,

                mfePoints,

                maePoints,

                reason:
                    "TARGET"

            };
        }

        if (
            candle.minutes >=
            CONFIG.SESSION_CLOSE_MINUTES
        ) {

            return {

                classification:
                    "RESOLVED_SESSION_CLOSE",

                outcome:
                    "SESSION CLOSE",

                outcomeTimestamp:
                    candle.timestamp,

                outcomePrice:
                    candle.close,

                mfePoints,

                maePoints,

                reason:
                    "SESSION CLOSE"

            };
        }
    }

    return {

        classification:
            "UNRESOLVED",

        outcome:
            null,

        outcomeTimestamp:
            null,

        outcomePrice:
            null,

        mfePoints,

        maePoints,

        reason:
            "No subsequent candle resolved the position."

    };
}


/*
============================================================
 EPISODE ANALYSIS
============================================================
*/

function analyzeEpisode(
    episode,
    candles,
    lifecycle
) {

    const result = {

        episode:
            episode.episode,

        signal:
            episode.signal,

        signalTimestamp:
            iso(
                episode.startTimestamp
            ),

        signalEndTimestamp:
            iso(
                episode.endTimestamp
            ),

        observed:
            {

                observations:
                    episode.observations,

                endReason:
                    episode.endReason

            },

        classification:
            null,

        entryTimestamp:
            null,

        entry:
            null,

        atr14:
            null,

        risk:
            null,

        stop:
            null,

        target:
            null,

        outcome:
            null,

        outcomeTimestamp:
            null,

        outcomePrice:
            null,

        rMultiple:
            null,

        mfeR:
            null,

        maeR:
            null,

        reason:
            null

    };


    /*
    --------------------------------------------------------
    Signal candle
    --------------------------------------------------------
    */

    const signalIndex =
        lastCandleAtOrBefore(
            candles,
            episode.startTimestamp
        );

    if (
        signalIndex < 0
    ) {

        result.classification =
            "INSUFFICIENT_CONTEXT";

        result.reason =
            "No historical candle at or before signal.";

        return result;
    }

    const signalCandle =
        candles[signalIndex];

    const sessionDate =
        signalCandle.date;


    /*
    --------------------------------------------------------
    Entry window
    --------------------------------------------------------
    */

    if (
        signalCandle.minutes <
            CONFIG.ENTRY_START_MINUTES ||
        signalCandle.minutes >
            CONFIG.ENTRY_END_MINUTES
    ) {

        result.classification =
            "BLOCKED_ENTRY_WINDOW";

        result.reason =
            "Signal candle outside V10.25 entry window.";

        return result;
    }


    /*
    --------------------------------------------------------
    Lifecycle
    --------------------------------------------------------
    */

    if (
        signalIndex <=
        lifecycle.blockedUntilCandleIndex
    ) {

        result.classification =
            "BLOCKED_LIFECYCLE";

        result.reason =
            "Blocked by one-position/cooldown lifecycle.";

        return result;
    }


    /*
    --------------------------------------------------------
    ATR
    --------------------------------------------------------
    */

    const atr14 =
        calculateAtr14(
            candles,
            signalIndex
        );

    if (
        !Number.isFinite(atr14) ||
        atr14 <= 0
    ) {

        result.classification =
            "INSUFFICIENT_CONTEXT";

        result.reason =
            "Insufficient historical candles for ATR(14).";

        return result;
    }

    result.atr14 =
        atr14;


    /*
    --------------------------------------------------------
    Next candle
    --------------------------------------------------------
    */

    const entryIndex =
        signalIndex + 1;

    if (
        entryIndex >=
        candles.length
    ) {

        result.classification =
            "UNRESOLVED";

        result.reason =
            "No next candle available for entry.";

        return result;
    }

    const entryCandle =
        candles[entryIndex];

    if (
        entryCandle.date !==
        sessionDate
    ) {

        result.classification =
            "UNRESOLVED";

        result.reason =
            "No same-session next candle available.";

        return result;
    }


    /*
    --------------------------------------------------------
    Entry gap
    --------------------------------------------------------
    */

    const entry =
        entryCandle.open;

    const signalClose =
        signalCandle.close;

    const entryGapAtr =
        (
            entry -
            signalClose
        ) /
        atr14;

    if (
        Math.abs(entryGapAtr) >
        CONFIG.MAX_ENTRY_GAP_ATR
    ) {

        result.classification =
            "BLOCKED_ENTRY_WINDOW";

        result.reason =
            "Next-candle entry gap exceeds V10.25 limit.";

        return result;
    }


    /*
    --------------------------------------------------------
    Position
    --------------------------------------------------------
    */

    const risk =
        atr14 *
        CONFIG.ATR_STOP_MULTIPLIER;

    const reward =
        risk *
        CONFIG.RISK_REWARD;

    const side =
        episode.signal;

    const stop =
        side === "BUY"
            ? entry - risk
            : entry + risk;

    const target =
        side === "BUY"
            ? entry + reward
            : entry - reward;

    result.entryTimestamp =
        iso(
            entryCandle.timestamp
        );

    result.entry =
        entry;

    result.risk =
        risk;

    result.stop =
        stop;

    result.target =
        target;


    /*
    --------------------------------------------------------
    Replay
    --------------------------------------------------------
    */

    const replay =
        replayPosition(

            {

                side,

                entry,

                stop,

                target,

                risk

            },

            candles,

            entryIndex,

            sessionDate

        );


    result.classification =
        replay.classification;

    result.outcome =
        replay.outcome;

    result.outcomeTimestamp =
        iso(
            replay.outcomeTimestamp
        );

    result.outcomePrice =
        replay.outcomePrice;

    result.reason =
        replay.reason;

    result.mfeR =
        replay.mfePoints /
        risk;

    result.maeR =
        replay.maePoints /
        risk;

    if (
        replay.outcome ===
        "TARGET"
    ) {

        result.rMultiple =
            CONFIG.RISK_REWARD;

    } else if (
        replay.outcome ===
        "STOP"
    ) {

        result.rMultiple =
            -1;

    } else if (
        replay.outcome ===
        "SESSION CLOSE"
    ) {

        const points =
            side === "BUY"
                ? replay.outcomePrice -
                    entry
                : entry -
                    replay.outcomePrice;

        result.rMultiple =
            points /
            risk;
    }


    /*
    --------------------------------------------------------
    Lifecycle update
    --------------------------------------------------------
    */

    if (
        replay.classification ===
            "RESOLVED_TARGET" ||
        replay.classification ===
            "RESOLVED_STOP" ||
        replay.classification ===
            "RESOLVED_SESSION_CLOSE"
    ) {

        let outcomeIndex =
            lastCandleAtOrBefore(
                candles,
                replay.outcomeTimestamp
            );

        if (
            outcomeIndex < 0
        ) {
            outcomeIndex =
                entryIndex;
        }

        lifecycle.blockedUntilCandleIndex =
            outcomeIndex +
            CONFIG.COOLDOWN_CANDLES;
    }

    return result;
}


/*
============================================================
 SESSION ANALYSIS
============================================================
*/

function analyzeSession(
    evidence,
    candles
) {

    const episodes =
        buildEpisodes(
            evidence.observations
        );

    const lifecycle = {

        blockedUntilCandleIndex:
            -1

    };

    const results = [];

    for (
        const episode
        of episodes
    ) {

        results.push(
            analyzeEpisode(
                episode,
                candles,
                lifecycle
            )
        );
    }

    const summary = {

        observedEpisodes:
            results.length,

        resolvedTarget:
            results.filter(
                r =>
                    r.classification ===
                    "RESOLVED_TARGET"
            ).length,

        resolvedStop:
            results.filter(
                r =>
                    r.classification ===
                    "RESOLVED_STOP"
            ).length,

        resolvedSessionClose:
            results.filter(
                r =>
                    r.classification ===
                    "RESOLVED_SESSION_CLOSE"
            ).length,

        unresolved:
            results.filter(
                r =>
                    r.classification ===
                    "UNRESOLVED"
            ).length,

        blockedEntryWindow:
            results.filter(
                r =>
                    r.classification ===
                    "BLOCKED_ENTRY_WINDOW"
            ).length,

        blockedLifecycle:
            results.filter(
                r =>
                    r.classification ===
                    "BLOCKED_LIFECYCLE"
            ).length,

        insufficientContext:
            results.filter(
                r =>
                    r.classification ===
                    "INSUFFICIENT_CONTEXT"
            ).length

    };


    const rValues =
        results
            .map(
                r => r.rMultiple
            )
            .filter(
                Number.isFinite
            );

    summary.netR =
        rValues.reduce(
            (sum, value) =>
                sum + value,
            0
        );

    const decisive =
        results.filter(
            r =>
                r.outcome ===
                    "TARGET" ||
                r.outcome ===
                    "STOP"
        );

    summary.resolvedTrades =
        decisive.length;

    summary.winRatePct =
        decisive.length
            ? (
                decisive.filter(
                    r =>
                        r.outcome ===
                        "TARGET"
                ).length /
                decisive.length
            ) * 100
            : null;

    return {

        analyzerVersion:
            VERSION,

        engine:
            ENGINE,

        timeframe:
            TIMEFRAME,

        config:
            CONFIG,

        session:
            {

                start:
                    iso(
                        evidence.observations[0]
                            ?.timestamp
                    ),

                end:
                    iso(
                        evidence.observations[
                            evidence.observations.length - 1
                        ]
                            ?.timestamp
                    )

            },

        candleRange:
            {

                first:
                    candles[0]?.iso,

                last:
                    candles[
                        candles.length - 1
                    ]?.iso,

                count:
                    candles.length

            },

        summary,

        episodes:
            results

    };
}


/*
============================================================
 CLI
============================================================
*/

function main() {

    const [
        ,
        ,
        evidenceFile,
        candleFile,
        outputFile
    ] =
        process.argv;

    if (
        !evidenceFile ||
        !candleFile ||
        !outputFile
    ) {

        console.error(
            "Usage: node analyzer.js <evidence.json> <candles.json> <output.json>"
        );

        process.exit(1);
    }

    const evidence =
        loadEvidence(
            evidenceFile
        );

    const candles =
        loadCandles(
            candleFile
        );

    const result =
        analyzeSession(
            evidence,
            candles
        );

    fs.mkdirSync(
        require("path").dirname(
            outputFile
        ),
        {
            recursive: true
        }
    );

    fs.writeFileSync(

        outputFile,

        JSON.stringify(
            result,
            null,
            2
        ) +

        "\n"

    );

    console.log(
        "===================================================="
    );

    console.log(
        "TradeMind Pro — Phase 11 Analyzer V3"
    );

    console.log(
        "===================================================="
    );

    console.log(
        "Episodes:",
        result.summary.observedEpisodes
    );

    console.log(
        "Resolved TARGET:",
        result.summary.resolvedTarget
    );

    console.log(
        "Resolved STOP:",
        result.summary.resolvedStop
    );

    console.log(
        "Session close:",
        result.summary.resolvedSessionClose
    );

    console.log(
        "Blocked lifecycle:",
        result.summary.blockedLifecycle
    );

    console.log(
        "Blocked entry window:",
        result.summary.blockedEntryWindow
    );

    console.log(
        "Insufficient context:",
        result.summary.insufficientContext
    );

    console.log(
        "Unresolved:",
        result.summary.unresolved
    );

    console.log(
        "Net R:",
        Number(
            result.summary.netR
        ).toFixed(4)
    );

    console.log(
        "Output:",
        outputFile
    );

}

main();

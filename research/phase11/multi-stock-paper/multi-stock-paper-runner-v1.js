/*
============================================================
TradeMind Pro

A11 Multi-Stock Paper Runner V1

Purpose:

Execute the frozen V10.25 paper-trading contract independently
for each instrument in the A11 four-stock universe.

This module:
- consumes Component 4 signal evaluations
- uses Component 2 independent state
- creates paper entries only
- manages paper positions only
- applies frozen V10.25 execution rules
- preserves independent stock state

This module does NOT:
- modify V10.20
- modify V10.25
- call brokers
- create real orders
- learn
- optimize
- mutate strategy
- promote anything
============================================================
*/

import {
    CONFIG
} from "../../../api/backtest.js";

import {
    getStockState,
    startStockSession,
    recordStockObservation,
    recordStockPaperEntry,
    recordStockOutcome,
    setStockCooldown,
    decrementStockCooldown
} from "./multi-stock-state-v1.js";


export const MULTI_STOCK_PAPER_RUNNER_VERSION =
    "A11-MULTI-STOCK-PAPER-RUNNER-V1";


const PAPER_SAFETY = {
    mode: "PAPER_ONLY",
    researchOnly: true,
    tradingEnabled: false,
    brokerCalled: false,
    orderCreationEnabled: false,
    learningEnabled: false,
    strategyMutation: false,
    optimizationEnabled: false,
    promotionEnabled: false
};


function assertSafety() {

    for (
        const [key, value]
        of Object.entries(PAPER_SAFETY)
    ) {

        if (
            key === "mode"
        ) {

            if (
                value !== "PAPER_ONLY"
            ) {
                throw new Error(
                    "Paper runner safety violation"
                );
            }

            continue;
        }

        if (
            value !== false &&
            (
                key !== "researchOnly"
            )
        ) {

            throw new Error(
                `Paper runner safety violation: ${key}`
            );
        }
    }
}


function normalizeSymbol(
    symbol
) {

    if (
        typeof symbol !== "string"
    ) {
        return null;
    }

    const clean =
        symbol
            .trim()
            .toUpperCase();

    return clean.length > 0
        ? clean
        : null;
}


function getSessionDate(
    timestamp
) {

    if (
        !Number.isFinite(timestamp)
    ) {
        return null;
    }

    const timestampMs =
        Math.abs(timestamp) < 1e12
            ? timestamp * 1000
            : timestamp;

    const date =
        new Date(timestampMs);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(date);
}


function getISTMinutes(
    timestamp
) {

    const date =
        new Date(timestamp);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    const parts =
        new Intl.DateTimeFormat(
            "en-GB",
            {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23"
            }
        ).formatToParts(date);

    const hour =
        Number(
            parts.find(
                part =>
                    part.type === "hour"
            )?.value
        );

    const minute =
        Number(
            parts.find(
                part =>
                    part.type === "minute"
            )?.value
        );

    if (
        !Number.isFinite(hour) ||
        !Number.isFinite(minute)
    ) {
        return null;
    }

    return (
        hour * 60 +
        minute
    );
}


function normalizeCandles(
    candles
) {

    if (
        !Array.isArray(candles)
    ) {
        return [];
    }

    return candles
        .map(
            candle => ({
                ts: Number(candle?.ts),
                o: Number(candle?.o),
                h: Number(candle?.h),
                l: Number(candle?.l),
                c: Number(candle?.c)
            })
        )
        .filter(
            candle =>
                Number.isFinite(candle.ts) &&
                Number.isFinite(candle.o) &&
                Number.isFinite(candle.h) &&
                Number.isFinite(candle.l) &&
                Number.isFinite(candle.c)
        )
        .sort(
            (a, b) =>
                a.ts - b.ts
        );
}


function findEntryCandle(
    candles,
    signalTimestamp
) {

    const signalIndex =
        candles.findIndex(
            candle =>
                candle.ts ===
                Number(signalTimestamp)
        );

    if (
        signalIndex < 0
    ) {
        return null;
    }

    const signalCandle =
        candles[signalIndex];

    const signalSession =
        getSessionDate(
            signalCandle.ts
        );

    for (
        let i = signalIndex + 1;
        i < candles.length;
        i++
    ) {

        const candidate =
            candles[i];

        if (
            getSessionDate(
                candidate.ts
            ) !== signalSession
        ) {
            return null;
        }

        return candidate;
    }

    return null;
}


function calculatePaperEntry(
    evaluation,
    candles
) {

    const signal =
        evaluation?.signal;

    if (
        signal !== "BUY" &&
        signal !== "SELL"
    ) {

        return {
            status: "NO_ENTRY",
            reason: "NO_EXECUTABLE_SIGNAL"
        };
    }

    const signalTimestamp =
        Number(
            evaluation?.candle?.ts ??
            evaluation?.signalTimestamp
        );

    if (
        !Number.isFinite(
            signalTimestamp
        )
    ) {

        return {
            status: "NO_ENTRY",
            reason: "INVALID_SIGNAL_TIMESTAMP"
        };
    }

    const signalCandle =
        candles.find(
            candle =>
                candle.ts === signalTimestamp
        );

    if (
        !signalCandle
    ) {

        return {
            status: "NO_ENTRY",
            reason: "SIGNAL_CANDLE_NOT_FOUND"
        };
    }

    const atr =
        Number(
            evaluation?.indicators?.atr14 ??
            evaluation?.riskReference?.atr14
        );

    if (
        !Number.isFinite(atr) ||
        atr <= 0
    ) {

        return {
            status: "NO_ENTRY",
            reason: "INVALID_ATR"
        };
    }

    const minutes =
        getISTMinutes(
            signalTimestamp
        );

    if (
        minutes === null
    ) {

        return {
            status: "NO_ENTRY",
            reason: "INVALID_SESSION_TIME"
        };
    }

    if (
        minutes <
        CONFIG.ENTRY_START_MINUTES ||
        minutes >
        CONFIG.ENTRY_END_MINUTES
    ) {

        return {
            status: "NO_ENTRY",
            reason: "ENTRY_WINDOW_REJECTED"
        };
    }

    const entryCandle =
        findEntryCandle(
            candles,
            signalTimestamp
        );

    if (
        !entryCandle
    ) {

        return {
            status: "NO_ENTRY",
            reason: "NO_NEXT_SAME_SESSION_CANDLE"
        };
    }

    const entry =
        Number(
            entryCandle.o
        );

    if (
        !Number.isFinite(entry) ||
        entry <= 0
    ) {

        return {
            status: "NO_ENTRY",
            reason: "INVALID_ENTRY"
        };
    }

    const signalClose =
        Number(
            signalCandle.c
        );

    const actualEntryGapATR =
        (
            entry -
            signalClose
        ) / atr;

    if (
        Math.abs(
            actualEntryGapATR
        ) >
        CONFIG.MAX_ENTRY_GAP_ATR
    ) {

        return {
            status: "NO_ENTRY",
            reason: "ENTRY_GAP_REJECTED",
            actualEntryGapATR
        };
    }

    const risk =
        atr *
        CONFIG.ATR_STOP_MULTIPLIER;

    const reward =
        risk *
        CONFIG.RISK_REWARD;

    const side =
        signal === "BUY"
            ? "LONG"
            : "SHORT";

    const stop =
        signal === "BUY"
            ? entry - risk
            : entry + risk;

    const target =
        signal === "BUY"
            ? entry + reward
            : entry - reward;

    return {
        status: "ENTRY_ACCEPTED",
        side,
        entry,
        entryTimestamp: entryCandle.ts,
        stop,
        target,
        risk,
        reward,
        actualEntryGapATR,
        signalTimestamp
    };
}


function managePaperPosition(
    position,
    candle
) {

    if (
        !position?.active
    ) {
        return null;
    }

    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);

    if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low)
    ) {
        return null;
    }

    if (
        position.side === "LONG"
    ) {

        if (
            open <=
            position.stop
        ) {

            return {
                reason: "STOP LOSS - GAP",
                exit: open,
                exitTimestamp: candle.ts
            };
        }

        if (
            open >=
            position.target
        ) {

            return {
                reason: "TARGET - GAP",
                exit: open,
                exitTimestamp: candle.ts
            };
        }

        if (
            low <=
            position.stop
        ) {

            return {
                reason: "STOP LOSS",
                exit: position.stop,
                exitTimestamp: candle.ts
            };
        }

        if (
            high >=
            position.target
        ) {

            return {
                reason: "TARGET",
                exit: position.target,
                exitTimestamp: candle.ts
            };
        }
    }

    if (
        position.side === "SHORT"
    ) {

        if (
            open >=
            position.stop
        ) {

            return {
                reason: "STOP LOSS - GAP",
                exit: open,
                exitTimestamp: candle.ts
            };
        }

        if (
            open <=
            position.target
        ) {

            return {
                reason: "TARGET - GAP",
                exit: open,
                exitTimestamp: candle.ts
            };
        }

        if (
            high >=
            position.stop
        ) {

            return {
                reason: "STOP LOSS",
                exit: position.stop,
                exitTimestamp: candle.ts
            };
        }

        if (
            low <=
            position.target
        ) {

            return {
                reason: "TARGET",
                exit: position.target,
                exitTimestamp: candle.ts
            };
        }
    }

    return null;
}


function sessionClose(
    position,
    candle
) {

    return {
        reason: "SESSION CLOSE",
        exit: Number(candle.c),
        exitTimestamp: candle.ts
    };
}


function assertCompletedExecutionCandle(
    candle,
    nowMs
) {

    if (
        !candle
    ) {
        return false;
    }

    if (
        !Number.isFinite(
            candle.ts
        )
    ) {
        return false;
    }

    if (
        !Number.isFinite(
            nowMs
        )
    ) {
        return false;
    }

    return (
        candle.ts + 5 * 60 * 1000 <=
        nowMs
    );
}


export function runMultiStockPaperRunner(
    {
        state,
        evaluations = [],
        candlesBySymbol = {},
        nowMs = Date.now()
    } = {}
) {

    assertSafety();

    if (
        !state ||
        typeof state !== "object"
    ) {
        throw new Error(
            "state is required"
        );
    }

    if (
        !Array.isArray(evaluations)
    ) {
        throw new Error(
            "evaluations must be an array"
        );
    }

    const results = [];

    for (
        const evaluation
        of evaluations
    ) {

        const symbol =
            normalizeSymbol(
                evaluation?.symbol
            );

        if (!symbol) {
            results.push({
                symbol: null,
                status: "FAILED",
                reason: "INVALID_SYMBOL"
            });

            continue;
        }

        const allCandles =
            normalizeCandles(
                candlesBySymbol[symbol] ||
                []
            );

        if (
            !Number.isFinite(nowMs)
        ) {
            throw new Error(
                "nowMs must be finite"
            );
        }

        /*
        Forward-only evidence boundary:

        A candle is available to the runner only after its
        timestamp has been reached by nowMs.

        This prevents future historical candles from being
        used as paper-entry or execution evidence.
        */

        const candles =
            allCandles.filter(
                candle =>
                    candle.ts <= nowMs
            );

        const stock =
            getStockState(
                state,
                symbol
            );

        const latestCandle =
            candles.at(-1);

        if (
            latestCandle
        ) {

            const sessionDate =
                getSessionDate(
                    latestCandle.ts
                );

            if (
                sessionDate
            ) {
                startStockSession(
                    state,
                    symbol,
                    sessionDate
                );
            }
        }

        const signal =
            evaluation?.signal ??
            "WAIT";

        const opportunityId =
            evaluation?.opportunityId ??
            evaluation?.riskReference?.opportunityId ??
            null;

        recordStockObservation(
            state,
            symbol,
            {
                opportunityId,
                signal,
                signalTimestamp:
                    evaluation?.signalTimestamp ??
                    evaluation?.candle?.ts ??
                    null
            }
        );

        const updatedStock =
            getStockState(
                state,
                symbol
            );

        let entryResult = {
            status: "NO_ENTRY",
            reason: "NO_EXECUTABLE_SIGNAL"
        };

        if (
            !updatedStock.position.active &&
            updatedStock.cooldown.remainingCandles === 0
        ) {

            entryResult =
                calculatePaperEntry(
                    evaluation,
                    candles
                );

            if (
                entryResult.status ===
                "ENTRY_ACCEPTED"
            ) {

                recordStockPaperEntry(
                    state,
                    symbol,
                    {
                        side:
                            entryResult.side,
                        entry:
                            entryResult.entry,
                        entryTimestamp:
                            entryResult.entryTimestamp,
                        stop:
                            entryResult.stop,
                        target:
                            entryResult.target,
                        risk:
                            entryResult.risk
                    }
                );
            }
        }

        const positionAfterEntry =
            getStockState(
                state,
                symbol
            ).position;

        let outcomeResult = null;

        if (
            positionAfterEntry.active
        ) {

            for (
                const candle
                of candles
            ) {

                if (
                    candle.ts <=
                    positionAfterEntry.entryTimestamp
                ) {
                    continue;
                }

                if (
                    !assertCompletedExecutionCandle(
                        candle,
                        nowMs
                    )
                ) {
                    continue;
                }

                const candleSession =
                    getSessionDate(
                        candle.ts
                    );

                const entrySession =
                    getSessionDate(
                        positionAfterEntry.entryTimestamp
                    );

                if (
                    candleSession !==
                    entrySession
                ) {

                    const previousCandleIndex =
                        candles.findIndex(
                            item =>
                                item.ts ===
                                candle.ts
                        ) - 1;

                    if (
                        previousCandleIndex >= 0
                    ) {

                        const previousCandle =
                            candles[
                                previousCandleIndex
                            ];

                        outcomeResult =
                            sessionClose(
                                positionAfterEntry,
                                previousCandle
                            );

                        recordStockOutcome(
                            state,
                            symbol,
                            {
                                reason:
                                    outcomeResult.reason,
                                exit:
                                    outcomeResult.exit,
                                exitTimestamp:
                                    outcomeResult.exitTimestamp
                            }
                        );

                        setStockCooldown(
                            state,
                            symbol,
                            CONFIG.COOLDOWN_CANDLES
                        );
                    }

                    break;
                }

                const trade =
                    managePaperPosition(
                        positionAfterEntry,
                        candle
                    );

                if (
                    trade
                ) {

                    outcomeResult =
                        trade;

                    recordStockOutcome(
                        state,
                        symbol,
                        {
                            reason:
                                trade.reason,
                            exit:
                                trade.exit,
                            exitTimestamp:
                                trade.exitTimestamp
                        }
                    );

                    setStockCooldown(
                        state,
                        symbol,
                        CONFIG.COOLDOWN_CANDLES
                    );

                    break;
                }

                const minutes =
                    getISTMinutes(
                        candle.ts
                    );

                if (
                    minutes !== null &&
                    minutes >=
                    CONFIG.SESSION_CLOSE_MINUTES
                ) {

                    outcomeResult =
                        sessionClose(
                            positionAfterEntry,
                            candle
                        );

                    recordStockOutcome(
                        state,
                        symbol,
                        {
                            reason:
                                outcomeResult.reason,
                            exit:
                                outcomeResult.exit,
                            exitTimestamp:
                                outcomeResult.exitTimestamp
                        }
                    );

                    setStockCooldown(
                        state,
                        symbol,
                        CONFIG.COOLDOWN_CANDLES
                    );

                    break;
                }
            }
        }

        results.push({
            symbol,
            signal,
            entry: entryResult,
            outcome: outcomeResult,
            state:
                getStockState(
                    state,
                    symbol
                )
        });

        /*
        Cooldown is intentionally not decremented here.

        It is tied to the processing of a subsequent completed
        candle and must be advanced by the caller on each new
        execution candle. This prevents a single runner call from
        consuming multiple cooldown candles.
        */
    }

    return {
        version:
            MULTI_STOCK_PAPER_RUNNER_VERSION,

        mode:
            "PAPER_ONLY",

        researchOnly:
            true,

        tradingEnabled:
            false,

        brokerCalled:
            false,

        orderCreationEnabled:
            false,

        learningEnabled:
            false,

        strategyMutation:
            false,

        optimizationEnabled:
            false,

        promotionEnabled:
            false,

        results,

        state
    };
}


export {
    calculatePaperEntry,
    managePaperPosition,
    sessionClose
};

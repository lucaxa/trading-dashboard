/*
============================================================
TradeMind Pro

A11 Multi-Stock Forward Coordinator V1

Purpose:

Coordinate forward paper execution across the independent
four-stock A11 universe.

This module owns:
- per-stock forward cursors
- new-candle detection
- future-candle rejection
- per-stock cooldown progression
- forward execution delegation

This module does NOT:
- generate signals
- modify V10.20
- modify V10.25
- call brokers
- create real orders
- learn
- optimize
- mutate strategy
- promote anything

Component 5 remains the paper-execution authority.
============================================================
*/

import {
    getStockState,
    decrementStockCooldown
} from "./multi-stock-state-v1.js";

import {
    runMultiStockPaperRunner
} from "./multi-stock-paper-runner-v1.js";

export const MULTI_STOCK_FORWARD_COORDINATOR_VERSION =
    "A11-MULTI-STOCK-FORWARD-COORDINATOR-V1";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function normalizeSymbol(symbol) {
    if (typeof symbol !== "string") {
        return null;
    }

    const clean = symbol.trim().toUpperCase();

    return clean.length > 0 ? clean : null;
}

function normalizeCandle(candle) {
    if (!candle) {
        return null;
    }

    const ts = Number(candle.ts);

    if (!Number.isFinite(ts)) {
        return null;
    }

    return {
        ...candle,
        ts
    };
}

function normalizeCandles(candles) {
    if (!Array.isArray(candles)) {
        return [];
    }

    return candles
        .map(normalizeCandle)
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts);
}

function isCompletedCandle(candle, nowMs) {
    if (!candle) {
        return false;
    }

    if (!Number.isFinite(candle.ts) || !Number.isFinite(nowMs)) {
        return false;
    }

    return candle.ts + FIVE_MINUTES_MS <= nowMs;
}

function createCursorState(symbols = []) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
        throw new Error("At least one stock symbol is required");
    }

    const cursors = {};

    for (const rawSymbol of symbols) {
        const symbol = normalizeSymbol(rawSymbol);

        if (!symbol) {
            throw new Error("Every cursor symbol must be valid");
        }

        if (cursors[symbol]) {
            throw new Error(`Duplicate cursor symbol: ${symbol}`);
        }

        cursors[symbol] = {
            lastProcessedCandleTs: null
        };
    }

    return {
        version: MULTI_STOCK_FORWARD_COORDINATOR_VERSION,
        cursors
    };
}

export function createMultiStockForwardCursor(instruments = []) {
    if (!Array.isArray(instruments)) {
        throw new Error("instruments must be an array");
    }

    const symbols = instruments.map(
        instrument => instrument?.symbol
    );

    return createCursorState(symbols);
}

export function getForwardCursor(cursorState, symbol) {
    const normalized = normalizeSymbol(symbol);

    if (!normalized) {
        throw new Error("Valid stock symbol is required");
    }

    const cursor = cursorState?.cursors?.[normalized];

    if (!cursor) {
        throw new Error(`Unknown forward cursor: ${normalized}`);
    }

    return cursor;
}

function getNewCompletedCandles(candles, cursor, nowMs) {
    const normalizedCandles = normalizeCandles(candles);

    return normalizedCandles.filter(candle => {
        if (!isCompletedCandle(candle, nowMs)) {
            return false;
        }

        if (cursor.lastProcessedCandleTs === null) {
            return true;
        }

        return candle.ts > cursor.lastProcessedCandleTs;
    });
}

function buildExecutionWindow(allCandles, newCandles, stockState) {
    const normalized = normalizeCandles(allCandles);

    if (normalized.length === 0) {
        return [];
    }

    if (
        stockState?.position?.active &&
        Number.isFinite(stockState.position.entryTimestamp)
    ) {
        const entryTimestamp =
            stockState.position.entryTimestamp;

        const entryCandle =
            normalized.find(
                candle => candle.ts === entryTimestamp
            );

        const forwardCandles =
            newCandles.filter(
                candle => candle.ts >= entryTimestamp
            );

        return [
            ...(entryCandle ? [entryCandle] : []),
            ...forwardCandles
        ].filter(
            (candle, index, array) =>
                array.findIndex(
                    item => item.ts === candle.ts
                ) === index
        );
    }

    return newCandles;
}

function validateSafety(state) {
    if (state?.mode !== "PAPER_ONLY") {
        throw new Error(
            "Forward coordinator requires PAPER_ONLY mode"
        );
    }

    if (state?.researchOnly !== true) {
        throw new Error(
            "Forward coordinator requires researchOnly=true"
        );
    }

    const requiredFalseFlags = [
        "tradingEnabled",
        "brokerCalled",
        "orderCreationEnabled",
        "learningEnabled",
        "strategyMutation",
        "optimizationEnabled",
        "promotionEnabled"
    ];

    for (const flag of requiredFalseFlags) {
        if (state?.[flag] !== false) {
            throw new Error(
                `Forward coordinator requires ${flag}=false`
            );
        }
    }
}

export function advanceMultiStockForward({
    state,
    cursorState,
    evaluations = [],
    candlesBySymbol = {},
    nowMs = Date.now()
} = {}) {

    validateSafety(state);

    if (!cursorState || typeof cursorState !== "object") {
        throw new Error("cursorState is required");
    }

    if (!Number.isFinite(nowMs)) {
        throw new Error("nowMs must be finite");
    }

    if (!Array.isArray(evaluations)) {
        throw new Error("evaluations must be an array");
    }

    const results = [];

    for (const evaluation of evaluations) {
        const symbol =
            normalizeSymbol(evaluation?.symbol);

        if (!symbol) {
            results.push({
                symbol: null,
                status: "REJECTED",
                reason: "INVALID_SYMBOL"
            });

            continue;
        }

        const stockState =
            getStockState(state, symbol);

        const cursor =
            getForwardCursor(cursorState, symbol);

        const allCandles =
            candlesBySymbol?.[symbol] ??
            candlesBySymbol?.[evaluation.symbol] ??
            [];

        const newCandles =
            getNewCompletedCandles(
                allCandles,
                cursor,
                nowMs
            );

        if (newCandles.length === 0) {
            results.push({
                symbol,
                status: "NO_NEW_CANDLE",
                processedCandles: [],
                cursor: {
                    lastProcessedCandleTs:
                        cursor.lastProcessedCandleTs
                }
            });

            continue;
        }

        /*
        Cooldown belongs only to this stock.
        One newly processed candle consumes at most one
        existing cooldown candle.
        */

        if (stockState.cooldown.remainingCandles > 0) {
            for (const _candle of newCandles) {
                if (stockState.cooldown.remainingCandles <= 0) {
                    break;
                }

                decrementStockCooldown(
                    state,
                    symbol
                );
            }
        }

        const executionCandles =
            buildExecutionWindow(
                allCandles,
                newCandles,
                stockState
            );

        const runnerResult =
            runMultiStockPaperRunner({
                state,
                evaluations: [evaluation],
                candlesBySymbol: {
                    [symbol]: executionCandles
                },
                nowMs
            });

        const runnerResultForStock =
            runnerResult.results.find(
                item => item.symbol === symbol
            );

        const lastNewCandle =
            newCandles[newCandles.length - 1];

        cursor.lastProcessedCandleTs =
            lastNewCandle.ts;

        results.push({
            symbol,
            status: "PROCESSED",
            processedCandles:
                newCandles.map(
                    candle => candle.ts
                ),
            runner:
                runnerResultForStock ?? null,
            cursor: {
                lastProcessedCandleTs:
                    cursor.lastProcessedCandleTs
            }
        });
    }

    return {
        version:
            MULTI_STOCK_FORWARD_COORDINATOR_VERSION,

        mode: "PAPER_ONLY",
        researchOnly: true,
        tradingEnabled: false,
        brokerCalled: false,
        orderCreationEnabled: false,
        learningEnabled: false,
        strategyMutation: false,
        optimizationEnabled: false,
        promotionEnabled: false,

        results,
        cursorState
    };
}

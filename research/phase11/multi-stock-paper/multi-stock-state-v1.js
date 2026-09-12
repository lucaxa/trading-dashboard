/*
============================================================
TradeMind Pro

A11 Multi-Stock Paper State V1

Purpose:

Maintain completely independent paper-trading state
for each instrument in the A11 four-stock universe.

Each stock gets its own:
- session state
- opportunity
- active position
- entry
- stop
- target
- outcome
- cooldown

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

It is only the per-stock state boundary.
============================================================
*/

export const MULTI_STOCK_STATE_VERSION =
    "A11-MULTI-STOCK-STATE-V1";


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


function createInstrumentState(
    instrument
) {

    const symbol =
        normalizeSymbol(
            instrument?.symbol
        );

    if (!symbol) {
        throw new Error(
            "Instrument symbol is required"
        );
    }

    return {
        symbol,

        session: {
            active: false,
            sessionDate: null
        },

        opportunity: {
            active: false,
            opportunityId: null,
            signal: null,
            signalTimestamp: null,
            observationCount: 0,
            heartbeatCount: 0,
            lifecycleState: "NOT_REACHED"
        },

        position: {
            active: false,
            side: null,
            entry: null,
            entryTimestamp: null,
            stop: null,
            target: null,
            risk: null
        },

        outcome: null,

        cooldown: {
            remainingCandles: 0
        }
    };
}


export function createMultiStockState(
    instruments = []
) {

    if (
        !Array.isArray(instruments)
    ) {
        throw new Error(
            "instruments must be an array"
        );
    }

    if (
        instruments.length === 0
    ) {
        throw new Error(
            "At least one instrument is required"
        );
    }

    const stocks = {};

    for (
        const instrument of instruments
    ) {

        const symbol =
            normalizeSymbol(
                instrument?.symbol
            );

        if (!symbol) {
            throw new Error(
                "Every instrument must have a valid symbol"
            );
        }

        if (
            stocks[symbol]
        ) {
            throw new Error(
                `Duplicate instrument state: ${symbol}`
            );
        }

        stocks[symbol] =
            createInstrumentState(
                instrument
            );
    }

    return {

        version:
            MULTI_STOCK_STATE_VERSION,

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

        stocks
    };
}


export function getStockState(
    state,
    symbol
) {

    const normalized =
        normalizeSymbol(
            symbol
        );

    if (!normalized) {
        throw new Error(
            "Valid stock symbol is required"
        );
    }

    const stock =
        state?.stocks?.[normalized];

    if (!stock) {
        throw new Error(
            `Unknown instrument state: ${normalized}`
        );
    }

    return stock;
}


export function startStockSession(
    state,
    symbol,
    sessionDate
) {

    if (
        typeof sessionDate !== "string" ||
        sessionDate.trim().length === 0
    ) {
        throw new Error(
            "sessionDate is required"
        );
    }

    const stock =
        getStockState(
            state,
            symbol
        );

    stock.session = {
        active: true,
        sessionDate
    };

    return stock;
}


export function recordStockObservation(
    state,
    symbol,
    {
        opportunityId = null,
        signal = null,
        signalTimestamp = null
    } = {}
) {

    const stock =
        getStockState(
            state,
            symbol
        );

    stock.opportunity.observationCount += 1;

    if (
        opportunityId &&
        stock.opportunity.opportunityId ===
            opportunityId
    ) {

        stock.opportunity.heartbeatCount += 1;

        return stock;
    }

    if (
        signal !== "BUY" &&
        signal !== "SELL"
    ) {
        stock.opportunity = {
            ...stock.opportunity,
            active: false,
            opportunityId: null,
            signal: null,
            signalTimestamp: null,
            lifecycleState: "NOT_REACHED"
        };

        return stock;
    }

    stock.opportunity = {
        active: true,
        opportunityId,
        signal,
        signalTimestamp,
        observationCount:
            stock.opportunity.observationCount,
        heartbeatCount: 0,
        lifecycleState: "NOT_REACHED"
    };

    return stock;
}


export function recordStockPaperEntry(
    state,
    symbol,
    {
        side,
        entry,
        entryTimestamp,
        stop,
        target,
        risk
    } = {}
) {

    const stock =
        getStockState(
            state,
            symbol
        );

    if (
        stock.position.active
    ) {
        throw new Error(
            `Active paper position already exists for ${symbol}`
        );
    }

    if (
        side !== "LONG" &&
        side !== "SHORT"
    ) {
        throw new Error(
            "Paper entry side must be LONG or SHORT"
        );
    }

    if (
        !Number.isFinite(entry) ||
        !Number.isFinite(stop) ||
        !Number.isFinite(target) ||
        !Number.isFinite(risk)
    ) {
        throw new Error(
            "Paper entry prices and risk must be finite"
        );
    }

    stock.position = {
        active: true,
        side,
        entry,
        entryTimestamp,
        stop,
        target,
        risk
    };

    stock.opportunity.lifecycleState =
        "PAPER_ACTIVE";

    return stock;
}


export function recordStockOutcome(
    state,
    symbol,
    outcome
) {

    const stock =
        getStockState(
            state,
            symbol
        );

    if (
        !stock.position.active
    ) {
        throw new Error(
            `No active paper position exists for ${symbol}`
        );
    }

    stock.outcome = outcome;

    stock.position = {
        active: false,
        side: null,
        entry: null,
        entryTimestamp: null,
        stop: null,
        target: null,
        risk: null
    };

    stock.opportunity.lifecycleState =
        "CLOSED";

    return stock;
}


export function setStockCooldown(
    state,
    symbol,
    candles
) {

    if (
        !Number.isInteger(candles) ||
        candles < 0
    ) {
        throw new Error(
            "Cooldown candles must be a non-negative integer"
        );
    }

    const stock =
        getStockState(
            state,
            symbol
        );

    stock.cooldown.remainingCandles =
        candles;

    return stock;
}


export function decrementStockCooldown(
    state,
    symbol
) {

    const stock =
        getStockState(
            state,
            symbol
        );

    if (
        stock.cooldown.remainingCandles > 0
    ) {
        stock.cooldown.remainingCandles -= 1;
    }

    return stock;
}
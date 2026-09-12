/*
============================================================
TradeMind Pro

A11 Multi-Stock Forward Harness V1

Purpose:

Provide an isolated end-to-end harness for the four-stock
A11 paper-trading architecture.

Pipeline:

PMSE-shaped input
    -> Universe
    -> Multi-stock orchestration
    -> Frozen signal evaluation
    -> Forward coordinator
    -> Frozen paper execution

This harness is research-only.

It does NOT:
- call brokers
- create real orders
- modify V10.20
- modify V10.25
- learn
- optimize
- mutate strategy
- promote anything
- touch the frontend
============================================================
*/

import {
    buildMultiStockUniverse
} from "./multi-stock-universe-v1.js";

import {
    evaluateMultiStockUniverse
} from "./multi-stock-orchestrator-v1.js";

import {
    createMultiStockState
} from "./multi-stock-state-v1.js";

import {
    createMultiStockForwardCursor,
    advanceMultiStockForward
} from "./multi-stock-forward-coordinator-v1.js";


export const MULTI_STOCK_FORWARD_HARNESS_VERSION =
    "A11-MULTI-STOCK-FORWARD-HARNESS-V1";


function normalizeSymbol(symbol) {

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


function validateSafety() {

    return {
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
}


function validatePMSEInput(
    pmseInput
) {

    if (
        !pmseInput ||
        typeof pmseInput !== "object"
    ) {
        throw new Error(
            "pmseInput is required"
        );
    }

    if (
        !Array.isArray(
            pmseInput.candidates
        )
    ) {
        throw new Error(
            "pmseInput.candidates must be an array"
        );
    }

    if (
        pmseInput.candidates.length < 3
    ) {
        throw new Error(
            "At least three PMSE candidates are required"
        );
    }
}


function validateResolvedInstruments(
    instruments
) {

    if (
        !Array.isArray(instruments)
    ) {
        throw new Error(
            "resolvedPMSEInstruments must be an array"
        );
    }

    for (
        const instrument of instruments
    ) {

        const symbol =
            normalizeSymbol(
                instrument?.symbol
            );

        if (!symbol) {
            throw new Error(
                "Resolved PMSE instrument requires symbol"
            );
        }

        if (
            instrument?.securityId === undefined ||
            instrument?.securityId === null
        ) {
            throw new Error(
                `Resolved PMSE instrument requires securityId: ${symbol}`
            );
        }

        if (
            typeof instrument?.exchange !== "string" ||
            instrument.exchange.trim().length === 0
        ) {
            throw new Error(
                `Resolved PMSE instrument requires exchange: ${symbol}`
            );
        }

        if (
            typeof instrument?.segment !== "string" ||
            instrument.segment.trim().length === 0
        ) {
            throw new Error(
                `Resolved PMSE instrument requires segment: ${symbol}`
            );
        }
    }
}


export function createMultiStockForwardHarness(
    {
        pmseInput,
        resolvedPMSEInstruments = [],
        candlesBySymbol = {},
        nowMs = Date.now()
    } = {}
) {

    validatePMSEInput(
        pmseInput
    );

    validateResolvedInstruments(
        resolvedPMSEInstruments
    );

    if (
        !Number.isFinite(nowMs)
    ) {
        throw new Error(
            "nowMs must be finite"
        );
    }

    const universe =
        buildMultiStockUniverse({
            pmseCandidates:
                pmseInput.candidates
        });

    const state =
        createMultiStockState(
            universe.instruments
        );

    const cursorState =
        createMultiStockForwardCursor(
            universe.instruments
        );

    return {
        version:
            MULTI_STOCK_FORWARD_HARNESS_VERSION,

        safety:
            validateSafety(),

        universe,

        state,

        cursorState,

        candlesBySymbol,

        nowMs
    };
}


export function runMultiStockForwardHarness(
    {
        pmseInput,
        resolvedPMSEInstruments = [],
        candlesBySymbol = {},
        nowMs = Date.now(),
        state = null,
        cursorState = null
    } = {}
) {

    validatePMSEInput(
        pmseInput
    );

    validateResolvedInstruments(
        resolvedPMSEInstruments
    );

    if (
        !Number.isFinite(nowMs)
    ) {
        throw new Error(
            "nowMs must be finite"
        );
    }

    const universe =
        buildMultiStockUniverse({
            pmseCandidates:
                pmseInput.candidates
        });

    const workingState =
        state ??
        createMultiStockState(
            universe.instruments
        );

    const workingCursor =
        cursorState ??
        createMultiStockForwardCursor(
            universe.instruments
        );

    const orchestration =
        evaluateMultiStockUniverse({
            pmseInput,
            resolvedPMSEInstruments,
            candlesBySymbol,
            nowMs
        });

    // Component 4 returns an orchestration envelope per stock:
    // { symbol, status, result }.
    // Component 6 consumes the direct Component 3 evaluation contract.
    // Failed stocks remain preserved in `orchestration` but do not enter
    // the execution path.
    const evaluations =
        orchestration.results
            .filter(
                item =>
                    item?.status === "EVALUATED" &&
                    item?.result
            )
.map(
    item => ({
        ...item.result,

        symbol:
            item.symbol,

        /*
         * Component 3 calls this signalCandle.
         * The frozen paper execution layer expects
         * the execution evaluation to expose the
         * signal candle as candle / signalTimestamp.
         *
         * This is an adapter only.
         * No strategy or execution rule is changed.
         */
        candle:
            item.result.signalCandle,

        signalTimestamp:
            item.result.signalCandle?.ts ?? null
    })
);

    const forward =
        advanceMultiStockForward({
            state:
                workingState,

            cursorState:
                workingCursor,

            evaluations,

            candlesBySymbol,

            nowMs
        });

    return {
        version:
            MULTI_STOCK_FORWARD_HARNESS_VERSION,

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

        universe,

        orchestration,

        forward,

        state:
            workingState,

        cursorState:
            workingCursor
    };
}

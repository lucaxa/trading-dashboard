/*
============================================================
TradeMind Pro

A11 Multi-Stock Live Forward Adapter V1

Purpose:

Connect the live four-stock candle provider with the
existing multi-stock orchestrator and forward coordinator.

Pipeline:

PMSE Input
    ↓
Live Candle Provider
    ↓
Multi-Stock Orchestrator
    ↓
Multi-Stock Forward Coordinator
    ↓
Paper Runner

This module does NOT:
- modify V10.20
- modify V10.25
- generate new strategy logic
- learn
- optimize
- mutate strategy
- promote
- call brokers
- create real orders
============================================================
*/

import {
    fetchMultiStockLiveCandles
} from "./multi-stock-live-candle-provider-v1.js";

import {
    buildMultiStockUniverse
} from "./multi-stock-universe-v1.js";

import {
    evaluateMultiStockUniverse
} from "./multi-stock-orchestrator-v1.js";

import {
    advanceMultiStockForward
} from "./multi-stock-forward-coordinator-v1.js";


export const MULTI_STOCK_LIVE_FORWARD_ADAPTER_VERSION =
    "A11-MULTI-STOCK-LIVE-FORWARD-ADAPTER-V1";


const SAFETY = Object.freeze({

    mode: "PAPER_ONLY",

    researchOnly: true,

    tradingEnabled: false,

    brokerCalled: false,

    orderCreationEnabled: false,

    learningEnabled: false,

    strategyMutation: false,

    optimizationEnabled: false,

    promotionEnabled: false

});


function validateSafety() {

    for (
        const [key, value]
        of Object.entries(SAFETY)
    ) {

        if (
            key === "mode"
        ) {

            if (
                value !== "PAPER_ONLY"
            ) {

                throw new Error(
                    "Live forward adapter requires PAPER_ONLY mode"
                );

            }

            continue;

        }

        if (
            key === "researchOnly"
        ) {

            if (
                value !== true
            ) {

                throw new Error(
                    "Live forward adapter requires researchOnly=true"
                );

            }

            continue;

        }

        if (
            value !== false
        ) {

            throw new Error(
                `Live forward adapter safety violation: ${key}`
            );

        }

    }

}


function validateInputs({

    pmseInput,

    resolvedPMSEInstruments,

    state,

    cursorState,

    accessToken

}) {

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
            resolvedPMSEInstruments
        )
    ) {

        throw new Error(
            "resolvedPMSEInstruments must be an array"
        );

    }

    if (
        !state ||
        typeof state !== "object"
    ) {

        throw new Error(
            "state is required"
        );

    }

    if (
        !cursorState ||
        typeof cursorState !== "object"
    ) {

        throw new Error(
            "cursorState is required"
        );

    }

    if (
        typeof accessToken !== "string" ||
        !accessToken.trim()
    ) {

        throw new Error(
            "accessToken is required"
        );

    }

}


export async function runMultiStockLiveForwardAdapter({

    pmseInput,

    resolvedPMSEInstruments,

    state,

    cursorState,

    accessToken,

    nowMs = Date.now(),

    fetcher

} = {}) {

    validateSafety();

    validateInputs({

        pmseInput,

        resolvedPMSEInstruments,

        state,

        cursorState,

        accessToken

    });


    if (
        !Number.isFinite(nowMs)
    ) {

        throw new Error(
            "nowMs must be finite"
        );

    }


    // --------------------------------------------------
    // BUILD FOUR-STOCK UNIVERSE
    // --------------------------------------------------

    const universe =
        buildMultiStockUniverse({

            pmseCandidates:
                pmseInput.candidates

        });

    const resolvedInstruments =
        universe.instruments.map(
            instrument => {

                if (
                    instrument.symbol ===
                    "NIFTY 50"
                ) {

                    return {
                        ...instrument
                    };

                }

                const resolved =
                    resolvedPMSEInstruments.find(
                        item =>
                            String(
                                item?.symbol ?? ""
                            )
                                .trim()
                                .toUpperCase() ===
                            String(
                                instrument.symbol
                            )
                                .trim()
                                .toUpperCase()
                    );

                if (!resolved) {

                    throw new Error(
                        `Resolved PMSE instrument not found: ${instrument.symbol}`
                    );

                }

                return {
                    ...instrument,
                    securityId:
                        resolved.securityId,
                    exchange:
                        resolved.exchange,
                    segment:
                        resolved.segment
                };

            }
        );


    // --------------------------------------------------
    // LIVE CANDLE ACQUISITION
    // --------------------------------------------------

    const candleResult =
        await fetchMultiStockLiveCandles({

            instruments:
                resolvedInstruments,

            accessToken,

            nowMs,

            fetcher

        });


    const candlesBySymbol = {};


    for (
        const stock
        of candleResult.stocks
    ) {

        candlesBySymbol[
            stock.symbol
        ] =
            stock.candles;

    }


    // --------------------------------------------------
    // FOUR-STOCK SIGNAL EVALUATION
    // --------------------------------------------------

    const evaluation =
        evaluateMultiStockUniverse({

            pmseInput,

            resolvedPMSEInstruments,

            candlesBySymbol,

            nowMs

        });


    const evaluations =
        evaluation.results
            .map(
                item => {

                    if (
                        item.status !==
                        "EVALUATED"
                    ) {

                        return null;

                    }


                    return {

                        ...item.result,

                        symbol:
                            item.symbol,

                        candle:
                            item.result?.signalCandle ??
                            null,

                        signalTimestamp:
                            item.result?.signalCandle?.ts ??
                            null

                    };

                }
            )
            .filter(Boolean);


    // --------------------------------------------------
    // FORWARD PAPER EXECUTION
    // --------------------------------------------------

    const forward =
        advanceMultiStockForward({

            state,

            cursorState,

            evaluations,

            candlesBySymbol,

            nowMs

        });


    return {

        version:
            MULTI_STOCK_LIVE_FORWARD_ADAPTER_VERSION,

        mode:
            SAFETY.mode,

        researchOnly:
            SAFETY.researchOnly,

        tradingEnabled:
            SAFETY.tradingEnabled,

        brokerCalled:
            SAFETY.brokerCalled,

        orderCreationEnabled:
            SAFETY.orderCreationEnabled,

        learningEnabled:
            SAFETY.learningEnabled,

        strategyMutation:
            SAFETY.strategyMutation,

        optimizationEnabled:
            SAFETY.optimizationEnabled,

        promotionEnabled:
            SAFETY.promotionEnabled,

        candles:
            candleResult,

        evaluation,

        forward,

        safety:
            SAFETY

    };

}

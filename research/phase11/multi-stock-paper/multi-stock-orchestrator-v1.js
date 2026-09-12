/*
============================================================
TradeMind Pro

A11 Multi-Stock Paper Orchestrator V1

Purpose:

Evaluate the four-stock paper universe:

1. NIFTY 50
2. PMSE candidate #1
3. PMSE candidate #2
4. PMSE candidate #3

This module connects:

PMSE TradeMind Input
        ↓
Multi-Stock Universe
        ↓
Resolved PMSE Instruments
        ↓
Multi-Stock Signal Evaluator
        ↓
Four independent signal results

IMPORTANT:
- Uses the frozen V10.20/V10.25 signal engine.
- Does NOT modify strategy logic.
- Does NOT create paper entries.
- Does NOT manage positions.
- Does NOT learn.
- Does NOT optimize.
- Does NOT promote.
- Does NOT call brokers.
- Does NOT place real orders.

Failure isolation:
- One instrument failing must not prevent
  the remaining instruments from being evaluated.
============================================================
*/

import {
    buildMultiStockUniverse
} from "./multi-stock-universe-v1.js";

import {
    evaluateMultiStockSignal
} from "./multi-stock-signal-v1.js";


export const MULTI_STOCK_ORCHESTRATOR_VERSION =
    "A11-MULTI-STOCK-ORCHESTRATOR-V1";


const SAFETY = Object.freeze({

    researchOnly: true,
    paperOnly: true,

    learningEnabled: false,
    strategyMutation: false,
    parameterOptimization: false,
    featureSelection: false,
    modelWeightUpdates: false,
    promotionEnabled: false,

    realOrders: false,
    brokerOrderEnabled: false

});


function normalizeSymbol(symbol) {

    if (
        typeof symbol !== "string"
    ) {
        return null;
    }

    const normalized =
        symbol
            .trim()
            .toUpperCase();

    return normalized.length > 0
        ? normalized
        : null;
}


function validatePMSEInput(
    pmseInput
) {

    if (
        !pmseInput ||
        typeof pmseInput !== "object"
    ) {
        throw new Error(
            "PMSE input is required"
        );
    }

    if (
        pmseInput.source !== "PMSE"
    ) {
        throw new Error(
            "PMSE input source must be PMSE"
        );
    }

    if (
        pmseInput.mode !== "PAPER_ONLY"
    ) {
        throw new Error(
            "PMSE input must be PAPER_ONLY"
        );
    }

    if (
        !Array.isArray(
            pmseInput.candidates
        )
    ) {
        throw new Error(
            "PMSE input candidates must be an array"
        );
    }

    return pmseInput;
}


function validateResolvedPMSEInstruments(
    instruments
) {

    if (
        !Array.isArray(instruments)
    ) {
        throw new Error(
            "resolvedPMSEInstruments must be an array"
        );
    }

    return instruments;
}


function resolveInstrumentIdentity(
    universeInstrument,
    resolvedPMSEInstruments
) {

    const symbol =
        normalizeSymbol(
            universeInstrument.symbol
        );

    /*
    NIFTY identity is already complete in
    the fixed universe definition.
    */

    if (
        symbol === "NIFTY 50"
    ) {

        return {
            ...universeInstrument
        };

    }


    const resolved =
        resolvedPMSEInstruments.find(
            instrument =>
                normalizeSymbol(
                    instrument?.symbol
                ) === symbol
        );


    if (!resolved) {

        throw new Error(
            `Resolved PMSE instrument not found: ${symbol}`
        );

    }


    const securityId =
        String(
            resolved.securityId ?? ""
        ).trim();

    const exchange =
        String(
            resolved.exchange ?? ""
        ).trim().toUpperCase();

    const segment =
        String(
            resolved.segment ?? ""
        ).trim().toUpperCase();


    if (!securityId) {

        throw new Error(
            `Resolved PMSE instrument missing securityId: ${symbol}`
        );

    }

    if (!exchange) {

        throw new Error(
            `Resolved PMSE instrument missing exchange: ${symbol}`
        );

    }

    if (!segment) {

        throw new Error(
            `Resolved PMSE instrument missing segment: ${symbol}`
        );

    }


    return {

        ...universeInstrument,

        securityId,

        exchange,

        segment

    };

}


function resolveCandles(
    candlesBySymbol,
    symbol
) {

    if (
        !candlesBySymbol ||
        typeof candlesBySymbol !== "object"
    ) {
        return [];
    }

    const normalized =
        normalizeSymbol(symbol);

    if (!normalized) {
        return [];
    }

    const direct =
        candlesBySymbol[
            normalized
        ];

    if (
        Array.isArray(direct)
    ) {

        return direct;

    }


    for (
        const [key, candles]
        of Object.entries(
            candlesBySymbol
        )
    ) {

        if (
            normalizeSymbol(key) ===
            normalized
        ) {

            return Array.isArray(candles)
                ? candles
                : [];

        }

    }

    return [];
}


function evaluateInstrument({
    instrument,
    candles,
    nowMs
}) {

    try {

        const result =
            evaluateMultiStockSignal({

                instrument,
                candles,
                nowMs

            });

        return {

            symbol:
                instrument.symbol,

            status:
                "EVALUATED",

            result

        };

    }

    catch (error) {

        return {

            symbol:
                instrument.symbol,

            status:
                "FAILED",

            result: null,

            error: {

                name:
                    error?.name ||
                    "Error",

                message:
                    error?.message ||
                    String(error)

            }

        };

    }

}


export function evaluateMultiStockUniverse({

    pmseInput,
    resolvedPMSEInstruments = [],
    candlesBySymbol = {},
    nowMs = Date.now()

} = {}) {

    const validatedPMSE =
        validatePMSEInput(
            pmseInput
        );

    const validatedResolvedInstruments =
        validateResolvedPMSEInstruments(
            resolvedPMSEInstruments
        );


    const universe =
        buildMultiStockUniverse({

            pmseCandidates:
                validatedPMSE.candidates

        });


    const resolvedUniverse =
        universe.instruments.map(
            instrument =>
                resolveInstrumentIdentity(
                    instrument,
                    validatedResolvedInstruments
                )
        );


    const results =
        resolvedUniverse.map(
            instrument =>

                evaluateInstrument({

                    instrument,

                    candles:
                        resolveCandles(
                            candlesBySymbol,
                            instrument.symbol
                        ),

                    nowMs

                })
        );


    const evaluatedCount =
        results.filter(
            item =>
                item.status ===
                "EVALUATED"
        ).length;


    const failedCount =
        results.filter(
            item =>
                item.status ===
                "FAILED"
        ).length;


    return {

        version:
            MULTI_STOCK_ORCHESTRATOR_VERSION,

        mode:
            "PAPER_ONLY",

        researchOnly:
            true,

        universe: {

            ...universe,

            instruments:
                resolvedUniverse

        },

        results,

        summary: {

            instruments:
                results.length,

            evaluated:
                evaluatedCount,

            failed:
                failedCount,

            signals: {

                buy:
                    results.filter(
                        item =>
                            item.result?.signal ===
                            "BUY"
                    ).length,

                sell:
                    results.filter(
                        item =>
                            item.result?.signal ===
                            "SELL"
                    ).length,

                wait:
                    results.filter(
                        item =>
                            item.result?.signal ===
                            "WAIT"
                    ).length

            }

        },

        safety:
            SAFETY

    };

}

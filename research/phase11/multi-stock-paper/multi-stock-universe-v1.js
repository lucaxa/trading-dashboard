/*
============================================================
TradeMind Pro

A11 Multi-Stock Paper Universe V1

Purpose:

Build the four-instrument paper-trading universe:

1. NIFTY 50
2. PMSE candidate #1
3. PMSE candidate #2
4. PMSE candidate #3

This module does NOT:
- generate signals
- modify V10.20
- modify V10.25
- create orders
- call brokers
- create paper trades
- learn
- optimize
- promote

It is only the universe boundary.
============================================================
*/

export const MULTI_STOCK_UNIVERSE_VERSION =
    "A11-MULTI-STOCK-UNIVERSE-V1";


const NIFTY_INSTRUMENT = {
    symbol:
        "NIFTY 50",

    instrumentType:
        "INDEX",

    source:
        "FIXED_NIFTY",

    securityId:
        "40000001",

    exchange:
        "NIDX",

    segment:
        "INDEX"
};


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


function normalizeCandidate(
    candidate
) {

    if (
        !candidate ||
        typeof candidate !== "object"
    ) {
        return null;
    }

    const symbol =
        normalizeSymbol(
            candidate.symbol
        );

    if (!symbol) {
        return null;
    }

    return {
        symbol,

        instrumentType:
            "EQUITY",

        source:
            "PMSE",

        score:
            Number.isFinite(
                candidate.score
            )
                ? candidate.score
                : null,

        newsRisk:
            typeof candidate.newsRisk ===
            "string"
                ? candidate.newsRisk
                : "LOW"
    };
}


export function buildMultiStockUniverse({
    pmseCandidates = []
} = {}) {

    if (
        !Array.isArray(pmseCandidates)
    ) {
        throw new Error(
            "pmseCandidates must be an array"
        );
    }


    const candidates =
        pmseCandidates
            .map(
                normalizeCandidate
            )
            .filter(Boolean);


    const seen =
        new Set([
            "NIFTY 50"
        ]);


    const equities = [];


    for (
        const candidate of candidates
    ) {

        if (
            seen.has(
                candidate.symbol
            )
        ) {
            continue;
        }

        seen.add(
            candidate.symbol
        );

        equities.push(
            candidate
        );

        if (
            equities.length === 3
        ) {
            break;
        }
    }


    if (
        equities.length !== 3
    ) {

        throw new Error(
            "A11 multi-stock universe requires exactly 3 unique PMSE equity candidates"
        );

    }


    return {

        version:
            MULTI_STOCK_UNIVERSE_VERSION,

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

        instruments: [
            NIFTY_INSTRUMENT,
            ...equities
        ]
    };
}
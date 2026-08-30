
/*
============================================================
TradeMind Pro

PMSE INDstocks Equity Instrument Provider

Purpose:

Resolve PMSE equity symbols to their INDstocks
security IDs using the INDstocks equity instrument master.

This module does NOT:
- trade
- create signals
- place orders
- fetch historical candles

Instrument resolution layer only.
============================================================
*/


export const PMSE_EQUITY_INSTRUMENT_VERSION =
    "PMSE-INDSTOCKS-EQUITY-INSTRUMENT-V1";



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



function parseCsvLine(line) {

    return line
        .split(",")
        .map(
            value =>
                value
                    .trim()
                    .replace(/^"|"$/g, "")
        );

}



export function resolveEquityInstruments({

    symbols = [],

    csv = ""

} = {}) {


    if (
        !Array.isArray(symbols)
    ) {

        throw new Error(
            "symbols must be an array"
        );

    }


    if (
        typeof csv !== "string"
    ) {

        throw new Error(
            "csv must be a string"
        );

    }



    const lines =
        csv
            .split(/\r?\n/)
            .map(
                line =>
                    line.trim()
            )
            .filter(
                Boolean
            );


    if (
        lines.length < 2
    ) {

        return [];

    }



    const headers =
        parseCsvLine(
            lines[0]
        );


    const symbolIndex =
        headers.findIndex(
            header =>
                header.toUpperCase() ===
                "TRADING_SYMBOL"
        );


    const securityIdIndex =
        headers.findIndex(
            header =>
                [
                    "SECURITY_ID",
                    "SECURITYID"
                ].includes(
                    header.toUpperCase()
                )
        );


    if (
        symbolIndex === -1 ||
        securityIdIndex === -1
    ) {

        throw new Error(
            "Required equity instrument columns not found"
        );

    }



    const requestedSymbols =
        new Set(
            symbols
                .map(
                    normalizeSymbol
                )
                .filter(
                    Boolean
                )
        );



    const resolved = [];



    for (
        const line of lines.slice(1)
    ) {


        const parts =
            parseCsvLine(
                line
            );


        const symbol =
            normalizeSymbol(
                parts[symbolIndex]
            );


        const securityId =
            parts[
                securityIdIndex
            ]?.trim();



        if (
            symbol &&
            securityId &&
            requestedSymbols.has(
                symbol
            )
        ) {

            resolved.push({

                symbol,

                securityId

            });

        }

    }



    return resolved;

}

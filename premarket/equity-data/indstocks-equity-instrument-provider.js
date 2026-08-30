/*
============================================================
TradeMind Pro

PMSE INDstocks Equity Instrument Provider

Purpose:

Resolve PMSE equity symbols to INDstocks
security IDs.

Research only.
No trading.
No orders.
============================================================
*/


export const PMSE_EQUITY_INSTRUMENT_VERSION =
    "PMSE-INDSTOCKS-EQUITY-INSTRUMENT-V2";



function normalize(value){

    if(typeof value !== "string"){
        return null;
    }

    const clean =
        value.trim().toUpperCase();

    return clean.length
        ? clean
        : null;

}



function parseCsvLine(line){

    return line
        .split(",")
        .map(
            x =>
                x
                .trim()
                .replace(/^"|"$/g,"")
        );

}



export function resolveEquityInstruments({

    symbols = [],

    csv = ""

} = {}){


    if(!Array.isArray(symbols)){

        throw new Error(
            "symbols must be array"
        );

    }


    if(typeof csv !== "string"){

        throw new Error(
            "csv must be string"
        );

    }



    const lines =
        csv
        .split(/\r?\n/)
        .map(
            x=>x.trim()
        )
        .filter(Boolean);



    if(lines.length < 2){

        return [];

    }



    const headers =
        parseCsvLine(
            lines[0]
        )
        .map(
            x=>x.toUpperCase()
        );



    const exchangeIndex =
        headers.indexOf(
            "EXCH"
        );


    const segmentIndex =
        headers.indexOf(
            "SEGMENT"
        );


    const symbolIndex =
        headers.indexOf(
            "TRADING_SYMBOL"
        );


    const securityIndex =
        headers.indexOf(
            "SECURITY_ID"
        );



    if(
        exchangeIndex === -1 ||
        segmentIndex === -1 ||
        symbolIndex === -1 ||
        securityIndex === -1
    ){

        throw new Error(
            "Required equity instrument columns not found"
        );

    }



    const wanted =
        new Set(

            symbols
            .map(normalize)
            .filter(Boolean)

        );



    const result = [];



    for(
        const line of lines.slice(1)
    ){

        const parts =
            parseCsvLine(
                line
            );


        const symbol =
            normalize(
                parts[symbolIndex]
            );


        if(
            !symbol ||
            !wanted.has(symbol)
        ){

            continue;

        }



        const securityId =
            parts[securityIndex]
            ?.trim();


        const exchange =
            parts[exchangeIndex]
            ?.trim()
            .toUpperCase();


        const segment =
            parts[segmentIndex]
            ?.trim()
            .toUpperCase();



        if(
            securityId &&
            exchange &&
            segment
        ){

            result.push({

                symbol,

                securityId,

                exchange,

                segment

            });

        }

    }



    return result;

}
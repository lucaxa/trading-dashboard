/*
============================================================
TradeMind Pro

PMSE Scan API

Purpose:

Expose PMSE pre-market scanner output
to frontend applications.

This API does NOT:
- trade
- create orders
- call broker orders
- generate signals

Paper-only integration layer.
============================================================
*/


import {
    runPMSE
}
from "../premarket/pipeline/pmse-runner.js";


import {
    getPMSEUniverse
}
from "../premarket/scanner/pmse-universe-provider.js";


import {
    getPMSEStocks
}
from "../premarket/equity-data/pmse-stock-provider.js";


import {
    resolveEquityInstruments
}
from "../premarket/equity-data/indstocks-equity-instrument-provider.js";



const INSTRUMENTS_URL =
    "https://api.indstocks.com/market/instruments?source=equity";



function createResearchWindow(){


    const endTime =
        Date.now();


    const startTime =
        endTime -
        (
            2 *
            24 *
            60 *
            60 *
            1000
        );


    return {

        startTime,

        endTime

    };

}



async function fetchInstrumentCsv({

    accessToken

}){


    const response =
        await fetch(

            INSTRUMENTS_URL,

            {

                method:
                    "GET",

                headers: {

                    Authorization:
                        accessToken,

                    Accept:
                        "text/csv"

                }

            }

        );



    if(
        !response.ok
    ){

        throw new Error(
            `INDstocks instrument API failed: HTTP ${response.status}`
        );

    }



    return await response.text();

}



function validateResolvedInstruments(

    instruments

){


    if(
        !Array.isArray(instruments)
    ){

        throw new Error(
            "Instrument resolver returned invalid result"
        );

    }



    return instruments.filter(

        item =>

            item &&
            item.symbol &&
            item.securityId &&
            item.exchange &&
            item.segment

    );

}



export default async function handler(

    request,

    response

){


    if(
        request.method !== "GET"
    ){

        return response
            .status(405)
            .json({

                status:
                    "ERROR",

                error:
                    "Method not allowed"

            });

    }



    try{


        const accessToken =
            process.env.INDSTOCKS_TOKEN;



        if(
            !accessToken
        ){

            return response
                .status(500)
                .json({

                    status:
                        "ERROR",

                    error:
                        "INDSTOCKS_TOKEN is not configured"

                });

        }



        const universe =
            getPMSEUniverse();



        const symbols =
            universe
            .universe
            .symbols;



        const csv =
            await fetchInstrumentCsv({

                accessToken

            });



        const resolved =
            resolveEquityInstruments({

                symbols,

                csv

            });



        const instruments =
            validateResolvedInstruments(

                resolved

            );



        const stocks =
            await getPMSEStocks({

                symbols,

                instruments,

                accessToken,

                window:
                    createResearchWindow()

            });



        const result =
            await runPMSE({

                stocks

            });



        return response
            .status(200)
            .json({

                status:
                    "READY",


                universe: {

                    totalSymbols:
                        symbols.length,

                    resolvedSymbols:
                        instruments.length,

                    stockRecords:
                        stocks.length

                },


                ...result

            });



    }
    catch(error){


        console.error(

            "PMSE scan error:",

            error

        );


        return response
            .status(
                error.httpStatus || 500
            )
            .json({

                status:
                    "ERROR",

                error:
                    error.message ||
                    "PMSE scan failed"

            });

    }

}
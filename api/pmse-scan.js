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
- call broker
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



export default function handler(
    request,
    response
) {


    if (
        request.method !== "GET"
    ) {

        return response.status(405).json({

            error:
                "Method not allowed"

        });

    }



    const universe =
        getPMSEUniverse();



    const stocks =
        getPMSEStocks({

            symbols:
                universe.universe.symbols

        });



    const result =
        runPMSE({

            stocks

        });



    return response.status(200).json({

        status:
            "READY",

        ...result

    });


}

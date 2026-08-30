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



    const stocks = [

        {
            symbol:
                "RELIANCE",

            candles:[

                {
                    c:2500,
                    v:120000,
                    h:2510,
                    l:2490,
                    o:2500
                },

                {
                    c:2525,
                    v:150000,
                    h:2530,
                    l:2515,
                    o:2520
                }

            ]

        },


        {
            symbol:
                "INFY",

            candles:[

                {
                    c:1400,
                    v:90000,
                    h:1410,
                    l:1395,
                    o:1400
                },

                {
                    c:1420,
                    v:110000,
                    h:1425,
                    l:1410,
                    o:1415
                }

            ]

        },


        {
            symbol:
                "HDFCBANK",

            candles:[

                {
                    c:1600,
                    v:100000,
                    h:1610,
                    l:1595,
                    o:1600
                },

                {
                    c:1615,
                    v:130000,
                    h:1620,
                    l:1605,
                    o:1610
                }

            ]

        }

    ];



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

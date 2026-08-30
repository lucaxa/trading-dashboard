
/*
============================================================
TradeMind Pro

PMSE Stock Provider

Purpose:

Convert PMSE universe symbols into
scanner-ready stock records.

Temporary data layer.
Future replacement:
INDstocks / Dhan API.

Does NOT:
- trade
- create signals
- place orders
============================================================
*/


export const PMSE_STOCK_PROVIDER_VERSION =
    "PMSE-STOCK-PROVIDER-V1";



export function getPMSEStocks({

    symbols = []

} = {}) {


    return symbols.map(
        symbol => ({

            symbol,

            candles:[

                {
                    o:100,
                    h:102,
                    l:99,
                    c:101,
                    v:100000
                },

                {
                    o:101,
                    h:103,
                    l:100,
                    c:102,
                    v:120000
                }

            ]

        })
    );

}

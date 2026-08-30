import test from "node:test";
import assert from "node:assert/strict";


import {
    createStockDataRecord,
    PMSE_STOCK_DATA_VERSION
}
from "../equity-data/stock-data-collector.js";



test(
    "PMSE stock data creates valid record",
    () => {


        const result =
            createStockDataRecord({

                symbol:
                    "reliance",

                candles: [

                    {
                        ts: 1,
                        o: 100,
                        h: 102,
                        l: 99,
                        c: 101,
                        v: 1000
                    }

                ]

            });



        assert.equal(
            result.version,
            PMSE_STOCK_DATA_VERSION
        );


        assert.equal(
            result.symbol,
            "RELIANCE"
        );


        assert.equal(
            result.candles.length,
            1
        );


    }
);



test(
    "PMSE stock data remains research-only",
    () => {


        const result =
            createStockDataRecord({

                symbol:
                    "INFY"

            });



        assert.equal(
            result.metadata.tradingEnabled,
            false
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


        assert.equal(
            result.metadata.signalCreated,
            false
        );


    }
);



test(
    "PMSE stock data rejects invalid symbol",
    () => {


        assert.throws(
            () =>
                createStockDataRecord({

                    symbol:""

                })
        );


    }
);

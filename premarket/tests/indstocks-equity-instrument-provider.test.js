
import test from "node:test";
import assert from "node:assert/strict";


import {
    resolveEquityInstruments
}
from "../equity-data/indstocks-equity-instrument-provider.js";



test(
"PMSE resolves equity symbols to INDstocks security IDs",
()=>{


    const csv =
        `EXCH,SEGMENT,SECURITY_ID,INSTRUMENT_NAME,EXPIRY_CODE,TRADING_SYMBOL,LOT_UNITS,CUSTOM_SYMBOL,EXPIRY_DATE,STRIKE_PRICE,OPTION_TYPE,TICK_SIZE,EXPIRY_FLAG,SEM_EXCH_INSTRUMENT_TYPE,SERIES,SYMBOL_NAME
NSE,E,2885,EQUITY,,RELIANCE,1,RELIANCE INDUSTRIES,,,,"1",NA,ES,EQ,Reliance Industries Ltd
NSE,E,11536,EQUITY,,TCS,1,TCS,,,,"1",NA,ES,EQ,Tata Consultancy Services Ltd
NSE,E,1333,EQUITY,,HDFCBANK,1,HDFC BANK,,,,"1",NA,ES,EQ,HDFC Bank Ltd`;


    const result =
        resolveEquityInstruments({

            symbols:[
                "reliance",
                "TCS"
            ],

            csv

        });


    assert.equal(
        result.length,
        2
    );


    assert.deepEqual(
        result[0],
        {
            symbol:
                "RELIANCE",

            securityId:
                "2885",

            exchange:
                "NSE",

            segment:
                "E"
        }
    );


    assert.deepEqual(
        result[1],
        {
            symbol:
                "TCS",

            securityId:
                "11536",

            exchange:
                "NSE",

            segment:
                "E"
        }
    );


});



test(
"PMSE instrument resolver returns no result for unknown symbol",
()=>{


    const csv =
        `EXCH,SEGMENT,SECURITY_ID,INSTRUMENT_NAME,EXPIRY_CODE,TRADING_SYMBOL,LOT_UNITS,CUSTOM_SYMBOL,EXPIRY_DATE,STRIKE_PRICE,OPTION_TYPE,TICK_SIZE,EXPIRY_FLAG,SEM_EXCH_INSTRUMENT_TYPE,SERIES,SYMBOL_NAME
NSE,E,2885,EQUITY,,RELIANCE,1,RELIANCE INDUSTRIES,,,,"1",NA,ES,EQ,Reliance Industries Ltd`;


    const result =
        resolveEquityInstruments({

            symbols:[
                "UNKNOWN"
            ],

            csv

        });


    assert.equal(
        result.length,
        0
    );


});

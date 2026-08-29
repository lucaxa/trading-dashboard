import assert from "node:assert/strict";
import test from "node:test";

import {
    calculateRegimeEvidence
} from "../regime/evidence.js";


function ts(value) {

    return Math.floor(
        new Date(value).getTime() /
        1000
    );

}


const DATE =
    "2026-08-28";


test(
    "regime evidence uses only regular-session candles",
    () => {

        const result =
            calculateRegimeEvidence({

                symbol:
                    "NIFTY 50",

                marketDate:
                    DATE,

                candles: [

                    {
                        ts:
                            ts(
                                "2026-08-28T09:00:00+05:30"
                            ),

                        o: 999,
                        h: 999,
                        l: 999,
                        c: 999

                    },

                    {
                        ts:
                            ts(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103

                    },

                    {
                        ts:
                            ts(
                                "2026-08-28T15:30:00+05:30"
                            ),

                        o: 103,
                        h: 108,
                        l: 102,
                        c: 107

                    }

                ]

            });


        assert.equal(
            result.valid,
            true
        );


        assert.equal(
            result.candleCount,
            2
        );


        assert.equal(
            result.sessionOpen,
            100
        );


        assert.equal(
            result.sessionClose,
            107
        );

    }
);


test(
    "regime evidence calculates session return",
    () => {

        const result =
            calculateRegimeEvidence({

                symbol:
                    "NIFTY 50",

                marketDate:
                    DATE,

                candles: [

                    {
                        ts:
                            ts(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103

                    },

                    {
                        ts:
                            ts(
                                "2026-08-28T15:30:00+05:30"
                            ),

                        o: 103,
                        h: 110,
                        l: 102,
                        c: 110

                    }

                ]

            });


        assert.equal(
            result.sessionReturn,
            0.1
        );


        assert.equal(
            result.direction,
            "UP"
        );

    }
);


test(
    "regime evidence calculates session range",
    () => {

        const result =
            calculateRegimeEvidence({

                symbol:
                    "BANKNIFTY",

                marketDate:
                    DATE,

                candles: [

                    {
                        ts:
                            ts(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 110,
                        l: 95,
                        c: 105

                    },

                    {
                        ts:
                            ts(
                                "2026-08-28T15:30:00+05:30"
                            ),

                        o: 105,
                        h: 115,
                        l: 100,
                        c: 110

                    }

                ]

            });


        assert.equal(
            result.sessionHigh,
            115
        );


        assert.equal(
            result.sessionLow,
            95
        );


        assert.equal(
            result.sessionRange,
            20
        );


        assert.equal(
            result.rangePercent,
            0.2
        );

    }
);


test(
    "regime evidence calculates close location",
    () => {

        const result =
            calculateRegimeEvidence({

                symbol:
                    "NIFTY 50",

                marketDate:
                    DATE,

                candles: [

                    {
                        ts:
                            ts(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 110,
                        l: 90,
                        c: 105

                    }

                ]

            });


        assert.equal(
            result.closeLocation,
            0.75
        );

    }
);


test(
    "regime evidence returns UNKNOWN when no valid session exists",
    () => {

        const result =
            calculateRegimeEvidence({

                symbol:
                    "NIFTY 50",

                marketDate:
                    DATE,

                candles: []

            });


        assert.equal(
            result.valid,
            false
        );


        assert.equal(
            result.direction,
            "UNKNOWN"
        );


        assert.equal(
            result.candleCount,
            0
        );

    }
);


test(
    "regime evidence does not consume another date",
    () => {

        const result =
            calculateRegimeEvidence({

                symbol:
                    "NIFTY 50",

                marketDate:
                    DATE,

                candles: [

                    {
                        ts:
                            ts(
                                "2026-08-27T09:15:00+05:30"
                            ),

                        o: 90,
                        h: 100,
                        l: 89,
                        c: 99

                    },

                    {
                        ts:
                            ts(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103

                    }

                ]

            });


        assert.equal(
            result.candleCount,
            1
        );


        assert.equal(
            result.sessionOpen,
            100
        );

    }
);

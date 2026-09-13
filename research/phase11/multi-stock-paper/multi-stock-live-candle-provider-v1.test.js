import test from "node:test";
import assert from "node:assert/strict";

import {
    fetchMultiStockLiveCandles
} from "./multi-stock-live-candle-provider-v1.js";


const NOW_MS =
    Date.parse("2026-09-14T10:00:00+05:30");


function makeFetcher(payload) {

    return async () => ({
        ok: true,
        async json() {
            return payload;
        }
    });

}


const universe = [
    {
        symbol: "NIFTY 50",
        instrumentType: "INDEX",
        source: "FIXED_NIFTY",
        securityId: "40000001",
        exchange: "NIDX",
        segment: "INDEX"
    },
    {
        symbol: "INFY",
        securityId: "12345",
        exchange: "NSE",
        segment: "EQUITY"
    },
    {
        symbol: "SBIN",
        securityId: "23456",
        exchange: "NSE",
        segment: "EQUITY"
    },
    {
        symbol: "TCS",
        securityId: "34567",
        exchange: "NSE",
        segment: "EQUITY"
    }
];


function candle(ts) {

    return {
        ts,
        o: 100,
        h: 101,
        l: 99,
        c: 100.5,
        v: 1000
    };

}


test(
    "Component 8 fetches candles for all four stocks",
    async () => {

        const result =
            await fetchMultiStockLiveCandles({

                instruments:
                    universe,

                nowMs:
                    NOW_MS,

                accessToken:
                    "TEST_TOKEN",

                fetcher:
                    makeFetcher({

                        data: {
                            NIDX_40000001: {
                                candles: [
                                    candle(
                                        NOW_MS -
                                        10 * 60 * 1000
                                    )
                                ]
                            },

                            NSE_12345: {
                                candles: [
                                    candle(
                                        NOW_MS -
                                        10 * 60 * 1000
                                    )
                                ]
                            },

                            NSE_23456: {
                                candles: [
                                    candle(
                                        NOW_MS -
                                        10 * 10 * 60 * 1000
                                    )
                                ]
                            },

                            NSE_34567: {
                                candles: [
                                    candle(
                                        NOW_MS -
                                        15 * 60 * 1000
                                    )
                                ]
                            }
                        }

                    })

            });


        assert.equal(
            result.status,
            "READY"
        );

        assert.equal(
            result.stocks.length,
            4
        );

        assert.deepEqual(
            result.stocks.map(
                item => item.symbol
            ),
            [
                "NIFTY 50",
                "INFY",
                "SBIN",
                "TCS"
            ]
        );

    }
);


test(
    "Component 8 rejects incomplete or future candles",
    async () => {

        const result =
            await fetchMultiStockLiveCandles({

                instruments:
                    universe,

                nowMs:
                    NOW_MS,

                accessToken:
                    "TEST_TOKEN",

                fetcher:
                    makeFetcher({

                        data: {
                            NIDX_40000001: {
                                candles: [
                                    candle(
                                        NOW_MS -
                                        10 * 60 * 1000
                                    ),
                                    candle(
                                        NOW_MS +
                                        5 * 60 * 1000
                                    )
                                ]
                            }
                        }

                    })

            });


        const nifty =
            result.stocks.find(
                item =>
                    item.symbol ===
                    "NIFTY 50"
            );


        assert.ok(
            nifty
        );

        assert.equal(
            nifty.candles.length,
            1
        );

        assert.ok(
            nifty.candles.every(
                item =>
                    item.ts <
                    NOW_MS
            )
        );

    }
);


test(
    "Component 8 remains paper-only and research-only",
    async () => {

        const result =
            await fetchMultiStockLiveCandles({

                instruments:
                    universe,

                nowMs:
                    NOW_MS,

                accessToken:
                    "TEST_TOKEN",

                fetcher:
                    makeFetcher({
                        data: {}
                    })

            });


        assert.equal(
            result.researchOnly,
            true
        );

        assert.equal(
            result.tradingEnabled,
            false
        );

        assert.equal(
            result.brokerCalled,
            false
        );

    }
);


test(
    "Component 8 rejects an incomplete four-stock universe",
    async () => {

        await assert.rejects(
            () =>
                fetchMultiStockLiveCandles({

                    instruments:
                        universe.slice(
                            0,
                            3
                        ),

                    nowMs:
                        NOW_MS,

                    accessToken:
                        "TEST_TOKEN",

                    fetcher:
                        makeFetcher({
                            data: {}
                        })

                })
        );

    }
);

import assert from "node:assert/strict";
import test from "node:test";

import {
    evaluateMultiStockUniverse,
    MULTI_STOCK_ORCHESTRATOR_VERSION
} from "./multi-stock-orchestrator-v1.js";


function makeCandles(
    count = 80,
    startPrice = 100
) {

    const candles = [];

    let price =
        startPrice;

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const open =
            price;

        const close =
            price +
            (
                i % 3 === 0
                    ? 0.35
                    : 0.20
            );

        const high =
            Math.max(
                open,
                close
            ) + 0.20;

        const low =
            Math.min(
                open,
                close
            ) - 0.20;

        candles.push({

            ts:
                1_700_000_000 +
                i * 300,

            o: open,
            h: high,
            l: low,
            c: close,
            v: 1000

        });

        price =
            close;
    }

    return candles;
}


const pmseInput = {

    version:
        "PMSE-TRADEMIND-INPUT-CONTRACT-V1",

    source:
        "PMSE",

    mode:
        "PAPER_ONLY",

    candidates: [

        {
            symbol: "INFY",
            score: 90,
            newsRisk: "LOW"
        },

        {
            symbol: "SBIN",
            score: 80,
            newsRisk: "LOW"
        },

        {
            symbol: "TCS",
            score: 70,
            newsRisk: "LOW"
        }

    ],

    metadata: {

        researchOnly: true,
        tradeCreated: false,
        brokerCalled: false,
        frontendTouched: false

    }

};


const resolvedPMSEInstruments = [
  {
    symbol: "INFY",
    securityId: "12345",
    exchange: "NSE",
    segment: "EQUITY"
  },
  {
    symbol: "SBIN",
    securityId: "54321",
    exchange: "NSE",
    segment: "EQUITY"
  },
  {
    symbol: "TCS",
    securityId: "67890",
    exchange: "NSE",
    segment: "EQUITY"
  }
];

test(
    "Component 4 creates and evaluates the complete four-stock universe",
    () => {

        const result =
            evaluateMultiStockUniverse({

                pmseInput,

                
                resolvedPMSEInstruments,
candlesBySymbol: {

                    "NIFTY 50":
                        makeCandles(
                            80,
                            100
                        ),

                    INFY:
                        makeCandles(
                            80,
                            200
                        ),

                    SBIN:
                        makeCandles(
                            80,
                            300
                        ),

                    TCS:
                        makeCandles(
                            80,
                            400
                        )

                },

                nowMs:
                    2_000_000_000_000

            });


        assert.equal(
            result.version,
            MULTI_STOCK_ORCHESTRATOR_VERSION
        );

        assert.equal(
            result.universe.instruments.length,
            4
        );

        assert.deepEqual(
            result.universe.instruments.map(
                item =>
                    item.symbol
            ),
            [
                "NIFTY 50",
                "INFY",
                "SBIN",
                "TCS"
            ]
        );

        assert.equal(
            result.results.length,
            4
        );

        assert.equal(
            result.summary.instruments,
            4
        );

        assert.equal(
            result.summary.evaluated,
            4
        );

        assert.equal(
            result.summary.failed,
            0
        );

        for (
            const item
            of result.results
        ) {

            assert.equal(
                item.status,
                "EVALUATED"
            );

            assert.ok(
                [
                    "BUY",
                    "SELL",
                    "WAIT"
                ].includes(
                    item.result.signal
                )
            );

        }

    }
);


test(
    "Component 4 isolates a failed stock from the other three",
    () => {

        const result =
            evaluateMultiStockUniverse({

                pmseInput,

                
                resolvedPMSEInstruments,
candlesBySymbol: {

                    "NIFTY 50":
                        makeCandles(),

                    INFY:
                        makeCandles(),

                    /*
                    Deliberately malformed candle
                    data. Component 3 should reject
                    this safely.
                    */
                    SBIN: [
                        {
                            invalid: true
                        }
                    ],

                    TCS:
                        makeCandles()

                },

                nowMs:
                    2_000_000_000_000

            });


        assert.equal(
            result.results.length,
            4
        );

        assert.equal(
            result.summary.instruments,
            4
        );

        /*
        The evaluator itself safely returns
        WAIT/INSUFFICIENT_DATA rather than
        throwing, so orchestration remains
        intact.
        */
        assert.equal(
            result.summary.failed,
            0
        );

        assert.equal(
            result.summary.evaluated,
            4
        );

        const sbin =
            result.results.find(
                item =>
                    item.symbol === "SBIN"
            );

        assert.ok(
            sbin
        );

        assert.equal(
            sbin.status,
            "EVALUATED"
        );

        assert.equal(
            sbin.result.signal,
            "WAIT"
        );

        assert.equal(
            sbin.result.status,
            "INSUFFICIENT_DATA"
        );

        const nifty =
            result.results.find(
                item =>
                    item.symbol === "NIFTY 50"
            );

        const infy =
            result.results.find(
                item =>
                    item.symbol === "INFY"
            );

        const tcs =
            result.results.find(
                item =>
                    item.symbol === "TCS"
            );

        assert.equal(
            nifty.status,
            "EVALUATED"
        );

        assert.equal(
            infy.status,
            "EVALUATED"
        );

        assert.equal(
            tcs.status,
            "EVALUATED"
        );

    }
);


test(
    "Component 4 remains paper-only and research-only",
    () => {

        const result =
            evaluateMultiStockUniverse({

                pmseInput,

                
                resolvedPMSEInstruments,
candlesBySymbol: {

                    "NIFTY 50":
                        makeCandles(),

                    INFY:
                        makeCandles(),

                    SBIN:
                        makeCandles(),

                    TCS:
                        makeCandles()

                },

                nowMs:
                    2_000_000_000_000

            });


        assert.equal(
            result.mode,
            "PAPER_ONLY"
        );

        assert.equal(
            result.researchOnly,
            true
        );

        assert.equal(
            result.safety.researchOnly,
            true
        );

        assert.equal(
            result.safety.paperOnly,
            true
        );

        assert.equal(
            result.safety.realOrders,
            false
        );

        assert.equal(
            result.safety.brokerOrderEnabled,
            false
        );

        assert.equal(
            result.safety.learningEnabled,
            false
        );

        assert.equal(
            result.safety.strategyMutation,
            false
        );

        assert.equal(
            result.safety.parameterOptimization,
            false
        );

        assert.equal(
            result.safety.promotionEnabled,
            false
        );

    }
);


test(
    "Component 4 requires exactly three PMSE candidates",
    () => {

        assert.throws(
            () =>
                evaluateMultiStockUniverse({

                    pmseInput: {

                        ...pmseInput,

                        candidates: [
                            {
                                symbol: "INFY",
                                score: 90
                            }
                        ]

                    },

                    candlesBySymbol: {}

                }),
            /requires exactly 3 unique PMSE/
        );

    }
);

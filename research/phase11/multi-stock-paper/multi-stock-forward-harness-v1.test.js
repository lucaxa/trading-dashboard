import test from "node:test";
import assert from "node:assert/strict";

import {
    createMultiStockForwardHarness,
    runMultiStockForwardHarness
} from "./multi-stock-forward-harness-v1.js";


const pmseInput = {
    version: "PMSE-TRADEMIND-INPUT-CONTRACT-V1",
    source: "PMSE",
    mode: "PAPER_ONLY",
    candidates: [
        {
            symbol: "INFY",
            score: 60,
            newsRisk: "LOW"
        },
        {
            symbol: "SBIN",
            score: 55,
            newsRisk: "LOW"
        },
        {
            symbol: "TCS",
            score: 50,
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


function istTimestamp(
    hour,
    minute,
    day = 14
) {

    return Date.parse(
        `2026-09-${String(day).padStart(2, "0")}T` +
        `${String(hour).padStart(2, "0")}:` +
        `${String(minute).padStart(2, "0")}:00+05:30`
    );
}


function candle(
    ts,
    o = 100,
    h = 101,
    l = 99,
    c = 100
) {

    return {
        ts,
        o,
        h,
        l,
        c,
        v: 1000
    };
}


function evaluationTimestamp(
    hour = 9,
    minute = 30
) {

    return istTimestamp(
        hour,
        minute
    );
}


function makeCandles(
    signalTs
) {

    return [
        candle(
            signalTs,
            100,
            101,
            99,
            100
        ),

        candle(
            signalTs + 5 * 60 * 1000,
            100,
            101,
            99,
            100
        )
    ];
}


test(
    "Component 7 builds the complete four-stock paper universe",
    () => {

        const harness =
            createMultiStockForwardHarness({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol: {},
                nowMs:
                    istTimestamp(
                        10,
                        0
                    )
            });

        assert.deepEqual(
            harness.universe.instruments.map(
                instrument =>
                    instrument.symbol
            ),
            [
                "NIFTY 50",
                "INFY",
                "SBIN",
                "TCS"
            ]
        );

        assert.equal(
            Object.keys(
                harness.state.stocks
            ).length,
            4
        );

        assert.equal(
            Object.keys(
                harness.cursorState.cursors
            ).length,
            4
        );
    }
);


test(
    "Component 7 preserves PMSE instrument resolution through orchestration",
    () => {

        const signalTs =
            evaluationTimestamp();

        const candlesBySymbol = {
            "NIFTY 50":
                makeCandles(signalTs),

            INFY:
                makeCandles(signalTs),

            SBIN:
                makeCandles(signalTs),

            TCS:
                makeCandles(signalTs)
        };

        const result =
            runMultiStockForwardHarness({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol,
                nowMs:
                    signalTs +
                    10 * 60 * 1000
            });

        const instruments =
            result.orchestration.universe.instruments;

        assert.equal(
            instruments.length,
            4
        );

        const infy =
            instruments.find(
                instrument =>
                    instrument.symbol === "INFY"
            );

        const sbin =
            instruments.find(
                instrument =>
                    instrument.symbol === "SBIN"
            );

        const tcs =
            instruments.find(
                instrument =>
                    instrument.symbol === "TCS"
            );

        assert.equal(
            infy.securityId,
            "12345"
        );

        assert.equal(
            sbin.securityId,
            "54321"
        );

        assert.equal(
            tcs.securityId,
            "67890"
        );
    }
);


test(
    "Component 7 evaluates all four stocks independently",
    () => {

        const signalTs =
            evaluationTimestamp();

        const candlesBySymbol = {
            "NIFTY 50":
                makeCandles(signalTs),

            INFY:
                makeCandles(signalTs),

            SBIN:
                makeCandles(signalTs),

            TCS:
                makeCandles(signalTs)
        };

        const result =
            runMultiStockForwardHarness({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol,
                nowMs:
                    signalTs +
                    10 * 60 * 1000
            });

        assert.equal(
            result.orchestration.results.length,
            4
        );

        assert.deepEqual(
            result.orchestration.results.map(
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
    "Component 7 keeps the entire pipeline paper-only",
    () => {

        const signalTs =
            evaluationTimestamp();

        const result =
            runMultiStockForwardHarness({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol: {
                    "NIFTY 50":
                        makeCandles(signalTs),
                    INFY:
                        makeCandles(signalTs),
                    SBIN:
                        makeCandles(signalTs),
                    TCS:
                        makeCandles(signalTs)
                },
                nowMs:
                    signalTs +
                    10 * 60 * 1000
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
            result.tradingEnabled,
            false
        );

        assert.equal(
            result.brokerCalled,
            false
        );

        assert.equal(
            result.orderCreationEnabled,
            false
        );

        assert.equal(
            result.learningEnabled,
            false
        );

        assert.equal(
            result.strategyMutation,
            false
        );

        assert.equal(
            result.optimizationEnabled,
            false
        );

        assert.equal(
            result.promotionEnabled,
            false
        );
    }
);


test(
    "Component 7 preserves four-stock state isolation",
    () => {

        const signalTs =
            evaluationTimestamp();

        const result =
            runMultiStockForwardHarness({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol: {
                    INFY:
                        makeCandles(signalTs)
                },
                nowMs:
                    signalTs +
                    10 * 60 * 1000
            });

        assert.ok(
            result.state.stocks.INFY
        );

        assert.ok(
            result.state.stocks.SBIN
        );

        assert.ok(
            result.state.stocks.TCS
        );

        assert.ok(
            result.state.stocks["NIFTY 50"]
        );

        assert.notStrictEqual(
            result.state.stocks.INFY,
            result.state.stocks.SBIN
        );

        assert.notStrictEqual(
            result.state.stocks.SBIN,
            result.state.stocks.TCS
        );
    }
);


test(
    "Component 7 rejects fewer than three PMSE candidates",
    () => {

        const invalidPMSE = {
            ...pmseInput,
            candidates: [
                {
                    symbol: "INFY",
                    score: 60,
                    newsRisk: "LOW"
                },
                {
                    symbol: "SBIN",
                    score: 55,
                    newsRisk: "LOW"
                }
            ]
        };

        assert.throws(
            () =>
                createMultiStockForwardHarness({
                    pmseInput: invalidPMSE,
                    resolvedPMSEInstruments
                }),
            /At least three PMSE candidates are required/
        );
    }
);


test(
    "Component 7 rejects incomplete PMSE instrument identity",
    () => {

        const invalidInstruments = [
            {
                symbol: "INFY",
                securityId: "12345",
                exchange: "NSE"
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

        assert.throws(
            () =>
                createMultiStockForwardHarness({
                    pmseInput,
                    resolvedPMSEInstruments:
                        invalidInstruments
                }),
            /segment/
        );
    }
);


test(
    "Component 7 prevents future candles from entering the forward pipeline",
    () => {

        const signalTs =
            evaluationTimestamp();

        const futureTs =
            signalTs +
            5 * 60 * 1000;

        const result =
            runMultiStockForwardHarness({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol: {
                    INFY: [
                        candle(signalTs),
                        candle(futureTs)
                    ]
                },
                nowMs:
                    signalTs +
                    60 * 1000
            });

        const infy =
            result.forward.results.find(
                item =>
                    item.symbol === "INFY"
            );

        assert.ok(
            infy
        );

        assert.equal(
            infy.status,
            "NO_NEW_CANDLE"
        );

        assert.equal(
            result.cursorState.cursors.INFY.lastProcessedCandleTs,
            null
        );
    }
);

import test from "node:test";
import assert from "node:assert/strict";

import {
    runMultiStockLiveForwardAdapter
} from "./multi-stock-live-forward-adapter-v1.js";

import {
    createMultiStockState
} from "./multi-stock-state-v1.js";

import {
    createMultiStockForwardCursor
} from "./multi-stock-forward-coordinator-v1.js";


const NOW_MS =
    Date.parse(
        "2026-09-14T10:00:00+05:30"
    );


const PMSE_INPUT = {

    source:
        "PMSE",

    mode:
        "PAPER_ONLY",

    candidates: [

        {
            symbol:
                "INFY",

            score:
                60,

            newsRisk:
                "LOW"

        },

        {
            symbol:
                "SBIN",

            score:
                55,

            newsRisk:
                "LOW"

        },

        {
            symbol:
                "TCS",

            score:
                50,

            newsRisk:
                "LOW"

        }

    ]

};


const RESOLVED_PMSE_INSTRUMENTS = [

    {
        symbol:
            "INFY",

        securityId:
            "12345",

        exchange:
            "NSE",

        segment:
            "EQUITY"

    },

    {
        symbol:
            "SBIN",

        securityId:
            "23456",

        exchange:
            "NSE",

        segment:
            "EQUITY"

    },

    {
        symbol:
            "TCS",

        securityId:
            "34567",

        exchange:
            "NSE",

        segment:
            "EQUITY"

    }

];


const INSTRUMENTS = [

    {
        symbol:
            "NIFTY 50",

        instrumentType:
            "INDEX",

        source:
            "FIXED_NIFTY",

        securityId:
            "40000001",

        exchange:
            "NIDX",

        segment:
            "INDEX"

    },

    ...RESOLVED_PMSE_INSTRUMENTS

];


function createCandleSeries(
    basePrice
) {

    const candles = [];

    const start =
        Date.parse(
            "2026-09-14T09:15:00+05:30"
        );

    for (
        let i = 0;
        i < 60;
        i++
    ) {

        const ts =
            start +
            (
                i *
                5 *
                60 *
                1000
            );

        const close =
            basePrice +
            (
                i *
                0.05
            );

        candles.push({

            ts,

            o:
                close - 0.02,

            h:
                close + 0.05,

            l:
                close - 0.05,

            c:
                close,

            v:
                1000

        });

    }

    return candles;

}


function createMockFetcher() {

    return async function fetcher(
        url,
        options
    ) {

        assert.ok(
            url.includes(
                "/market/historical/5minute"
            )
        );

        assert.equal(
            options?.method,
            "GET"
        );

        const parsed =
            new URL(url);

        const equityScripCode =
            parsed.searchParams.get(
                "scrip-codes"
            );

        const basePrices = {

            "NIDX_40000001":
                24000,

            "NSE_12345":
                1500,

            "NSE_23456":
                800,

            "NSE_34567":
                3500

        };

        const basePrice =
            basePrices[
                equityScripCode
            ];

        assert.ok(
            Number.isFinite(basePrice),
            `Unexpected equityScripCode: ${equityScripCode}`
        );

        return {

            ok:
                true,

            status:
                200,

            async json() {

                return {

                    data:
                        createCandleSeries(
                            basePrice
                        )

                };

            }

        };

    };

}


function createInitialState() {

    return createMultiStockState(
        INSTRUMENTS
    );

}


function createInitialCursor() {

    return createMultiStockForwardCursor(
        INSTRUMENTS
    );

}


test(
    "Component 9A runs the complete four-stock paper pipeline",
    async () => {

        const state =
            createInitialState();

        const cursorState =
            createInitialCursor();

        const result =
            await runMultiStockLiveForwardAdapter({

                pmseInput:
                    PMSE_INPUT,

                resolvedPMSEInstruments:
                    RESOLVED_PMSE_INSTRUMENTS,

                state,

                cursorState,

                accessToken:
                    "TEST_TOKEN",

                nowMs:
                    NOW_MS,

                fetcher:
                    createMockFetcher()

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


        assert.equal(
            result.candles.stocks.length,
            4
        );


        assert.equal(
            result.evaluation.universe.instruments.length,
            4
        );


        assert.equal(
            result.evaluation.results.length,
            4
        );


        assert.equal(
            result.forward.results.length,
            4
        );


        assert.deepEqual(

            result.evaluation.universe
                .instruments
                .map(
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

    }
);


test(
    "Component 9A keeps stock state independent",
    async () => {

        const state =
            createInitialState();

        const cursorState =
            createInitialCursor();


        const result =
            await runMultiStockLiveForwardAdapter({

                pmseInput:
                    PMSE_INPUT,

                resolvedPMSEInstruments:
                    RESOLVED_PMSE_INSTRUMENTS,

                state,

                cursorState,

                accessToken:
                    "TEST_TOKEN",

                nowMs:
                    NOW_MS,

                fetcher:
                    createMockFetcher()

            });


        assert.equal(
            Object.keys(
                state.stocks
            ).length,
            4
        );


        for (
            const symbol
            of [
                "NIFTY 50",
                "INFY",
                "SBIN",
                "TCS"
            ]
        ) {

            assert.ok(
                state.stocks[symbol],
                `Missing state for ${symbol}`
            );

        }


        assert.notEqual(
            state.stocks["NIFTY 50"],
            state.stocks["INFY"]
        );

        assert.notEqual(
            state.stocks["INFY"],
            state.stocks["SBIN"]
        );

        assert.notEqual(
            state.stocks["SBIN"],
            state.stocks["TCS"]
        );

    }
);


test(
    "Component 9A rejects unsafe state",
    async () => {

        const state =
            createInitialState();

        state.tradingEnabled =
            true;

        const cursorState =
            createInitialCursor();


        await assert.rejects(

            () =>
                runMultiStockLiveForwardAdapter({

                    pmseInput:
                        PMSE_INPUT,

                    resolvedPMSEInstruments:
                        RESOLVED_PMSE_INSTRUMENTS,

                    state,

                    cursorState,

                    accessToken:
                        "TEST_TOKEN",

                    nowMs:
                        NOW_MS,

                    fetcher:
                        createMockFetcher()

                }),

            /tradingEnabled=false/

        );

    }
);


test(
    "Component 9A rejects incomplete PMSE resolution",
    async () => {

        const state =
            createInitialState();

        const cursorState =
            createInitialCursor();


        await assert.rejects(

            () =>
                runMultiStockLiveForwardAdapter({

                    pmseInput:
                        PMSE_INPUT,

                    resolvedPMSEInstruments:
                        [
                            RESOLVED_PMSE_INSTRUMENTS[0]
                        ],

                    state,

                    cursorState,

                    accessToken:
                        "TEST_TOKEN",

                    nowMs:
                        NOW_MS,

                    fetcher:
                        createMockFetcher()

                }),

            /Resolved PMSE instrument not found/

        );

    }
);

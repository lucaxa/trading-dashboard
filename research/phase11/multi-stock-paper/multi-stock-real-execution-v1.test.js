
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    evaluateMultiStockUniverse
} from "./multi-stock-orchestrator-v1.js";

import {
    createMultiStockState
} from "./multi-stock-state-v1.js";

import {
    createMultiStockForwardCursor,
    advanceMultiStockForward
} from "./multi-stock-forward-coordinator-v1.js";

const CANDLE_FILE =
    "research/phase11/episode-outcome-analyzer/inputs/candles/session-03-21-aug-candles.json";

function loadRealCandles() {

    const raw =
        JSON.parse(
            fs.readFileSync(
                CANDLE_FILE,
                "utf8"
            )
        );

    return raw.candles.map(candle => ({
        ts: Number(candle.ts ?? candle.timestamp),
        o: Number(candle.o ?? candle.open),
        h: Number(candle.h ?? candle.high),
        l: Number(candle.l ?? candle.low),
        c: Number(candle.c ?? candle.close),
        v: Number(candle.v ?? candle.volume ?? 0)
    }));
}

const allCandles =
    loadRealCandles();

/*
 * The real frozen V10.20 SELL signal is
 * candle index 58.
 */
const SIGNAL_INDEX = 58;

const signalCandle =
    allCandles[SIGNAL_INDEX];

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

const instruments = [
    {
        symbol: "NIFTY 50",
        securityId: "40000001",
        exchange: "NIDX",
        segment: "INDEX"
    },
    ...resolvedPMSEInstruments
];

function candlesThrough(index) {

    return allCandles.slice(
        0,
        index + 1
    );
}

function buildCandlesBySymbol(index) {

    const candles =
        candlesThrough(index);

    return {
        "NIFTY 50":
            candles,

        INFY:
            candles,

        SBIN:
            candles,

        TCS:
            candles
    };
}

function nowAfterCandle(index) {

    return (
        allCandles[index].ts +
        5 * 60 * 1000
    );
}

test(
    "real V10.20 SELL signal reaches multi-stock paper execution path",
    () => {

        assert.equal(
            signalCandle.ts,
            1787301300000
        );

        assert.equal(
            signalCandle.c,
            24225.45
        );

        const candlesBySymbol =
            buildCandlesBySymbol(
                SIGNAL_INDEX + 1
            );

        const orchestration =
            evaluateMultiStockUniverse({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol,
                nowMs:
                    nowAfterCandle(
                        SIGNAL_INDEX + 1
                    )
            });

        const nifty =
            orchestration.results.find(
                item =>
                    item.symbol ===
                    "NIFTY 50"
            );

        assert.ok(nifty);
        assert.equal(
            nifty.status,
            "EVALUATED"
        );

        assert.equal(
            nifty.result.signal,
            "SELL"
        );

        assert.equal(
            nifty.result.signalCandle.ts,
            signalCandle.ts
        );

        assert.ok(
            nifty.result.riskReference
        );

        assert.equal(
            orchestration.universe.instruments.length,
            4
        );

        assert.equal(
            orchestration.safety.researchOnly,
            true
        );

        assert.equal(
            orchestration.safety.realOrders,
            false
        );
    }
);

test(
    "real SELL signal creates the frozen V10.25 paper entry on next candle",
    () => {

        const state =
            createMultiStockState(instruments);

        const cursorState =
            createMultiStockForwardCursor(
                instruments
            );

        /*
         * Evaluate through the real signal candle.
         */
        const orchestration =
            evaluateMultiStockUniverse({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol:
                    buildCandlesBySymbol(
                        SIGNAL_INDEX + 1
                    ),
                nowMs:
                    nowAfterCandle(
                        SIGNAL_INDEX + 1
                    )
            });

        const evaluations =
            orchestration.results
                .filter(
                    item =>
                        item?.status ===
                        "EVALUATED" &&
                        item?.result
                )
                .map(
                    item => ({
                        ...item.result,
                        symbol:
                            item.symbol,
                        candle:
                            item.result.signalCandle,
                        signalTimestamp:
                            item.result.signalCandle?.ts ??
                            null
                    })
                );

        /*
         * Process the signal candle.
         */
        const first =
            advanceMultiStockForward({
                state,
                cursorState,
                evaluations,
                candlesBySymbol:
                    buildCandlesBySymbol(
                        SIGNAL_INDEX
                    ),
                nowMs:
                    nowAfterCandle(
                        SIGNAL_INDEX + 1
                    )
            });

        const firstNifty =
            first.results.find(
                item =>
                    item.symbol ===
                    "NIFTY 50"
            );

        assert.ok(firstNifty);

        /*
         * The next candle is index 59.
         * Its open is 24225.15.
         */
        const entryIndex =
            SIGNAL_INDEX + 1;

        const entryNow =
            nowAfterCandle(
                entryIndex
            );

        const orchestrationAtEntry =
            evaluateMultiStockUniverse({
                pmseInput,
                resolvedPMSEInstruments,
                candlesBySymbol:
                    buildCandlesBySymbol(
                        entryIndex
                    ),
                nowMs:
                    entryNow
            });

        const evaluationsAtEntry =
            orchestrationAtEntry.results
                .filter(
                    item =>
                        item?.status ===
                        "EVALUATED" &&
                        item?.result
                )
                .map(
                    item => ({
                        ...item.result,
                        symbol:
                            item.symbol,
                        candle:
                            item.result.signalCandle,
                        signalTimestamp:
                            item.result.signalCandle?.ts ??
                            null
                    })
                );

        const second =
            advanceMultiStockForward({
                state,
                cursorState,
                evaluations:
                    evaluationsAtEntry,
                candlesBySymbol:
                    buildCandlesBySymbol(
                        entryIndex
                    ),
                nowMs:
                    entryNow
            });

        const nifty =
            second.results.find(
                item =>
                    item.symbol ===
                    "NIFTY 50"
            );

        assert.ok(nifty);

        assert.equal(
            nifty.runner.state.position.active,
            true
        );

        assert.equal(
            nifty.runner.state.position.side,
            "SHORT"
        );

        assert.equal(
            nifty.runner.state.position.entry,
            24225.15
        );

        assert.equal(
            nifty.runner.state.position.stop,
            24240.42281435105
        );

        assert.equal(
            nifty.runner.state.position.target,
            24194.6043712979
        );
    }
);

test(
    "real historical candles produce the expected frozen STOP LOSS",
    () => {

        const state =
            createMultiStockState(instruments);

        const cursorState =
            createMultiStockForwardCursor(
                instruments
            );

        /*
         * Build the complete real session.
         *
         * The genuine signal occurs at index 58.
         * Entry occurs on index 59.
         * Index 61 reaches 24243.15,
         * above the frozen SELL stop 24240.72.
         */
        const endIndex = 61;

        for (
            let index = SIGNAL_INDEX;
            index <= endIndex;
            index++
        ) {

            const candlesBySymbol =
                buildCandlesBySymbol(
                    index
                );

            const orchestration =
                evaluateMultiStockUniverse({
                    pmseInput,
                    resolvedPMSEInstruments,
                    candlesBySymbol,
                    nowMs:
                        nowAfterCandle(
                            index
                        )
                });

            const evaluations =
                orchestration.results
                    .filter(
                        item =>
                            item?.status ===
                            "EVALUATED" &&
                            item?.result
                    )
                    .map(
                        item => ({
                            ...item.result,
                            symbol:
                                item.symbol,
                            candle:
                                item.result.signalCandle,
                            signalTimestamp:
                                item.result.signalCandle?.ts ??
                                null
                        })
                    );

            advanceMultiStockForward({
                state,
                cursorState,
                evaluations,
                candlesBySymbol,
                nowMs:
                    nowAfterCandle(
                        index
                    )
            });

        }

        const nifty =
            state.stocks["NIFTY 50"];

        assert.ok(nifty);

        assert.equal(
            nifty.position.active,
            false
        );

        assert.ok(
            nifty.outcome
        );

        assert.equal(
            nifty.outcome.reason,
            "STOP LOSS"
        );

        assert.equal(
            nifty.outcome.exit,
            24240.42281435105
        );

        assert.equal(
            nifty.opportunity.lifecycleState,
            "CLOSED"
        );

        assert.ok(
            nifty.cooldown.remainingCandles > 0
        );

        /*
         * Safety boundary remains intact.
         */
        assert.equal(
            state.researchOnly,
            true
        );

        assert.equal(
            state.learningEnabled,
            false
        );

        assert.equal(
            state.strategyMutation,
            false
        );

        assert.equal(
            state.promotionEnabled,
            false
        );

        assert.equal(
            state.brokerCalled,
            false
        );

        assert.equal(
            state.orderCreationEnabled,
            false
        );
    }
);

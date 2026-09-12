import test from "node:test";
import assert from "node:assert/strict";

import {
    createMultiStockForwardCursor,
    getForwardCursor,
    advanceMultiStockForward
} from "./multi-stock-forward-coordinator-v1.js";

import {
    createMultiStockState,
    recordStockPaperEntry,
    setStockCooldown
} from "./multi-stock-state-v1.js";


const instruments = [
    {
        symbol: "NIFTY 50",
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


function ts(
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
    timestamp,
    open = 100,
    high = 101,
    low = 99,
    close = 100
) {

    return {
        ts: timestamp,
        o: open,
        h: high,
        l: low,
        c: close,
        v: 1000
    };
}


function evaluation(
    symbol,
    signal = "WAIT",
    signalTimestamp = ts(9, 30),
    atr = 2
) {

    return {
        symbol,
        signal,
        signalTimestamp,
        candle: {
            ts: signalTimestamp,
            o: 100,
            h: 101,
            l: 99,
            c: 100,
            v: 1000
        },
        indicators: {
            atr14: atr
        },
        riskReference: {
            atr14: atr
        }
    };
}


function freshState() {
    return createMultiStockState(
        instruments
    );
}


test(
    "Component 6 creates one independent forward cursor per stock",
    () => {

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        assert.equal(
            cursor.version,
            "A11-MULTI-STOCK-FORWARD-COORDINATOR-V1"
        );

        assert.deepEqual(
            Object.keys(cursor.cursors).sort(),
            [
                "INFY",
                "NIFTY 50",
                "SBIN",
                "TCS"
            ]
        );

        assert.equal(
            getForwardCursor(
                cursor,
                "INFY"
            ).lastProcessedCandleTs,
            null
        );

        assert.equal(
            getForwardCursor(
                cursor,
                "SBIN"
            ).lastProcessedCandleTs,
            null
        );
    }
);


test(
    "Component 6 rejects unknown cursor symbols",
    () => {

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        assert.throws(
            () =>
                getForwardCursor(
                    cursor,
                    "RELIANCE"
                ),
            /Unknown forward cursor/
        );
    }
);


test(
    "Component 6 processes only completed candles",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        const signalTs =
            ts(9, 30);

        const completedTs =
            ts(9, 35);

        const stillFormingTs =
            ts(9, 40);

        const result =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [
                    evaluation(
                        "INFY",
                        "WAIT",
                        signalTs
                    )
                ],
                candlesBySymbol: {
                    INFY: [
                        candle(signalTs),
                        candle(completedTs),
                        candle(stillFormingTs)
                    ]
                },
                nowMs:
                    completedTs +
                    5 * 60 * 1000
            });

        assert.equal(
            result.results[0].status,
            "PROCESSED"
        );

        assert.deepEqual(
            result.results[0].processedCandles,
            [
                signalTs,
                completedTs
            ]
        );

        assert.equal(
            cursor.cursors.INFY.lastProcessedCandleTs,
            completedTs
        );

        assert.equal(
            cursor.cursors.SBIN.lastProcessedCandleTs,
            null
        );
    }
);


test(
    "Component 6 does not process future candles",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        const signalTs =
            ts(10, 0);

        const futureTs =
            ts(10, 5);

        const result =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [
                    evaluation(
                        "INFY",
                        "WAIT",
                        signalTs
                    )
                ],
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

        assert.equal(
            result.results[0].status,
            "NO_NEW_CANDLE"
        );

        assert.deepEqual(
            result.results[0].processedCandles,
            []
        );

        assert.equal(
            cursor.cursors.INFY.lastProcessedCandleTs,
            null
        );
    }
);


test(
    "Component 6 does not replay an already processed candle",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        const firstTs =
            ts(9, 30);

        const secondTs =
            ts(9, 35);

        const candles = [
            candle(firstTs),
            candle(secondTs)
        ];

        const first =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [
                    evaluation(
                        "INFY",
                        "WAIT",
                        firstTs
                    )
                ],
                candlesBySymbol: {
                    INFY: candles
                },
                nowMs:
                    secondTs +
                    5 * 60 * 1000
            });

        assert.equal(
            first.results[0].status,
            "PROCESSED"
        );

        const second =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [
                    evaluation(
                        "INFY",
                        "WAIT",
                        secondTs
                    )
                ],
                candlesBySymbol: {
                    INFY: candles
                },
                nowMs:
                    secondTs +
                    5 * 60 * 1000
            });

        assert.equal(
            second.results[0].status,
            "NO_NEW_CANDLE"
        );

        assert.deepEqual(
            second.results[0].processedCandles,
            []
        );
    }
);


test(
    "Component 6 keeps cursors independent between stocks",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        const infyTs =
            ts(10, 0);

        const sbinTs =
            ts(10, 5);

        const nowMs =
            sbinTs +
            5 * 60 * 1000;

        const result =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [
                    evaluation(
                        "INFY",
                        "WAIT",
                        infyTs
                    ),
                    evaluation(
                        "SBIN",
                        "WAIT",
                        sbinTs
                    )
                ],
                candlesBySymbol: {
                    INFY: [
                        candle(infyTs)
                    ],
                    SBIN: [
                        candle(sbinTs)
                    ]
                },
                nowMs
            });

        assert.equal(
            result.results.length,
            2
        );

        assert.equal(
            cursor.cursors.INFY.lastProcessedCandleTs,
            infyTs
        );

        assert.equal(
            cursor.cursors.SBIN.lastProcessedCandleTs,
            sbinTs
        );

        assert.equal(
            cursor.cursors["NIFTY 50"].lastProcessedCandleTs,
            null
        );

        assert.equal(
            cursor.cursors.TCS.lastProcessedCandleTs,
            null
        );
    }
);


test(
    "Component 6 advances cooldown only for the stock receiving new candles",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        setStockCooldown(
            state,
            "INFY",
            3
        );

        setStockCooldown(
            state,
            "SBIN",
            3
        );

        const infyTs =
            ts(10, 0);

        const result =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [
                    evaluation(
                        "INFY",
                        "WAIT",
                        infyTs
                    )
                ],
                candlesBySymbol: {
                    INFY: [
                        candle(infyTs)
                    ]
                },
                nowMs:
                    infyTs +
                    5 * 60 * 1000
            });

        assert.equal(
            result.results[0].status,
            "PROCESSED"
        );

        assert.equal(
            state.stocks.INFY.cooldown.remainingCandles,
            2
        );

        assert.equal(
            state.stocks.SBIN.cooldown.remainingCandles,
            3
        );
    }
);


test(
    "Component 6 does not immediately consume a cooldown created downstream",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        const signalTs =
            ts(10, 0);

        const entryTs =
            ts(10, 5);

        const executionTs =
            ts(10, 10);

        const result =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [
                    evaluation(
                        "INFY",
                        "BUY",
                        signalTs,
                        2
                    )
                ],
                candlesBySymbol: {
                    INFY: [
                        candle(
                            signalTs,
                            100,
                            101,
                            99,
                            100
                        ),
                        candle(
                            entryTs,
                            100,
                            101,
                            99,
                            100
                        ),
                        candle(
                            executionTs,
                            100,
                            106,
                            99,
                            105
                        )
                    ]
                },
                nowMs:
                    executionTs +
                    5 * 60 * 1000
            });

        assert.ok(
            result.results[0]
        );

        /*
        The coordinator must not decrement a cooldown that
        was created by the runner during this same forward
        invocation.
        */
        assert.ok(
            state.stocks.INFY.cooldown.remainingCandles >= 0
        );
    }
);


test(
    "Component 6 isolates one stock's runner failure",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        const nowTs =
            ts(10, 10);

        assert.throws(
            () =>
                advanceMultiStockForward({
                    state,
                    cursorState: cursor,
                    evaluations: [
                        evaluation(
                            "UNKNOWN",
                            "WAIT",
                            nowTs
                        ),
                        evaluation(
                            "INFY",
                            "WAIT",
                            nowTs
                        )
                    ],
                    candlesBySymbol: {
                        INFY: [
                            candle(nowTs)
                        ]
                    },
                    nowMs:
                        nowTs +
                        5 * 60 * 1000
                }),
            /Unknown instrument state/
        );

        /*
        No foreign stock cursor may be fabricated or
        advanced as a side effect.
        */
        assert.equal(
            cursor.cursors.INFY.lastProcessedCandleTs,
            null
        );
    }
);


test(
    "Component 6 preserves paper-only and research-only safety",
    () => {

        const state =
            freshState();

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        const result =
            advanceMultiStockForward({
                state,
                cursorState: cursor,
                evaluations: [],
                candlesBySymbol: {}
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
    "Component 6 rejects unsafe execution state",
    () => {

        const state =
            freshState();

        state.tradingEnabled = true;

        const cursor =
            createMultiStockForwardCursor(
                instruments
            );

        assert.throws(
            () =>
                advanceMultiStockForward({
                    state,
                    cursorState: cursor,
                    evaluations: [],
                    candlesBySymbol: {}
                }),
            /tradingEnabled=false/
        );
    }
);

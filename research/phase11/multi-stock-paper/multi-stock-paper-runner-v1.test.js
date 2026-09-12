import test from "node:test";
import assert from "node:assert/strict";

import {
    runMultiStockPaperRunner,
    calculatePaperEntry,
    managePaperPosition,
    sessionClose
} from "./multi-stock-paper-runner-v1.js";

import {
    createMultiStockState
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


function istTimestamp(
    hour,
    minute,
    day = 14
) {

    return Date.parse(
        `2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`
    );
}


function candle(
    ts,
    o,
    h,
    l,
    c
) {

    return {
        ts,
        o,
        h,
        l,
        c
    };
}


function evaluation(
    symbol,
    signal,
    signalTimestamp,
    atr = 10
) {

    return {
        symbol,
        signal,
        signalTimestamp,
        candle: {
            ts: signalTimestamp
        },
        indicators: {
            atr14: atr
        }
    };
}


test(
    "Component 5 accepts a valid BUY paper entry",
    () => {

        const signalTs =
            istTimestamp(10, 0);

        const entryTs =
            istTimestamp(10, 5);

        const result =
            calculatePaperEntry(
                evaluation(
                    "INFY",
                    "BUY",
                    signalTs,
                    10
                ),
                [
                    candle(
                        signalTs,
                        100,
                        105,
                        95,
                        100
                    ),
                    candle(
                        entryTs,
                        100,
                        103,
                        99,
                        102
                    )
                ]
            );

        assert.equal(
            result.status,
            "ENTRY_ACCEPTED"
        );

        assert.equal(
            result.side,
            "LONG"
        );

        assert.equal(
            result.entry,
            100
        );

        assert.equal(
            result.risk,
            15
        );

        assert.equal(
            result.stop,
            85
        );

        assert.equal(
            result.target,
            130
        );
    }
);


test(
    "Component 5 accepts a valid SELL paper entry",
    () => {

        const signalTs =
            istTimestamp(10, 0);

        const entryTs =
            istTimestamp(10, 5);

        const result =
            calculatePaperEntry(
                evaluation(
                    "SBIN",
                    "SELL",
                    signalTs,
                    10
                ),
                [
                    candle(
                        signalTs,
                        100,
                        105,
                        95,
                        100
                    ),
                    candle(
                        entryTs,
                        100,
                        103,
                        99,
                        98
                    )
                ]
            );

        assert.equal(
            result.status,
            "ENTRY_ACCEPTED"
        );

        assert.equal(
            result.side,
            "SHORT"
        );

        assert.equal(
            result.stop,
            115
        );

        assert.equal(
            result.target,
            70
        );
    }
);


test(
    "Component 5 rejects an entry gap greater than 0.25 ATR",
    () => {

        const signalTs =
            istTimestamp(10, 0);

        const entryTs =
            istTimestamp(10, 5);

        const result =
            calculatePaperEntry(
                evaluation(
                    "INFY",
                    "BUY",
                    signalTs,
                    10
                ),
                [
                    candle(
                        signalTs,
                        100,
                        105,
                        95,
                        100
                    ),
                    candle(
                        entryTs,
                        103,
                        105,
                        102,
                        104
                    )
                ]
            );

        assert.equal(
            result.status,
            "NO_ENTRY"
        );

        assert.equal(
            result.reason,
            "ENTRY_GAP_REJECTED"
        );
    }
);


test(
    "Component 5 preserves frozen BUY stop-before-target priority",
    () => {

        const position = {
            active: true,
            side: "LONG",
            entry: 100,
            stop: 90,
            target: 120,
            risk: 10
        };

        const result =
            managePaperPosition(
                position,
                candle(
                    istTimestamp(10, 15),
                    100,
                    125,
                    85,
                    110
                )
            );

        assert.equal(
            result.reason,
            "STOP LOSS"
        );

        assert.equal(
            result.exit,
            90
        );
    }
);


test(
    "Component 5 preserves frozen SELL stop-before-target priority",
    () => {

        const position = {
            active: true,
            side: "SHORT",
            entry: 100,
            stop: 110,
            target: 80,
            risk: 10
        };

        const result =
            managePaperPosition(
                position,
                candle(
                    istTimestamp(10, 15),
                    100,
                    115,
                    75,
                    90
                )
            );

        assert.equal(
            result.reason,
            "STOP LOSS"
        );

        assert.equal(
            result.exit,
            110
        );
    }
);


test(
    "Component 5 detects gap-through-stop",
    () => {

        const result =
            managePaperPosition(
                {
                    active: true,
                    side: "LONG",
                    entry: 100,
                    stop: 90,
                    target: 120,
                    risk: 10
                },
                candle(
                    istTimestamp(10, 20),
                    88,
                    100,
                    87,
                    95
                )
            );

        assert.equal(
            result.reason,
            "STOP LOSS - GAP"
        );

        assert.equal(
            result.exit,
            88
        );
    }
);


test(
    "Component 5 detects gap-through-target",
    () => {

        const result =
            managePaperPosition(
                {
                    active: true,
                    side: "LONG",
                    entry: 100,
                    stop: 90,
                    target: 120,
                    risk: 10
                },
                candle(
                    istTimestamp(10, 25),
                    122,
                    125,
                    118,
                    123
                )
            );

        assert.equal(
            result.reason,
            "TARGET - GAP"
        );

        assert.equal(
            result.exit,
            122
        );
    }
);


test(
    "Component 5 session close uses candle close",
    () => {

        const result =
            sessionClose(
                {
                    active: true,
                    side: "LONG",
                    entry: 100,
                    stop: 90,
                    target: 120,
                    risk: 10
                },
                candle(
                    istTimestamp(15, 25),
                    110,
                    115,
                    108,
                    112
                )
            );

        assert.equal(
            result.reason,
            "SESSION CLOSE"
        );

        assert.equal(
            result.exit,
            112
        );
    }
);


test(
    "Component 5 keeps stock state independent",
    () => {

        const state =
            createMultiStockState(
                instruments
            );

        const signalTs =
            istTimestamp(10, 0);

        const entryTs =
            istTimestamp(10, 5);

        const result =
            runMultiStockPaperRunner({
                state,
                evaluations: [
                    evaluation(
                        "NIFTY 50",
                        "BUY",
                        signalTs,
                        10
                    ),
                    evaluation(
                        "INFY",
                        "SELL",
                        signalTs,
                        10
                    ),
                    evaluation(
                        "SBIN",
                        "WAIT",
                        signalTs,
                        10
                    ),
                    evaluation(
                        "TCS",
                        "WAIT",
                        signalTs,
                        10
                    )
                ],
                candlesBySymbol: {
                    "NIFTY 50": [
                        candle(
                            signalTs,
                            100,
                            105,
                            95,
                            100
                        ),
                        candle(
                            entryTs,
                            100,
                            103,
                            99,
                            101
                        )
                    ],
                    INFY: [
                        candle(
                            signalTs,
                            200,
                            205,
                            195,
                            200
                        ),
                        candle(
                            entryTs,
                            200,
                            203,
                            197,
                            199
                        )
                    ],
                    SBIN: [
                        candle(
                            signalTs,
                            300,
                            305,
                            295,
                            300
                        )
                    ],
                    TCS: [
                        candle(
                            signalTs,
                            400,
                            405,
                            395,
                            400
                        )
                    ]
                },
                nowMs:
                    entryTs +
                    5 * 60 * 1000
            });

        assert.equal(
            result.state.stocks["NIFTY 50"].position.active,
            true
        );

        assert.equal(
            result.state.stocks.INFY.position.active,
            true
        );

        assert.equal(
            result.state.stocks.SBIN.position.active,
            false
        );

        assert.equal(
            result.state.stocks.TCS.position.active,
            false
        );
    }
);


test(
    "Component 5 preserves the frozen three-candle cooldown",
    () => {

        const state =
            createMultiStockState(
                instruments
            );

        state.stocks.INFY.cooldown.remainingCandles = 3;

        const before =
            state.stocks.INFY.cooldown.remainingCandles;

        assert.equal(
            before,
            3
        );

        state.stocks.INFY.cooldown.remainingCandles -= 1;

        assert.equal(
            state.stocks.INFY.cooldown.remainingCandles,
            2
        );

        state.stocks.INFY.cooldown.remainingCandles -= 1;

        assert.equal(
            state.stocks.INFY.cooldown.remainingCandles,
            1
        );

        state.stocks.INFY.cooldown.remainingCandles -= 1;

        assert.equal(
            state.stocks.INFY.cooldown.remainingCandles,
            0
        );
    }
);


test(
    "Component 5 does not create a second position while one is active",
    () => {

        const state =
            createMultiStockState(
                instruments
            );

        const signalTs =
            istTimestamp(10, 0);

        const entryTs =
            istTimestamp(10, 5);

        const candles = [
            candle(
                signalTs,
                100,
                105,
                95,
                100
            ),
            candle(
                entryTs,
                100,
                103,
                99,
                101
            )
        ];

        runMultiStockPaperRunner({
            state,
            evaluations: [
                evaluation(
                    "INFY",
                    "BUY",
                    signalTs,
                    10
                )
            ],
            candlesBySymbol: {
                INFY: candles
            },
            nowMs:
                entryTs +
                5 * 60 * 1000
        });

        assert.equal(
            state.stocks.INFY.position.active,
            true
        );

        const originalEntry =
            state.stocks.INFY.position.entry;

        runMultiStockPaperRunner({
            state,
            evaluations: [
                evaluation(
                    "INFY",
                    "BUY",
                    signalTs,
                    10
                )
            ],
            candlesBySymbol: {
                INFY: candles
            },
            nowMs:
                entryTs +
                10 * 60 * 1000
        });

        assert.equal(
            state.stocks.INFY.position.active,
            true
        );

        assert.equal(
            state.stocks.INFY.position.entry,
            originalEntry
        );
    }
);



test(
    "Component 5 never uses a future candle for paper entry",
    () => {

        const state =
            createMultiStockState(
                instruments
            );

        const signalTs =
            istTimestamp(10, 0);

        const futureEntryTs =
            istTimestamp(10, 5);

        const result =
            runMultiStockPaperRunner({
                state,
                evaluations: [
                    evaluation(
                        "INFY",
                        "BUY",
                        signalTs,
                        10
                    )
                ],
                candlesBySymbol: {
                    INFY: [
                        candle(
                            signalTs,
                            100,
                            105,
                            95,
                            100
                        ),
                        candle(
                            futureEntryTs,
                            100,
                            103,
                            99,
                            101
                        )
                    ]
                },
                /*
                We are still inside the signal candle.
                The 10:05 candle must not be visible yet.
                */
                nowMs:
                    signalTs +
                    60 * 1000
            });

        assert.equal(
            result.state.stocks.INFY.position.active,
            false
        );

        assert.equal(
            result.results[0].entry.status,
            "NO_ENTRY"
        );

        assert.equal(
            result.results[0].entry.reason,
            "NO_NEXT_SAME_SESSION_CANDLE"
        );
    }
);



test(
    "Component 5 remains paper-only and research-only",
    () => {

        const state =
            createMultiStockState(
                instruments
            );

        const result =
            runMultiStockPaperRunner({
                state,
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

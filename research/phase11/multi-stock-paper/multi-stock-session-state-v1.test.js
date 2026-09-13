import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    createMultiStockSessionState,
    validateMultiStockSessionState,
    saveMultiStockSessionState,
    loadMultiStockSessionState
} from "./multi-stock-session-state-v1.js";


const INSTRUMENTS = [

    {
        symbol: "NIFTY 50",
        instrumentType: "INDEX",
        source: "FIXED_NIFTY",
        securityId: "40000001",
        exchange: "NIDX",
        segment: "INDEX"
    },

    {
        symbol: "LT",
        instrumentType: "EQUITY",
        source: "PMSE",
        securityId: "11483",
        exchange: "NSE",
        segment: "E"
    },

    {
        symbol: "HDFCBANK",
        instrumentType: "EQUITY",
        source: "PMSE",
        securityId: "1333",
        exchange: "NSE",
        segment: "E"
    },

    {
        symbol: "BHARTIARTL",
        instrumentType: "EQUITY",
        source: "PMSE",
        securityId: "10604",
        exchange: "NSE",
        segment: "E"
    }

];


const SESSION_DATE =
    "2026-09-14";


function createTempPath() {

    const directory =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "trademind-a11-multi-stock-"
            )
        );

    return {
        directory,
        filePath:
            path.join(
                directory,
                "session.json"
            )
    };

}


test(
    "session state creates the exact four-stock universe",
    () => {

        const session =
            createMultiStockSessionState({

                sessionDate:
                    SESSION_DATE,

                instruments:
                    INSTRUMENTS

            });

        assert.equal(
            session.version,
            "A11-MULTI-STOCK-SESSION-STATE-V1"
        );

        assert.equal(
            session.sessionDate,
            SESSION_DATE
        );

        assert.deepEqual(
            Object.keys(
                session.state.stocks
            ).sort(),
            [
                "BHARTIARTL",
                "HDFCBANK",
                "LT",
                "NIFTY 50"
            ]
        );

        assert.deepEqual(
            Object.keys(
                session.cursorState.cursors
            ).sort(),
            [
                "BHARTIARTL",
                "HDFCBANK",
                "LT",
                "NIFTY 50"
            ]
        );

    }
);


test(
    "session state preserves paper-only safety",
    () => {

        const session =
            createMultiStockSessionState({

                sessionDate:
                    SESSION_DATE,

                instruments:
                    INSTRUMENTS

            });

        assert.equal(
            session.safety.mode,
            "PAPER_ONLY"
        );

        assert.equal(
            session.safety.researchOnly,
            true
        );

        assert.equal(
            session.safety.tradingEnabled,
            false
        );

        assert.equal(
            session.safety.brokerCalled,
            false
        );

        assert.equal(
            session.safety.orderCreationEnabled,
            false
        );

        assert.equal(
            session.safety.learningEnabled,
            false
        );

        assert.equal(
            session.safety.strategyMutation,
            false
        );

        assert.equal(
            session.safety.optimizationEnabled,
            false
        );

        assert.equal(
            session.safety.promotionEnabled,
            false
        );

    }
);


test(
    "session state validates matching date and universe",
    () => {

        const session =
            createMultiStockSessionState({

                sessionDate:
                    SESSION_DATE,

                instruments:
                    INSTRUMENTS

            });

        assert.equal(
            validateMultiStockSessionState(
                session,
                {
                    sessionDate:
                        SESSION_DATE,

                    instruments:
                        INSTRUMENTS
                }
            ),
            true
        );

        assert.throws(
            () =>
                validateMultiStockSessionState(
                    session,
                    {
                        sessionDate:
                            "2026-09-15",

                        instruments:
                            INSTRUMENTS
                    }
                ),
            /Session date does not match/
        );

        assert.throws(
            () =>
                validateMultiStockSessionState(
                    session,
                    {
                        sessionDate:
                            SESSION_DATE,

                        instruments:
                            INSTRUMENTS.slice(
                                0,
                                3
                            )
                    }
                ),
            /instrument universe does not match/i
        );

    }
);


test(
    "session state rejects corrupted or unsafe state",
    () => {

        const session =
            createMultiStockSessionState({

                sessionDate:
                    SESSION_DATE,

                instruments:
                    INSTRUMENTS

            });

        const corrupted =
            structuredClone(
                session
            );

        corrupted.state.tradingEnabled =
            true;

        assert.throws(
            () =>
                validateMultiStockSessionState(
                    corrupted,
                    {
                        sessionDate:
                            SESSION_DATE,

                        instruments:
                            INSTRUMENTS
                    }
                ),
            /safety violation: tradingEnabled/
        );

        const badCursor =
            structuredClone(
                session
            );

        badCursor.cursorState.cursors.LT =
            {
                lastProcessedCandleTs:
                    "not-a-timestamp"
            };

        assert.throws(
            () =>
                validateMultiStockSessionState(
                    badCursor,
                    {
                        sessionDate:
                            SESSION_DATE,

                        instruments:
                            INSTRUMENTS
                    }
                ),
            /Invalid cursor state: LT/
        );

    }
);


test(
    "session state persists and reloads without changing the state",
    () => {

        const session =
            createMultiStockSessionState({

                sessionDate:
                    SESSION_DATE,

                instruments:
                    INSTRUMENTS

            });

        session.state.stocks["LT"].session = {
            active: true,
            sessionDate:
                SESSION_DATE
        };

        session.state.stocks["LT"].opportunity = {
            active: true,
            opportunityId:
                "A11-OPP:LT:5M:SELL:12345",
            signal:
                "SELL",
            signalTimestamp:
                12345,
            observationCount:
                4,
            heartbeatCount:
                2,
            lifecycleState:
                "NOT_REACHED"
        };

        session.cursorState.cursors.LT =
            {
                lastProcessedCandleTs:
                    12345
            };

        const {
            directory,
            filePath
        } =
            createTempPath();

        try {

            saveMultiStockSessionState(
                filePath,
                session
            );

            assert.equal(
                fs.existsSync(
                    filePath
                ),
                true
            );

            const loaded =
                loadMultiStockSessionState(
                    filePath,
                    {
                        sessionDate:
                            SESSION_DATE,

                        instruments:
                            INSTRUMENTS
                    }
                );

            assert.deepEqual(
                loaded,
                session
            );

        } finally {

            fs.rmSync(
                directory,
                {
                    recursive: true,
                    force: true
                }
            );

        }

    }
);


test(
    "session loader fails closed for a missing state file",
    () => {

        const {
            directory,
            filePath
        } =
            createTempPath();

        try {

            assert.throws(
                () =>
                    loadMultiStockSessionState(
                        filePath,
                        {
                            sessionDate:
                                SESSION_DATE,

                            instruments:
                                INSTRUMENTS
                        }
                    ),
                /Session state file not found/
            );

        } finally {

            fs.rmSync(
                directory,
                {
                    recursive: true,
                    force: true
                }
            );

        }

    }
);
/*
============================================================
A11 Multi-Stock Paper Session Controller
Isolated frontend contract test
============================================================
*/

import test from "node:test";
import assert from "node:assert/strict";

const MODULE_URL =
    "../../frontend/v2/multi-stock-paper-session.js";


function createLocalStorage() {

    const store = new Map();

    return {

        getItem(key) {
            return store.has(key)
                ? store.get(key)
                : null;
        },

        setItem(key, value) {
            store.set(
                key,
                String(value)
            );
        },

        removeItem(key) {
            store.delete(key);
        },

        clear() {
            store.clear();
        }
    };
}


test(
    "multi-stock paper session controller exposes isolated public API",
    async () => {

        globalThis.localStorage =
            createLocalStorage();

        globalThis.window = {};

        globalThis.fetch =
            async () => {

                throw new Error(
                    "fetch should not run during contract-only import"
                );
            };

        const module =
            await import(
                `${MODULE_URL}?test=${Date.now()}`
            );

        assert.equal(
            typeof module.startSession,
            "function"
        );

        assert.equal(
            typeof module.pollSession,
            "function"
        );

        assert.equal(
            typeof module.getSessionSnapshot,
            "function"
        );

        assert.equal(
            module.getSessionSnapshot(),
            null
        );
    }
);


test(
    "multi-stock paper session uses a dedicated storage key",
    async () => {

        globalThis.localStorage =
            createLocalStorage();

        globalThis.window = {};

        globalThis.fetch =
            async () => {

                throw new Error(
                    "fetch should not run during storage contract test"
                );
            };

        await import(
            `${MODULE_URL}?storage=${Date.now()}`
        );

        assert.equal(
            localStorage.getItem(
                "trademind_a11_paper_session_v1"
            ),
            null
        );

        assert.equal(
            localStorage.getItem(
                "trademind_a11_multi_stock_paper_session_v1"
            ),
            null
        );
    }
);


test(
    "multi-stock session pins the universe after bootstrap",
    async () => {

        globalThis.localStorage =
            createLocalStorage();

        globalThis.window = {};

        const calls = [];

        const bootstrapUniverse = {
            instruments: [
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
                    instrumentType: "EQUITY",
                    source: "PMSE",
                    securityId: "1594",
                    exchange: "NSE",
                    segment: "E"
                },
                {
                    symbol: "ICICIBANK",
                    instrumentType: "EQUITY",
                    source: "PMSE",
                    securityId: "4963",
                    exchange: "NSE",
                    segment: "E"
                },
                {
                    symbol: "TCS",
                    instrumentType: "EQUITY",
                    source: "PMSE",
                    securityId: "11536",
                    exchange: "NSE",
                    segment: "E"
                }
            ]
        };

        const makeForward = () => ({
            results: [
                "NIFTY 50",
                "INFY",
                "ICICIBANK",
                "TCS"
            ].map(symbol => ({
                symbol,

                runner: {
                    state: {
                        symbol,

                        session: {
                            active: true,
                            sessionDate: "2026-09-17"
                        }
                    }
                }
            })),

            cursorState: {
                version:
                    "A11-MULTI-STOCK-FORWARD-COORDINATOR-V1",

                cursors: {}
            }
        });

        globalThis.fetch =
            async (
                url,
                options = {}
            ) => {

                calls.push({
                    url,
                    options
                });

                if (
                    String(url).startsWith(
                        "/api/pmse-scan"
                    )
                ) {

                    return {
                        ok: true,

                        async json() {

                            return {
                                status: "READY",

                                output: {
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
                                            symbol: "ICICIBANK",
                                            score: 52,
                                            newsRisk: "LOW"
                                        },
                                        {
                                            symbol: "TCS",
                                            score: 46,
                                            newsRisk: "LOW"
                                        }
                                    ]
                                }
                            };
                        }
                    };
                }

                if (
                    String(url).startsWith(
                        "/api/instruments?source=equity"
                    )
                ) {

                    return {
                        ok: true,

                        async json() {

                            return {
                                success: true,
                                source: "equity",

                                data:
                                    "EXCH,SEGMENT,TRADING_SYMBOL,SECURITY_ID\n" +
                                    "NSE,E,INFY,1594\n" +
                                    "NSE,E,ICICIBANK,4963\n" +
                                    "NSE,E,TCS,11536\n"
                            };
                        }
                    };
                }

                if (
                    String(url).startsWith(
                        "/api/multi-stock-session-step"
                    )
                ) {

                    const body =
                        JSON.parse(
                            options.body
                        );

                    if (
                        body.mode === "BOOTSTRAP"
                    ) {

                        return {
                            ok: true,

                            async json() {

                                return {
                                    status: "READY",
                                    mode: "BOOTSTRAP",

                                    pmse:
                                        body.pmseInput,

                                    resolvedPMSEInstruments:
                                        body.resolvedCandidates,

                                    sessionUniverse:
                                        bootstrapUniverse
                                };
                            }
                        };
                    }

                    return {
                        ok: true,

                        async json() {

                            return {
                                status: "READY",

                                session: {
                                    universe:
                                        body.sessionUniverse,

                                    forward:
                                        makeForward()
                                }
                            };
                        }
                    };
                }

                throw new Error(
                    `Unexpected fetch URL: ${url}`
                );
            };

        const module =
            await import(
                `../../frontend/v2/multi-stock-paper-session.js?pin=${Date.now()}`
            );

        const session =
            await module.startSession();

        assert.deepEqual(
            session.sessionUniverse,
            bootstrapUniverse
        );

        const pmseCallsAfterBootstrap =
            calls.filter(
                call =>
                    String(call.url).startsWith(
                        "/api/pmse-scan"
                    )
            ).length;

        assert.equal(
            pmseCallsAfterBootstrap,
            1
        );

        const second =
            await module.pollSession();

        assert.deepEqual(
            second.session.universe,
            bootstrapUniverse
        );

        const stepCalls =
            calls.filter(
                call =>
                    String(call.url).startsWith(
                        "/api/multi-stock-session-step"
                    )
            );

        assert.equal(
            stepCalls.length,
            2
        );

        const secondBody =
            JSON.parse(
                stepCalls[1].options.body
            );

        assert.deepEqual(
            secondBody.sessionUniverse,
            bootstrapUniverse
        );

        assert.deepEqual(
            secondBody.sessionUniverse.instruments
                .map(
                    instrument =>
                        instrument.symbol
                ),
            [
                "NIFTY 50",
                "INFY",
                "ICICIBANK",
                "TCS"
            ]
        );
    }
);

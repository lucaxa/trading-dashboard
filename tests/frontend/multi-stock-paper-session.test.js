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
    "successful new-day bootstrap archives stale session",
    async () => {
        globalThis.localStorage = createLocalStorage();
        globalThis.window = {};

        const storageKey =
            "trademind_a11_multi_stock_paper_session_v1";

        // Use a deliberately old session date.
        const staleSession = {
            sessionDate: "2000-01-01",
            sessionUniverse: {
                instruments: [
                    { symbol: "NIFTY 50" },
                    { symbol: "INFY" },
                    { symbol: "ICICIBANK" },
                    { symbol: "TCS" }
                ]
            },
            state: { preserve: "old evidence" },
            cursorState: { preserve: "old cursor" }
        };

        localStorage.setItem(
            storageKey,
            JSON.stringify(staleSession)
        );

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

        globalThis.fetch = async (url, options = {}) => {
            const value = String(url);

            if (value.startsWith("/api/pmse-scan")) {
                return {
                    ok: true,
                    async json() {
                        return {
                            status: "READY",
                            output: {
                                version:
                                    "PMSE-TRADEMIND-INPUT-CONTRACT-V1",
                                source: "PMSE",
                                mode: "PAPER_ONLY",
                                candidates: [
                                    { symbol: "INFY", score: 60, newsRisk: "LOW" },
                                    { symbol: "ICICIBANK", score: 52, newsRisk: "LOW" },
                                    { symbol: "TCS", score: 46, newsRisk: "LOW" }
                                ]
                            }
                        };
                    }
                };
            }

            if (value.startsWith("/api/instruments?source=equity")) {
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

            if (value.startsWith("/api/multi-stock-session-step")) {
                const body = JSON.parse(options.body || "{}");

                if (body.mode === "BOOTSTRAP") {
                    return {
                        ok: true,
                        async json() {
                            return {
                                status: "READY",
                                mode: "BOOTSTRAP",
                                sessionUniverse: bootstrapUniverse
                            };
                        }
                    };
                }
            }

            throw new Error(`Unexpected fetch URL: ${url}`);
        };

        const module = await import(
            `${MODULE_URL}?rollover=${Date.now()}`
        );

        const freshSession = await module.startSession();

        assert.deepEqual(
            JSON.parse(
                localStorage.getItem(
                    `${storageKey}_archive_2000-01-01`
                )
            ),
            staleSession
        );

        assert.equal(
            localStorage.getItem(storageKey) !== null,
            true
        );

        assert.notEqual(
            freshSession.sessionDate,
            staleSession.sessionDate
        );

        assert.deepEqual(
            freshSession.sessionUniverse,
            bootstrapUniverse
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


// A11 stale-session rollover regression tests
const ROLLOVER_STORAGE_KEY =
    "trademind_a11_multi_stock_paper_session_v1";

function seedSession(session) {
    globalThis.localStorage = createLocalStorage();

    localStorage.setItem(
        ROLLOVER_STORAGE_KEY,
        JSON.stringify(session)
    );
}

test(
    "stale multi-stock session is blocked from polling",
    async () => {
        const staleSession = {
            sessionDate: "2026-09-19",
            sessionUniverse: {
                instruments: [
                    { symbol: "NIFTY 50" },
                    { symbol: "INFY" },
                    { symbol: "ICICIBANK" },
                    { symbol: "TCS" }
                ]
            },
            state: null,
            cursorState: {}
        };

        seedSession(staleSession);
        globalThis.window = {};

        let stepCalls = 0;

        globalThis.fetch = async (url) => {
            if (
                String(url).startsWith(
                    "/api/multi-stock-session-step"
                )
            ) {
                stepCalls++;
            }

            throw new Error(`Unexpected fetch: ${url}`);
        };

        const module = await import(
            `${MODULE_URL}?stale=${Date.now()}`
        );

        await assert.rejects(
            module.pollSession(),
            /Stale session blocked/
        );

        assert.equal(stepCalls, 0);
    }
);

test(
    "failed bootstrap preserves stale session evidence",
    async () => {
        const staleSession = {
            sessionDate: "2026-09-19",
            sessionUniverse: {
                instruments: [
                    { symbol: "NIFTY 50" },
                    { symbol: "INFY" },
                    { symbol: "ICICIBANK" },
                    { symbol: "TCS" }
                ]
            },
            state: { preserved: true },
            cursorState: { preserved: true }
        };

        seedSession(staleSession);
        globalThis.window = {};

        globalThis.fetch = async () => {
            throw new Error("Simulated bootstrap failure");
        };

        const module = await import(
            `${MODULE_URL}?failed=${Date.now()}`
        );

        await assert.rejects(
            module.startSession(),
            /Simulated bootstrap failure/
        );

        assert.deepEqual(
            JSON.parse(
                localStorage.getItem(ROLLOVER_STORAGE_KEY)
            ),
            staleSession
        );

        assert.equal(
            localStorage.getItem(
                `${ROLLOVER_STORAGE_KEY}_archive_2026-09-19`
            ),
            null
        );
    }
);

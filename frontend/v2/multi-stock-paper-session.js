/*
============================================================
TradeMind Pro

A11 Multi-Stock Paper Session Controller

Purpose:
- Bootstrap PMSE once.
- Freeze NIFTY 50 + top 3 PMSE candidates.
- Poll the stateless multi-stock session API.
- Persist the pinned universe, state and cursors in localStorage.

Safety:
- PAPER ONLY.
- No broker orders.
- No learning.
- No optimization.
- No strategy mutation.
- No promotion.

This file is intentionally isolated from the existing
NIFTY-only A11 frontend session.
============================================================
*/

const STORAGE_KEY =
    "trademind_a11_multi_stock_paper_session_v1";

const API_ENDPOINT =
    "/api/multi-stock-session-step";

const PMSE_ENDPOINT =
    "/api/pmse-scan";

const VERSION =
    "A11-MULTI-STOCK-PAPER-SESSION-V1";


function createInitialState() {

    return {
        session: {
            active: false,
            sessionDate: null
        },

        opportunity: {
            active: false,
            opportunityId: null,
            signal: null,
            signalTimestamp: null,
            observationCount: 0,
            heartbeatCount: 0,
            lifecycleState: "NOT_REACHED"
        },

        position: {
            active: false,
            side: null,
            entry: null,
            entryTimestamp: null,
            stop: null,
            target: null,
            risk: null
        },

        outcome: null,

        cooldown: {
            remainingCandles: 0
        }
    };
}


function createInitialCursorState() {

    return {
        version:
            "A11-MULTI-STOCK-FORWARD-COORDINATOR-V1",

        cursors: {}
    };
}


function loadSession() {

    try {

        const raw =
            localStorage.getItem(
                STORAGE_KEY
            );

        if (!raw) {
            return null;
        }

        return JSON.parse(raw);

    } catch (error) {

        console.error(
            "[A11-MULTI] Failed to load session",
            error
        );

        return null;
    }
}


function saveSession(session) {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(session)
    );
}


function getTodayIST() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(
        new Date()
    );
}


async function getJSON(url) {

    const response =
        await fetch(
            url,
            {
                method: "GET",
                cache: "no-store"
            }
        );

    const payload =
        await response.json();

    if (!response.ok) {

        throw new Error(
            payload?.error ||
            `HTTP ${response.status}`
        );
    }

    return payload;
}


async function postJSON(
    url,
    body
) {

    const response =
        await fetch(
            url,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(body),

                cache:
                    "no-store"
            }
        );

    const payload =
        await response.json();

    if (!response.ok) {

        throw new Error(
            payload?.error ||
            `HTTP ${response.status}`
        );
    }

    return payload;
}


function normalizePMSEResponse(
    response
) {

    if (
        response?.status !== "READY" ||
        !response?.output
    ) {

        throw new Error(
            "PMSE did not return READY"
        );
    }

    const output =
        response.output;

    if (
        output.source !== "PMSE" ||
        output.mode !== "PAPER_ONLY" ||
        !Array.isArray(
            output.candidates
        )
    ) {

        throw new Error(
            "Invalid PMSE input contract"
        );
    }

    if (
        output.candidates.length !== 3
    ) {

        throw new Error(
            `Expected 3 PMSE candidates, received ${output.candidates.length}`
        );
    }

    return {
        version:
            output.version,

        source:
            output.source,

        mode:
            output.mode,

        candidates:
            output.candidates.map(
                candidate => ({
                    symbol:
                        candidate.symbol,

                    score:
                        candidate.score,

                    newsRisk:
                        candidate.newsRisk
                })
            ),

        metadata: {
            researchOnly: true,
            tradeCreated: false,
            brokerCalled: false,
            frontendTouched: false
        }
    };
}


function validateUniverse(
    universe
) {

    if (
        !universe ||
        !Array.isArray(
            universe.instruments
        )
    ) {

        throw new Error(
            "Invalid pinned session universe"
        );
    }

    if (
        universe.instruments.length !== 4
    ) {

        throw new Error(
            "Pinned session universe must contain exactly 4 instruments"
        );
    }

    const symbols =
        universe.instruments.map(
            instrument =>
                instrument.symbol
        );

    if (
        !symbols.includes(
            "NIFTY 50"
        )
    ) {

        throw new Error(
            "Pinned universe must contain NIFTY 50"
        );
    }

    const uniqueSymbols =
        new Set(symbols);

    if (
        uniqueSymbols.size !== 4
    ) {

        throw new Error(
            "Pinned universe contains duplicate symbols"
        );
    }
}


async function bootstrapSession() {

    const pmseResponse =
        await getJSON(
            `${PMSE_ENDPOINT}?_multi=${Date.now()}`
        );

    const pmseInput =
        normalizePMSEResponse(
            pmseResponse
        );

    /*
     * The first API call performs the actual bootstrap:
     * PMSE candidates are resolved into the fixed universe.
     *
     * We intentionally do not invent or hard-code equity
     * instrument IDs in this frontend.
     */

    return {
        pmseInput
    };
}


async function startSession() {

    const existing =
        loadSession();

    if (
        existing &&
        existing.sessionDate ===
            getTodayIST() &&
        existing.sessionUniverse
    ) {

        validateUniverse(
            existing.sessionUniverse
        );

        return existing;
    }

    const {
        pmseInput
    } =
        await bootstrapSession();

    const session = {

        version:
            VERSION,

        sessionDate:
            getTodayIST(),

        sessionUniverse:
            null,

        pmseInput,

        state:
            null,

        cursorState:
            null,

        active:
            true,

        lastStep:
            null
    };

    /*
     * Universe resolution happens on the first API step.
     * The returned universe is then pinned locally.
     */

    const firstStep =
        await postJSON(
            API_ENDPOINT,
            {
                pmseInput:
                    session.pmseInput,

                state: {
                    instruments: []
                },

                cursorState:
                    createInitialCursorState(),

                nowMs:
                    Date.now()
            }
        );

    if (
        !firstStep?.universe?.instruments
    ) {

        throw new Error(
            "Initial multi-stock step did not return a universe"
        );
    }

    validateUniverse(
        firstStep.universe
    );

    session.sessionUniverse =
        firstStep.universe;

    session.state =
        firstStep.forward
            ?.results
            ?.reduce(
                (
                    state,
                    result
                ) => {

                    if (
                        result?.runner?.state
                    ) {

                        state[
                            result.symbol
                        ] =
                            result.runner.state;
                    }

                    return state;
                },
                {}
            ) || {};

    session.cursorState =
        firstStep.forward
            ?.cursorState ||
        createInitialCursorState();

    session.lastStep =
        firstStep;

    saveSession(
        session
    );

    return session;
}


async function pollSession() {

    const session =
        loadSession();

    if (
        !session ||
        !session.sessionUniverse
    ) {

        throw new Error(
            "Multi-stock session has not been bootstrapped"
        );
    }

    validateUniverse(
        session.sessionUniverse
    );

    const result =
        await postJSON(
            API_ENDPOINT,
            {
                sessionUniverse:
                    session.sessionUniverse,

                state:
                    session.state,

                cursorState:
                    session.cursorState,

                nowMs:
                    Date.now()
            }
        );

    session.state =
        result.forward
            ?.results
            ?.reduce(
                (
                    state,
                    item
                ) => {

                    if (
                        item?.runner?.state
                    ) {

                        state[
                            item.symbol
                        ] =
                            item.runner.state;
                    }

                    return state;
                },
                {}
            ) ||
        session.state;

    session.cursorState =
        result.forward
            ?.cursorState ||
        session.cursorState;

    session.lastStep =
        result;

    saveSession(
        session
    );

    return result;
}


function getSessionSnapshot() {

    return loadSession();
}


window.TradeMindMultiStockPaper =
    {
        version:
            VERSION,

        startSession,

        pollSession,

        getSessionSnapshot,

        clearSession() {

            localStorage.removeItem(
                STORAGE_KEY
            );
        }
    };


export {
    startSession,
    pollSession,
    getSessionSnapshot
};

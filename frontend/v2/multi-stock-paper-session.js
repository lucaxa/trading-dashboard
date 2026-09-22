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

import {
    resolveEquityInstruments
}
from "../../premarket/equity-data/indstocks-equity-instrument-provider.js";

import {
    createMultiStockState
}
from "../../research/phase11/multi-stock-paper/multi-stock-state-v1.js";



function createBrowserForwardCursor(instruments = []) {
    if (!Array.isArray(instruments)) {
        throw new Error("instruments must be an array");
    }

    const cursors = {};

    for (const instrument of instruments) {
        const symbol = instrument?.symbol?.trim().toUpperCase();

        if (!symbol || cursors[symbol]) {
            throw new Error("Invalid or duplicate cursor symbol");
        }

        cursors[symbol] = {
            lastProcessedCandleTs: null
        };
    }

    return {
        version: "A11-MULTI-STOCK-FORWARD-COORDINATOR-V1",
        cursors
    };
}

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


async function getInstrumentCsv() {

    const response =
        await fetch(
            "/api/instruments?source=equity",
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

    if (
        !payload?.success ||
        typeof payload.data !== "string"
    ) {
        throw new Error(
            "Invalid equity instrument response"
        );
    }

    return payload.data;
}


function resolveBootstrapCandidates(
    pmseInput,
    csv
) {

    const symbols =
        pmseInput.candidates.map(
            candidate =>
                candidate.symbol
        );

    const resolved =
        resolveEquityInstruments({
            symbols,
            csv
        });

    const selected =
        symbols.map(
            symbol => {

                const matches =
                    resolved.filter(
                        instrument =>
                            instrument.symbol ===
                            symbol
                    );

                const instrument =
                    matches.find(
                        item =>
                            item.exchange === "NSE" &&
                            item.segment === "E"
                    );

                if (!instrument) {
                    throw new Error(
                        `No NSE equity instrument found for ${symbol}`
                    );
                }

                return instrument;
            }
        );

    if (selected.length !== 3) {
        throw new Error(
            "Expected exactly 3 resolved PMSE instruments"
        );
    }

    return selected;
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

    const csv =
        await getInstrumentCsv();

    const resolvedCandidates =
        resolveBootstrapCandidates(
            pmseInput,
            csv
        );

    return {
        pmseInput,
        resolvedCandidates
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
        pmseInput,
        resolvedCandidates
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
            createInitialCursorState(),

        active:
            true,

        lastStep:
            null
    };

    const bootstrap =
        await postJSON(
            API_ENDPOINT,
            {
                mode:
                    "BOOTSTRAP",

                pmseInput:
                    session.pmseInput,

                resolvedCandidates,

                state: {
                    instruments: []
                },

                cursorState:
                    session.cursorState,

                nowMs:
                    Date.now()
            }
        );

    if (
        !bootstrap?.sessionUniverse?.instruments
    ) {

        throw new Error(
            "Bootstrap did not return a session universe"
        );
    }

    validateUniverse(
        bootstrap.sessionUniverse
    );

    // Archive the prior session only after the new bootstrap
    // has succeeded and its universe has been validated.
    const previous = loadSession();
    if (
        previous &&
        previous.sessionDate !== session.sessionDate
    ) {
        const archiveKey =
            `${STORAGE_KEY}_archive_${previous.sessionDate || "unknown"}`;

        if (!localStorage.getItem(archiveKey)) {
            localStorage.setItem(
                archiveKey,
                JSON.stringify(previous)
            );
        }
    }

    session.sessionUniverse =
        bootstrap.sessionUniverse;

    // A11 authoritative multi-stock paper state.
    // Every instrument receives an independent state boundary.
    session.state =
        createMultiStockState(
            session.sessionUniverse.instruments
        );

    // Independent forward cursor for every instrument.
    session.cursorState =
        createBrowserForwardCursor(
            session.sessionUniverse.instruments
        );

    session.lastStep =
        bootstrap;

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

    if (session.sessionDate !== getTodayIST()) {
        throw new Error(
            `Stale session blocked: saved date ${session.sessionDate}; today IST is ${getTodayIST()}. Prepare a new session first.`
        );
    }

    validateUniverse(
        session.sessionUniverse
    );

    // A11 preflight: never send an uninitialized session.
    if (
        !session.state ||
        !session.cursorState
    ) {
        throw new Error(
            "Invalid multi-stock session state. Prepare a new session before polling."
        );
    }

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

    const forward =
        result.session?.forward;

    // Preserve the complete authoritative A11 multi-stock state.
    // Do not reduce it into a symbol -> runner.state object.
    session.state =
        result.state ||
        session.state;

    session.cursorState =
        result.cursorState ||
        forward
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

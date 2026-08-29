"use strict";

/*
============================================================
TradeMind Pro — V2 A11 Paper Display Adapter V3
============================================================

FRONTEND ONLY

Purpose:
    Display the authoritative A11 live-paper observation
    inside the ROOT V2 application.

ARCHITECTURE:

    /api/live-signal
          ↓
    A11 backend
          ↓
    authoritative observation
          ↓
    V2 display adapter
          ↓
    ROOT v2.html

STATE AUTHORITY:

    A11 backend / forward-state layer remains authoritative.

THIS FILE DOES NOT:

    - reproduce strategy logic
    - calculate signals
    - create opportunities
    - close opportunities
    - maintain A11 state
    - write evidence
    - modify A11 state
    - modify api/live-signal.js
    - modify strategy.js
    - learn
    - optimize
    - promote
    - place broker orders
    - place real orders

The PAPER button is DISPLAY ONLY and is deliberately
disabled. No frontend action can create an order.

============================================================
*/

(function () {

    "use strict";


    // ========================================================
    // CONFIGURATION
    // ========================================================

    const SIGNAL_URL =
        "/api/live-signal";

    const REFRESH_MS =
        60 * 1000;


    // ========================================================
    // DISPLAY STATE
    // ========================================================

    const state = {

        signal:
            "WAIT",

        signalTimestamp:
            null,

        candle:
            null,

        opportunity:
            null,

        event:
            null,

        paperDecision:
            "NO_TRADE",

        completedCandle:
            false,

        source:
            null,

        sourceType:
            null,

        strategy:
            null,

        executableVersion:
            null,

        connected:
            false,

        lastUpdate:
            null,

        error:
            null

    };


    // ========================================================
    // DOM HELPERS
    // ========================================================

    function query(selector) {

        return document.querySelector(
            selector
        );

    }


    function setText(
        selector,
        value
    ) {

        const element =
            query(selector);

        if (
            element
        ) {

            element.textContent =
                value ?? "--";

        }

    }


    function formatTime(value) {

        if (
            value === null ||
            value === undefined
        ) {

            return "--";

        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return "--";

        }

        return date.toLocaleTimeString(
            "en-IN",
            {
                hour12:
                    false
            }
        );

    }


    function formatDateTime(value) {

        if (
            value === null ||
            value === undefined
        ) {

            return "--";

        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return "--";

        }

        return date.toLocaleString(
            "en-IN",
            {
                hour12:
                    false
            }
        );

    }


    // ========================================================
    // SIGNAL NORMALIZATION
    // ========================================================

    function normalizeSignal(
        value
    ) {

        return String(
            value ?? ""
        )
            .trim()
            .toUpperCase();

    }


    // ========================================================
    // RESPONSE VALIDATION
    // ========================================================

    function validateResponse(
        data
    ) {

        if (
            !data ||
            typeof data !==
                "object"
        ) {

            throw new Error(
                "Live-signal response is invalid"
            );

        }

        const signal =
            normalizeSignal(
                data.signal
            );

        if (
            ![
                "BUY",
                "SELL",
                "WAIT"
            ].includes(
                signal
            )
        ) {

            throw new Error(
                "Live-signal returned an invalid signal"
            );

        }

        if (
            !data.signalCandle ||
            typeof data.signalCandle !==
                "object"
        ) {

            throw new Error(
                "Live-signal candle is missing"
            );

        }

        return signal;

    }


    // ========================================================
    // OBSERVATION
    // ========================================================

    function extractObservation(
        data
    ) {

        if (
            data.observation &&
            typeof data.observation ===
                "object"
        ) {

            return data.observation;

        }

        return null;

    }


    // ========================================================
    // PAPER DECISION
    // ========================================================

    function resolvePaperDecision(
        data,
        observation,
        signal
    ) {

        const explicit =
            observation?.paperDecision ??
            data.paperDecision;

        if (
            explicit ===
                "ENTER_LONG" ||
            explicit ===
                "ENTER_SHORT" ||
            explicit ===
                "NO_TRADE"
        ) {

            return explicit;

        }

        /*
         * Presentation fallback only.
         *
         * This does not create state or execute anything.
         */

        if (
            signal ===
                "BUY"
        ) {

            return "ENTER_LONG";

        }

        if (
            signal ===
                "SELL"
        ) {

            return "ENTER_SHORT";

        }

        return "NO_TRADE";

    }


    // ========================================================
    // SIGNAL DISPLAY
    // ========================================================

    function renderSignal() {

        const strategySignal =
            query(
                ".strategy .signal"
            );

        if (
            strategySignal
        ) {

            strategySignal.textContent =
                state.signal;

            strategySignal.dataset.signal =
                state.signal;

        }

    }


    // ========================================================
    // PAPER DISPLAY
    // ========================================================

    function renderPaperDecision() {

        const button =
            query(
                ".strategy .primary"
            );

        if (
            !button
        ) {

            return;

        }

        /*
         * NEVER executable.
         *
         * This is a status display, not an order control.
         */

        button.disabled =
            true;

        button.setAttribute(
            "aria-disabled",
            "true"
        );

        if (
            state.paperDecision ===
                "ENTER_LONG"
        ) {

            button.textContent =
                "PAPER: ENTER LONG";

            return;

        }

        if (
            state.paperDecision ===
                "ENTER_SHORT"
        ) {

            button.textContent =
                "PAPER: ENTER SHORT";

            return;

        }

        button.textContent =
            "NO PAPER TRADE";

    }


    // ========================================================
    // MARKET CONNECTION DISPLAY
    // ========================================================

    function renderConnection() {

        const status =
            query(
                ".market-status b"
            );

        if (
            status
        ) {

            status.textContent =
                state.connected
                    ? "● LIVE"
                    : "● OFFLINE";

        }

        const update =
            query(
                ".market-status strong"
            );

        if (
            update
        ) {

            update.textContent =
                state.lastUpdate
                    ? formatTime(
                        state.lastUpdate
                    )
                    : "--:--:--";

        }

    }


    // ========================================================
    // RECENT SIGNALS DISPLAY
    // ========================================================

    function renderRecentSignals() {

        const panel =
            query(
                ".recent-panel"
            );

        if (
            !panel
        ) {

            return;

        }

        const empty =
            panel.querySelector(
                ".signal-empty"
            );

        if (
            empty
        ) {

            empty.textContent =
                "No A11 live observation available.";

        }

        const existingRows =
            panel.querySelectorAll(
                ".a11-live-observation"
            );

        existingRows.forEach(
            row => row.remove()
        );

        if (
            !state.connected
        ) {

            if (
                empty
            ) {

                empty.hidden =
                    false;

                empty.textContent =
                    state.error ||
                    "A11 live signal feed unavailable.";

            }

            return;

        }

        if (
            empty
        ) {

            empty.hidden =
                true;

        }

        const row =
            document.createElement(
                "div"
            );

        row.className =
            "signal-empty a11-live-observation";

        row.style.whiteSpace =
            "normal";

        row.style.textAlign =
            "left";

        row.innerHTML = "";

        const title =
            document.createElement(
                "strong"
            );

        title.textContent =
            `${state.signal} • ${state.event ?? "--"}`;

        const details =
            document.createElement(
                "span"
            );

        details.textContent =
            [
                `Opportunity: ${
                    state.opportunity?.opportunityId ??
                    "NONE"
                }`,
                `Strategy: ${
                    state.strategy ??
                    "--"
                }`,
                `Paper: ${
                    state.paperDecision
                }`,
                `Candle: ${
                    state.completedCandle
                        ? "COMPLETED"
                        : "NOT VERIFIED"
                }`,
                `Time: ${
                    formatTime(
                        state.signalTimestamp
                    )
                }`
            ].join(
                " • "
            );

        details.style.display =
            "block";

        details.style.marginTop =
            "5px";

        row.appendChild(
            title
        );

        row.appendChild(
            details
        );

        const table =
            panel.querySelector(
                ".signal-table"
            );

        if (
            table
        ) {

            table.appendChild(
                row
            );

        }

    }


    // ========================================================
    // PHASE 11 EVIDENCE DISPLAY
    // ========================================================

    function renderEvidence() {

        const panels =
            document.querySelectorAll(
                ".bottom-grid .panel"
            );

        if (
            panels.length === 0
        ) {

            return;

        }

        const evidencePanel =
            panels[0];

        const stats =
            evidencePanel.querySelector(
                ".stats"
            );

        if (
            !stats
        ) {

            return;

        }

        const values =
            stats.querySelectorAll(
                "div b"
            );

        /*
         * Existing V2 labels are presentation-only.
         * We populate their values with authoritative
         * A11 observation information.
         */

        if (
            values[0]
        ) {

            values[0].textContent =
                state.event ??
                "--";

        }

        if (
            values[1]
        ) {

            values[1].textContent =
                state.signalTimestamp
                    ? formatTime(
                        state.signalTimestamp
                    )
                    : "--";

        }

        if (
            values[2]
        ) {

            values[2].textContent =
                state.completedCandle
                    ? "PASS"
                    : "NOT VERIFIED";

        }

        if (
            values[3]
        ) {

            values[3].textContent =
                state.connected
                    ? "CONNECTED"
                    : "OFFLINE";

        }

    }


    // ========================================================
    // OPTIONAL DIAGNOSTIC ATTRIBUTES
    // ========================================================

    function renderMetadata() {

        const strategyPanel =
            query(
                ".strategy"
            );

        if (
            !strategyPanel
        ) {

            return;

        }

        strategyPanel.dataset.a11Connected =
            String(
                state.connected
            );

        strategyPanel.dataset.a11Event =
            state.event ??
            "";

        strategyPanel.dataset.a11Opportunity =
            state.opportunity?.opportunityId ??
            "";

        strategyPanel.dataset.a11CompletedCandle =
            String(
                state.completedCandle
            );

    }


    // ========================================================
    // RENDER
    // ========================================================

    function render() {

        renderSignal();

        renderPaperDecision();

        renderConnection();

        renderRecentSignals();

        renderEvidence();

        renderMetadata();

    }


    // ========================================================
    // FETCH
    // ========================================================

    async function fetchLiveSignal() {

        const response =
            await fetch(
                `${SIGNAL_URL}?_v2=${Date.now()}`,
                {
                    method:
                        "GET",

                    cache:
                        "no-store",

                    headers: {

                        Accept:
                            "application/json",

                        "Cache-Control":
                            "no-cache",

                        Pragma:
                            "no-cache"

                    }
                }
            );

        if (
            !response.ok
        ) {

            throw new Error(
                `Live-signal HTTP error: ${response.status}`
            );

        }

        const data =
            await response.json();

        const signal =
            validateResponse(
                data
            );

        const observation =
            extractObservation(
                data
            );

        state.signal =
            signal;

        state.signalTimestamp =
            data.data?.signalTimestamp ??
            data.data?.signalTime ??
            observation?.signal?.signalTimestamp ??
            data.signalCandle?.ts ??
            null;

        state.candle =
            data.signalCandle;

        state.opportunity =
            observation?.opportunity ??
            data.opportunity ??
            null;

        state.event =
            observation?.event ??
            data.event ??
            null;

        state.paperDecision =
            resolvePaperDecision(
                data,
                observation,
                signal
            );

        state.completedCandle =
            observation?.completedCandle === true ||
            data.completedCandle === true;

        state.source =
            observation?.source ??
            data.source ??
            null;

        state.sourceType =
            observation?.sourceType ??
            data.sourceType ??
            null;

        state.strategy =
            observation?.signal?.strategy ??
            data.data?.strategy ??
            data.strategy ??
            null;

        state.executableVersion =
            observation?.signal?.executableVersion ??
            data.data?.executableVersion ??
            data.executableVersion ??
            null;

        state.connected =
            true;

        state.lastUpdate =
            Date.now();

        state.error =
            null;

        render();

        return data;

    }


    // ========================================================
    // REFRESH
    // ========================================================

    async function refresh() {

        try {

            await fetchLiveSignal();

        }

        catch (
            error
        ) {

            state.connected =
                false;

            state.error =
                error?.message ||
                String(error);

            render();

            console.warn(
                "[TradeMind V2] A11 display unavailable:",
                state.error
            );

        }

    }


    // ========================================================
    // PUBLIC API
    // ========================================================

    window.TradeMindV2A11Paper = {

        getState() {

            return {
                ...state
            };

        },

        refresh

    };


    // ========================================================
    // START
    // ========================================================

    function start() {

        render();

        refresh();

        window.setInterval(
            refresh,
            REFRESH_MS
        );

        console.log(
            "[TradeMind V2] A11 display adapter V3 ready."
        );

    }


    if (
        document.readyState ===
            "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once:
                    true
            }
        );

    }

    else {

        start();

    }

})();

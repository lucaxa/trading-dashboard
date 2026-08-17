/*
===========================================================
 TradeMind Pro
 Frontend Live Refresh Layer
 ----------------------------------------------------------
 PURPOSE
 - Refresh the existing V10.25 frontend automatically.
 - Reuse the existing fetchMarketData() and fetchIndicatorData().
 - Keep V10.25 strategy logic unchanged.
 - Keep backend, learning engine, Phase 11 evidence logic,
   and broker execution untouched.

 REFRESH CADENCE
 - Quotes: every 5 seconds
 - Indicators: every 15 seconds

 SAFETY
 - Read-only frontend behavior.
 - No broker calls.
 - No strategy modification.
 - No learning updates.
 - Prevents overlapping requests of the same type.
===========================================================
*/

"use strict";

(function () {
    const QUOTE_REFRESH_MS = 5000;
    const INDICATOR_REFRESH_MS = 15000;

    let quoteRefreshInFlight = false;
    let indicatorRefreshInFlight = false;
    let started = false;

    async function refreshQuotes() {
        if (
            quoteRefreshInFlight ||
            typeof window.fetchMarketData !== "function"
        ) {
            return;
        }

        quoteRefreshInFlight = true;

        try {
            await window.fetchMarketData();
        } catch (error) {
            console.error(
                "[TradeMind Live Refresh] Quote refresh failed:",
                error
            );
        } finally {
            quoteRefreshInFlight = false;
        }
    }

    async function refreshIndicators() {
        if (
            indicatorRefreshInFlight ||
            typeof window.fetchIndicatorData !== "function"
        ) {
            return;
        }

        indicatorRefreshInFlight = true;

        try {
            await window.fetchIndicatorData();
        } catch (error) {
            console.error(
                "[TradeMind Live Refresh] Indicator refresh failed:",
                error
            );
        } finally {
            indicatorRefreshInFlight = false;
        }
    }

    function start() {
        if (started) return;
        started = true;

        console.log(
            "[TradeMind Live Refresh] ACTIVE — quotes 5s / indicators 15s"
        );

        /*
         * Initial data is already requested by V10.25 initialize().
         * We therefore wait for the first interval before making
         * another request, avoiding duplicate startup calls.
         */
        window.setInterval(
            refreshQuotes,
            QUOTE_REFRESH_MS
        );

        window.setInterval(
            refreshIndicators,
            INDICATOR_REFRESH_MS
        );
    }

    /*
     * script.js is loaded before this file from index.html.
     * Start after window load so the V10.25 controller is ready.
     */
    if (document.readyState === "complete") {
        start();
    } else {
        window.addEventListener(
            "load",
            start,
            { once: true }
        );
    }
})();

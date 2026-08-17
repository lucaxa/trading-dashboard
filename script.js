/*
===========================================================
 TradeMind Pro
 Frontend Live Refresh Layer
 ----------------------------------------------------------
 PURPOSE
 - Refresh the existing frontend market data automatically.
 - Keep V10.25 strategy/backend unchanged.
 - Reuse the existing frontend functions:
     fetchMarketData()
     fetchIndicatorData()
 - No broker calls.
 - No strategy modification.
 - No learning.
 - No evidence generation directly.
 ----------------------------------------------------------
 REFRESH PLAN
 - Quotes: every 5 seconds
 - Indicators: every 15 seconds
 - Initial page load remains handled by script.js
 - Prevent overlapping requests of the same type
===========================================================
*/

(function () {
    "use strict";

    const QUOTE_REFRESH_MS = 5000;
    const INDICATOR_REFRESH_MS = 15000;

    let quoteRefreshRunning = false;
    let indicatorRefreshRunning = false;

    async function refreshQuotes() {
        if (
            quoteRefreshRunning ||
            typeof window.fetchMarketData !== "function"
        ) {
            return;
        }

        quoteRefreshRunning = true;

        try {
            await window.fetchMarketData();
        } catch (error) {
            console.error(
                "[TradeMind Live Refresh] Quote refresh failed:",
                error
            );
        } finally {
            quoteRefreshRunning = false;
        }
    }

    async function refreshIndicators() {
        if (
            indicatorRefreshRunning ||
            typeof window.fetchIndicatorData !== "function"
        ) {
            return;
        }

        indicatorRefreshRunning = true;

        try {
            await window.fetchIndicatorData();
        } catch (error) {
            console.error(
                "[TradeMind Live Refresh] Indicator refresh failed:",
                error
            );
        } finally {
            indicatorRefreshRunning = false;
        }
    }

    function start() {
        console.log(
            "[TradeMind Live Refresh] Started — quotes 5s / indicators 15s"
        );

        /*
         * The first data request is already performed by script.js.
         * We deliberately wait for the first interval tick so we do
         * not create duplicate requests during page initialization.
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
     * script.js must already be loaded because this layer reuses
     * its existing frontend functions. Therefore start after load.
     */
    if (document.readyState === "loading") {
        window.addEventListener(
            "load",
            start,
            { once: true }
        );
    } else {
        start();
    }
})();

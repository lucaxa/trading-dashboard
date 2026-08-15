/*
===========================================================
 TradeMind Pro
 Frontend V1 — READ-ONLY UI CONTROLLER

 PURPOSE
 ----------------------------------------------------------
 Render backend data supplied by TradeMindData and expose
 truthful frontend system-health information.

 IMPORTANT
 ----------------------------------------------------------
 This file:
 - does not generate signals
 - does not calculate indicators
 - does not calculate P&L
 - does not modify strategy state
 - does not create evidence
 - does not execute trades
 - does not modify Phase status
 - does not promote a strategy

 Backend / research engine remains the source of truth.
===========================================================
*/

(function () {

  "use strict";


  /*
  ---------------------------------------------------------
   Safe DOM helpers
  ---------------------------------------------------------
  */

  function setText(id, value) {

    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

    element.textContent =
      value;

  }


  function displayValue(value) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      return "—";

    }

    return String(value);

  }


  function formatPrice(value) {

    if (
      value === undefined ||
      value === null ||
      !Number.isFinite(
        Number(value)
      )
    ) {

      return "UNAVAILABLE";

    }

    return Number(value).toLocaleString(
      "en-IN",
      {
        maximumFractionDigits: 2
      }
    );

  }


  function formatIndicator(value) {

    if (
      value === undefined ||
      value === null ||
      !Number.isFinite(
        Number(value)
      )
    ) {

      return "UNAVAILABLE";

    }

    return Number(value).toLocaleString(
      "en-IN",
      {
        maximumFractionDigits: 4
      }
    );

  }


  function formatTimestamp(value) {

    if (!value) {

      return "UNAVAILABLE";

    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      return String(value);

    }

    return date.toLocaleString(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );

  }


  /*
  ---------------------------------------------------------
   Health status helper
  ---------------------------------------------------------
  */

  function getEndpointHealth(result) {

    if (!result) {

      return {
        text: "NO DATA",
        className: "status-neutral"
      };

    }


    if (result.ok === true) {

      return {
        text: "ONLINE",
        className: "status-safe"
      };

    }


    if (result.status === 403) {

      return {
        text: "HTTP 403",
        className: "status-neutral"
      };

    }


    if (result.status) {

      return {
        text: `HTTP ${result.status}`,
        className: "status-neutral"
      };

    }


    if (result.error) {

      return {
        text: String(
          result.error
        ),
        className: "status-neutral"
      };

    }


    return {
      text: "UNAVAILABLE",
      className: "status-neutral"
    };

  }


  function setHealthStatus(
    id,
    status
  ) {

    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }


    element.textContent =
      status.text;


    element.classList.remove(
      "status-safe",
      "status-neutral"
    );


    if (status.className) {

      element.classList.add(
        status.className
      );

    }

  }


  /*
  ---------------------------------------------------------
   System Health rendering
  ---------------------------------------------------------
  */

  function renderSystemHealth(data) {

    /*
    -------------------------------------------------------
     Frontend
    -------------------------------------------------------
    */

    setHealthStatus(
      "health-frontend",
      {
        text: "ONLINE",
        className: "status-safe"
      }
    );


    /*
    -------------------------------------------------------
     Market Data
    -------------------------------------------------------
    */

    setHealthStatus(
      "health-market-data",
      getEndpointHealth(
        data?.quotes
      )
    );


    /*
    -------------------------------------------------------
     Live Signal
    -------------------------------------------------------
    */

    setHealthStatus(
      "health-live-signal",
      getEndpointHealth(
        data?.liveSignal
      )
    );


    /*
    -------------------------------------------------------
     Phase 11 Capture
    -------------------------------------------------------
    */

    setHealthStatus(
      "health-phase11",
      {
        text: "NOT EXPOSED",
        className: "status-neutral"
      }
    );


    /*
    -------------------------------------------------------
     Evidence
    -------------------------------------------------------
    */

    setHealthStatus(
      "health-evidence",
      {
        text: "NOT EXPOSED",
        className: "status-neutral"
      }
    );

  }


  /*
  ---------------------------------------------------------
   Market rendering
  ---------------------------------------------------------
  */

  function renderQuotes(quotes) {

    if (
      !quotes ||
      quotes.ok !== true
    ) {

      setText(
        "nifty-price",
        "UNAVAILABLE"
      );

      setText(
        "nifty-subtext",
        "Market data unavailable"
      );


      setText(
        "banknifty-price",
        "UNAVAILABLE"
      );

      setText(
        "banknifty-subtext",
        "Market data unavailable"
      );

      return;

    }


    const nifty =
      quotes.nifty ||
      null;

    const banknifty =
      quotes.banknifty ||
      null;


    /*
    -------------------------------------------------------
     NIFTY
    -------------------------------------------------------
    */

    if (nifty) {

      setText(
        "nifty-price",
        formatPrice(
          nifty.price
        )
      );


      const changeText =
        nifty.changePercent !== null &&
        nifty.changePercent !== undefined
          ? `Change: ${nifty.changePercent}%`
          : "Market data available";


      setText(
        "nifty-subtext",
        changeText
      );

    } else {

      setText(
        "nifty-price",
        "UNAVAILABLE"
      );

      setText(
        "nifty-subtext",
        "Market data unavailable"
      );

    }


    /*
    -------------------------------------------------------
     BANKNIFTY
    -------------------------------------------------------
    */

    if (banknifty) {

      setText(
        "banknifty-price",
        formatPrice(
          banknifty.price
        )
      );


      const changeText =
        banknifty.changePercent !== null &&
        banknifty.changePercent !== undefined
          ? `Change: ${banknifty.changePercent}%`
          : "Market data available";


      setText(
        "banknifty-subtext",
        changeText
      );

    } else {

      setText(
        "banknifty-price",
        "UNAVAILABLE"
      );

      setText(
        "banknifty-subtext",
        "Market data unavailable"
      );

    }

  }


  /*
  ---------------------------------------------------------
   Technical Indicator rendering
  ---------------------------------------------------------

   IMPORTANT:

   This function ONLY displays values supplied by the
   read-only adapter.

   It does NOT:
   - calculate indicators
   - compare indicators
   - interpret indicators
   - generate signals
   - make trading decisions
  ---------------------------------------------------------
  */

  function renderIndicators(
    indicatorData
  ) {

    if (
      !indicatorData ||
      indicatorData.ok !== true
    ) {

      setText(
        "indicator-ema9",
        "UNAVAILABLE"
      );

      setText(
        "indicator-ema21",
        "UNAVAILABLE"
      );

      setText(
        "indicator-rsi14",
        "UNAVAILABLE"
      );

      setText(
        "indicator-vwap",
        "UNAVAILABLE"
      );

      setText(
        "indicator-atr14",
        "UNAVAILABLE"
      );

      setText(
        "indicator-source",
        "UNAVAILABLE"
      );

      return;

    }


    const indicators =
      indicatorData.indicators ||
      {};


    /*
    -------------------------------------------------------
     EMA 9
    -------------------------------------------------------
    */

    setText(
      "indicator-ema9",
      formatIndicator(
        indicators.ema9
      )
    );


    /*
    -------------------------------------------------------
     EMA 21
    -------------------------------------------------------
    */

    setText(
      "indicator-ema21",
      formatIndicator(
        indicators.ema21
      )
    );


    /*
    -------------------------------------------------------
     RSI 14
    -------------------------------------------------------
    */

    setText(
      "indicator-rsi14",
      formatIndicator(
        indicators.rsi14
      )
    );


    /*
    -------------------------------------------------------
     VWAP
    -------------------------------------------------------
    */

    setText(
      "indicator-vwap",
      formatIndicator(
        indicators.vwap
      )
    );


    /*
    -------------------------------------------------------
     ATR 14
    -------------------------------------------------------
    */

    setText(
      "indicator-atr14",
      formatIndicator(
        indicators.atr14
      )
    );


    /*
    -------------------------------------------------------
     Source
    -------------------------------------------------------
    */

    setText(
      "indicator-source",
      "BACKEND /api/indicators"
    );

  }


  /*
  ---------------------------------------------------------
   Signal rendering
  ---------------------------------------------------------
  */

  function renderLiveSignal(
    signalData
  ) {

    if (
      !signalData ||
      signalData.ok !== true
    ) {

      setText(
        "signal-value",
        "UNAVAILABLE"
      );

      setText(
        "signal-time",
        "UNAVAILABLE"
      );

      setText(
        "signal-source",
        "UNAVAILABLE"
      );

      return;

    }


    /*
    -------------------------------------------------------
     Signal
    -------------------------------------------------------
    */

    setText(
      "signal-value",
      displayValue(
        signalData.signal
      )
    );


    /*
    -------------------------------------------------------
     Signal timestamp
    -------------------------------------------------------
    */

    setText(
      "signal-time",
      formatTimestamp(
        signalData.timestamp
      )
    );


    /*
    -------------------------------------------------------
     Source
    -------------------------------------------------------
    */

    const source =
      signalData.mode ||
      signalData.strategy ||
      signalData.version ||
      null;


    setText(
      "signal-source",
      displayValue(
        source
      )
    );

  }


  /*
  ---------------------------------------------------------
   Main dashboard render
  ---------------------------------------------------------
  */

  function renderDashboard(
    data
  ) {

    if (!data) {

      renderQuotes(
        null
      );

      renderIndicators(
        null
      );

      renderLiveSignal(
        null
      );

      renderSystemHealth(
        null
      );

      return;

    }


    renderQuotes(
      data.quotes
    );


    renderIndicators(
      data.indicators
    );


    renderLiveSignal(
      data.liveSignal
    );


    renderSystemHealth(
      data
    );

  }


  /*
  ---------------------------------------------------------
   Dashboard initialization
  ---------------------------------------------------------
  */

  async function initializeDashboard() {

    console.log(
      "[TradeMind V1] Initializing read-only dashboard..."
    );


    if (
      !window.TradeMindData ||
      typeof window.TradeMindData.getDashboardData !==
        "function"
    ) {

      console.error(
        "[TradeMind V1] DATA_ADAPTER_NOT_AVAILABLE"
      );


      renderDashboard(
        null
      );

      return;

    }


    try {

      const data =
        await window.TradeMindData.getDashboardData();


      renderDashboard(
        data
      );


      console.log(
        "[TradeMind V1] Dashboard rendered from backend data:",
        data
      );

    } catch (error) {

      console.error(
        "[TradeMind V1] Dashboard initialization failed:",
        error
      );


      renderDashboard(
        null
      );

    }

  }


  /*
  ---------------------------------------------------------
   Start
  ---------------------------------------------------------
  */

  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initializeDashboard,
      {
        once: true
      }
    );

  } else {

    initializeDashboard();

  }

})();

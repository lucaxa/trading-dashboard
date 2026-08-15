/*
===========================================================
 TradeMind Pro
 Frontend V1 — READ-ONLY UI CONTROLLER

 PURPOSE
 ----------------------------------------------------------
 Render backend data supplied by TradeMindData.

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
    const element = document.getElementById(id);

    if (!element) {
      return;
    }

    element.textContent = value;
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
      !Number.isFinite(Number(value))
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


  function formatTimestamp(value) {
    if (!value) {
      return "UNAVAILABLE";
    }

    const date = new Date(value);

    if (
      Number.isNaN(date.getTime())
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
   Error rendering
  ---------------------------------------------------------
  */

  function renderUnavailableState() {

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
      quotes.nifty || null;

    const banknifty =
      quotes.banknifty || null;


    /*
    -------------------------------------------------------
     NIFTY
    -------------------------------------------------------
    */

    if (nifty) {

      setText(
        "nifty-price",
        formatPrice(nifty.price)
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
        formatPrice(banknifty.price)
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
   Signal rendering
  ---------------------------------------------------------
  */

  function renderLiveSignal(signalData) {

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
      displayValue(source)
    );
  }


  /*
  ---------------------------------------------------------
   Main render
  ---------------------------------------------------------
  */

  function renderDashboard(data) {

    if (!data) {

      renderUnavailableState();

      return;
    }


    renderQuotes(
      data.quotes
    );


    renderLiveSignal(
      data.liveSignal
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

      renderUnavailableState();

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


      renderUnavailableState();
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
      { once: true }
    );

  } else {

    initializeDashboard();
  }

})();

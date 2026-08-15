/*
===========================================================
 TradeMind Pro
 Frontend V1 — ADAPTER DIAGNOSTIC

 PURPOSE
 ----------------------------------------------------------
 Verify that the Frontend V1 read-only data adapter can
 communicate with the backend endpoints.

 IMPORTANT
 ----------------------------------------------------------
 This diagnostic:
 - does not generate signals
 - does not calculate indicators
 - does not modify strategy state
 - does not create evidence
 - does not execute trades
 - does not modify Phase status

 It only reads and reports the adapter result.
===========================================================
*/

(function () {
  "use strict";

  async function runAdapterDiagnostic() {
    const startedAt = Date.now();

    try {
      if (
        !window.TradeMindData ||
        typeof window.TradeMindData.getDashboardData !== "function"
      ) {
        console.error(
          "[TradeMind V1] DATA_ADAPTER_NOT_AVAILABLE"
        );

        return;
      }

      console.log(
        "[TradeMind V1] Starting read-only adapter diagnostic..."
      );

      const data =
        await window.TradeMindData.getDashboardData();

      const elapsedMs =
        Date.now() - startedAt;

      const diagnostic = {
        frontendVersion: "V1",
        mode: "READ_ONLY",
        elapsedMs,

        quotes: {
          ok: data?.quotes?.ok === true,
          error: data?.quotes?.error || null
        },

        liveSignal: {
          ok: data?.liveSignal?.ok === true,
          error: data?.liveSignal?.error || null,
          version: data?.liveSignal?.version || null,
          strategy: data?.liveSignal?.strategy || null,
          mode: data?.liveSignal?.mode || null,
          status: data?.liveSignal?.status || null,
          signal: data?.liveSignal?.signal || null
        }
      };

      console.log(
        "[TradeMind V1] Adapter diagnostic:",
        diagnostic
      );

      /*
      -------------------------------------------------------
       Development-only raw normalized response
      -------------------------------------------------------
      */

      console.log(
        "[TradeMind V1] Normalized adapter data:",
        data
      );

    } catch (error) {

      console.error(
        "[TradeMind V1] Adapter diagnostic failed:",
        error
      );

    }
  }


  /*
  ---------------------------------------------------------
   Run after page load
  ---------------------------------------------------------
  */

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      runAdapterDiagnostic,
      { once: true }
    );
  } else {
    runAdapterDiagnostic();
  }

})();

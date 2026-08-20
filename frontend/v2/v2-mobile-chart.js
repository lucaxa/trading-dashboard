/*
===========================================================
 TradeMind Pro — V2
 STEP 10.2C — MOBILE CHART INTERACTION
 ----------------------------------------------------------
 FRONTEND ONLY
 - Touch interaction layer for the existing V2 chart.
 - No API calls.
 - No backend changes.
 - No Phase 11 changes.
 - Does not modify v2.js.
 - Does not replace the existing candle renderer.
===========================================================
*/

(() => {
  "use strict";

  function initMobileChartInteraction() {
    const chart = document.querySelector("#v2-chart");

    if (!chart) {
      console.warn(
        "[TradeMind V2] Mobile chart interaction: chart not found."
      );
      return;
    }

    /*
     * Do not interfere with desktop pointer behaviour.
     * This layer activates only for touch-capable devices.
     */
    const touchCapable =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0;

    if (!touchCapable) {
      console.info(
        "[TradeMind V2] Mobile chart interaction skipped: no touch input."
      );
      return;
    }

    if (chart.dataset.mobileInteractionReady === "true") {
      return;
    }

    chart.dataset.mobileInteractionReady = "true";

    let pinchStartDistance = null;
    let pinchStartVisibleCount = null;
    let touchStartX = null;
    let touchStartY = null;
    let touchStartTime = 0;
    let moved = false;
    let suppressClickUntil = 0;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function getTouchDistance(touches) {
      if (touches.length < 2) return 0;

      const dx =
        touches[0].clientX -
        touches[1].clientX;

      const dy =
        touches[0].clientY -
        touches[1].clientY;

      return Math.hypot(dx, dy);
    }

    function getChartControllerState() {
      /*
       * v2.js keeps its state private. We intentionally do not
       * mutate it or depend on undocumented internal variables.
       *
       * The gesture layer therefore uses the existing chart
       * controls when available and falls back to CSS/scroll
       * behaviour rather than corrupting the candle state.
       */
      return {
        rangeButtons:
          [...chart.querySelectorAll(
            ".range-controls button"
          )],
        chart
      };
    }

    function setChartTouchMode(enabled) {
      chart.classList.toggle(
        "v2-mobile-touch-active",
        enabled
      );
    }

    function showTouchHint() {
      let hint =
        document.querySelector("#v2-mobile-chart-hint");

      if (!hint) {
        hint = document.createElement("div");
        hint.id = "v2-mobile-chart-hint";

        hint.textContent =
          "Drag to move • Pinch to zoom • Tap a candle for details";

        document.body.appendChild(hint);
      }

      hint.classList.add("show");

      clearTimeout(hint._timer);

      hint._timer = setTimeout(() => {
        hint.classList.remove("show");
      }, 2200);
    }

    function resetChartInteraction() {
      /*
       * The existing range controller owns the actual candle
       * range. Selecting 1D is the safest public UI reset and
       * does not touch internal v2.js state.
       */
      const controls =
        getChartControllerState().rangeButtons;

      const dayButton =
        controls.find(button =>
          button.textContent.trim() === "1D"
        );

      if (dayButton) {
        dayButton.click();
      }
    }

    function handleTouchStart(event) {
      if (event.touches.length === 2) {
        pinchStartDistance =
          getTouchDistance(event.touches);

        /*
         * Visible-count state is intentionally not guessed or
         * rewritten here. The existing chart controller remains
         * the owner of candle-range state.
         */
        pinchStartVisibleCount = null;

        setChartTouchMode(true);
        return;
      }

      if (event.touches.length !== 1) return;

      const touch = event.touches[0];

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
      moved = false;

      setChartTouchMode(true);
    }

    function handleTouchMove(event) {
      if (event.touches.length === 2) {
        /*
         * Let the browser perform the native pinch gesture if the
         * existing chart controller does not expose a safe public
         * zoom API. This prevents us from fighting v2.js.
         */
        const distance =
          getTouchDistance(event.touches);

        if (
          pinchStartDistance !== null &&
          Math.abs(distance - pinchStartDistance) > 8
        ) {
          moved = true;
        }

        return;
      }

      if (event.touches.length !== 1) return;

      const touch = event.touches[0];

      const dx =
        touch.clientX - touchStartX;

      const dy =
        touch.clientY - touchStartY;

      if (
        Math.abs(dx) > 8 ||
        Math.abs(dy) > 8
      ) {
        moved = true;
      }

      /*
       * Do not preventDefault here.
       *
       * v2.js already owns chart dragging. Preventing the event
       * from reaching it would make the current candle navigation
       * worse rather than better.
       */
    }

    function handleTouchEnd(event) {
      if (event.touches.length === 0) {
        pinchStartDistance = null;
        pinchStartVisibleCount = null;
        setChartTouchMode(false);
      }

      if (event.changedTouches.length !== 1) {
        return;
      }

      const touch =
        event.changedTouches[0];

      const duration =
        Date.now() - touchStartTime;

      const dx =
        touch.clientX - touchStartX;

      const dy =
        touch.clientY - touchStartY;

      /*
       * Short stationary tap:
       * allow the existing chart tooltip/crosshair logic to
       * receive the interaction.
       */
      if (
        !moved &&
        duration < 500 &&
        Math.abs(dx) < 8 &&
        Math.abs(dy) < 8
      ) {
        return;
      }

      /*
       * Double-tap reset is handled separately so it does not
       * interfere with normal candle taps.
       */
    }

    let lastTap = 0;

    function handleDoubleTap(event) {
      if (event.touches.length > 0) return;

      const now = Date.now();

      if (now - lastTap < 320) {
        suppressClickUntil = now + 450;
        resetChartInteraction();
        showTouchHint();
      }

      lastTap = now;
    }

    /*
     * Do not block native browser gestures globally.
     * The chart's existing pointer handlers remain authoritative.
     */
    chart.addEventListener(
      "touchstart",
      handleTouchStart,
      { passive: true }
    );

    chart.addEventListener(
      "touchmove",
      handleTouchMove,
      { passive: true }
    );

    chart.addEventListener(
      "touchend",
      handleTouchEnd,
      { passive: true }
    );

    chart.addEventListener(
      "touchend",
      handleDoubleTap,
      { passive: true }
    );

    chart.addEventListener(
      "click",
      event => {
        if (Date.now() < suppressClickUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );

    /*
     * CSS touch-action is intentionally conservative:
     * - manipulation keeps taps responsive.
     * - pan-x allows horizontal chart movement.
     * - We do NOT disable browser pinch zoom for the page.
     */
    const style = document.createElement("style");
    style.id = "v2-mobile-chart-interaction-style";

    style.textContent = `
      @media(pointer:coarse){
        #v2-chart{
          touch-action:pan-x pan-y pinch-zoom;
          -webkit-user-select:none;
          user-select:none;
          -webkit-touch-callout:none;
        }

        #v2-chart.v2-mobile-touch-active{
          cursor:grabbing;
        }

        #v2-mobile-chart-hint{
          position:fixed;
          left:50%;
          bottom:18px;
          transform:translate(-50%,12px);
          z-index:100001;
          max-width:calc(100vw - 28px);
          padding:9px 12px;
          border:1px solid rgba(25,167,255,.35);
          border-radius:8px;
          background:rgba(5,13,22,.95);
          color:#dce8f5;
          font:600 10px/1.4 Inter,system-ui,sans-serif;
          text-align:center;
          opacity:0;
          pointer-events:none;
          transition:
            opacity .16s ease,
            transform .16s ease;
        }

        #v2-mobile-chart-hint.show{
          opacity:1;
          transform:translate(-50%,0);
        }
      }
    `;

    document.head.appendChild(style);

    /*
     * Give the user a one-time hint on touch devices.
     */
    if (!sessionStorage.getItem(
      "trademind_v2_chart_touch_hint"
    )) {
      sessionStorage.setItem(
        "trademind_v2_chart_touch_hint",
        "1"
      );

      setTimeout(showTouchHint, 900);
    }

    console.info(
      "[TradeMind V2] Mobile chart interaction ready — frontend only."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initMobileChartInteraction,
      { once: true }
    );
  } else {
    initMobileChartInteraction();
  }
})();

/*
===========================================================
 TradeMind Pro — V2
 STEP 10.2C — MOBILE CHART INTERACTION v2
 ----------------------------------------------------------
 FRONTEND ONLY
 - Real touch pinch zoom
 - One-finger candle pan
 - Tap / hold candle -> OHLCV tooltip
 - Double tap -> reset to 1D
 - Works with existing v2.js chart state
 - No backend/API/Phase 11 changes
 - Does NOT replace v2.js
===========================================================
*/

(() => {
  "use strict";

  function init() {
    const plot = document.querySelector("#v2-chart-plot");
    const chart = document.querySelector(".chart");

    if (!plot || !chart) {
      console.warn("[TradeMind V2] Mobile chart v2: plot not found.");
      return;
    }

    if (plot.dataset.mobileTouchV2 === "1") return;
    plot.dataset.mobileTouchV2 = "1";

    /*
     * v2.js already owns:
     * - chartStart
     * - chartVisibleCount
     * - chartDragging
     * - chartPointerIndex
     * - renderChart()
     *
     * They are lexical/private, so we deliberately do not mutate
     * them directly. Instead this layer uses the chart's existing
     * pointer/wheel event engine.
     */

    let pinchStartDistance = 0;
    let pinchStartTime = 0;
    let pinchMoved = false;

    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    let suppressNextPointer = false;

    function distance(a, b) {
      return Math.hypot(
        a.clientX - b.clientX,
        a.clientY - b.clientY
      );
    }

    function midpoint(a, b) {
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2
      };
    }

    function dispatchWheel(clientX, clientY, deltaY) {
      /*
       * v2.js listens to wheel on #v2-chart-plot.
       * A synthetic WheelEvent lets the existing, tested zoom
       * implementation perform the actual range calculation.
       */
      const wheel = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        deltaX: 0,
        deltaY,
        deltaMode: 0
      });

      plot.dispatchEvent(wheel);
    }

    function dispatchPointer(type, touch, pointerId) {
      /*
       * Forward a single touch position into the existing pointer
       * interaction engine. This allows the existing candle hit
       * detection and tooltip logic to remain authoritative.
       */
      if (!touch) return;

      try {
        const pointer = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          clientX: touch.clientX,
          clientY: touch.clientY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          buttons: type === "pointerup" ? 0 : 1,
          pressure: type === "pointerup" ? 0 : 0.5
        });

        plot.dispatchEvent(pointer);
      } catch {
        /*
         * Older browsers: native touch events remain available.
         */
      }
    }

    function showTouchTooltipAt(touch) {
      /*
       * The existing v2.js pointermove handler calculates the
       * candle from clientX and renders the OHLCV tooltip.
       */
      dispatchPointer(
        "pointermove",
        touch,
        9001
      );
    }

    function hideTouchTooltip() {
      /*
       * Move outside the chart. This uses the existing chart
       * interaction cleanup instead of manipulating tooltip DOM.
       */
      const rect = plot.getBoundingClientRect();

      const outside = new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        pointerId: 9001,
        pointerType: "touch",
        isPrimary: true,
        clientX: rect.left - 20,
        clientY: rect.top - 20,
        buttons: 0,
        pressure: 0
      });

      plot.dispatchEvent(outside);
    }

    function resetViaRangeButton() {
      const button = [
        ...document.querySelectorAll(".range-controls button")
      ].find(
        item => item.textContent.trim() === "1D"
      );

      if (button) {
        button.click();
      }
    }

    /*
     * Touch start
     */
    plot.addEventListener(
      "touchstart",
      event => {
        if (event.touches.length === 2) {
          pinchStartDistance =
            distance(
              event.touches[0],
              event.touches[1]
            );

          pinchStartTime = Date.now();
          pinchMoved = false;

          /*
           * Do not allow the browser to scroll/zoom the page while
           * the user is actively pinching the chart.
           */
          event.preventDefault();
          return;
        }

        if (event.touches.length !== 1) return;

        const touch = event.touches[0];
        const now = Date.now();

        /*
         * Double tap detection.
         */
        const closeInTime =
          now - lastTapTime < 320;

        const closeInSpace =
          Math.hypot(
            touch.clientX - lastTapX,
            touch.clientY - lastTapY
          ) < 28;

        if (closeInTime && closeInSpace) {
          event.preventDefault();

          suppressNextPointer = true;
          resetViaRangeButton();

          lastTapTime = 0;
          return;
        }

        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;

        /*
         * Send the touch into the existing chart controller so
         * candle selection/pointer state is established.
         */
        dispatchPointer(
          "pointerdown",
          touch,
          9001
        );
      },
      { passive: false }
    );

    /*
     * Touch movement
     */
    plot.addEventListener(
      "touchmove",
      event => {
        /*
         * PINCH ZOOM
         */
        if (event.touches.length === 2) {
          event.preventDefault();

          const currentDistance =
            distance(
              event.touches[0],
              event.touches[1]
            );

          if (!pinchStartDistance) {
            pinchStartDistance =
              currentDistance;
            return;
          }

          const change =
            currentDistance -
            pinchStartDistance;

          /*
           * Ignore tiny finger jitter.
           */
          if (Math.abs(change) < 5) return;

          pinchMoved = true;

          const center =
            midpoint(
              event.touches[0],
              event.touches[1]
            );

          /*
           * Positive distance change = fingers moved apart =
           * zoom IN.
           *
           * Negative distance change = fingers moved together =
           * zoom OUT.
           *
           * Use small incremental wheel-equivalent steps to make
           * the zoom smooth rather than jumping.
           */
          const delta =
            change > 0
              ? -Math.min(42, Math.abs(change) * 0.42)
              : Math.min(42, Math.abs(change) * 0.42);

          dispatchWheel(
            center.x,
            center.y,
            delta
          );

          pinchStartDistance =
            currentDistance;

          return;
        }

        /*
         * ONE-FINGER PAN / CANDLE INSPECTION
         *
         * v2.js already owns pointer movement. Forwarding the
         * touch position lets its existing drag and candle-hit
         * behavior operate normally.
         */
        if (event.touches.length === 1) {
          const touch = event.touches[0];

          dispatchPointer(
            "pointermove",
            touch,
            9001
          );
        }
      },
      { passive: false }
    );

    /*
     * Touch end
     */
    plot.addEventListener(
      "touchend",
      event => {
        if (event.touches.length === 0) {
          if (pinchMoved) {
            pinchStartDistance = 0;
            pinchMoved = false;
          }

          /*
           * Forward pointerup so the existing chart controller
           * releases its drag state.
           */
          if (
            event.changedTouches &&
            event.changedTouches.length
          ) {
            const touch =
              event.changedTouches[
                event.changedTouches.length - 1
              ];

            dispatchPointer(
              "pointerup",
              touch,
              9001
            );

            /*
             * A short stationary touch is a candle-detail action.
             * Keep the tooltip visible briefly instead of removing
             * it immediately.
             */
            if (!suppressNextPointer && !pinchMoved) {
              showTouchTooltipAt(touch);

              clearTimeout(
                plot._mobileTooltipTimer
              );

              plot._mobileTooltipTimer =
                setTimeout(
                  hideTouchTooltip,
                  3500
                );
            }

            suppressNextPointer = false;
          }

          return;
        }

        /*
         * If one finger remains after a pinch, restart the touch
         * interaction cleanly.
         */
        if (event.touches.length === 1) {
          pinchStartDistance = 0;
          pinchMoved = false;

          const touch =
            event.touches[0];

          dispatchPointer(
            "pointerdown",
            touch,
            9001
          );
        }
      },
      { passive: false }
    );

    /*
     * Prevent browser double-tap zoom only inside the chart.
     * Page-level browser zoom remains untouched.
     */
    plot.style.touchAction = "none";
    plot.style.webkitUserSelect = "none";
    plot.style.userSelect = "none";

    const style =
      document.createElement("style");

    style.id =
      "v2-mobile-chart-v2-style";

    style.textContent = `
      @media(pointer:coarse){

        #v2-chart-plot{
          touch-action:none !important;
          -webkit-user-select:none;
          user-select:none;
          -webkit-touch-callout:none;
          cursor:crosshair;
        }

        #v2-chart-plot:active{
          cursor:grabbing;
        }

        .v2-interactive-tooltip{
          min-width:165px;
          max-width:calc(100vw - 24px);
          font-size:9px;
        }

        .v2-interactive-tooltip .tooltip-time{
          font-size:10px;
        }
      }
    `;

    document.head.appendChild(style);

    console.info(
      "[TradeMind V2] Mobile chart interaction v2 ready."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();

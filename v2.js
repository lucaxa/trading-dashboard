/*
===========================================================
 TradeMind Pro — V2 Dashboard
 STEP 4.9 — INTERACTIVE REAL-MARKET CHART
 ----------------------------------------------------------
 READ-ONLY PRESENTATION LAYER

 IMPORTANT:
 - Uses the existing GET /api/quotes route.
 - Reuses the proven quote extraction shape from script.js.
 - Does not modify Phase 11.
 - Does not modify api/quotes.js.
 - Does not call a broker.
 - Does not write evidence.
 - Quotes refresh every 5 seconds.
===========================================================
*/
(() => {
  "use strict";

  const state = {
    nifty: null,
    banknifty: null,
    previousNifty: null,
    previousBanknifty: null,
    lastUpdate: null,
    quoteInFlight: false,
    started: false,
    candles: [],
    chartRange: "1D",
    chartStart: 0,
    chartVisibleCount: 78,
    chartDragging: false,
    chartDragStartX: 0,
    chartDragStartIndex: 0,
    chartPointerIndex: null
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  function numberOrNull(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatPrice(value) {
    const n = numberOrNull(value);
    if (n === null) return "--";

    return n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /*
   * This follows the same response-shape strategy already used
   * by the working V10.25 frontend controller:
   * result.data -> array, quotes, results, items, or object values.
   */
  function extractQuotes(data) {
    if (Array.isArray(data)) return data;

    if (!data || typeof data !== "object") {
      return [];
    }

    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.quotes)) return data.quotes;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.items)) return data.items;

    /*
     * INDstocks returns full quotes as an object keyed by
     * the instrument code, for example:
     *
     * {
     *   "NIDX_40000001": { live_price: ... },
     *   "NIDX_40000003": { live_price: ... }
     * }
     *
     * Object.values() alone loses that instrument key.
     * Preserve it so findInstrument() can identify NIFTY
     * and BANKNIFTY reliably.
     */
    return Object.entries(data)
      .filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
      )
      .map(
        ([instrumentKey, value]) => ({
          ...value,
          __instrumentKey: instrumentKey
        })
      );
  }

  function extractPrice(quote) {
    if (typeof quote === "number") {
      return numberOrNull(quote);
    }

    if (!quote || typeof quote !== "object") {
      return null;
    }

    const fields = [
      "ltp",
      "last_price",
      "lastPrice",
      "price",
      "close",
      "lp",
      "last_traded_price",
      "lastTradedPrice",
      "live_price",
      "livePrice"
    ];

    for (const field of fields) {
      const n = Number(quote[field]);

      if (Number.isFinite(n) && n > 0) {
        return n;
      }
    }

    return null;
  }

  function findInstrument(quotes, instrument) {
    const wanted = String(instrument).toLowerCase();

    return quotes.find(quote => {
      if (!quote || typeof quote !== "object") {
        return false;
      }

      let text = "";

      try {
        text = JSON.stringify(quote).toLowerCase();
      } catch {
        return false;
      }

      if (wanted === "nifty") {
        return (
          text.includes("nidx_40000001") ||
          text.includes("40000001") ||
          (
            text.includes("nifty") &&
            !text.includes("banknifty")
          )
        );
      }

      if (wanted === "banknifty") {
        return (
          text.includes("nidx_40000003") ||
          text.includes("40000003") ||
          text.includes("banknifty")
        );
      }

      return false;
    }) || null;
  }

  async function fetchQuotes() {
    if (state.quoteInFlight) return;

    state.quoteInFlight = true;

    try {
      const response = await fetch(
        `/api/quotes?_v2=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          }
        }
      );

      const text = await response.text();

      let result;

      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          `Invalid JSON from /api/quotes (HTTP ${response.status})`
        );
      }

      console.info(
        "[TradeMind V2] /api/quotes",
        result
      );

      if (!response.ok) {
        throw new Error(
          `Quote API HTTP ${response.status}`
        );
      }

      if (result?.success === false) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error || result)
        );
      }

      /*
       * api/quotes.js returns:
       * {
       *   success: true,
       *   source: "INDstocks",
       *   data: data.data
       * }
       */
      const quotes =
        extractQuotes(result?.data ?? result);

      const niftyQuote =
        findInstrument(quotes, "nifty");

      const bankQuote =
        findInstrument(quotes, "banknifty");

      const niftyPrice =
        extractPrice(niftyQuote);

      const bankPrice =
        extractPrice(bankQuote);

      if (niftyPrice !== null) {
        state.previousNifty =
          state.nifty;

        state.nifty =
          niftyPrice;
      }

      if (bankPrice !== null) {
        state.previousBanknifty =
          state.banknifty;

        state.banknifty =
          bankPrice;
      }

      if (
        niftyPrice !== null ||
        bankPrice !== null
      ) {
        state.lastUpdate = new Date();
      }

      render();

      console.info(
        "[TradeMind V2] Parsed quotes",
        {
          nifty: niftyPrice,
          banknifty: bankPrice,
          niftyQuote,
          bankQuote,
          quoteCount: quotes.length
        }
      );

    } catch (error) {
      console.error(
        "[TradeMind V2] quote refresh failed:",
        error
      );
    } finally {
      state.quoteInFlight = false;
    }
  }

  function renderChange(price, previous) {
    if (
      price === null ||
      previous === null
    ) {
      return "Waiting for live data";
    }

    const change =
      price - previous;

    if (change === 0) {
      return "No change";
    }

    const pct =
      previous !== 0
        ? (change / previous) * 100
        : 0;

    const sign =
      change >= 0 ? "+" : "";

    return `${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  }

  function updateIndexCards() {
    const cards =
      $$(".market-strip .index-card");

    if (cards[0]) {
      const price =
        $("strong", cards[0]);

      const change =
        $("em", cards[0]);

      if (price) {
        price.textContent =
          formatPrice(state.nifty);
      }

      if (change) {
        change.textContent =
          renderChange(
            state.nifty,
            state.previousNifty
          );

        change.style.color =
          state.nifty !== null &&
          state.previousNifty !== null &&
          state.nifty < state.previousNifty
            ? "#ff4f5e"
            : "#16e782";
      }
    }

    if (cards[1]) {
      const price =
        $("strong", cards[1]);

      const change =
        $("em", cards[1]);

      if (price) {
        price.textContent =
          formatPrice(state.banknifty);
      }

      if (change) {
        change.textContent =
          renderChange(
            state.banknifty,
            state.previousBanknifty
          );

        change.style.color =
          state.banknifty !== null &&
          state.previousBanknifty !== null &&
          state.banknifty < state.previousBanknifty
            ? "#ff4f5e"
            : "#16e782";
      }
    }
  }

  function updateTimestamp() {
    const time =
      $("#v2-chart-time");

    const status =
      $(".market-status strong");

    if (!state.lastUpdate) {
      if (time) {
        time.textContent =
          "--:--:-- IST";
      }

      if (status) {
        status.textContent =
          "--:--:--";
      }

      return;
    }

    const text =
      state.lastUpdate.toLocaleTimeString(
        "en-IN",
        {
          hour12: false,
          timeZone: "Asia/Kolkata"
        }
      );

    if (time) {
      time.textContent =
        `${text} IST`;
    }

    if (status) {
      status.textContent =
        text;
    }
  }

  function updateCurrentPrice() {
    const price =
      $("#v2-current-price");

    if (price) {
      price.textContent =
        formatPrice(state.nifty);
    }

    const chart =
      $(".chart");

    const line =
      $(".current-price-line", chart);

    if (!chart || !line) return;

    const current =
      state.nifty;

    if (current === null) return;

    const candles =
      getVisibleCandles();

    if (!candles.length) return;

    const values =
      candles.flatMap(
        candle => [
          candle.high,
          candle.low
        ]
      );

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const span =
      max - min || 1;

    const bounded =
      Math.max(
        min,
        Math.min(
          max,
          current
        )
      );

    const pct =
      ((max - bounded) /
        span) * 100;

    const position =
      Math.max(
        5,
        Math.min(
          95,
          pct
        )
      );

    line.style.top =
      `${position}%`;

    if (price) {
      price.style.top =
        `${position}%`;
    }
  }


  function addChartStyles() {
    if ($("#v2-live-chart-styles")) return;

    const style =
      document.createElement("style");

    style.id =
      "v2-live-chart-styles";

    style.textContent = `
      .chart-plot{
        position:absolute;
        left:8%;
        right:8%;
        top:18%;
        bottom:18%;
        overflow:hidden;
        z-index:3;
      }

      .v2-live-candle{
        position:absolute;
        width:7px;
      }

      .v2-live-wick{
        position:absolute;
        left:3px;
        width:1px;
        height:100%;
      }

      .v2-live-body{
        position:absolute;
        left:0;
        width:7px;
        min-height:2px;
      }

      .v2-up .v2-live-wick,
      .v2-up .v2-live-body{
        background:#16e782;
      }

      .v2-down .v2-live-wick,
      .v2-down .v2-live-body{
        background:#ff4f5e;
      }

      .chart-volume{
        position:absolute;
        left:8%;
        right:8%;
        bottom:5%;
        height:14%;
        display:flex;
        align-items:flex-end;
        gap:3px;
        z-index:2;
        overflow:hidden;
      }

      .v2-volume{
        flex:1;
        min-width:2px;
        background:rgba(22,140,255,.28);
        border-radius:2px 2px 0 0;
      }

      .current-price-line{
        position:absolute;
        left:8%;
        right:0;
        height:1px;
        border-top:1px dashed #16e782;
        z-index:5;
        pointer-events:none;
      }

      #v2-current-price{
        z-index:6;
        transform:translateY(-50%);
      }

      .v2-indicator-svg{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        overflow:visible;
        pointer-events:none;
        z-index:4;
      }

      .v2-indicator-line{
        fill:none;
        stroke-width:0.8;
        vector-effect:non-scaling-stroke;
      }

      .v2-ema9{
        stroke:#19a7ff;
      }

      .v2-ema21{
        stroke:#ff9f1a;
      }

      .v2-vwap{
        stroke:#a96cff;
      }

      .v2-indicator-legend{
        position:absolute;
        left:0;
        top:0;
        display:flex;
        flex-direction:column;
        gap:3px;
        padding:6px 8px;
        background:rgba(5,12,21,.78);
        border-radius:4px;
        color:#8fa2b8;
        font-size:8px;
        line-height:1.2;
        pointer-events:none;
        z-index:8;
      }

      .v2-indicator-legend div{
        display:flex;
        align-items:center;
        gap:4px;
        white-space:nowrap;
      }

      .v2-indicator-legend b{
        color:#d9e2ed;
        font-weight:700;
      }

      .v2-dot{
        width:7px;
        height:2px;
        display:inline-block;
      }

      .v2-dot.ema9{background:#19a7ff}
      .v2-dot.ema21{background:#ff9f1a}
      .v2-dot.vwap{background:#a96cff}
      .v2-dot.volume{background:#2d6f91}

      .v2-crosshair-x{
        position:absolute;
        top:18%;
        bottom:18%;
        width:1px;
        background:rgba(122,165,205,.45);
        display:none;
        z-index:12;
        pointer-events:none;
      }

      .v2-crosshair-y{
        position:absolute;
        left:8%;
        right:0;
        height:1px;
        background:rgba(122,165,205,.45);
        display:none;
        z-index:12;
        pointer-events:none;
      }

      .v2-interactive-tooltip{
        position:absolute;
        min-width:190px;
        display:none;
        flex-direction:column;
        gap:3px;
        padding:8px 10px;
        border:1px solid #29415c;
        border-radius:7px;
        background:rgba(5,13,23,.96);
        box-shadow:0 8px 24px rgba(0,0,0,.35);
        color:#9eb0c5;
        font-size:9px;
        line-height:1.25;
        z-index:20;
        pointer-events:none;
      }

      .v2-interactive-tooltip b{
        color:#f4f8fc;
      }

      .v2-interactive-tooltip .tooltip-time{
        color:#16e782;
        font-weight:700;
        margin-bottom:2px;
      }

      .v2-range-status{
        position:absolute;
        left:8%;
        bottom:2px;
        transform:translateY(100%);
        color:#60758e;
        font-size:7px;
        pointer-events:none;
        z-index:8;
        white-space:nowrap;
      }

      .chart-plot{
        cursor:crosshair;
        user-select:none;
        -webkit-user-select:none;
      }

      .chart-plot:active{
        cursor:grabbing;
      }

      .range-controls button{
        cursor:pointer;
        transition:all .15s ease;
      }

      .range-controls button.active{
        border-color:#16e782 !important;
        color:#16e782 !important;
        box-shadow:0 0 0 1px rgba(22,231,130,.2);
      }

      .chart-overlay{
        z-index:5;
      }

      .chart-indicator-legend,
      .chart-axis-y,
      .chart-axis-x{
        z-index:7;
      }

      /* ---- V2.7 chart layout corrections ---- */

      .chart-axis-y{
        position:absolute;
        left:0;
        top:8%;
        bottom:18%;
        width:7%;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
        align-items:flex-end;
        padding-right:6px;
        color:#71839a;
        font-size:8px;
        line-height:1;
        pointer-events:none;
      }

      .chart-axis-x{
        position:absolute;
        left:8%;
        right:8%;
        bottom:2%;
        height:12%;
        display:flex;
        align-items:flex-end;
        justify-content:space-between;
        color:#71839a;
        font-size:8px;
        line-height:1;
        pointer-events:none;
      }

      .chart-indicator-legend{
        position:absolute;
        left:10px;
        top:10px;
        display:flex;
        flex-direction:column;
        gap:3px;
        color:#9aabc0;
        font-size:8px;
        line-height:1.1;
        pointer-events:none;
      }

      .chart-indicator-legend b{
        color:#d6deea;
        font-weight:700;
      }

      .chart-overlay{
        position:absolute;
        inset:0;
        pointer-events:none;
      }

      .chart-crosshair{
        display:none;
      }

      .chart-tooltip{
        position:absolute;
        right:10px;
        top:10px;
        display:none;
        flex-direction:column;
        gap:3px;
        min-width:120px;
        padding:8px 9px;
        border:1px solid #29415c;
        border-radius:6px;
        background:rgba(7,16,26,.96);
        color:#b9c7d8;
        font-size:8px;
        line-height:1.2;
        z-index:10;
        pointer-events:none;
      }

      .chart-tooltip b{
        color:#f5f7fb;
        font-size:9px;
      }

      .chart-price{
        right:0;
        min-width:66px;
        text-align:center;
        white-space:nowrap;
      }

      .v2-live-candle{
        z-index:2;
      }

      .chart-volume{
        z-index:2;
      }

      .chart-plot{
        z-index:3;
      }

      .grid{
        z-index:0;
      }
    `;

    document.head.appendChild(style);
  }

  function normalizeCandle(raw) {
    if (!raw || typeof raw !== "object") return null;

    const open = numberOrNull(raw.o ?? raw.open);
    const high = numberOrNull(raw.h ?? raw.high);
    const low = numberOrNull(raw.l ?? raw.low);
    const close = numberOrNull(raw.c ?? raw.close);
    const volume = numberOrNull(raw.v ?? raw.volume) ?? 0;
    const ts = numberOrNull(raw.ts ?? raw.timestamp ?? raw.time);

    if (
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      return null;
    }

    return {
      ts,
      open,
      high,
      low,
      close,
      volume
    };
  }

  function extractHistoricalCandles(data) {
    if (!data || typeof data !== "object") {
      return [];
    }

    /*
     * INDstocks historical response:
     * {
     *   data: {
     *     NIDX_40000001: {
     *       candles: [
     *         { ts, o, h, l, c, v },
     *         ...
     *       ]
     *     }
     *   }
     * }
     */
    const root =
      data.data && typeof data.data === "object"
        ? data.data
        : data;

    const nifty =
      root["NIDX_40000001"] ||
      root["NIDX:40000001"] ||
      root["40000001"] ||
      root.nifty ||
      root.NIFTY ||
      null;

    let rawCandles =
      Array.isArray(nifty?.candles)
        ? nifty.candles
        : Array.isArray(nifty)
          ? nifty
          : [];

    /*
     * Fallback for APIs that return a direct array.
     */
    if (!rawCandles.length && Array.isArray(root)) {
      rawCandles = root;
    }

    return rawCandles
      .map(normalizeCandle)
      .filter(Boolean)
      .sort(
        (a, b) =>
          (a.ts ?? 0) -
          (b.ts ?? 0)
      );
  }

  async function fetchCandles() {
    try {
      /*
       * Request the full historical slice exposed by the existing
       * frontend-safe candle endpoint. V2 does not change the endpoint
       * or its backend behavior.
       */
      const response = await fetch(
        `/api/candles?interval=5minute&_v2=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          }
        }
      );

      const text = await response.text();

      let result;

      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          `Invalid JSON from /api/candles (HTTP ${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          `Candle API HTTP ${response.status}`
        );
      }

      if (result?.success === false) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error || result)
        );
      }

      const candles =
        extractHistoricalCandles(result);

      if (!candles.length) {
        throw new Error(
          "No NIFTY 5-minute candles returned"
        );
      }

      /*
       * IMPORTANT:
       * Keep every real candle returned by the existing endpoint.
       * The viewport/range controls decide what is visible.
       */
      state.candles = candles;

      /*
       * Keep the selected range anchored to the latest candle after
       * a refresh, unless the user is actively dragging/zooming.
       */
      if (!state.chartDragging) {
        applyRangeToViewport(state.chartRange, true);
      }

      renderChart();

      console.info(
        "[TradeMind V2] Historical candles loaded",
        {
          returned: candles.length,
          visible: state.chartVisibleCount,
          range: state.chartRange,
          last: state.candles[state.candles.length - 1]
        }
      );

    } catch (error) {
      console.error(
        "[TradeMind V2] candle refresh failed:",
        error
      );

      /*
       * Never replace real candles with synthetic data.
       * Preserve the last successful chart.
       */
    }
  }

  function mergeLiveQuoteIntoCurrentCandle() {
    if (
      state.nifty === null ||
      !state.candles.length
    ) {
      return;
    }

    const last =
      state.candles[state.candles.length - 1];

    if (!last) return;

    /*
     * Only update the most recent historical candle.
     * This keeps OHLC history sourced from /api/candles
     * while allowing the currently forming candle to track
     * the live quote.
     */
    last.close = state.nifty;
    last.high = Math.max(
      last.high,
      state.nifty
    );
    last.low = Math.min(
      last.low,
      state.nifty
    );

    renderChart();
  }


  /* =========================================================
     REAL INDICATORS — FRONTEND DISPLAY ONLY
     Calculated from the real NIFTY 5-minute candles already
     loaded by V2. No backend/strategy state is modified.
  ========================================================= */

  function calculateEMA(candles, period) {
    if (!candles.length) return [];

    const multiplier = 2 / (period + 1);
    const result = [];
    let ema = null;

    candles.forEach((candle, index) => {
      if (index === 0) {
        ema = candle.close;
      } else {
        ema =
          (candle.close - ema) * multiplier +
          ema;
      }

      result.push(ema);
    });

    return result;
  }

  function calculateVWAP(candles) {
    let cumulativePV = 0;
    let cumulativeVolume = 0;

    return candles.map(candle => {
      const typicalPrice =
        (candle.high + candle.low + candle.close) / 3;

      const volume =
        Number.isFinite(candle.volume) &&
        candle.volume > 0
          ? candle.volume
          : 0;

      cumulativePV +=
        typicalPrice * volume;

      cumulativeVolume += volume;

      return cumulativeVolume > 0
        ? cumulativePV / cumulativeVolume
        : typicalPrice;
    });
  }

  function createIndicatorPath(values, min, max) {
    if (!values.length) return "";

    const span = max - min || 1;
    const lastIndex =
      Math.max(1, values.length - 1);

    return values
      .map((value, index) => {
        const x =
          (index / lastIndex) * 100;

        const y =
          ((max - value) / span) * 100;

        return `${index === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
      })
      .join(" ");
  }

  function renderRealIndicators(candles, min, max) {
    const plot = $("#v2-chart-plot");
    if (!plot || !candles.length) return;

    plot.querySelector(".v2-indicator-svg")?.remove();
    plot.querySelector(".v2-indicator-legend")?.remove();

    const ema9 = calculateEMA(candles, 9);
    const ema21 = calculateEMA(candles, 21);
    const vwap = calculateVWAP(candles);

    const svg =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );

    svg.classList.add("v2-indicator-svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");

    svg.innerHTML = `
      <path
        class="v2-indicator-line v2-ema9"
        d="${createIndicatorPath(ema9, min, max)}"
      />
      <path
        class="v2-indicator-line v2-ema21"
        d="${createIndicatorPath(ema21, min, max)}"
      />
      <path
        class="v2-indicator-line v2-vwap"
        d="${createIndicatorPath(vwap, min, max)}"
      />
    `;

    plot.appendChild(svg);

    const legend =
      document.createElement("div");

    legend.className = "v2-indicator-legend";

    legend.innerHTML = `
      <div><span class="v2-dot ema9"></span>EMA 9 <b>${formatPrice(ema9.at(-1))}</b></div>
      <div><span class="v2-dot ema21"></span>EMA 21 <b>${formatPrice(ema21.at(-1))}</b></div>
      <div><span class="v2-dot vwap"></span>VWAP <b>${formatPrice(vwap.at(-1))}</b></div>
      <div><span class="v2-dot volume"></span>Volume <b>${formatVolume(candles.at(-1)?.volume)}</b></div>
    `;

    plot.appendChild(legend);
  }


  function formatVolume(value) {
    const n = numberOrNull(value);
    if (n === null) return "--";

    if (n >= 1000000) {
      return `${(n / 1000000).toFixed(2)}M`;
    }

    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }

    return n.toFixed(0);
  }

  function getRangeCount(range) {
    const counts = {
      "1D": 78,
      "5D": 390,
      "1M": 1638,
      "3M": 4914,
      "6M": 9828,
      "YTD": 99999,
      "1Y": 99999,
      "All": 99999
    };

    return counts[range] ?? 78;
  }

  function getVisibleCandles() {
    const all = state.candles;

    if (!all.length) {
      return [];
    }

    const count = Math.min(
      Math.max(10, state.chartVisibleCount),
      all.length
    );

    const maxStart =
      Math.max(0, all.length - count);

    state.chartStart =
      Math.max(
        0,
        Math.min(
          state.chartStart,
          maxStart
        )
      );

    return all.slice(
      state.chartStart,
      state.chartStart + count
    );
  }

  function applyRangeToViewport(range, anchorLatest = true) {
    state.chartRange = range;

    const requested =
      getRangeCount(range);

    state.chartVisibleCount =
      Math.min(
        requested,
        Math.max(10, state.candles.length)
      );

    if (anchorLatest) {
      state.chartStart =
        Math.max(
          0,
          state.candles.length -
          state.chartVisibleCount
        );
    }

    /*
     * If the feed does not contain enough history for the selected
     * range, show everything actually available instead of fabricating
     * historical data.
     */
    renderRangeStatus();
  }

  function renderRangeStatus() {
    const chart = $(".chart");
    if (!chart) return;

    let status =
      $(".v2-range-status", chart);

    if (!status) {
      status =
        document.createElement("div");

      status.className =
        "v2-range-status";

      chart.appendChild(status);
    }

    const requested =
      getRangeCount(state.chartRange);

    const available =
      state.candles.length;

    if (
      requested > available &&
      available > 0
    ) {
      status.textContent =
        `${state.chartRange} • ${available.toLocaleString("en-IN")} candles available`;
      status.title =
        "This frontend is showing all candles returned by the existing backend feed. No historical data is fabricated.";
    } else {
      status.textContent =
        `${state.chartRange} • ${state.chartVisibleCount.toLocaleString("en-IN")} candles`;
      status.title =
        "Frontend chart range";
    }
  }

  function updateChartAxes(candles, min, max) {
    const chart = $(".chart");
    if (!chart || !candles.length) return;

    let yAxis =
      $(".chart-axis-y", chart);

    if (!yAxis) {
      yAxis =
        document.createElement("div");
      yAxis.className = "chart-axis-y";
      chart.appendChild(yAxis);
    }

    const span =
      max - min || 1;

    const yValues =
      [0, 0.25, 0.5, 0.75, 1]
        .map(
          ratio =>
            max - span * ratio
        );

    yAxis.innerHTML =
      yValues
        .map(
          value =>
            `<span>${formatPrice(value)}</span>`
        )
        .join("");

    let xAxis =
      $(".chart-axis-x", chart);

    if (!xAxis) {
      xAxis =
        document.createElement("div");
      xAxis.className = "chart-axis-x";
      chart.appendChild(xAxis);
    }

    const indices =
      [0, 0.25, 0.5, 0.75, 1]
        .map(
          ratio =>
            Math.min(
              candles.length - 1,
              Math.round(
                ratio *
                (candles.length - 1)
              )
            )
        );

    xAxis.innerHTML =
      indices
        .map(
          index =>
            `<span>${formatCandleTime(
              candles[index].ts
            )}</span>`
        )
        .join("");
  }

  function formatCandleTime(ts) {
    if (!Number.isFinite(ts)) return "--";

    const ms =
      ts < 100000000000
        ? ts * 1000
        : ts;

    const date =
      new Date(ms);

    if (Number.isNaN(date.getTime())) {
      return "--";
    }

    return date.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata"
      }
    );
  }

  function renderChart() {
    const chart = $(".chart");
    if (!chart) return;

    const plot = $("#v2-chart-plot");
    const volume = $("#v2-chart-volume");

    if (!plot || !volume) return;

    $(".fake-candles", chart)?.remove();

    $$(".ema", chart)
      .forEach(
        element => element.remove()
      );

    $$(".chart-indicator-legend", chart)
      .forEach(
        element => element.remove()
      );

    plot.innerHTML = "";
    volume.innerHTML = "";

    const candles =
      getVisibleCandles();

    if (!candles.length) {
      updateCurrentPrice();
      return;
    }

    const lows =
      candles.map(
        candle => candle.low
      );

    const highs =
      candles.map(
        candle => candle.high
      );

    /*
     * Add a small visual margin so the candles do not touch the
     * top/bottom edges when volatility is low.
     */
    const rawMin =
      Math.min(...lows);

    const rawMax =
      Math.max(...highs);

    const rawSpan =
      rawMax - rawMin || 1;

    const padding =
      rawSpan * 0.08;

    const min =
      rawMin - padding;

    const max =
      rawMax + padding;

    const span =
      max - min || 1;

    renderRealIndicators(
      candles,
      min,
      max
    );

    updateChartAxes(
      candles,
      min,
      max
    );

    const count =
      candles.length;

    candles.forEach(
      (candle, index) => {
        const wrapper =
          document.createElement("div");

        const up =
          candle.close >=
          candle.open;

        wrapper.className =
          `v2-live-candle ${
            up
              ? "v2-up"
              : "v2-down"
          }`;

        const x =
          count === 1
            ? 50
            : (index /
                (count - 1)) *
              100;

        const highPct =
          ((max - candle.high) /
            span) * 100;

        const lowPct =
          ((max - candle.low) /
            span) * 100;

        const openPct =
          ((max - candle.open) /
            span) * 100;

        const closePct =
          ((max - candle.close) /
            span) * 100;

        wrapper.style.left =
          `calc(${x}% - 3px)`;

        wrapper.style.top =
          `${highPct}%`;

        wrapper.style.height =
          `${Math.max(
            1,
            lowPct - highPct
          )}%`;

        const wick =
          document.createElement("div");

        wick.className =
          "v2-live-wick";

        const body =
          document.createElement("div");

        body.className =
          "v2-live-body";

        body.style.top =
          `${Math.max(
            0,
            Math.min(
              100,
              Math.min(
                openPct,
                closePct
              ) - highPct
            )
          )}%`;

        body.style.height =
          `${Math.max(
            1,
            Math.min(
              100,
              Math.abs(
                openPct -
                closePct
              )
            )
          )}%`;

        wrapper.append(
          wick,
          body
        );

        plot.appendChild(
          wrapper
        );

        const bar =
          document.createElement("div");

        bar.className =
          "v2-volume";

        const volumes =
          candles.map(
            item =>
              Number(item.volume) || 0
          );

        const maxVolume =
          Math.max(
            1,
            ...volumes
          );

        bar.style.height =
          `${Math.max(
            4,
            ((Number(candle.volume) || 0) /
              maxVolume) *
            100
          )}%`;

        volume.appendChild(bar);
      }
    );

    renderRangeStatus();
    updateCurrentPrice();
    updateChartInteractionPosition();
  }

  function getCandleFromPointer(event) {
    const plot =
      $("#v2-chart-plot");

    if (!plot || !state.candles.length) {
      return null;
    }

    const rect =
      plot.getBoundingClientRect();

    const x =
      Math.max(
        0,
        Math.min(
          rect.width,
          event.clientX - rect.left
        )
      );

    const visible =
      getVisibleCandles();

    if (!visible.length) return null;

    const ratio =
      rect.width > 0
        ? x / rect.width
        : 0;

    const localIndex =
      Math.round(
        ratio *
        Math.max(
          0,
          visible.length - 1
        )
      );

    const index =
      state.chartStart +
      localIndex;

    const candle =
      state.candles[
        Math.max(
          0,
          Math.min(
            state.candles.length - 1,
            index
          )
        )
      ];

    return {
      candle,
      index,
      localIndex,
      ratio
    };
  }

  function ensureChartInteractionElements() {
    const chart = $(".chart");
    if (!chart) return;

    if (!$(".v2-crosshair-x", chart)) {
      const line =
        document.createElement("div");

      line.className =
        "v2-crosshair-x";

      chart.appendChild(line);
    }

    if (!$(".v2-crosshair-y", chart)) {
      const line =
        document.createElement("div");

      line.className =
        "v2-crosshair-y";

      chart.appendChild(line);
    }

    if (!$(".v2-interactive-tooltip", chart)) {
      const tooltip =
        document.createElement("div");

      tooltip.className =
        "v2-interactive-tooltip";

      chart.appendChild(tooltip);
    }
  }

  function updateChartInteractionPosition(event) {
    const chart = $(".chart");
    const plot = $("#v2-chart-plot");

    if (!chart || !plot) return;

    ensureChartInteractionElements();

    const crossX =
      $(".v2-crosshair-x", chart);

    const crossY =
      $(".v2-crosshair-y", chart);

    const tooltip =
      $(".v2-interactive-tooltip", chart);

    if (
      state.chartPointerIndex === null
    ) {
      crossX.style.display = "none";
      crossY.style.display = "none";
      tooltip.style.display = "none";
      return;
    }

    const visible =
      getVisibleCandles();

    const localIndex =
      state.chartPointerIndex -
      state.chartStart;

    if (
      localIndex < 0 ||
      localIndex >= visible.length
    ) {
      crossX.style.display = "none";
      crossY.style.display = "none";
      tooltip.style.display = "none";
      return;
    }

    const plotRect =
      plot.getBoundingClientRect();

    const chartRect =
      chart.getBoundingClientRect();

    const ratio =
      visible.length <= 1
        ? 0.5
        : localIndex /
          (visible.length - 1);

    const x =
      plotRect.left -
      chartRect.left +
      ratio *
      plotRect.width;

    const candle =
      state.candles[
        state.chartPointerIndex
      ];

    if (!candle) return;

    const visibleValues =
      visible.flatMap(
        item => [
          item.high,
          item.low
        ]
      );

    const min =
      Math.min(...visibleValues);

    const max =
      Math.max(...visibleValues);

    const span =
      max - min || 1;

    const yRatio =
      (max - candle.close) /
      span;

    const y =
      plotRect.top -
      chartRect.top +
      yRatio *
      plotRect.height;

    crossX.style.display = "block";
    crossY.style.display = "block";

    crossX.style.left =
      `${x}px`;

    crossY.style.top =
      `${y}px`;

    const tooltipWidth = 190;

    let tooltipLeft =
      x + 14;

    if (
      tooltipLeft + tooltipWidth >
      chart.clientWidth
    ) {
      tooltipLeft =
        x - tooltipWidth - 14;
    }

    tooltip.style.left =
      `${Math.max(
        6,
        tooltipLeft
      )}px`;

    tooltip.style.top =
      `${Math.max(
        6,
        y - 58
      )}px`;

    tooltip.innerHTML = `
      <div class="tooltip-time">${formatCandleDateTime(candle.ts)}</div>
      <div>O <b>${formatPrice(candle.open)}</b></div>
      <div>H <b>${formatPrice(candle.high)}</b></div>
      <div>L <b>${formatPrice(candle.low)}</b></div>
      <div>C <b>${formatPrice(candle.close)}</b></div>
      <div>V <b>${formatVolume(candle.volume)}</b></div>
    `;

    tooltip.style.display =
      "flex";
  }

  function formatCandleDateTime(ts) {
    if (!Number.isFinite(ts)) return "--";

    const ms =
      ts < 100000000000
        ? ts * 1000
        : ts;

    const date =
      new Date(ms);

    if (Number.isNaN(date.getTime())) {
      return "--";
    }

    return date.toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata"
      }
    );
  }

  function wireChartInteractions() {
    const plot = $("#v2-chart-plot");
    if (!plot || plot.dataset.v2Interactive === "1") {
      return;
    }

    plot.dataset.v2Interactive = "1";
    plot.style.touchAction = "none";

    ensureChartInteractionElements();

    plot.addEventListener(
      "pointermove",
      event => {
        if (state.chartDragging) {
          const dx =
            event.clientX -
            state.chartDragStartX;

          const width =
            plot.clientWidth || 1;

          const visible =
            state.chartVisibleCount;

          const candleDelta =
            Math.round(
              (-dx / width) *
              visible
            );

          const maxStart =
            Math.max(
              0,
              state.candles.length -
              visible
            );

          state.chartStart =
            Math.max(
              0,
              Math.min(
                maxStart,
                state.chartDragStartIndex +
                candleDelta
              )
            );

          state.chartPointerIndex =
            null;

          renderChart();
          return;
        }

        const hit =
          getCandleFromPointer(event);

        if (!hit) return;

        state.chartPointerIndex =
          hit.index;

        updateChartInteractionPosition(
          event
        );
      }
    );

    plot.addEventListener(
      "pointerleave",
      () => {
        if (!state.chartDragging) {
          state.chartPointerIndex = null;
          updateChartInteractionPosition();
        }
      }
    );

    plot.addEventListener(
      "pointerdown",
      event => {
        if (!state.candles.length) return;

        state.chartDragging = true;
        state.chartDragStartX =
          event.clientX;
        state.chartDragStartIndex =
          state.chartStart;

        plot.setPointerCapture?.(
          event.pointerId
        );
      }
    );

    plot.addEventListener(
      "pointerup",
      event => {
        state.chartDragging = false;

        try {
          plot.releasePointerCapture?.(
            event.pointerId
          );
        } catch {}

        updateChartInteractionPosition();
      }
    );

    plot.addEventListener(
      "pointercancel",
      () => {
        state.chartDragging = false;
      }
    );

    plot.addEventListener(
      "wheel",
      event => {
        if (!state.candles.length) return;

        event.preventDefault();

        const visible =
          getVisibleCandles();

        if (!visible.length) return;

        const rect =
          plot.getBoundingClientRect();

        const ratio =
          Math.max(
            0,
            Math.min(
              1,
              (event.clientX -
                rect.left) /
              (rect.width || 1)
            )
          );

        const anchor =
          state.chartStart +
          ratio *
          (visible.length - 1);

        const factor =
          event.deltaY < 0
            ? 0.82
            : 1.22;

        const newCount =
          Math.max(
            20,
            Math.min(
              state.candles.length,
              Math.round(
                state.chartVisibleCount *
                factor
              )
            )
          );

        const newStart =
          Math.round(
            anchor -
            ratio *
            (newCount - 1)
          );

        state.chartVisibleCount =
          newCount;

        state.chartStart =
          Math.max(
            0,
            Math.min(
              Math.max(
                0,
                state.candles.length -
                newCount
              ),
              newStart
            )
          );

        state.chartRange = "CUSTOM";

        $$(".range-controls button")
          .forEach(
            button =>
              button.classList.remove(
                "active"
              )
          );

        renderChart();
      },
      { passive: false }
    );

    plot.addEventListener(
      "dblclick",
      () => {
        applyRangeToViewport(
          "1D",
          true
        );

        $$(".range-controls button")
          .forEach(
            button =>
              button.classList.toggle(
                "active",
                button.textContent.trim() ===
                "1D"
              )
          );

        renderChart();
      }
    );
  }

  function wireRanges() {
    $$(".range-controls button")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            const range =
              button.textContent.trim();

            applyRangeToViewport(
              range,
              true
            );

            $$(".range-controls button")
              .forEach(
                item =>
                  item.classList.toggle(
                    "active",
                    item === button
                  )
              );

            state.chartPointerIndex =
              null;

            renderChart();
          }
        );
      });
  }


  function safeModal(title, message) {
    const existing =
      $(".v2-safe-modal");

    existing?.remove();

    const backdrop =
      document.createElement("div");

    backdrop.className =
      "v2-safe-modal";

    backdrop.style.cssText =
      "position:fixed;inset:0;z-index:9999;" +
      "background:rgba(0,0,0,.65);" +
      "display:grid;place-items:center;padding:20px";

    const box =
      document.createElement("div");

    box.style.cssText =
      "max-width:420px;width:100%;" +
      "background:#0a1320;border:1px solid #1d3047;" +
      "border-radius:10px;padding:20px;" +
      "color:#f5f7fb";

    box.innerHTML =
      `<h3>${title}</h3>` +
      `<p style="color:#8293aa">${message}</p>` +
      `<button type="button">Close</button>`;

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    $("button", box).onclick =
      () => backdrop.remove();

    backdrop.onclick =
      event => {
        if (event.target === backdrop) {
          backdrop.remove();
        }
      };
  }

  function wireButtons() {
    $(".settings")?.addEventListener(
      "click",
      () =>
        safeModal(
          "V2 Settings",
          "Presentation-only settings. No backend, Phase 11, strategy or broker state is changed here."
        )
    );

    $(".strategy .primary")
      ?.addEventListener(
        "click",
        () =>
          safeModal(
            "Paper Trade",
            "No order is created. V2 is currently a read-only presentation layer."
          )
      );

    const buttons =
      $$(".quick button");

    buttons[0]?.addEventListener(
      "click",
      () =>
        safeModal(
          "Backtest",
          "The V2 backtest control is not connected yet."
        )
    );

    buttons[1]?.addEventListener(
      "click",
      () =>
        safeModal(
          "Reports",
          "The V2 reports interface will be connected in a later step."
        )
    );

    buttons[2]?.addEventListener(
      "click",
      () =>
        safeModal(
          "Export",
          "Export is not connected yet."
        )
    );

    buttons[3]?.addEventListener(
      "click",
      () =>
        safeModal(
          "Settings",
          "Presentation-only settings."
        )
    );
  }

  function render() {
    updateIndexCards();
    updateTimestamp();

    if (state.candles.length) {
      mergeLiveQuoteIntoCurrentCandle();
    } else {
      updateCurrentPrice();
    }
  }

  function start() {
    if (state.started) return;

    state.started = true;

    addChartStyles();

    wireRanges();
    wireButtons();
    wireChartInteractions();

    render();

    console.info(
      "[TradeMind V2] ACTIVE — read-only /quotes 5s /candles 60s"
    );

    /*
     * Load real NIFTY 5-minute OHLCV candles first.
     * The chart never falls back to synthetic candles.
     */
    fetchCandles();

    fetchQuotes();

    window.setInterval(
      fetchQuotes,
      5000
    );

    window.setInterval(
      fetchCandles,
      60000
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }
})();

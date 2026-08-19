/*
===========================================================
 TradeMind Pro — V2 Dashboard
 STEP 4.8 — REAL CANDLES + REAL FRONTEND INDICATORS
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
    candles: []
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

    const values =
      state.candles.flatMap(
        candle => [
          candle.high,
          candle.low
        ]
      );

    if (!values.length) return;

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const span =
      max - min || 1;

    const bounded =
      Math.max(
        min,
        Math.min(max, current)
      );

    const pct =
      ((max - bounded) / span) * 100;

    line.style.top =
      `${Math.max(
        5,
        Math.min(95, pct)
      )}%`;

    if (price) {
      price.style.top =
        `${Math.max(
          5,
          Math.min(95, pct)
        )}%`;
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
       * Keep the chart readable. The backend can return up to
       * seven days of 5-minute candles; V2 displays the most
       * recent 78 candles (~one trading day plus a little context).
       */
      state.candles =
        candles.slice(-78);

      renderChart();

      console.info(
        "[TradeMind V2] Historical candles loaded",
        {
          returned: candles.length,
          displayed: state.candles.length,
          last: state.candles[state.candles.length - 1]
        }
      );

    } catch (error) {
      console.error(
        "[TradeMind V2] candle refresh failed:",
        error
      );

      /*
       * Do not replace real candles with synthetic candles.
       * If the historical endpoint fails, preserve the last
       * successfully loaded chart instead.
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

    plot.querySelector(
      ".v2-indicator-svg"
    )?.remove();

    plot.querySelector(
      ".v2-indicator-legend"
    )?.remove();

    const ema9 =
      calculateEMA(candles, 9);

    const ema21 =
      calculateEMA(candles, 21);

    const vwap =
      calculateVWAP(candles);

    const svg =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );

    svg.classList.add(
      "v2-indicator-svg"
    );

    svg.setAttribute(
      "viewBox",
      "0 0 100 100"
    );

    svg.setAttribute(
      "preserveAspectRatio",
      "none"
    );

    svg.innerHTML = `
      <path
        class="v2-indicator-line v2-ema9"
        d="${createIndicatorPath(
          ema9,
          min,
          max
        )}"
      />
      <path
        class="v2-indicator-line v2-ema21"
        d="${createIndicatorPath(
          ema21,
          min,
          max
        )}"
      />
      <path
        class="v2-indicator-line v2-vwap"
        d="${createIndicatorPath(
          vwap,
          min,
          max
        )}"
      />
    `;

    plot.appendChild(svg);

    const legend =
      document.createElement("div");

    legend.className =
      "v2-indicator-legend";

    const lastEMA9 =
      ema9[ema9.length - 1];

    const lastEMA21 =
      ema21[ema21.length - 1];

    const lastVWAP =
      vwap[vwap.length - 1];

    legend.innerHTML = `
      <div><span class="v2-dot ema9"></span>EMA 9 <b>${formatPrice(lastEMA9)}</b></div>
      <div><span class="v2-dot ema21"></span>EMA 21 <b>${formatPrice(lastEMA21)}</b></div>
      <div><span class="v2-dot vwap"></span>VWAP <b>${formatPrice(lastVWAP)}</b></div>
      <div><span class="v2-dot volume"></span>Volume <b>${formatVolume(candles[candles.length - 1].volume)}</b></div>
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

  function renderChart() {
    const chart =
      $(".chart");

    if (!chart) return;

    const plot =
      $("#v2-chart-plot");

    const volume =
      $("#v2-chart-volume");

    if (!plot || !volume) return;

    /*
     * Remove the old fake chart layer if it exists.
     * Keep the HTML axis, legend, overlay and tooltip.
     */
    $(".fake-candles", chart)?.remove();
    $$(".ema", chart).forEach(
      element => element.remove()
    );

    $$(".chart-indicator-legend", chart)
      .forEach(element => element.remove());

    plot.innerHTML = "";
    volume.innerHTML = "";

    const candles =
      state.candles;

    if (!candles.length) return;

    const lows =
      candles.map(
        candle => candle.low
      );

    const highs =
      candles.map(
        candle => candle.high
      );

    const min =
      Math.min(...lows);

    const max =
      Math.max(...highs);

    const span =
      max - min || 1;

    renderRealIndicators(
      candles,
      min,
      max
    );

    candles.forEach(
      (candle, index) => {
        const wrapper =
          document.createElement("div");

        const up =
          candle.close >=
          candle.open;

        wrapper.className =
          `v2-live-candle ${
            up ? "v2-up" : "v2-down"
          }`;

        const x =
          (index /
            candles.length) *
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
          `${Math.min(
            openPct,
            closePct
          ) - highPct}%`;

        body.style.height =
          `${Math.max(
            1,
            Math.abs(
              openPct -
              closePct
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

        bar.style.height =
          `${20 + candle.volume * 35}%`;

        volume.appendChild(
          bar
        );
      }
    );

    updateCurrentPrice();
  }

  function wireRanges() {
    $$(".range-controls button")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            $$(".range-controls button")
              .forEach(
                item =>
                  item.classList.remove(
                    "active"
                  )
              );

            button.classList.add(
              "active"
            );
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

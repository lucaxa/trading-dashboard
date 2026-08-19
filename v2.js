/*
===========================================================
 TradeMind Pro — V2 Dashboard
 STEP 4.2 — LIVE QUOTES + CHART RENDERING FIX
 ----------------------------------------------------------
 READ-ONLY PRESENTATION LAYER

 Uses:
   GET /api/quotes

 Does NOT:
   - modify Phase 11
   - modify api/quotes.js
   - modify strategy
   - modify learning
   - call Dhan
   - send broker orders
   - write evidence

 Quote refresh:
   every 5 seconds, with overlap protection
===========================================================
*/
(() => {
  "use strict";

  const state = {
    range: "1D",
    demoCandles: [],
    liveQuotes: { nifty: null, banknifty: null },
    previousQuotes: { nifty: null, banknifty: null },
    quoteRefreshInFlight: false,
    quoteRefreshStarted: false,
    lastQuoteUpdate: null
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function ensureStyles() {
    if ($("#v2-dynamic-chart-styles")) return;

    const style = document.createElement("style");
    style.id = "v2-dynamic-chart-styles";
    style.textContent = `
      .chart-placeholder {
        position:relative;
        overflow:hidden;
        min-height:360px;
        background:
          linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
          linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
        background-size:10% 20%;
      }

      #v2-chart-plot {
        position:absolute;
        inset:20px 52px 45px 42px;
        overflow:hidden;
      }

      #v2-chart-volume {
        position:absolute;
        left:42px;
        right:52px;
        bottom:10px;
        height:52px;
        display:flex;
        align-items:flex-end;
        gap:3px;
        overflow:hidden;
      }

      .chart-candle {
        position:absolute;
        width:9px;
        min-width:9px;
      }

      .candle-wick {
        position:absolute;
        left:3px;
        width:2px;
        background:#16e782;
        opacity:.95;
      }

      .candle-body {
        position:absolute;
        left:0;
        width:9px;
        min-height:3px;
        border-radius:1px;
      }

      .candle-up .candle-body {
        background:#16e782;
        border:1px solid #16e782;
      }

      .candle-down .candle-wick {
        background:#ff5964;
      }

      .candle-down .candle-body {
        background:#ff5964;
        border:1px solid #ff5964;
      }

      .volume-bar {
        flex:1 1 0;
        min-width:2px;
        max-width:10px;
        background:rgba(31,148,210,.35);
        border-radius:2px 2px 0 0;
      }

      #v2-current-line {
        position:absolute;
        left:42px;
        right:0;
        height:1px;
        border-top:1px dashed #16e782;
        opacity:.7;
        pointer-events:none;
      }

      #v2-current-price {
        position:absolute;
        right:0;
        transform:translateY(-50%);
        padding:6px 9px;
        background:#16e782;
        color:#04110a;
        font-weight:800;
        font-size:11px;
        border-radius:2px 0 0 2px;
        z-index:4;
      }

      .v2-chart-label {
        position:absolute;
        left:12px;
        top:10px;
        z-index:5;
        display:flex;
        flex-direction:column;
        gap:4px;
        font-size:10px;
        line-height:1.15;
        color:#8ca4ba;
        pointer-events:none;
      }

      .v2-chart-label b {
        color:#dce8f5;
      }

      .v2-chart-axis {
        position:absolute;
        right:5px;
        top:20px;
        bottom:45px;
        width:42px;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
        align-items:flex-end;
        color:#7890a6;
        font-size:9px;
        pointer-events:none;
      }

      .v2-chart-times {
        position:absolute;
        left:42px;
        right:52px;
        bottom:24px;
        display:flex;
        justify-content:space-between;
        color:#7890a6;
        font-size:9px;
        pointer-events:none;
      }

      .v2-chart-tooltip {
        position:absolute;
        z-index:10;
        display:none;
        min-width:145px;
        padding:8px 10px;
        background:#091421;
        border:1px solid #2b4964;
        border-radius:6px;
        box-shadow:0 8px 30px rgba(0,0,0,.45);
        color:#dce8f5;
        font-size:10px;
        pointer-events:none;
      }

      .v2-chart-tooltip b {
        color:#16e782;
      }

      .range-controls button {
        cursor:pointer;
      }

      .range-controls button.active {
        color:#16e782;
        border-color:#16e782;
      }
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    let el = $(".v2-toast");

    if (!el) {
      el = document.createElement("div");
      el.className = "v2-toast";
      el.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:9999;" +
        "background:#0d1c2c;border:1px solid #23415e;color:#dce8f5;" +
        "padding:10px 14px;border-radius:8px;font-size:12px;" +
        "opacity:0;transition:.2s;pointer-events:none";
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.style.opacity = "1";
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.opacity = "0";
    }, 2200);
  }

  function modal(title, message, badge = "V2 PROTOTYPE") {
    $(".v2-modal-backdrop")?.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "v2-modal-backdrop";
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10000;" +
      "display:flex;align-items:center;justify-content:center;padding:20px";

    const box = document.createElement("div");
    box.style.cssText =
      "max-width:430px;width:100%;background:#0a1522;" +
      "border:1px solid #29435f;border-radius:12px;padding:20px;" +
      "color:#dce8f5;box-shadow:0 20px 60px rgba(0,0,0,.5)";

    box.innerHTML =
      `<span style="font-size:10px;color:#16e782">${badge}</span>` +
      `<h3>${title}</h3>` +
      `<p>${message}</p>` +
      `<button type="button">Close</button>`;

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) backdrop.remove();
    });

    $("button", box).addEventListener("click", () => backdrop.remove());
  }

  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatPrice(value) {
    const n = numberOrNull(value);

    if (n === null) return "--";

    return n.toLocaleString("en-IN", {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    });
  }

  /*
   * Robustly walk the existing /api/quotes response.
   * We do not assume one exact nesting shape.
   */
  function collectObjects(value, output = []) {
    if (value === null || value === undefined) return output;

    if (Array.isArray(value)) {
      value.forEach(item => collectObjects(item, output));
      return output;
    }

    if (typeof value !== "object") return output;

    output.push(value);

    Object.values(value).forEach(child => {
      if (child && typeof child === "object") {
        collectObjects(child, output);
      }
    });

    return output;
  }

  function objectText(obj) {
    try {
      return JSON.stringify(obj).toLowerCase();
    } catch {
      return "";
    }
  }

  function extractPrice(obj) {
    if (typeof obj === "number") {
      return numberOrNull(obj);
    }

    if (!obj || typeof obj !== "object") {
      return null;
    }

    const fields = [
      "ltp",
      "last_price",
      "lastPrice",
      "lastTradedPrice",
      "last_traded_price",
      "price",
      "close",
      "lp",
      "currentPrice",
      "current_price",
      "marketPrice",
      "market_price",
      "last"
    ];

    for (const field of fields) {
      const value = numberOrNull(obj[field]);

      if (value !== null && value > 0) {
        return value;
      }
    }

    return null;
  }

  function findInstrumentObject(payload, instrument) {
    const objects = collectObjects(payload);

    const instrumentId =
      instrument === "nifty"
        ? "40000001"
        : "40000003";

    const matches = objects.filter(obj => {
      const text = objectText(obj);

      if (instrument === "nifty") {
        return (
          text.includes(instrumentId) ||
          (
            text.includes("nifty") &&
            !text.includes("banknifty")
          )
        );
      }

      return (
        text.includes(instrumentId) ||
        text.includes("banknifty")
      );
    });

    /*
     * Prefer an object that contains a recognizable price.
     */
    return (
      matches.find(obj => extractPrice(obj) !== null) ||
      matches[0] ||
      null
    );
  }

  function updateIndexCard(card, price, previous) {
    if (!card) return;

    const priceElement = card.querySelector("strong");

    if (priceElement) {
      priceElement.textContent = formatPrice(price);
    }

    const changeElement = card.querySelector("em");

    if (!changeElement) return;

    if (price === null) {
      changeElement.textContent = "Waiting for live data";
      changeElement.style.color = "";
      return;
    }

    if (previous !== null) {
      const difference = price - previous;
      const percentage =
        previous !== 0
          ? (difference / previous) * 100
          : 0;

      const sign = difference >= 0 ? "+" : "";

      changeElement.textContent =
        `${sign}${difference.toFixed(2)} (${sign}${percentage.toFixed(2)}%)`;

      changeElement.style.color =
        difference >= 0
          ? "#16e782"
          : "#ff5964";
    } else {
      changeElement.textContent =
        "LIVE • read-only quote";

      changeElement.style.color =
        "#16e782";
    }
  }

  function updateLiveDisplay() {
    const cards =
      $$(".index-strip .index-card, .market-strip .index-card");

    updateIndexCard(
      cards[0],
      state.liveQuotes.nifty,
      state.previousQuotes.nifty
    );

    updateIndexCard(
      cards[1],
      state.liveQuotes.banknifty,
      state.previousQuotes.banknifty
    );

    /*
     * The V2 chart's current-price label follows NIFTY.
     */
    if (state.liveQuotes.nifty !== null) {
      const chartPrice =
        $("#v2-current-price");

      if (chartPrice) {
        chartPrice.textContent =
          formatPrice(state.liveQuotes.nifty);
      }

      positionCurrentPrice(
        state.liveQuotes.nifty
      );
    }

    const now =
      state.lastQuoteUpdate;

    const timeText =
      now
        ? now.toLocaleTimeString(
            "en-IN",
            {
              hour12:false,
              timeZone:"Asia/Kolkata"
            }
          )
        : "--:--:--";

    const chartTime =
      $("#v2-chart-time");

    if (chartTime) {
      chartTime.textContent =
        `${timeText} IST`;
    }

    const status =
      $(".market-status strong");

    if (status) {
      status.textContent =
        timeText;
    }

    const statusSmall =
      $(".market-status small");

    if (statusSmall) {
      statusSmall.textContent =
        now
          ? "LIVE • INDstocks"
          : "Waiting for quote";
    }

    document.documentElement.dataset.v2LiveQuotes =
      (
        state.liveQuotes.nifty !== null ||
        state.liveQuotes.banknifty !== null
      )
        ? "connected"
        : "waiting";
  }

  async function refreshLiveQuotes() {
    if (state.quoteRefreshInFlight) return;

    state.quoteRefreshInFlight = true;

    try {
      /*
       * Existing backend route only.
       * Cache busting prevents an intermediary from serving
       * an older V2 response.
       */
      const response =
        await fetch(
          `/api/quotes?_v2=${Date.now()}`,
          {
            method:"GET",
            cache:"no-store",
            headers:{
              Accept:"application/json",
              "Cache-Control":
                "no-cache, no-store, max-age=0",
              Pragma:"no-cache"
            }
          }
        );

      const rawText =
        await response.text();

      let payload;

      try {
        payload =
          JSON.parse(rawText);
      } catch {
        throw new Error(
          `Invalid JSON from /api/quotes (HTTP ${response.status})`
        );
      }

      console.info(
        "[TradeMind V2] /api/quotes response",
        {
          status:response.status,
          payload
        }
      );

      if (!response.ok) {
        throw new Error(
          `Quote API HTTP ${response.status}`
        );
      }

      if (payload?.success === false) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Quote API returned success:false"
        );
      }

      const root =
        payload?.data ??
        payload;

      const niftyObject =
        findInstrumentObject(
          root,
          "nifty"
        );

      const bankObject =
        findInstrumentObject(
          root,
          "banknifty"
        );

      const niftyPrice =
        extractPrice(niftyObject);

      const bankPrice =
        extractPrice(bankObject);

      if (niftyPrice !== null) {
        state.previousQuotes.nifty =
          state.liveQuotes.nifty;

        state.liveQuotes.nifty =
          niftyPrice;
      }

      if (bankPrice !== null) {
        state.previousQuotes.banknifty =
          state.liveQuotes.banknifty;

        state.liveQuotes.banknifty =
          bankPrice;
      }

      if (
        niftyPrice !== null ||
        bankPrice !== null
      ) {
        state.lastQuoteUpdate =
          new Date();

        updateLiveDisplay();

        const footer =
          $("footer");

        if (footer) {
          footer.textContent =
            "V2 prototype — live quotes connected read-only. " +
            "Phase 11, backend, strategy, learning engine and broker controls remain untouched.";
        }
      }

      console.info(
        "[TradeMind V2] Parsed prices",
        {
          nifty:niftyPrice,
          banknifty:bankPrice,
          niftyObject,
          bankObject
        }
      );

    } catch (error) {
      console.error(
        "[TradeMind V2] Read-only quote refresh failed:",
        error
      );

      document.documentElement.dataset.v2LiveQuotes =
        "error";

    } finally {
      state.quoteRefreshInFlight =
        false;
    }
  }

  function startLiveQuoteRefresh() {
    if (state.quoteRefreshStarted) return;

    state.quoteRefreshStarted = true;

    /*
     * Immediate first request.
     */
    refreshLiveQuotes();

    /*
     * Existing project cadence: 5 seconds.
     */
    window.setInterval(
      refreshLiveQuotes,
      5000
    );

    console.info(
      "[TradeMind V2] LIVE QUOTES ACTIVE — read-only / 5s"
    );
  }

  function generateCandles(count = 54) {
    let price = 24242;
    const candles = [];

    for (let i = 0; i < count; i++) {
      const drift =
        1.9 +
        Math.sin(i / 7) * 1.7;

      const noise =
        Math.sin(i * 2.31) * 10 +
        Math.cos(i * 0.71) * 5;

      const open = price;

      const close =
        open +
        drift +
        noise * 0.55;

      const high =
        Math.max(open, close) +
        5 +
        Math.abs(
          Math.sin(i * 1.17)
        ) * 9;

      const low =
        Math.min(open, close) -
        5 -
        Math.abs(
          Math.cos(i * 0.83)
        ) * 8;

      const volume =
        0.35 +
        Math.abs(
          Math.sin(i * 0.61)
        ) * 0.95;

      candles.push({
        open,
        high,
        low,
        close,
        volume,
        time:
          `${String(
            9 +
            Math.floor(
              (i * 5 + 15) / 60
            )
          ).padStart(2,"0")}:${
            String(
              (15 + i * 5) % 60
            ).padStart(2,"0")
          }`
      });

      price = close;
    }

    return candles;
  }

  function positionCurrentPrice(value) {
    const line =
      $("#v2-current-line");

    const tag =
      $("#v2-current-price");

    if (!line || !tag) return;

    const candles =
      state.demoCandles;

    if (!candles.length) return;

    const lows =
      candles.map(c => c.low);

    const highs =
      candles.map(c => c.high);

    const min =
      Math.min(...lows);

    const max =
      Math.max(...highs);

    const span =
      max - min || 1;

    const bounded =
      Math.max(
        min,
        Math.min(max, Number(value))
      );

    const pct =
      ((max - bounded) / span) * 100;

    line.style.top =
      `calc(20px + ${pct}% * (100% - 65px) / 100)`;

    tag.style.top =
      line.style.top;
  }

  function renderChart() {
    const panel =
      $(".chart-placeholder");

    if (!panel) return;

    /*
     * IMPORTANT:
     * The original v2.html contains prototype chart text inside
     * .chart-placeholder. Clear that static content completely
     * before building the live V2 chart so labels/data cannot
     * appear as raw text on top of the canvas area.
     */
    panel.innerHTML = "";

    const plot =
      document.createElement("div");
    plot.id = "v2-chart-plot";

    const volume =
      document.createElement("div");
    volume.id = "v2-chart-volume";

    panel.appendChild(plot);
    panel.appendChild(volume);

    const candles =
      state.demoCandles;

    const lows =
      candles.map(c => c.low);

    const highs =
      candles.map(c => c.high);

    const min =
      Math.min(...lows);

    const max =
      Math.max(...highs);

    const span =
      max - min || 1;

    candles.forEach(
      (candle, index) => {
        const wrapper =
          document.createElement("div");

        wrapper.className =
          `chart-candle ${
            candle.close >= candle.open
              ? "candle-up"
              : "candle-down"
          }`;

        const x =
          ((index + 0.5) /
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
          `calc(${x}% - 4.5px)`;

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
          "candle-wick";

        wick.style.height =
          "100%";

        const body =
          document.createElement("div");

        body.className =
          "candle-body";

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

        wrapper.addEventListener(
          "mouseenter",
          event => {
            showTooltip(
              event,
              candle
            );
          }
        );

        wrapper.addEventListener(
          "mousemove",
          event => {
            moveTooltip(event);
          }
        );

        wrapper.addEventListener(
          "mouseleave",
          hideTooltip
        );

        plot.appendChild(
          wrapper
        );

        const bar =
          document.createElement("div");

        bar.className =
          "volume-bar";

        bar.style.height =
          `${15 + candle.volume * 65}%`;

        volume.appendChild(
          bar
        );
      }
    );

    renderChartOverlay(
      min,
      max
    );

    const demoCurrent =
      state.demoCandles.at(-1)?.close;

    positionCurrentPrice(
      state.liveQuotes.nifty ??
      demoCurrent
    );
  }

  function renderChartOverlay(min, max) {
    const panel =
      $(".chart-placeholder");

    if (!panel) return;

    panel.querySelectorAll(
      ".v2-chart-label,.v2-chart-axis,.v2-chart-times,#v2-current-line,#v2-current-price,.v2-chart-tooltip"
    ).forEach(
      element => element.remove()
    );

    const label =
      document.createElement("div");

    label.className =
      "v2-chart-label";

    label.innerHTML = `
      <span>EMA 9&nbsp; <b>24,349.80</b></span>
      <span>EMA 21&nbsp; <b>24,335.10</b></span>
      <span>VWAP&nbsp; <b>24,312.65</b></span>
      <span>Volume&nbsp; <b>1.25M</b></span>
    `;

    panel.appendChild(label);

    const axis =
      document.createElement("div");

    axis.className =
      "v2-chart-axis";

    const steps = 5;

    for (let i = 0; i < steps; i++) {
      const value =
        max -
        ((max - min) *
          i /
          (steps - 1));

      const span =
        document.createElement("span");

      span.textContent =
        value.toLocaleString(
          "en-IN",
          {
            maximumFractionDigits:0
          }
        );

      axis.appendChild(span);
    }

    panel.appendChild(axis);

    const times =
      document.createElement("div");

    times.className =
      "v2-chart-times";

    const labels = [
      "09:15",
      "10:00",
      "10:45",
      "11:30",
      "12:15",
      "13:00",
      "13:45",
      "14:30",
      "15:15"
    ];

    labels.forEach(text => {
      const span =
        document.createElement("span");

      span.textContent =
        text;

      times.appendChild(
        span
      );
    });

    panel.appendChild(times);

    const line =
      document.createElement("div");

    line.id =
      "v2-current-line";

    panel.appendChild(line);

    const price =
      document.createElement("div");

    price.id =
      "v2-current-price";

    price.textContent =
      formatPrice(
        state.liveQuotes.nifty ??
        state.demoCandles.at(-1)?.close
      );

    panel.appendChild(price);

    const tooltip =
      document.createElement("div");

    tooltip.className =
      "v2-chart-tooltip";

    panel.appendChild(
      tooltip
    );
  }

  function showTooltip(event, candle) {
    const tooltip =
      $(".v2-chart-tooltip");

    if (!tooltip) return;

    tooltip.innerHTML = `
      <b>${candle.time}</b><br>
      O ${candle.open.toFixed(2)}
      &nbsp; H ${candle.high.toFixed(2)}<br>
      L ${candle.low.toFixed(2)}
      &nbsp; C ${candle.close.toFixed(2)}<br>
      V ${candle.volume.toFixed(2)}M
    `;

    tooltip.style.display =
      "block";

    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tooltip =
      $(".v2-chart-tooltip");

    const panel =
      $(".chart-placeholder");

    if (!tooltip || !panel) return;

    const rect =
      panel.getBoundingClientRect();

    let left =
      event.clientX -
      rect.left +
      14;

    let top =
      event.clientY -
      rect.top -
      25;

    const maxLeft =
      rect.width -
      tooltip.offsetWidth -
      8;

    const maxTop =
      rect.height -
      tooltip.offsetHeight -
      8;

    left =
      Math.max(
        8,
        Math.min(
          left,
          maxLeft
        )
      );

    top =
      Math.max(
        8,
        Math.min(
          top,
          maxTop
        )
      );

    tooltip.style.left =
      `${left}px`;

    tooltip.style.top =
      `${top}px`;
  }

  function hideTooltip() {
    const tooltip =
      $(".v2-chart-tooltip");

    if (tooltip) {
      tooltip.style.display =
        "none";
    }
  }

  function wireRanges() {
    $$(".range-controls button").forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            $$(".range-controls button")
              .forEach(
                b =>
                  b.classList.remove(
                    "active"
                  )
              );

            button.classList.add(
              "active"
            );

            state.range =
              button.dataset.range;

            toast(
              `Chart range: ${state.range} — visual prototype`
            );
          }
        );
      }
    );
  }

  function wireNavigation() {
    $$(".sidebar nav a").forEach(
      link => {
        link.addEventListener(
          "click",
          event => {
            event.preventDefault();

            $$(".sidebar nav a")
              .forEach(
                a =>
                  a.classList.remove(
                    "active"
                  )
              );

            link.classList.add(
              "active"
            );

            const label =
              $("span", link)
                ?.textContent
                ?.trim() ||
              "Dashboard";

            const targets = {
              Dashboard:".overview",
              Market:".overview",
              Chart:".chart-panel",
              Strategy:".strategy",
              Backtest:".backtest",
              Trades:".signals",
              Learning:".evidence",
              Insights:".health",
              Reports:".quick"
            };

            if (
              label ===
              "Settings"
            ) {
              modal(
                "V2 Settings",
                "Presentation-only settings. Phase 11, backend, strategy, learning engine and broker controls cannot be changed here.",
                "READ-ONLY"
              );
              return;
            }

            $(targets[label])
              ?.scrollIntoView({
                behavior:"smooth",
                block:"start"
              });

            toast(
              `${label} view selected`
            );
          }
        );
      }
    );
  }

  function wireButtons() {
    $(".settings")?.addEventListener(
      "click",
      () =>
        modal(
          "V2 Settings",
          "Presentation-only settings. Backend and Phase 11 remain untouched.",
          "READ-ONLY"
        )
    );

    $(".strategy .primary")
      ?.addEventListener(
        "click",
        () =>
          modal(
            "Paper Trade — Prototype",
            "No order is created. V2 is not connected to a broker, Dhan, or the trading engine.",
            "SAFE / NO REAL ORDER"
          )
      );

    const quick =
      $$(".quick button");

    quick[0]?.addEventListener(
      "click",
      () =>
        modal(
          "Backtest",
          "The V2 backtest control is not connected yet.",
          "NOT CONNECTED"
        )
    );

    quick[1]?.addEventListener(
      "click",
      () =>
        modal(
          "Reports",
          "The V2 report interface will be built in a later step.",
          "V2 PREVIEW"
        )
    );

    quick[2]?.addEventListener(
      "click",
      () =>
        toast(
          "Export is presentation-only in V2"
        )
    );

    quick[3]?.addEventListener(
      "click",
      () =>
        modal(
          "V2 Settings",
          "Presentation-only settings. No backend or Phase 11 changes.",
          "READ-ONLY"
        )
    );
  }

  function init() {
    ensureStyles();

    state.demoCandles =
      generateCandles();

    renderChart();
    wireRanges();
    wireNavigation();
    wireButtons();

    document.documentElement.dataset.trademindV2 =
      "step4-2-read-only-live-quotes";

    startLiveQuoteRefresh();

    console.info(
      "TradeMind Pro V2 Step 4.2 initialized — chart rendering restored; live quotes remain read-only."
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();

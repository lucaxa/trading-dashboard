/*
===========================================================
 TradeMind Pro — V2
 STEP 4.1 — READ-ONLY LIVE QUOTE CONNECTION FIX
 ----------------------------------------------------------
 - Uses ONLY existing GET /api/quotes
 - No POST / PUT / DELETE
 - No Phase 11 writes
 - No strategy changes
 - No broker / Dhan calls
 - No learning-engine changes
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
    el._timer = setTimeout(() => el.style.opacity = "0", 2200);
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
      "max-width:430px;width:100%;background:#0a1522;border:1px solid #29435f;" +
      "border-radius:12px;padding:20px;color:#dce8f5;box-shadow:0 20px 60px rgba(0,0,0,.5)";
    box.innerHTML =
      `<span style="font-size:10px;color:#16e782">${badge}</span>` +
      `<h3>${title}</h3><p>${message}</p><button type="button">Close</button>`;
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
    return n === null ? "--" : n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /* =======================================================
     LIVE QUOTE PARSER
     Handles arrays, objects, and deeply nested INDstocks data.
     This fixes the previous V2 parser's one-level limitation.
  ======================================================= */

  function collectObjects(value, output = []) {
    if (!value || typeof value !== "object") return output;
    if (Array.isArray(value)) {
      value.forEach(item => collectObjects(item, output));
      return output;
    }
    output.push(value);
    Object.values(value).forEach(child => {
      if (child && typeof child === "object") collectObjects(child, output);
    });
    return output;
  }

  function objectText(obj) {
    try { return JSON.stringify(obj).toLowerCase(); }
    catch { return ""; }
  }

  function extractPrice(obj) {
    if (typeof obj === "number") return numberOrNull(obj);
    if (!obj || typeof obj !== "object") return null;

    const fields = [
      "ltp","LTP","last_price","lastPrice","lastTradedPrice",
      "last_traded_price","price","close","lp","currentPrice",
      "current_price","marketPrice","market_price","last"
    ];

    for (const field of fields) {
      const n = numberOrNull(obj[field]);
      if (n !== null && n > 0) return n;
    }
    return null;
  }

  function findInstrumentObject(payload, instrument) {
    const objects = collectObjects(payload);
    const id = instrument === "nifty" ? "40000001" : "40000003";

    const matches = objects.filter(obj => {
      const text = objectText(obj);
      if (instrument === "nifty") {
        return text.includes(id) ||
          (text.includes("nifty") && !text.includes("banknifty"));
      }
      return text.includes(id) || text.includes("banknifty");
    });

    return matches.find(obj => extractPrice(obj) !== null) || matches[0] || null;
  }

  function updateIndexCard(card, price, previous) {
    if (!card) return;

    const priceElement = card.querySelector("strong");
    if (priceElement) priceElement.textContent = formatPrice(price);

    const changeElement = card.querySelector("em");
    if (!changeElement) return;

    if (price === null) {
      changeElement.textContent = "Waiting for live data";
      changeElement.style.color = "";
      return;
    }

    if (previous !== null) {
      const diff = price - previous;
      const pct = previous !== 0 ? (diff / previous) * 100 : 0;
      const sign = diff >= 0 ? "+" : "";
      changeElement.textContent =
        `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
      changeElement.style.color = diff >= 0 ? "#16e782" : "#ff5964";
    } else {
      changeElement.textContent = "LIVE • read-only quote";
      changeElement.style.color = "#16e782";
    }
  }

  function updateLiveDisplay() {
    const cards = $$(".market-strip .index-card");

    updateIndexCard(cards[0], state.liveQuotes.nifty, state.previousQuotes.nifty);
    updateIndexCard(cards[1], state.liveQuotes.banknifty, state.previousQuotes.banknifty);

    if (state.liveQuotes.nifty !== null) {
      const chartPrice = $("#v2-current-price");
      if (chartPrice) chartPrice.textContent = formatPrice(state.liveQuotes.nifty);
    }

    const now = state.lastQuoteUpdate;
    const timeText = now
      ? now.toLocaleTimeString("en-IN", {hour12:false, timeZone:"Asia/Kolkata"})
      : "--:--:--";

    const chartTime = $("#v2-chart-time");
    if (chartTime) chartTime.textContent = `${timeText} IST`;

    const status = $(".market-status strong");
    if (status) status.textContent = timeText;

    const statusSmall = $(".market-status small");
    if (statusSmall) statusSmall.textContent = now ? "LIVE • INDstocks" : "Waiting for quote";

    document.documentElement.dataset.v2LiveQuotes =
      state.liveQuotes.nifty !== null || state.liveQuotes.banknifty !== null
        ? "connected" : "waiting";
  }

  async function refreshLiveQuotes() {
    if (state.quoteRefreshInFlight) return;
    state.quoteRefreshInFlight = true;

    try {
      const response = await fetch(`/api/quotes?_v2=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Cache-Control": "no-cache, no-store, max-age=0",
          "Pragma": "no-cache"
        }
      });

      const text = await response.text();
      let payload;

      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON from /api/quotes (HTTP ${response.status})`);
      }

      console.info("[TradeMind V2] /api/quotes", {
        status: response.status,
        payload
      });

      if (!response.ok) throw new Error(`Quote API HTTP ${response.status}`);

      if (payload?.success === false) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Quote API returned success:false"
        );
      }

      const root = payload?.data ?? payload;
      const niftyObj = findInstrumentObject(root, "nifty");
      const bankObj = findInstrumentObject(root, "banknifty");

      const niftyPrice = extractPrice(niftyObj);
      const bankPrice = extractPrice(bankObj);

      if (niftyPrice !== null) {
        state.previousQuotes.nifty = state.liveQuotes.nifty;
        state.liveQuotes.nifty = niftyPrice;
      }

      if (bankPrice !== null) {
        state.previousQuotes.banknifty = state.liveQuotes.banknifty;
        state.liveQuotes.banknifty = bankPrice;
      }

      if (niftyPrice !== null || bankPrice !== null) {
        state.lastQuoteUpdate = new Date();
        updateLiveDisplay();

        const footer = $("footer");
        if (footer) {
          footer.textContent =
            "V2 prototype — live quotes connected read-only. " +
            "Phase 11, backend, strategy, learning engine and broker controls remain untouched.";
        }
      }

      console.info("[TradeMind V2] Parsed prices", {
        nifty: niftyPrice,
        banknifty: bankPrice
      });

    } catch (error) {
      console.error("[TradeMind V2] Read-only quote refresh failed:", error);
      document.documentElement.dataset.v2LiveQuotes = "error";
    } finally {
      state.quoteRefreshInFlight = false;
    }
  }

  function startLiveQuoteRefresh() {
    if (state.quoteRefreshStarted) return;
    state.quoteRefreshStarted = true;

    refreshLiveQuotes();
    window.setInterval(refreshLiveQuotes, 5000);

    console.info("[TradeMind V2] LIVE QUOTES ACTIVE — read-only / 5s");
  }

  /* =======================================================
     VISUAL CHART — DEMO DATA ONLY
  ======================================================= */

  function generateCandles(count = 54) {
    let price = 24242;
    const candles = [];

    for (let i = 0; i < count; i++) {
      const drift = 1.9 + Math.sin(i / 7) * 1.7;
      const noise = Math.sin(i * 2.31) * 10 + Math.cos(i * 0.71) * 5;
      const open = price;
      const close = open + drift + noise * 0.55;
      const high = Math.max(open, close) + 5 + Math.abs(Math.sin(i * 1.17)) * 9;
      const low = Math.min(open, close) - 5 - Math.abs(Math.cos(i * 0.83)) * 8;
      const volume = 0.35 + Math.abs(Math.sin(i * 0.61)) * 0.95;

      candles.push({
        open, high, low, close, volume,
        time:`${String(9 + Math.floor((i*5+15)/60)).padStart(2,"0")}:${String((15+i*5)%60).padStart(2,"0")}`
      });

      price = close;
    }

    return candles;
  }

  function renderChart() {
    const plot = $("#v2-chart-plot");
    const volume = $("#v2-chart-volume");
    if (!plot || !volume) return;

    plot.innerHTML = "";
    volume.innerHTML = "";

    const candles = state.demoCandles;
    const lows = candles.map(c => c.low);
    const highs = candles.map(c => c.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = max - min || 1;

    candles.forEach((candle, index) => {
      const wrapper = document.createElement("div");
      wrapper.className =
        `chart-candle ${candle.close >= candle.open ? "candle-up" : "candle-down"}`;

      const x = ((index + 0.5) / candles.length) * 100;
      const highPct = ((max - candle.high) / span) * 100;
      const lowPct = ((max - candle.low) / span) * 100;
      const openPct = ((max - candle.open) / span) * 100;
      const closePct = ((max - candle.close) / span) * 100;

      wrapper.style.left = `calc(${x}% - 4.5px)`;
      wrapper.style.top = `${highPct}%`;
      wrapper.style.height = `${Math.max(1, lowPct-highPct)}%`;

      const wick = document.createElement("div");
      wick.className = "candle-wick";
      wick.style.height = "100%";

      const body = document.createElement("div");
      body.className = "candle-body";
      body.style.top = `${Math.min(openPct,closePct)-highPct}%`;
      body.style.height = `${Math.max(1,Math.abs(openPct-closePct))}%`;

      wrapper.append(wick, body);
      plot.appendChild(wrapper);

      const bar = document.createElement("div");
      bar.className = "volume-bar";
      bar.style.height = `${15 + candle.volume * 65}%`;
      volume.appendChild(bar);
    });
  }

  function wireRanges() {
    $$(".range-controls button").forEach(button => {
      button.addEventListener("click", () => {
        $$(".range-controls button").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        state.range = button.dataset.range;
        toast(`Chart range: ${state.range} — visual prototype`);
      });
    });
  }

  function wireNavigation() {
    $$(".sidebar nav a").forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();

        $$(".sidebar nav a").forEach(a => a.classList.remove("active"));
        link.classList.add("active");

        const label = $("span", link)?.textContent?.trim() || "Dashboard";

        const targets = {
          Dashboard: ".overview",
          Market: ".overview",
          Chart: ".chart-panel",
          Strategy: ".strategy",
          Backtest: ".backtest",
          Trades: ".signals",
          Learning: ".evidence",
          Insights: ".health",
          Reports: ".quick"
        };

        if (label === "Settings") {
          modal(
            "V2 Settings",
            "Presentation-only settings. Phase 11, backend, strategy, learning engine and broker controls cannot be changed here.",
            "READ-ONLY"
          );
          return;
        }

        $(targets[label])?.scrollIntoView({
          behavior:"smooth",
          block:"start"
        });

        toast(`${label} view selected`);
      });
    });
  }

  function wireButtons() {
    $(".settings")?.addEventListener("click", () =>
      modal(
        "V2 Settings",
        "Presentation-only settings. Backend and Phase 11 remain untouched.",
        "READ-ONLY"
      )
    );

    $(".strategy .primary")?.addEventListener("click", () =>
      modal(
        "Paper Trade — Prototype",
        "No order is created. V2 is not connected to a broker, Dhan, or the trading engine.",
        "SAFE / NO REAL ORDER"
      )
    );

    const quick = $$(".quick button");

    quick[0]?.addEventListener("click", () =>
      modal("Backtest", "The V2 backtest control is not connected yet.", "NOT CONNECTED")
    );

    quick[1]?.addEventListener("click", () =>
      modal("Reports", "The V2 report interface will be built in a later step.", "V2 PREVIEW")
    );

    quick[2]?.addEventListener("click", () =>
      toast("Export is presentation-only in V2")
    );

    quick[3]?.addEventListener("click", () =>
      modal(
        "V2 Settings",
        "Presentation-only settings. No backend or Phase 11 changes.",
        "READ-ONLY"
      )
    );
  }

  function init() {
    state.demoCandles = generateCandles();
    renderChart();
    wireRanges();
    wireNavigation();
    wireButtons();

    document.documentElement.dataset.trademindV2 =
      "step4-1-read-only-live-quotes";

    startLiveQuoteRefresh();

    console.info(
      "TradeMind Pro V2 Step 4.1 initialized — read-only live quotes only."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

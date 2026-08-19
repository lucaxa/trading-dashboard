/*
===========================================================
 TradeMind Pro — V2
 Step 3 — Chart UI Module
 ----------------------------------------------------------
 VISUAL / DEMO DATA ONLY
 - No API calls
 - No backend calls
 - No Phase 11 changes
 - No strategy changes
 - No broker/Dhan calls
===========================================================
*/

(() => {
  "use strict";

  const state = {
    activeSection: "Dashboard",
    indicatorsVisible: true,
    range: "1D",
    demoCandles: [],
    crosshairVisible: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function ensureStyles() {
    if ($("#v2-step3-chart-styles")) return;

    const style = document.createElement("style");
    style.id = "v2-step3-chart-styles";
    style.textContent = `
      .chart{min-height:320px}
      .chart-plot{position:absolute;left:54px;right:58px;top:15px;bottom:62px;overflow:hidden}
      .chart-candle{position:absolute;bottom:0;width:9px}
      .candle-wick{position:absolute;left:50%;transform:translateX(-50%);width:1px;background:#9eb0c5}
      .candle-body{position:absolute;left:0;width:100%;border-radius:1px}
      .candle-up .candle-body{background:#16d77b}
      .candle-down .candle-body{background:#ff4f5e}
      .candle-up .candle-wick{background:#5be8a2}
      .candle-down .candle-wick{background:#ff8c96}

      .chart-axis-y{
        position:absolute;right:7px;top:14px;bottom:61px;
        display:flex;flex-direction:column;justify-content:space-between;
        color:#6f8198;font-size:8px;z-index:3
      }
      .chart-axis-x{
        position:absolute;left:54px;right:58px;bottom:8px;
        display:flex;justify-content:space-between;
        color:#6f8198;font-size:7px;z-index:3
      }
      .chart-overlay{position:absolute;inset:0;pointer-events:none;z-index:5}
      .current-price-line{
        position:absolute;left:54px;right:0;top:34%;
        border-top:1px dashed #16e782;opacity:.55
      }
      .chart-price{z-index:7;top:calc(34% - 10px)}
      .chart-indicator-legend{
        position:absolute;left:10px;top:9px;
        display:flex;flex-direction:column;gap:4px;
        font-size:8px;z-index:6
      }
      .chart-indicator-legend b{color:#d5deea;font-weight:700}
      .legend-ema9{color:#159fff}.legend-ema21{color:#ff9417}.legend-vwap{color:#9b6aff}

      .chart-volume{
        position:absolute;left:54px;right:58px;bottom:27px;height:34px;
        display:flex;align-items:flex-end;gap:2px;z-index:2;
        opacity:.45
      }
      .volume-bar{flex:1;min-width:1px;background:#37617f;border-radius:1px 1px 0 0}

      .chart-crosshair{display:none;position:absolute;inset:0;z-index:10;pointer-events:none}
      .chart-crosshair.visible{display:block}
      .crosshair-v{position:absolute;top:12px;bottom:49px;border-left:1px dashed #6f8198}
      .crosshair-h{position:absolute;left:54px;right:0;border-top:1px dashed #6f8198}
      .crosshair-price,.crosshair-time{
        position:absolute;background:#182a3d;border:1px solid #29435f;
        color:#d8e2ed;padding:4px 6px;border-radius:3px;font-size:7px
      }
      .crosshair-price{right:2px}
      .crosshair-time{bottom:50px;transform:translateX(-50%)}

      .chart-tooltip{
        display:none;position:absolute;z-index:20;top:12px;left:70px;
        width:125px;padding:8px;background:#0a1522;border:1px solid #29435f;
        border-radius:6px;box-shadow:0 8px 25px rgba(0,0,0,.35);
        font-size:8px;color:#9badc1
      }
      .chart-tooltip.visible{display:flex;flex-direction:column;gap:3px}
      .chart-tooltip b{color:#fff;font-size:9px;margin-bottom:2px}

      .range-controls{display:flex;gap:3px;flex-wrap:wrap}
      .range-controls button{
        border:0;background:transparent;color:#71839a;
        padding:3px 5px;border-radius:4px;font-size:7px;cursor:pointer
      }
      .range-controls button:hover,.range-controls button.active{
        background:#10263d;color:#45a9ff
      }
      .chart-meta{display:flex;gap:10px;color:#71839a;font-size:7px}

      @media(max-width:760px){
        .chart{height:280px}
        .chart-plot{left:42px;right:47px}
        .chart-axis-y{right:5px;font-size:7px}
        .chart-axis-x{left:42px;right:47px}
        .chart-volume{left:42px;right:47px}
        .crosshair-h{left:42px}
        .current-price-line{left:42px}
        .chart-footer{align-items:flex-start}
      }
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    let el = $(".v2-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "v2-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function modal(title, message, badge = "V2 PROTOTYPE") {
    $(".v2-modal-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "v2-modal-backdrop";
    const box = document.createElement("div");
    box.className = "v2-modal";
    box.innerHTML = `
      <span class="safe-badge">${badge}</span>
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="v2-modal-actions"><button type="button">Close</button></div>
    `;
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) backdrop.remove();
    });
    $("button", box).addEventListener("click", () => backdrop.remove());
  }

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

      candles.push({open, high, low, close, volume, time:`${String(9 + Math.floor((i*5+15)/60)).padStart(2,"0")}:${String((15+i*5)%60).padStart(2,"0")}`});
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

    candles.forEach((candle) => {
      const wrapper = document.createElement("div");
      wrapper.className = `chart-candle ${candle.close >= candle.open ? "candle-up" : "candle-down"}`;

      const x = ((candles.indexOf(candle) + 0.5) / candles.length) * 100;
      const highPct = ((max - candle.high) / span) * 100;
      const lowPct = ((max - candle.low) / span) * 100;
      const openPct = ((max - candle.open) / span) * 100;
      const closePct = ((max - candle.close) / span) * 100;

      wrapper.style.left = `calc(${x}% - 4.5px)`;
      wrapper.style.top = `${highPct}%`;
      wrapper.style.height = `${Math.max(1, lowPct-highPct)}%`;

      const wick = document.createElement("div");
      wick.className = "candle-wick";
      wick.style.top = "0";
      wick.style.height = "100%";

      const body = document.createElement("div");
      body.className = "candle-body";
      body.style.top = `${Math.min(openPct,closePct)-highPct}%`;
      body.style.height = `${Math.max(1,Math.abs(openPct-closePct))}%`;

      wrapper.appendChild(wick);
      wrapper.appendChild(body);
      wrapper.dataset.time = candle.time;
      wrapper.dataset.open = candle.open.toFixed(2);
      wrapper.dataset.high = candle.high.toFixed(2);
      wrapper.dataset.low = candle.low.toFixed(2);
      wrapper.dataset.close = candle.close.toFixed(2);
      wrapper.dataset.volume = `${candle.volume.toFixed(2)}M`;

      plot.appendChild(wrapper);

      const bar = document.createElement("div");
      bar.className = "volume-bar";
      bar.style.height = `${15 + candle.volume * 65}%`;
      volume.appendChild(bar);
    });

    const last = candles[candles.length - 1];
    if (last) {
      $("#v2-current-price").textContent = last.close.toFixed(2);
      $(".crosshair-price")?.replaceChildren(document.createTextNode(last.close.toFixed(0)));
      $(".crosshair-time")?.replaceChildren(document.createTextNode(last.time));
    }

    wireCandleHover();
  }

  function wireCandleHover() {
    const plot = $("#v2-chart-plot");
    const tooltip = $("#v2-chart-tooltip");
    const crosshair = $("#v2-crosshair");
    if (!plot || !tooltip || !crosshair) return;

    $$(".chart-candle", plot).forEach((candle) => {
      candle.addEventListener("mouseenter", () => {
        tooltip.classList.add("visible");
        crosshair.classList.add("visible");

        const plotRect = plot.getBoundingClientRect();
        const rect = candle.getBoundingClientRect();
        const x = rect.left + rect.width / 2 - plotRect.left;
        const y = rect.top + rect.height / 2 - plotRect.top;

        const v = $(".crosshair-v", crosshair);
        const h = $(".crosshair-h", crosshair);
        const p = $(".crosshair-price", crosshair);
        const t = $(".crosshair-time", crosshair);

        v.style.left = `${x + 54}px`;
        h.style.top = `${y + 15}px`;
        p.textContent = candle.dataset.close;
        t.textContent = candle.dataset.time;

        tooltip.innerHTML = `
          <b>${candle.dataset.time}</b>
          <span>O ${candle.dataset.open}</span>
          <span>H ${candle.dataset.high}</span>
          <span>L ${candle.dataset.low}</span>
          <span>C ${candle.dataset.close}</span>
          <span>V ${candle.dataset.volume}</span>
        `;
      });

      candle.addEventListener("mouseleave", () => {
        tooltip.classList.remove("visible");
        crosshair.classList.remove("visible");
      });
    });
  }

  function wireRanges() {
    $$(".range-controls button").forEach((button) => {
      button.addEventListener("click", () => {
        $$(".range-controls button").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        state.range = button.dataset.range;
        toast(`Chart range: ${state.range} — demo data only`);
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
          Dashboard: ".overview", Market: ".overview", Chart: ".chart-panel",
          Strategy: ".strategy", Backtest: ".backtest", Trades: ".signals",
          Learning: ".evidence", Insights: ".health", Reports: ".quick", Settings: ".settings"
        };

        if (label === "Settings") {
          modal("V2 Settings","This screen is presentation-only. No Phase 11, backend, strategy, learning-engine, broker, or Dhan setting can be changed here.","READ-ONLY");
          return;
        }

        const target = $(targets[label]);
        target?.scrollIntoView({behavior:"smooth",block:"start"});
        toast(`${label} view selected — V2 prototype`);
      });
    });
  }

  function wireButtons() {
    $(".settings")?.addEventListener("click", () => modal("V2 Settings","Presentation-only settings. Backend and Phase 11 remain untouched.","READ-ONLY"));

    $(".strategy .primary")?.addEventListener("click", () => modal(
      "Paper Trade — Prototype",
      "No order is created. V2 is not connected to a broker, Dhan, or the trading engine.",
      "SAFE / NO REAL ORDER"
    ));

    const quick = $$(".quick button");
    quick[0]?.addEventListener("click", () => modal("Backtest","The V2 backtest control is not connected yet. It only demonstrates the future UI.","NOT CONNECTED"));
    quick[1]?.addEventListener("click", () => modal("Reports","The V2 report interface will be built in a later step.","V2 PREVIEW"));
    quick[2]?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify({interface:"TradeMind Pro V2",mode:"PRESENTATION_ONLY",chart:"DEMO_DATA",phase11Modified:false,backendConnected:false,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url;a.download="trademind-v2-chart-ui-state.json";a.click();
      URL.revokeObjectURL(url);
      toast("V2 UI state exported");
    });
    quick[3]?.addEventListener("click", () => modal("V2 Settings","Presentation-only settings. No backend or Phase 11 changes.","READ-ONLY"));

    $(".backtest a")?.addEventListener("click", e => {e.preventDefault();quick[0]?.click()});
  }

  function init() {
    ensureStyles();
    state.demoCandles = generateCandles();
    renderChart();
    wireRanges();
    wireNavigation();
    wireButtons();
    document.documentElement.dataset.trademindV2 = "step3-chart-demo";
    console.info("TradeMind Pro V2 Step 3: chart UI active. Demo data only; no API/backend/broker connection.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init);
  else init();
})();

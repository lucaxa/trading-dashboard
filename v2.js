/*
===========================================================
 TradeMind Pro — V2
 Step 2.5 — V2-ONLY Interaction Layer
 ----------------------------------------------------------
 PURPOSE
 - Make the V2 presentation controls interactive.
 - NO backend connection.
 - NO Phase 11 modification.
 - NO strategy modification.
 - NO broker/Dhan calls.
 - NO learning-engine calls.
===========================================================
*/

(() => {
  "use strict";

  const state = {
    activeSection: "Dashboard",
    indicatorsVisible: true,
    lastAction: "V2 ready"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function ensureStyles() {
    if ($("#v2-interaction-styles")) return;

    const style = document.createElement("style");
    style.id = "v2-interaction-styles";
    style.textContent = `
      .v2-toast{
        position:fixed;
        left:50%;
        bottom:22px;
        transform:translateX(-50%) translateY(20px);
        z-index:9999;
        max-width:min(92vw,520px);
        padding:11px 16px;
        border:1px solid #24415e;
        border-radius:9px;
        background:#0b1726;
        color:#f5f7fb;
        box-shadow:0 12px 35px rgba(0,0,0,.45);
        font-size:12px;
        opacity:0;
        pointer-events:none;
        transition:opacity .18s ease, transform .18s ease;
        text-align:center;
      }
      .v2-toast.show{
        opacity:1;
        transform:translateX(-50%) translateY(0);
      }
      .v2-modal-backdrop{
        position:fixed;
        inset:0;
        z-index:9998;
        display:grid;
        place-items:center;
        padding:20px;
        background:rgba(0,0,0,.68);
      }
      .v2-modal{
        width:min(92vw,440px);
        background:#0a1320;
        border:1px solid #24415e;
        border-radius:12px;
        padding:20px;
        box-shadow:0 20px 60px rgba(0,0,0,.55);
      }
      .v2-modal h3{
        margin:0 0 8px;
        font-size:17px;
      }
      .v2-modal p{
        margin:0 0 16px;
        color:#91a3ba;
        font-size:12px;
        line-height:1.6;
      }
      .v2-modal-actions{
        display:flex;
        justify-content:flex-end;
        gap:8px;
      }
      .v2-modal button{
        border:1px solid #24415e;
        border-radius:7px;
        padding:9px 13px;
        background:#0d1b2b;
        color:#fff;
        font-weight:800;
        font-size:10px;
      }
      .v2-modal button.primary{
        background:#075aa4;
        border-color:#0878d4;
      }
      .v2-modal .safe-badge{
        display:inline-block;
        margin-bottom:12px;
        padding:5px 8px;
        border-radius:999px;
        background:#0d3324;
        color:#16e782;
        font-size:9px;
        font-weight:900;
      }
      .v2-disabled{
        opacity:.65;
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

  function closeModal() {
    $(".v2-modal-backdrop")?.remove();
  }

  function modal(title, message, options = {}) {
    closeModal();

    const backdrop = document.createElement("div");
    backdrop.className = "v2-modal-backdrop";

    const box = document.createElement("div");
    box.className = "v2-modal";

    const badge = options.badge
      ? `<span class="safe-badge">${options.badge}</span>`
      : "";

    box.innerHTML = `
      ${badge}
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="v2-modal-actions">
        <button type="button" data-v2-close>Close</button>
        ${options.primary
          ? `<button type="button" class="primary" data-v2-primary>${options.primary}</button>`
          : ""}
      </div>
    `;

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal();
    });

    $("[data-v2-close]", box)?.addEventListener("click", closeModal);

    if (options.onPrimary) {
      $("[data-v2-primary]", box)?.addEventListener("click", () => {
        options.onPrimary();
        closeModal();
      });
    }
  }

  function activateNav(link) {
    $$(".sidebar nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");

    const label = $("span", link)?.textContent?.trim() || "Dashboard";
    state.activeSection = label;

    const targetMap = {
      Dashboard: ".overview",
      Market: ".overview",
      Chart: ".chart-panel",
      Strategy: ".strategy",
      Backtest: ".backtest",
      Trades: ".signals",
      Learning: ".evidence",
      Insights: ".health",
      Reports: ".quick",
      Settings: ".settings"
    };

    const target = $(targetMap[label]);

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    if (label === "Settings") {
      openSettings();
      return;
    }

    toast(`${label} view selected — V2 prototype`);
  }

  function toggleIndicators() {
    state.indicatorsVisible = !state.indicatorsVisible;

    $$(".ema, .indicators").forEach((element) => {
      element.style.opacity = state.indicatorsVisible ? "" : "0";
    });

    toast(
      state.indicatorsVisible
        ? "Chart indicators enabled"
        : "Chart indicators hidden"
    );
  }

  function openSettings() {
    modal(
      "V2 Settings",
      "This is a presentation-only settings panel. No Phase 11, backend, strategy, learning engine, broker, or Dhan setting can be changed from V2.",
      {
        badge: "READ-ONLY PROTOTYPE"
      }
    );
  }

  function paperTrade() {
    modal(
      "Paper Trade — Prototype",
      "Paper trading is intentionally disabled in this V2 prototype. No order will be created and no broker/API call will be made. Phase 11 remains isolated.",
      {
        badge: "SAFE / NO REAL ORDER"
      }
    );
  }

  function runBacktest() {
    modal(
      "Backtest",
      "The V2 interface is not connected to the backtest engine yet. This action is only a UI preview and does not execute a backend request.",
      {
        badge: "NOT CONNECTED"
      }
    );
  }

  function viewReports() {
    modal(
      "Reports",
      "The V2 report screen will be built later. Current Phase 11 evidence remains read-only and untouched.",
      {
        badge: "V2 PREVIEW"
      }
    );
  }

  function exportState() {
    const payload = {
      application: "TradeMind Pro",
      interface: "V2",
      mode: "PRESENTATION_ONLY",
      readOnly: true,
      phase11Modified: false,
      backendConnected: false,
      brokerOrdersEnabled: false,
      dhanConnected: false,
      activeSection: state.activeSection,
      indicatorsVisible: state.indicatorsVisible,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "trademind-v2-ui-state.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    toast("V2 UI state exported");
  }

  function refreshView() {
    // UI-only refresh. Deliberately does not fetch any endpoint.
    const now = new Date();

    const status = $(".market-status strong");
    const statusDate = $(".market-status small");

    if (status) {
      status.textContent = now.toLocaleTimeString("en-IN", {
        hour12: false,
        timeZone: "Asia/Kolkata"
      });
    }

    if (statusDate) {
      statusDate.textContent = "V2 UI • local refresh";
    }

    state.lastAction = "Presentation refreshed";
    toast("V2 presentation refreshed — no backend request");
  }

  function wireNavigation() {
    $$(".sidebar nav a").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        activateNav(link);
      });
    });
  }

  function wireHeader() {
    $(".settings")?.addEventListener("click", openSettings);
  }

  function wireChartControls() {
    const tools = $(".tools");

    if (!tools) return;

    // The prototype currently renders text controls in one element.
    tools.style.cursor = "pointer";
    tools.title = "V2 chart controls";

    tools.addEventListener("click", (event) => {
      const x = event.offsetX;

      // First area acts as Indicators control.
      if (x < tools.clientWidth * 0.55) {
        toggleIndicators();
      } else {
        toast("Chart control selected — detailed chart tools are next");
      }
    });
  }

  function wireActions() {
    const strategyButton = $(".strategy .primary");
    strategyButton?.addEventListener("click", paperTrade);

    const quickButtons = $$(".quick button");

    quickButtons[0]?.addEventListener("click", runBacktest);
    quickButtons[1]?.addEventListener("click", viewReports);
    quickButtons[2]?.addEventListener("click", exportState);
    quickButtons[3]?.addEventListener("click", openSettings);

    const detailedBacktest = $(".backtest a");
    detailedBacktest?.addEventListener("click", (event) => {
      event.preventDefault();
      runBacktest();
    });
  }

  function init() {
    ensureStyles();
    wireNavigation();
    wireHeader();
    wireChartControls();
    wireActions();

    // Explicitly mark the prototype as UI-only.
    document.documentElement.dataset.trademindV2 = "presentation-only";

    // Keyboard convenience: R refreshes the presentation, not market data.
    document.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) {
        refreshView();
      }

      if (event.key === "Escape") {
        closeModal();
      }
    });

    console.info(
      "TradeMind Pro V2: interaction layer active. No backend/API/broker connection."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

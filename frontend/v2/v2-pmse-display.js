/*
===========================================================
 TradeMind Pro — V2 PMSE Display Adapter
 ----------------------------------------------------------
 FRONTEND PRESENTATION LAYER ONLY

 Purpose:
 - Consume the existing /api/pmse-scan endpoint.
 - Display real PMSE candidates.
 - Display score and news risk.
 - Display paper-only safety state.

 Safety:
 - Does NOT create trades.
 - Does NOT call a broker.
 - Does NOT modify strategy state.
 - Does NOT calculate or reproduce PMSE logic.
 - Does NOT modify Phase 11.
 - Backend PMSE remains the authority.

 Refresh:
 - 60 seconds.
===========================================================
*/

(() => {
  "use strict";

  const CONFIG = Object.freeze({
    endpoint: "/api/pmse-scan",
    refreshMs: 60000,
    containerId: "v2-pmse-scanner"
  });

  const state = {
    loading: false,
    lastUpdated: null,
    data: null,
    error: null
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getMain() {
    return document.querySelector(".main");
  }

  function createPanel() {
    if (document.getElementById(CONFIG.containerId)) {
      return true;
    }

    const main = getMain();

    if (!main) {
      console.warn(
        "[TradeMind V2] PMSE .main container not found."
      );
      return false;
    }

    const section = document.createElement("section");

    section.id = CONFIG.containerId;
    section.className = "panel v2-pmse-panel";

    section.innerHTML = `
      <div class="v2-pmse-header">
        <div>
          <span class="v2-pmse-eyebrow">
            WORKSPACE 03
          </span>

          <h2>
            Pre-Market Scanner
          </h2>

          <small>
            REAL PMSE DATA • FRONTEND READ ONLY
          </small>
        </div>

        <div class="v2-pmse-status-wrap">
          <span
            class="v2-pmse-status"
            data-pmse-status
          >
            CHECKING
          </span>

          <span
            class="v2-pmse-updated"
            data-pmse-updated
          >
            --
          </span>
        </div>
      </div>

      <div
        class="v2-pmse-summary"
        data-pmse-summary
      >
        Loading PMSE...
      </div>

      <div
        class="v2-pmse-candidates"
        data-pmse-candidates
      ></div>

      <div class="v2-pmse-safety">
        <span>PAPER ONLY</span>
        <span>RESEARCH ONLY</span>
        <span>NO BROKER</span>
        <span>NO REAL ORDERS</span>
      </div>
    `;

    /*
     * IMPORTANT:
     * Do not use insertBefore() here.
     * The existing V2 DOM can contain nodes whose apparent
     * parent relationship changes during initialization.
     *
     * prepend() is sufficient because this is a presentation
     * panel and does not depend on section-heading ordering.
     */
    main.prepend(section);

    addStyles();

    return true;
  }

  function addStyles() {
    if (document.getElementById("v2-pmse-display-styles")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "v2-pmse-display-styles";

    style.textContent = `
      .v2-pmse-panel {
        margin-bottom: 24px;
        padding: 22px;
        border: 1px solid rgba(120,150,180,.18);
        background: rgba(8,17,29,.94);
      }

      .v2-pmse-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        margin-bottom: 18px;
      }

      .v2-pmse-eyebrow {
        display: block;
        margin-bottom: 5px;
        font-size: 10px;
        letter-spacing: .14em;
        color: #7f93aa;
      }

      .v2-pmse-header h2 {
        margin: 0 0 5px;
        font-size: 20px;
      }

      .v2-pmse-header small {
        color: #8193a8;
      }

      .v2-pmse-status-wrap {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 5px;
      }

      .v2-pmse-status {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
        background: rgba(22,231,130,.10);
        color: #16e782;
      }

      .v2-pmse-status.error {
        background: rgba(255,79,94,.10);
        color: #ff4f5e;
      }

      .v2-pmse-status.loading {
        background: rgba(255,179,71,.10);
        color: #ffb347;
      }

      .v2-pmse-updated {
        font-size: 10px;
        color: #6f8298;
      }

      .v2-pmse-summary {
        margin-bottom: 14px;
        color: #a8b8ca;
        font-size: 13px;
      }

      .v2-pmse-candidates {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .v2-pmse-candidate {
        padding: 16px;
        border: 1px solid rgba(120,150,180,.16);
        border-radius: 9px;
        background: rgba(255,255,255,.025);
      }

      .v2-pmse-candidate-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }

      .v2-pmse-symbol {
        font-size: 17px;
        font-weight: 800;
        color: #f4f7fb;
      }

      .v2-pmse-score {
        font-size: 20px;
        font-weight: 800;
        color: #16e782;
      }

      .v2-pmse-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #8093a9;
        font-size: 11px;
      }

      .v2-pmse-risk {
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(22,231,130,.08);
        color: #16e782;
        font-weight: 700;
      }

      .v2-pmse-empty {
        padding: 20px;
        border: 1px dashed rgba(120,150,180,.20);
        color: #8294aa;
        text-align: center;
      }

      .v2-pmse-safety {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid rgba(120,150,180,.10);
      }

      .v2-pmse-safety span {
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(255,255,255,.035);
        color: #8ea1b6;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .06em;
      }

      @media (max-width: 800px) {
        .v2-pmse-header {
          flex-direction: column;
        }

        .v2-pmse-status-wrap {
          align-items: flex-start;
        }

        .v2-pmse-candidates {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getPanel() {
    return document.getElementById(CONFIG.containerId);
  }

  function setStatus(text, type = "") {
    const panel = getPanel();

    if (!panel) return;

    const status =
      panel.querySelector("[data-pmse-status]");

    if (!status) return;

    status.textContent = text;
    status.className = "v2-pmse-status";

    if (type) {
      status.classList.add(type);
    }
  }

  function formatUpdated(date) {
    if (!date) return "--";

    return (
      date.toLocaleTimeString("en-IN", {
        hour12: false,
        timeZone: "Asia/Kolkata"
      }) + " IST"
    );
  }

  function render() {
    const panel = getPanel();

    if (!panel) return;

    const summary =
      panel.querySelector("[data-pmse-summary]");

    const candidates =
      panel.querySelector("[data-pmse-candidates]");

    const updated =
      panel.querySelector("[data-pmse-updated]");

    if (updated) {
      updated.textContent =
        state.lastUpdated
          ? `Updated ${formatUpdated(state.lastUpdated)}`
          : "--";
    }

    if (state.error) {
      setStatus("ERROR", "error");

      if (summary) {
        summary.textContent = state.error;
      }

      if (candidates) {
        candidates.innerHTML = `
          <div class="v2-pmse-empty">
            PMSE data unavailable. No frontend value is being invented.
          </div>
        `;
      }

      return;
    }

    if (!state.data) {
      setStatus("CHECKING", "loading");

      if (summary) {
        summary.textContent = "Loading PMSE...";
      }

      return;
    }

    const data = state.data;
    const universe = data.universe || {};
    const output = data.output || {};

    const list =
      Array.isArray(output.candidates)
        ? output.candidates
        : [];

    setStatus(
      data.status === "READY"
        ? "READY"
        : String(
            data.status || "UNKNOWN"
          ).toUpperCase()
    );

    if (summary) {
      summary.textContent =
        `${universe.totalSymbols ?? 0} symbols scanned • ` +
        `${universe.stockRecords ?? 0} stock records • ` +
        `${list.length} final candidates`;
    }

    if (!candidates) return;

    if (!list.length) {
      candidates.innerHTML = `
        <div class="v2-pmse-empty">
          No final PMSE candidates for this scan.
        </div>
      `;
      return;
    }

    candidates.innerHTML =
      list.map(candidate => {
        const symbol =
          escapeHtml(
            candidate?.symbol || "--"
          );

        const score =
          Number(candidate?.score);

        const scoreText =
          Number.isFinite(score)
            ? String(score)
            : "--";

        const newsRisk =
          escapeHtml(
            candidate?.newsRisk || "UNKNOWN"
          );

        return `
          <article class="v2-pmse-candidate">
            <div class="v2-pmse-candidate-top">
              <span class="v2-pmse-symbol">
                ${symbol}
              </span>

              <span class="v2-pmse-score">
                ${scoreText}
              </span>
            </div>

            <div class="v2-pmse-meta">
              <span>
                PMSE Score
              </span>

              <span class="v2-pmse-risk">
                News Risk: ${newsRisk}
              </span>
            </div>
          </article>
        `;
      }).join("");
  }

  async function fetchPMSE() {
    if (state.loading) return;

    state.loading = true;
    state.error = null;

    setStatus("CHECKING", "loading");

    try {
      const response =
        await fetch(
          `${CONFIG.endpoint}?_v2pmse=${Date.now()}`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "Cache-Control": "no-cache",
              Pragma: "no-cache"
            }
          }
        );

      const text = await response.text();

      let result;

      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          `Invalid PMSE JSON (HTTP ${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : `PMSE HTTP ${response.status}`
        );
      }

      if (result?.status !== "READY") {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "PMSE did not return READY"
        );
      }

      state.data = result;
      state.lastUpdated = new Date();
      state.error = null;

      render();

      console.info(
        "[TradeMind V2] PMSE updated",
        {
          status: result.status,
          candidates:
            result?.output?.candidates || []
        }
      );

    } catch (error) {
      state.data = null;
      state.error =
        error?.message ||
        "PMSE request failed";

      console.error(
        "[TradeMind V2] PMSE refresh failed:",
        error
      );

      render();

    } finally {
      state.loading = false;
    }
  }

  function start() {
    /*
     * The panel must be created first.
     * No section-heading lookup.
     * No insertBefore().
     */
    if (!createPanel()) {
      console.warn(
        "[TradeMind V2] PMSE startup skipped."
      );
      return;
    }

    render();
    fetchPMSE();

    window.setInterval(
      fetchPMSE,
      CONFIG.refreshMs
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }

})();

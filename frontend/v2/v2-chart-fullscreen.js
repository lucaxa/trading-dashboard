(() => {
  "use strict";

  function initChartFullscreen() {
    const chartPanel = document.querySelector(".chart-panel");
    const tools = chartPanel?.querySelector(".tools");

    if (!chartPanel || !tools) {
      console.warn("[TradeMind V2] Fullscreen: chart/tools not found.");
      return;
    }

    if (document.querySelector("#v2-chart-fullscreen")) return;

    const fullscreenButton = document.createElement("button");
    fullscreenButton.type = "button";
    fullscreenButton.id = "v2-chart-fullscreen";
    fullscreenButton.className = "v2-fullscreen-button";
    fullscreenButton.textContent = "⛶";
    fullscreenButton.setAttribute("aria-label", "Open chart fullscreen");
    fullscreenButton.title = "Open chart fullscreen";

    const existingText = tools.textContent || "";
    tools.textContent = existingText.replace("⛶", "").trim();
    tools.appendChild(fullscreenButton);

    const style = document.createElement("style");
    style.id = "v2-chart-fullscreen-style";
    style.textContent = `
      .v2-fullscreen-button{
        appearance:none;
        border:0;
        background:transparent;
        color:inherit;
        padding:3px 5px;
        min-width:28px;
        min-height:28px;
        border-radius:5px;
        font:inherit;
        line-height:1;
        cursor:pointer;
      }
      .v2-fullscreen-button:hover{
        background:#10263a;
        color:#39adff;
      }
      .v2-fullscreen-button:focus-visible{
        outline:2px solid #19a7ff;
        outline-offset:2px;
      }

      .chart-panel:fullscreen{
        width:100vw;
        height:100vh;
        max-width:none;
        max-height:none;
        margin:0;
        padding:14px;
        border-radius:0;
        background:#050b13;
        display:flex;
        flex-direction:column;
        overflow:hidden;
      }

      .chart-panel:fullscreen .chart{
        flex:1 1 auto;
        width:100%;
        height:auto;
        min-height:0;
      }

      .chart-panel:fullscreen .chart-footer{
        flex:0 0 auto;
      }

      .chart-panel.v2-chart-fullscreen-fallback{
        position:fixed !important;
        inset:0 !important;
        z-index:99999 !important;
        width:100vw !important;
        height:100vh !important;
        max-width:none !important;
        max-height:none !important;
        margin:0 !important;
        padding:10px !important;
        border-radius:0 !important;
        background:#050b13 !important;
        display:flex !important;
        flex-direction:column !important;
        overflow:hidden !important;
      }

      .chart-panel.v2-chart-fullscreen-fallback .chart{
        flex:1 1 auto;
        height:auto !important;
        min-height:0;
      }

      @media(max-width:760px){
        .v2-fullscreen-button{
          min-width:32px;
          min-height:32px;
        }
        .chart-panel:fullscreen,
        .chart-panel.v2-chart-fullscreen-fallback{
          padding:8px !important;
        }
      }
    `;
    document.head.appendChild(style);

    function isFullscreen() {
      return document.fullscreenElement === chartPanel;
    }

    function updateButton() {
      const active = isFullscreen() ||
        chartPanel.classList.contains("v2-chart-fullscreen-fallback");

      fullscreenButton.setAttribute(
        "aria-label",
        active ? "Exit chart fullscreen" : "Open chart fullscreen"
      );
      fullscreenButton.title =
        active ? "Exit chart fullscreen" : "Open chart fullscreen";
    }

    async function enterFullscreen() {
      try {
        if (chartPanel.requestFullscreen) {
          await chartPanel.requestFullscreen();
        } else {
          chartPanel.classList.add("v2-chart-fullscreen-fallback");
        }
      } catch (error) {
        console.warn("[TradeMind V2] Fullscreen unavailable:", error);
        chartPanel.classList.add("v2-chart-fullscreen-fallback");
      }
      updateButton();
    }

    async function exitFullscreen() {
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (error) {
          console.warn("[TradeMind V2] Fullscreen exit failed:", error);
        }
      }
      chartPanel.classList.remove("v2-chart-fullscreen-fallback");
      updateButton();
    }

    fullscreenButton.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      const fallback =
        chartPanel.classList.contains("v2-chart-fullscreen-fallback");

      if (isFullscreen() || fallback) {
        await exitFullscreen();
      } else {
        await enterFullscreen();
      }
    });

    document.addEventListener("fullscreenchange", updateButton);

    document.addEventListener("keydown", event => {
      if (
        event.key === "Escape" &&
        chartPanel.classList.contains("v2-chart-fullscreen-fallback")
      ) {
        chartPanel.classList.remove("v2-chart-fullscreen-fallback");
        updateButton();
      }
    });

    updateButton();

    console.info(
      "[TradeMind V2] Chart fullscreen ready — frontend only."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChartFullscreen, {
      once: true
    });
  } else {
    initChartFullscreen();
  }
})();

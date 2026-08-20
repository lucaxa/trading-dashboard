(() => {
  "use strict";

  /*
  ===========================================================
   TradeMind Pro — V2
   STEP 10.3A — WORKSPACE CONTROLLER FOUNDATION

   FRONTEND ONLY
   - Controls V2 workspace navigation.
   - No API calls.
   - No backend changes.
   - No Phase 11 changes.
   - Does not modify v2.js.
   - Existing chart remains mounted and untouched.
  ===========================================================
  */

  const WORKSPACES = {
    dashboard: {
      label: "Dashboard",
      target: ".kpi-grid"
    },

    market: {
      label: "Live Market",
      target: ".live-market-grid"
    },

    signals: {
      label: "Signals",
      target: ".recent-panel"
    },

    strategy: {
      label: "Strategy Lab",
      target: ".three-panel-grid"
    },

    edge: {
      label: "Edge Health",
      target: ".health"
    },

    backtesting: {
      label: "Backtesting",
      target: ".legacy-section"
    },

    trades: {
      label: "Trades",
      target: ".bottom-grid"
    },

    portfolio: {
      label: "Portfolio",
      target: ".bottom-grid"
    },

    reports: {
      label: "Reports",
      target: ".legacy-section"
    },

    settings: {
      label: "Settings",
      target: ".settings"
    }
  };

  let currentWorkspace = "dashboard";

  function getNavItems() {
    return [...document.querySelectorAll(".sidebar nav a")];
  }

  function normalizeLabel(text) {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function getWorkspaceKey(label) {
    const value = normalizeLabel(label);

    if (value === "dashboard") return "dashboard";
    if (value === "live market") return "market";
    if (value === "signals") return "signals";
    if (value === "strategy lab") return "strategy";
    if (value === "edge health") return "edge";
    if (value === "backtesting") return "backtesting";
    if (value === "trades") return "trades";
    if (value === "portfolio") return "portfolio";
    if (value === "reports") return "reports";
    if (value === "settings") return "settings";

    return null;
  }

  function setActiveNav(key) {
    const items = getNavItems();

    items.forEach(item => {
      const label = item.querySelector("span");

      if (!label) return;

      const itemKey = getWorkspaceKey(label.textContent);

      item.classList.toggle(
        "active",
        itemKey === key
      );
    });
  }

  function scrollToWorkspace(key) {
    const workspace = WORKSPACES[key];

    if (!workspace) return;

    const target = document.querySelector(
      workspace.target
    );

    if (!target) return;

    const top =
      target.getBoundingClientRect().top +
      window.scrollY -
      14;

    window.scrollTo({
      top,
      behavior: "smooth"
    });
  }

  function activateWorkspace(key, options = {}) {
    if (!WORKSPACES[key]) return;

    currentWorkspace = key;

    setActiveNav(key);

    if (options.scroll !== false) {
      scrollToWorkspace(key);
    }

    /*
     * Close the existing mobile drawer if the V2 UI already
     * exposes its close behavior.
     */
    const drawer = document.querySelector(".sidebar");

    if (
      window.innerWidth <= 760 &&
      drawer
    ) {
      drawer.classList.remove("open");
      document.body.classList.remove(
        "sidebar-open"
      );
    }

    window.dispatchEvent(
      new CustomEvent(
        "trademind:v2:workspacechange",
        {
          detail: {
            key,
            label: WORKSPACES[key].label
          }
        }
      )
    );
  }

  function bindNavigation() {
    getNavItems().forEach(item => {
      const label = item.querySelector("span");

      if (!label) return;

      const key =
        getWorkspaceKey(label.textContent);

      if (!key) return;

      item.addEventListener("click", event => {
        event.preventDefault();

        activateWorkspace(key);
      });
    });
  }

  function exposeController() {
    window.TradeMindV2Workspaces = {
      getCurrentWorkspace() {
        return currentWorkspace;
      },

      goTo(key) {
        activateWorkspace(key);
      },

      list() {
        return Object.entries(WORKSPACES).map(
          ([key, value]) => ({
            key,
            label: value.label
          })
        );
      }
    };
  }

  function init() {
    bindNavigation();
    exposeController();

    /*
     * Dashboard is the initial workspace.
     * Do not force a scroll on page load.
     */
    setActiveNav("dashboard");

    console.info(
      "[TradeMind V2] Workspace controller ready — frontend only."
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

/*
===========================================================
 TradeMind Pro — V2 Sidebar Navigation
 STEP 5.1 — FRONTEND NAVIGATION ONLY
 ----------------------------------------------------------
 IMPORTANT:
 - Presentation/UI layer only.
 - No API calls.
 - No strategy changes.
 - No Phase 11 changes.
 - No evidence writes.
 - No backend dependencies.
 - Uses existing V2 sections/classes.
===========================================================
*/

(() => {
  "use strict";

  const navItems = [
    {
      label: "Dashboard",
      target: () => window.scrollTo({ top: 0, behavior: "smooth" })
    },
    {
      label: "Live Market",
      target: () => scrollToElement(".live-market-grid")
    },
    {
      label: "Signals",
      target: () => scrollToElement(".recent-panel")
    },
    {
      label: "Strategy Lab",
      target: () => scrollToElement(".three-panel-grid")
    },
    {
      label: "Edge Health",
      target: () => scrollToElement(".three-panel-grid .panel:nth-child(2)")
    },
    {
      label: "Backtesting",
      target: () => scrollToElement(".legacy-section")
    },
    {
      label: "Trades",
      target: () => scrollToElement(".three-panel-grid .panel:nth-child(3)")
    },
    {
      label: "Portfolio",
      target: () => scrollToElement(".bottom-grid")
    },
    {
      label: "Reports",
      target: () => scrollToElement(".legacy-section")
    },
    {
      label: "Settings",
      target: () => showToast(
        "V2 Settings is presentation-only for now. No backend settings are changed."
      )
    }
  ];

  function scrollToElement(selector) {
    const element = document.querySelector(selector);

    if (!element) {
      showToast("This V2 workspace is not available yet.");
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function showToast(message) {
    let toast = document.querySelector("#v2-nav-toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "v2-nav-toast";

      toast.style.cssText = `
        position:fixed;
        left:50%;
        bottom:24px;
        transform:translate(-50%,20px);
        z-index:99999;
        max-width:min(520px,calc(100vw - 32px));
        padding:11px 16px;
        border:1px solid rgba(22,167,255,.35);
        border-radius:9px;
        background:rgba(5,13,22,.96);
        color:#dce8f5;
        font:600 12px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
        text-align:center;
        box-shadow:0 12px 32px rgba(0,0,0,.35);
        opacity:0;
        pointer-events:none;
        transition:opacity .18s ease,transform .18s ease;
      `;

      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%,0)";

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%,20px)";
    }, 2400);
  }

  function setActive(clickedLink) {
    document.querySelectorAll(".sidebar nav a").forEach(link => {
      link.classList.remove("active");
    });

    clickedLink.classList.add("active");
  }

  function findNavigationItem(link) {
    const text = (
      link.querySelector("span")?.textContent || ""
    ).trim().toLowerCase();

    return navItems.find(item =>
      item.label.toLowerCase() === text
    );
  }

  function wireSidebar() {
    const links = document.querySelectorAll(".sidebar nav a");

    if (!links.length) {
      return;
    }

    links.forEach(link => {
      link.setAttribute("href", "#");

      link.addEventListener("click", event => {
        event.preventDefault();

        const item = findNavigationItem(link);

        if (!item) {
          showToast("This V2 navigation item is not configured yet.");
          return;
        }

        setActive(link);
        item.target();
      });
    });
  }

  function wireSettingsButton() {
    const settingsButton =
      document.querySelector(".settings");

    if (!settingsButton) return;

    settingsButton.addEventListener("click", event => {
      event.preventDefault();

      showToast(
        "V2 Settings is presentation-only for now. No backend settings are changed."
      );
    });
  }

  function addNavigationStyles() {
    if (document.querySelector("#v2-nav-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "v2-nav-styles";

    style.textContent = `
      .sidebar nav a{
        cursor:pointer;
        user-select:none;
      }

      .sidebar nav a:focus-visible{
        outline:2px solid #19a7ff;
        outline-offset:2px;
      }

      .sidebar nav a.active{
        cursor:default;
      }
    `;

    document.head.appendChild(style);
  }

  function init() {
    addNavigationStyles();
    wireSidebar();
    wireSettingsButton();

    console.info(
      "[TradeMind V2] Sidebar navigation ready — frontend only."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }
})();

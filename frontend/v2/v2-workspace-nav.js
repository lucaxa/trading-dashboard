/*
===========================================================
 TradeMind Pro — V2 Workspace Navigation
 STEP 7 — FRONTEND UI/UX ONLY
 ----------------------------------------------------------
 Purpose:
 - Give every V2 sidebar item a dedicated workspace target.
 - Improve navigation precision for the new V2 layout.
 - Add active-section tracking while scrolling.
 - Preserve existing v2-nav.js behaviour.
 - No API calls.
 - No backend / Phase 11 changes.
 - No strategy / learning / evidence changes.
===========================================================
*/

(() => {
  "use strict";

  const WORKSPACES = {
    "Dashboard": ".kpi-grid",
    "Live Market": ".live-market-grid",
    "Signals": ".recent-panel",
    "Strategy Lab": ".three-panel-grid .panel:nth-child(1)",
    "Edge Health": ".three-panel-grid .panel:nth-child(2)",
    "Backtesting": ".legacy-section .content-grid .panel:nth-child(2)",
    "Trades": ".three-panel-grid .panel:nth-child(3)",
    "Portfolio": ".bottom-grid",
    "Reports": ".legacy-section",
    "Settings": ".settings"
  };

  const NAV_LABELS = Object.keys(WORKSPACES);

  function getLabel(link) {
    return (
      link.querySelector("span")?.textContent ||
      link.textContent ||
      ""
    ).trim();
  }

  function getTarget(label) {
    const selector = WORKSPACES[label];
    if (!selector) return null;

    return document.querySelector(selector);
  }

  function markTarget(link, target) {
    if (!target) return;

    if (!target.id) {
      const safeId = "v2-workspace-" +
        link.textContent
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      target.id = safeId;
    }

    target.classList.add("v2-workspace-target");
    link.dataset.v2Target = "#" + target.id;
  }

  function prepareNavigation() {
    const links = document.querySelectorAll(".sidebar nav a");

    links.forEach(link => {
      const label = getLabel(link);

      if (!NAV_LABELS.includes(label)) return;

      const target = getTarget(label);
      markTarget(link, target);

      if (target) {
        target.style.scrollMarginTop = "18px";
      }
    });
  }

  function setActive(link) {
    document.querySelectorAll(".sidebar nav a").forEach(item => {
      item.classList.remove("v2-workspace-active");
    });

    if (link) {
      link.classList.add("v2-workspace-active");
    }
  }

  function wirePreciseTargets() {
    const links = document.querySelectorAll(".sidebar nav a");

    links.forEach(link => {
      const label = getLabel(link);
      const target = getTarget(label);

      if (!target) return;

      /*
       * v2-nav.js already owns the main click handler.
       * We wait one tick, then move to the exact workspace.
       * This avoids replacing the existing navigation system.
       */
      link.addEventListener("click", () => {
        setActive(link);

        window.setTimeout(() => {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }, 60);
      }, { passive: true });
    });
  }

  function updateActiveFromScroll() {
    const links = [...document.querySelectorAll(".sidebar nav a")];

    let bestLink = null;
    let bestDistance = Infinity;

    links.forEach(link => {
      const label = getLabel(link);
      const target = getTarget(label);

      if (!target) return;

      const rect = target.getBoundingClientRect();

      /*
       * Prefer the workspace whose top is closest to the
       * upper navigation reading line.
       */
      const distance = Math.abs(rect.top - 120);

      if (rect.bottom > 100 && distance < bestDistance) {
        bestDistance = distance;
        bestLink = link;
      }
    });

    if (bestLink) {
      setActive(bestLink);
    }
  }

  function addStyles() {
    if (document.querySelector("#v2-workspace-navigation-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "v2-workspace-navigation-style";

    style.textContent = `
      .v2-workspace-target{
        scroll-margin-top:18px;
      }

      .sidebar nav a.v2-workspace-active{
        box-shadow:inset 2px 0 0 #19a7ff;
      }

      @media(max-width:760px){
        .v2-workspace-target{
          scroll-margin-top:12px;
        }

        .sidebar nav a.v2-workspace-active{
          box-shadow:inset 3px 0 0 #19a7ff;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function init() {
    addStyles();
    prepareNavigation();
    wirePreciseTargets();

    let ticking = false;

    window.addEventListener("scroll", () => {
      if (ticking) return;

      ticking = true;

      window.requestAnimationFrame(() => {
        updateActiveFromScroll();
        ticking = false;
      });
    }, { passive: true });

    updateActiveFromScroll();

    console.info(
      "[TradeMind V2] Workspace navigation ready — frontend only."
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

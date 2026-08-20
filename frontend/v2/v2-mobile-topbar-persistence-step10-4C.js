/*
===========================================================
 TradeMind Pro V2
 Step 10.4D — MOBILE TOPBAR PERSISTENCE
 ----------------------------------------------------------
 Purpose:
 - Keep the V2 mobile top navigation visible while scrolling
 - Use a true viewport-fixed header
 - Preserve the page's normal scroll position
 - Respect iOS safe-area inset
 - Do not affect desktop
 - Do not touch chart/backend/API/Phase 11 logic

 Replaces:
 - Step 10.4C mobile topbar persistence behavior
===========================================================
*/

(function () {
  "use strict";

  const MOBILE_MAX_WIDTH = 767;

  let topbar = null;
  let spacer = null;
  let resizeObserver = null;
  let initialized = false;

  function isMobile() {
    return window.matchMedia(
      "(max-width:" + MOBILE_MAX_WIDTH + "px)"
    ).matches;
  }

  function findTopbar() {
    return document.querySelector(".topbar");
  }

  function createSpacer() {
    if (spacer && spacer.isConnected) return spacer;

    spacer = document.createElement("div");
    spacer.id = "tm-v2-mobile-topbar-spacer";
    spacer.setAttribute("aria-hidden", "true");

    return spacer;
  }

  function updateDimensions() {
    if (!topbar || !isMobile()) return;

    const rect = topbar.getBoundingClientRect();

    const height = Math.ceil(
      Math.max(
        rect.height,
        topbar.offsetHeight || 0
      )
    );

    document.documentElement.style.setProperty(
      "--tm-v2-mobile-topbar-height",
      height + "px"
    );

    if (spacer) {
      spacer.style.height = height + "px";
    }
  }

  function enableMobile() {
    topbar = findTopbar();

    if (!topbar) {
      return;
    }

    const parent = topbar.parentElement;

    /*
     -------------------------------------------------------
     Prevent transformed/contained ancestors from changing
     the containing block of position:fixed.
     -------------------------------------------------------
    */

    document.documentElement.classList.add(
      "tm-v2-mobile-topbar-active"
    );

    document.body.classList.add(
      "tm-v2-mobile-topbar-active"
    );

    const shell = document.querySelector(".app-shell");
    const main = document.querySelector(".main");

    if (shell) {
      shell.classList.add("tm-v2-mobile-shell");
    }

    if (main) {
      main.classList.add("tm-v2-mobile-main");
    }

    /*
     -------------------------------------------------------
     Create a flow spacer where the original topbar was.
     -------------------------------------------------------
    */

    if (!spacer) {
      spacer = createSpacer();

      if (topbar.nextSibling) {
        parent.insertBefore(spacer, topbar.nextSibling);
      } else {
        parent.appendChild(spacer);
      }
    }

    /*
     -------------------------------------------------------
     Fixed positioning is intentionally applied directly
     to the existing topbar instead of cloning it.
     This preserves the existing menu/settings handlers.
     -------------------------------------------------------
    */

    topbar.classList.add("tm-v2-mobile-topbar-fixed");

    topbar.style.setProperty(
      "position",
      "fixed",
      "important"
    );

    topbar.style.setProperty(
      "top",
      "env(safe-area-inset-top, 0px)",
      "important"
    );

    topbar.style.setProperty(
      "left",
      "0",
      "important"
    );

    topbar.style.setProperty(
      "right",
      "0",
      "important"
    );

    topbar.style.setProperty(
      "width",
      "100%",
      "important"
    );

    topbar.style.setProperty(
      "z-index",
      "99999",
      "important"
    );

    topbar.style.setProperty(
      "box-sizing",
      "border-box",
      "important"
    );

    /*
     -------------------------------------------------------
     Make sure the fixed header has a solid background.
     This prevents dashboard cards appearing through it.
     -------------------------------------------------------
    */

    topbar.style.setProperty(
      "background",
      "var(--tm-v2-topbar-background, #050b13)",
      "important"
    );

    /*
     -------------------------------------------------------
     Safe-area support for iPhone.
     -------------------------------------------------------
    */

    topbar.style.setProperty(
      "padding-top",
      "max(0px, env(safe-area-inset-top, 0px))",
      "important"
    );

    /*
     -------------------------------------------------------
     Reserve exactly the same amount of vertical space in
     normal document flow.
     -------------------------------------------------------
    */

    updateDimensions();

    initialized = true;

    console.log(
      "[TradeMind V2] Step 10.4D mobile topbar fixed — active."
    );
  }

  function disableMobile() {
    if (!topbar) {
      topbar = findTopbar();
    }

    const shell = document.querySelector(".app-shell");
    const main = document.querySelector(".main");

    document.documentElement.classList.remove(
      "tm-v2-mobile-topbar-active"
    );

    document.body.classList.remove(
      "tm-v2-mobile-topbar-active"
    );

    if (shell) {
      shell.classList.remove("tm-v2-mobile-shell");
    }

    if (main) {
      main.classList.remove("tm-v2-mobile-main");
    }

    if (topbar) {
      topbar.classList.remove(
        "tm-v2-mobile-topbar-fixed"
      );

      /*
       -----------------------------------------------------
       Remove ONLY the properties introduced by this file.
       -----------------------------------------------------
      */

      topbar.style.removeProperty("position");
      topbar.style.removeProperty("top");
      topbar.style.removeProperty("left");
      topbar.style.removeProperty("right");
      topbar.style.removeProperty("width");
      topbar.style.removeProperty("z-index");
      topbar.style.removeProperty("box-sizing");
      topbar.style.removeProperty("background");
      topbar.style.removeProperty("padding-top");
    }

    if (spacer && spacer.isConnected) {
      spacer.remove();
    }

    spacer = null;

    document.documentElement.style.removeProperty(
      "--tm-v2-mobile-topbar-height"
    );

    initialized = false;
  }

  function sync() {
    if (isMobile()) {
      if (!initialized) {
        enableMobile();
      } else {
        topbar = findTopbar();

        if (topbar) {
          updateDimensions();
        }
      }
    } else if (initialized) {
      disableMobile();
    }
  }

  function startObserver() {
    if (!topbar || typeof ResizeObserver === "undefined") {
      return;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    resizeObserver = new ResizeObserver(function () {
      if (isMobile()) {
        updateDimensions();
      }
    });

    resizeObserver.observe(topbar);
  }

  function boot() {
    sync();

    /*
     -------------------------------------------------------
     Some V2 mobile scripts modify the header after page
     startup. Re-check briefly so we catch those changes.
     -------------------------------------------------------
    */

    let attempts = 0;

    const waitForHeader = setInterval(function () {
      attempts++;

      const currentTopbar = findTopbar();

      if (currentTopbar) {
        topbar = currentTopbar;
        sync();
        startObserver();

        if (initialized || attempts >= 20) {
          clearInterval(waitForHeader);
        }
      }

      if (attempts >= 20) {
        clearInterval(waitForHeader);
      }
    }, 250);

    /*
     -------------------------------------------------------
     Responsive changes
     -------------------------------------------------------
    */

    window.addEventListener(
      "resize",
      function () {
        sync();

        if (isMobile()) {
          updateDimensions();
        }
      },
      { passive: true }
    );

    window.addEventListener(
      "orientationchange",
      function () {
        setTimeout(function () {
          sync();
          updateDimensions();
        }, 100);
      },
      { passive: true }
    );

    /*
     -------------------------------------------------------
     iOS Safari visual viewport changes when the browser
     address bar expands/collapses.
     -------------------------------------------------------
    */

    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        "resize",
        function () {
          if (isMobile()) {
            updateDimensions();
          }
        },
        { passive: true }
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }

})();

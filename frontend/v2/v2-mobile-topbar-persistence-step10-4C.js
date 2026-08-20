/*
===========================================================
 TradeMind Pro — V2
 STEP 10.4C — MOBILE TOP NAV PERSISTENCE FIX
 ----------------------------------------------------------
 Frontend presentation only.

 PURPOSE
 -------
 Keep the mobile top navigation/menu visible while the V2
 dashboard page is scrolled.

 SAFEGUARDS
 ----------
 - Mobile/tablet only (<=760px).
 - Existing sidebar drawer is untouched.
 - Existing mobile chart interaction is untouched.
 - No API/backend changes.
 - No v2.js changes.
 - No Phase 11 changes.
 - No changes to desktop sidebar behavior.
===========================================================
*/

(() => {
  "use strict";

  function installMobileTopbarFix() {
    if (document.getElementById("v2-mobile-topbar-persistence-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "v2-mobile-topbar-persistence-style";

    style.textContent = `
      @media (max-width: 760px) {

        /*
         * Keep the existing V2 top navigation visible
         * while the dashboard content is scrolled.
         */
        .app-shell > .main > .topbar {
          position: sticky !important;
          top: 0 !important;
          z-index: 9000 !important;

          /*
           * Prevent dashboard content from showing through
           * the persistent navigation area.
           */
          background: #060b12 !important;

          isolation: isolate;
        }

        /*
         * Keep the mobile menu button above the topbar.
         */
        #v2-mobile-menu-button {
          position: relative;
          z-index: 9002 !important;
        }

        /*
         * Existing mobile drawer/backdrop remain above
         * the persistent top navigation.
         */
        #v2-mobile-backdrop {
          z-index: 9999 !important;
        }

        .sidebar {
          z-index: 10000 !important;
        }
      }
    `;

    document.head.appendChild(style);

    console.info(
      "[TradeMind V2] Mobile top navigation persistence ready — frontend only."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      installMobileTopbarFix,
      { once: true }
    );
  } else {
    installMobileTopbarFix();
  }
})();

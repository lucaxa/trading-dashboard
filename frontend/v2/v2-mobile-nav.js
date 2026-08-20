/*
===========================================================
 TradeMind Pro V2
 Step 10.4B — Mobile Layout + Persistent Header
 ----------------------------------------------------------
 PURPOSE:
 - Remove desktop sidebar space on mobile
 - Make sidebar an overlay
 - Keep mobile header visible while scrolling
 - Preserve existing navigation behaviour
 - Desktop layout remains untouched
 - Chart / API / Phase 11 untouched
===========================================================
*/

(() => {
  "use strict";

  function initMobileNavigation() {
    const sidebar = document.querySelector(".sidebar");
    const topbar = document.querySelector(".topbar");
    const appShell = document.querySelector(".app-shell");

    if (!sidebar || !topbar) {
      console.warn(
        "[TradeMind V2] Step 10.4B: sidebar/topbar not found."
      );
      return;
    }

    /*
    -------------------------------------------------------
    Avoid duplicate initialization
    -------------------------------------------------------
    */
    if (document.querySelector("#v2-mobile-layout-style")) {
      return;
    }

    /*
    -------------------------------------------------------
    Mobile menu button
    -------------------------------------------------------
    */
    let menuButton = document.querySelector("#v2-mobile-menu-button");

    if (!menuButton) {
      menuButton = document.createElement("button");

      menuButton.id = "v2-mobile-menu-button";
      menuButton.type = "button";
      menuButton.setAttribute("aria-label", "Open navigation");
      menuButton.setAttribute("aria-expanded", "false");

      menuButton.innerHTML = "☰";

      topbar.insertBefore(
        menuButton,
        topbar.firstChild
      );
    }

    /*
    -------------------------------------------------------
    Backdrop
    -------------------------------------------------------
    */
    let backdrop = document.querySelector("#v2-mobile-backdrop");

    if (!backdrop) {
      backdrop = document.createElement("div");

      backdrop.id = "v2-mobile-backdrop";
      backdrop.setAttribute("aria-hidden", "true");

      document.body.appendChild(backdrop);
    }

    /*
    -------------------------------------------------------
    Mobile layout CSS
    -------------------------------------------------------
    */
    const style = document.createElement("style");

    style.id = "v2-mobile-layout-style";

    style.textContent = `

      /* =================================================
         DESKTOP — NO CHANGE
         ================================================= */

      #v2-mobile-menu-button {
        display: none;
      }

      #v2-mobile-backdrop {
        display: none;
      }


      /* =================================================
         MOBILE
         ================================================= */

      @media (max-width: 760px) {

        html,
        body {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          margin: 0;
          padding: 0;
          overflow-x: hidden;
        }


        /* -----------------------------------------------
           CRITICAL FIX:
           Remove the desktop sidebar column.
           ----------------------------------------------- */

        .app-shell {
          display: block !important;

          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;

          margin: 0 !important;
          padding: 0 !important;
        }


        /* -----------------------------------------------
           Sidebar becomes an overlay.
           It no longer consumes page width.
           ----------------------------------------------- */

        .sidebar {
          display: flex !important;

          position: fixed !important;

          top: 0 !important;
          left: 0 !important;
          bottom: 0 !important;

          width: min(300px, 82vw) !important;
          max-width: 300px !important;

          height: 100dvh !important;

          margin: 0 !important;

          z-index: 10000 !important;

          transform: translate3d(-105%, 0, 0) !important;

          transition:
            transform .22s ease !important;

          overflow-x: hidden !important;
          overflow-y: auto !important;

          overscroll-behavior: contain !important;

          -webkit-overflow-scrolling: touch !important;

          box-sizing: border-box !important;
        }


        .sidebar.v2-mobile-open {
          transform: translate3d(0, 0, 0) !important;
        }


        /* -----------------------------------------------
           MAIN CONTENT
           ----------------------------------------------- */

        .main,
        .main-content,
        .content,
        .workspace,
        .page-content {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;

          margin-left: 0 !important;
          padding-left: 0 !important;
        }


        /* -----------------------------------------------
           TOPBAR / MOBILE HEADER
           ----------------------------------------------- */

        .topbar {
          position: sticky !important;

          top: 0 !important;

          z-index: 9000 !important;

          width: 100% !important;
          min-width: 0 !important;

          box-sizing: border-box !important;

          display: flex !important;

          align-items: center !important;

          gap: 10px !important;

          padding-left: 12px !important;
          padding-right: 12px !important;
        }


        /* -----------------------------------------------
           MENU BUTTON
           ----------------------------------------------- */

        #v2-mobile-menu-button {
          display: grid !important;

          place-items: center !important;

          width: 40px !important;
          height: 40px !important;

          flex: 0 0 40px !important;

          margin: 0 !important;

          padding: 0 !important;

          border: 1px solid #1d3047 !important;

          border-radius: 9px !important;

          background: #0d1725 !important;

          color: #dce8f5 !important;

          font-size: 20px !important;

          line-height: 1 !important;

          cursor: pointer !important;

          touch-action: manipulation !important;

          -webkit-tap-highlight-color: transparent !important;
        }


        #v2-mobile-menu-button:active {
          transform: scale(.97);
        }


        /* -----------------------------------------------
           BACKDROP
           ----------------------------------------------- */

        #v2-mobile-backdrop.v2-mobile-open {
          display: block !important;

          position: fixed !important;

          inset: 0 !important;

          z-index: 9999 !important;

          background: rgba(0, 0, 0, .58) !important;
        }


        /* -----------------------------------------------
           BODY LOCK WHEN DRAWER IS OPEN
           ----------------------------------------------- */

        body.v2-mobile-nav-open {
          overflow: hidden !important;
        }


        /* -----------------------------------------------
           NAV ITEMS
           ----------------------------------------------- */

        .sidebar nav {
          display: flex !important;

          flex-direction: column !important;

          gap: 5px !important;

          width: 100% !important;
        }


        .sidebar nav a {
          width: 100% !important;

          min-height: 48px !important;

          box-sizing: border-box !important;

          display: flex !important;

          align-items: center !important;

          justify-content: flex-start !important;

          gap: 12px !important;

          padding: 0 14px !important;

          touch-action: manipulation !important;

          -webkit-tap-highlight-color: transparent !important;
        }


        /* -----------------------------------------------
           MOBILE CONTENT WIDTH
           ----------------------------------------------- */

        .container,
        .dashboard,
        .dashboard-container,
        .page,
        main {
          width: 100% !important;
          max-width: 100% !important;

          min-width: 0 !important;

          box-sizing: border-box !important;
        }


        /* -----------------------------------------------
           GRID SECTIONS
           ----------------------------------------------- */

        .grid,
        .dashboard-grid,
        .workspace-grid {
          max-width: 100% !important;
          min-width: 0 !important;
        }


        /* -----------------------------------------------
           CARDS
           ----------------------------------------------- */

        .card,
        .panel,
        .section {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
      }


      /* =================================================
         SMALL PHONES
         ================================================= */

      @media (max-width: 420px) {

        #v2-mobile-menu-button {
          width: 38px !important;
          height: 38px !important;

          flex-basis: 38px !important;
        }

        .sidebar {
          width: min(300px, 84vw) !important;
        }
      }

    `;

    document.head.appendChild(style);


    /*
    -------------------------------------------------------
    Open / close
    -------------------------------------------------------
    */

    function openMenu() {
      sidebar.classList.add("v2-mobile-open");
      backdrop.classList.add("v2-mobile-open");

      document.body.classList.add(
        "v2-mobile-nav-open"
      );

      menuButton.setAttribute(
        "aria-expanded",
        "true"
      );

      menuButton.setAttribute(
        "aria-label",
        "Close navigation"
      );

      menuButton.innerHTML = "×";
    }


    function closeMenu() {
      sidebar.classList.remove("v2-mobile-open");
      backdrop.classList.remove("v2-mobile-open");

      document.body.classList.remove(
        "v2-mobile-nav-open"
      );

      menuButton.setAttribute(
        "aria-expanded",
        "false"
      );

      menuButton.setAttribute(
        "aria-label",
        "Open navigation"
      );

      menuButton.innerHTML = "☰";
    }


    /*
    -------------------------------------------------------
    Button
    -------------------------------------------------------
    */

    menuButton.addEventListener(
      "click",
      () => {
        if (
          sidebar.classList.contains(
            "v2-mobile-open"
          )
        ) {
          closeMenu();
        } else {
          openMenu();
        }
      }
    );


    /*
    -------------------------------------------------------
    Backdrop
    -------------------------------------------------------
    */

    backdrop.addEventListener(
      "click",
      closeMenu
    );


    /*
    -------------------------------------------------------
    Navigation links
    -------------------------------------------------------
    */

    sidebar
      .querySelectorAll("a")
      .forEach(link => {

        link.addEventListener(
          "click",
          () => {

            if (
              window.innerWidth <= 760
            ) {
              setTimeout(
                closeMenu,
                80
              );
            }

          }
        );

      });


    /*
    -------------------------------------------------------
    ESC
    -------------------------------------------------------
    */

    document.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Escape"
        ) {
          closeMenu();
        }

      }
    );


    /*
    -------------------------------------------------------
    Resize
    -------------------------------------------------------
    */

    window.addEventListener(
      "resize",
      () => {

        if (
          window.innerWidth > 760
        ) {
          closeMenu();
        }

      }
    );


    console.info(
      "[TradeMind V2] Step 10.4B mobile layout ready — frontend only."
    );
  }


  /*
  ---------------------------------------------------------
   Initialize
  ---------------------------------------------------------
  */

  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initMobileNavigation,
      { once: true }
    );

  } else {

    initMobileNavigation();

  }

})();

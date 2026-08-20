/* TradeMind Pro V2 — Step 10.4A Mobile Drawer Correction */
(() => {
  "use strict";

  function initMobileNavigation() {
    const sidebar = document.querySelector(".sidebar");
    const topbar = document.querySelector(".topbar");

    if (!sidebar || !topbar) return;
    if (document.querySelector("#v2-mobile-menu-button")) return;

    const button = document.createElement("button");

    button.id = "v2-mobile-menu-button";
    button.type = "button";
    button.setAttribute("aria-label", "Open navigation");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = "☰";

    const backdrop = document.createElement("div");

    backdrop.id = "v2-mobile-backdrop";
    backdrop.setAttribute("aria-hidden", "true");

    document.body.appendChild(backdrop);

    const style = document.createElement("style");

    style.id = "v2-mobile-navigation-style";

    style.textContent = `
      #v2-mobile-menu-button {
        display: none;
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
        border: 1px solid #1d3047;
        border-radius: 9px;
        background: #0d1725;
        color: #dce8f5;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }

      #v2-mobile-menu-button:active {
        transform: scale(.97);
      }

      #v2-mobile-backdrop {
        display: none;
      }

      @media (max-width: 760px) {

        #v2-mobile-menu-button {
          display: grid;
          place-items: center;
        }

        .sidebar {
          display: flex !important;
          position: fixed;
          z-index: 10000;

          top: 0;
          left: 0;
          bottom: 0;

          width: min(300px, 78vw);
          max-width: 300px;

          padding: 16px 10px;
          margin: 0;

          transform: translate3d(-105%, 0, 0);
          transition: transform .22s ease;

          box-shadow: 18px 0 45px rgba(0,0,0,.45);

          overflow-y: auto;
          overflow-x: hidden;

          overscroll-behavior: contain;

          -webkit-overflow-scrolling: touch;

          touch-action: pan-y;
        }

        .sidebar.v2-mobile-open {
          transform: translate3d(0, 0, 0);
        }

        #v2-mobile-backdrop.v2-mobile-open {
          display: block;

          position: fixed;
          z-index: 9999;

          inset: 0;

          background: rgba(0,0,0,.58);
        }

        .sidebar nav {
          display: flex;
          flex-direction: column;
          gap: 5px;
          flex: 1;
        }

        .sidebar nav a {
          min-height: 48px;
          width: 100%;

          flex-direction: row;
          justify-content: flex-start;

          gap: 12px;
          padding: 0 14px;

          font-size: 13px;
          border-radius: 9px;

          touch-action: manipulation;

          -webkit-tap-highlight-color: transparent;
        }

        .sidebar nav a span {
          font-size: 13px;
        }

        .sidebar-footer {
          margin-top: auto;
          padding-top: 14px;
        }

        .topbar {
          grid-template-columns: auto 1fr auto;
          align-items: center;
        }

        .mobile-brand {
          min-width: 0;
        }

        .mobile-brand strong {
          white-space: nowrap;
          font-size: 12px;
        }
      }

      @media (max-width: 420px) {

        #v2-mobile-menu-button {
          width: 38px;
          height: 38px;
          flex-basis: 38px;
        }

        .mobile-brand strong {
          display: none;
        }

        .sidebar {
          width: min(300px, 82vw);
        }
      }
    `;

    document.head.appendChild(style);

    topbar.insertBefore(button, topbar.firstChild);

    function openMenu() {
      sidebar.classList.add("v2-mobile-open");
      backdrop.classList.add("v2-mobile-open");

      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-label", "Close navigation");

      button.innerHTML = "×";

      document.body.style.overflow = "hidden";
    }

    function closeMenu() {
      sidebar.classList.remove("v2-mobile-open");
      backdrop.classList.remove("v2-mobile-open");

      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open navigation");

      button.innerHTML = "☰";

      document.body.style.overflow = "";
    }

    button.addEventListener("click", () => {
      sidebar.classList.contains("v2-mobile-open")
        ? closeMenu()
        : openMenu();
    });

    backdrop.addEventListener("click", closeMenu);

    sidebar.querySelectorAll("nav a").forEach(link => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 760) {
          setTimeout(closeMenu, 80);
        }
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) {
        closeMenu();
      }
    });

    console.info(
      "[TradeMind V2] Step 10.4A mobile navigation ready."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initMobileNavigation,
      { once: true }
    );
  } else {
    initMobileNavigation();
  }
})();

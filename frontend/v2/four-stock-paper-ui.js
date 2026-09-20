/*
 * Phase 11 — Four-Stock Paper Session UI Adapter
 * UI-only orchestration. No strategy changes.
 * Stop pauses UI-triggered polling and preserves saved evidence.
 * An in-flight request cannot be cancelled by this UI pause.
 */

(async function initFourStockPaperUI() {
  "use strict";

  const UI_KEY = "trademind_a11_multi_stock_paper_ui_v1";

  const IDS = {
    status: "four-stock-paper-status",
    universe: "four-stock-paper-universe",
    prepare: "four-stock-paper-prepare",
    resume: "four-stock-paper-resume",
    step: "four-stock-paper-step",
    stop: "four-stock-paper-stop",
    message: "four-stock-paper-message",
    evidence: "four-stock-paper-evidence"
  };

  const el = Object.fromEntries(
    Object.entries(IDS).map(([key, id]) => [key, document.getElementById(id)])
  );

  if (Object.values(el).some(node => !node)) {
    console.warn("[FourStockUI] Panel elements missing; adapter not initialized.");
    return;
  }

  let controller;
  let busy = false;
  let paused = true;
  let hasSavedSession = false;

  function setMessage(message) {
    el.message.textContent = message;
  }

  function savePauseState() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ paused: true }));
    } catch (error) {
      console.warn("[FourStockUI] Could not persist pause state:", error);
    }
  }

  function saveActiveState() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ paused: false }));
    } catch (error) {
      console.warn("[FourStockUI] Could not persist UI state:", error);
    }
  }

  function validUniverse(snapshot) {
    const instruments = snapshot?.sessionUniverse?.instruments;
    if (!Array.isArray(instruments) || instruments.length !== 4) return false;

    const symbols = instruments.map(item =>
      typeof item === "string" ? item : item?.symbol
    ).filter(Boolean);

    return symbols.length === 4 &&
      new Set(symbols).size === 4 &&
      symbols.includes("NIFTY 50");
  }

  function render(snapshot) {
    hasSavedSession = Boolean(snapshot);

    const instruments = snapshot?.sessionUniverse?.instruments;
    const universe = Array.isArray(instruments) ? instruments : [];
    const cards = [...el.universe.querySelectorAll("article b")];
    const symbols = universe.map(item =>
      typeof item === "string" ? item : item?.symbol
    );

    cards.forEach((card, index) => {
      card.textContent = symbols[index] ||
        (index === 0 ? "NIFTY 50" : "Awaiting PMSE");
    });

    if (!snapshot) {
      el.status.textContent = "NOT STARTED";
      el.evidence.hidden = true;
    } else {
      el.status.textContent = paused ? "PAUSED" :
        validUniverse(snapshot) ? "PREPARED" : "NOT READY";
      el.evidence.textContent = JSON.stringify(snapshot, null, 2);
      el.evidence.hidden = false;
    }

    el.prepare.disabled = busy || hasSavedSession;
    el.resume.disabled = busy || !hasSavedSession || !validUniverse(snapshot) || !paused;
    el.step.disabled = busy || paused || !validUniverse(snapshot);
    el.stop.disabled = busy || paused || !hasSavedSession;
  }

  function refresh() {
    render(controller.getSessionSnapshot());
  }

  function setBusy(value) {
    busy = value;
    refresh();
  }

  try {
    const module = await import("./multi-stock-paper-session.js");
    controller = window.TradeMindMultiStockPaper || module;

    if (
      typeof controller.startSession !== "function" ||
      typeof controller.pollSession !== "function" ||
      typeof controller.getSessionSnapshot !== "function"
    ) {
      throw new Error("Multi-stock controller API is incomplete.");
    }

    el.prepare.addEventListener("click", async () => {
      if (busy || controller.getSessionSnapshot()) return;

      setBusy(true);
      setMessage("Preparing and validating a new four-stock universe…");

      try {
        await controller.startSession();
        paused = true;
        savePauseState();
        refresh();
        setMessage("New universe prepared and paused. Press Resume Saved Session when ready.");
      } catch (error) {
        setMessage(`Prepare failed: ${error.message}`);
      } finally {
        setBusy(false);
      }
    });

    el.resume.addEventListener("click", () => {
      if (busy) return;

      const snapshot = controller.getSessionSnapshot();
      if (!validUniverse(snapshot)) {
        paused = true;
        savePauseState();
        refresh();
        setMessage("Resume blocked: saved session does not contain four unique instruments including NIFTY 50.");
        return;
      }

      paused = false;
      saveActiveState();
      refresh();
      setMessage("UI resumed. Run one paper step when ready.");
    });

    el.step.addEventListener("click", async () => {
      if (busy || paused) return;

      const snapshot = controller.getSessionSnapshot();
      if (!validUniverse(snapshot)) {
        paused = true;
        savePauseState();
        refresh();
        setMessage("Paper step blocked: saved four-stock universe validation failed.");
        return;
      }

      setBusy(true);
      setMessage("Running one manually requested paper step…");

      try {
        await controller.pollSession();
        refresh();
        setMessage("Paper step returned. Review saved evidence before continuing.");
      } catch (error) {
        setMessage(`Paper step failed: ${error.message}`);
      } finally {
        setBusy(false);
      }
    });

    el.stop.addEventListener("click", () => {
      paused = true;
      savePauseState();
      refresh();
      setMessage("UI paused. Saved session and evidence are retained. Any in-flight request may still finish.");
    });

    // Reloads always require an explicit Resume click.
    const saved = controller.getSessionSnapshot();
    paused = true;
    savePauseState();
    render(saved);

    setMessage(saved
      ? "Saved session restored in paused mode. Press Resume Saved Session to continue."
      : "No four-stock session prepared.");

    console.info("[FourStockUI] Adapter initialized; no session was started.");
  } catch (error) {
    el.prepare.disabled = true;
    el.resume.disabled = true;
    el.step.disabled = true;
    el.stop.disabled = true;
    setMessage(`Four-stock adapter unavailable: ${error.message}`);
    console.error("[FourStockUI] Initialization failed:", error);
  }
})();

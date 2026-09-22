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
    telemetry: "four-stock-paper-telemetry",
    universe: "four-stock-paper-universe",
    prepare: "four-stock-paper-prepare",
    resume: "four-stock-paper-resume",
    step: "four-stock-paper-step",
    stop: "four-stock-paper-stop",
    download: "four-stock-paper-download",
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

  function isTodaySession(snapshot) {
    const todayIST = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    return Boolean(snapshot && snapshot.sessionDate === todayIST);
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


function renderTelemetry(snapshot) {
  const container = el.telemetry;
  if (!container) return;

  container.replaceChildren();

  const stocks = snapshot?.state?.stocks || {};
  const instruments = snapshot?.sessionUniverse?.instruments;
  const symbols = Array.isArray(instruments)
    ? instruments.map(item =>
        typeof item === "string" ? item : item?.symbol
      ).filter(Boolean)
    : Object.keys(stocks);

  const forward =
    snapshot?.lastStep?.forward ||
    snapshot?.lastStep?.session?.forward ||
    null;

  const forwardResults = Array.isArray(forward?.results)
    ? forward.results
    : [];

  // Direct per-instrument coordinator results (poll status).
  const forwardStatusBySymbol = new Map();

  for (const result of forwardResults) {
    if (result?.symbol && result?.status) {
      forwardStatusBySymbol.set(result.symbol, result.status);
    }
  }

  const latestBySymbol = new Map();

  for (const item of forwardResults) {
    const runner = item?.runner;
    const results = Array.isArray(runner?.results)
      ? runner.results
      : [];

    for (const result of results) {
      if (result?.symbol) {
        latestBySymbol.set(result.symbol, result);
      }
    }
  }

  function addCard(title, value) {
    const article = document.createElement("article");
    const label = document.createElement("span");
    const body = document.createElement("b");

    label.textContent = title;
    body.textContent = String(value);

    article.append(label, body);
    container.append(article);
  }

  addCard("Mode", "PAPER ONLY");
  addCard(
    "Last Poll",
    snapshot?.lastStep ? "Recorded" : "Not recorded"
  );

  for (const symbol of symbols) {
    const stock = stocks[symbol] || {};
    const opportunity = stock.opportunity || {};
    const position = stock.position || {};
    const latest = latestBySymbol.get(symbol);

    const signal =
      latest?.signal ?? opportunity.signal ?? "Not recorded";

    const entry =
      latest?.entry?.status ?? "Not recorded";

    const outcome =
      latest?.outcome?.status ??
      stock.outcome?.status ??
      "Not recorded";

    const funnel =
      opportunity.lifecycleState ?? "NOT_REACHED";

    const activePosition = position.active
      ? `${position.side || "Active"} @ ${position.entry ?? "N/A"}`
      : "None";

    const heading = document.createElement("h4");
    heading.textContent = symbol;
    container.append(heading);

    addCard(
      `${symbol} — Forward Status`,
      forwardStatusBySymbol.get(symbol) || "Not recorded"
    );

    addCard(`${symbol} — Signal`, signal);
    addCard(`${symbol} — Entry`, entry);
    addCard(`${symbol} — Outcome`, outcome);
    addCard(`${symbol} — Funnel`, funnel);
    addCard(`${symbol} — Active Position`, activePosition);

    addCard(
      `${symbol} — Paper Entries`,
      "Historical count unavailable"
    );

    addCard(
      `${symbol} — Completed`,
      "Count unavailable"
    );

    addCard(
      `${symbol} — Executable`,
      !latest
        ? "Not recorded"
        : entry === "ENTRY_ACCEPTED"
          ? "Accepted"
          : entry === "NO_ENTRY"
            ? "No entry"
            : entry
    );

    addCard(`${symbol} — Lifecycle`, funnel);
  }

  if (!symbols.length) {
    addCard("Telemetry", "Awaiting saved session evidence");
  }
}

function render(snapshot) {
  renderTelemetry(snapshot);
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

    const todaySession = isTodaySession(snapshot);
    const todayValidUniverse = todaySession && validUniverse(snapshot);

    if (!snapshot) {
      el.status.textContent = "NOT STARTED";
      el.evidence.hidden = true;
      el.download.disabled = true;
    } else {
      el.status.textContent = !todaySession ? "STALE — PREPARE NEW SESSION" :
        paused ? "PAUSED" :
        validUniverse(snapshot) ? "PREPARED" : "NOT READY";
      // Keep the large JSON evidence hidden; Download JSON remains available.
      el.evidence.hidden = true;
      el.download.disabled = busy;
    }

    el.prepare.disabled = busy || todaySession;
    el.resume.disabled = busy || !todayValidUniverse || !paused;
    el.step.disabled = busy || paused || !todayValidUniverse;
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
      if (busy || isTodaySession(controller.getSessionSnapshot())) return;

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
      if (!isTodaySession(snapshot) || !validUniverse(snapshot)) {
        paused = true;
        savePauseState();
        refresh();
        setMessage("Resume blocked: session is stale or does not contain four unique instruments including NIFTY 50. Prepare a new session.");
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
      if (!isTodaySession(snapshot) || !validUniverse(snapshot)) {
        paused = true;
        savePauseState();
        refresh();
        setMessage("Paper step blocked: session is stale or the four-stock universe is invalid. Prepare a new session.");
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

    el.download.addEventListener("click", () => {
      if (busy) return;

      const snapshot = controller.getSessionSnapshot();
      if (!snapshot) {
        el.download.disabled = true;
        setMessage("Download unavailable: no saved session exists.");
        return;
      }

      const sessionDate = String(snapshot.sessionDate || "unknown")
        .replace(/[^a-zA-Z0-9_-]/g, "-");
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, "-");

      const blob = new Blob(
        [JSON.stringify(snapshot, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `trademind-four-stock-session-${sessionDate}-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage("Saved session JSON export requested. Session data was not changed.");
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

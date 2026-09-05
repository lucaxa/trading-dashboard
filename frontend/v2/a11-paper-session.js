/*
===========================================================
 TradeMind Pro — A11 Frontend Paper Session Recorder V1
 ----------------------------------------------------------
 FRONTEND EVIDENCE / CONVENIENCE LAYER ONLY

 - Consumes existing /api/live-signal and /api/candles.
 - Does NOT reproduce or modify strategy signal logic.
 - Does NOT modify Phase 11 backend state.
 - PAPER ONLY. No broker / real orders.
 - Learning, optimization, mutation and promotion remain off.
 - Stores session evidence in browser localStorage.
 - Downloads the recorded session as JSON.

 Frozen execution contract:
 - ATR period: 14
 - Stop: 1.5 ATR
 - Reward: 2R
 - Max entry gap: 0.25 ATR
 - Entry: next same-session 5m candle OPEN
 - Entry window: 09:20 through 15:00 IST
 - Session close: 15:25 IST at candle CLOSE
 - Cooldown: 3 candles after a closed trade
===========================================================
*/
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    instrument: "NIFTY 50",
    interval: "5minute",
    atrPeriod: 14,
    atrStopMultiplier: 1.5,
    riskReward: 2,
    maxEntryGapATR: 0.25,
    entryStartMinutes: 9 * 60 + 20,
    entryEndMinutes: 15 * 60,
    sessionCloseMinutes: 15 * 60 + 25,
    cooldownCandles: 3,
    pollMs: 30000,
    storageKey: "trademind_a11_paper_session_v1"
  });

  const runtime = {
    session: null,
    running: false,
    busy: false,
    timer: null,
    lastPollAt: null,
    lastError: null,
    lastCompletedCandleTs: null,
    lastSignalCandleTs: null,
    cooldown: 0,
    cooldownLastProcessedTs: null,
    activePosition: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function timestampMs(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function iso(value) {
    const ms = timestampMs(value);
    return ms === null ? null : new Date(ms).toISOString();
  }

  function istParts(value) {
    const ms = timestampMs(value);
    if (ms === null) return null;

    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(ms));

    const result = {};
    for (const part of parts) {
      if (part.type !== "literal") result[part.type] = Number(part.value);
    }
    return result;
  }

  function sessionDate(value) {
    const p = istParts(value);
    if (!p) return null;

    return [
      p.year,
      String(p.month).padStart(2, "0"),
      String(p.day).padStart(2, "0")
    ].join("-");
  }

  function minutesIST(value) {
    const p = istParts(value);
    return p ? p.hour * 60 + p.minute : null;
  }

  function sameSession(a, b) {
    return sessionDate(a) !== null && sessionDate(a) === sessionDate(b);
  }

  function isCompletedCandle(candle, now = Date.now()) {
    return Boolean(
      candle &&
      Number.isFinite(candle.ts) &&
      candle.ts + 5 * 60 * 1000 <= now
    );
  }

  function normalizeCandle(raw) {
    if (!raw || typeof raw !== "object") return null;

    const ts = timestampMs(raw.ts ?? raw.timestamp ?? raw.time);
    const open = numberOrNull(raw.open ?? raw.o);
    const high = numberOrNull(raw.high ?? raw.h);
    const low = numberOrNull(raw.low ?? raw.l);
    const close = numberOrNull(raw.close ?? raw.c);
    const volume = numberOrNull(raw.volume ?? raw.v) ?? 0;

    if (
      ts === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      return null;
    }

    return { ts, open, high, low, close, volume };
  }

  function extractCandles(result) {
    if (!result || typeof result !== "object") return [];

    const root =
      result.data && typeof result.data === "object"
        ? result.data
        : result;

    const nifty =
      root["NIDX_40000001"] ||
      root["NIDX:40000001"] ||
      root["40000001"] ||
      root.nifty ||
      root.NIFTY ||
      null;

    let rawCandles = Array.isArray(nifty?.candles)
      ? nifty.candles
      : Array.isArray(nifty)
        ? nifty
        : [];

    if (!rawCandles.length && Array.isArray(root)) {
      rawCandles = root;
    }

    const unique = new Map();

    rawCandles
      .map(normalizeCandle)
      .filter(Boolean)
      .forEach(c => unique.set(c.ts, c));

    return [...unique.values()].sort((a, b) => a.ts - b.ts);
  }

  function extractSignal(result) {
    const root =
      result?.data &&
      typeof result.data === "object" &&
      !Array.isArray(result.data)
        ? result.data
        : result;

    const signal = String(root?.signal ?? "WAIT").toUpperCase();
    const signalCandle = normalizeCandle(
      root?.signalCandle || root?.candle
    );

    const signalTimestamp = timestampMs(
      root?.data?.signalTimestamp ??
      root?.signalTimestamp ??
      root?.signalTime ??
      signalCandle?.ts
    );

    const referenceRisk = root?.referenceRisk || {};

    return {
      value: signal,
      signalTimestamp,
      signalCandle,
      strategy: root?.strategy ?? null,
      version: root?.version ?? null,
      mode: root?.mode ?? null,
      status: root?.status ?? null,
      risk: numberOrNull(referenceRisk.risk),
      referenceEntry: numberOrNull(referenceRisk.entry),
      referenceStop: numberOrNull(referenceRisk.stop),
      referenceTarget: numberOrNull(referenceRisk.target),
      rewardRisk: numberOrNull(referenceRisk.rewardRisk),
      indicators: root?.indicators || null
    };
  }

  async function getJSON(url) {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      }
    });

    const text = await response.text();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(
        `Invalid JSON from ${url} (HTTP ${response.status})`
      );
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }

    if (result?.success === false) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "API returned success=false"
      );
    }

    return result;
  }

  async function fetchLiveSignal() {
    return extractSignal(
      await getJSON(`/api/live-signal?_a11=${Date.now()}`)
    );
  }

  async function fetchCandles() {
    const result = await getJSON(
      `/api/candles?interval=5minute&_a11=${Date.now()}`
    );

    const candles = extractCandles(result);

    if (!candles.length) {
      throw new Error("No NIFTY 5-minute candles returned");
    }

    return candles;
  }

  function makeId(prefix, timestamp) {
    return `${prefix}:${timestamp}`;
  }

  function createSession() {
    return {
      schema: "TRADEMIND_A11_FRONTEND_PAPER_SESSION_V1",
      sessionId: `A11-FE-${Date.now()}`,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      status: "RUNNING",

      source: "LIVE_MARKET",
      instrument: CONFIG.instrument,
      interval: CONFIG.interval,

      executionContract: {
        atrPeriod: CONFIG.atrPeriod,
        atrStopMultiplier: CONFIG.atrStopMultiplier,
        riskReward: CONFIG.riskReward,
        maxEntryGapATR: CONFIG.maxEntryGapATR,
        entryRule: "NEXT_SAME_SESSION_5M_CANDLE_OPEN",
        entryWindowIST: "09:20-15:00",
        sessionCloseIST: "15:25_CANDLE_CLOSE",
        cooldownCandles: CONFIG.cooldownCandles
      },

      safety: {
        paperOnly: true,
        realOrders: false,
        brokerOrderEnabled: false,
        learningEnabled: false,
        strategyMutation: false,
        optimizationEnabled: false,
        promotionEnabled: false,
        frontendIsNotStrategyAuthority: true
      },

      observations: [],
      trades: [],
      rejectedSignals: [],
      errors: [],

      counters: {
        polls: 0,
        signalEvents: 0,
        waitSignals: 0,
        executableSignals: 0,
        paperEntries: 0,
        completedTrades: 0,
        stoppedTrades: 0,
        targetTrades: 0,
        sessionClosedTrades: 0,
        entryGapRejected: 0,
        entryWindowRejected: 0,
        cooldownRejected: 0,
        overlappingSignals: 0
      },

      runtime: {
        activePosition: null,
        cooldown: 0,
        cooldownLastProcessedTs: null,
        lastSignalCandleTs: null,
        lastCompletedCandleTs: null
      }
    };
  }

  function persist() {
    if (!runtime.session) return;

    runtime.session.runtime = {
      activePosition: runtime.activePosition,
      cooldown: runtime.cooldown,
      cooldownLastProcessedTs: runtime.cooldownLastProcessedTs,
      lastSignalCandleTs: runtime.lastSignalCandleTs,
      lastCompletedCandleTs: runtime.lastCompletedCandleTs
    };

    localStorage.setItem(
      CONFIG.storageKey,
      JSON.stringify(runtime.session)
    );
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return null;

      const session = JSON.parse(raw);

      if (
        session?.schema !==
        "TRADEMIND_A11_FRONTEND_PAPER_SESSION_V1"
      ) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  function restoreSession() {
    const session = loadSession();
    if (!session) return;

    runtime.session = session;

    const saved = session.runtime || {};

    runtime.activePosition =
      saved.activePosition || null;

    runtime.cooldown =
      Number(saved.cooldown) || 0;

    runtime.cooldownLastProcessedTs =
      saved.cooldownLastProcessedTs ?? null;

    runtime.lastSignalCandleTs =
      saved.lastSignalCandleTs ?? null;

    runtime.lastCompletedCandleTs =
      saved.lastCompletedCandleTs ?? null;

    runtime.running =
      session.status === "RUNNING";

    if (runtime.running) {
      runtime.timer = setInterval(
        poll,
        CONFIG.pollMs
      );
      poll();
    }
  }

  function recordError(message) {
    runtime.lastError = String(message);

    if (runtime.session) {
      runtime.session.errors.push({
        timestamp: new Date().toISOString(),
        message: String(message)
      });

      runtime.session.errors =
        runtime.session.errors.slice(-50);

      persist();
    }

    render();
  }

  function latestCompletedCandle(candles) {
    for (let i = candles.length - 1; i >= 0; i--) {
      if (isCompletedCandle(candles[i])) {
        return candles[i];
      }
    }

    return null;
  }

  function findNextSameSessionCandle(
    candles,
    signalCandle
  ) {
    if (!signalCandle) return null;

    return (
      candles.find(
        c =>
          c.ts > signalCandle.ts &&
          sameSession(c.ts, signalCandle.ts) &&
          isCompletedCandle(c)
      ) || null
    );
  }

  function recordObservation(signal) {
    const signalCandle = signal.signalCandle;

    if (!signalCandle) {
      throw new Error(
        "Live signal did not provide a signal candle"
      );
    }

    if (!isCompletedCandle(signalCandle)) {
      throw new Error(
        "Live signal candle is not completed; fail closed"
      );
    }

    if (
      signal.mode &&
      signal.mode !== "PAPER_ONLY"
    ) {
      throw new Error(
        `Unsafe live-signal mode: ${signal.mode}`
      );
    }

    if (
      !["WAIT", "BUY", "SELL"].includes(signal.value)
    ) {
      throw new Error(
        `Unsupported signal: ${signal.value}`
      );
    }

    const existing =
      runtime.session.observations.find(
        observation =>
          timestampMs(
            observation.signalCandleTimestamp
          ) === signalCandle.ts
      );

    if (existing) {
      existing.heartbeatCount =
        (existing.heartbeatCount || 0) + 1;

      existing.lastObservedAt =
        new Date().toISOString();

      return {
        observation: existing,
        isNew: false
      };
    }

    const observation = {
      opportunityId:
        signal.value === "WAIT"
          ? null
          : makeId(
              `A11-OPP:NIFTY50:5M:${signal.value}`,
              signalCandle.ts
            ),

      signalEventId:
        signal.value === "WAIT"
          ? null
          : makeId(
              `A11-SIGNAL:NIFTY50:5M:${signal.value}`,
              signalCandle.ts
            ),

      instrument: CONFIG.instrument,
      timeframe: CONFIG.interval,
      sessionDate: sessionDate(signalCandle.ts),

      signal: signal.value,

      signalTimestamp:
        iso(signal.signalTimestamp ?? signalCandle.ts),

      signalCandleTimestamp:
        iso(signalCandle.ts),

      signalCandle: {
        ...signalCandle
      },

      completedCandle: true,

      observedAt:
        new Date().toISOString(),

      lastObservedAt:
        new Date().toISOString(),

      heartbeatCount: 0,

      nextCandleTimestamp: null,
      nextCandleOpen: null,

      lifecycle:
        signal.value === "WAIT"
          ? "NOT_REACHED"
          : "NOT_REACHED",

      paperDecision:
        signal.value === "BUY"
          ? "ENTER_LONG"
          : signal.value === "SELL"
            ? "ENTER_SHORT"
            : "NO_TRADE",

      referenceRisk: {
        risk: signal.risk,
        entry: signal.referenceEntry,
        stop: signal.referenceStop,
        target: signal.referenceTarget,
        rewardRisk: signal.rewardRisk
      },

      strategy: signal.strategy,
      executableVersion: signal.version,
      mode: signal.mode,

      notes: []
    };

    runtime.session.observations.push(
      observation
    );

    runtime.session.counters.signalEvents++;

    if (signal.value === "WAIT") {
      runtime.session.counters.waitSignals++;
    } else {
      runtime.session.counters.executableSignals++;
    }

    runtime.session.observations =
      runtime.session.observations.slice(-500);

    runtime.lastSignalCandleTs =
      signalCandle.ts;

    return {
      observation,
      isNew: true
    };
  }

  function closePosition(
    position,
    exitCandle,
    exitPrice,
    outcome
  ) {
    const pnlPoints =
      position.side === "BUY"
        ? exitPrice - position.entryPrice
        : position.entryPrice - exitPrice;

    const r =
      position.risk > 0
        ? pnlPoints / position.risk
        : null;

    runtime.session.trades.push({
      tradeId: position.tradeId,
      opportunityId: position.opportunityId,

      side: position.side,

      signalTimestamp:
        position.signalTimestamp,

      signalCandleTimestamp:
        position.signalCandleTimestamp,

      entryTimestamp:
        position.entryTimestamp,

      entryPrice:
        position.entryPrice,

      atr14:
        position.atr14,

      risk:
        position.risk,

      stop:
        position.stop,

      target:
        position.target,

      actualEntryGapATR:
        position.actualEntryGapATR,

      exitTimestamp:
        iso(exitCandle.ts),

      exitPrice,

      outcome,

      pnlPoints,
      r,

      sessionDate:
        position.sessionDate
    });

    runtime.session.counters.completedTrades++;

    if (outcome.includes("STOP")) {
      runtime.session.counters.stoppedTrades++;
    }

    if (outcome.includes("TARGET")) {
      runtime.session.counters.targetTrades++;
    }

    if (outcome === "SESSION CLOSE") {
      runtime.session.counters.sessionClosedTrades++;
    }

    runtime.activePosition = null;

    runtime.cooldown =
      CONFIG.cooldownCandles;

    runtime.cooldownLastProcessedTs =
      exitCandle.ts;
  }

  function evaluatePosition(
    position,
    candle
  ) {
    if (!position) return false;

    if (!isCompletedCandle(candle)) {
      return false;
    }

    if (candle.ts <= position.entryTs) {
      return false;
    }

    if (!sameSession(
      candle.ts,
      position.entryTs
    )) {
      return false;
    }

    if (position.side === "BUY") {
      if (candle.open <= position.stop) {
        closePosition(
          position,
          candle,
          candle.open,
          "STOP LOSS - GAP"
        );
        return true;
      }

      if (candle.open >= position.target) {
        closePosition(
          position,
          candle,
          candle.open,
          "TARGET - GAP"
        );
        return true;
      }

      if (candle.low <= position.stop) {
        closePosition(
          position,
          candle,
          position.stop,
          "STOP LOSS"
        );
        return true;
      }

      if (candle.high >= position.target) {
        closePosition(
          position,
          candle,
          position.target,
          "TARGET"
        );
        return true;
      }
    }

    if (position.side === "SELL") {
      if (candle.open >= position.stop) {
        closePosition(
          position,
          candle,
          candle.open,
          "STOP LOSS - GAP"
        );
        return true;
      }

      if (candle.open <= position.target) {
        closePosition(
          position,
          candle,
          candle.open,
          "TARGET - GAP"
        );
        return true;
      }

      if (candle.high >= position.stop) {
        closePosition(
          position,
          candle,
          position.stop,
          "STOP LOSS"
        );
        return true;
      }

      if (candle.low <= position.target) {
        closePosition(
          position,
          candle,
          position.target,
          "TARGET"
        );
        return true;
      }
    }

    if (
      minutesIST(candle.ts) >=
      CONFIG.sessionCloseMinutes
    ) {
      closePosition(
        position,
        candle,
        candle.close,
        "SESSION CLOSE"
      );
      return true;
    }

    return false;
  }

  function evaluateActivePosition(candles) {
    if (!runtime.activePosition) return;

    const position =
      runtime.activePosition;

    const relevant =
      candles
        .filter(
          c =>
            c.ts > position.entryTs &&
            sameSession(
              c.ts,
              position.entryTs
            ) &&
            isCompletedCandle(c)
        )
        .sort(
          (a, b) => a.ts - b.ts
        );

    for (const candle of relevant) {
      if (
        evaluatePosition(
          position,
          candle
        )
      ) {
        break;
      }
    }
  }

  function advanceCooldown(latestCandle) {
    if (
      !latestCandle ||
      runtime.cooldown <= 0
    ) {
      return;
    }

    if (
      runtime.cooldownLastProcessedTs ===
      null
    ) {
      runtime.cooldownLastProcessedTs =
        latestCandle.ts;
      return;
    }

    if (
      latestCandle.ts >
      runtime.cooldownLastProcessedTs
    ) {
      runtime.cooldown--;

      runtime.cooldownLastProcessedTs =
        latestCandle.ts;
    }
  }

  function createPaperEntry(
    observation,
    signal,
    candles
  ) {
    if (
      signal.value !== "BUY" &&
      signal.value !== "SELL"
    ) {
      return;
    }

    if (runtime.activePosition) {
      observation.lifecycle =
        "BLOCKED_LIFECYCLE";

      observation.notes.push(
        "Existing paper position is active; overlapping entry not created."
      );

      runtime.session.counters.overlappingSignals++;
      return;
    }

    if (runtime.cooldown > 0) {
      observation.lifecycle =
        "BLOCKED_LIFECYCLE";

      observation.notes.push(
        `Cooldown active: ${runtime.cooldown} candle(s) remaining.`
      );

      runtime.session.counters.cooldownRejected++;
      return;
    }

    const signalMinutes =
      minutesIST(
        observation.signalCandle.ts
      );

    if (
      signalMinutes === null ||
      signalMinutes <
        CONFIG.entryStartMinutes ||
      signalMinutes >
        CONFIG.entryEndMinutes
    ) {
      observation.lifecycle =
        "BLOCKED_ENTRY_WINDOW";

      runtime.session.counters.entryWindowRejected++;
      return;
    }

    const next =
      findNextSameSessionCandle(
        candles,
        observation.signalCandle
      );

    if (!next) {
      observation.lifecycle =
        "NOT_REACHED";

      observation.notes.push(
        "Next same-session completed candle is not available yet."
      );

      return;
    }

    if (
      signal.risk === null ||
      signal.risk <= 0
    ) {
      observation.lifecycle =
        "INSUFFICIENT_CONTEXT";

      observation.notes.push(
        "Authoritative reference risk is unavailable; entry not created."
      );

      return;
    }

    const atr14 =
      signal.risk /
      CONFIG.atrStopMultiplier;

    if (
      !Number.isFinite(atr14) ||
      atr14 <= 0
    ) {
      observation.lifecycle =
        "INSUFFICIENT_CONTEXT";

      observation.notes.push(
        "ATR derived from authoritative risk is invalid."
      );

      return;
    }

    const entry =
      next.open;

    const signalClose =
      observation.signalCandle.close;

    const actualEntryGapATR =
      (entry - signalClose) /
      atr14;

    observation.nextCandleTimestamp =
      iso(next.ts);

    observation.nextCandleOpen =
      entry;

    if (
      Math.abs(actualEntryGapATR) >
      CONFIG.maxEntryGapATR
    ) {
      observation.lifecycle =
        "BLOCKED_LIFECYCLE";

      observation.notes.push(
        `Actual entry gap ${actualEntryGapATR.toFixed(6)} ATR exceeds ${CONFIG.maxEntryGapATR} ATR.`
      );

      runtime.session.counters.entryGapRejected++;

      runtime.session.rejectedSignals.push({
        opportunityId:
          observation.opportunityId,

        signalTimestamp:
          observation.signalTimestamp,

        signalCandleTimestamp:
          observation.signalCandleTimestamp,

        reason:
          "ENTRY_GAP_REJECTED",

        actualEntryGapATR,

        maxEntryGapATR:
          CONFIG.maxEntryGapATR
      });

      return;
    }

    const risk =
      atr14 *
      CONFIG.atrStopMultiplier;

    const reward =
      risk *
      CONFIG.riskReward;

    const side =
      signal.value;

    const stop =
      side === "BUY"
        ? entry - risk
        : entry + risk;

    const target =
      side === "BUY"
        ? entry + reward
        : entry - reward;

    observation.lifecycle =
      "ACCEPTED";

    observation.paperDecision =
      side === "BUY"
        ? "ENTER_LONG"
        : "ENTER_SHORT";

    runtime.activePosition = {
      tradeId:
        makeId(
          `A11-PAPER:${side}`,
          next.ts
        ),

      opportunityId:
        observation.opportunityId,

      side,

      signalTimestamp:
        observation.signalTimestamp,

      signalCandleTimestamp:
        observation.signalCandleTimestamp,

      entryTimestamp:
        iso(next.ts),

      entryTs:
        next.ts,

      entryPrice:
        entry,

      atr14,

      risk,

      reward,

      stop,

      target,

      actualEntryGapATR,

      sessionDate:
        sessionDate(next.ts)
    };

    runtime.session.counters.paperEntries++;
  }

  function processSignal(
    signal,
    candles
  ) {
    const result =
      recordObservation(signal);

    if (
      result.isNew &&
      (
        signal.value === "BUY" ||
        signal.value === "SELL"
      )
    ) {
      createPaperEntry(
        result.observation,
        signal,
        candles
      );
    }
  }

  async function poll() {
    if (
      !runtime.running ||
      runtime.busy
    ) {
      return;
    }

    runtime.busy = true;
    runtime.lastPollAt =
      new Date().toISOString();

    try {
      const [
        signal,
        candles
      ] = await Promise.all([
        fetchLiveSignal(),
        fetchCandles()
      ]);

      runtime.session.counters.polls++;

      const latest =
        latestCompletedCandle(candles);

      if (latest) {
        runtime.lastCompletedCandleTs =
          latest.ts;
      }

      /*
       * Existing paper positions are evaluated first
       * against completed real candles.
       */
      evaluateActivePosition(candles);

      /*
       * Cooldown advances only when a newer completed
       * candle is observed.
       */
      advanceCooldown(latest);

      /*
       * The signal endpoint remains the signal authority.
       * Repeated polling of the same signal candle creates
       * a heartbeat, not another opportunity.
       */
      processSignal(
        signal,
        candles
      );

      runtime.lastError = null;

      persist();
    } catch (error) {
      console.error(
        "[A11 FE] poll failed:",
        error
      );

      recordError(
        error?.message || error
      );
    } finally {
      runtime.busy = false;
      render();
    }
  }

  function startSession() {
    if (runtime.running) return;

    runtime.session =
      createSession();

    runtime.running = true;

    runtime.lastError = null;
    runtime.lastCompletedCandleTs = null;
    runtime.lastSignalCandleTs = null;
    runtime.cooldown = 0;
    runtime.cooldownLastProcessedTs = null;
    runtime.activePosition = null;

    persist();
    render();

    poll();

    runtime.timer =
      setInterval(
        poll,
        CONFIG.pollMs
      );
  }

  function stopSession() {
    if (!runtime.session) return;

    runtime.running = false;

    if (runtime.timer) {
      clearInterval(
        runtime.timer
      );
    }

    runtime.timer = null;

    runtime.session.status =
      "STOPPED";

    runtime.session.stoppedAt =
      new Date().toISOString();

    persist();
    render();
  }

  function downloadSession() {
    if (!runtime.session) return;

    const exported =
      JSON.parse(
        JSON.stringify({
          ...runtime.session,
          exportedAt:
            new Date().toISOString(),
          exportType:
            "FRONTEND_PAPER_SESSION_EVIDENCE"
        })
      );

    delete exported.runtime;

    const blob =
      new Blob(
        [
          JSON.stringify(
            exported,
            null,
            2
          )
        ],
        {
          type:
            "application/json"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href = url;

    anchor.download =
      `${runtime.session.sessionId}.json`;

    document.body.appendChild(
      anchor
    );

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(
      url
    );
  }

  function render() {
    const root =
      document.getElementById(
        "a11-paper-session"
      );

    if (!root) return;

    const session =
      runtime.session;

    const counters =
      session?.counters || {};

    const position =
      runtime.activePosition;

    const status =
      root.querySelector(
        "[data-a11-status]"
      );

    const entries =
      root.querySelector(
        "[data-a11-count]"
      );

    const outcomes =
      root.querySelector(
        "[data-a11-outcomes]"
      );

    const signals =
      root.querySelector(
        "[data-a11-signals]"
      );

    const last =
      root.querySelector(
        "[data-a11-last]"
      );

    const positionNode =
      root.querySelector(
        "[data-a11-position]"
      );

    const errorNode =
      root.querySelector(
        "[data-a11-error]"
      );

    if (status) {
      status.textContent =
        runtime.running
          ? "RUNNING"
          : session?.status ||
            "NOT STARTED";
    }

    if (entries) {
      entries.textContent =
        String(
          counters.paperEntries || 0
        );
    }

    if (outcomes) {
      outcomes.textContent =
        String(
          counters.completedTrades || 0
        );
    }

    if (signals) {
      signals.textContent =
        String(
          counters.signalEvents || 0
        );
    }

    if (last) {
      last.textContent =
        runtime.lastPollAt
          ? `${new Date(runtime.lastPollAt).toLocaleTimeString(
              "en-IN",
              {
                hour12: false,
                timeZone: "Asia/Kolkata"
              }
            )} IST`
          : "--";
    }

    if (positionNode) {
      positionNode.textContent =
        position
          ? `${position.side} @ ${position.entryPrice.toFixed(2)} | SL ${position.stop.toFixed(2)} | TP ${position.target.toFixed(2)}`
          : "No active paper position";
    }

    if (errorNode) {
      errorNode.textContent =
        runtime.lastError || "None";
    }

    const startButton =
      root.querySelector(
        "[data-a11-start]"
      );

    const stopButton =
      root.querySelector(
        "[data-a11-stop]"
      );

    const downloadButton =
      root.querySelector(
        "[data-a11-download]"
      );

    if (startButton) {
      startButton.disabled =
        runtime.running;
    }

    if (stopButton) {
      stopButton.disabled =
        !runtime.running;
    }

    if (downloadButton) {
      downloadButton.disabled =
        !session;
    }
  }

  function installUI() {
    if (
      document.getElementById(
        "a11-paper-session"
      )
    ) {
      return;
    }

    const panel =
      document.querySelector(
        "section.panel.strategy"
      );

    if (!panel) return;

    const box =
      document.createElement(
        "div"
      );

    box.id =
      "a11-paper-session";

    box.innerHTML = `
      <style>
        #a11-paper-session{
          margin-top:14px;
          padding:12px;
          border:1px solid #29415c;
          border-radius:8px;
          background:rgba(5,12,21,.72);
          font-size:9px;
          color:#8fa2b8;
        }

        #a11-paper-session .a11-title{
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:8px;
        }

        #a11-paper-session .a11-title strong{
          color:#dce7f2;
          font-size:10px;
        }

        #a11-paper-session .a11-badge{
          padding:3px 6px;
          border:1px solid #29415c;
          border-radius:999px;
          font-size:7px;
          color:#16e782;
        }

        #a11-paper-session .a11-grid{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:5px 12px;
          margin-bottom:9px;
        }

        #a11-paper-session .a11-grid span{
          display:flex;
          justify-content:space-between;
          gap:6px;
        }

        #a11-paper-session .a11-grid b{
          color:#dce7f2;
          font-weight:600;
        }

        #a11-paper-session .a11-position{
          padding:7px 8px;
          margin-bottom:8px;
          border:1px solid #21364c;
          border-radius:5px;
          color:#aebed0;
        }

        #a11-paper-session .a11-error{
          color:#ff9aa4;
          min-height:12px;
          margin-bottom:8px;
        }

        #a11-paper-session .a11-actions{
          display:flex;
          gap:6px;
          flex-wrap:wrap;
        }

        #a11-paper-session button{
          border:1px solid #29415c;
          background:#0b1724;
          color:#cbd8e6;
          border-radius:5px;
          padding:6px 8px;
          font-size:8px;
          cursor:pointer;
        }

        #a11-paper-session button.primary{
          border-color:#16e782;
          color:#16e782;
        }

        #a11-paper-session button:disabled{
          opacity:.4;
          cursor:not-allowed;
        }

        #a11-paper-session .a11-note{
          margin-top:7px;
          color:#60758e;
          line-height:1.35;
        }
      </style>

      <div class="a11-title">
        <strong>A11 Paper Session</strong>
        <span
          class="a11-badge"
          data-a11-status
        >NOT STARTED</span>
      </div>

      <div class="a11-grid">
        <span>
          Paper Entries
          <b data-a11-count>0</b>
        </span>

        <span>
          Completed
          <b data-a11-outcomes>0</b>
        </span>

        <span>
          Signals
          <b data-a11-signals>0</b>
        </span>

        <span>
          Mode
          <b>PAPER ONLY</b>
        </span>

        <span>
          Last Poll
          <b data-a11-last>--</b>
        </span>
      </div>

      <div
        class="a11-position"
        data-a11-position
      >No active paper position</div>

      <div
        class="a11-error"
        data-a11-error
      >None</div>

      <div class="a11-actions">
        <button
          class="primary"
          data-a11-start
        >Start Session</button>

        <button
          data-a11-stop
        >Stop Session</button>

        <button
          data-a11-download
        >Download JSON</button>
      </div>

      <div class="a11-note">
        Frontend evidence recorder only.
        Existing live signal, strategy,
        learning and broker controls remain
        authoritative and untouched.
      </div>
    `;

    panel.appendChild(box);

    box.querySelector(
      "[data-a11-start]"
    ).addEventListener(
      "click",
      startSession
    );

    box.querySelector(
      "[data-a11-stop]"
    ).addEventListener(
      "click",
      stopSession
    );

    box.querySelector(
      "[data-a11-download]"
    ).addEventListener(
      "click",
      downloadSession
    );

    render();
  }

  function boot() {
    installUI();
    restoreSession();
    render();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  runMultiStockSessionController,
} from "./multi-stock-session-controller-v1.js";

const INSTRUMENTS = [
  {
    symbol: "NIFTY 50",
    instrumentType: "INDEX",
    source: "FIXED_NIFTY",
    securityId: "40000001",
    exchange: "NIDX",
    segment: "INDEX",
  },
  {
    symbol: "LT",
    instrumentType: "EQUITY",
    source: "PMSE",
    securityId: "11483",
    exchange: "NSE",
    segment: "E",
  },
  {
    symbol: "HDFCBANK",
    instrumentType: "EQUITY",
    source: "PMSE",
    securityId: "1333",
    exchange: "NSE",
    segment: "E",
  },
  {
    symbol: "BHARTIARTL",
    instrumentType: "EQUITY",
    source: "PMSE",
    securityId: "10604",
    exchange: "NSE",
    segment: "E",
  },
];

const PMSE_INPUT = {
  status: "READY",
  version: "PMSE-TRADEMIND-INPUT-CONTRACT-V1",
  source: "PMSE",
  mode: "PAPER_ONLY",
  candidates: [
    {
      symbol: "LT",
      score: 57,
      newsRisk: "LOW",
    },
    {
      symbol: "HDFCBANK",
      score: 52,
      newsRisk: "LOW",
    },
    {
      symbol: "BHARTIARTL",
      score: 47,
      newsRisk: "LOW",
    },
  ],
  metadata: {
    researchOnly: true,
    tradeCreated: false,
    brokerCalled: false,
    frontendTouched: false,
  },
};

const NOW_MS = Date.parse("2026-09-14T10:00:00.000Z");

function createTempStatePath() {
  return path.join(
    fs.mkdtempSync(
      path.join(os.tmpdir(), "trademind-multi-stock-session-"),
    ),
    "session.json",
  );
}

function createFetcher() {
  return async ({ symbol }) => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: {
          candles: [
            {
              timestamp: NOW_MS - 10 * 60 * 1000,
              open: 100,
              high: 101,
              low: 99,
              close: 100.5,
              volume: 1000,
            },
            {
              timestamp: NOW_MS - 5 * 60 * 1000,
              open: 100.5,
              high: 101.5,
              low: 100,
              close: 101,
              volume: 1100,
            },
          ],
        },
      };
    },
  });
}

function createUnsafeState() {
  return {
    mode: "PAPER_ONLY",
    researchOnly: true,
    tradingEnabled: true,
    brokerCalled: false,
    orderCreationEnabled: false,
    learningEnabled: false,
    strategyMutation: false,
    optimizationEnabled: false,
    promotionEnabled: false,
  };
}

test("creates a fresh four-stock paper session", async () => {
  const stateFilePath = createTempStatePath();

  const result = await runMultiStockSessionController({
    sessionDate: "2026-09-14",
    pmseInput: PMSE_INPUT,
    resolvedPMSEInstruments: INSTRUMENTS.slice(1),
    accessToken: "test-token",
    nowMs: NOW_MS,
    stateFilePath,
    fetcher: createFetcher(),
  });

  assert.equal(result.version, "A11-MULTI-STOCK-SESSION-CONTROLLER-V1");
  assert.equal(result.status, "READY");
  assert.equal(result.sessionDate, "2026-09-14");
  assert.equal(result.sessionCreated, true);

  assert.equal(
    fs.existsSync(stateFilePath),
    true,
  );

});

test("preserves paper-only safety", async () => {
  const stateFilePath = createTempStatePath();

  const result = await runMultiStockSessionController({
    sessionDate: "2026-09-14",
    pmseInput: PMSE_INPUT,
    resolvedPMSEInstruments: INSTRUMENTS.slice(1),
    accessToken: "test-token",
    nowMs: NOW_MS,
    stateFilePath,
    fetcher: createFetcher(),
  });

  assert.equal(result.safety.mode, "PAPER_ONLY");
  assert.equal(result.safety.researchOnly, true);
  assert.equal(result.safety.tradingEnabled, false);
  assert.equal(result.safety.brokerCalled, false);
  assert.equal(result.safety.orderCreationEnabled, false);
  assert.equal(result.safety.learningEnabled, false);
  assert.equal(result.safety.strategyMutation, false);
  assert.equal(result.safety.optimizationEnabled, false);
  assert.equal(result.safety.promotionEnabled, false);
});

test("persists and reloads an existing session", async () => {
  const stateFilePath = createTempStatePath();

  const first = await runMultiStockSessionController({
    sessionDate: "2026-09-14",
    pmseInput: PMSE_INPUT,
    resolvedPMSEInstruments: INSTRUMENTS.slice(1),
    accessToken: "test-token",
    nowMs: NOW_MS,
    stateFilePath,
    fetcher: createFetcher(),
  });

  assert.equal(first.sessionCreated, true);

  const second = await runMultiStockSessionController({
    sessionDate: "2026-09-14",
    pmseInput: PMSE_INPUT,
    resolvedPMSEInstruments: INSTRUMENTS.slice(1),
    accessToken: "test-token",
    nowMs: NOW_MS,
    stateFilePath,
    fetcher: createFetcher(),
  });

  assert.equal(second.sessionCreated, false);
  assert.equal(second.sessionDate, "2026-09-14");

  const persisted = JSON.parse(
    fs.readFileSync(stateFilePath, "utf8"),
  );

  assert.deepEqual(
    Object.keys(persisted.state.stocks).sort(),
    [
      "BHARTIARTL",
      "HDFCBANK",
      "LT",
      "NIFTY 50",
    ],
  );

  assert.deepEqual(
    Object.keys(second.forward.cursorState.cursors).sort(),
    [
      "BHARTIARTL",
      "HDFCBANK",
      "LT",
      "NIFTY 50",
    ],
  );
});

test("rejects an unsafe state before live processing", async () => {
  const stateFilePath = createTempStatePath();

  const unsafeSession = {
    version: "A11-MULTI-STOCK-SESSION-STATE-V1",
    sessionDate: "2026-09-14",
    instruments: INSTRUMENTS,
    state: createUnsafeState(),
    cursorState: {
      version: "A11-MULTI-STOCK-FORWARD-COORDINATOR-V1",
      cursors: {
        "NIFTY 50": {
          lastProcessedCandleTs: null,
        },
        LT: {
          lastProcessedCandleTs: null,
        },
        HDFCBANK: {
          lastProcessedCandleTs: null,
        },
        BHARTIARTL: {
          lastProcessedCandleTs: null,
        },
      },
    },
  };

  fs.writeFileSync(
    stateFilePath,
    JSON.stringify(unsafeSession, null, 2),
    "utf8",
  );

  await assert.rejects(
    runMultiStockSessionController({
      sessionDate: "2026-09-14",
      pmseInput: PMSE_INPUT,
      resolvedPMSEInstruments: INSTRUMENTS.slice(1),
      accessToken: "test-token",
      nowMs: NOW_MS,
      stateFilePath,
      fetcher: createFetcher(),
    }),
    /Session safety violation/,
  );
});

test("rejects missing access token", async () => {
  const stateFilePath = createTempStatePath();

  await assert.rejects(
    runMultiStockSessionController({
      sessionDate: "2026-09-14",
      pmseInput: PMSE_INPUT,
      resolvedPMSEInstruments: INSTRUMENTS.slice(1),
      accessToken: "",
      nowMs: NOW_MS,
      stateFilePath,
      fetcher: createFetcher(),
    }),
    /INDSTOCKS_TOKEN is required/,
  );
});

test("rejects an incomplete four-stock universe", async () => {
  const stateFilePath = createTempStatePath();

  await assert.rejects(
    runMultiStockSessionController({
      sessionDate: "2026-09-14",
      pmseInput: PMSE_INPUT,
      resolvedPMSEInstruments: INSTRUMENTS.slice(1, 3),
      accessToken: "test-token",
      nowMs: NOW_MS,
      stateFilePath,
      fetcher: createFetcher(),
    }),
    /Expected exactly 4 resolved instruments/,
  );
});
import test from "node:test";
import assert from "node:assert/strict";

import {
  runMultiStockSessionStep,
  VERSION,
  SAFETY,
} from "./multi-stock-session-step-v1.js";

import {
  createMultiStockForwardCursor,
} from "./multi-stock-forward-coordinator-v1.js";

import {
  createMultiStockState,
} from "./multi-stock-state-v1.js";

const PMSE_INPUT = {
  version: "PMSE-TRADEMIND-INPUT-CONTRACT-V1",
  source: "PMSE",
  mode: "PAPER_ONLY",
  candidates: [
    { symbol: "HDFCBANK", score: 72, newsRisk: "LOW" },
    { symbol: "LT", score: 69, newsRisk: "LOW" },
    { symbol: "SBIN", score: 58, newsRisk: "LOW" },
  ],
  metadata: {
    researchOnly: true,
    tradeCreated: false,
    brokerCalled: false,
    frontendTouched: false,
  },
};

const INSTRUMENTS = [
  {
    symbol: "HDFCBANK",
    securityId: "1333",
    exchange: "NSE",
    segment: "E",
  },
  {
    symbol: "LT",
    securityId: "11483",
    exchange: "NSE",
    segment: "E",
  },
  {
    symbol: "SBIN",
    securityId: "3045",
    exchange: "NSE",
    segment: "E",
  },
];

function createState() {
  return createMultiStockState([
    {
      symbol: "NIFTY 50",
    },
    {
      symbol: "HDFCBANK",
    },
    {
      symbol: "LT",
    },
    {
      symbol: "SBIN",
    },
  ]);
}

function createCursorState() {
  return createMultiStockForwardCursor([
    {
      symbol: "NIFTY 50",
    },
    {
      symbol: "HDFCBANK",
    },
    {
      symbol: "LT",
    },
    {
      symbol: "SBIN",
    },
  ]);
}

function createFetcher() {
  const base = 100;

  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: Array.from(
          { length: 5 },
          (_, index) => ({
            ts: 1789446300 + index * 300,
            o: base + index,
            h: base + index + 2,
            l: base + index - 1,
            c: base + index + 1,
            v: 1000 + index,
          }),
        ),
      };
    },
  });
}

test("session step exposes the multi-stock paper pipeline", async () => {
  const result = await runMultiStockSessionStep({
    pmseInput: PMSE_INPUT,
    resolvedPMSEInstruments: INSTRUMENTS,
    state: createState(),
    cursorState: createCursorState(),
    accessToken: "TEST_TOKEN",
    nowMs: 1789447200000,
    fetcher: createFetcher(),
  });

  assert.equal(
    result.version,
    VERSION,
  );

  assert.equal(
    result.status,
    "READY",
  );

  assert.equal(
    result.mode,
    "PAPER_ONLY",
  );

  assert.equal(
    result.researchOnly,
    true,
  );

  assert.equal(
    result.tradingEnabled,
    false,
  );

  assert.equal(
    result.brokerCalled,
    false,
  );

  assert.equal(
    result.orderCreationEnabled,
    false,
  );

  assert.equal(
    result.learningEnabled,
    false,
  );

  assert.equal(
    result.strategyMutation,
    false,
  );

  assert.equal(
    result.optimizationEnabled,
    false,
  );

  assert.equal(
    result.promotionEnabled,
    false,
  );

  assert.ok(result.candles);
  assert.ok(result.evaluation);
  assert.ok(result.forward);
  assert.ok(result.state);
  assert.ok(result.cursorState);

  assert.deepEqual(
    result.safety,
    SAFETY,
  );
});

test("session step requires an access token", async () => {
  await assert.rejects(
    () =>
      runMultiStockSessionStep({
        pmseInput: PMSE_INPUT,
        resolvedPMSEInstruments: INSTRUMENTS,
        state: createState(),
        cursorState: createCursorState(),
        accessToken: "",
        nowMs: 1789447200000,
        fetcher: createFetcher(),
      }),
    /accessToken is required/,
  );
});

test("session step requires state and cursor state", async () => {
  await assert.rejects(
    () =>
      runMultiStockSessionStep({
        pmseInput: PMSE_INPUT,
        resolvedPMSEInstruments: INSTRUMENTS,
        state: null,
        cursorState: createCursorState(),
        accessToken: "TEST_TOKEN",
        nowMs: 1789447200000,
        fetcher: createFetcher(),
      }),
    /state is required/,
  );

  await assert.rejects(
    () =>
      runMultiStockSessionStep({
        pmseInput: PMSE_INPUT,
        resolvedPMSEInstruments: INSTRUMENTS,
        state: createState(),
        cursorState: null,
        accessToken: "TEST_TOKEN",
        nowMs: 1789447200000,
        fetcher: createFetcher(),
      }),
    /cursorState is required/,
  );
});

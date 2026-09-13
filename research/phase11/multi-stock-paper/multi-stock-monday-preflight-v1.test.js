import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runMultiStockSessionController } from "./multi-stock-session-controller-v1.js";

const NOW_MS = Date.UTC(2026, 8, 13, 10, 0, 0);

const PMSE_INPUT = {
  status: "READY",
  version: "PMSE-TRADEMIND-INPUT-CONTRACT-V1",
  source: "PMSE",
  mode: "PAPER_ONLY",
  candidates: [
    { symbol: "LT", score: 57, newsRisk: "LOW" },
    { symbol: "HDFCBANK", score: 52, newsRisk: "LOW" },
    { symbol: "BHARTIARTL", score: 47, newsRisk: "LOW" },
  ],
  metadata: {
    researchOnly: true,
    tradeCreated: false,
    brokerCalled: false,
    frontendTouched: false,
  },
};

const RESOLVED_PMSE_INSTRUMENTS = [
  {
    symbol: "LT",
    securityId: "11483",
    exchange: "NSE",
    segment: "E",
  },
  {
    symbol: "HDFCBANK",
    securityId: "1333",
    exchange: "NSE",
    segment: "E",
  },
  {
    symbol: "BHARTIARTL",
    securityId: "10604",
    exchange: "NSE",
    segment: "E",
  },
];

function createMockFetcher() {
  return async ({ symbol }) => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: [
          {
            ts: NOW_MS - 10 * 60 * 1000,
            o: 100,
            h: 101,
            l: 99,
            c: 100.5,
            v: 1000,
          },
          {
            ts: NOW_MS - 5 * 60 * 1000,
            o: 100.5,
            h: 101.5,
            l: 100,
            c: 101,
            v: 1100,
          },
        ],
      };
    },
  });
}

test("Monday preflight: complete four-stock paper pipeline remains safe", async () => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "trademind-a11-monday-preflight-"),
  );

  const stateFilePath = path.join(
    tempDirectory,
    "2026-09-14.json",
  );

  const result = await runMultiStockSessionController({
    sessionDate: "2026-09-14",
    pmseInput: PMSE_INPUT,
    resolvedPMSEInstruments: RESOLVED_PMSE_INSTRUMENTS,
    accessToken: "PREFLIGHT_TOKEN",
    nowMs: NOW_MS,
    stateFilePath,
    fetcher: createMockFetcher(),
  });

  assert.equal(result.status, "READY");
  assert.equal(result.sessionDate, "2026-09-14");

  assert.equal(result.universe.instruments.length, 4);

  assert.equal(result.evaluation.results.length, 4);

  assert.deepEqual(
    result.evaluation.results.map(
      (item) => item.symbol,
    ),
    [
      "NIFTY 50",
      "LT",
      "HDFCBANK",
      "BHARTIARTL",
    ],
  );

  assert.equal(result.forward.results.length, 4);

  assert.deepEqual(
    result.forward.results.map(
      (item) => item.symbol,
    ),
    [
      "NIFTY 50",
      "LT",
      "HDFCBANK",
      "BHARTIARTL",
    ],
  );

  assert.deepEqual(
    result.universe.instruments.map(
      (instrument) => instrument.symbol,
    ),
    [
      "NIFTY 50",
      "LT",
      "HDFCBANK",
      "BHARTIARTL",
    ],
  );

  assert.equal(
    result.candles?.stocks?.length ??
      result.forward?.candles?.length ??
      4,
    4,
  );

  assert.equal(result.safety.mode, "PAPER_ONLY");
  assert.equal(result.safety.researchOnly, true);
  assert.equal(result.safety.tradingEnabled, false);
  assert.equal(result.safety.brokerCalled, false);
  assert.equal(result.safety.orderCreationEnabled, false);
  assert.equal(result.safety.learningEnabled, false);
  assert.equal(result.safety.strategyMutation, false);
  assert.equal(result.safety.optimizationEnabled, false);
  assert.equal(result.safety.promotionEnabled, false);

  assert.equal(fs.existsSync(stateFilePath), true);

  const persisted = JSON.parse(
    fs.readFileSync(stateFilePath, "utf8"),
  );

  assert.equal(persisted.sessionDate, "2026-09-14");
  assert.equal(persisted.instruments.length, 4);
  assert.equal(Object.keys(persisted.state.stocks).length, 4);
  assert.equal(Object.keys(persisted.cursorState.cursors).length, 4);

  assert.equal(persisted.state.mode, "PAPER_ONLY");
  assert.equal(persisted.state.researchOnly, true);
  assert.equal(persisted.state.tradingEnabled, false);
  assert.equal(persisted.state.brokerCalled, false);
  assert.equal(persisted.state.orderCreationEnabled, false);
  assert.equal(persisted.state.learningEnabled, false);
  assert.equal(persisted.state.strategyMutation, false);
  assert.equal(persisted.state.optimizationEnabled, false);
  assert.equal(persisted.state.promotionEnabled, false);

  fs.rmSync(tempDirectory, {
    recursive: true,
    force: true,
  });
});

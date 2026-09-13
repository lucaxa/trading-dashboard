import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  resolveEquityInstruments,
} from "../../../premarket/equity-data/indstocks-equity-instrument-provider.js";

import {
  runMultiStockSessionController,
} from "./multi-stock-session-controller-v1.js";

const PMSE_URL =
  "https://trading-dashboard-sigma-ten.vercel.app/api/pmse-scan";

const INSTRUMENTS_URL =
  "https://api.indstocks.com/market/instruments?source=equity";

function requireToken() {
  const token = process.env.INDSTOCKS_TOKEN;

  if (
    !token ||
    token === "YOUR_TOKEN_HERE"
  ) {
    throw new Error(
      "INDSTOCKS_TOKEN is required for Monday real rehearsal",
    );
  }

  return token;
}

async function fetchPMSE() {
  const response = await fetch(PMSE_URL);

  assert.equal(
    response.ok,
    true,
    `PMSE endpoint failed: HTTP ${response.status}`,
  );

  const data = await response.json();

  assert.equal(data.status, "READY");
  assert.equal(data.output?.source, "PMSE");
  assert.equal(data.output?.mode, "PAPER_ONLY");
  assert.equal(data.output?.metadata?.researchOnly, true);
  assert.equal(data.output?.metadata?.tradeCreated, false);
  assert.equal(data.output?.metadata?.brokerCalled, false);

  assert.equal(
    data.output?.candidates?.length,
    3,
  );

  return data.output;
}

async function fetchInstrumentCsv(token) {
  const response = await fetch(
    INSTRUMENTS_URL,
    {
      method: "GET",
      headers: {
        Authorization: token,
        Accept: "text/csv",
      },
    },
  );

  assert.equal(
    response.ok,
    true,
    `INDstocks instrument API failed: HTTP ${response.status}`,
  );

  return response.text();
}

test(
  "Monday real rehearsal: controller persists a safe four-stock paper session",
  async () => {
    const token = requireToken();
    const pmseInput = await fetchPMSE();
    const csv = await fetchInstrumentCsv(token);

    const resolvedPMSEInstruments =
      pmseInput.candidates.map((candidate) => {
        const matches = resolveEquityInstruments({
          symbols: [candidate.symbol],
          csv,
        });

        const nseEquity = matches.find(
          (instrument) =>
            instrument.exchange === "NSE" &&
            instrument.segment === "E",
        );

        assert.ok(
          nseEquity,
          `No NSE/E instrument resolved for ${candidate.symbol}`,
        );

        return nseEquity;
      });

    assert.equal(
      resolvedPMSEInstruments.length,
      3,
    );

    const tempDirectory = fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "trademind-a11-monday-real-rehearsal-",
      ),
    );

    const stateFilePath = path.join(
      tempDirectory,
      "2026-09-14-rehearsal.json",
    );

    try {
      const result =
        await runMultiStockSessionController({
          sessionDate: "2026-09-14",
          pmseInput,
          resolvedPMSEInstruments,
          accessToken: token,
          nowMs: Date.now(),
          stateFilePath,
        });

      assert.equal(result.status, "READY");
      assert.equal(result.sessionDate, "2026-09-14");

      assert.equal(
        result.universe.instruments.length,
        4,
      );

      assert.equal(
        result.evaluation.results.length,
        4,
      );

      assert.equal(
        result.forward.results.length,
        4,
      );

      assert.equal(
        result.safety.mode,
        "PAPER_ONLY",
      );
      assert.equal(
        result.safety.researchOnly,
        true,
      );
      assert.equal(
        result.safety.tradingEnabled,
        false,
      );
      assert.equal(
        result.safety.brokerCalled,
        false,
      );
      assert.equal(
        result.safety.orderCreationEnabled,
        false,
      );
      assert.equal(
        result.safety.learningEnabled,
        false,
      );
      assert.equal(
        result.safety.strategyMutation,
        false,
      );
      assert.equal(
        result.safety.optimizationEnabled,
        false,
      );
      assert.equal(
        result.safety.promotionEnabled,
        false,
      );

      assert.equal(
        fs.existsSync(stateFilePath),
        true,
      );

      const persisted = JSON.parse(
        fs.readFileSync(
          stateFilePath,
          "utf8",
        ),
      );

      assert.equal(
        persisted.sessionDate,
        "2026-09-14",
      );

      assert.equal(
        persisted.instruments.length,
        4,
      );

      assert.equal(
        Object.keys(
          persisted.state.stocks,
        ).length,
        4,
      );

      assert.equal(
        Object.keys(
          persisted.cursorState.cursors,
        ).length,
        4,
      );

      assert.equal(
        persisted.state.mode,
        "PAPER_ONLY",
      );

      assert.equal(
        persisted.state.researchOnly,
        true,
      );

      assert.equal(
        persisted.state.tradingEnabled,
        false,
      );

      assert.equal(
        persisted.state.brokerCalled,
        false,
      );

      assert.equal(
        persisted.state.orderCreationEnabled,
        false,
      );

      assert.equal(
        persisted.state.learningEnabled,
        false,
      );

      assert.equal(
        persisted.state.strategyMutation,
        false,
      );

      assert.equal(
        persisted.state.optimizationEnabled,
        false,
      );

      assert.equal(
        persisted.state.promotionEnabled,
        false,
      );
    } finally {
      fs.rmSync(
        tempDirectory,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);

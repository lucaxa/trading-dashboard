import test from "node:test";
import assert from "node:assert/strict";

import handler, {
  runMultiStockSessionStepAPI,
} from "./multi-stock-session-step.js";

function createResponse() {
  return {
    statusCode: null,
    payload: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("multi-stock session API rejects non-POST requests", async () => {
  const request = {
    method: "GET",
    body: {},
  };

  const response = createResponse();

  await handler(request, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.payload.status, "ERROR");
  assert.equal(
    response.payload.error,
    "Method not allowed",
  );
});

test("multi-stock session API requires INDSTOCKS_TOKEN", async () => {
  const previousToken =
    process.env.INDSTOCKS_TOKEN;

  delete process.env.INDSTOCKS_TOKEN;

  try {
    const request = {
      method: "POST",
      body: {},
    };

    const response = createResponse();

    await handler(request, response);

    assert.equal(response.statusCode, 500);
    assert.equal(response.payload.status, "ERROR");
    assert.equal(
      response.payload.error,
      "INDSTOCKS_TOKEN is not configured",
    );
  } finally {
    if (previousToken === undefined) {
      delete process.env.INDSTOCKS_TOKEN;
    } else {
      process.env.INDSTOCKS_TOKEN =
        previousToken;
    }
  }
});

test("multi-stock session API requires state", async () => {
  const previousToken =
    process.env.INDSTOCKS_TOKEN;

  process.env.INDSTOCKS_TOKEN =
    "TEST_TOKEN";

  try {
    const request = {
      method: "POST",
      body: {
        cursorState: {},
      },
    };

    const response = createResponse();

    await handler(request, response);

    assert.equal(response.statusCode, 500);
    assert.equal(response.payload.status, "ERROR");
    assert.equal(
      response.payload.error,
      "state is required",
    );
  } finally {
    if (previousToken === undefined) {
      delete process.env.INDSTOCKS_TOKEN;
    } else {
      process.env.INDSTOCKS_TOKEN =
        previousToken;
    }
  }
});

test("multi-stock session API requires cursorState", async () => {
  const previousToken =
    process.env.INDSTOCKS_TOKEN;

  process.env.INDSTOCKS_TOKEN =
    "TEST_TOKEN";

  try {
    const request = {
      method: "POST",
      body: {
        state: {},
      },
    };

    const response = createResponse();

    await handler(request, response);

    assert.equal(response.statusCode, 500);
    assert.equal(response.payload.status, "ERROR");
    assert.equal(
      response.payload.error,
      "cursorState is required",
    );
  } finally {
    if (previousToken === undefined) {
      delete process.env.INDSTOCKS_TOKEN;
    } else {
      process.env.INDSTOCKS_TOKEN =
        previousToken;
    }
  }
});


test("multi-stock session API core completes a paper-only four-stock step", async () => {
  const calls = [];

  const state = {
    mode: "PAPER_ONLY",
    researchOnly: true,
    tradingEnabled: false,
    brokerCalled: false,
    orderCreationEnabled: false,
    learningEnabled: false,
    strategyMutation: false,
    optimizationEnabled: false,
    promotionEnabled: false,
  };

  const cursorState = {
    version: "A11-MULTI-STOCK-FORWARD-COORDINATOR-V1",
    cursors: {},
  };

  const resolved = [
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
      symbol: "SBIN",
      securityId: "3045",
      exchange: "NSE",
      segment: "E",
    },
  ];

  const pmseOutput = {
    status: "READY",
    version: "PMSE-TRADEMIND-INPUT-CONTRACT-V1",
    source: "PMSE",
    mode: "PAPER_ONLY",
    candidates: [
      {
        symbol: "LT",
        score: 69,
        newsRisk: "LOW",
      },
      {
        symbol: "HDFCBANK",
        score: 72,
        newsRisk: "LOW",
      },
      {
        symbol: "SBIN",
        score: 58,
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

  const result = await runMultiStockSessionStepAPI({
    state,
    cursorState,
    accessToken: "TEST_TOKEN",
    nowMs: 1000,

    getUniverse() {
      calls.push("universe");

      return {
        universe: {
          symbols: [
            "RELIANCE",
            "INFY",
            "HDFCBANK",
            "ICICIBANK",
            "TCS",
            "SBIN",
            "ITC",
            "LT",
            "AXISBANK",
            "BHARTIARTL",
          ],
        },
      };
    },

    async fetchInstrumentCsvFn({ accessToken }) {
      calls.push(`csv:${accessToken}`);
      return "MOCK_CSV";
    },

    resolveInstruments({ symbols, csv }) {
      calls.push(`resolve:${symbols.length}:${csv}`);

      return resolved;
    },

    async getStocks({
      symbols,
      instruments,
      accessToken,
      window,
    }) {
      calls.push(
        `stocks:${symbols.length}:${instruments.length}:${accessToken}:${window.startTime}:${window.endTime}`,
      );

      return symbols.map((symbol) => ({
        symbol,
        candles: [
          {
            timestamp: 900,
            open: 100,
            high: 101,
            low: 99,
            close: 100.5,
            volume: 1000,
          },
          {
            timestamp: 1000,
            open: 100.5,
            high: 101.5,
            low: 100,
            close: 101,
            volume: 1100,
          },
        ],
      }));
    },

    async runPMSEPipeline({ stocks }) {
      calls.push(`pmse:${stocks.length}`);
      return {
        output: pmseOutput,
      };
    },

    async runSessionStep(args) {
      calls.push(
        `session:${args.resolvedPMSEInstruments.length}:${args.accessToken}:${args.nowMs}`,
      );

      assert.equal(args.pmseInput, pmseOutput);
      assert.equal(args.state, state);
      assert.equal(args.cursorState, cursorState);

      return {
        version: "A11-MULTI-STOCK-SESSION-STEP-V1",
        status: "READY",
        safety: {
          mode: "PAPER_ONLY",
          researchOnly: true,
          tradingEnabled: false,
          brokerCalled: false,
          orderCreationEnabled: false,
          learningEnabled: false,
          strategyMutation: false,
          optimizationEnabled: false,
          promotionEnabled: false,
        },
      };
    },

    createWindow() {
      calls.push("window");

      return {
        startTime: 1,
        endTime: 2,
      };
    },
  });

  assert.equal(result.status, "READY");
  assert.equal(result.pmse, pmseOutput);

  assert.deepEqual(
    result.resolvedPMSEInstruments,
    [
      resolved[0],
      resolved[1],
      resolved[2],
    ],
  );

  assert.equal(
    result.session.version,
    "A11-MULTI-STOCK-SESSION-STEP-V1",
  );

  assert.deepEqual(calls, [
    "universe",
    "csv:TEST_TOKEN",
    "resolve:10:MOCK_CSV",
    "window",
    "stocks:10:3:TEST_TOKEN:1:2",
    "pmse:10",
    "session:3:TEST_TOKEN:1000",
  ]);
});

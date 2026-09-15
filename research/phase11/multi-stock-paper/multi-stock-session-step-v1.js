import {
  runMultiStockLiveForwardAdapter,
} from "./multi-stock-live-forward-adapter-v1.js";

const VERSION =
  "A11-MULTI-STOCK-SESSION-STEP-V1";

const SAFETY = Object.freeze({
  mode: "PAPER_ONLY",
  researchOnly: true,
  tradingEnabled: false,
  brokerCalled: false,
  orderCreationEnabled: false,
  learningEnabled: false,
  strategyMutation: false,
  optimizationEnabled: false,
  promotionEnabled: false,
});

function validateInputs({
  pmseInput,
  resolvedPMSEInstruments,
  state,
  cursorState,
  accessToken,
  nowMs,
}) {
  if (!pmseInput || typeof pmseInput !== "object") {
    throw new Error("pmseInput is required");
  }

  if (!Array.isArray(resolvedPMSEInstruments)) {
    throw new Error(
      "resolvedPMSEInstruments must be an array",
    );
  }

  if (!state || typeof state !== "object") {
    throw new Error("state is required");
  }

  if (!cursorState || typeof cursorState !== "object") {
    throw new Error("cursorState is required");
  }

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim()
  ) {
    throw new Error("accessToken is required");
  }

  if (!Number.isFinite(nowMs)) {
    throw new Error("nowMs must be finite");
  }
}

export async function runMultiStockSessionStep({
  pmseInput,
  resolvedPMSEInstruments,
  state,
  cursorState,
  accessToken,
  nowMs = Date.now(),
  fetcher,
} = {}) {
  validateInputs({
    pmseInput,
    resolvedPMSEInstruments,
    state,
    cursorState,
    accessToken,
    nowMs,
  });

  const result =
    await runMultiStockLiveForwardAdapter({
      pmseInput,
      resolvedPMSEInstruments,
      state,
      cursorState,
      accessToken,
      nowMs,
      fetcher,
    });

  return {
    version: VERSION,
    status: "READY",

    mode: SAFETY.mode,
    researchOnly: SAFETY.researchOnly,
    tradingEnabled: SAFETY.tradingEnabled,
    brokerCalled: SAFETY.brokerCalled,
    orderCreationEnabled:
      SAFETY.orderCreationEnabled,
    learningEnabled: SAFETY.learningEnabled,
    strategyMutation: SAFETY.strategyMutation,
    optimizationEnabled: SAFETY.optimizationEnabled,
    promotionEnabled: SAFETY.promotionEnabled,

    universe: result.evaluation?.universe ?? null,
    candles: result.candles,
    evaluation: result.evaluation,
    forward: result.forward,

    state,


    cursorState:
      result.forward?.cursorState ??
      null,

    safety: SAFETY,
  };
}

export {
  VERSION,
  SAFETY,
};

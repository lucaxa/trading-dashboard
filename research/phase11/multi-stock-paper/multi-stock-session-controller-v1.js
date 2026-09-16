import fs from "node:fs";
import path from "node:path";

import { buildMultiStockUniverse } from "./multi-stock-universe-v1.js";
import {
  createMultiStockSessionState,
  loadMultiStockSessionState,
  saveMultiStockSessionState,
} from "./multi-stock-session-state-v1.js";
import { runMultiStockLiveForwardAdapter } from "./multi-stock-live-forward-adapter-v1.js";

const VERSION = "A11-MULTI-STOCK-SESSION-CONTROLLER-V1";

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

function assertAccessToken(accessToken) {
  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length === 0 ||
    accessToken === "undefined" ||
    accessToken === "null"
  ) {
    throw new Error("INDSTOCKS_TOKEN is required");
  }
}

function normalizeSessionDate(sessionDate) {
  if (
    typeof sessionDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
  ) {
    throw new Error("sessionDate must be YYYY-MM-DD");
  }

  return sessionDate;
}

function ensureParentDirectory(filePath) {
  const parent = path.dirname(filePath);

  if (parent && parent !== ".") {
    fs.mkdirSync(parent, { recursive: true });
  }
}

function buildDefaultState({ sessionDate, instruments }) {
  return createMultiStockSessionState({
    sessionDate,
    instruments,
  });
}

function loadOrCreateSessionState({
  stateFilePath,
  sessionDate,
  instruments,
}) {
  if (fs.existsSync(stateFilePath)) {
    return {
      state: loadMultiStockSessionState(stateFilePath, {
        sessionDate,
        instruments,
      }),
      created: false,
    };
  }

  return {
    state: buildDefaultState({
      sessionDate,
      instruments,
    }),
    created: true,
  };
}

function saveSessionState({
  stateFilePath,
  session,
}) {
  ensureParentDirectory(stateFilePath);

  saveMultiStockSessionState(
    stateFilePath,
    session,
  );
}

function buildSessionPinnedPMSEInput(instruments) {
  const candidates =
    instruments
      .filter(
        (instrument) =>
          instrument.symbol !== "NIFTY 50",
      )
      .map(
        (instrument) => ({
          symbol: instrument.symbol,
        }),
      );

  if (candidates.length !== 3) {
    throw new Error(
      `Expected exactly 3 persisted PMSE candidates, received ${candidates.length}`,
    );
  }

  return {
    version:
      "PMSE-TRADEMIND-INPUT-CONTRACT-V1",
    source: "PMSE",
    mode: "PAPER_ONLY",
    candidates,
    metadata: {
      researchOnly: true,
      tradeCreated: false,
      brokerCalled: false,
      frontendTouched: false,
      sessionPinned: true,
    },
  };
}

export async function runMultiStockSessionController({
  sessionDate,
  pmseInput,
  resolvedPMSEInstruments,
  accessToken,
  nowMs = Date.now(),
  stateFilePath,
  fetcher,
}) {
  const normalizedSessionDate = normalizeSessionDate(sessionDate);

  assertAccessToken(accessToken);

  if (!Number.isFinite(nowMs)) {
    throw new Error("nowMs must be finite");
  }

  if (
    typeof stateFilePath !== "string" ||
    stateFilePath.trim().length === 0
  ) {
    throw new Error("stateFilePath is required");
  }

  const sessionExists =
    fs.existsSync(stateFilePath);

  let instruments;
  let sessionPMSEInput;
  let sessionResolvedPMSEInstruments;

  if (!sessionExists) {
    const universe =
      buildMultiStockUniverse({
        pmseCandidates:
          pmseInput?.output?.candidates ??
          pmseInput?.candidates ??
          [],
      });

    instruments = [
      ...universe.instruments.filter(
        (instrument) =>
          instrument.symbol === "NIFTY 50",
      ),
      ...resolvedPMSEInstruments,
    ];

    if (instruments.length !== 4) {
      throw new Error(
        `Expected exactly 4 resolved instruments, received ${instruments.length}`,
      );
    }

    sessionPMSEInput = pmseInput;
    sessionResolvedPMSEInstruments =
      resolvedPMSEInstruments;
  } else {
    const persisted =
      JSON.parse(
        fs.readFileSync(
          stateFilePath,
          "utf8",
        ),
      );

    if (
      !persisted ||
      !Array.isArray(persisted.instruments)
    ) {
      throw new Error(
        "Persisted session instruments are required",
      );
    }

    instruments = persisted.instruments;

    if (instruments.length !== 4) {
      throw new Error(
        `Expected exactly 4 persisted instruments, received ${instruments.length}`,
      );
    }

    const persistedNifty =
      instruments.find(
        (instrument) =>
          instrument.symbol === "NIFTY 50",
      );

    if (!persistedNifty) {
      throw new Error(
        "Persisted session must contain NIFTY 50",
      );
    }

    sessionPMSEInput =
      buildSessionPinnedPMSEInput(instruments);

    sessionResolvedPMSEInstruments =
      instruments.filter(
        (instrument) =>
          instrument.symbol !== "NIFTY 50",
      );
  }

  const sessionLoad =
    loadOrCreateSessionState({
      stateFilePath,
      sessionDate: normalizedSessionDate,
      instruments,
    });

  const session = sessionLoad.state;

  const forward =
    await runMultiStockLiveForwardAdapter({
      pmseInput: sessionPMSEInput,
      resolvedPMSEInstruments:
        sessionResolvedPMSEInstruments,
      state: session.state,
      cursorState: session.cursorState,
      accessToken,
      nowMs,
      fetcher,
    });

  const updatedSession = {
    ...session,
    state:
      forward.forward?.state ??
      forward.state ??
      session.state,
    cursorState:
      forward.forward?.cursorState ??
      forward.cursorState ??
      session.cursorState,
  };

  const universe = {
    instruments,
  };

  saveSessionState({
    stateFilePath,
    session: updatedSession,
  });

  return {
    version: VERSION,
    status: "READY",
    sessionDate: normalizedSessionDate,
    sessionCreated: sessionLoad.created,
    stateFilePath,
    universe,
    evaluation: forward.evaluation,
    forward: forward.forward ?? forward,
    safety: SAFETY,
  };
}

export {
  VERSION,
  SAFETY,
  assertAccessToken,
  normalizeSessionDate,
  loadOrCreateSessionState,
};

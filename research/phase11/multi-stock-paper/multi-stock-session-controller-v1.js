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

  const universe = buildMultiStockUniverse({
    pmseCandidates:
      pmseInput?.output?.candidates ??
      pmseInput?.candidates ??
      [],
  });

  const instruments = [
    ...universe.instruments.filter(
      (instrument) => instrument.symbol === "NIFTY 50",
    ),
    ...resolvedPMSEInstruments,
  ];

  if (instruments.length !== 4) {
    throw new Error(
      `Expected exactly 4 resolved instruments, received ${instruments.length}`,
    );
  }

  const sessionLoad = loadOrCreateSessionState({
    stateFilePath,
    sessionDate: normalizedSessionDate,
    instruments,
  });

  const session = sessionLoad.state;

  const forward = await runMultiStockLiveForwardAdapter({
    pmseInput,
    resolvedPMSEInstruments,
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

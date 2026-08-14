/*
===========================================================
 TradeMind Pro
 SYSTEM DEVELOPMENT — PHASE 3
 CONTROLLED HISTORICAL EXPERIENCE STREAM
===========================================================

PURPOSE
-------
Move from Phase 2 synthetic experience capture to real
historical NIFTY 50 five-minute market experience.

SOURCE
------
Frozen V25.7 full_s5 canonical dataset.

The workflow obtains the already-frozen artifact. This phase
does NOT fetch live market data.

PIPELINE
--------
FROZEN HISTORICAL CANDLES
        ↓
CAUSAL INDICATORS
        ↓
EXISTING PAPER STRATEGY LOGIC
        ↓
PAPER DECISION
        ↓
3-BAR FUTURE OUTCOME
        ↓
HISTORICAL EXPERIENCE STREAM

SAFETY
------
- no broker
- no Dhan order API
- no real orders
- no parameter optimization
- no feature selection
- no strategy modification
- no learner updates
- no strategy promotion

The existing strategy interface uses:
  EMA 9 vs EMA 21
  price vs VWAP
  RSI 14

Its BUY/SELL/WAIT rules are reproduced here as a
server-side historical adapter because strategy.js is a
browser-side IIFE and exposes window.TradeMindStrategy.

IMPORTANT ANTI-LEAKAGE RULE
---------------------------
For each decision at row i, every indicator is calculated
using candles <= i only.

Future candles are used only after the decision has been
recorded, to resolve the paper outcome.

Only complete 5-minute same-session future windows are used.

OUTPUT
------
system-development/data/phase-3-historical-experience.jsonl

This is deliberately a separate stream. Phase 3 does not
rewrite Phase 1 memory and does not silently duplicate records
on reruns.

===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION =
  "SYSTEM_PHASE_3_HISTORICAL_EXPERIENCE_STREAM_V1";

const INPUT_FILE =
  process.env.INPUT_FILE ||
  "v25_7_import.json";

const OUTPUT_DIR =
  path.resolve(
    process.env.TRADEMIND_PHASE3_DIR ||
      "system-development/data"
  );

const OUTPUT_FILE =
  path.join(
    OUTPUT_DIR,
    "phase-3-historical-experience.jsonl"
  );

const HOLD_BARS = 3;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const EMA_FAST = 9;
const EMA_SLOW = 21;
const FIVE_MIN_SECONDS = 300;

function fail(message) {
  throw new Error(message);
}

function finite(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    fail(`${name} must be finite`);
  }
  return n;
}

function optionalFinite(value, name) {
  if (value === null || value === undefined) {
    return null;
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    fail(`${name} must be finite when provided`);
  }

  return n;
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function ensureOutput() {
  fs.mkdirSync(
    OUTPUT_DIR,
    { recursive: true }
  );
}

function loadSource() {
  if (!fs.existsSync(INPUT_FILE)) {
    fail(
      `Frozen source not found: ${INPUT_FILE}`
    );
  }

  const imported =
    JSON.parse(
      fs.readFileSync(
        INPUT_FILE,
        "utf8"
      )
    );

  if (
    imported.status &&
    imported.status !== "IMPORT_COMPLETE"
  ) {
    fail(
      `Source status is ${imported.status}; expected IMPORT_COMPLETE`
    );
  }

  if (
    imported.mode &&
    imported.mode !== "full_s5"
  ) {
    fail(
      `Source mode is ${imported.mode}; expected full_s5`
    );
  }

  if (
    !Array.isArray(
      imported.canonicalRows
    )
  ) {
    fail(
      "Frozen source does not contain canonicalRows array"
    );
  }

  if (
    imported.canonicalRows.length !== 9385
  ) {
    fail(
      `Expected 9385 frozen canonical rows, got ${imported.canonicalRows.length}`
    );
  }

  if (
    imported.integrity &&
    imported.integrity.chronological !== true
  ) {
    fail(
      "Frozen source failed chronological integrity"
    );
  }

  if (
    imported.integrity &&
    imported.integrity.duplicateTimestamps !== false
  ) {
    fail(
      "Frozen source contains duplicate timestamps"
    );
  }

  if (
    imported.integrity &&
    imported.integrity.allOHLCValid !== true
  ) {
    fail(
      "Frozen source contains invalid OHLC"
    );
  }

  return imported.canonicalRows;
}

function normalizeRows(rows) {
  return rows
    .map((row, index) => {
      const rawTs =
        finite(
          row.ts ?? row.timestamp,
          `canonicalRows[${index}].timestamp`
        );

      const timestamp =
        rawTs < 100000000000
          ? rawTs * 1000
          : rawTs;

      return {
        sourceIndex: index,
        timestamp,

        open:
          finite(
            row.open,
            `canonicalRows[${index}].open`
          ),

        high:
          finite(
            row.high,
            `canonicalRows[${index}].high`
          ),

        low:
          finite(
            row.low,
            `canonicalRows[${index}].low`
          ),

        close:
          finite(
            row.close,
            `canonicalRows[${index}].close`
          ),

        volume:
          finite(
            row.volume,
            `canonicalRows[${index}].volume`
          )
      };
    })
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp
    );
}

/*
India Standard Time is UTC+05:30.
No timezone library is needed because the source timestamps
are already normalized epoch timestamps.
*/
function istDate(timestamp) {
  return new Date(
    timestamp +
      5.5 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);
}

function ema(values, period) {
  if (
    values.length < period
  ) {
    return null;
  }

  const multiplier =
    2 / (period + 1);

  let value =
    values
      .slice(0, period)
      .reduce(
        (sum, x) =>
          sum + x,
        0
      ) / period;

  for (
    let i = period;
    i < values.length;
    i++
  ) {
    value =
      (
        (values[i] - value) *
        multiplier
      ) + value;
  }

  return value;
}

function rsi(values, period) {
  if (
    values.length <
    period + 1
  ) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {
    const change =
      values[i] -
      values[i - 1];

    if (change > 0) {
      gains += change;
    } else {
      losses +=
        Math.abs(change);
    }
  }

  let avgGain =
    gains / period;

  let avgLoss =
    losses / period;

  for (
    let i = period + 1;
    i < values.length;
    i++
  ) {
    const change =
      values[i] -
      values[i - 1];

    const gain =
      Math.max(change, 0);

    const loss =
      Math.max(-change, 0);

    avgGain =
      (
        avgGain * (period - 1) +
        gain
      ) / period;

    avgLoss =
      (
        avgLoss * (period - 1) +
        loss
      ) / period;
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs =
    avgGain / avgLoss;

  return (
    100 -
    100 / (1 + rs)
  );
}

function atr(history, period) {
  if (
    history.length <
    period + 1
  ) {
    return null;
  }

  const ranges = [];

  for (
    let i = 1;
    i < history.length;
    i++
  ) {
    const current =
      history[i];

    const previous =
      history[i - 1];

    ranges.push(
      Math.max(
        current.high -
          current.low,

        Math.abs(
          current.high -
            previous.close
        ),

        Math.abs(
          current.low -
            previous.close
        )
      )
    );
  }

  if (
    ranges.length < period
  ) {
    return null;
  }

  let value =
    ranges
      .slice(0, period)
      .reduce(
        (sum, x) =>
          sum + x,
        0
      ) / period;

  for (
    let i = period;
    i < ranges.length;
    i++
  ) {
    value =
      (
        value * (period - 1) +
        ranges[i]
      ) / period;
  }

  return value;
}

function sessionVWAP(
  history,
  currentSession
) {
  let totalPV = 0;
  let totalVolume = 0;

  for (
    const candle of history
  ) {
    if (
      candle.sessionDate !==
      currentSession
    ) {
      continue;
    }

    const typicalPrice =
      (
        candle.high +
        candle.low +
        candle.close
      ) / 3;

    const volume =
      Math.max(
        0,
        candle.volume
      );

    if (
      !Number.isFinite(
        typicalPrice
      ) ||
      !Number.isFinite(volume)
    ) {
      continue;
    }

    totalPV +=
      typicalPrice *
      volume;

    totalVolume +=
      volume;
  }

  if (
    totalVolume <= 0
  ) {
    return null;
  }

  return (
    totalPV /
    totalVolume
  );
}

function calculateIndicators(
  candles,
  index
) {
  const history =
    candles.slice(
      0,
      index + 1
    );

  const closes =
    history.map(
      x => x.close
    );

  const current =
    candles[index];

  const session =
    current.sessionDate;

  const ema9 =
    ema(
      closes,
      EMA_FAST
    );

  const ema21 =
    ema(
      closes,
      EMA_SLOW
    );

  const rsi14 =
    rsi(
      closes,
      RSI_PERIOD
    );

  const atr14 =
    atr(
      history,
      ATR_PERIOD
    );

  const vwap =
    sessionVWAP(
      history,
      session
    );

  return {
    ema9,
    ema21,
    rsi14,
    atr14,
    vwap
  };
}

/*
This is a server-side reproduction of the CURRENT strategy.js
decision rules. It is intentionally not an optimization.

Current rules:
BUY:
  EMA9 > EMA21
  price > VWAP
  RSI >= 55

SELL:
  EMA9 < EMA21
  price < VWAP
  RSI <= 45

otherwise WAIT.
*/
function generatePaperDecision(
  candle,
  indicators
) {
  const price =
    candle.close;

  if (
    !Number.isFinite(
      indicators.ema9
    ) ||
    !Number.isFinite(
      indicators.ema21
    ) ||
    !Number.isFinite(
      indicators.rsi14
    ) ||
    !Number.isFinite(
      indicators.vwap
    )
  ) {
    return {
      action: "NO_TRADE",
      confidence: 0,
      rationale:
        "Insufficient causal indicator data"
    };
  }

  const bullishTrend =
    indicators.ema9 >
    indicators.ema21;

  const bearishTrend =
    indicators.ema9 <
    indicators.ema21;

  const aboveVWAP =
    price >
    indicators.vwap;

  const belowVWAP =
    price <
    indicators.vwap;

  const bullishMomentum =
    indicators.rsi14 >= 55;

  const bearishMomentum =
    indicators.rsi14 <= 45;

  if (
    bullishTrend &&
    aboveVWAP &&
    bullishMomentum
  ) {
    return {
      action: "PAPER_LONG",
      confidence: 1,
      rationale:
        "EMA bullish + RSI bullish + Price above VWAP"
    };
  }

  if (
    bearishTrend &&
    belowVWAP &&
    bearishMomentum
  ) {
    return {
      action: "PAPER_SHORT",
      confidence: 1,
      rationale:
        "EMA bearish + RSI bearish + Price below VWAP"
    };
  }

  return {
    action: "NO_TRADE",
    confidence: 0,
    rationale:
      "Waiting for confirmation"
  };
}

function hasCompleteFutureWindow(
  candles,
  index
) {
  const current =
    candles[index];

  if (!current) {
    return false;
  }

  for (
    let step = 1;
    step <= HOLD_BARS;
    step++
  ) {
    const previous =
      candles[index + step - 1];

    const future =
      candles[index + step];

    if (!future) {
      return false;
    }

    if (
      future.sessionDate !==
      current.sessionDate
    ) {
      return false;
    }

    const gap =
      (
        future.timestamp -
        previous.timestamp
      ) / 1000;

    if (
      gap !==
      FIVE_MIN_SECONDS
    ) {
      return false;
    }
  }

  return true;
}

function resolveOutcome(
  candles,
  index,
  decision
) {
  if (
    decision.action ===
    "NO_TRADE"
  ) {
    return {
      status: "NO_TRADE",
      exitTimestamp: null,
      priceChange: 0,
      normalizedReturn: 0,
      barsHeld: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0
    };
  }

  const entry =
    candles[index];

  const future =
    candles.slice(
      index + 1,
      index + 1 + HOLD_BARS
    );

  const entryPrice =
    entry.close;

  const exit =
    future[
      future.length - 1
    ];

  const rawChange =
    exit.close -
    entryPrice;

  const signedChange =
    decision.action ===
    "PAPER_LONG"
      ? rawChange
      : -rawChange;

  let mfe = 0;
  let mae = 0;

  for (
    const candle of future
  ) {
    const favorable =
      decision.action ===
      "PAPER_LONG"
        ? (
            candle.high -
            entryPrice
          ) / entryPrice
        : (
            entryPrice -
            candle.low
          ) / entryPrice;

    const adverse =
      decision.action ===
      "PAPER_LONG"
        ? (
            candle.low -
            entryPrice
          ) / entryPrice
        : (
            entryPrice -
            candle.high
          ) / entryPrice;

    mfe =
      Math.max(
        mfe,
        favorable
      );

    mae =
      Math.min(
        mae,
        adverse
      );
  }

  return {
    status:
      signedChange > 0
        ? "WIN"
        : signedChange < 0
          ? "LOSS"
          : "FLAT",

    exitTimestamp:
      exit.timestamp,

    priceChange:
      signedChange,

    normalizedReturn:
      entryPrice === 0
        ? 0
        : signedChange /
          entryPrice,

    barsHeld:
      future.length,

    maxFavorableExcursion:
      mfe,

    maxAdverseExcursion:
      mae
  };
}

function makeRecord(
  candle,
  indicators,
  decision,
  outcome
) {
  const experience = {
    schemaVersion:
      VERSION,

    source: {
      dataset:
        "V25.7 frozen full_s5",
      sourceIndex:
        candle.sourceIndex
    },

    timestamp:
      new Date(
        candle.timestamp
      ).toISOString(),

    instrument:
      "NIFTY 50",

    timeframe:
      "5m",

    marketMode:
      "UNKNOWN",

    observation: {
      close:
        candle.close,

      return1:
        null,

      atr:
        indicators.atr14,

      rsi:
        indicators.rsi14,

      ema9:
        indicators.ema9,

      ema21:
        indicators.ema21,

      vwap:
        indicators.vwap
    },

    context: {
      session:
        candle.sessionDate,

      direction:
        decision.action ===
        "PAPER_LONG"
          ? "UP"
          : decision.action ===
            "PAPER_SHORT"
              ? "DOWN"
              : "NONE",

      transitionState:
        "UNKNOWN",

      source:
        "SYSTEM_PHASE_3"
    },

    decision: {
      action:
        decision.action,

      confidence:
        decision.confidence,

      rationale:
        decision.rationale
    },

    outcome
  };

  const payload =
    JSON.stringify(
      experience
    );

  return {
    ...experience,

    experienceId:
      crypto.randomUUID(),

    recordHash:
      sha256(payload)
  };
}

function runStream() {
  const raw =
    loadSource();

  const candles =
    normalizeRows(raw)
      .map(candle => ({
        ...candle,
        sessionDate:
          istDate(
            candle.timestamp
          )
      }));

  ensureOutput();

  /*
  Write a fresh stream every run.
  This makes the run deterministic and prevents duplicate
  historical experiences when the workflow is rerun.
  */
  fs.writeFileSync(
    OUTPUT_FILE,
    "",
    "utf8"
  );

  let rowsConsidered = 0;
  let rowsWithIndicators = 0;
  let rowsWithCompleteFuture = 0;
  let paperLong = 0;
  let paperShort = 0;
  let noTrade = 0;
  let wins = 0;
  let losses = 0;
  let flats = 0;

  const output = [];

  /*
  Start only after enough causal history exists.
  */
  for (
    let i = 0;
    i < candles.length;
    i++
  ) {
    rowsConsidered++;

    if (
      !hasCompleteFutureWindow(
        candles,
        i
      )
    ) {
      continue;
    }

    const indicators =
      calculateIndicators(
        candles,
        i
      );

    if (
      !Number.isFinite(
        indicators.ema9
      ) ||
      !Number.isFinite(
        indicators.ema21
      ) ||
      !Number.isFinite(
        indicators.rsi14
      ) ||
      !Number.isFinite(
        indicators.atr14
      ) ||
      !Number.isFinite(
        indicators.vwap
      )
    ) {
      continue;
    }

    rowsWithIndicators++;

    const decision =
      generatePaperDecision(
        candles[i],
        indicators
      );

    rowsWithCompleteFuture++;

    const outcome =
      resolveOutcome(
        candles,
        i,
        decision
      );

    if (
      decision.action ===
      "PAPER_LONG"
    ) {
      paperLong++;
    } else if (
      decision.action ===
      "PAPER_SHORT"
    ) {
      paperShort++;
    } else {
      noTrade++;
    }

    if (
      outcome.status ===
      "WIN"
    ) {
      wins++;
    } else if (
      outcome.status ===
      "LOSS"
    ) {
      losses++;
    } else if (
      outcome.status ===
      "FLAT"
    ) {
      flats++;
    }

    output.push(
      makeRecord(
        candles[i],
        indicators,
        decision,
        outcome
      )
    );
  }

  for (
    const record of output
  ) {
    fs.appendFileSync(
      OUTPUT_FILE,
      JSON.stringify(record) +
        "\n",
      "utf8"
    );
  }

  if (
    output.length === 0
  ) {
    fail(
      "Phase 3 produced zero historical experiences"
    );
  }

  return {
    version:
      VERSION,

    status:
      "SYSTEM_PHASE_3_HISTORICAL_EXPERIENCE_STREAM_READY",

    source:
      "V25.7 frozen full_s5",

    sourceRows:
      candles.length,

    rowsConsidered,

    rowsWithIndicators,

    rowsWithCompleteFuture,

    experiencesWritten:
      output.length,

    paperLong,

    paperShort,

    noTrade,

    wins,

    losses,

    flats,

    holdBars:
      HOLD_BARS,

    realTradingEnabled:
      false,

    brokerIntegrationEnabled:
      false,

    learnerEnabled:
      false,

    strategyPromotionEnabled:
      false,

    outputFile:
      OUTPUT_FILE
  };
}

function verifyOutput() {
  if (
    !fs.existsSync(
      OUTPUT_FILE
    )
  ) {
    fail(
      "Phase 3 output file does not exist"
    );
  }

  const lines =
    fs.readFileSync(
      OUTPUT_FILE,
      "utf8"
    )
      .split(/\r?\n/)
      .filter(Boolean);

  if (
    lines.length === 0
  ) {
    fail(
      "Phase 3 output is empty"
    );
  }

  const ids =
    new Set();

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    let row;

    try {
      row =
        JSON.parse(
          lines[i]
        );
    } catch {
      fail(
        `Phase 3 output line ${i + 1} is invalid JSON`
      );
    }

    if (
      !row.experienceId
    ) {
      fail(
        `Phase 3 output line ${i + 1} has no experienceId`
      );
    }

    if (
      ids.has(
        row.experienceId
      )
    ) {
      fail(
        `Duplicate experienceId at line ${i + 1}`
      );
    }

    ids.add(
      row.experienceId
    );

    if (
      !row.timestamp ||
      !row.instrument ||
      !row.timeframe
    ) {
      fail(
        `Phase 3 output line ${i + 1} missing identity fields`
      );
    }

    if (
      !row.decision ||
      ![
        "NO_TRADE",
        "PAPER_LONG",
        "PAPER_SHORT"
      ].includes(
        row.decision.action
      )
    ) {
      fail(
        `Phase 3 output line ${i + 1} has invalid decision`
      );
    }

    if (
      !row.outcome ||
      !row.outcome.status
    ) {
      fail(
        `Phase 3 output line ${i + 1} has invalid outcome`
      );
    }

    if (
      row.source?.dataset !==
      "V25.7 frozen full_s5"
    ) {
      fail(
        `Phase 3 output line ${i + 1} has unexpected source`
      );
    }

    if (
      row.context?.source !==
      "SYSTEM_PHASE_3"
    ) {
      fail(
        `Phase 3 output line ${i + 1} has unexpected context source`
      );
    }
  }

  return {
    outputRows:
      lines.length,

    uniqueExperienceIds:
      ids.size,

    integrity:
      true
  };
}

function selfTest() {
  const summary =
    runStream();

  const verification =
    verifyOutput();

  if (
    summary.experiencesWritten !==
    verification.outputRows
  ) {
    fail(
      "Summary/output row count mismatch"
    );
  }

  if (
    summary.paperLong +
    summary.paperShort +
    summary.noTrade !==
    summary.experiencesWritten
  ) {
    fail(
      "Decision totals do not reconcile"
    );
  }

  return {
    ...summary,
    verification
  };
}

if (
  require.main === module
) {
  console.log(
    JSON.stringify(
      selfTest(),
      null,
      2
    )
  );
}

module.exports = {
  VERSION,
  HOLD_BARS,
  loadSource,
  normalizeRows,
  calculateIndicators,
  generatePaperDecision,
  hasCompleteFutureWindow,
  resolveOutcome,
  runStream,
  verifyOutput,
  selfTest
};

/*
===========================================================
TradeMind Pro
Phase 11 — M1-A Lifecycle Counterfactual Analyzer

RESEARCH ONLY
===========================================================

Session 01 validated persistence build.

Purpose:
Evaluate lifecycle-blocked Phase 11 episodes after removing
ONLY the lifecycle restriction.

All V3/V10.25 trade mechanics remain unchanged.

Frozen:
- V10.25
- Analyzer V3
- Session 01 V3 output
- Historical candle files

Output:
counterfactual/outputs/session-05-lifecycle-counterfactual.json
===========================================================
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT =
  path.resolve(__dirname, '..');

const V3_FILE =
  path.join(
    ROOT,
    'outputs',
    'session-05-25-aug-v3.json'
  );

const CANDLE_FILE =
  path.join(
    ROOT,
    'inputs',
    'candles',
    'session-05-25-aug-candles.json'
  );

const OUTPUT_FILE =
  path.join(
    __dirname,
    'outputs',
    'session-05-lifecycle-counterfactual.json'
  );

const ATR_PERIOD = 14;
const ATR_STOP_MULTIPLIER = 1.5;
const RISK_REWARD = 2;
const MAX_ENTRY_GAP_ATR = 0.25;

const SESSION_DATE = '2026-08-25';
const SESSION_CLOSE_MINUTES = 15 * 60 + 15;

function loadJson(file) {
  return JSON.parse(
    fs.readFileSync(file, 'utf8')
  );
}

function finiteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function istParts(timestamp) {
  const date =
    new Date(
      timestamp +
      5.5 * 60 * 60 * 1000
    );

  return {
    date:
      date.toISOString().slice(0, 10),

    minutes:
      date.getUTCHours() * 60 +
      date.getUTCMinutes()
  };
}

function normalizeCandle(raw, index) {
  if (!raw) {
    return null;
  }

  let timestamp;
  let open;
  let high;
  let low;
  let close;
  let volume;

  if (typeof raw === 'object') {
    timestamp =
      finiteNumber(
        raw.timestamp ??
        raw.ts
      );

    open =
      finiteNumber(
        raw.open ??
        raw.o
      );

    high =
      finiteNumber(
        raw.high ??
        raw.h
      );

    low =
      finiteNumber(
        raw.low ??
        raw.l
      );

    close =
      finiteNumber(
        raw.close ??
        raw.c
      );

    volume =
      finiteNumber(
        raw.volume ??
        raw.v
      );
  } else {
    return null;
  }

  if (
    timestamp === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null;
  }

  if (
    high < low ||
    high < open ||
    high < close ||
    low > open ||
    low > close
  ) {
    return null;
  }

  const ist =
    istParts(timestamp);

  return {
    index,
    timestamp,
    iso:
      new Date(timestamp).toISOString(),
    date: ist.date,
    minutes: ist.minutes,
    open,
    high,
    low,
    close,
    volume:
      volume === null
        ? 0
        : volume
  };
}

function extractCandleArray(data) {
  if (Array.isArray(data)) {
    return data;
  }

  const candidates = [
    data?.candles,
    data?.data?.candles,
    data?.data?.NIDX_40000001?.candles,
    data?.NIDX_40000001?.candles,
    data?.data?.NIDX_40000001,
    data?.NIDX_40000001,
    data?.data
  ];

  for (const candidate of candidates) {
    if (
      Array.isArray(candidate) &&
      candidate.length > 0
    ) {
      return candidate;
    }
  }

  return [];
}

function loadCandles(file) {
  const raw =
    loadJson(file);

  const array =
    extractCandleArray(raw);

  const candles =
    array
      .map(
        (candle, index) =>
          normalizeCandle(
            candle,
            index
          )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.timestamp -
          b.timestamp
      );

  if (!candles.length) {
    throw new Error(
      'No usable historical candles found.'
    );
  }

  return candles;
}

function trueRange(current, previous) {
  if (!current) {
    return null;
  }

  const high = current.high;
  const low = current.low;

  if (
    !Number.isFinite(high) ||
    !Number.isFinite(low)
  ) {
    return null;
  }

  if (
    !previous ||
    !Number.isFinite(previous.close)
  ) {
    return high - low;
  }

  return Math.max(
    high - low,
    Math.abs(
      high -
      previous.close
    ),
    Math.abs(
      low -
      previous.close
    )
  );
}

function calculateAtr14(candles, index) {
  const end = index;
  const start =
    end -
    ATR_PERIOD;

  if (start < 0) {
    return null;
  }

  const ranges = [];

  for (
    let i = start + 1;
    i <= end;
    i++
  ) {
    const range =
      trueRange(
        candles[i],
        candles[i - 1]
      );

    if (
      !Number.isFinite(range)
    ) {
      return null;
    }

    ranges.push(range);
  }

  if (
    ranges.length !==
    ATR_PERIOD
  ) {
    return null;
  }

  return (
    ranges.reduce(
      (sum, item) =>
        sum + item,
      0
    ) /
    ATR_PERIOD
  );
}

function findContainingCandleIndex(
  candles,
  signalTime
) {
  for (
    let i = 0;
    i < candles.length;
    i++
  ) {
    const candle =
      candles[i];

    const next =
      candles[i + 1];

    if (
      candle.timestamp <=
        signalTime &&
      (
        !next ||
        signalTime <
          next.timestamp
      )
    ) {
      return i;
    }
  }

  return -1;
}

function replayPosition({
  candles,
  entryIndex,
  entry,
  stop,
  target,
  side
}) {
  for (
    let i = entryIndex;
    i < candles.length;
    i++
  ) {
    const candle =
      candles[i];

    if (
      candle.date !==
      SESSION_DATE
    ) {
      break;
    }

    const targetHit =
      side === 'BUY'
        ? candle.high >= target
        : candle.low <= target;

    const stopHit =
      side === 'BUY'
        ? candle.low <= stop
        : candle.high >= stop;

    if (
      targetHit &&
      stopHit
    ) {
      return {
        outcome: 'STOP',
        reason:
          'TARGET_AND_STOP_SAME_CANDLE_CONSERVATIVE_STOP',
        outcomeTimestamp:
          candle.timestamp,
        outcomePrice:
          stop,
        rMultiple: -1
      };
    }

    if (stopHit) {
      return {
        outcome: 'STOP',
        reason: 'STOP LOSS',
        outcomeTimestamp:
          candle.timestamp,
        outcomePrice:
          stop,
        rMultiple: -1
      };
    }

    if (targetHit) {
      return {
        outcome: 'TARGET',
        reason: 'TARGET',
        outcomeTimestamp:
          candle.timestamp,
        outcomePrice:
          target,
        rMultiple: RISK_REWARD
      };
    }

    if (
      candle.minutes >=
      SESSION_CLOSE_MINUTES
    ) {
      const close =
        candle.close;

      const rMultiple =
        side === 'BUY'
          ? (
              close -
              entry
            ) /
            (
              entry -
              stop
            )
          : (
              entry -
              close
            ) /
            (
              stop -
              entry
            );

      return {
        outcome:
          'SESSION_CLOSE',
        reason:
          'SESSION CLOSE',
        outcomeTimestamp:
          candle.timestamp,
        outcomePrice:
          close,
        rMultiple
      };
    }
  }

  return {
    outcome:
      'UNRESOLVED',
    reason:
      'No same-session outcome available.',
    outcomeTimestamp: null,
    outcomePrice: null,
    rMultiple: null
  };
}

function main() {
  console.log(
    '===================================================='
  );

  console.log(
    'TradeMind Pro — M1-A Lifecycle Counterfactual'
  );

  console.log(
    '===================================================='
  );

  const v3 =
    loadJson(V3_FILE);

  const candles =
    loadCandles(CANDLE_FILE);

  const blocked =
    (v3.episodes || [])
      .filter(
        episode =>
          episode.classification ===
          'BLOCKED_LIFECYCLE'
      );

  console.log(
    `Normalized candles: ${candles.length}`
  );

  console.log(
    `Lifecycle-blocked episodes: ${blocked.length}`
  );

  const results = [];

  for (
    const episode of blocked
  ) {
    const signalTime =
      Date.parse(
        episode.signalTimestamp
      );

    const signalIndex =
      findContainingCandleIndex(
        candles,
        signalTime
      );

    if (
      signalIndex < 0
    ) {
      results.push({
        episode:
          episode.episode,
        signal:
          episode.signal,
        signalTimestamp:
          episode.signalTimestamp,
        classification:
          'COUNTERFACTUAL_INSUFFICIENT_CONTEXT',
        reason:
          'Signal observation could not be mapped to a historical candle.'
      });

      continue;
    }

    const signalCandle =
      candles[signalIndex];

    if (
      signalCandle.date !==
      SESSION_DATE
    ) {
      results.push({
        episode:
          episode.episode,
        signal:
          episode.signal,
        signalTimestamp:
          episode.signalTimestamp,
        classification:
          'COUNTERFACTUAL_UNRESOLVED',
        reason:
          'Signal mapped outside target session.'
      });

      continue;
    }

    const atr14 =
      calculateAtr14(
        candles,
        signalIndex
      );

    if (
      !Number.isFinite(atr14) ||
      atr14 <= 0
    ) {
      results.push({
        episode:
          episode.episode,
        signal:
          episode.signal,
        signalTimestamp:
          episode.signalTimestamp,
        signalCandleTimestamp:
          signalCandle.timestamp,
        classification:
          'COUNTERFACTUAL_INSUFFICIENT_CONTEXT',
        reason:
          'Insufficient historical candles for ATR(14).'
      });

      continue;
    }

    const entryIndex =
      signalIndex + 1;

    if (
      entryIndex >=
      candles.length
    ) {
      results.push({
        episode:
          episode.episode,
        signal:
          episode.signal,
        classification:
          'COUNTERFACTUAL_UNRESOLVED',
        reason:
          'No next candle available.'
      });

      continue;
    }

    const entryCandle =
      candles[entryIndex];

    if (
      entryCandle.date !==
      SESSION_DATE
    ) {
      results.push({
        episode:
          episode.episode,
        signal:
          episode.signal,
        signalTimestamp:
          episode.signalTimestamp,
        signalCandleTimestamp:
          signalCandle.timestamp,
        classification:
          'COUNTERFACTUAL_UNRESOLVED',
        reason:
          'No same-session next candle available for entry.'
      });

      continue;
    }

    const entry =
      entryCandle.open;

    const entryGapAtr =
      (
        entry -
        signalCandle.close
      ) /
      atr14;

    if (
      Math.abs(entryGapAtr) >
      MAX_ENTRY_GAP_ATR
    ) {
      results.push({
        episode:
          episode.episode,
        signal:
          episode.signal,
        signalTimestamp:
          episode.signalTimestamp,
        signalCandleTimestamp:
          signalCandle.timestamp,
        entryTimestamp:
          entryCandle.timestamp,
        entry,
        atr14,
        entryGapAtr,
        classification:
          'COUNTERFACTUAL_ENTRY_BLOCKED',
        reason:
          'Next-candle entry gap exceeds V10.25 limit.'
      });

      continue;
    }

    const risk =
      atr14 *
      ATR_STOP_MULTIPLIER;

    const reward =
      risk *
      RISK_REWARD;

    const side =
      episode.signal;

    const stop =
      side === 'BUY'
        ? entry - risk
        : entry + risk;

    const target =
      side === 'BUY'
        ? entry + reward
        : entry - reward;

    const replay =
      replayPosition({
        candles,
        entryIndex,
        entry,
        stop,
        target,
        side
      });

    results.push({
      episode:
        episode.episode,
      signal:
        episode.signal,
      signalTimestamp:
        episode.signalTimestamp,
      signalCandleTimestamp:
        signalCandle.timestamp,
      entryTimestamp:
        entryCandle.timestamp,
      entry,
      atr14,
      risk,
      stop,
      target,
      entryGapAtr,
      classification:
        `COUNTERFACTUAL_${replay.outcome}`,
      outcome:
        replay.outcome,
      outcomeTimestamp:
        replay.outcomeTimestamp,
      outcomePrice:
        replay.outcomePrice,
      rMultiple:
        replay.rMultiple,
      reason:
        replay.reason
    });
  }

  const summary = {
    lifecycleBlocked:
      blocked.length,

    counterfactualTarget:
      results.filter(
        result =>
          result.outcome ===
          'TARGET'
      ).length,

    counterfactualStop:
      results.filter(
        result =>
          result.outcome ===
          'STOP'
      ).length,

    counterfactualSessionClose:
      results.filter(
        result =>
          result.outcome ===
          'SESSION_CLOSE'
      ).length,

    counterfactualEntryBlocked:
      results.filter(
        result =>
          result.classification ===
          'COUNTERFACTUAL_ENTRY_BLOCKED'
      ).length,

    insufficientContext:
      results.filter(
        result =>
          result.classification ===
          'COUNTERFACTUAL_INSUFFICIENT_CONTEXT'
      ).length,

    unresolved:
      results.filter(
        result =>
          result.classification ===
          'COUNTERFACTUAL_UNRESOLVED'
      ).length,

    netR:
      results
        .filter(
          result =>
            Number.isFinite(
              result.rMultiple
            )
        )
        .reduce(
          (
            sum,
            result
          ) =>
            sum +
            result.rMultiple,
          0
        )
  };

  const output = {
    schema:
      'TradeMind-Pro-Phase11-M1A-Lifecycle-Counterfactual-v1',

    analyzer:
      'M1-A Lifecycle Counterfactual',

    researchOnly:
      true,

    strategyMutation:
      false,

    realOrders:
      false,

    session: {
      id: 1,
      date: SESSION_DATE
    },

    methodology: {
      atrPeriod:
        ATR_PERIOD,

      atrStopMultiplier:
        ATR_STOP_MULTIPLIER,

      riskReward:
        RISK_REWARD,

      maxEntryGapAtr:
        MAX_ENTRY_GAP_ATR,

      lifecycleRestrictionRemoved:
        true,

      entryRule:
        'Next same-session candle open',

      signalMapping:
        'Containing 5-minute candle',

      sameCandleTargetStop:
        'Conservative STOP',

      sessionCloseMinutes:
        SESSION_CLOSE_MINUTES
    },

    sourceFiles: {
      v3:
        path.relative(
          process.cwd(),
          V3_FILE
        ),

      candles:
        path.relative(
          process.cwd(),
          CANDLE_FILE
        )
    },

    summary,

    episodes:
      results
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log(
    '----------------------------------------------------'
  );

  console.log(
    `Session ${SESSION_DATE} counterfactual summary:`
  );

  console.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );

  console.log(
    '----------------------------------------------------'
  );

  console.log(
    `Output: ${OUTPUT_FILE}`
  );
}

main();

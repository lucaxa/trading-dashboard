/*
===========================================================
TradeMind Pro — M1-C Failure Anatomy
===========================================================

M1-C / Layer 3 — Feature Separation Audit

Purpose
-------
Audit whether the observed features of the 14 sequentially
accepted M1-B counterfactual trades show descriptive
separation between TARGET and STOP outcomes.

This is diagnostic research only.

NO:
- threshold optimization
- validity filter creation
- strategy mutation
- learning
- promotion
- paper orders
- real orders
===========================================================
*/

'use strict';

const fs = require('fs');
const path = require('path');


/*
===========================================================
 PATHS
===========================================================
*/

const OUTPUT_DIR =
  path.join(
    __dirname,
    'outputs'
  );

const INPUT_FILE =
  path.join(
    OUTPUT_DIR,
    'm1-c-reconstructed-trades.json'
  );

const OUTPUT_FILE =
  path.join(
    OUTPUT_DIR,
    'm1-c-feature-separation.json'
  );


/*
===========================================================
 HELPERS
===========================================================
*/

function loadJson(file) {

  return JSON.parse(
    fs.readFileSync(
      file,
      'utf8'
    )
  );
}


function finiteValues(
  records,
  field
) {

  return records
    .map(
      item =>
        Number(item[field])
    )
    .filter(
      Number.isFinite
    );
}


function average(values) {

  if (
    values.length === 0
  ) {

    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    values.length
  );
}


function median(values) {

  if (
    values.length === 0
  ) {

    return null;
  }

  const sorted =
    [...values]
      .sort(
        (a, b) =>
          a - b
      );

  const middle =
    Math.floor(
      sorted.length / 2
    );

  if (
    sorted.length % 2
  ) {

    return sorted[middle];
  }

  return (
    sorted[middle - 1] +
    sorted[middle]
  ) / 2;
}


function minimum(values) {

  return values.length
    ? Math.min(...values)
    : null;
}


function maximum(values) {

  return values.length
    ? Math.max(...values)
    : null;
}


function range(values) {

  return {

    minimum:
      minimum(values),

    maximum:
      maximum(values)

  };
}


function overlap(
  a,
  b
) {

  if (
    !a.length ||
    !b.length
  ) {

    return false;
  }

  return !(
    maximum(a) <
    minimum(b) ||
    maximum(b) <
    minimum(a)
  );
}


function directionCounts(
  records
) {

  return {

    BUY:
      records.filter(
        item =>
          item.signal ===
          'BUY'
      ).length,

    SELL:
      records.filter(
        item =>
          item.signal ===
          'SELL'
      ).length

  };
}


function timeBucket(
  timestamp
) {

  const date =
    new Date(
      timestamp
    );

  const hours =
    date.getUTCHours();

  const minutes =
    date.getUTCMinutes();

  const total =
    hours * 60 +
    minutes;

  /*
  Evidence timestamps are UTC.
  NSE session time is represented in IST.

  Convert UTC → IST for descriptive buckets.
  */

  const istTotal =
    total + 330;

  const normalized =
    istTotal % 1440;

  const istHour =
    Math.floor(
      normalized / 60
    );

  if (
    istHour < 10
  ) {

    return '09:15-10:00';
  }

  if (
    istHour < 11
  ) {

    return '10:00-11:00';
  }

  if (
    istHour < 12
  ) {

    return '11:00-12:00';
  }

  if (
    istHour < 13
  ) {

    return '12:00-13:00';
  }

  if (
    istHour < 14
  ) {

    return '13:00-14:00';
  }

  if (
    istHour < 15
  ) {

    return '14:00-15:00';
  }

  return '15:00+';
}


function bucketCounts(
  records,
  field,
  boundaries
) {

  const result = {};

  for (
    let i = 0;
    i < boundaries.length - 1;
    i++
  ) {

    const low =
      boundaries[i];

    const high =
      boundaries[i + 1];

    const label =
      `${low} to ${high}`;

    result[label] =
      records.filter(
        item => {

          const value =
            Number(
              item[field]
            );

          return (
            Number.isFinite(value) &&
            value >= low &&
            value < high
          );

        }
      ).length;
  }

  return result;
}


function featureAudit(
  targets,
  stops,
  field
) {

  const targetValues =
    finiteValues(
      targets,
      field
    );

  const stopValues =
    finiteValues(
      stops,
      field
    );

  return {

    target: {

      count:
        targetValues.length,

      average:
        average(targetValues),

      median:
        median(targetValues),

      range:
        range(targetValues)

    },

    stop: {

      count:
        stopValues.length,

      average:
        average(stopValues),

      median:
        median(stopValues),

      range:
        range(stopValues)

    },

    observedRangeOverlap:
      overlap(
        targetValues,
        stopValues
      ),

    sampleWarning:
      (
        targetValues.length < 5 ||
        stopValues.length < 5
      )
        ? 'SMALL_SAMPLE'
        : null

  };
}


/*
===========================================================
 HEADER
===========================================================
*/

console.log(
  '===================================================='
);

console.log(
  'TradeMind Pro — M1-C Failure Anatomy'
);

console.log(
  '===================================================='
);

console.log(
  'STEP: Feature Separation Audit'
);


/*
===========================================================
 LOAD
===========================================================
*/

if (
  !fs.existsSync(
    INPUT_FILE
  )
) {

  throw new Error(
    `Input not found: ${INPUT_FILE}`
  );
}


const data =
  loadJson(
    INPUT_FILE
  );


const trades =
  data.reconstructedTrades;


if (
  !Array.isArray(
    trades
  )
) {

  throw new Error(
    'reconstructedTrades is not an array.'
  );
}


if (
  trades.length !==
  14
) {

  throw new Error(
    `Expected 14 trades, received ${trades.length}.`
  );
}


/*
===========================================================
 GROUPS
===========================================================
*/

const targets =
  trades.filter(
    item =>
      item.outcome ===
      'TARGET'
  );

const stops =
  trades.filter(
    item =>
      item.outcome ===
      'STOP'
  );

const sessionCloses =
  trades.filter(
    item =>
      item.outcome ===
      'SESSION_CLOSE'
  );


if (
  targets.length !== 2 ||
  stops.length !== 10 ||
  sessionCloses.length !== 2
) {

  throw new Error(
    'Frozen outcome counts do not match M1-C Layer 2.'
  );
}


/*
===========================================================
 FEATURE AUDIT
===========================================================
*/

const featureSeparation = {

  atr14:
    featureAudit(
      targets,
      stops,
      'atr14'
    ),

  entryGapAtr:
    featureAudit(
      targets,
      stops,
      'entryGapAtr'
    )

};


/*
===========================================================
 ABSOLUTE ENTRY GAP
===========================================================
*/

const targetAbsGap =
  targets.map(
    item =>
      Math.abs(
        Number(
          item.entryGapAtr
        )
      )
  );

const stopAbsGap =
  stops.map(
    item =>
      Math.abs(
        Number(
          item.entryGapAtr
        )
      )
  );


featureSeparation.absoluteEntryGapAtr = {

  target: {

    count:
      targetAbsGap.length,

    average:
      average(targetAbsGap),

    median:
      median(targetAbsGap),

    range:
      range(targetAbsGap)

  },

  stop: {

    count:
      stopAbsGap.length,

    average:
      average(stopAbsGap),

    median:
      median(stopAbsGap),

    range:
      range(stopAbsGap)

  },

  observedRangeOverlap:
    overlap(
      targetAbsGap,
      stopAbsGap
    ),

  sampleWarning:
    'SMALL_SAMPLE'

};


/*
===========================================================
 DIRECTION
===========================================================
*/

const direction = {

  TARGET:
    directionCounts(
      targets
    ),

  STOP:
    directionCounts(
      stops
    ),

  SESSION_CLOSE:
    directionCounts(
      sessionCloses
    ),

  ALL:
    directionCounts(
      trades
    )

};


/*
===========================================================
 TIME OF DAY
===========================================================
*/

const timeOfDay = {

  TARGET: {},

  STOP: {},

  SESSION_CLOSE: {}

};


for (
  const trade
  of targets
) {

  const bucket =
    timeBucket(
      trade.signalTimestamp
    );

  timeOfDay.TARGET[bucket] =
    (
      timeOfDay.TARGET[bucket] ||
      0
    ) + 1;
}


for (
  const trade
  of stops
) {

  const bucket =
    timeBucket(
      trade.signalTimestamp
    );

  timeOfDay.STOP[bucket] =
    (
      timeOfDay.STOP[bucket] ||
      0
    ) + 1;
}


for (
  const trade
  of sessionCloses
) {

  const bucket =
    timeBucket(
      trade.signalTimestamp
    );

  timeOfDay.SESSION_CLOSE[bucket] =
    (
      timeOfDay.SESSION_CLOSE[bucket] ||
      0
    ) + 1;
}


/*
===========================================================
 FEATURE BUCKETS
===========================================================
*/

const entryGapBuckets = {

  TARGET:
    bucketCounts(
      targets,
      'entryGapAtr',
      [
        -0.25,
        -0.10,
        0,
        0.025,
        0.05,
        0.10,
        0.20,
        0.30
      ]
    ),

  STOP:
    bucketCounts(
      stops,
      'entryGapAtr',
      [
        -0.25,
        -0.10,
        0,
        0.025,
        0.05,
        0.10,
        0.20,
        0.30
      ]
    )

};


const atrBuckets = {

  TARGET:
    bucketCounts(
      targets,
      'atr14',
      [
        0,
        10,
        11,
        12,
        13,
        14,
        16,
        20
      ]
    ),

  STOP:
    bucketCounts(
      stops,
      'atr14',
      [
        0,
        10,
        11,
        12,
        13,
        14,
        16,
        20
      ]
    )

};


/*
===========================================================
 PER-TRADE FEATURE TABLE
===========================================================
*/

const tradeFeatureTable =
  trades.map(
    trade => ({

      file:
        trade.file,

      episodes:
        trade.episodes,

      signal:
        trade.signal,

      signalTimestamp:
        trade.signalTimestamp,

      entryGapAtr:
        trade.entryGapAtr,

      absoluteEntryGapAtr:
        Math.abs(
          Number(
            trade.entryGapAtr
          )
        ),

      atr14:
        trade.atr14,

      outcome:
        trade.outcome,

      rMultiple:
        trade.rMultiple,

      timeBucket:
        timeBucket(
          trade.signalTimestamp
        )

    })
  );


/*
===========================================================
 DESCRIPTIVE CONCLUSION
===========================================================
*/

const conclusion = {

  targetCount:
    targets.length,

  stopCount:
    stops.length,

  direction:

    (
      targets.length === 2 &&
      direction.TARGET.BUY === 1 &&
      direction.TARGET.SELL === 1
    )
      ? 'NO_DIRECTIONAL_SEPARATION_OBSERVED'
      : 'INSUFFICIENT_OR_MIXED',

  entryGap:

    featureSeparation.entryGapAtr
      .observedRangeOverlap
      ? 'OVERLAP_PRESENT'
      : 'NO_OBSERVED_RANGE_OVERLAP',

  absoluteEntryGap:

    featureSeparation.absoluteEntryGapAtr
      .observedRangeOverlap
      ? 'OVERLAP_PRESENT'
      : 'NO_OBSERVED_RANGE_OVERLAP',

  atr14:

    featureSeparation.atr14
      .observedRangeOverlap
      ? 'OVERLAP_PRESENT'
      : 'NO_OBSERVED_RANGE_OVERLAP',

  thresholdStatus:
    'NOT_TESTED',

  filterStatus:
    'NOT_CREATED',

  interpretation:
    'Descriptive separation only. Small TARGET sample prevents reliable threshold inference.'

};


/*
===========================================================
 TERMINAL REPORT
===========================================================
*/

console.log(
  '----------------------------------------------------'
);

console.log(
  'M1-C FEATURE SEPARATION'
);

console.log(
  JSON.stringify(
    featureSeparation,
    null,
    2
  )
);

console.log(
  '----------------------------------------------------'
);

console.log(
  'DIRECTION'
);

console.log(
  JSON.stringify(
    direction,
    null,
    2
  )
);

console.log(
  '----------------------------------------------------'
);

console.log(
  'TIME OF DAY'
);

console.log(
  JSON.stringify(
    timeOfDay,
    null,
    2
  )
);

console.log(
  '----------------------------------------------------'
);

console.log(
  'DESCRIPTIVE CONCLUSION'
);

console.log(
  JSON.stringify(
    conclusion,
    null,
    2
  )
);


/*
===========================================================
 OUTPUT
===========================================================
*/

const output = {

  schema:
    'TradeMind-Pro-M1-C-Feature-Separation-v1',

  status:
    'COMPLETED',

  researchOnly:
    true,

  learningEnabled:
    false,

  strategyMutation:
    false,

  promotionEnabled:
    false,

  thresholdOptimization:
    false,

  validityFilterCreated:
    false,

  source:
    'm1-c-reconstructed-trades.json',

  frozenBaseline: {

    lifecycleBlockedEpisodes:
      99,

    uniqueOpportunities:
      64,

    acceptedTrades:
      14,

    target:
      2,

    stop:
      10,

    sessionClose:
      2,

    netR:
      -5.392430501588261

  },

  featureSeparation,

  direction,

  timeOfDay,

  entryGapBuckets,

  atrBuckets,

  tradeFeatureTable,

  conclusion

};


fs.writeFileSync(

  OUTPUT_FILE,

  JSON.stringify(
    output,
    null,
    2
  ) +
  '\n',

  'utf8'

);


/*
===========================================================
 FINAL
===========================================================
*/

console.log(
  '----------------------------------------------------'
);

console.log(
  `Output: ${OUTPUT_FILE}`
);

console.log(
  'M1-C feature separation: PASS'
);

console.log(
  'No threshold optimized.'
);

console.log(
  'No validity filter created.'
);

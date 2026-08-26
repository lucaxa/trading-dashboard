/*
===========================================================
TradeMind Pro — M1-D Failure Attribution
===========================================================

Purpose
-------
Perform evidence-based failure attribution on the frozen
M1-B sequentially accepted counterfactual opportunities.

Scope
-----
M1-B accepted opportunities only.

Method
------
Classify only what the frozen evidence establishes.

STOP:
  Stop was reached before target.

TARGET:
  Target was reached before stop.

SESSION_CLOSE:
  Neither target nor stop was reached before the
  session-close boundary.

No unsupported causal explanation is invented.

Research only.

NO:
- learning
- threshold optimization
- validity filter
- strategy mutation
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

const ROOT =
  path.resolve(
    __dirname,
    '..'
  );

const INPUT_FILE =
  path.join(
    ROOT,
    'failure-anatomy',
    'outputs',
    'm1-c-reconstructed-trades.json'
  );

const OUTPUT_DIR =
  path.join(
    __dirname,
    'outputs'
  );

const OUTPUT_FILE =
  path.join(
    OUTPUT_DIR,
    'm1-d-failure-attribution.json'
  );


fs.mkdirSync(
  OUTPUT_DIR,
  {
    recursive: true
  }
);


/*
===========================================================
 HELPERS
===========================================================
*/

function finite(
  value
) {

  return Number.isFinite(
    Number(value)
  );
}


function number(
  value
) {

  return Number(value);
}


function average(
  values
) {

  if (
    values.length === 0
  ) {

    return null;
  }

  return (
    values.reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    ) /
    values.length
  );
}


function absolute(
  value
) {

  return Math.abs(
    number(value)
  );
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
  'TradeMind Pro — M1-D Failure Attribution'
);

console.log(
  '===================================================='
);

console.log(
  'STEP: Evidence-Based Failure Attribution'
);

console.log(
  `Input: ${INPUT_FILE}`
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
    `M1-C reconstructed input not found: ${INPUT_FILE}`
  );
}


const data =
  JSON.parse(
    fs.readFileSync(
      INPUT_FILE,
      'utf8'
    )
  );


const trades =
  data.reconstructedTrades;


if (
  !Array.isArray(
    trades
  )
) {

  throw new Error(
    'M1-C reconstructedTrades is not an array.'
  );
}


if (
  trades.length !==
  14
) {

  throw new Error(
    `Expected 14 reconstructed trades, received ${trades.length}.`
  );
}


/*
===========================================================
 FROZEN OUTCOME AUDIT
===========================================================
*/

const targets =
  trades.filter(
    trade =>
      trade.outcome ===
      'TARGET'
  );

const stops =
  trades.filter(
    trade =>
      trade.outcome ===
      'STOP'
  );

const sessionCloses =
  trades.filter(
    trade =>
      trade.outcome ===
      'SESSION_CLOSE'
  );


if (
  targets.length !== 2 ||
  stops.length !== 10 ||
  sessionCloses.length !== 2
) {

  throw new Error(
    'Frozen M1-C outcome counts do not match expected baseline.'
  );
}


/*
===========================================================
 TRADE-LEVEL ATTRIBUTION
===========================================================
*/

const attributedTrades =
  trades.map(
    trade => {

      let primaryAttribution;

      let evidenceBasis;


      if (
        trade.outcome ===
        'TARGET'
      ) {

        primaryAttribution =
          'SUCCESSFUL_FOLLOW_THROUGH';

        evidenceBasis =
          'Target reached before the counterfactual position resolved.';

      } else if (
        trade.outcome ===
        'STOP'
      ) {

        primaryAttribution =
          'ADVERSE_MOVE_TO_STOP';

        evidenceBasis =
          'Stop loss was reached before target resolution.';

      } else if (
        trade.outcome ===
        'SESSION_CLOSE'
      ) {

        primaryAttribution =
          'NO_TARGET_OR_STOP_BEFORE_SESSION_CLOSE';

        evidenceBasis =
          'Position remained unresolved by target/stop and was closed at the session boundary.';

      } else {

        primaryAttribution =
          'UNDETERMINED';

        evidenceBasis =
          'Outcome classification is outside the frozen M1-C outcome set.';

      }


      /*
      -----------------------------------------------
      Secondary diagnostics
      -----------------------------------------------
      These are descriptive only. They are NOT causal
      claims.
      -----------------------------------------------
      */

      const gap =
        finite(
          trade.entryGapAtr
        )
          ? number(
              trade.entryGapAtr
            )
          : null;

      const absGap =
        finite(
          trade.entryGapAtr
        )
          ? absolute(
              trade.entryGapAtr
            )
          : null;

      const atr =
        finite(
          trade.atr14
        )
          ? number(
              trade.atr14
            )
          : null;


      return {

        episodes:
          trade.episodes,

        file:
          trade.file,

        signal:
          trade.signal,

        signalTimestamp:
          trade.signalTimestamp,

        signalCandleTimestamp:
          trade.signalCandleTimestamp,

        entryTimestamp:
          trade.entryTimestamp,

        entry:
          trade.entry,

        atr14:
          atr,

        risk:
          trade.risk,

        stop:
          trade.stop,

        target:
          trade.target,

        entryGapAtr:
          gap,

        absoluteEntryGapAtr:
          absGap,

        outcome:
          trade.outcome,

        outcomeTimestamp:
          trade.outcomeTimestamp,

        rMultiple:
          trade.rMultiple,

        primaryAttribution,

        evidenceBasis,

        causalInference:
          'NOT_ESTABLISHED'

      };

    }
  );


/*
===========================================================
 FAILURE COUNTS
===========================================================
*/

const attributionCounts = {

  SUCCESSFUL_FOLLOW_THROUGH:
    attributedTrades.filter(
      trade =>
        trade.primaryAttribution ===
        'SUCCESSFUL_FOLLOW_THROUGH'
    ).length,

  ADVERSE_MOVE_TO_STOP:
    attributedTrades.filter(
      trade =>
        trade.primaryAttribution ===
        'ADVERSE_MOVE_TO_STOP'
    ).length,

  NO_TARGET_OR_STOP_BEFORE_SESSION_CLOSE:
    attributedTrades.filter(
      trade =>
        trade.primaryAttribution ===
        'NO_TARGET_OR_STOP_BEFORE_SESSION_CLOSE'
    ).length,

  UNDETERMINED:
    attributedTrades.filter(
      trade =>
        trade.primaryAttribution ===
        'UNDETERMINED'
    ).length

};


/*
===========================================================
 STOP DIAGNOSTICS
===========================================================
*/

const stopTrades =
  attributedTrades.filter(
    trade =>
      trade.primaryAttribution ===
      'ADVERSE_MOVE_TO_STOP'
  );


const stopGapValues =
  stopTrades
    .map(
      trade =>
        trade.absoluteEntryGapAtr
    )
    .filter(
      finite
    );


const stopAtrValues =
  stopTrades
    .map(
      trade =>
        trade.atr14
    )
    .filter(
      finite
    );


const stopDirections = {

  BUY:
    stopTrades.filter(
      trade =>
        trade.signal ===
        'BUY'
    ).length,

  SELL:
    stopTrades.filter(
      trade =>
        trade.signal ===
        'SELL'
    ).length

};


/*
===========================================================
 TARGET DIAGNOSTICS
===========================================================
*/

const targetGapValues =
  targets
    .map(
      trade =>
        absolute(
          trade.entryGapAtr
        )
    )
    .filter(
      finite
    );


const targetAtrValues =
  targets
    .map(
      trade =>
        number(
          trade.atr14
        )
    )
    .filter(
      finite
    );


/*
===========================================================
 DESCRIPTIVE FAILURE PROFILE
===========================================================
*/

const failureProfile = {

  stopTrades: {

    count:
      stopTrades.length,

    direction:
      stopDirections,

    averageAbsoluteEntryGapAtr:
      average(
        stopGapValues
      ),

    averageAtr14:
      average(
        stopAtrValues
      ),

    totalR:
      stopTrades.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          number(
            trade.rMultiple
          ),
        0
      )

  },

  targetTrades: {

    count:
      targets.length,

    direction: {

      BUY:
        targets.filter(
          trade =>
            trade.signal ===
            'BUY'
        ).length,

      SELL:
        targets.filter(
          trade =>
            trade.signal ===
            'SELL'
        ).length

    },

    averageAbsoluteEntryGapAtr:
      average(
        targetGapValues
      ),

    averageAtr14:
      average(
        targetAtrValues
      ),

    totalR:
      targets.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          number(
            trade.rMultiple
          ),
        0
      )

  },

  sessionCloseTrades: {

    count:
      sessionCloses.length,

    totalR:
      sessionCloses.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          number(
            trade.rMultiple
          ),
        0
      )

  }

};


/*
===========================================================
 RESEARCH INTERPRETATION
===========================================================
*/

const interpretation = {

  primaryFailureMechanism:
    'ADVERSE_MOVE_TO_STOP',

  stopCount:
    attributionCounts.ADVERSE_MOVE_TO_STOP,

  sessionCloseCount:
    attributionCounts.NO_TARGET_OR_STOP_BEFORE_SESSION_CLOSE,

  targetCount:
    attributionCounts.SUCCESSFUL_FOLLOW_THROUGH,

  causalExplanationStatus:
    'NOT_ESTABLISHED',

  filterRecommendation:
    'NONE',

  thresholdRecommendation:
    'NONE',

  strategyChangeRecommendation:
    'NONE',

  reason:
    'The frozen sample establishes observed outcomes but does not provide sufficient evidence to infer a stable causal failure rule.'

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
  'M1-D ATTRIBUTION SUMMARY'
);

console.log(
  JSON.stringify(
    attributionCounts,
    null,
    2
  )
);

console.log(
  '----------------------------------------------------'
);

console.log(
  'M1-D FAILURE PROFILE'
);

console.log(
  JSON.stringify(
    failureProfile,
    null,
    2
  )
);

console.log(
  '----------------------------------------------------'
);

console.log(
  'M1-D INTERPRETATION'
);

console.log(
  JSON.stringify(
    interpretation,
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
    'TradeMind-Pro-M1-D-Failure-Attribution-v1',

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

  frozenSource:
    'm1-c-reconstructed-trades.json',

  baseline: {

    acceptedTrades:
      14,

    target:
      2,

    stop:
      10,

    sessionClose:
      2,

    netR:
      trades.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          number(
            trade.rMultiple
          ),
        0
      )

  },

  attributionCounts,

  failureProfile,

  interpretation,

  attributedTrades

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
  'M1-D failure attribution: PASS'
);

console.log(
  'No validity filter created.'
);

console.log(
  'No threshold optimized.'
);

console.log(
  'No strategy mutation performed.'
);

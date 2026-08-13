/*
===========================================================
 TradeMind Pro
 V25.33 — CONTROLLED TRANSITION-DIRECTION ATTRIBUTION
===========================================================

PURPOSE
-------
Determine whether the descriptive direction-changing behavior
observed in V25.32 is attributable differently to:

  BULL -> BEAR transitions
  BEAR -> BULL transitions

This is attribution research only.

RESEARCH CONTROLS
-----------------
- Frozen V25.10 learning dataset only.
- V25.32 transition evidence is the direct input.
- No feature selection.
- No threshold search.
- No parameter optimization.
- No P&L ranking.
- No cherry-picking.
- No strategy promotion.
- No live trading.
- No broker orders.

IMPORTANT
---------
V25.33 does NOT search for a profitable transition rule.

It only partitions the already-defined V25.32 transition
observations by transition direction and describes the
observed outcomes.

OUTPUT
------
v25_33_controlled_transition_direction_attribution.json
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "V25.33";
const DATASET_VERSION = "V25.10";
const SOURCE_VERSION = "V25.32";

const INPUT_NAME = "v25_32_controlled_regime_transition_research.json";
const OUTPUT_NAME =
  "v25_33_controlled_transition_direction_attribution.json";

function fail(message) {
  throw new Error(message);
}

function firstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

/*
-----------------------------------------------------------
LOCATE V25.32 SOURCE
-----------------------------------------------------------
*/

const inputPath = firstExisting([
  path.resolve(INPUT_NAME),
  path.resolve(process.cwd(), INPUT_NAME),
  path.resolve(__dirname, INPUT_NAME),
  path.resolve(
    process.cwd(),
    ".github",
    "scripts",
    INPUT_NAME
  )
]);

if (!inputPath) {
  fail(
    `V25.32 source artifact not found: ${INPUT_NAME}`
  );
}

const source = loadJson(inputPath);

/*
-----------------------------------------------------------
VERIFY SOURCE
-----------------------------------------------------------
*/

if (
  !source ||
  source.version !== SOURCE_VERSION
) {
  fail(
    `Expected V25.32 source result, received ${
      source && source.version
        ? source.version
        : "unknown"
    }.`
  );
}

if (
  source.status !==
  "CONTROLLED_REGIME_TRANSITION_RESEARCH_COMPLETE"
) {
  fail(
    "V25.32 source status is not the required completed research status."
  );
}

if (
  !source.dataset ||
  source.dataset.requiredVersion !== DATASET_VERSION
) {
  fail(
    "V25.32 source does not identify the required frozen V25.10 dataset."
  );
}

if (
  !Array.isArray(source.transitionWindows)
) {
  fail(
    "V25.32 transitionWindows array is missing."
  );
}

if (source.transitionWindows.length < 1) {
  fail(
    "V25.32 contains no transition observations."
  );
}

/*
-----------------------------------------------------------
TRANSITION-DIRECTION ATTRIBUTION
-----------------------------------------------------------

Only the transition direction is used for partitioning:

  BULL -> BEAR
  BEAR -> BULL

No threshold or optimization is introduced.
-----------------------------------------------------------
*/

const groups = {
  BULL_TO_BEAR: [],
  BEAR_TO_BULL: []
};

for (const item of source.transitionWindows) {
  if (!item || !item.from || !item.to) {
    continue;
  }

  if (
    item.from === "BULL" &&
    item.to === "BEAR"
  ) {
    groups.BULL_TO_BEAR.push(item);
  }

  if (
    item.from === "BEAR" &&
    item.to === "BULL"
  ) {
    groups.BEAR_TO_BULL.push(item);
  }
}

/*
-----------------------------------------------------------
DESCRIPTIVE GROUP SUMMARY
-----------------------------------------------------------
*/

function summarize(items) {
  let interpretable = 0;
  let directionChanged = 0;

  let beforeSum = 0;
  let afterSum = 0;

  let beforePositive = 0;
  let afterPositive = 0;

  let beforeDirectionUp = 0;
  let beforeDirectionDown = 0;

  let afterDirectionUp = 0;
  let afterDirectionDown = 0;

  for (const item of items) {
    const before =
      item.before || {};

    const after =
      item.after || {};

    const beforeMean =
      num(before.meanFutureReturn);

    const afterMean =
      num(after.meanFutureReturn);

    if (
      beforeMean !== null &&
      afterMean !== null
    ) {
      interpretable++;

      beforeSum += beforeMean;
      afterSum += afterMean;

      if (beforeMean > 0) {
        beforePositive++;
      }

      if (afterMean > 0) {
        afterPositive++;
      }

      if (
        Math.sign(beforeMean) !==
        Math.sign(afterMean)
      ) {
        directionChanged++;
      }
    }

    beforeDirectionUp +=
      num(before.directionUp) || 0;

    beforeDirectionDown +=
      num(before.directionDown) || 0;

    afterDirectionUp +=
      num(after.directionUp) || 0;

    afterDirectionDown +=
      num(after.directionDown) || 0;
  }

  return {
    transitionCount: items.length,

    interpretableTransitionCount:
      interpretable,

    directionChangedTransitionCount:
      directionChanged,

    directionChangedRate:
      interpretable
        ? directionChanged / interpretable
        : null,

    meanOfBeforeWindowMeans:
      interpretable
        ? beforeSum / interpretable
        : null,

    meanOfAfterWindowMeans:
      interpretable
        ? afterSum / interpretable
        : null,

    positiveBeforeWindowMeanCount:
      beforePositive,

    positiveAfterWindowMeanCount:
      afterPositive,

    beforeDirectionUp:
      beforeDirectionUp,

    beforeDirectionDown:
      beforeDirectionDown,

    afterDirectionUp:
      afterDirectionUp,

    afterDirectionDown:
      afterDirectionDown
  };
}

const attribution = {
  BULL_TO_BEAR:
    summarize(groups.BULL_TO_BEAR),

  BEAR_TO_BULL:
    summarize(groups.BEAR_TO_BULL)
};

/*
-----------------------------------------------------------
BALANCE / COVERAGE DESCRIPTION
-----------------------------------------------------------
*/

const totalDirectionalTransitions =
  groups.BULL_TO_BEAR.length +
  groups.BEAR_TO_BULL.length;

const coverageCheck =
  totalDirectionalTransitions ===
  source.transitionWindows.filter(
    item =>
      item &&
      (
        (
          item.from === "BULL" &&
          item.to === "BEAR"
        ) ||
        (
          item.from === "BEAR" &&
          item.to === "BULL"
        )
      )
  ).length;

/*
-----------------------------------------------------------
DESCRIPTIVE INTERPRETATION
-----------------------------------------------------------
*/

const bullToBearRate =
  attribution.BULL_TO_BEAR
    .directionChangedRate;

const bearToBullRate =
  attribution.BEAR_TO_BULL
    .directionChangedRate;

let classification =
  "MIXED_TRANSITION_DIRECTION_EVIDENCE";

if (
  totalDirectionalTransitions === 0
) {
  classification =
    "INSUFFICIENT_DIRECTIONAL_TRANSITION_EVIDENCE";
} else if (
  bullToBearRate !== null &&
  bearToBullRate !== null &&
  bullToBearRate === bearToBullRate
) {
  classification =
    "SYMMETRIC_DESCRIPTIVE_DIRECTION_BEHAVIOR";
}

/*
IMPORTANT:
No "winner" is selected.

Even if one transition type has a higher
directionChangedRate, V25.33 does NOT promote it.
*/

const result = {
  status:
    "CONTROLLED_TRANSITION_DIRECTION_ATTRIBUTION_COMPLETE",

  version: VERSION,

  mode:
    "controlled_descriptive_attribution",

  source: {
    version: SOURCE_VERSION,
    file: path.basename(inputPath),
    sha256: sha256File(inputPath)
  },

  frozenDataset: {
    requiredVersion: DATASET_VERSION,

    inheritedRows:
      source.dataset.rowsRead,

    inheritedUsableRows:
      source.dataset.usableRows
  },

  researchQuestion:
    "Is the V25.32 direction-changing transition behavior descriptively concentrated in one transition direction, BULL-to-BEAR or BEAR-to-BULL?",

  controls: {
    featureSelection: false,
    thresholdSearch: false,
    parameterSearch: false,
    optimization: false,
    pAndLRanking: false,
    cherryPicking: false,
    strategyPromotion: false,
    predictiveClaim: false,
    liveTrading: false,
    brokerOrders: false
  },

  transitionUniverse: {
    sourceTransitionCount:
      source.transitionWindows.length,

    directionalTransitionCount:
      totalDirectionalTransitions,

    coverageCheck:
      coverageCheck
  },

  attribution,

  descriptiveClassification:
    classification,

  interpretationRules: {
    directionChangedRate:
      "descriptive fraction of interpretable transition windows whose before/after mean future-return signs differ",

    noThresholdWasSearched: true,

    noTransitionTypeWasSelected:
      true,

    noProfitabilityClaim:
      true
  },

  prohibitedConclusions: [
    "transition_direction_is_profitable",
    "transition_direction_should_be_traded",
    "transition_direction_is_optimal",
    "transition_direction_is_predictive_out_of_sample",
    "transition_direction_should_be_promoted_to_strategy"
  ],

  nextStage:
    "V25.34_CONTROLLED_TRANSITION_CONTEXT_RESEARCH",

  generatedAtUtc:
    new Date().toISOString()
};

fs.writeFileSync(
  OUTPUT_NAME,
  JSON.stringify(result, null, 2) + "\n"
);

console.log(
  JSON.stringify(result, null, 2)
);

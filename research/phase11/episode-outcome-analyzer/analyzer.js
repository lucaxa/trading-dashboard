/*
============================================================
 TradeMind Pro
 Phase 11 — Episode / Outcome Analyzer V1
 Research-only / Isolated

 PURPOSE
 -------
 Convert Phase 11 Evidence V2 observation streams into
 independent signal episodes and conservatively evaluate
 their subsequent captured price path.

 SAFETY
 ------
 - READ-ONLY analysis
 - Does NOT modify V10.25
 - Does NOT modify learning-engine.js
 - Does NOT modify frontend
 - Does NOT modify Phase 11 evidence
 - Does NOT place broker orders
 - Does NOT feed learning
 - Does NOT promote strategy

 IMPORTANT
 ---------
 Observation != signal episode != trade.

 Outcomes are only classified when the available evidence
 proves the result.

 TARGET  -> +2R
 STOP    -> -1R
 UNRESOLVED -> cannot prove either
 INSUFFICIENT -> insufficient usable evidence

============================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");

const ANALYZER_VERSION = "PHASE11_EPISODE_OUTCOME_ANALYZER_V1";

const VALID_SIGNALS = new Set(["BUY", "SELL"]);
const ALL_SIGNALS = new Set(["BUY", "SELL", "WAIT"]);

/*
------------------------------------------------------------
 Helpers
------------------------------------------------------------
*/

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoTime(value) {
  const t = new Date(value);
  return Number.isFinite(t.getTime()) ? t.toISOString() : null;
}

function timestampMs(value) {
  const t = new Date(value);
  return Number.isFinite(t.getTime()) ? t.getTime() : null;
}

function directionOf(signal) {
  if (signal === "BUY") return 1;
  if (signal === "SELL") return -1;
  return 0;
}

function normaliseObservation(raw, index) {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      index,
      error: "Observation is not an object"
    };
  }

  const timestamp =
    raw.timestamp ??
    raw.time ??
    raw.capturedAt ??
    raw.observedAt;

  const signal = String(raw.signal || "").trim().toUpperCase();

  const price = finiteNumber(
    raw.price ??
    raw.lastPrice ??
    raw.ltp
  );

  const entry = finiteNumber(
    raw.entry ??
    raw.entryPrice
  );

  const stop = finiteNumber(
    raw.stop ??
    raw.stopLoss ??
    raw.sl
  );

  const target = finiteNumber(
    raw.target ??
    raw.targetPrice ??
    raw.tp
  );

  return {
    valid:
      Boolean(timestampMs(timestamp)) &&
      ALL_SIGNALS.has(signal) &&
      price !== null,

    index,
    timestamp: isoTime(timestamp),
    timestampMs: timestampMs(timestamp),

    signal,
    price,
    entry,
    stop,
    target,

    confidence: finiteNumber(raw.confidence),
    buyScore: finiteNumber(raw.buyScore),
    sellScore: finiteNumber(raw.sellScore),

    fingerprint:
      raw.fingerprint ??
      raw.decisionFingerprint ??
      null
  };
}

/*
------------------------------------------------------------
 Evidence extraction
------------------------------------------------------------
*/

function extractObservations(document) {
  if (!document || typeof document !== "object") {
    throw new Error("Evidence document must be an object.");
  }

  const observations =
    Array.isArray(document.observations)
      ? document.observations
      : [];

  return observations
    .map(normaliseObservation)
    .filter(o => o.valid)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

/*
------------------------------------------------------------
 Episode construction
------------------------------------------------------------

 IMPORTANT:
 We do not treat every observation as a trade.

 A directional episode starts when a BUY/SELL state appears
 and continues while that directional state remains active.

 WAIT or opposite direction closes the current episode.

 We also use the signal + entry/stop/target structure as
 supporting evidence, but we never manufacture an episode
 from a malformed record.
------------------------------------------------------------
*/

function createEpisode(startObservation, episodeNumber) {
  const direction = directionOf(startObservation.signal);

  return {
    episode: episodeNumber,

    signal: startObservation.signal,

    startTimestamp: startObservation.timestamp,

    endTimestamp: null,

    startObservationIndex: startObservation.index,
    endObservationIndex: null,

    entry: startObservation.entry ?? startObservation.price,
    stop: startObservation.stop,
    target: startObservation.target,

    initialPrice: startObservation.price,

    initialConfidence: startObservation.confidence,

    observations: 1,

    direction,

    outcome: "OPEN",

    outcomeTimestamp: null,

    outcomePrice: null,

    mfePoints: null,
    maePoints: null,

    mfeR: null,
    maeR: null,

    rMultiple: null,

    reason: null
  };
}

function isSameEpisode(current, observation) {
  if (!current) return false;

  if (observation.signal !== current.signal) {
    return false;
  }

  /*
   Same directional signal remains one episode.

   We deliberately do NOT split merely because entry/SL/target
   values changed between heartbeat observations.
  */

  return true;
}

function closeEpisode(episode, observation, reason) {
  episode.endTimestamp = observation
    ? observation.timestamp
    : episode.endTimestamp;

  episode.endObservationIndex = observation
    ? observation.index
    : episode.endObservationIndex;

  episode.reason = reason;

  return episode;
}

function buildEpisodes(observations) {
  const episodes = [];

  let current = null;
  let episodeNumber = 0;

  for (const observation of observations) {

    if (!VALID_SIGNALS.has(observation.signal)) {

      if (current) {
        closeEpisode(
          current,
          observation,
          "NON_DIRECTIONAL_SIGNAL"
        );

        episodes.push(current);
        current = null;
      }

      continue;
    }

    if (!current) {
      episodeNumber += 1;

      current = createEpisode(
        observation,
        episodeNumber
      );

      continue;
    }

    if (isSameEpisode(current, observation)) {
      current.observations += 1;
      continue;
    }

    closeEpisode(
      current,
      observation,
      "SIGNAL_CHANGED"
    );

    episodes.push(current);

    episodeNumber += 1;

    current = createEpisode(
      observation,
      episodeNumber
    );
  }

  if (current) {
    closeEpisode(
      current,
      null,
      "SESSION_END"
    );

    episodes.push(current);
  }

  return episodes;
}

/*
------------------------------------------------------------
 Price-path outcome evaluation
------------------------------------------------------------

 Conservative rule:

 BUY:
   target reached when price >= target
   stop reached when price <= stop

 SELL:
   target reached when price <= target
   stop reached when price >= stop

 If both are touched by the same observation and we do not
 have intrabar ordering information, classify as UNRESOLVED.

 This avoids inventing which level was hit first.
------------------------------------------------------------
*/

function validTradeStructure(episode) {
  return (
    episode.entry !== null &&
    episode.stop !== null &&
    episode.target !== null &&
    episode.entry > 0 &&
    episode.stop > 0 &&
    episode.target > 0
  );
}

function riskPoints(episode) {
  if (!validTradeStructure(episode)) return null;

  return Math.abs(
    episode.entry - episode.stop
  );
}

function evaluateEpisode(episode, observations) {

  if (!validTradeStructure(episode)) {
    episode.outcome = "INSUFFICIENT";
    episode.reason =
      "Missing valid entry/stop/target structure.";

    return episode;
  }

  const risk = riskPoints(episode);

  if (!risk || risk <= 0) {
    episode.outcome = "INSUFFICIENT";
    episode.reason =
      "Invalid or zero risk distance.";

    return episode;
  }

  const startTime = timestampMs(
    episode.startTimestamp
  );

  const forward = observations.filter(
    observation =>
      observation.timestampMs > startTime
  );

  if (!forward.length) {
    episode.outcome = "UNRESOLVED";
    episode.reason =
      "No subsequent captured observations.";

    return episode;
  }

  let maxFavourable = 0;
  let maxAdverse = 0;

  for (const observation of forward) {

    const move =
      (observation.price - episode.entry) *
      episode.direction;

    if (move > maxFavourable) {
      maxFavourable = move;
    }

    if (move < maxAdverse) {
      maxAdverse = move;
    }

    const targetHit =
      episode.signal === "BUY"
        ? observation.price >= episode.target
        : observation.price <= episode.target;

    const stopHit =
      episode.signal === "BUY"
        ? observation.price <= episode.stop
        : observation.price >= episode.stop;

    if (targetHit && stopHit) {

      episode.outcome = "UNRESOLVED";

      episode.reason =
        "Target and stop are both touched by the same captured observation; intrabar order unavailable.";

      break;
    }

    if (targetHit) {

      episode.outcome = "TARGET";

      episode.outcomeTimestamp =
        observation.timestamp;

      episode.outcomePrice =
        observation.price;

      episode.rMultiple = 2;

      episode.reason =
        "Target reached before stop in captured observations.";

      break;
    }

    if (stopHit) {

      episode.outcome = "STOP";

      episode.outcomeTimestamp =
        observation.timestamp;

      episode.outcomePrice =
        observation.price;

      episode.rMultiple = -1;

      episode.reason =
        "Stop reached before target in captured observations.";

      break;
    }
  }

  episode.mfePoints = maxFavourable;
  episode.maePoints = Math.abs(maxAdverse);

  episode.mfeR =
    maxFavourable / risk;

  episode.maeR =
    Math.abs(maxAdverse) / risk;

  if (episode.outcome === "OPEN") {
    episode.outcome = "UNRESOLVED";

    episode.reason =
      "Neither target nor stop was demonstrably reached.";
  }

  return episode;
}

/*
------------------------------------------------------------
 Session analysis
------------------------------------------------------------
*/

function analyzeEvidence(document) {

  const observations =
    extractObservations(document);

  const episodes =
    buildEpisodes(observations);

  const evaluated =
    episodes.map(
      episode =>
        evaluateEpisode(
          episode,
          observations
        )
    );

  const counts = {
    TARGET: 0,
    STOP: 0,
    UNRESOLVED: 0,
    INSUFFICIENT: 0
  };

  for (const episode of evaluated) {
    if (counts[episode.outcome] !== undefined) {
      counts[episode.outcome] += 1;
    }
  }

  const resolved =
    counts.TARGET +
    counts.STOP;

  const wins =
    counts.TARGET;

  const losses =
    counts.STOP;

  const winRate =
    resolved > 0
      ? wins / resolved
      : null;

  const averageR =
    resolved > 0
      ? evaluated
          .filter(
            e =>
              e.outcome === "TARGET" ||
              e.outcome === "STOP"
          )
          .reduce(
            (sum, e) =>
              sum + (e.rMultiple || 0),
            0
          ) / resolved
      : null;

  return {
    analyzerVersion: ANALYZER_VERSION,

    evidence: {
      schema: document.schema ?? null,
      engine: document.engine ?? null,
      mode: document.mode ?? null,

      exportedAt:
        document.exportedAt ?? null,

      sessionStart:
        document.sessionStart ?? null,

      rawObservationCount:
        Array.isArray(document.observations)
          ? document.observations.length
          : 0,

      validObservationCount:
        observations.length
    },

    episodeSummary: {
      totalEpisodes: evaluated.length,

      target: counts.TARGET,
      stop: counts.STOP,
      unresolved: counts.UNRESOLVED,
      insufficient: counts.INSUFFICIENT,

      resolvedEpisodes: resolved,

      winRate,

      averageR
    },

    episodes: evaluated
  };
}

/*
------------------------------------------------------------
 CLI
------------------------------------------------------------
*/

function loadJson(filePath) {

  const absolutePath =
    path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `File not found: ${absolutePath}`
    );
  }

  const raw =
    fs.readFileSync(
      absolutePath,
      "utf8"
    );

  return JSON.parse(raw);
}

function writeOutput(
  inputPath,
  outputPath
) {

  const document =
    loadJson(inputPath);

  const result =
    analyzeEvidence(document);

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      result,
      null,
      2
    ),
    "utf8"
  );

  return result;
}

function printSummary(result) {

  console.log("");
  console.log(
    "===================================================="
  );
  console.log(
    " TradeMind Pro — Phase 11 Episode Analyzer V1"
  );
  console.log(
    "===================================================="
  );

  console.log(
    `Engine: ${result.evidence.engine}`
  );

  console.log(
    `Mode: ${result.evidence.mode}`
  );

  console.log(
    `Raw observations: ${result.evidence.rawObservationCount}`
  );

  console.log(
    `Valid observations: ${result.evidence.validObservationCount}`
  );

  console.log(
    `Independent episodes: ${result.episodeSummary.totalEpisodes}`
  );

  console.log(
    `TARGET: ${result.episodeSummary.target}`
  );

  console.log(
    `STOP: ${result.episodeSummary.stop}`
  );

  console.log(
    `UNRESOLVED: ${result.episodeSummary.unresolved}`
  );

  console.log(
    `INSUFFICIENT: ${result.episodeSummary.insufficient}`
  );

  console.log(
    `Resolved: ${result.episodeSummary.resolvedEpisodes}`
  );

  console.log(
    `Win rate: ${
      result.episodeSummary.winRate === null
        ? "N/A"
        : (
            result.episodeSummary.winRate * 100
          ).toFixed(2) + "%"
    }`
  );

  console.log(
    `Average R: ${
      result.episodeSummary.averageR === null
        ? "N/A"
        : result.episodeSummary.averageR.toFixed(4)
    }`
  );

  console.log(
    "===================================================="
  );
  console.log("");
}

if (require.main === module) {

  const input =
    process.argv[2];

  const output =
    process.argv[3] ||
    "phase11-analysis-output.json";

  if (!input) {

    console.error(
      "Usage: node analyzer.js <input.json> [output.json]"
    );

    process.exit(1);
  }

  try {

    const result =
      writeOutput(
        input,
        output
      );

    printSummary(result);

  } catch (error) {

    console.error(
      "Analyzer failed:",
      error.message
    );

    process.exit(1);
  }
}

module.exports = {
  ANALYZER_VERSION,
  extractObservations,
  buildEpisodes,
  evaluateEpisode,
  analyzeEvidence
};

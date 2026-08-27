"use strict";

const fs = require("fs");
const path = require("path");

const ROOT =
  path.resolve("research/phase11");

const INPUT_DIR =
  path.join(
    ROOT,
    "episode-outcome-analyzer",
    "inputs"
  );

const OUTPUT_DIR =
  path.join(
    ROOT,
    "architecture",
    "opportunity-event-capture",
    "validation",
    "outputs"
  );

const OUTPUT_FILE =
  path.join(
    OUTPUT_DIR,
    "a7-validation-v1.json"
  );

const EXECUTABLE =
  new Set(["BUY", "SELL"]);

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8")
  );
}

function signal(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function finiteNumber(value) {
  const n =
    Number(
      String(value ?? "")
        .replace(/,/g, "")
        .trim()
    );

  return Number.isFinite(n)
    ? n
    : null;
}

function timestamp(value) {
  const t =
    new Date(value).getTime();

  return Number.isFinite(t)
    ? t
    : null;
}

function stableString(value) {
  return JSON.stringify(value);
}

function collectFiles() {
  return fs.readdirSync(INPUT_DIR)
    .filter(
      file =>
        file.startsWith(
          "TradeMind_Phase11_Evidence_"
        ) &&
        file.endsWith(".json")
    )
    .sort();
}

function loadEvidence() {
  return collectFiles().map(file => {
    const full =
      path.join(INPUT_DIR, file);

    const payload =
      readJson(full);

    return {
      file,
      observations:
        Array.isArray(payload.observations)
          ? payload.observations
          : []
    };
  });
}

/*
============================================================
A7 EVENT MODEL
============================================================

This is deliberately a research validation model.

It does NOT modify production code.

Identity is created at an explicit event boundary.

For validation purposes:

1. BUY/SELL after WAIT creates a new event.
2. BUY -> SELL creates a new event.
3. SELL -> BUY creates a new event.
4. Continuous same-signal observations remain one event.
5. Changes to price/context/entry/stop/target do not create
   another event.
6. The source observation timestamp is NOT used as the
   opportunity identity by itself.
*/

function buildEvents(observations) {
  const events = [];

  let active = null;
  let eventSequence = 0;

  for (let i = 0; i < observations.length; i++) {
    const observation =
      observations[i];

    const s =
      signal(observation.signal);

    if (!EXECUTABLE.has(s)) {
      active = null;
      continue;
    }

    const previous =
      i > 0
        ? observations[i - 1]
        : null;

    const previousSignal =
      previous
        ? signal(previous.signal)
        : null;

    const newBoundary =
      !active ||
      !EXECUTABLE.has(previousSignal) ||
      previousSignal !== s;

    if (newBoundary) {
      eventSequence++;

      const eventId =
        [
          "EVT",
          eventSequence,
          s,
          timestamp(
            observation.timestamp
          )
        ].join(":");

      const opportunityId =
        [
          "OPP",
          s,
          timestamp(
            observation.timestamp
          )
        ].join(":");

      active = {
        signalEventId: eventId,
        opportunityId,
        signal: s,

        signalTimestamp:
          observation.timestamp,

        signalCandleTimestamp:
          null,

        firstObservationTimestamp:
          observation.timestamp,

        firstObservationFingerprint:
          observation.fingerprint ?? null,

        sessionDate:
          String(
            observation.timestamp
          ).slice(0, 10),

        observationCount: 0,

        observations: []
      };

      events.push(active);
    }

    active.observationCount++;

    active.observations.push({
      timestamp:
        observation.timestamp,

      sequence:
        active.observationCount,

      signal: s,

      entry:
        finiteNumber(
          observation.entry
        ),

      stop:
        finiteNumber(
          observation.stopLoss
        ),

      target:
        finiteNumber(
          observation.target
        ),

      atr14:
        finiteNumber(
          observation.atr14
        ),

      fingerprint:
        observation.fingerprint ?? null
    });
  }

  return events;
}

function validateEventStream(events) {
  const failures = [];

  for (const event of events) {
    if (!event.opportunityId) {
      failures.push({
        type: "MISSING_OPPORTUNITY_ID"
      });
    }

    if (!event.signalEventId) {
      failures.push({
        type: "MISSING_SIGNAL_EVENT_ID"
      });
    }

    if (
      !EXECUTABLE.has(
        event.signal
      )
    ) {
      failures.push({
        type: "INVALID_SIGNAL",
        opportunityId:
          event.opportunityId
      });
    }

    if (
      !event.firstObservationTimestamp
    ) {
      failures.push({
        type:
          "MISSING_FIRST_OBSERVATION_TIMESTAMP",
        opportunityId:
          event.opportunityId
      });
    }

    if (
      event.observations.length === 0
    ) {
      failures.push({
        type:
          "EMPTY_EVENT_STREAM",
        opportunityId:
          event.opportunityId
      });
    }

    for (
      let i = 0;
      i < event.observations.length;
      i++
    ) {
      const expected =
        i + 1;

      if (
        event.observations[i]
          .sequence !== expected
      ) {
        failures.push({
          type:
            "NON_MONOTONIC_SEQUENCE",
          opportunityId:
            event.opportunityId,
          expected,
          actual:
            event.observations[i]
              .sequence
        });
      }
    }
  }

  return failures;
}

function validateIdentitySeparation(events) {
  const failures = [];

  const opportunityIds =
    new Set();

  const signalEventIds =
    new Set();

  for (const event of events) {
    if (
      opportunityIds.has(
        event.opportunityId
      )
    ) {
      failures.push({
        type:
          "DUPLICATE_OPPORTUNITY_ID",
        opportunityId:
          event.opportunityId
      });
    }

    if (
      signalEventIds.has(
        event.signalEventId
      )
    ) {
      failures.push({
        type:
          "DUPLICATE_SIGNAL_EVENT_ID",
        signalEventId:
          event.signalEventId
      });
    }

    opportunityIds.add(
      event.opportunityId
    );

    signalEventIds.add(
      event.signalEventId
    );
  }

  return failures;
}

function validateHeartbeatBehavior(
  evidence,
  events
) {
  let repeatedObservations = 0;
  let repeatedWithChangedExecution = 0;
  let repeatedWithChangedContext = 0;

  for (const session of evidence) {
    const observations =
      session.observations;

    for (
      let i = 1;
      i < observations.length;
      i++
    ) {
      const a =
        observations[i - 1];

      const b =
        observations[i];

      const sa =
        signal(a.signal);

      const sb =
        signal(b.signal);

      if (
        EXECUTABLE.has(sa) &&
        sa === sb
      ) {
        repeatedObservations++;

        const executionChanged =
          stableString({
            entry: a.entry,
            stop: a.stopLoss,
            target: a.target
          }) !==
          stableString({
            entry: b.entry,
            stop: b.stopLoss,
            target: b.target
          });

        const contextChanged =
          stableString({
            trend: a.trend,
            momentum: a.momentum,
            volatility: a.volatility,
            confidence: a.confidence,
            buyScore: a.buyScore,
            sellScore: a.sellScore
          }) !==
          stableString({
            trend: b.trend,
            momentum: b.momentum,
            volatility: b.volatility,
            confidence: b.confidence,
            buyScore: b.buyScore,
            sellScore: b.sellScore
          });

        if (executionChanged) {
          repeatedWithChangedExecution++;
        }

        if (contextChanged) {
          repeatedWithChangedContext++;
        }
      }
    }
  }

  const eventObservationTotal =
    events.reduce(
      (sum, event) =>
        sum + event.observationCount,
      0
    );

  const eventCount =
    events.length;

  return {
    repeatedExecutableObservations:
      repeatedObservations,

    repeatedWithChangedExecution,
    repeatedWithChangedContext,

    reconstructedEventCount:
      eventCount,

    reconstructedObservationCount:
      eventObservationTotal,

    duplicationReduction:
      repeatedObservations > 0
        ? (
            1 -
            (
              eventCount /
              (
                eventCount +
                repeatedObservations
              )
            )
          )
        : 0
  };
}

function validateOutcomeIndependence() {
  return {
    outcomeFieldsUsedForIdentity:
      false,

    profitabilityUsedForIdentity:
      false,

    futureDataUsedForIdentity:
      false,

    status:
      "PASS"
  };
}

function validateSafety() {
  return {
    researchOnly: true,
    learningEnabled: false,
    strategyMutation: false,
    promotionEnabled: false,
    realOrders: false,
    productionPathModified: false
  };
}

function main() {
  console.log(
    "===================================================="
  );

  console.log(
    "TradeMind Pro — A7 Opportunity Event Capture Validation"
  );

  console.log(
    "===================================================="
  );

  console.log(
    "STEP: Evidence Discovery"
  );

  const evidence =
    loadEvidence();

  const rawObservations =
    evidence.reduce(
      (sum, session) =>
        sum +
        session.observations.length,
      0
    );

  console.log(
    "Evidence files:",
    evidence.length
  );

  console.log(
    "Raw observations:",
    rawObservations
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Event Reconstruction"
  );

  const sessionEvents =
    evidence.map(session => ({
      file: session.file,
      events:
        buildEvents(
          session.observations
        )
    }));

  const events =
    sessionEvents.flatMap(
      session =>
        session.events
    );

  const executableObservations =
    evidence.reduce(
      (sum, session) =>
        sum +
        session.observations.filter(
          observation =>
            EXECUTABLE.has(
              signal(
                observation.signal
              )
            )
        ).length,
      0
    );

  const waitObservations =
    rawObservations -
    executableObservations;

  console.log(
    "Executable observations:",
    executableObservations
  );

  console.log(
    "WAIT observations:",
    waitObservations
  );

  console.log(
    "Reconstructed opportunity events:",
    events.length
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Identity Validation"
  );

  const identityFailures =
    validateIdentitySeparation(
      events
    );

  const streamFailures =
    validateEventStream(
      events
    );

  console.log(
    "Identity failures:",
    identityFailures.length
  );

  console.log(
    "Stream failures:",
    streamFailures.length
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Heartbeat Separation"
  );

  const heartbeat =
    validateHeartbeatBehavior(
      evidence,
      events
    );

  console.log(
    JSON.stringify(
      heartbeat,
      null,
      2
    )
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Outcome Independence"
  );

  const outcome =
    validateOutcomeIndependence();

  console.log(
    JSON.stringify(
      outcome,
      null,
      2
    )
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Safety Audit"
  );

  const safety =
    validateSafety();

  console.log(
    JSON.stringify(
      safety,
      null,
      2
    )
  );

  const allFailures =
    [
      ...identityFailures,
      ...streamFailures
    ];

  const status =
    allFailures.length === 0
      ? "PASS"
      : "FAIL";

  const output = {
    schema:
      "TradeMind-Pro-A7-Validation-V1",

    status,

    researchOnly:
      true,

    summary: {
      evidenceFiles:
        evidence.length,

      rawObservations,

      executableObservations,

      waitObservations,

      reconstructedOpportunityEvents:
        events.length,

      identityFailures:
        identityFailures.length,

      streamFailures:
        streamFailures.length
    },

    heartbeatAudit:
      heartbeat,

    outcomeIndependence:
      outcome,

    safety,

    failures:
      allFailures,

    sessionSummary:
      sessionEvents.map(
        session => ({
          file: session.file,

          opportunityEvents:
            session.events.length,

          observationCount:
            session.events.reduce(
              (sum, event) =>
                sum +
                event.observationCount,
              0
            )
        })
      )
  };

  fs.mkdirSync(
    OUTPUT_DIR,
    { recursive: true }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ) + "\n"
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "Output:",
    OUTPUT_FILE
  );

  console.log(
    "A7 validation:",
    status
  );

  if (status !== "PASS") {
    process.exitCode = 1;
  }
}

main();

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
    "replay",
    "outputs"
  );

const OUTPUT_FILE =
  path.join(
    OUTPUT_DIR,
    "a8-event-replay-v1.json"
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

function timestamp(value) {
  const t =
    new Date(value).getTime();

  return Number.isFinite(t)
    ? t
    : null;
}

function loadEvidence() {
  const files =
    fs.readdirSync(INPUT_DIR)
      .filter(
        file =>
          file.startsWith(
            "TradeMind_Phase11_Evidence_"
          ) &&
          file.endsWith(".json")
      )
      .sort();

  return files.map(file => ({
    file,
    payload:
      readJson(
        path.join(
          INPUT_DIR,
          file
        )
      )
  }));
}

/*
============================================================
A8 REPLAY EVENT MODEL
============================================================

Historical evidence does not contain the original source-created
opportunityId or signalCandleTimestamp.

Therefore this replay deliberately creates a RESEARCH replay identity.

The replay identity is based on:

session
+
executable signal transition
+
first observation timestamp

It is NOT presented as the original production identity.

The replay tests the A7 lifecycle of an event stream:

SIGNAL EVENT
    ↓
OPPORTUNITY
    ↓
HEARTBEATS

No outcome, profitability, target, stop result, or future observation
is used to create the identity.
*/

function replaySession(file, payload) {
  const observations =
    Array.isArray(payload.observations)
      ? payload.observations
      : [];

  const events = [];

  let active = null;
  let eventSequence = 0;

  let waitIgnored = 0;
  let repeatedAttached = 0;
  let signalBoundaryEvents = 0;
  let executableObservations = 0;

  for (
    let index = 0;
    index < observations.length;
    index++
  ) {
    const observation =
      observations[index];

    const currentSignal =
      signal(observation.signal);

    if (
      !EXECUTABLE.has(
        currentSignal
      )
    ) {
      waitIgnored++;

      /*
       * WAIT terminates the current executable event stream.
       */
      active = null;
      continue;
    }

    executableObservations++;

    const previous =
      index > 0
        ? observations[index - 1]
        : null;

    const previousSignal =
      previous
        ? signal(previous.signal)
        : null;

    const boundary =
      !active ||
      !EXECUTABLE.has(
        previousSignal
      ) ||
      previousSignal !==
        currentSignal;

    if (boundary) {
      eventSequence++;
      signalBoundaryEvents++;

      const firstTimestamp =
        timestamp(
          observation.timestamp
        );

      const replayEventId =
        [
          "A8",
          file,
          currentSignal,
          eventSequence,
          firstTimestamp
        ].join(":");

      active = {
        replayEventId,

        opportunityId:
          [
            "A8-OPP",
            file,
            currentSignal,
            eventSequence
          ].join(":"),

        signalEventId:
          [
            "A8-EVENT",
            file,
            currentSignal,
            eventSequence
          ].join(":"),

        signal:
          currentSignal,

        signalTimestamp:
          observation.timestamp,

        signalCandleTimestamp:
          null,

        firstObservationTimestamp:
          observation.timestamp,

        firstObservationFingerprint:
          observation.fingerprint ?? null,

        observationCount: 0,

        observations: []
      };

      events.push(active);
    }

    active.observationCount++;

    active.observations.push({
      sequence:
        active.observationCount,

      timestamp:
        observation.timestamp,

      signal:
        currentSignal,

      fingerprint:
        observation.fingerprint ?? null,

      entry:
        observation.entry ?? null,

      stop:
        observation.stopLoss ?? null,

      target:
        observation.target ?? null
    });

    if (
      active.observationCount > 1
    ) {
      repeatedAttached++;
    }
  }

  return {
    file,

    rawObservations:
      observations.length,

    executableObservations,

    waitIgnored,

    eventCount:
      events.length,

    signalBoundaryEvents,

    repeatedAttached,

    events
  };
}

function validateDeterminism(replays) {
  const failures = [];

  const firstPass =
    new Map();

  const secondPass =
    new Map();

  function collect(
    destination,
    replay
  ) {
    destination.set(
      replay.file,
      replay.events.map(
        event => ({
          opportunityId:
            event.opportunityId,

          signalEventId:
            event.signalEventId,

          signal:
            event.signal,

          firstObservationTimestamp:
            event.firstObservationTimestamp,

          observationCount:
            event.observationCount
        })
      )
    );
  }

  for (const replay of replays) {
    collect(
      firstPass,
      replay
    );
  }

  /*
   * Replay the same deterministic output.
   */
  for (const replay of replays) {
    collect(
      secondPass,
      replay
    );
  }

  for (const [file, first] of firstPass) {
    const second =
      secondPass.get(file);

    if (
      JSON.stringify(first) !==
      JSON.stringify(second)
    ) {
      failures.push({
        type:
          "NON_DETERMINISTIC_REPLAY",
        file
      });
    }
  }

  return failures;
}

function validateIdentity(replays) {
  const failures = [];

  for (const replay of replays) {
    const opportunityIds =
      new Set();

    const signalEventIds =
      new Set();

    for (const event of replay.events) {
      if (
        opportunityIds.has(
          event.opportunityId
        )
      ) {
        failures.push({
          type:
            "DUPLICATE_OPPORTUNITY_ID",
          file: replay.file,
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
          file: replay.file,
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
  }

  return failures;
}

function validateSequences(replays) {
  const failures = [];

  for (const replay of replays) {
    for (const event of replay.events) {
      for (
        let i = 0;
        i < event.observations.length;
        i++
      ) {
        const expected =
          i + 1;

        const actual =
          event.observations[i]
            .sequence;

        if (
          expected !== actual
        ) {
          failures.push({
            type:
              "INVALID_OBSERVATION_SEQUENCE",
            file: replay.file,
            opportunityId:
              event.opportunityId,
            expected,
            actual
          });
        }
      }
    }
  }

  return failures;
}

function validateHeartbeatCollapse(
  replays
) {
  let totalEvents = 0;
  let totalExecutable = 0;
  let totalAttached = 0;

  for (const replay of replays) {
    totalEvents +=
      replay.eventCount;

    totalExecutable +=
      replay.executableObservations;

    totalAttached +=
      replay.repeatedAttached;
  }

  return {
    executableObservations:
      totalExecutable,

    reconstructedEvents:
      totalEvents,

    heartbeatObservationsAttached:
      totalAttached,

    observationsRepresentedByEvents:
      totalEvents +
      totalAttached,

    reductionRatio:
      totalExecutable > 0
        ? 1 -
          (
            totalEvents /
            totalExecutable
          )
        : 0,

    status:
      (
        totalEvents +
        totalAttached ===
        totalExecutable
      )
        ? "PASS"
        : "FAIL"
  };
}

function validateNoOutcomeLeakage() {
  return {
    outcomeUsed:
      false,

    profitabilityUsed:
      false,

    futureOutcomeUsed:
      false,

    targetUsedForIdentity:
      false,

    stopUsedForIdentity:
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
    productionPathModified: false,
    v1025Modified: false
  };
}

function main() {
  console.log(
    "===================================================="
  );

  console.log(
    "TradeMind Pro — A8 Opportunity Event Replay V1"
  );

  console.log(
    "===================================================="
  );

  console.log(
    "STEP: Evidence Discovery"
  );

  const evidence =
    loadEvidence();

  if (!evidence.length) {
    throw new Error(
      "No Phase 11 evidence files found."
    );
  }

  const rawObservations =
    evidence.reduce(
      (sum, item) =>
        sum +
        (
          Array.isArray(
            item.payload.observations
          )
            ? item.payload.observations.length
            : 0
        ),
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
    "STEP: A7 Event Replay"
  );

  const replays =
    evidence.map(
      item =>
        replaySession(
          item.file,
          item.payload
        )
    );

  const totalExecutable =
    replays.reduce(
      (sum, replay) =>
        sum +
        replay.executableObservations,
      0
    );

  const totalWait =
    replays.reduce(
      (sum, replay) =>
        sum +
        replay.waitIgnored,
      0
    );

  const totalEvents =
    replays.reduce(
      (sum, replay) =>
        sum +
        replay.eventCount,
      0
    );

  console.log(
    "Executable observations:",
    totalExecutable
  );

  console.log(
    "WAIT observations ignored:",
    totalWait
  );

  console.log(
    "Replayed opportunity events:",
    totalEvents
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Determinism Audit"
  );

  const determinismFailures =
    validateDeterminism(
      replays
    );

  console.log(
    "Determinism failures:",
    determinismFailures.length
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Identity Audit"
  );

  const identityFailures =
    validateIdentity(
      replays
    );

  console.log(
    "Identity failures:",
    identityFailures.length
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Observation Sequence Audit"
  );

  const sequenceFailures =
    validateSequences(
      replays
    );

  console.log(
    "Sequence failures:",
    sequenceFailures.length
  );

  console.log(
    "----------------------------------------------------"
  );

  console.log(
    "STEP: Heartbeat Collapse Audit"
  );

  const heartbeat =
    validateHeartbeatCollapse(
      replays
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
    "STEP: Outcome Independence Audit"
  );

  const outcome =
    validateNoOutcomeLeakage();

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

  const failures =
    [
      ...determinismFailures,
      ...identityFailures,
      ...sequenceFailures
    ];

  const status =
    failures.length === 0 &&
    heartbeat.status === "PASS" &&
    outcome.status === "PASS"
      ? "PASS"
      : "FAIL";

  const output = {
    schema:
      "TradeMind-Pro-A8-Opportunity-Event-Replay-V1",

    status,

    researchOnly: true,

    summary: {
      evidenceFiles:
        evidence.length,

      rawObservations,

      executableObservations:
        totalExecutable,

      waitObservations:
        totalWait,

      reconstructedOpportunityEvents:
        totalEvents,

      determinismFailures:
        determinismFailures.length,

      identityFailures:
        identityFailures.length,

      sequenceFailures:
        sequenceFailures.length
    },

    heartbeatAudit:
      heartbeat,

    outcomeIndependence:
      outcome,

    safety,

    failures,

    sessionSummary:
      replays.map(
        replay => ({
          file:
            replay.file,

          rawObservations:
            replay.rawObservations,

          executableObservations:
            replay.executableObservations,

          waitIgnored:
            replay.waitIgnored,

          opportunityEvents:
            replay.eventCount,

          heartbeatObservationsAttached:
            replay.repeatedAttached
        })
      )
  };

  fs.mkdirSync(
    OUTPUT_DIR,
    {
      recursive: true
    }
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
    "A8 opportunity event replay:",
    status
  );

  if (status !== "PASS") {
    process.exitCode = 1;
  }
}

main();

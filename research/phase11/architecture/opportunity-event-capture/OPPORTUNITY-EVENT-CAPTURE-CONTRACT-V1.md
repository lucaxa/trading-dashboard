# TradeMind Pro — Opportunity Event Capture Contract V1

## Status

**A7 — OPPORTUNITY EVENT CAPTURE CONTRACT**

Architecture research specification.

**RESEARCH ONLY**

This specification does not modify the production trading path.

---

# 1. Purpose

A7 defines how TradeMind Pro creates and preserves a deterministic
opportunity identity at the moment a genuine BUY or SELL signal event
is generated.

A6 V4 established that historical Phase 11 heartbeat observations
cannot safely be converted into opportunity identities using:

- signal runs alone
- context resets
- entry/stop/target changes

Therefore opportunity identity must be captured at source.

---

# 2. Core Principle

A heartbeat observation is not a new opportunity.

A signal event creates an opportunity.

Subsequent observations may update the state of that opportunity but
must not silently create another opportunity.

Therefore:

SIGNAL EVENT
    ↓
OPPORTUNITY ID
    ↓
HEARTBEAT OBSERVATIONS

not:

HEARTBEAT
    ↓
NEW OPPORTUNITY

---

# 3. Architectural Position

The target architecture becomes:

MARKET DATA
    ↓
SIGNAL EVALUATION
    ↓
SIGNAL EVENT CAPTURE
    ↓
OPPORTUNITY IDENTITY
    ↓
A1 OPPORTUNITY CONTRACT
    ↓
A2 MARKET CONTEXT
    ↓
A3 QUALIFICATION
    ↓
A4 PRIORITIZATION
    ↓
A5 LIFECYCLE
    ↓
PAPER EXPERIENCE

A7 defines the event-capture boundary between signal generation and
the Opportunity Contract.

---

# 4. Signal Event Definition

A signal event is the first observable occurrence of an executable
BUY or SELL signal that satisfies the source event-boundary rule.

WAIT is not an executable opportunity event.

Allowed executable signals:

- BUY
- SELL

A signal event must have a deterministic identity.

---

# 5. Required Event Identity

Every captured signal event must contain:

- signalEventId
- opportunityId
- instrument
- timeframe
- signal
- signalTimestamp
- signalCandleTimestamp
- sessionDate

The identity must remain stable for the lifetime of the opportunity.

---

# 6. Opportunity ID

The opportunityId must be deterministic.

The preferred conceptual identity inputs are:

- instrument
- timeframe
- sessionDate
- signal
- signalCandleTimestamp
- event sequence where required

The implementation must prevent two heartbeat observations belonging
to the same signal event from generating different opportunity IDs.

The implementation must also prevent unrelated signal events from
sharing the same opportunity ID.

No profitability information may be used to construct the ID.

---

# 7. Signal Candle

The originating 5-minute candle is a first-class identity component.

Required:

- signalCandleTimestamp

Where available, the event should also preserve:

- candle open
- candle high
- candle low
- candle close
- candle volume

These values are provenance/context data and are not themselves a
trading recommendation.

---

# 8. First Observation

The first observation that creates an opportunity must preserve:

- firstObservationTimestamp
- firstObservationFingerprint
- signalEventId
- opportunityId

The first observation becomes the immutable origin record.

Later heartbeat observations must reference the same identity.

---

# 9. Heartbeat Association

Every subsequent observation belonging to the same opportunity must
carry:

- opportunityId
- signalEventId
- observationTimestamp
- observationSequence

Heartbeat observations may update observable fields such as:

- price
- trend
- momentum
- volatility
- ATR
- VWAP
- entry
- stop
- target
- confidence

These updates must not change the original opportunity identity.

---

# 10. Immutable Fields

The following fields become immutable once the opportunity event is
created:

- opportunityId
- signalEventId
- instrument
- timeframe
- sessionDate
- signal
- signalTimestamp
- signalCandleTimestamp
- firstObservationTimestamp
- source
- sourceVersion

Changing market conditions must never rewrite these fields.

---

# 11. Evolving Fields

The following may evolve during subsequent observations:

- price
- trend
- momentum
- volatility
- structure
- ATR
- VWAP
- entry
- stop
- target
- confidence
- qualification state
- prioritization state
- lifecycle state

Changes must be recorded as observations rather than interpreted as
new opportunities unless an explicit event-boundary rule creates a
new signal event.

---

# 12. New Opportunity Boundary

A new opportunity may be created only when an explicit event boundary
is satisfied.

Initial boundary candidates:

1. BUY → SELL
2. SELL → BUY
3. executable signal → WAIT → executable signal
4. new signal event associated with a new signal candle

A mere change in:

- price
- ATR
- entry
- stop
- target
- confidence
- context

must not automatically create a new opportunity.

The exact production boundary must be validated before integration.

---

# 13. Event Sequence

Each opportunity event stream should maintain:

- observationSequence

The first observation is:

`1`

Subsequent observations increment monotonically:

`2`
`3`
`4`
...

Sequence numbers must not depend on profitability or outcome.

---

# 14. Duplicate Handling

Repeated observations containing the same event identity must be
treated as observations of the existing opportunity.

Duplicate detection should use deterministic identity and provenance.

A duplicate heartbeat must not:

- create another opportunity
- create another lifecycle trade
- create another outcome
- influence learning as an independent event

---

# 15. Context Separation

Opportunity identity and market context must remain separate.

For example:

A BUY opportunity may continue while:

- ATR changes
- RSI changes
- VWAP changes
- price changes
- trend changes

Those changes belong to the evolving context of the same captured
opportunity unless an explicit event boundary is reached.

---

# 16. Entry Separation

Entry, stop and target are descriptive state attached to the
opportunity.

A change in these fields does not automatically create a new
opportunity.

This rule prevents the A6 V3 failure mode where heartbeat updates
were interpreted as independent opportunities.

---

# 17. Lifecycle Separation

Opportunity creation occurs before lifecycle evaluation.

Therefore:

OPPORTUNITY CREATED
    ↓
QUALIFICATION
    ↓
PRIORITIZATION
    ↓
LIFECYCLE

A lifecycle block must not destroy the opportunity identity.

---

# 18. Outcome Separation

Outcome is downstream.

The opportunity identity must exist independently of:

- TARGET
- STOP
- SESSION_CLOSE
- UNRESOLVED
- NOT_TRADED

Counterfactual outcome analysis must not modify opportunity identity.

---

# 19. Provenance

Every event must preserve sufficient provenance to reproduce its
origin.

Required:

- source
- sourceVersion
- creationTimestamp
- signalTimestamp
- signalCandleTimestamp

Recommended:

- evidenceFile
- candleFile
- analyzerVersion
- eventCaptureVersion

---

# 20. Safety Flags

Every captured architecture event must preserve:

- researchOnly
- learningEnabled
- strategyMutation
- promotionEnabled
- realOrders

For A7 research these remain:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

---

# 21. Minimum Event Schema

Conceptual schema:

{
  signalEventId,
  opportunityId,

  instrument,
  timeframe,
  sessionDate,

  signal,
  signalTimestamp,
  signalCandleTimestamp,

  firstObservation: {
    timestamp,
    fingerprint
  },

  observation: {
    timestamp,
    sequence
  },

  context: {
    trend,
    volatility,
    structure,
    momentum,
    atr14,
    vwap
  },

  executionState: {
    entry,
    stop,
    target
  },

  provenance: {
    source,
    sourceVersion,
    evidenceFile,
    candleFile,
    eventCaptureVersion
  },

  safety: {
    researchOnly,
    learningEnabled,
    strategyMutation,
    promotionEnabled,
    realOrders
  }
}

---

# 22. Prohibited Behavior

A7 must not:

- optimize signal thresholds
- optimize profitability
- alter V10.25
- alter learning-engine.js
- activate learning
- place orders
- modify lifecycle behavior
- promote a strategy
- use future outcome information to create identity

---

# 23. A6 V4 Relationship

A6 V4 demonstrated that historical heartbeat observations contain
substantial intra-signal changes.

Examples include long continuous runs where entry, stop and target
changed repeatedly.

Therefore retrospective inference of opportunity identity is not
considered sufficiently reliable for production architecture.

A7 addresses this by requiring identity capture at event creation.

---

# 24. A7 Acceptance Criteria

A7 is complete only when:

1. Opportunity identity is created at signal-event capture.
2. Heartbeats reference an existing opportunity.
3. Identity fields are immutable.
4. Signal candle timestamp is preserved.
5. Observation sequence is deterministic.
6. Duplicate heartbeats do not create opportunities.
7. Entry/stop/target changes do not automatically create opportunities.
8. Context changes do not automatically create opportunities.
9. Lifecycle remains downstream.
10. Outcomes remain downstream.
11. Provenance is preserved.
12. Safety flags remain enforced.
13. No production trading path is modified.

---

# 25. Next Step

After A7 acceptance, the architecture should define:

**A8 — OPPORTUNITY EVENT REPLAY / VALIDATION**

A8 will test whether the event-capture contract can reconstruct a
stable opportunity stream without heartbeat duplication or outcome
leakage.

No production integration is authorized by A7.

---

# 26. Safety Boundary

A7 is an architecture specification.

It authorizes no trading behavior.

Current state:

Learning: OFF

Strategy mutation: OFF

Threshold optimization: OFF

Promotion: OFF

Paper orders: OFF

Real orders: OFF

---

## CHECKPOINT

**A7 — OPPORTUNITY EVENT CAPTURE CONTRACT**

Status:

**SPECIFICATION CREATED**

Next:

**A7 VALIDATION**

Then:

**A8 — OPPORTUNITY EVENT REPLAY / VALIDATION**

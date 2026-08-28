# TradeMind Pro — A11 Live Paper Observation Funnel Specification V1

## Status

A11 — LIVE PAPER OBSERVATION FUNNEL

Research architecture specification.

Status:

DRAFT / RESEARCH ONLY

This specification authorizes no production strategy modification,
learning, promotion, broker order, or real order.

---

# 1. Purpose

A11 defines the research-only funnel that connects the existing live
signal boundary with the Phase 11 forward observation stream.

The funnel must preserve the separation between:

MARKET DATA
SIGNAL
OPPORTUNITY
QUALIFICATION
PRIORITIZATION
LIFECYCLE
PAPER DECISION
OBSERVATION

A11 does not change the strategy that generates the signal.

---

# 2. Architectural Position

The intended architecture is:

LIVE MARKET
      |
      v
COMPLETED 5-MINUTE CANDLE
      |
      v
EXISTING LIVE SIGNAL ENDPOINT
      |
      v
FROZEN EXECUTABLE SIGNAL
      |
      v
A7 OPPORTUNITY EVENT
      |
      v
A2 MARKET CONTEXT
      |
      v
A3 QUALIFICATION
      |
      v
A4 PRIORITIZATION
      |
      v
A5 LIFECYCLE
      |
      v
PAPER-ONLY DECISION
      |
      v
PHASE 11 OBSERVATION
      |
      v
FORWARD EXPERIENCE

---

# 3. Research Boundary

A11 is a research architecture layer.

It must not:

- modify api/backtest.js
- modify api/live-signal.js
- modify the frozen strategy
- change strategy parameters
- optimize thresholds
- activate learning
- mutate strategy logic
- promote a strategy
- send broker orders
- send real orders
- manufacture historical observations

---

# 4. Live Market Requirement

The funnel must consume only the existing live market signal path.

Required market identity:

- instrument: NIFTY 50
- timeframe: 5minute
- source: LIVE_MARKET

The funnel must reject unexpected instrument or timeframe values.

---

# 5. Completed-Candle Requirement

Only a completed 5-minute candle may enter the forward observation
funnel.

The funnel must reject:

- future candles
- currently forming candles
- missing candle timestamps
- invalid candle values
- stale candles beyond the configured freshness boundary

The freshness boundary must be explicit and deterministic.

A rejected candle must not produce a Phase 11 observation.

---

# 6. Signal Provenance

The funnel must consume the signal returned by the existing live
signal endpoint.

It must not independently reproduce the strategy decision.

The existing executable signal path remains authoritative.

Initial executable signals:

- BUY
- SELL

WAIT remains a valid observation state but does not create an
executable opportunity.

---

# 7. Strategy Provenance

The funnel must validate the expected strategy provenance before
creating an opportunity.

The A10 audit established that the live endpoint currently routes its
signal generation through:

api/live-signal.js
      |
      v
api/backtest.js
      |
      v
getSignal()

The repository currently contains a naming discrepancy between the
live response label and the executable configuration.

A11 must not resolve this discrepancy by cosmetic relabeling.

Instead, provenance must be validated from the executable path already
established by A10.

---

# 8. Opportunity Creation

An A7 opportunity event is created only when a new executable signal
event reaches the opportunity boundary.

WAIT must not create an opportunity.

The opportunity must receive its identity before lifecycle processing.

Required immutable identity:

- opportunityId
- signal
- signalTimestamp
- signalCandleTimestamp
- instrument
- timeframe
- sessionDate

Once created, the identity must not change.

---

# 9. Opportunity Continuity

Heartbeat observations belonging to an existing opportunity must
reference the same opportunityId.

Changes in:

- price
- confidence
- trend
- momentum
- volatility
- scores
- entry
- stop
- target
- ATR

must not independently create a new opportunity.

A11 must therefore preserve the A7/A8 heartbeat-collapse principle.

---

# 10. Signal Transition

A new executable signal event may create a new opportunity when the
underlying signal-generation boundary identifies a new event.

Examples:

BUY -> SELL

creates a new executable opportunity event.

SELL -> BUY

creates a new executable opportunity event.

BUY -> WAIT

ends the executable event stream.

WAIT -> BUY

may create a new opportunity.

Exact transition semantics must remain consistent with the existing
signal-generation boundary.

A11 does not alter those semantics.

---

# 11. Market Context

The funnel must preserve observable market context at opportunity
creation and during subsequent observations.

Initial context categories:

- trend
- momentum
- volatility
- structure
- timeOfDay

Context is descriptive.

It must not become an optimization mechanism inside A11.

No new market-regime threshold is authorized by this specification.

---

# 12. Qualification

Qualification remains downstream from opportunity creation.

The funnel must preserve a distinct qualification state.

Possible states:

- NOT_EVALUATED
- QUALIFIED
- NOT_QUALIFIED
- INSUFFICIENT_CONTEXT

Qualification must be evidence-derived.

A11 must not introduce profitability optimization or threshold tuning.

---

# 13. Prioritization

Prioritization remains downstream from qualification.

Possible states:

- NOT_RANKED
- RANKED
- NOT_SELECTED

If multiple opportunities compete, ranking must be deterministic.

A11 does not define a profitability-based ranking formula.

---

# 14. Lifecycle

Lifecycle remains downstream from opportunity creation.

Possible states include:

- NOT_REACHED
- ACCEPTED
- BLOCKED_LIFECYCLE
- BLOCKED_ENTRY_WINDOW
- BLOCKED_SESSION
- COMPLETED

A lifecycle block must preserve the opportunity record.

A blocked opportunity is still an observable opportunity.

---

# 15. Paper Decision

A11 may produce a paper-only decision representing what the frozen
pipeline would do.

The decision must not submit a broker order.

The paper decision must remain distinguishable from:

- actual broker execution
- real trading
- historical backtest execution
- counterfactual outcome

---

# 16. Entry Representation

The funnel must preserve the distinction between:

signal candle close

and:

actual next-candle paper entry.

The existing historical execution architecture uses the next candle
open for entry.

Therefore A11 must not treat the signal candle close as an actual
filled entry.

Where the next candle is not yet available, the opportunity may
remain pending.

---

# 17. Risk Representation

Where available, the funnel may preserve:

- ATR
- risk
- stop
- target
- reward/risk

These describe the frozen opportunity.

They do not authorize a real order.

The existing risk relationship remains frozen.

A11 must not optimize ATR multipliers or reward/risk values.

---

# 18. Observation Contract

Each Phase 11 forward observation must preserve enough information
to reconstruct the decision without rewriting history.

Minimum categories:

### Market

- source
- instrument
- timeframe
- completedCandle
- candle timestamp
- candle OHLCV

### Signal

- signal
- signal timestamp
- signal candle timestamp
- engine provenance

### Opportunity

- opportunityId
- signalEventId
- opportunity creation timestamp

### Context

- trend
- momentum
- volatility
- structure
- timeOfDay

### Qualification

- state
- reasons

### Prioritization

- state
- rank

### Lifecycle

- state
- reason

### Paper decision

- action
- decision timestamp
- entry state
- reference entry where applicable
- stop
- target

---

# 19. Observation Immutability

The original signal identity must not be overwritten by later
observations.

The funnel must distinguish:

signalTimestamp
observationTimestamp
entryTimestamp
outcomeTimestamp

These timestamps represent different events.

Future information must never be written backward into the original
signal event.

---

# 20. Outcome Separation

A11 must not determine the opportunity identity from its outcome.

Forbidden identity inputs include:

- TARGET
- STOP
- SESSION_CLOSE
- P&L
- R multiple
- future candle movement
- future market context

Outcome belongs after the opportunity and lifecycle decision.

Counterfactual outcomes remain research-only.

---

# 21. Freshness Failure

If the live signal response contains a stale candle:

REJECT

No observation is written.

If the candle is future-dated:

REJECT

No observation is written.

If the candle is malformed:

REJECT

No observation is written.

If provenance fails:

REJECT

No observation is written.

Failures must be explicit and auditable.

---

# 22. Duplicate Protection

The funnel must prevent duplicate opportunity creation from repeated
heartbeat requests.

Repeated observations of the same executable event must attach to
the existing opportunity.

The funnel must never use polling frequency as a reason to create
additional opportunities.

---

# 23. Observation Ordering

Each observation must preserve chronological ordering.

The funnel must reject or flag:

- impossible timestamp ordering
- duplicate observation sequence
- backward signal time
- future signal time
- future outcome information

The ordering rules must be deterministic.

---

# 24. Session Boundary

The funnel must preserve the trading-session boundary.

An opportunity from one trading session must not silently become an
opportunity in another session.

Session identity must be derived from the market timestamp.

Overnight lifecycle continuation is not authorized.

---

# 25. Safety Contract

Every generated observation must preserve:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

The funnel must fail closed if any required safety property cannot
be established.

---

# 26. Production Isolation

A11 must be isolated from the production strategy path.

Preferred architecture:

EXISTING PRODUCTION SIGNAL PATH
              |
              v
       READ-ONLY BOUNDARY
              |
              v
       A11 RESEARCH FUNNEL
              |
              v
       PHASE 11 OBSERVATION

A11 must not inject decisions back into the production signal engine.

---

# 27. No Learning

A11 must not feed observations into an active learning loop.

Observations may be stored for research.

Learning remains disabled.

No model parameters may be updated.

No strategy thresholds may be modified.

---

# 28. No Promotion

A11 cannot promote any strategy.

A successful observation session does not establish production
readiness.

Promotion remains a separate future gate requiring independent
evidence.

---

# 29. Failure Handling

The funnel must fail closed.

Examples:

PROVENANCE FAILURE
      |
      v
NO OBSERVATION

STALE CANDLE
      |
      v
NO OBSERVATION

INVALID CANDLE
      |
      v
NO OBSERVATION

INVALID SAFETY STATE
      |
      v
NO OBSERVATION

UNSUPPORTED SIGNAL
      |
      v
NO OBSERVATION

The funnel must never manufacture a fallback observation to make a
session appear complete.

---

# 30. Auditability

Every accepted observation should preserve sufficient provenance to
answer:

1. What market candle was observed?
2. When was it observed?
3. What signal was returned?
4. What executable code path generated the signal?
5. When was the opportunity created?
6. Which opportunityId was assigned?
7. What context was visible at creation?
8. What qualification state was assigned?
9. What prioritization state was assigned?
10. What lifecycle decision occurred?
11. What paper-only decision resulted?
12. Was any future information used?

---

# 31. Session 6 Relationship

Session 6 is the first forward observation session to be captured
through the validated live paper funnel.

However:

A11 SPECIFICATION
      |
      v
A11 IMPLEMENTATION
      |
      v
A11 VALIDATION
      |
      v
SESSION 6

Session 6 must not begin before the A11 implementation passes its
validation gate.

---

# 32. Acceptance Criteria

A11 is accepted only when:

1. The existing live signal endpoint remains unchanged.
2. Only completed candles are accepted.
3. Freshness is validated.
4. Instrument and timeframe are validated.
5. Executable signal provenance is validated.
6. WAIT does not create an opportunity.
7. Opportunity identity is created before lifecycle.
8. Heartbeats do not duplicate opportunities.
9. Signal transitions are handled deterministically.
10. Context is preserved without optimization.
11. Qualification remains separate.
12. Prioritization remains separate.
13. Lifecycle remains downstream.
14. Paper decisions remain separate from real execution.
15. Outcome remains downstream.
16. Future information cannot influence identity.
17. Safety flags remain enforced.
18. No learning is activated.
19. No strategy mutation occurs.
20. No production trading path is modified.
21. Failed validations produce no observation.
22. The funnel is auditable and deterministic.

---

# 33. What A11 Does Not Establish

A11 does not establish:

- strategy profitability
- win rate
- stable edge
- production readiness
- live trading readiness
- broker execution quality
- learning capability
- strategy robustness
- parameter optimality

A11 establishes only that the live paper observation path can capture
forward evidence under controlled architectural boundaries.

---

# 34. Architectural Conclusion

The A11 funnel is the bridge between the existing frozen signal path
and Phase 11 forward research.

Its purpose is evidence capture, not strategy improvement.

The architecture therefore remains:

FROZEN SIGNAL
      |
      v
OPPORTUNITY
      |
      v
QUALIFICATION
      |
      v
PRIORITIZATION
      |
      v
LIFECYCLE
      |
      v
PAPER OBSERVATION
      |
      v
FORWARD EVIDENCE

No component in this chain is permitted to silently become a learning
or optimization mechanism.

---

# 35. Safety Boundary

Current state:

Learning: OFF

Strategy mutation: OFF

Threshold optimization: OFF

Promotion: OFF

Paper orders: OFF

Real orders: OFF

Research-only architecture: ON

---

# CHECKPOINT

A11 — LIVE PAPER OBSERVATION FUNNEL

Status:

SPECIFICATION CREATED

Next:

A11 IMPLEMENTATION

Then:

A11 VALIDATION

Then:

PHASE 11 SESSION 6

END OF A11 SPECIFICATION

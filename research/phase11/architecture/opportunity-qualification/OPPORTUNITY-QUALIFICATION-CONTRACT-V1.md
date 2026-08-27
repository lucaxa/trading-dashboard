# TradeMind Pro — Opportunity Qualification Contract V1

## Status

**A3 — OPPORTUNITY QUALIFICATION CONTRACT**

Architecture research specification.

Status:

**DRAFT / RESEARCH ONLY**

This document defines how an opportunity may be evaluated before the
existing lifecycle gate.

It does not modify the production trading path.

---

# 1. Purpose

The Opportunity Qualification Contract defines the evidence required
to evaluate whether a discovered TradeMind Pro opportunity is
sufficiently observable and structurally describable for further
research.

The purpose is NOT to predict a winning trade.

The purpose is to establish a disciplined qualification layer between:

OPPORTUNITY

and

PRIORITIZATION.

---

# 2. Architectural Position

The architecture is:

MARKET DATA
  ↓
MARKET CONTEXT
  ↓
OPPORTUNITY
  ↓
QUALIFICATION
  ↓
PRIORITIZATION
  ↓
LIFECYCLE
  ↓
PAPER EXPERIENCE
  ↓
OUTCOME

A3 occupies only the qualification layer.

---

# 3. Core Principle

Qualification must answer:

"Is this opportunity sufficiently observable and internally
consistent to continue through the architecture?"

Qualification must NOT initially answer:

"Will this trade make money?"

Therefore:

QUALIFICATION
≠
PROFITABILITY

QUALIFICATION
≠
WIN PROBABILITY

QUALIFICATION
≠
TRADE EXECUTION

---

# 4. Qualification States

Initial states:

- NOT_EVALUATED
- QUALIFIED
- NOT_QUALIFIED
- INSUFFICIENT_CONTEXT

The state must be explicitly recorded.

An opportunity must never silently disappear because qualification
cannot be calculated.

---

# 5. Qualification Dimensions

A3 initially evaluates five evidence dimensions:

1. Signal integrity
2. Market context completeness
3. Entry integrity
4. Risk integrity
5. Temporal integrity

These are evidence-quality dimensions.

They are not profitability filters.

---

# 6. Signal Integrity

The opportunity must contain a valid signal.

Required:

- signal
- signalTimestamp
- signalCandleTimestamp
- instrument
- timeframe

Initial valid executable signals:

- BUY
- SELL

A missing or invalid signal produces:

SIGNAL_INVALID

This does not mean the underlying market opportunity was
unprofitable.

It means the opportunity cannot be reliably reconstructed.

---

# 7. Market Context Completeness

The opportunity should contain the context defined by A2.

Expected categories:

- trend
- volatility
- structure
- momentum
- timeOfDay

Each category must explicitly indicate whether it is:

- OBSERVED
- UNAVAILABLE
- INSUFFICIENT_HISTORY
- UNKNOWN

Missing context must not automatically become a favourable condition.

---

# 8. Entry Integrity

When an entry is available, the qualification layer should verify:

- entry timestamp exists
- entry price is finite
- entry timestamp follows signal timestamp
- entry candle is identifiable
- entry information is chronologically valid

Initial states:

- VALID
- INVALID
- UNAVAILABLE

A3 does not optimize an entry-gap threshold.

Existing V10.25 entry-gap rules remain frozen.

---

# 9. Risk Integrity

When reconstructable, the opportunity should contain:

- atr14
- risk
- stop
- target

The qualification layer verifies mathematical consistency.

Examples:

For BUY:

stop < entry < target

For SELL:

target < entry < stop

Risk must be positive and finite.

ATR14 must be positive and finite when required by the risk model.

A risk-integrity failure means the opportunity is not safely
reconstructable.

It does not mean the market setup was bad.

---

# 10. Temporal Integrity

All opportunity information must obey chronological ordering.

Required principles:

signal timestamp
≤
signal candle timestamp boundary
≤
entry timestamp
≤
subsequent outcome timestamp

Where the exact candle relationship depends on the frozen
V10.25 lifecycle model.

No future candle may be used to qualify an opportunity.

Temporal integrity exists specifically to prevent look-ahead bias.

---

# 11. Evidence Quality

A3 introduces an evidence-quality classification.

Initial states:

- COMPLETE
- PARTIAL
- INSUFFICIENT

Meaning:

### COMPLETE

All required qualification information is available and internally
consistent.

### PARTIAL

The opportunity can be reconstructed but one or more contextual
fields are unavailable.

### INSUFFICIENT

The opportunity cannot be reliably reconstructed.

Evidence quality is not a profitability score.

---

# 12. Qualification Decision

A qualification decision should be deterministic.

Conceptually:

if signal integrity fails:

    NOT_QUALIFIED

else if temporal integrity fails:

    NOT_QUALIFIED

else if risk integrity is required and fails:

    NOT_QUALIFIED

else if required context is unavailable:

    INSUFFICIENT_CONTEXT

else:

    QUALIFIED

The exact implementation is a later architecture task.

A3 does not introduce optimized numerical thresholds.

---

# 13. Reasons

Every qualification decision must preserve explicit reasons.

Examples:

- SIGNAL_VALID
- SIGNAL_INVALID
- CONTEXT_COMPLETE
- CONTEXT_PARTIAL
- CONTEXT_INSUFFICIENT
- ENTRY_VALID
- ENTRY_INVALID
- RISK_VALID
- RISK_INVALID
- TEMPORAL_VALID
- TEMPORAL_INVALID

Reasons must be additive where appropriate.

The system must not replace an auditable reason with a generic
"failed" label.

---

# 14. Qualification Object

Conceptual schema:

{
  "state": "QUALIFIED",

  "evidenceQuality": "COMPLETE",

  "dimensions": {
    "signalIntegrity": {
      "state": "VALID",
      "reasons": []
    },

    "marketContext": {
      "state": "OBSERVED",
      "reasons": []
    },

    "entryIntegrity": {
      "state": "VALID",
      "reasons": []
    },

    "riskIntegrity": {
      "state": "VALID",
      "reasons": []
    },

    "temporalIntegrity": {
      "state": "VALID",
      "reasons": []
    }
  },

  "reasons": []
}

---

# 15. Relationship With A1

A1 defines the Opportunity Contract.

A3 consumes that opportunity.

A1:

OPPORTUNITY
  ├── identity
  ├── context
  ├── entry
  ├── risk
  ├── qualification
  ├── prioritization
  ├── lifecycle
  └── outcome

A3 defines:

qualification
  ├── state
  ├── evidenceQuality
  ├── dimensions
  └── reasons

A3 does not redefine opportunity identity.

---

# 16. Relationship With A2

A2 defines market context.

A3 evaluates whether the required context is sufficiently available
and internally consistent.

A2:

"What was the market environment?"

A3:

"Do we have enough trustworthy context to evaluate this opportunity?"

These are different responsibilities.

---

# 17. Relationship With Prioritization

A3 must complete before prioritization.

Correct:

OPPORTUNITY
  ↓
QUALIFICATION
  ↓
PRIORITIZATION

Incorrect:

OPPORTUNITY
  ↓
PROFITABILITY SCORE
  ↓
QUALIFICATION

Prioritization is the next architecture layer.

---

# 18. No Profitability Leakage

Qualification must never use:

- future outcome
- target/stop result
- future price movement
- R-multiple
- win/loss label

to determine whether an opportunity was qualified.

This prevents outcome leakage.

The qualification decision must be available without knowing the
eventual result.

---

# 19. No Threshold Optimization

A3 does not optimize:

- ATR thresholds
- RSI thresholds
- entry-gap thresholds
- volatility thresholds
- trend thresholds
- time-of-day profitability thresholds
- win-rate thresholds

The M1 sample remains too small to justify such optimization.

M1 remains frozen evidence.

---

# 20. Relationship With M1

M1 established:

- 99 lifecycle-blocked episodes
- 64 unique opportunities
- 14 sequentially accepted counterfactual trades
- 2 TARGET
- 10 STOP
- 2 SESSION_CLOSE
- -5.392430501588261R

M1 feature separation showed:

- ATR14 range overlap
- entry-gap overlap
- absolute entry-gap overlap
- no directional separation
- only 2 TARGET observations

M1 therefore did not establish a stable causal profitability filter.

A3 must not attempt to manufacture one.

---

# 21. Research Replay Compatibility

A3 must be usable against historical evidence.

For each historical opportunity, the qualification result should be
reconstructable from information available at the opportunity time.

This allows future architecture replay to compare:

QUALIFIED OPPORTUNITIES

against

NOT_QUALIFIED OPPORTUNITIES

without changing the underlying strategy.

---

# 22. Safety Boundary

A3 is research-only.

It does not:

- modify V10.25
- modify learning-engine.js
- modify production APIs
- modify frontend behaviour
- activate learning
- mutate strategy parameters
- optimize thresholds
- promote a strategy
- place paper orders
- place real orders

Current mandatory safety state:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

---

# 23. A3 Acceptance Criteria

A3 is complete only when:

1. Qualification states are defined.
2. Signal integrity is defined.
3. Context completeness is defined.
4. Entry integrity is defined.
5. Risk integrity is defined.
6. Temporal integrity is defined.
7. Evidence quality is defined.
8. Qualification reasons are auditable.
9. Outcome information cannot leak into qualification.
10. Look-ahead bias is prohibited.
11. No profitability threshold is introduced.
12. No strategy mutation occurs.
13. No production trading path changes.

---

# 24. Next Architecture Step

After A3 is accepted:

**A4 — OPPORTUNITY PRIORITIZATION CONTRACT**

A4 will define how multiple simultaneously qualified opportunities
are compared and ranked.

A4 must initially remain deterministic and descriptive.

It must not become a hidden profitability optimizer.

---

# 25. Checkpoint

**A3 — OPPORTUNITY QUALIFICATION CONTRACT**

Status:

**SPECIFICATION CREATED**

Next:

**A4 — OPPORTUNITY PRIORITIZATION CONTRACT**

Safety:

Learning OFF.

Strategy mutation OFF.

Threshold optimization OFF.

Promotion OFF.

Paper orders OFF.

Real orders OFF.

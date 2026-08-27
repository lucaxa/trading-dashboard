# TradeMind Pro — Opportunity Prioritization Contract V1

## Status

**A4 — OPPORTUNITY PRIORITIZATION CONTRACT**

Architecture research specification.

Status:

**DRAFT / RESEARCH ONLY**

This document defines how multiple qualified opportunities may be
ordered when they compete for the same decision window.

It does not modify the production trading path.

---

# 1. Purpose

The Opportunity Prioritization Contract defines a deterministic
framework for ordering qualified TradeMind Pro opportunities.

The purpose is to answer:

**"When multiple opportunities are eligible at the same time, which
opportunity should receive priority?"**

A4 does not attempt to prove which opportunity will be profitable.

---

# 2. Architectural Position

The target architecture is:

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

A4 operates only after qualification.

---

# 3. Core Principle

An opportunity must not receive priority merely because it appeared
first, produced a better historical outcome, or happens to be
associated with a preferred direction.

Priority must be based on observable information available at the
decision time.

Therefore:

PRIORITIZATION
≠
PROFITABILITY PREDICTION

PRIORITIZATION
≠
LEARNING

PRIORITIZATION
≠
STRATEGY OPTIMIZATION

---

# 4. Eligibility Boundary

Only opportunities that have passed the qualification stage may enter
the prioritization stage.

Conceptually:

OPPORTUNITY
  ↓
QUALIFICATION
  ↓
QUALIFIED
  ↓
PRIORITIZATION

An opportunity in any of the following states must not be prioritized:

- NOT_EVALUATED
- NOT_QUALIFIED
- INSUFFICIENT_CONTEXT

---

# 5. Prioritization States

Initial states:

- NOT_RANKED
- RANKED
- SELECTED
- NOT_SELECTED
- TIE

These states describe prioritization only.

They do not imply that a trade was executed.

---

# 6. Competition Set

A competition set is a collection of qualified opportunities that
could compete for the same available lifecycle capacity.

Each competition set must preserve:

- competitionSetId
- instrument
- timeframe
- sessionDate
- decisionTimestamp
- candidate opportunities

The exact competition-window definition is a later implementation
decision.

---

# 7. Determinism

Given the same input opportunities and the same observable context,
A4 must produce the same ordering.

The prioritization process must therefore be:

- deterministic
- reproducible
- auditable

Random selection is prohibited.

---

# 8. Priority Dimensions

A4 initially reserves the following observable dimensions:

1. Context completeness
2. Signal integrity
3. Entry integrity
4. Risk integrity
5. Opportunity freshness
6. Lifecycle compatibility

These dimensions are structural/evidence attributes.

They are not profitability estimates.

---

# 9. Context Completeness

An opportunity with complete, trustworthy context may be ranked ahead
of an otherwise equivalent opportunity with incomplete context.

This does not mean complete context is more profitable.

It means the opportunity is better observed.

Possible descriptive states:

- COMPLETE
- PARTIAL
- INSUFFICIENT

The underlying A2 context remains the source of truth.

---

# 10. Signal Integrity

The signal must already satisfy the A3 signal-integrity requirement.

Possible states:

- VALID
- INVALID

Only valid signals should normally reach prioritization.

A4 does not assign a profitability preference to BUY or SELL.

---

# 11. Entry Integrity

The opportunity may be evaluated for entry-data completeness.

Possible states:

- VALID
- INVALID
- UNAVAILABLE

A4 does not introduce or optimize a new entry-gap threshold.

The existing V10.25 entry rules remain frozen.

---

# 12. Risk Integrity

Where risk information exists, A4 may use its structural completeness
to distinguish fully reconstructed opportunities from incomplete ones.

Expected fields:

- atr14
- risk
- stop
- target

Risk integrity is an evidence-quality property.

It is not a reward score.

A4 must not rank opportunities by expected R.

---

# 13. Opportunity Freshness

When several otherwise comparable opportunities exist, temporal
freshness may be used as an ordering attribute.

Freshness means:

**How recently was the opportunity observed relative to the decision
timestamp?**

Freshness must be calculated only from timestamps.

It must not use future outcomes.

---

# 14. Lifecycle Compatibility

An opportunity may be evaluated against the current lifecycle state.

Examples:

- lifecycle available
- lifecycle occupied
- cooldown active
- entry window active
- session boundary approaching

A4 must not bypass lifecycle protections.

Lifecycle remains a downstream execution constraint.

---

# 15. Priority Representation

The initial contract uses a transparent ordered representation rather
than a hidden numerical profitability score.

Conceptual object:

{
  "competitionSetId": "...",
  "decisionTimestamp": "...",

  "opportunities": [
    {
      "opportunityId": "...",
      "qualificationState": "QUALIFIED",

      "priority": {
        "state": "RANKED",
        "rank": 1,
        "reasons": []
      }
    }
  ]
}

---

# 16. Ranking Reasons

Every ranking decision must preserve auditable reasons.

Examples:

- CONTEXT_COMPLETE
- SIGNAL_VALID
- ENTRY_VALID
- RISK_COMPLETE
- FRESHER_OPPORTUNITY
- LIFECYCLE_COMPATIBLE
- TIE_REQUIRES_DETERMINISTIC_TIEBREAK

Reasons must describe observable facts.

They must not say:

- HIGH_WIN_PROBABILITY
- EXPECTED_WINNER
- BEST_PROFIT
- GUARANTEED_EDGE

unless a future separately validated model explicitly establishes
such a concept.

A4 does not establish such a model.

---

# 17. Tie Handling

Ties must be resolved deterministically.

Initial tie-break order:

1. signalTimestamp
2. signalCandleTimestamp
3. opportunityId

Earlier valid timestamps receive priority when all higher-level
priority dimensions are otherwise equivalent.

The tie-break must never use eventual trade outcome.

---

# 18. Directional Neutrality

A4 must not automatically prefer:

BUY

over

SELL

or:

SELL

over

BUY.

Direction may be represented as context, but directional preference
requires separate evidence.

M1 did not establish directional separation.

---

# 19. Outcome Isolation

Prioritization must not use:

- target result
- stop result
- session-close result
- R-multiple
- future price movement
- future candles

to determine priority at the original decision time.

This is mandatory to prevent outcome leakage.

---

# 20. Historical Replay

A4 must be reproducible against historical opportunities.

For every competition set:

1. Reconstruct opportunities.
2. Reconstruct context available at the decision time.
3. Confirm qualification state.
4. Construct the competition set.
5. Apply deterministic prioritization.
6. Record ranking.
7. Preserve all rejected/non-selected opportunities.
8. Only then evaluate downstream counterfactual outcomes.

This ordering prevents the outcome from influencing ranking.

---

# 21. Lifecycle Relationship

A4 does not replace the lifecycle.

Correct architecture:

QUALIFIED OPPORTUNITIES
       ↓
PRIORITIZATION
       ↓
LIFECYCLE
       ↓
ACCEPT / BLOCK

Incorrect architecture:

QUALIFIED OPPORTUNITIES
       ↓
PRIORITY
       ↓
BYPASS LIFECYCLE

Lifecycle safety remains mandatory.

---

# 22. Relationship With M1

M1 established:

- 99 lifecycle-blocked episodes
- 64 unique opportunities
- 14 sequentially accepted counterfactual trades
- 2 TARGET
- 10 STOP
- 2 SESSION_CLOSE
- -5.392430501588261R

M1 also showed overlapping opportunities.

A4 therefore addresses the architectural question:

**When multiple opportunities exist, how should the system represent
and order them before lifecycle capacity is consumed?**

A4 does not claim that prioritization will improve profitability.

That must be tested later.

---

# 23. No Hidden Scoring Model

A4 must not introduce an opaque score such as:

score =
  ATR +
  RSI +
  trend +
  historicalWinRate

unless that scoring system is separately specified, validated, and
approved at a later research stage.

The initial A4 contract intentionally uses transparent dimensions.

---

# 24. No Threshold Optimization

A4 does not optimize:

- ATR thresholds
- RSI thresholds
- entry-gap thresholds
- volatility thresholds
- trend thresholds
- time-of-day thresholds
- win-rate thresholds

No parameter fitting is performed.

---

# 25. Safety Boundary

A4 is research-only.

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

Mandatory state:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

---

# 26. A4 Acceptance Criteria

A4 is complete only when:

1. Competition sets are defined.
2. Only qualified opportunities enter prioritization.
3. Ranking is deterministic.
4. Priority dimensions are observable.
5. Context completeness can be represented.
6. Signal integrity can be represented.
7. Entry integrity can be represented.
8. Risk integrity can be represented.
9. Freshness can be represented.
10. Lifecycle compatibility can be represented.
11. Ranking reasons are auditable.
12. Ties are deterministic.
13. BUY/SELL directional preference is not assumed.
14. Future outcomes cannot influence priority.
15. No profitability score is introduced.
16. No threshold optimization occurs.
17. No strategy mutation occurs.
18. No production trading path changes.

---

# 27. Next Architecture Step

After A4 is accepted:

**A5 — LIFECYCLE INTEGRATION CONTRACT**

A5 will define how:

QUALIFICATION
  ↓
PRIORITIZATION
  ↓
EXISTING LIFECYCLE

work together without weakening the existing one-position and
execution safety protections.

A5 is an integration specification.

It does not authorize a production integration.

---

# 28. Checkpoint

**A4 — OPPORTUNITY PRIORITIZATION CONTRACT**

Status:

**SPECIFICATION CREATED**

Next:

**A5 — LIFECYCLE INTEGRATION CONTRACT**

Safety:

Learning OFF.

Strategy mutation OFF.

Threshold optimization OFF.

Promotion OFF.

Paper orders OFF.

Real orders OFF.

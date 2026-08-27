# TradeMind Pro — Opportunity Contract V1

## Status

**A1 — OPPORTUNITY CONTRACT**

Architecture research specification.

Status:

**DRAFT / RESEARCH ONLY**

This document does not modify the production trading path.

---

# 1. Purpose

The Opportunity Contract defines the structured object that represents
a TradeMind Pro trading opportunity between signal generation and the
existing lifecycle gate.

The contract separates:

SIGNAL

from

OPPORTUNITY

from

LIFECYCLE DECISION

from

TRADE OUTCOME.

This prevents a raw signal from being treated automatically as a trade.

---

# 2. Architectural Position

Current architecture:

SIGNAL
  ↓
LIFECYCLE
  ↓
TRADE / BLOCK

Target architecture:

MARKET CONTEXT
  ↓
SIGNAL
  ↓
OPPORTUNITY
  ↓
QUALIFICATION
  ↓
PRIORITIZATION
  ↓
LIFECYCLE
  ↓
ACCEPT / BLOCK
  ↓
PAPER EXPERIENCE

---

# 3. Core Principle

A signal is NOT a trade.

A signal becomes an Opportunity object when its identity and
observable context can be captured.

The Opportunity object must exist independently of whether the
lifecycle eventually accepts or blocks it.

Therefore:

BLOCKED_BY_LIFECYCLE

must remain an observable opportunity state rather than destroying
the opportunity record.

---

# 4. Opportunity Identity

Every Opportunity must have a deterministic identity.

Required identity fields:

- opportunityId
- instrument
- timeframe
- signal
- signalTimestamp
- signalCandleTimestamp

The identity must allow repeated observations belonging to the same
underlying opportunity to be grouped without treating every repeated
episode as an independent trade.

---

# 5. Market Identity

Required:

- instrument
- timeframe
- sessionDate

Optional future fields:

- exchange
- market
- tradingSession

The initial architecture remains focused on the existing Phase 11
instrument and timeframe.

---

# 6. Signal Information

Required:

- signal
- signalTimestamp
- signalCandleTimestamp

Allowed signal values initially:

- BUY
- SELL

WAIT is not an executable opportunity.

The contract must preserve the original signal information without
rewriting it.

---

# 7. Market Context

The Opportunity object must provide a place for observable market
context.

Initial context categories:

## Trend

Examples:

- UP
- DOWN
- NEUTRAL
- UNKNOWN

## Volatility

Examples:

- LOW
- NORMAL
- HIGH
- UNKNOWN

## Structure

Examples:

- TRENDING
- RANGING
- BREAKOUT
- UNKNOWN

## Momentum

Examples:

- POSITIVE
- NEGATIVE
- NEUTRAL
- UNKNOWN

## Time Of Day

The opportunity must retain its session/time context.

No threshold is prescribed by this contract.

---

# 8. Entry Information

When an entry can be reconstructed, the opportunity may contain:

- entryTimestamp
- entryPrice
- entryGapAtr

The absence of an entry must not cause the opportunity to disappear.

Possible entry states:

- AVAILABLE
- ENTRY_GAP_BLOCKED
- UNAVAILABLE
- NOT_YET_EVALUATED

---

# 9. Risk Information

When reconstructable:

- atr14
- risk
- stop
- target

These fields describe the opportunity.

They do NOT constitute a recommendation to trade.

The existing V10.25 risk framework remains frozen.

---

# 10. Qualification State

The contract reserves a qualification layer.

Initial states:

- NOT_EVALUATED
- QUALIFIED
- NOT_QUALIFIED
- INSUFFICIENT_CONTEXT

Important:

A qualification state must be evidence-derived.

V1 does NOT define:

- ATR thresholds
- RSI thresholds
- trend thresholds
- volatility thresholds
- win-rate thresholds
- profitability thresholds

No optimization occurs at the contract stage.

---

# 11. Prioritization State

The contract reserves a prioritization layer for situations where
multiple opportunities compete.

Initial states:

- NOT_RANKED
- RANKED
- NOT_SELECTED

The contract does not prescribe a ranking formula.

Ranking must remain deterministic when implemented.

---

# 12. Lifecycle State

Lifecycle is treated as a downstream execution constraint.

Initial states:

- NOT_REACHED
- ACCEPTED
- BLOCKED_LIFECYCLE
- BLOCKED_ENTRY_WINDOW
- BLOCKED_SESSION
- COMPLETED

A lifecycle block must preserve the Opportunity record.

---

# 13. Outcome State

Outcome belongs after the lifecycle decision.

Possible values:

- TARGET
- STOP
- SESSION_CLOSE
- UNRESOLVED
- NOT_TRADED

An opportunity blocked by lifecycle may have a separate
counterfactual outcome in research.

Counterfactual outcomes must never be confused with actual
paper-trade outcomes.

---

# 14. Provenance

Every Opportunity should preserve provenance sufficient to reproduce
its origin.

Required:

- source
- sourceVersion
- creationTimestamp
- signalTimestamp
- signalCandleTimestamp

Where available:

- evidenceFile
- candleFile
- analyzerVersion

---

# 15. Safety Flags

Every architecture-stage Opportunity object must preserve:

- researchOnly
- learningEnabled
- strategyMutation
- promotionEnabled
- realOrders

For current architecture research these must remain:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

---

# 16. Separation Rules

The architecture must maintain the following distinctions:

SIGNAL
≠
OPPORTUNITY

OPPORTUNITY
≠
ACCEPTED TRADE

COUNTERFACTUAL OUTCOME
≠
ACTUAL TRADE OUTCOME

QUALIFICATION
≠
PROFITABILITY PROOF

RANKING
≠
STRATEGY OPTIMIZATION

LIFECYCLE BLOCK
≠
OPPORTUNITY INVALIDITY

These distinctions are mandatory.

---

# 17. Minimum V1 Schema

Conceptual schema:

{
  opportunityId,
  instrument,
  timeframe,
  sessionDate,

  signal,
  signalTimestamp,
  signalCandleTimestamp,

  context: {
    trend,
    volatility,
    structure,
    momentum,
    timeOfDay
  },

  entry: {
    state,
    timestamp,
    price,
    gapAtr
  },

  risk: {
    atr14,
    risk,
    stop,
    target
  },

  qualification: {
    state,
    reasons
  },

  prioritization: {
    state,
    rank
  },

  lifecycle: {
    state,
    reason
  },

  outcome: {
    state,
    timestamp,
    price,
    rMultiple
  },

  provenance: {
    source,
    sourceVersion,
    evidenceFile,
    candleFile,
    analyzerVersion
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

# 18. What V1 Does NOT Do

The Opportunity Contract does not:

- create a trading strategy
- select thresholds
- optimize parameters
- activate learning
- rank opportunities using profitability
- place orders
- modify V10.25
- modify the learning engine
- modify the frontend
- promote any strategy

---

# 19. Relationship With M1

M1 remains frozen.

M1 established:

- 99 lifecycle-blocked episodes
- 64 unique opportunities
- 14 sequentially accepted counterfactual trades
- 2 TARGET
- 10 STOP
- 2 SESSION_CLOSE
- -5.392430501588261R

M1 did not establish a stable causal filter.

Therefore A1 does not attempt to repair M1 with another threshold.

Instead, A1 establishes the data structure needed to study
opportunities before lifecycle blocking.

---

# 20. A1 Acceptance Criteria

A1 is complete only when:

1. Opportunity identity is deterministic.
2. Signal and opportunity are separate concepts.
3. Lifecycle state is downstream from opportunity creation.
4. Market context has a defined location in the contract.
5. Qualification has a defined location without thresholds.
6. Prioritization has a defined location without optimization.
7. Counterfactual and actual outcomes remain separate.
8. Provenance is preserved.
9. Safety flags remain enforced.
10. No production trading path is modified.

---

# 21. Next Architecture Step

After A1 is accepted:

A2 — MARKET CONTEXT CONTRACT

The next step will define exactly how market/regime context is
captured around each opportunity.

No market-context thresholds should be optimized until the evidence
collection contract is established.

---

# 22. Safety Boundary

A1 is an architecture specification.

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

A1 — OPPORTUNITY CONTRACT

Status:

**SPECIFICATION CREATED**

Next:

**A2 — MARKET CONTEXT CONTRACT**

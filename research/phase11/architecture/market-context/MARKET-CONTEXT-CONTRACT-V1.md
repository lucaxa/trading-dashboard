# TradeMind Pro — Market Context Contract V1

## Status

**A2 — MARKET CONTEXT CONTRACT**

Architecture research specification.

Status:

**DRAFT / RESEARCH ONLY**

This document does not modify the production trading path.

---

# 1. Purpose

The Market Context Contract defines the structured market environment
that must be captured around each TradeMind Pro opportunity.

The purpose is to answer:

**"What was the market environment when this opportunity appeared?"**

The contract records context.

It does NOT determine whether the opportunity should be traded.

---

# 2. Architectural Position

The target architecture is:

MARKET DATA
  ↓
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
PAPER EXPERIENCE

Market Context is therefore an upstream research layer.

---

# 3. Core Principle

Market context must be observable independently of trade outcome.

The system must not define a market regime by looking at whether the
subsequent trade won or lost.

Therefore:

CONTEXT
≠
OUTCOME

and:

CONTEXT
≠
PROFITABILITY LABEL

The context must be calculated from information available at or before
the opportunity timestamp.

---

# 4. Context Categories

A2 defines five initial context categories:

1. Trend
2. Volatility
3. Market Structure
4. Momentum
5. Time Of Day

These categories are descriptive.

A2 does not establish which category is predictive.

---

# 5. Trend Context

The contract must provide a structured representation of directional
market behaviour.

Initial states:

- UP
- DOWN
- NEUTRAL
- UNKNOWN

Potential observable inputs may include:

- EMA relationships
- EMA slope
- price relative to moving averages
- directional price movement

A2 does not prescribe a final formula.

No threshold is optimized at this stage.

---

# 6. Volatility Context

The contract must provide a structured representation of current
market volatility.

Initial states:

- LOW
- NORMAL
- HIGH
- UNKNOWN

Potential observable measurements may include:

- ATR14
- ATR relative to historical ATR
- candle range
- recent price dispersion

ATR14 may be preserved as a raw numerical measurement.

No volatility threshold is selected at A2.

---

# 7. Market Structure Context

The contract must provide a representation of observable price
structure.

Initial states:

- TRENDING
- RANGING
- BREAKOUT
- UNKNOWN

Potential structural observations may include:

- swing highs
- swing lows
- higher highs
- higher lows
- lower highs
- lower lows
- consolidation
- range expansion

No structural classification threshold is optimized at A2.

---

# 8. Momentum Context

The contract must preserve observable momentum information.

Initial states:

- POSITIVE
- NEGATIVE
- NEUTRAL
- UNKNOWN

Potential measurements may include:

- RSI
- rate of change
- directional candle behaviour
- momentum slope

Raw measurements may be preserved where available.

A2 does not establish a momentum trading rule.

---

# 9. Time Of Day Context

Time of day must be retained as contextual information.

Required:

- timestamp
- sessionDate
- marketMinute
- timeBucket

Initial descriptive buckets:

- OPEN
- MORNING
- MIDDAY
- AFTERNOON
- CLOSE_APPROACH

The buckets are descriptive only.

They must not be interpreted as profitability filters at A2.

---

# 10. Raw Measurements vs Classification

The contract must preserve both when available:

RAW MEASUREMENT

and

DESCRIPTIVE CLASSIFICATION.

Example:

{
  "atr14": 12.4,
  "volatility": "NORMAL"
}

The classification must never replace the underlying measurement when
the raw measurement is available.

This allows future research to audit how classifications were produced.

---

# 11. Context Timestamp

Every context observation must be tied to a timestamp.

Required:

- contextTimestamp
- contextCandleTimestamp

The context must represent information available no later than the
associated opportunity signal timestamp.

Future candles must not be used to construct the context.

---

# 12. Lookback Boundary

Every derived context feature must have a defined historical lookback.

The lookback must end at or before the context timestamp.

Example:

CURRENT CONTEXT
      ↑
      │
LOOKBACK
      │
──────┴──────────────
PAST CANDLES

No future candle may enter the calculation.

This is mandatory to prevent look-ahead bias.

---

# 13. Context Completeness

Each context category must have an explicit state.

Possible states:

- OBSERVED
- UNAVAILABLE
- INSUFFICIENT_HISTORY
- UNKNOWN

Missing information must not silently become a favourable state.

For example:

UNKNOWN

must not be interpreted as:

NEUTRAL

unless the classification rule explicitly defines that behaviour.

---

# 14. Context Confidence

A2 reserves a context confidence field.

Initial states:

- HIGH
- MEDIUM
- LOW
- UNKNOWN

Confidence is an observation-quality descriptor.

It is NOT a probability of trade success.

It must not be presented as:

"80% chance of winning"

or any equivalent profitability claim.

---

# 15. Market Context Object

Conceptual schema:

{
  "contextTimestamp": "...",
  "contextCandleTimestamp": 0,

  "trend": {
    "state": "UNKNOWN",
    "confidence": "UNKNOWN",
    "measurements": {}
  },

  "volatility": {
    "state": "UNKNOWN",
    "confidence": "UNKNOWN",
    "measurements": {}
  },

  "structure": {
    "state": "UNKNOWN",
    "confidence": "UNKNOWN",
    "measurements": {}
  },

  "momentum": {
    "state": "UNKNOWN",
    "confidence": "UNKNOWN",
    "measurements": {}
  },

  "timeOfDay": {
    "sessionDate": "...",
    "marketMinute": 0,
    "timeBucket": "UNKNOWN"
  }
}

---

# 16. Relationship With Opportunity Contract

A2 supplies the context object defined by A1.

A1:

Opportunity
  ↓
context

A2 defines:

context
  ├── trend
  ├── volatility
  ├── structure
  ├── momentum
  └── timeOfDay

The Opportunity Contract remains the parent architecture contract.

---

# 17. Relationship With Qualification

A2 must NOT decide whether an opportunity is qualified.

Correct:

MARKET CONTEXT
      ↓
OPPORTUNITY
      ↓
QUALIFICATION

Incorrect:

MARKET CONTEXT
      ↓
AUTOMATIC TRADE FILTER

Qualification is the next architecture layer.

---

# 18. Relationship With M1

M1 is frozen.

M1 observed:

- ATR14 range overlap
- entry-gap ATR overlap
- directional overlap
- adverse stop outcomes
- session-close outcomes

M1 did not establish a reliable causal filter.

Therefore A2 must not convert the M1 observations into thresholds.

A2 instead expands the observable context around opportunities.

---

# 19. Research Integrity Rules

A2 must enforce:

1. No look-ahead data.
2. No outcome-derived context labels.
3. No optimized thresholds.
4. No profitability labels.
5. No strategy mutation.
6. No learning activation.
7. No production-path changes.
8. No real orders.

---

# 20. Safety Boundary

Current architecture research state:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

These values remain mandatory.

---

# 21. A2 Acceptance Criteria

A2 is complete only when:

1. Trend context is defined.
2. Volatility context is defined.
3. Market structure context is defined.
4. Momentum context is defined.
5. Time-of-day context is defined.
6. Raw measurements can be preserved.
7. Context timestamps are defined.
8. Lookback boundaries are explicit.
9. Missing context is explicit.
10. Context is separated from outcome.
11. Context is separated from qualification.
12. No threshold optimization occurs.
13. No production trading behaviour changes.

---

# 22. Next Architecture Step

After A2 is accepted:

**A3 — OPPORTUNITY QUALIFICATION CONTRACT**

A3 will define how an opportunity can be evaluated using the observed
market context.

A3 must initially remain descriptive and evidence-based.

It must not immediately optimize a profitability threshold.

---

# 23. Checkpoint

**A2 — MARKET CONTEXT CONTRACT**

Status:

**SPECIFICATION CREATED**

Next:

**A3 — OPPORTUNITY QUALIFICATION CONTRACT**

Safety:

Learning OFF.

Strategy mutation OFF.

Threshold optimization OFF.

Promotion OFF.

Real orders OFF.

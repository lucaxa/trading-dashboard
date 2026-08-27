# TradeMind Pro — Architecture Replay Specification V1

## Status

**A6 — ARCHITECTURE REPLAY**

Architecture research specification.

Status:

**DRAFT / RESEARCH ONLY**

This specification defines how the frozen A1–A5 architecture will be
replayed against historical Phase 11 evidence.

It does not modify the production trading path.

---

# 1. Purpose

A6 tests whether the architecture defined by A1–A5 can be applied
deterministically to historical evidence.

The replay must establish whether the architecture can:

1. reconstruct market context,
2. reconstruct opportunities,
3. qualify opportunities,
4. prioritize competing opportunities,
5. apply the frozen lifecycle,
6. preserve all decisions for audit.

A6 does not attempt to improve profitability.

---

# 2. Frozen Architecture Inputs

A6 consumes the following frozen architecture contracts:

A1
Opportunity Contract

A2
Market Context Contract

A3
Opportunity Qualification Contract

A4
Opportunity Prioritization Contract

A5
Lifecycle Integration Contract

These contracts are specifications.

A6 must not silently alter their definitions.

---

# 3. Historical Inputs

The replay may consume existing research-only Phase 11 evidence and
historical candle data.

Expected input categories:

- Phase 11 evidence
- historical 5-minute candles
- existing reconstructed opportunity information where permitted
- existing frozen lifecycle information

Historical inputs must be explicitly recorded.

---

# 4. Replay Boundary

The replay operates entirely inside:

research/phase11/architecture/replay/

It must not modify:

- V10.25
- learning-engine.js
- production APIs
- broker integration
- frontend execution logic
- live trading state

---

# 5. Replay Pipeline

The replay sequence is:

HISTORICAL DATA
      ↓
A2 MARKET CONTEXT
      ↓
A1 OPPORTUNITY
      ↓
A3 QUALIFICATION
      ↓
A4 PRIORITIZATION
      ↓
A5 FROZEN LIFECYCLE
      ↓
REPLAY DECISION
      ↓
AUDIT OUTPUT

The ordering is mandatory.

---

# 6. No Outcome Leakage

The replay must determine:

- context,
- opportunity,
- qualification,
- prioritization,
- lifecycle decision

without using future outcome information.

The following are prohibited before the lifecycle decision:

- target result
- stop result
- session-close result
- R-multiple
- future price movement
- future candles
- future trade outcome

Outcome evaluation occurs only after the architecture decision has
been recorded.

---

# 7. Point-in-Time Rule

Every decision must use only information that was available at the
decision timestamp.

Historical replay must not use information from later candles to
construct earlier context.

This rule applies to:

- market context
- opportunity construction
- qualification
- prioritization
- lifecycle decision

---

# 8. A2 Replay

A2 reconstructs the observable market context.

The replay should preserve the context categories:

- trend
- volatility
- structure
- momentum
- timeOfDay

Each category should preserve its evidence state:

- OBSERVED
- UNAVAILABLE
- INSUFFICIENT_HISTORY
- UNKNOWN

The replay must record whether sufficient historical information
existed at the decision time.

---

# 9. A1 Replay

A1 reconstructs the opportunity identity and available fields.

Expected information includes, where available:

- opportunityId
- instrument
- timeframe
- signal
- signalTimestamp
- signalCandleTimestamp
- context
- entry
- risk
- provenance

A1 reconstruction must not invent unavailable values.

---

# 10. A3 Replay

Each reconstructed opportunity is passed through qualification.

The replay records:

- qualification state
- evidence quality
- dimension states
- reasons

Possible qualification states:

- NOT_EVALUATED
- QUALIFIED
- NOT_QUALIFIED
- INSUFFICIENT_CONTEXT

The qualification decision must not depend on future outcome.

---

# 11. A4 Replay

Only qualified opportunities enter prioritization.

The replay constructs competition sets from opportunities that could
compete for the same lifecycle capacity.

Each competition set records:

- competitionSetId
- instrument
- timeframe
- sessionDate
- decisionTimestamp
- candidate opportunities

Ranking must be deterministic.

---

# 12. A4 Ranking

The replay uses the A4 observable dimensions:

1. Context completeness
2. Signal integrity
3. Entry integrity
4. Risk integrity
5. Opportunity freshness
6. Lifecycle compatibility

The replay must preserve the ranking reasons.

No expected-profit score may be introduced.

---

# 13. Tie Handling

If opportunities remain equivalent after the defined priority
dimensions, use the deterministic tie-break order:

1. signalTimestamp
2. signalCandleTimestamp
3. opportunityId

The eventual outcome must never resolve a tie.

---

# 14. A5 Lifecycle Replay

The prioritized opportunities are passed to the frozen lifecycle.

The lifecycle remains authoritative.

The replay must preserve:

- one-position protection
- cooldown
- entry window
- entry-gap rules
- session boundaries
- entry validity
- risk validity

The architecture must not bypass any existing lifecycle constraint.

---

# 15. Lifecycle Decision

Every opportunity reaching lifecycle evaluation must receive an
explicit decision.

Possible conceptual decisions:

- ACCEPT
- BLOCK

Every BLOCK decision must preserve its reason.

Examples:

- POSITION_ACTIVE
- COOLDOWN_ACTIVE
- ENTRY_WINDOW_CLOSED
- ENTRY_GAP_INVALID
- SESSION_CLOSED
- INVALID_ENTRY
- INVALID_RISK

---

# 16. Actual vs Counterfactual

The replay must distinguish:

ACTUAL PAPER EXPERIENCE

from:

COUNTERFACTUAL RESEARCH

A lifecycle BLOCK does not become an actual trade.

A counterfactual outcome does not become an actual execution.

The replay output must preserve this distinction.

---

# 17. Opportunity Preservation

Every opportunity must remain auditable regardless of its decision.

The replay must preserve:

- opportunity identity
- context state
- qualification state
- priority state
- lifecycle decision
- lifecycle reason
- provenance

No opportunity may silently disappear.

---

# 18. Replay Output

The replay should produce a machine-readable output containing:

- schema
- replay version
- architecture versions
- input provenance
- safety flags
- competition sets
- opportunities
- qualification results
- prioritization results
- lifecycle decisions
- audit summary

---

# 19. Audit Summary

The final audit should report at minimum:

- total opportunities observed
- total qualified
- total not qualified
- total insufficient
- total competition sets
- total ranked
- total lifecycle accepted
- total lifecycle blocked
- block reasons
- reconstruction failures
- provenance failures
- outcome leakage violations

---

# 20. Integrity Checks

A6 must validate:

### Input integrity

Historical inputs exist and are readable.

### Contract integrity

A1–A5 contract files exist.

### Chronological integrity

No decision uses a future timestamp.

### Identity integrity

Opportunity IDs remain stable.

### Qualification integrity

Only valid qualification states reach prioritization.

### Prioritization integrity

Only qualified opportunities are ranked.

### Lifecycle integrity

Prioritization cannot bypass lifecycle rules.

### Outcome isolation

Future outcomes cannot influence pre-outcome decisions.

### Provenance integrity

Every decision can be traced to its source.

---

# 21. Failure Policy

A replay failure must be explicit.

Examples:

- INPUT_MISSING
- CONTRACT_MISSING
- INVALID_TIMESTAMP
- CONTEXT_INSUFFICIENT
- OPPORTUNITY_INVALID
- QUALIFICATION_FAILURE
- PRIORITIZATION_FAILURE
- LIFECYCLE_RECONSTRUCTION_FAILURE
- PROVENANCE_FAILURE
- OUTCOME_LEAKAGE

The replay must not silently convert a failure into a valid decision.

---

# 22. No Automatic Recovery

A6 must not silently repair corrupted research evidence.

If required information is missing or inconsistent:

record the failure.

Do not fabricate a value.

Do not infer a future value.

Do not substitute a different source without recording it.

---

# 23. Safety Boundary

A6 is research-only.

Mandatory state:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

paperOrders = false

realOrders = false

---

# 24. Production Isolation

A6 must not:

- modify V10.25
- modify learning-engine.js
- modify production APIs
- modify broker integration
- modify frontend execution
- change live trading behaviour
- activate learning
- mutate strategy parameters
- promote a strategy

---

# 25. Profitability Isolation

A6 is not a backtest optimization engine.

It must not optimize:

- ATR thresholds
- RSI thresholds
- entry-gap thresholds
- volatility thresholds
- trend thresholds
- time-of-day thresholds
- priority weights
- profitability scores

The purpose is architectural replay.

---

# 26. Relationship With M1

M1 remains frozen evidence.

M1 showed:

- 99 lifecycle-blocked episodes
- 64 unique opportunities
- 14 sequentially accepted counterfactual trades
- 2 TARGET
- 10 STOP
- 2 SESSION_CLOSE
- net R of approximately -5.3924

M1 did not establish a stable causal profitability filter.

A6 therefore tests architecture behaviour rather than attempting to
repair M1 through parameter fitting.

---

# 27. Replay Success

A6 is considered structurally successful when:

1. All required contracts are present.
2. Historical inputs are traceable.
3. Opportunities can be reconstructed.
4. Context can be represented.
5. Qualification is deterministic.
6. Prioritization is deterministic.
7. Lifecycle rules remain authoritative.
8. Decisions are auditable.
9. Future information is excluded.
10. No production path changes occur.

A6 structural success does not imply trading profitability.

---

# 28. Replay Result Categories

The replay should distinguish:

PASS

The architecture decision was reconstructed successfully.

BLOCKED

The opportunity was correctly rejected by a lifecycle constraint.

INSUFFICIENT

Required evidence was unavailable.

INVALID

The opportunity failed structural validation.

RESEARCH_FAILURE

The architecture could not be reconstructed reliably.

These categories must not be confused with WIN or LOSS.

---

# 29. Next Stage

After A6 structural replay:

**A7 — ARCHITECTURE VALIDATION GATE**

A7 will determine whether the replay is sufficiently complete,
reproducible, and safe to justify consideration of a later isolated
architecture trial.

A7 does not automatically authorize production integration.

---

# 30. Checkpoint

**A6 — ARCHITECTURE REPLAY SPECIFICATION**

Status:

**SPECIFICATION CREATED**

Next:

**A6 REPLAY RUNNER IMPLEMENTATION**

Safety:

Learning OFF.

Strategy mutation OFF.

Threshold optimization OFF.

Promotion OFF.

Paper orders OFF.

Real orders OFF.

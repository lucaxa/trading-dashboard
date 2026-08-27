# TradeMind Pro — Lifecycle Integration Contract V1

## Status

**A5 — LIFECYCLE INTEGRATION CONTRACT**

Architecture research specification.

Status:

**DRAFT / RESEARCH ONLY**

This document defines how the new opportunity architecture interacts
with the existing V10.25 lifecycle.

It does not authorize production integration.

---

# 1. Purpose

The Lifecycle Integration Contract defines the boundary between the
new opportunity-selection architecture and the existing V10.25
lifecycle.

The purpose is to ensure that:

MARKET CONTEXT
  ↓
OPPORTUNITY
  ↓
QUALIFICATION
  ↓
PRIORITIZATION

can provide structured information to the lifecycle without weakening
the existing execution protections.

---

# 2. Architectural Position

The complete architecture is:

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
  ↓
RESEARCH / VALIDATION

A5 defines only the boundary between:

PRIORITIZATION

and

LIFECYCLE.

---

# 3. Core Principle

The new architecture may INFORM the lifecycle.

It must NOT BYPASS the lifecycle.

Therefore:

QUALIFICATION
      ↓
PRIORITIZATION
      ↓
LIFECYCLE SAFETY
      ↓
ACCEPT / BLOCK

is valid.

But:

QUALIFICATION
      ↓
PRIORITIZATION
      ↓
DIRECT EXECUTION

is prohibited.

---

# 4. Existing Lifecycle Remains Authoritative

The existing V10.25 lifecycle remains the authoritative execution
constraint during architecture research.

A5 does not redefine:

- one-position protection
- cooldown
- entry timing
- entry-gap rules
- session boundaries
- stop handling
- target handling
- position state
- execution safety

The existing lifecycle is treated as frozen.

---

# 5. Lifecycle Inputs

The lifecycle may receive a qualified and prioritized opportunity
containing:

- opportunityId
- instrument
- timeframe
- signal
- signalTimestamp
- signalCandleTimestamp
- context
- qualification state
- prioritization state
- entry information
- risk information
- provenance
- safety flags

The lifecycle remains responsible for deciding whether the
opportunity can proceed.

---

# 6. Lifecycle State

A5 recognizes the following conceptual lifecycle states:

- AVAILABLE
- POSITION_ACTIVE
- COOLDOWN
- ENTRY_WINDOW_CLOSED
- SESSION_CLOSED
- ACCEPTED
- BLOCKED
- COMPLETED

These states describe lifecycle conditions.

They do not describe market quality.

---

# 7. One-Position Rule

The one-position constraint remains mandatory.

If an accepted paper position is active:

NEW OPPORTUNITY
      ↓
LIFECYCLE
      ↓
BLOCKED

unless the frozen lifecycle itself permits the opportunity.

The new prioritization layer must not create a second simultaneous
position.

---

# 8. Cooldown Rule

Cooldown remains authoritative.

If cooldown is active:

QUALIFIED OPPORTUNITY
      ↓
LIFECYCLE
      ↓
BLOCKED_BY_COOLDOWN

Prioritization cannot override the cooldown.

---

# 9. Entry Window

The existing entry window remains authoritative.

An opportunity outside the permitted entry window cannot be made
eligible merely because it has high priority.

Correct:

HIGH PRIORITY
      ↓
ENTRY WINDOW CHECK
      ↓
BLOCKED

The architecture must never convert priority into execution authority.

---

# 10. Entry-Gap Rule

The existing V10.25 entry-gap rule remains frozen.

A5 does not introduce a replacement threshold.

If the existing lifecycle determines that the entry gap is invalid:

OPPORTUNITY
      ↓
ENTRY-GAP CHECK
      ↓
BLOCKED

The prioritization layer may record that the opportunity was
structurally strong, but it cannot override the entry rule.

---

# 11. Session Boundary

The lifecycle remains responsible for session boundaries.

An opportunity approaching or crossing the session boundary must be
handled according to the existing lifecycle rules.

The new architecture must not extend the trading session.

---

# 12. Prioritization Does Not Guarantee Selection

A4 ranking establishes priority among competing opportunities.

It does not guarantee execution.

Example:

Opportunity A → Rank 1
Opportunity B → Rank 2

The lifecycle may still reject A because:

- position active
- cooldown active
- entry window closed
- entry rule failed
- session constraint

If A is blocked, B must be evaluated according to the defined
lifecycle rules rather than assuming that ranking itself creates a
trade.

---

# 13. Opportunity Preservation

A lifecycle block must not destroy the underlying opportunity record.

The system should preserve:

- opportunity identity
- qualification state
- priority state
- lifecycle decision
- lifecycle reason
- timestamp
- provenance

This is required for later research.

A blocked opportunity may subsequently be used in counterfactual
analysis.

---

# 14. Actual vs Counterfactual

A5 maintains a strict separation between:

ACTUAL PAPER LIFECYCLE

and

COUNTERFACTUAL RESEARCH LIFECYCLE.

Example:

Actual:

OPPORTUNITY
  ↓
LIFECYCLE BLOCK
  ↓
NOT TRADED

Counterfactual:

OPPORTUNITY
  ↓
HYPOTHETICAL ACCEPTANCE
  ↓
TARGET / STOP / SESSION CLOSE

The counterfactual result must never be recorded as an actual trade.

---

# 15. Lifecycle Decision Object

Conceptual schema:

{
  "state": "BLOCKED",

  "decision": "REJECT",

  "reason": "POSITION_ACTIVE",

  "decisionTimestamp": "...",

  "opportunityId": "...",

  "source": "V10.25_FROZEN_LIFECYCLE"
}

For an accepted opportunity:

{
  "state": "ACCEPTED",

  "decision": "ACCEPT",

  "reason": "LIFECYCLE_AVAILABLE",

  "decisionTimestamp": "...",

  "opportunityId": "...",

  "source": "V10.25_FROZEN_LIFECYCLE"
}

These are conceptual representations only.

---

# 16. Decision Ordering

Lifecycle evaluation must occur in a deterministic sequence.

Conceptual sequence:

1. Confirm opportunity identity.
2. Confirm qualification state.
3. Confirm prioritization state.
4. Evaluate current lifecycle state.
5. Evaluate position availability.
6. Evaluate cooldown.
7. Evaluate entry window.
8. Evaluate entry validity.
9. Evaluate session constraints.
10. Produce lifecycle decision.

The exact implementation must reproduce the frozen V10.25
behaviour.

A5 does not change the existing rule order.

---

# 17. Safety Precedence

Safety constraints have higher precedence than opportunity priority.

Conceptually:

SAFETY
  >
LIFECYCLE CONSTRAINT
  >
PRIORITIZATION
  >
QUALIFICATION
  >
SIGNAL

This means a high-priority opportunity cannot override a safety
constraint.

---

# 18. No Priority-Based Override

The following behaviour is prohibited:

IF priority == 1
THEN bypass lifecycle.

Priority is informational and ordering-oriented.

It is not an execution permission.

---

# 19. No Qualification-Based Override

Likewise:

IF qualification == QUALIFIED
THEN execute.

This is prohibited.

Qualification only means the opportunity satisfies the defined
research qualification requirements.

Lifecycle must still independently approve or reject it.

---

# 20. No Outcome Leakage

Lifecycle integration must not use:

- future target result
- future stop result
- future price
- R-multiple
- future candles

to determine the original lifecycle decision.

Historical replay must reproduce the decision using information
available at that time.

---

# 21. No Learning

A5 does not connect lifecycle decisions directly to the learning
engine.

Lifecycle outcomes may eventually become research observations, but
they must not automatically modify strategy behaviour.

Learning remains OFF.

---

# 22. No Strategy Mutation

A5 must not alter:

- V10.25 thresholds
- V10.25 entry rules
- V10.25 stop rules
- V10.25 target rules
- lifecycle timing
- cooldown settings
- session settings

Any future change requires a separate research and validation gate.

---

# 23. Research Replay

A5 must support future historical replay.

For each opportunity:

1. Construct market context.
2. Construct opportunity.
3. Evaluate qualification.
4. Evaluate prioritization.
5. Apply frozen lifecycle.
6. Record accept/block decision.
7. Preserve the opportunity regardless of decision.
8. Evaluate outcome only after the lifecycle decision.

This creates an auditable architecture replay.

---

# 24. Competition Handling

When multiple qualified opportunities exist:

OPPORTUNITY SET
      ↓
PRIORITIZATION
      ↓
RANKED CANDIDATES
      ↓
LIFECYCLE

The lifecycle remains the final authority over execution eligibility.

If the top-ranked opportunity is rejected because of a lifecycle
constraint, the system must follow the explicitly defined replay
rules.

It must not automatically skip safety constraints simply to reach the
next opportunity.

---

# 25. Failure Recording

Every lifecycle rejection should preserve an explicit reason.

Examples:

- POSITION_ACTIVE
- COOLDOWN_ACTIVE
- ENTRY_WINDOW_CLOSED
- ENTRY_GAP_INVALID
- SESSION_CLOSED
- INVALID_ENTRY
- INVALID_RISK
- QUALIFICATION_REQUIRED
- PRIORITIZATION_REQUIRED

The exact reason must reflect the actual rule that caused the
decision.

---

# 26. Provenance

Every lifecycle decision must preserve sufficient provenance for
reconstruction.

Required:

- opportunityId
- decisionTimestamp
- lifecycleVersion
- instrument
- timeframe

Where available:

- evidenceFile
- candleFile
- architectureVersion
- analyzerVersion

---

# 27. Safety Flags

A5 requires:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

These values remain mandatory during architecture research.

---

# 28. Relationship With M1

M1 remains frozen.

M1 demonstrated that lifecycle-blocked opportunities can contain
counterfactual information, but M1 did not establish a stable
profitability filter.

A5 therefore does not remove the lifecycle.

Instead, A5 provides a controlled architectural boundary where future
opportunity qualification and prioritization can be evaluated against
the existing lifecycle.

---

# 29. Production Integration Boundary

A5 is an architecture contract.

It does NOT authorize:

- modifying V10.25
- modifying live APIs
- modifying broker execution
- modifying frontend execution behaviour
- enabling learning
- enabling strategy mutation
- enabling promotion
- placing paper orders through a new architecture
- placing real orders

Any production integration requires a separate validation gate.

---

# 30. A5 Acceptance Criteria

A5 is complete only when:

1. The lifecycle remains authoritative.
2. One-position protection remains mandatory.
3. Cooldown remains mandatory.
4. Entry-window rules remain frozen.
5. Entry-gap rules remain frozen.
6. Session boundaries remain frozen.
7. Qualification cannot bypass lifecycle.
8. Prioritization cannot bypass lifecycle.
9. Lifecycle blocks preserve opportunity records.
10. Actual and counterfactual outcomes remain separate.
11. Lifecycle decisions are deterministic.
12. Lifecycle rejection reasons are auditable.
13. Outcome leakage is prohibited.
14. Learning remains disabled.
15. Strategy mutation remains disabled.
16. Production trading behaviour remains unchanged.

---

# 31. Architecture Completion After A5

Once A5 is accepted, the architecture contract layer is complete:

A1 — Opportunity Contract
A2 — Market Context Contract
A3 — Opportunity Qualification Contract
A4 — Opportunity Prioritization Contract
A5 — Lifecycle Integration Contract

The next stage is implementation/research replay.

---

# 32. Next Step

**A6 — ARCHITECTURE REPLAY**

A6 will define a research-only replay of the complete architecture:

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
FROZEN LIFECYCLE
  ↓
COUNTERFACTUAL / PAPER OUTCOME

The purpose of A6 is to determine whether the architecture behaves
correctly before any production integration is considered.

---

# 33. Checkpoint

**A5 — LIFECYCLE INTEGRATION CONTRACT**

Status:

**SPECIFICATION CREATED**

Next:

**A6 — ARCHITECTURE REPLAY**

Safety:

Learning OFF.

Strategy mutation OFF.

Threshold optimization OFF.

Promotion OFF.

Paper orders OFF.

Real orders OFF.

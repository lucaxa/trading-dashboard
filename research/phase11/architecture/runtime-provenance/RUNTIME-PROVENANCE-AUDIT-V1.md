# TradeMind Pro — A10 Runtime Provenance Audit V1

## Status

A10 — RUNTIME PROVENANCE AUDIT

Research architecture validation.

Status:

COMPLETED — RESEARCH ONLY

This audit does not modify the production trading path.

---

# 1. Purpose

A10 verifies the executable provenance of the Phase 11 live paper
observation path against the frozen Phase 8 candidate boundary.

The audit distinguishes:

- engine labels
- executable code
- imported functions
- signal-generation logic
- candle boundary
- entry logic
- risk logic
- lifecycle logic

No cosmetic engine relabeling is performed.

---

# 2. Frozen Candidate Boundary

Phase 8 candidate build:

8f81985c1ddb1f587eead49a46a95bebfe9b2380

The candidate provenance must remain the reference boundary.

---

# 3. File-Level Provenance Audit

The following files were compared from the frozen candidate commit
through the current HEAD:

- api/backtest.js
- api/live-signal.js

Result:

PASS

No Git diff was returned for either file.

Therefore no file-level changes were detected between the frozen
candidate boundary and the current HEAD for these two files.

---

# 4. Runtime Import Path

The live endpoint imports:

- CONFIG
- normalizeCandles
- calculateHistoricalIndicators
- getSignal

from:

./backtest.js

Therefore the live signal endpoint does not use the standalone
frontend strategy.js signal function.

Runtime relationship:

INDstocks
  |
  v
api/live-signal.js
  |
  v
normalizeCandles()
  |
  v
calculateHistoricalIndicators()
  |
  v
getSignal()
  |
  v
BUY / SELL / WAIT

---

# 5. Signal Engine Provenance

The executable getSignal() implementation used by the live endpoint
is the exported getSignal() implementation in api/backtest.js.

The current api/backtest.js identifies its configuration as:

V10.25

Therefore the executable signal implementation currently resolves
through the V10.25 backtest engine code.

---

# 6. Engine Label Observation

api/live-signal.js contains a response-level strategy label:

V10.20

api/backtest.js contains:

CONFIG.VERSION = V10.25

These labels are inconsistent.

This audit does NOT rename either label.

The discrepancy is recorded as a provenance/documentation finding.

The executable import relationship takes precedence over cosmetic
naming when determining actual code lineage.

---

# 7. Completed-Candle Boundary

The live endpoint removes the currently forming 5-minute candle when
the latest candle belongs to the current 5-minute bucket.

The signal is therefore calculated from the latest completed candle.

This is consistent with the Phase 11 requirement that an observation
must not be manufactured from a currently forming candle.

Result:

PASS

---

# 8. Historical Signal Boundary

The historical execution path calculates the signal on a candle and,
when the signal is executable, uses the following candle for the
actual entry.

Relationship:

SIGNAL CANDLE
  |
  v
NEXT CANDLE OPEN
  |
  v
ENTRY

Result:

PASS

---

# 9. Risk Provenance

The historical execution path calculates:

risk = ATR × ATR_STOP_MULTIPLIER

and:

reward = risk × RISK_REWARD

The current configuration contains:

ATR_STOP_MULTIPLIER = 1.5

RISK_REWARD = 2

The live endpoint's reference risk calculation also uses these
configuration values.

Result:

PASS

---

# 10. Entry-Gap Provenance

The historical execution path calculates the actual entry gap between
the next candle open and the signal candle close.

The gap is normalized by ATR and checked against:

MAX_ENTRY_GAP_ATR

This remains downstream of signal generation.

The live endpoint does not manufacture a historical entry.

Its reference entry is the signal candle close and is explicitly
described as a reference level.

---

# 11. Lifecycle Separation

The historical execution path applies downstream constraints including:

- session filtering
- cooldown
- same-candle re-entry prevention
- entry-window filtering
- position management
- session close

These occur after signal generation.

Therefore:

SIGNAL
  |
  v
DOWNSTREAM EXECUTION / LIFECYCLE CONSTRAINTS

A signal is not automatically equivalent to an accepted trade.

---

# 12. Opportunity Architecture Relationship

The A7/A8 architecture requires an opportunity to exist before
lifecycle blocking.

Therefore the future production-boundary architecture remains:

SIGNAL GENERATED
  |
  v
OPPORTUNITY CREATED
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
OUTCOME

The current live-signal endpoint is not itself being modified by A10.

---

# 13. Standalone strategy.js

The repository also contains:

strategy.js

This file exposes:

window.TradeMindStrategy.generateSignal()

Its implementation is a separate frontend strategy interface.

A10 does not treat this frontend interface as the authoritative
Phase 11 live signal engine because api/live-signal.js imports getSignal()
from api/backtest.js.

No change is authorized to strategy.js.

---

# 14. Provenance Findings

## Finding A

Frozen candidate file comparison:

PASS

## Finding B

Live signal imports getSignal() from api/backtest.js:

PASS

## Finding C

Current executable backtest signal implementation:

V10.25

## Finding D

Live response strategy label:

V10.20

## Finding E

V10.20/V10.25 naming discrepancy:

RECORDED

No cosmetic relabeling performed.

## Finding F

Completed-candle boundary:

PASS

## Finding G

Historical next-candle entry boundary:

PASS

## Finding H

ATR risk and 1:2 reward relationship:

PASS

## Finding I

Production strategy modification during A10:

NONE

---

# 15. A10 Decision

The available evidence supports the following conclusion:

The Phase 11 live signal endpoint currently resolves its executable
signal-generation logic through api/backtest.js.

The frozen candidate file boundary matches the current versions of:

- api/backtest.js
- api/live-signal.js

No production strategy modification is required for the provenance
finding.

The V10.20/V10.25 naming discrepancy is documented but deliberately
left unchanged.

---

# 16. Safety Boundary

A10 authorizes no:

- strategy modification
- threshold modification
- learning
- parameter optimization
- promotion
- broker order
- real order
- frontend strategy modification
- production-path modification

Current safety state:

researchOnly = true

learningEnabled = false

strategyMutation = false

promotionEnabled = false

realOrders = false

---

# 17. Next Architecture Gate

A10 establishes the runtime provenance required to proceed to the
live paper-observation funnel.

Next:

A11 — LIVE PAPER OBSERVATION FUNNEL

The next architecture stage must connect:

LIVE MARKET
  |
  v
completed 5m candle
  |
  v
frozen executable signal
  |
  v
opportunity event creation
  |
  v
qualification
  |
  v
prioritization
  |
  v
lifecycle
  |
  v
PAPER-ONLY OBSERVATION
  |
  v
Phase 11 Session 6

Session 6 must remain blocked until the funnel itself passes its
validation gate.

---

# CHECKPOINT

A10 — RUNTIME PROVENANCE AUDIT

Status:

COMPLETED — RESEARCH ONLY

Executable lineage:

api/live-signal.js
    |
    v
api/backtest.js
    |
    v
getSignal()

Frozen candidate boundary:

8f81985c1ddb1f587eead49a46a95bebfe9b2380

Naming discrepancy:

V10.20 response label
vs
V10.25 executable configuration

Action:

NO COSMETIC RELABELING

Next:

A11 — LIVE PAPER OBSERVATION FUNNEL

END OF A10 SPECIFICATION

# TradeMind Pro — Pre-Market Selection Engine

## Purpose

The Pre-Market Selection Engine identifies 0–3 Indian equity
candidates before the market opens for potential intraday
opportunities.

It is a research and candidate-selection system.

It does NOT place orders.

## Core flow

Market Regime
→ Information/Catalyst Discovery
→ Equity Universe
→ Technical Context
→ Liquidity/Volatility
→ Candidate Evaluation
→ Ranking
→ 0–3 Candidates

## Existing Trade Backend Boundary

The engine produces candidate information only.

The existing TradeMind trade backend remains the final authority
for:

- entry conditions
- confirmation
- risk
- position sizing
- stop loss
- targets
- trade management
- exits
- broker execution

The Pre-Market Selection Engine must never bypass that backend.

## No-Trade Rule

The engine must be able to return zero candidates.

It must never manufacture a candidate merely to satisfy a
2–3-stock output requirement.

## Historical Research Rule

For historical replay, the engine may only use information that
was available before the defined pre-market cutoff for that
historical trading day.

Information published after the cutoff must not influence the
selection.

## Production Safety

Initial versions are research/paper only.

No broker order functionality belongs inside this module.

## Frontend Boundary

The engine should initially expose a structured selection result.
The V2 frontend may consume that result later.

The frontend must not make trading decisions.

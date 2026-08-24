# TradeMind Pro — Phase 11 Episode / Outcome Analyzer V1

## Purpose

Research-only analyzer for exported:

`TradeMind-Pro-Phase11-Evidence-v2`

evidence files.

The analyzer converts frontend observations into independent BUY/SELL
signal episodes and conservatively evaluates subsequent captured prices.

## Safety

This analyzer:

- does not modify V10.25
- does not modify `api/learning-engine.js`
- does not modify frontend code
- does not modify Phase 11 evidence
- does not place broker orders
- does not activate learning
- does not promote a strategy

## Important distinction

Observation != signal episode != trade.

The Phase 11 recorder can capture repeated observations of the same
decision state because it records state changes and heartbeat observations.

Therefore the analyzer groups consecutive BUY/SELL observations into
episodes.

## Outcome rules

### BUY

Target is reached when:

`price >= target`

Stop is reached when:

`price <= stop`

### SELL

Target is reached when:

`price <= target`

Stop is reached when:

`price >= stop`

### Same-observation collision

If target and stop are both touched by the same captured observation,
the analyzer returns:

`UNRESOLVED`

because the current evidence does not provide intrabar ordering.

## Outcomes

- TARGET = +2R
- STOP = -1R
- UNRESOLVED = outcome cannot be proven
- INSUFFICIENT = required trade structure is missing

## No hindsight

The analyzer does not use a later signal to redefine an earlier episode.

## Usage

From this directory:

```bash
node analyzer.js path/to/session.json output.json

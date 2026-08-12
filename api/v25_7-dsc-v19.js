/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v19
 S5 TIMESTAMP-ANOMALY DOWNSTREAM IMPACT AUDIT
===========================================================

PURPOSE
-------
Determine whether the 10 timestamp-anomaly observations identified
in the S5 Dhan historical dataset can materially affect the V25.7
indicator / feature path.

CONTROL:
A = ORIGINAL Dhan S5 candles
B = SAME candles, with ONLY timestamp-anomaly rows excluded

IMPORTANT:
- OHLC values of retained candles are unchanged.
- No timestamp repair.
- No synthetic candles.
- No negative-volume policy change.
- No learning records.
- No candidate discovery.
- No strategy / threshold changes.
- No historical import authorization.
- No validation / OOS.
- No real orders.

The audit uses the same price-derived indicators and the exact
V25.7 production VWAP rule used by v18:

    Math.max(0, n(c.v, 0))

TIMESTAMP ANOMALY POLICY
------------------------
A row is considered anomalous when:
1. timestamp is not numeric/finite, OR
2. timestamp is not strictly increasing, OR
3. the gap from the previous timestamp is <= 0, OR
4. the gap is not a normal 5-minute grid interval within the
   chronological candle stream.

This diagnostic does NOT repair anomalies. It only measures the
downstream effect of excluding the affected observations.

RUN:
 /api/v25_7-dsc-v19?probe=1
===========================================================
*/

function n(x, fallback = 0) {
    const v = Number(x);
    return Number.isFinite(v) ? v : fallback;
}

function ema(values, period) {
    if (values.length < period) return null;

    const k = 2 / (period + 1);
    let e = values.slice(0, period)
        .reduce((a,b)=>a+b,0) / period;

    for (let i = period; i < values.length; i++) {
        e = values[i] * k + e * (1-k);
    }

    return e;
}

function rsi(values, period = 14) {
    if (values.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const d = values[i] - values[i-1];
        if (d >= 0) gains += d;
        else losses += -d;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {
        const d = values[i] - values[i-1];
        const gain = d > 0 ? d : 0;
        const loss = d < 0 ? -d : 0;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }

    if (avgLoss === 0) return 100;

    return 100 - (100 / (1 + avgGain / avgLoss));
}

function atr(candles, period = 14) {
    if (candles.length <= period) return null;

    const tr = [];

    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const p = candles[i-1];

        tr.push(Math.max(
            c.h - c.l,
            Math.abs(c.h - p.c),
            Math.abs(c.l - p.c)
        ));
    }

    if (tr.length < period) return null;

    let a = tr.slice(0, period)
        .reduce((x,y)=>x+y,0) / period;

    for (let i = period; i < tr.length; i++) {
        a = ((a * (period - 1)) + tr[i]) / period;
    }

    return a;
}

/*
Exact V25.7 production VWAP policy.
*/
function sessionVWAP(candles) {
    let pv = 0;
    let vv = 0;

    for (const c of candles) {
        const price = (c.h + c.l + c.c) / 3;
        const volume = Math.max(0, n(c.v, 0));

        pv += price * volume;
        vv += volume;
    }

    return vv > 0 ? pv / vv : null;
}

function normalizeRows(payload) {
    const ts = payload?.timestamp || [];
    const o = payload?.open || [];
    const h = payload?.high || [];
    const l = payload?.low || [];
    const c = payload?.close || [];
    const v = payload?.volume || [];

    const len = Math.min(
        ts.length, o.length, h.length, l.length, c.length, v.length
    );

    const rows = [];

    for (let i = 0; i < len; i++) {
        rows.push({
            sourceIndex:i,
            ts:Number(ts[i]),
            o:Number(o[i]),
            h:Number(h[i]),
            l:Number(l[i]),
            c:Number(c[i]),
            v:Number(v[i])
        });
    }

    return rows;
}

/*
A timestamp is expected to advance in 5-minute (300-second)
increments inside a continuous chronological sequence.

We classify only the affected row itself. A large overnight/session
gap is NOT an anomaly because market sessions naturally contain gaps.
*/
function timestampAudit(rows) {
    const anomalyIndices = [];
    const details = [];

    for (let i = 0; i < rows.length; i++) {

        const row = rows[i];

        if (!Number.isFinite(row.ts)) {
            anomalyIndices.push(i);
            details.push({
                sourceIndex:row.sourceIndex,
                reason:"NON_NUMERIC_TIMESTAMP"
            });
            continue;
        }

        if (i === 0) continue;

        const prev = rows[i-1];

        if (!Number.isFinite(prev.ts)) {
            anomalyIndices.push(i);
            details.push({
                sourceIndex:row.sourceIndex,
                reason:"PREVIOUS_TIMESTAMP_INVALID"
            });
            continue;
        }

        const diff = row.ts - prev.ts;

        /*
        Short/non-positive gaps are direct timestamp defects.
        For ordinary positive gaps, only gaps that are shorter than
        a normal market-session spacing are treated as anomalies.
        Large gaps can be overnight/weekend/session gaps.
        */
        if (diff <= 0) {
            anomalyIndices.push(i);
            details.push({
                sourceIndex:row.sourceIndex,
                previousTimestamp:prev.ts,
                timestamp:row.ts,
                diffSeconds:diff,
                reason:"NON_POSITIVE_SPACING"
            });
            continue;
        }

        if (diff < 300) {
            anomalyIndices.push(i);
            details.push({
                sourceIndex:row.sourceIndex,
                previousTimestamp:prev.ts,
                timestamp:row.ts,
                diffSeconds:diff,
                reason:"SHORT_SPACING"
            });
        }
    }

    return {
        anomalyIndices,
        details
    };
}

function indicatorSnapshot(candles) {
    const closes = candles.map(x=>x.c);

    const e9 = ema(closes,9);
    const e21 = ema(closes,21);
    const r = rsi(closes,14);
    const a = atr(candles,14);
    const vw = sessionVWAP(candles);

    return {
        ema9:e9,
        ema21:e21,
        rsi14:r,
        atr14:a,
        vwap:vw,

        emaState:
            e9 == null || e21 == null
                ? null
                : e9 > e21 ? "BULL"
                : e9 < e21 ? "BEAR"
                : "FLAT",

        vwapDirection:
            vw == null || closes.length === 0
                ? null
                : closes[closes.length-1] > vw
                    ? "ABOVE"
                    : closes[closes.length-1] < vw
                        ? "BELOW"
                        : "AT"
    };
}

function absDiff(a,b) {
    if (a == null || b == null) return null;
    return Math.abs(a-b);
}

function changed(a,b,eps=1e-9) {
    if (a == null || b == null) return a !== b;
    return Math.abs(a-b) > eps;
}

async function fetchWindow(token, fromDate, toDate) {

    const response = await fetch(
        "https://api.dhan.co/v2/charts/intraday",
        {
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                "access-token":token
            },
            body:JSON.stringify({
                securityId:"13",
                exchangeSegment:"IDX_I",
                instrument:"INDEX",
                interval:"5",
                oi:false,
                fromDate,
                toDate
            })
        }
    );

    const text = await response.text();

    let json = null;
    try {
        json = JSON.parse(text);
    } catch (_) {}

    return {response,json};
}

export default async function handler(req,res) {

    const VERSION = "V25.7-DSC-v19";

    if (req.method !== "GET") {
        return res.status(405).json({
            success:false,
            version:VERSION,
            status:"METHOD_NOT_ALLOWED",
            error:"Use GET with ?probe=1."
        });
    }

    if (String(req.query?.probe || "1") !== "1") {
        return res.status(400).json({
            success:false,
            version:VERSION,
            status:"INVALID_PROBE",
            availableProbes:["1"]
        });
    }

    const token = process.env.DHAN_ACCESS_TOKEN;

    if (!token) {
        return res.status(200).json({
            success:false,
            version:VERSION,
            status:"CONFIG_ERROR",
            paperOnly:true,
            realOrders:false,
            error:"DHAN_ACCESS_TOKEN is not configured."
        });
    }

    const windows = [
        {
            id:"A",
            fromDate:"2021-12-28 00:00:00",
            toDate:"2022-02-26 00:00:00"
        },
        {
            id:"B",
            fromDate:"2022-02-26 00:00:00",
            toDate:"2022-04-27 00:00:00"
        },
        {
            id:"C",
            fromDate:"2022-04-27 00:00:00",
            toDate:"2022-06-26 00:00:00"
        }
    ];

    const windowResults = [];

    let aggregateRawRows = 0;
    let aggregateAnomalies = 0;
    let aggregateChangedFeatures = 0;

    for (const w of windows) {

        const result = await fetchWindow(
            token,
            w.fromDate,
            w.toDate
        );

        const rows = normalizeRows(result.json);

        /*
        Work chronologically so the anomaly test reflects the
        actual historical sequence.
        */
        rows.sort((a,b)=>a.ts-b.ts);

        const audit = timestampAudit(rows);
        const anomalySet = new Set(audit.anomalyIndices);

        const filtered = rows.filter(
            (_,i)=>!anomalySet.has(i)
        );

        const raw = indicatorSnapshot(rows);
        const filteredSnapshot = indicatorSnapshot(filtered);

        const comparison = {
            ema9:{
                raw:raw.ema9,
                filtered:filteredSnapshot.ema9,
                changed:changed(raw.ema9,filteredSnapshot.ema9),
                absDifference:absDiff(raw.ema9,filteredSnapshot.ema9)
            },

            ema21:{
                raw:raw.ema21,
                filtered:filteredSnapshot.ema21,
                changed:changed(raw.ema21,filteredSnapshot.ema21),
                absDifference:absDiff(raw.ema21,filteredSnapshot.ema21)
            },

            rsi14:{
                raw:raw.rsi14,
                filtered:filteredSnapshot.rsi14,
                changed:changed(raw.rsi14,filteredSnapshot.rsi14),
                absDifference:absDiff(raw.rsi14,filteredSnapshot.rsi14)
            },

            atr14:{
                raw:raw.atr14,
                filtered:filteredSnapshot.atr14,
                changed:changed(raw.atr14,filteredSnapshot.atr14),
                absDifference:absDiff(raw.atr14,filteredSnapshot.atr14)
            },

            vwap:{
                raw:raw.vwap,
                filtered:filteredSnapshot.vwap,
                changed:changed(raw.vwap,filteredSnapshot.vwap),
                absDifference:absDiff(raw.vwap,filteredSnapshot.vwap)
            }
        };

        const emaStateChanged =
            raw.emaState !== filteredSnapshot.emaState;

        const vwapDirectionChanged =
            raw.vwapDirection !== filteredSnapshot.vwapDirection;

        const changedCount = Object.values(comparison)
            .filter(x=>x.changed).length
            + (emaStateChanged ? 1 : 0)
            + (vwapDirectionChanged ? 1 : 0);

        aggregateRawRows += rows.length;
        aggregateAnomalies += audit.anomalyIndices.length;
        aggregateChangedFeatures += changedCount;

        windowResults.push({
            window:w,

            http:{
                status:result.response.status,
                ok:result.response.ok,
                contentType:
                    result.response.headers.get("content-type")
            },

            rawRows:rows.length,
            timestampAnomalyRows:audit.anomalyIndices.length,

            anomalyDetails:audit.details,

            filteredRows:filtered.length,
            retainedPct:
                rows.length
                    ? Number((filtered.length/rows.length*100).toFixed(4))
                    : 0,

            policy:{
                action:"EXCLUDE_TIMESTAMP_ANOMALY_ROWS_ONLY",
                ohlcRepair:false,
                timestampRepair:false,
                syntheticCandles:false,
                negativeVolumeTreatment:
                    "UNCHANGED; production VWAP clamps volume < 0 to zero"
            },

            postFilterIntegrity:{
                chronological:filtered.every(
                    (x,i)=>i===0 || x.ts > filtered[i-1].ts
                ),
                duplicateTimestamps:
                    filtered.some(
                        (x,i)=>i>0 && x.ts===filtered[i-1].ts
                    ),
                remainingShortSpacingRows:
                    filtered.reduce((count,x,i)=>{
                        if(i===0) return count;
                        const d=x.ts-filtered[i-1].ts;
                        return count + (d>0 && d<300 ? 1 : 0);
                    },0)
            },

            comparisons:comparison,

            featureStateComparison:{
                raw:{
                    emaState:raw.emaState,
                    vwapDirection:raw.vwapDirection
                },
                filtered:{
                    emaState:filteredSnapshot.emaState,
                    vwapDirection:filteredSnapshot.vwapDirection
                },
                emaStateChanged,
                vwapDirectionChanged
            },

            lastValues:{
                raw,
                filtered:filteredSnapshot
            }
        });
    }

    return res.status(200).json({

        success:true,
        version:VERSION,
        status:"COMPLETED",
        mode:"V25_7_DHAN_S5_TIMESTAMP_ANOMALY_DOWNSTREAM_IMPACT_AUDIT",

        paperOnly:true,
        realOrders:false,
        brokerOrderEnabled:false,
        brokerOrderSent:false,

        purpose:
            "Measure the downstream effect of excluding only S5 timestamp-anomaly rows before deciding the final S5 historical import policy.",

        thisIsNotATradingTest:true,

        policyUnderTest:{
            action:"REMOVE_ONLY_TIMESTAMP_ANOMALY_ROWS",
            preserveOHLC:true,
            preserveAllOtherCandles:true,
            noTimestampRepair:true,
            noSyntheticData:true,
            productionVWAPRule:
                "Math.max(0, n(c.v, 0))"
        },

        aggregateAudit:{
            windows:windows.length,
            rawRows:aggregateRawRows,
            timestampAnomalyRows:aggregateAnomalies,
            retainedRows:
                aggregateRawRows - aggregateAnomalies,
            retainedPct:
                aggregateRawRows
                    ? Number(
                        ((aggregateRawRows-aggregateAnomalies)
                        /aggregateRawRows*100).toFixed(4)
                    )
                    : 0,
            changedFeatureChecks:aggregateChangedFeatures
        },

        windowResults,

        interpretation:{
            learningRecordsGenerated:false,
            healthStatesCalculated:false,
            strategyModified:false,
            thresholdTuning:false,
            validationRun:false,
            oosRun:false,
            importerAuthorization:false,
            candleRepairPerformed:false,
            syntheticCandlesCreated:false,

            conclusion:
                "S5_TIMESTAMP_ANOMALY_DOWNSTREAM_IMPACT_AUDIT_COMPLETED",

            decision:"AWAIT_RESULT",

            important:
                "This probe only measures the effect of excluding timestamp-anomaly observations. It does not authorize historical import or change the V25.7 strategy."
        },

        nextStep:
            "Inspect timestamp anomaly counts, post-filter integrity, and indicator/feature-state differences. Do not modify learning-engine.js or authorize S5 import from this audit alone.",

        guardrails:{
            noCandidateDiscovery:true,
            noLearningRecords:true,
            noHealthClassification:true,
            noValidation:true,
            noOOS:true,
            noStrategyChange:true,
            noThresholdChange:true,
            noImporterChange:true,
            noCandleRepair:true,
            noSyntheticData:true,
            noRealOrders:true
        }
    });
}

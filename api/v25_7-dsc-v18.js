/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v18
 S5 EXACT PRODUCTION-VWAP IMPACT AUDIT
===========================================================

PURPOSE
-------
Correct the V15/V16 VWAP comparison by reproducing the V25.7
production sessionVWAP rule exactly:

    Math.max(0, n(c.v, 0))

The audit compares:

A = RAW Dhan candles
B = SAME candles, but negative volume is replaced by 0

OHLC and timestamps are NEVER removed or changed.

This is NOT a trading test.

NO:
- learning records
- candidate discovery
- strategy changes
- threshold changes
- historical import
- validation / OOS
- candle repair
- synthetic candles
- real orders

The important test is whether RAW and ZERO-VOLUME datasets
produce different production VWAP / feature states.

If they are identical, negative volume has no downstream
effect on the V25.7 price/VWAP feature path and S5 can move
toward data-source clearance without deleting candles.

RUN:
 /api/v25_7-dsc-v18?probe=1
===========================================================
*/

function n(x, fallback = 0) {
    const v = Number(x);
    return Number.isFinite(v) ? v : fallback;
}

function ema(values, period) {
    if (values.length < period) return null;

    const k = 2 / (period + 1);
    let e = values.slice(0, period).reduce((a,b)=>a+b,0) / period;

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

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
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

    let a = tr.slice(0, period).reduce((x,y)=>x+y,0) / period;

    for (let i = period; i < tr.length; i++) {
        a = ((a * (period - 1)) + tr[i]) / period;
    }

    return a;
}

/*
Exact production VWAP policy:
negative volume contributes ZERO.
The candle OHLC remains intact.
*/
function sessionVWAP(candles) {
    let pv = 0;
    let vv = 0;

    for (const c of candles) {
        const price = (c.h + c.l + c.c) / 3;

        // EXACT V25.7 POLICY
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

    const rows = [];

    const len = Math.min(
        ts.length, o.length, h.length, l.length, c.length, v.length
    );

    for (let i = 0; i < len; i++) {
        const row = {
            ts: n(ts[i], NaN),
            o: n(o[i], NaN),
            h: n(h[i], NaN),
            l: n(l[i], NaN),
            c: n(c[i], NaN),
            v: n(v[i], NaN)
        };

        if (
            Number.isFinite(row.ts) &&
            Number.isFinite(row.o) &&
            Number.isFinite(row.h) &&
            Number.isFinite(row.l) &&
            Number.isFinite(row.c) &&
            Number.isFinite(row.v)
        ) {
            rows.push(row);
        }
    }

    rows.sort((a,b)=>a.ts-b.ts);
    return rows;
}

function indicatorSnapshot(candles) {
    const closes = candles.map(x=>x.c);

    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const r = rsi(closes, 14);
    const a = atr(candles, 14);
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

function same(a,b,eps=1e-9) {
    if (a == null || b == null) return a === b;
    return Math.abs(a-b) <= eps;
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
    try { json = JSON.parse(text); }
    catch (_) {}

    return {
        response,
        json,
        text
    };
}

export default async function handler(req,res) {

    const VERSION = "V25.7-DSC-v18";

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

    let totalRows = 0;
    let totalNegative = 0;
    let totalVWAPChanged = 0;
    let totalEMAStateChanged = 0;

    for (const w of windows) {

        const result = await fetchWindow(
            token,
            w.fromDate,
            w.toDate
        );

        const payload = result.json;
        const rows = normalizeRows(payload);

        const negative = rows.filter(x=>x.v < 0);

        const zeroRows = rows.map(x=>({
            ...x,
            v:x.v < 0 ? 0 : x.v
        }));

        const raw = indicatorSnapshot(rows);
        const zero = indicatorSnapshot(zeroRows);

        const comparisons = {
            ema9:{
                raw:raw.ema9,
                zeroVolume:zero.ema9,
                changed:!same(raw.ema9,zero.ema9),
                absDifference:absDiff(raw.ema9,zero.ema9)
            },
            ema21:{
                raw:raw.ema21,
                zeroVolume:zero.ema21,
                changed:!same(raw.ema21,zero.ema21),
                absDifference:absDiff(raw.ema21,zero.ema21)
            },
            rsi14:{
                raw:raw.rsi14,
                zeroVolume:zero.rsi14,
                changed:!same(raw.rsi14,zero.rsi14),
                absDifference:absDiff(raw.rsi14,zero.rsi14)
            },
            atr14:{
                raw:raw.atr14,
                zeroVolume:zero.atr14,
                changed:!same(raw.atr14,zero.atr14),
                absDifference:absDiff(raw.atr14,zero.atr14)
            },
            vwap:{
                raw:raw.vwap,
                zeroVolume:zero.vwap,
                changed:!same(raw.vwap,zero.vwap),
                absDifference:absDiff(raw.vwap,zero.vwap)
            }
        };

        const emaStateChanged = raw.emaState !== zero.emaState;
        const vwapDirectionChanged =
            raw.vwapDirection !== zero.vwapDirection;

        totalRows += rows.length;
        totalNegative += negative.length;

        if (comparisons.vwap.changed) totalVWAPChanged++;
        if (emaStateChanged) totalEMAStateChanged++;

        windowResults.push({
            window:w,

            http:{
                status:result.response.status,
                ok:result.response.ok,
                contentType:
                    result.response.headers.get("content-type")
            },

            rawRows:rows.length,
            negativeVolumeRows:negative.length,

            datasetA:{
                label:"RAW_DHAN_CANDLES",
                rows:rows.length
            },

            datasetB:{
                label:"EXACT_V25_7_ZERO_VOLUME_POLICY",
                rows:zeroRows.length,
                negativeVolumeNeutralized:true,
                ohlcChanged:false,
                timestampsChanged:false
            },

            productionVWAPRule:
                "Math.max(0, n(c.v, 0))",

            comparisons,

            featureStateComparison:{
                raw:{
                    emaState:raw.emaState,
                    vwapDirection:raw.vwapDirection
                },
                zeroVolume:{
                    emaState:zero.emaState,
                    vwapDirection:zero.vwapDirection
                },
                emaStateChanged,
                vwapDirectionChanged
            },

            lastValues:{
                raw,
                zeroVolume:zero
            }
        });
    }

    return res.status(200).json({

        success:true,
        version:VERSION,
        status:"COMPLETED",
        mode:"V25_7_DHAN_S5_EXACT_PRODUCTION_VWAP_IMPACT_AUDIT",

        paperOnly:true,
        realOrders:false,
        brokerOrderEnabled:false,
        brokerOrderSent:false,

        purpose:
            "Measure the downstream effect of S5 negative volume using the exact V25.7 production VWAP rule before any historical importer decision.",

        thisIsNotATradingTest:true,

        productionPolicy:{
            sessionVWAP:
                "Math.max(0, n(c.v, 0))",
            negativeVolumeTreatment:
                "CLAMP_TO_ZERO",
            candleDeletion:false,
            candleRepair:false,
            syntheticCandles:false
        },

        aggregateAudit:{
            windows:windows.length,
            rawRows:totalRows,
            negativeVolumeRows:totalNegative,
            negativeVolumePct:
                totalRows
                    ? Number((totalNegative/totalRows*100).toFixed(4))
                    : 0,
            windowsWithVWAPDifference:totalVWAPChanged,
            windowsWithEMAStateDifference:totalEMAStateChanged
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
                "S5_EXACT_PRODUCTION_VWAP_IMPACT_AUDIT_COMPLETED",

            decision:
                "AWAIT_RESULT",

            important:
                "Dataset B changes only negative volume to zero. OHLC and timestamps remain identical. If production VWAP and feature states are unchanged, negative volume does not require candle deletion or a V25.7 engine change."
        },

        nextStep:
            "Inspect RAW versus EXACT_V25_7_ZERO_VOLUME comparisons. Do not modify learning-engine.js or authorize historical import from this audit alone.",

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

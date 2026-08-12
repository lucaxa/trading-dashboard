/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v14 — S5 Negative-Volume Impact Audit
===========================================================

PURPOSE
-------
Determine whether the 232 negative-volume observations found
in S5 are isolated metadata anomalies or whether they overlap
with OHLC/timestamp problems.

DATA-SOURCE DIAGNOSTIC ONLY.

DOES NOT:
- modify api/learning-engine.js
- generate candidates
- generate learning records
- run validation/OOS
- tune thresholds
- repair/delete candles
- synthesize candles
- place real orders

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

V14 QUESTIONS
-------------
1. Locate every negative-volume candle.
2. Count negative-volume candles by window.
3. Determine whether negative volume overlaps with:
   - invalid OHLC
   - timestamp/grid anomaly
   - short spacing
   - duplicate timestamp
   - non-monotonic timestamp
4. Measure contiguous negative-volume runs.
5. Measure isolated negative-volume rows.
6. Inspect OHLC validity of all negative-volume rows.
7. Inspect timestamp alignment of all negative-volume rows.
8. Compare price movement around representative negative-volume
   runs without changing the data.
9. Quantify the effect of retaining vs excluding negative volume.
10. Do NOT decide the final importer policy.

RUN
---
GET:
 /api/v25_7-dsc-v14?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v14";
    const ENDPOINT = "https://api.dhan.co/v2/charts/intraday";

    const WINDOWS = [
        { id: "A", fromDate: "2021-12-28 00:00:00", toDate: "2022-02-26 00:00:00" },
        { id: "B", fromDate: "2022-02-26 00:00:00", toDate: "2022-04-27 00:00:00" },
        { id: "C", fromDate: "2022-04-27 00:00:00", toDate: "2022-06-26 00:00:00" }
    ];

    const EXPECTED_SECONDS = 300;
    const GRID_ANCHOR_MINUTE_UTC = 225;
    const CONTEXT_ROWS = 3;

    const n = v => {
        const x = Number(v);
        return Number.isFinite(x) ? x : null;
    };

    const ts = v => {
        const x = n(v);
        if (x === null) return null;
        return x > 100000000000 ? Math.floor(x / 1000) : x;
    };

    const iso = v => {
        const x = ts(v);
        return x === null ? null : new Date(x * 1000).toISOString();
    };

    function gridOffset(t) {
        const x = ts(t);
        if (x === null) return null;
        const d = new Date(x * 1000);
        const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
        return ((minute - GRID_ANCHOR_MINUTE_UTC) % 5 + 5) % 5;
    }

    function auditOHLC(o, h, l, c) {
        const issues = [];

        if (![o, h, l, c].every(Number.isFinite)) {
            issues.push("NONFINITE_OHLC");
        }
        if (Number.isFinite(h) && Number.isFinite(l) && h < l) {
            issues.push("HIGH_BELOW_LOW");
        }
        if (Number.isFinite(h) && Number.isFinite(o) && h < o) {
            issues.push("HIGH_BELOW_OPEN");
        }
        if (Number.isFinite(h) && Number.isFinite(c) && h < c) {
            issues.push("HIGH_BELOW_CLOSE");
        }
        if (Number.isFinite(l) && Number.isFinite(o) && l > o) {
            issues.push("LOW_ABOVE_OPEN");
        }
        if (Number.isFinite(l) && Number.isFinite(c) && l > c) {
            issues.push("LOW_ABOVE_CLOSE");
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }

    function buildRows(payload) {

        const a = {
            timestamp: Array.isArray(payload?.timestamp) ? payload.timestamp : [],
            open: Array.isArray(payload?.open) ? payload.open : [],
            high: Array.isArray(payload?.high) ? payload.high : [],
            low: Array.isArray(payload?.low) ? payload.low : [],
            close: Array.isArray(payload?.close) ? payload.close : [],
            volume: Array.isArray(payload?.volume) ? payload.volume : []
        };

        const count = Math.min(
            a.timestamp.length,
            a.open.length,
            a.high.length,
            a.low.length,
            a.close.length,
            a.volume.length
        );

        const rows = [];

        for (let i = 0; i < count; i++) {

            const t = ts(a.timestamp[i]);
            const o = n(a.open[i]);
            const h = n(a.high[i]);
            const l = n(a.low[i]);
            const c = n(a.close[i]);
            const v = n(a.volume[i]);

            const oh = auditOHLC(o,h,l,c);

            rows.push({
                index: i,
                timestamp: t,
                timestampISO: iso(t),
                open: o,
                high: h,
                low: l,
                close: c,
                volume: v,
                negativeVolume: Number.isFinite(v) && v < 0,
                ohlcValid: oh.valid,
                ohlcIssues: oh.issues,
                gridOffsetMinutes: gridOffset(t),
                shortSpacing: false,
                duplicateTimestamp: false,
                nonMonotonic: false,
                gapSeconds: null
            });
        }

        const seen = new Map();

        for (let i = 0; i < rows.length; i++) {

            const r = rows[i];

            if (r.timestamp !== null) {

                if (seen.has(r.timestamp)) {
                    r.duplicateTimestamp = true;
                    rows[seen.get(r.timestamp)].duplicateTimestamp = true;
                } else {
                    seen.set(r.timestamp, i);
                }
            }

            if (i > 0) {

                const p = rows[i - 1].timestamp;

                if (p !== null && r.timestamp !== null) {

                    const gap = r.timestamp - p;
                    r.gapSeconds = gap;

                    if (gap <= 0) {
                        r.nonMonotonic = true;
                        rows[i - 1].nonMonotonic = true;
                    } else if (gap < EXPECTED_SECONDS) {
                        r.shortSpacing = true;
                        rows[i - 1].shortSpacing = true;
                    }
                }
            }
        }

        return rows;
    }

    function timestampIssue(r) {
        return (
            (r.gridOffsetMinutes !== null && r.gridOffsetMinutes !== 0) ||
            r.shortSpacing ||
            r.duplicateTimestamp ||
            r.nonMonotonic
        );
    }

    function context(rows, index) {

        const start = Math.max(0, index - CONTEXT_ROWS);
        const end = Math.min(rows.length - 1, index + CONTEXT_ROWS);

        const selected = rows.slice(start, end + 1);

        const target = rows[index];
        const previous = rows[index - 1] || null;
        const next = rows[index + 1] || null;

        return {
            target,
            previous,
            next,
            rows: selected,
            priceMovement: {
                previousCloseToTargetOpen:
                    previous &&
                    Number.isFinite(previous.close) &&
                    Number.isFinite(target.open)
                        ? target.open - previous.close
                        : null,

                targetOpenToClose:
                    Number.isFinite(target.open) &&
                    Number.isFinite(target.close)
                        ? target.close - target.open
                        : null,

                targetReturnPct:
                    Number.isFinite(target.open) &&
                    target.open !== 0 &&
                    Number.isFinite(target.close)
                        ? Number(((target.close - target.open) / target.open) * 100).toFixed(6)
                        : null,

                targetRange:
                    Number.isFinite(target.high) &&
                    Number.isFinite(target.low)
                        ? target.high - target.low
                        : null,

                targetBody:
                    Number.isFinite(target.open) &&
                    Number.isFinite(target.close)
                        ? Math.abs(target.close - target.open)
                        : null,

                targetHighContainsOC:
                    Number.isFinite(target.high) &&
                    Number.isFinite(target.open) &&
                    Number.isFinite(target.close) &&
                    target.high >= Math.max(target.open,target.close),

                targetLowContainsOC:
                    Number.isFinite(target.low) &&
                    Number.isFinite(target.open) &&
                    Number.isFinite(target.close) &&
                    target.low <= Math.min(target.open,target.close)
            }
        };
    }

    function summarizeNegative(rows) {

        const negative = rows.filter(r => r.negativeVolume);

        const overlaps = {
            invalidOHLC: negative.filter(r => !r.ohlcValid).length,
            timestampIssue: negative.filter(timestampIssue).length,
            gridOffset: negative.filter(r =>
                r.gridOffsetMinutes !== null && r.gridOffsetMinutes !== 0
            ).length,
            shortSpacing: negative.filter(r => r.shortSpacing).length,
            duplicateTimestamp: negative.filter(r => r.duplicateTimestamp).length,
            nonMonotonic: negative.filter(r => r.nonMonotonic).length
        };

        const runs = [];
        let current = [];

        for (let i = 0; i < rows.length; i++) {

            if (rows[i].negativeVolume) {
                current.push(rows[i]);
            } else if (current.length) {
                runs.push(current);
                current = [];
            }
        }

        if (current.length) runs.push(current);

        const runSummary = runs.map(run => ({
            length: run.length,
            startTimestamp: run[0].timestamp,
            startTimestampISO: run[0].timestampISO,
            endTimestamp: run[run.length - 1].timestamp,
            endTimestampISO: run[run.length - 1].timestampISO,
            continuousFiveMinuteRun:
                run.every((r,i) =>
                    i === 0 ||
                    (r.timestamp - run[i-1].timestamp) === EXPECTED_SECONDS
                ),
            allOHLCValid: run.every(r => r.ohlcValid),
            allGridAligned: run.every(r =>
                r.gridOffsetMinutes === 0
            )
        }));

        const isolated = runSummary.filter(r => r.length === 1).length;

        return {
            negativeVolumeRows: negative.length,
            negativeVolumePct: rows.length
                ? Number((negative.length / rows.length * 100).toFixed(4))
                : 0,

            overlaps,

            priceIntegrity:
                negative.every(r => r.ohlcValid),

            timestampIntegrity:
                negative.every(r =>
                    !timestampIssue(r)
                ),

            runAudit: {
                runCount: runSummary.length,
                isolatedRuns: isolated,
                multiRowRuns: runSummary.length - isolated,
                maxRunLength: runSummary.length
                    ? Math.max(...runSummary.map(r => r.length))
                    : 0,
                runSummary: runSummary.slice(0,100)
            }
        };
    }

    async function fetchWindow(token, window) {

        const body = {
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            oi: false,
            fromDate: window.fromDate,
            toDate: window.toDate
        };

        const response = await fetch(ENDPOINT,{
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                "Accept":"application/json",
                "access-token":token
            },
            body:JSON.stringify(body)
        });

        const text = await response.text();

        let payload = null;

        try {
            payload = JSON.parse(text);
        } catch {}

        if (!payload) {
            return {
                window,
                http:{
                    status:response.status,
                    ok:response.ok,
                    contentType:response.headers.get("content-type"),
                    parseStatus:"NOT_JSON"
                },
                rows:[],
                rawResponsePreview:text.replace(/\s+/g," ").slice(0,1200)
            };
        }

        return {
            window,
            http:{
                status:response.status,
                ok:response.ok,
                contentType:response.headers.get("content-type"),
                parseStatus:"JSON"
            },
            rows:buildRows(payload),
            rawResponsePreview:null
        };
    }

    try {

        if(req.method !== "GET"){
            return res.status(405).json({
                success:false,
                version:VERSION,
                status:"METHOD_NOT_ALLOWED",
                paperOnly:true,
                realOrders:false,
                error:"Use GET with ?probe=1."
            });
        }

        const token=(process.env.DHAN_ACCESS_TOKEN || "").trim();

        if(!token){
            return res.status(500).json({
                success:false,
                version:VERSION,
                status:"CONFIG_ERROR",
                paperOnly:true,
                realOrders:false,
                error:"DHAN_ACCESS_TOKEN is not configured."
            });
        }

        if(String(req.query?.probe || "1") !== "1"){
            return res.status(400).json({
                success:false,
                version:VERSION,
                status:"INVALID_PROBE",
                availableProbes:["1"],
                error:"Use probe=1."
            });
        }

        const results=[];

        for(const window of WINDOWS){
            results.push(await fetchWindow(token,window));
        }

        const perWindow = results.map(result => {

            const rows=result.rows;
            const negative=rows.filter(r=>r.negativeVolume);

            const negativeRows=negative.map(r=>({
                index:r.index,
                timestamp:r.timestamp,
                timestampISO:r.timestampISO,
                volume:r.volume,
                open:r.open,
                high:r.high,
                low:r.low,
                close:r.close,
                ohlcValid:r.ohlcValid,
                ohlcIssues:r.ohlcIssues,
                gridOffsetMinutes:r.gridOffsetMinutes,
                shortSpacing:r.shortSpacing,
                duplicateTimestamp:r.duplicateTimestamp,
                nonMonotonic:r.nonMonotonic,
                context:context(rows,r.index)
            }));

            return {
                window:result.window,
                http:result.http,
                rowCount:rows.length,
                negativeVolumeSummary:summarizeNegative(rows),
                negativeVolumeRows,
                rawResponsePreview:result.rawResponsePreview
            };
        });

        const allRows=results.flatMap(r=>r.rows);

        const totalNegative=allRows.filter(r=>r.negativeVolume).length;
        const totalInvalid=allRows.filter(r=>!r.ohlcValid).length;
        const totalTimestampIssue=allRows.filter(timestampIssue).length;

        const overlappingNegative=allRows.filter(
            r => r.negativeVolume &&
            (!r.ohlcValid || timestampIssue(r))
        ).length;

        const cleanNegative=allRows.filter(
            r => r.negativeVolume &&
            r.ohlcValid &&
            !timestampIssue(r)
        ).length;

        const strictImpact = totalNegative + totalInvalid + totalTimestampIssue -
            allRows.filter(r =>
                r.negativeVolume &&
                !r.ohlcValid
            ).length -
            allRows.filter(r =>
                r.negativeVolume &&
                timestampIssue(r)
            ).length;

        return res.status(200).json({

            success:true,
            version:VERSION,
            status:"COMPLETED",
            mode:"V25_7_DHAN_S5_NEGATIVE_VOLUME_IMPACT_AUDIT",

            paperOnly:true,
            realOrders:false,
            brokerOrderEnabled:false,
            brokerOrderSent:false,

            purpose:
                "Determine whether S5 negative-volume observations are isolated volume metadata anomalies or overlap with price/timestamp defects.",

            thisIsNotATradingTest:true,

            probe:{
                id:"1",
                label:"S5_NEGATIVE_VOLUME_IMPACT",
                contextRows:CONTEXT_ROWS,
                windows:WINDOWS
            },

            request:{
                endpoint:ENDPOINT,
                method:"POST",
                securityId:"13",
                exchangeSegment:"IDX_I",
                instrument:"INDEX",
                interval:"5",
                oi:false
            },

            combinedAudit:{
                totalRows:allRows.length,
                negativeVolumeRows:totalNegative,
                negativeVolumePct:allRows.length
                    ? Number((totalNegative/allRows.length*100).toFixed(4))
                    : 0,

                invalidOHLCRows:totalInvalid,
                timestampAnomalyRows:totalTimestampIssue,

                negativeVolumeWithOtherDefect:overlappingNegative,
                negativeVolumeWithCleanOHLCAndTimestamp:cleanNegative,

                negativeVolumeCleanPct:totalNegative
                    ? Number((cleanNegative/totalNegative*100).toFixed(4))
                    : 0,

                negativeVolumeOverlapPct:totalNegative
                    ? Number((overlappingNegative/totalNegative*100).toFixed(4))
                    : 0,

                strictPolicyRemovalImpactPct:allRows.length
                    ? Number((strictImpact/allRows.length*100).toFixed(4))
                    : 0
            },

            windowResults:perWindow,

            interpretation:{
                learningRecordsGenerated:false,
                healthStatesCalculated:false,
                strategyModified:false,
                thresholdTuning:false,
                validationRun:false,
                oosRun:false,
                realOrders:false,
                candleRepairPerformed:false,
                syntheticCandlesCreated:false,
                importerAuthorization:false,

                conclusion:"S5_NEGATIVE_VOLUME_IMPACT_AUDIT_COMPLETED",

                policyDecision:"NOT_YET_FINAL",

                important:
                    "Negative volume is evaluated independently from OHLC/timestamp integrity. This diagnostic does not authorize retaining or removing negative-volume candles."
            },

            nextStep:
                "Inspect negativeVolumeSummary, run structure, overlap counts, and representative contexts. Then decide whether volume should be treated as non-authoritative for S5 or whether negative-volume rows must be excluded.",

            guardrails:{
                noCandidateDiscovery:true,
                noLearningRecords:true,
                noHealthClassification:true,
                noValidation:true,
                noOOS:true,
                noStrategyChange:true,
                noThresholdChange:true,
                noCandleRepair:true,
                noCandleDeletionFromSource:true,
                noSyntheticData:true,
                noRealOrders:true
            }
        });

    } catch(error){

        return res.status(500).json({
            success:false,
            version:VERSION,
            status:"ERROR",
            paperOnly:true,
            realOrders:false,
            brokerOrderEnabled:false,
            brokerOrderSent:false,
            error:error?.message || String(error)
        });
    }
}

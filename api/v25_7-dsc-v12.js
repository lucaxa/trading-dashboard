/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v12 — S5 Invalid-OHLC + Timestamp Forensics
===========================================================

PURPOSE
-------
Forensically inspect the exact S5 price/timestamp anomalies
identified by V25.7-DSC-v11.

This is a DATA-SOURCE DIAGNOSTIC ONLY.

It does NOT:
- modify api/learning-engine.js
- generate candidates
- generate learning records
- run validation/OOS
- tune thresholds
- repair candles
- delete candles
- interpolate/synthesize candles
- place real orders

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

V12 GOALS
---------
1. Re-fetch the three S5 windows from Dhan.
2. Identify the exact invalid-OHLC candles.
3. Inspect a wider price context around each invalid candle.
4. Identify every timestamp/grid anomaly.
5. Inspect the exact preceding/following candles around each
   timestamp anomaly.
6. Calculate whether the anomaly changes local price continuity.
7. Determine whether anomalies overlap with one another.
8. Separately report volume anomalies without treating them
   as price corruption.
9. Produce a classification only; do not make importer changes.

PRICE INTEGRITY RULES
---------------------
A candle is OHLC-invalid if:
  high < low
  high < open
  high < close
  low  > open
  low  > close

TIMESTAMP RULES
---------------
Expected 5-minute grid is anchored at 09:15 IST,
represented as 03:45 UTC.

A timestamp is:
- GRID_ALIGNED when its UTC minute is on that 5-minute grid
- GRID_OFFSET otherwise

A short-spacing anomaly exists when consecutive timestamps
are less than 300 seconds apart.

LOCAL PRICE CONTINUITY
----------------------
For each target anomaly, calculate:
- previous close -> target open gap
- target close -> next open gap
- target high/low containment
- target return
- neighboring returns
- range and body
- whether the anomaly is isolated or overlapping

IMPORTANT
---------
No row is repaired, deleted, replaced, or normalized.

RUN
---
GET:
  /api/v25_7-dsc-v12?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v12";
    const ENDPOINT = "https://api.dhan.co/v2/charts/intraday";

    const WINDOWS = [
        { id: "A", fromDate: "2021-12-28 00:00:00", toDate: "2022-02-26 00:00:00" },
        { id: "B", fromDate: "2022-02-26 00:00:00", toDate: "2022-04-27 00:00:00" },
        { id: "C", fromDate: "2022-04-27 00:00:00", toDate: "2022-06-26 00:00:00" }
    ];

    const EXPECTED = 300;
    const CONTEXT = 7;
    const GRID_ANCHOR_MINUTE_UTC = 225; // 03:45 UTC = 09:15 IST

    const finite = v => Number.isFinite(Number(v)) ? Number(v) : null;

    function ts(v) {
        const n = finite(v);
        if (n === null) return null;
        return n > 100000000000 ? Math.floor(n / 1000) : n;
    }

    function iso(v) {
        const t = ts(v);
        return t === null ? null : new Date(t * 1000).toISOString();
    }

    function gridOffset(v) {
        const t = ts(v);
        if (t === null) return null;
        const d = new Date(t * 1000);
        const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
        return ((minute - GRID_ANCHOR_MINUTE_UTC) % 5 + 5) % 5;
    }

    function ohlcAudit(o, h, l, c) {
        const issues = [];
        if (![o,h,l,c].every(Number.isFinite)) issues.push("NONFINITE_OHLC");
        if (Number.isFinite(h) && Number.isFinite(l) && h < l) issues.push("HIGH_BELOW_LOW");
        if (Number.isFinite(h) && Number.isFinite(o) && h < o) issues.push("HIGH_BELOW_OPEN");
        if (Number.isFinite(h) && Number.isFinite(c) && h < c) issues.push("HIGH_BELOW_CLOSE");
        if (Number.isFinite(l) && Number.isFinite(o) && l > o) issues.push("LOW_ABOVE_OPEN");
        if (Number.isFinite(l) && Number.isFinite(c) && l > c) issues.push("LOW_ABOVE_CLOSE");
        return {
            valid: issues.length === 0,
            issues,
            range: Number.isFinite(h) && Number.isFinite(l) ? h - l : null,
            body: Number.isFinite(o) && Number.isFinite(c) ? Math.abs(c-o) : null
        };
    }

    function row(a, i) {
        const t = ts(a.timestamp[i]);
        const o = finite(a.open[i]);
        const h = finite(a.high[i]);
        const l = finite(a.low[i]);
        const c = finite(a.close[i]);
        const v = finite(a.volume[i]);
        const oi = ohlcAudit(o,h,l,c);

        return {
            index: i,
            timestamp: t,
            timestampISO: iso(t),
            open:o, high:h, low:l, close:c, volume:v,
            gridOffsetMinutes: gridOffset(t),
            ohlcValid: oi.valid,
            ohlcIssues: oi.issues,
            range: oi.range,
            body: oi.body
        };
    }

    function responseAudit(payload) {
        const a = {
            timestamp: Array.isArray(payload?.timestamp) ? payload.timestamp : [],
            open: Array.isArray(payload?.open) ? payload.open : [],
            high: Array.isArray(payload?.high) ? payload.high : [],
            low: Array.isArray(payload?.low) ? payload.low : [],
            close: Array.isArray(payload?.close) ? payload.close : [],
            volume: Array.isArray(payload?.volume) ? payload.volume : []
        };

        const n = Math.min(
            a.timestamp.length, a.open.length, a.high.length,
            a.low.length, a.close.length, a.volume.length
        );

        const invalidOHLC = [];
        const timestampAnomalies = [];
        const negativeVolume = [];
        const duplicateTimestamps = [];
        const nonMonotonic = [];

        const timestampIndex = new Map();

        for (let i=0;i<n;i++) {
            const r = row(a,i);
            if (!r.ohlcValid) invalidOHLC.push(r);

            if (r.volume !== null && r.volume < 0) {
                negativeVolume.push({
                    index:i, timestamp:r.timestamp, timestampISO:r.timestampISO,
                    volume:r.volume
                });
            }

            if (r.timestamp !== null) {
                if (timestampIndex.has(r.timestamp)) {
                    duplicateTimestamps.push({
                        index:i,
                        previousIndex:timestampIndex.get(r.timestamp),
                        timestamp:r.timestamp,
                        timestampISO:r.timestampISO
                    });
                } else {
                    timestampIndex.set(r.timestamp,i);
                }

                if (r.gridOffsetMinutes !== 0) {
                    timestampAnomalies.push({
                        type:"GRID_OFFSET",
                        index:i,
                        timestamp:r.timestamp,
                        timestampISO:r.timestampISO,
                        gridOffsetMinutes:r.gridOffsetMinutes
                    });
                }

                if (i > 0) {
                    const p = ts(a.timestamp[i-1]);
                    if (p !== null) {
                        const gap = r.timestamp - p;

                        if (gap <= 0) {
                            nonMonotonic.push({
                                index:i,
                                previousIndex:i-1,
                                previousTimestamp:p,
                                previousTimestampISO:iso(p),
                                timestamp:r.timestamp,
                                timestampISO:r.timestampISO,
                                gapSeconds:gap
                            });
                        } else if (gap < EXPECTED) {
                            timestampAnomalies.push({
                                type:"SHORT_SPACING",
                                index:i,
                                previousIndex:i-1,
                                previousTimestamp:p,
                                previousTimestampISO:iso(p),
                                timestamp:r.timestamp,
                                timestampISO:r.timestampISO,
                                gapSeconds:gap,
                                gapMinutes:gap/60
                            });
                        }
                    }
                }
            }
        }

        function contextFor(index) {
            const start=Math.max(0,index-CONTEXT);
            const end=Math.min(n-1,index+CONTEXT);
            const rows=[];
            for(let j=start;j<=end;j++) rows.push(row(a,j));

            const target=row(a,index);
            const prev=index>0?row(a,index-1):null;
            const next=index<n-1?row(a,index+1):null;

            const previousCloseToOpen =
                prev && target && Number.isFinite(prev.close) && Number.isFinite(target.open)
                ? target.open-prev.close : null;

            const closeToNextOpen =
                next && target && Number.isFinite(target.close) && Number.isFinite(next.open)
                ? next.open-target.close : null;

            const targetReturn =
                target && Number.isFinite(target.open) && target.open !== 0 && Number.isFinite(target.close)
                ? (target.close-target.open)/target.open : null;

            const prevReturn =
                prev && Number.isFinite(prev.open) && prev.open !== 0 && Number.isFinite(prev.close)
                ? (prev.close-prev.open)/prev.open : null;

            const nextReturn =
                next && Number.isFinite(next.open) && next.open !== 0 && Number.isFinite(next.close)
                ? (next.close-next.open)/next.open : null;

            const overlapping = rows.filter(x =>
                x.index !== index &&
                (
                    !x.ohlcValid ||
                    (x.gridOffsetMinutes !== null && x.gridOffsetMinutes !== 0)
                )
            ).map(x=>x.index);

            let classification="ISOLATED";
            if(overlapping.length>=2) classification="MULTI_ANOMALY_CLUSTER";
            else if(overlapping.length===1) classification="CLUSTERED";

            return {
                target,
                previous:prev,
                next,
                contextRows:rows,
                priceContinuity:{
                    previousCloseToTargetOpen:previousCloseToOpen,
                    targetCloseToNextOpen:closeToNextOpen,
                    targetReturn,
                    previousReturn:prevReturn,
                    nextReturn,
                    targetRange:target.range,
                    targetBody:target.body,
                    highContainsOpenClose:
                        Number.isFinite(target.high) &&
                        Number.isFinite(target.open) &&
                        Number.isFinite(target.close) &&
                        target.high >= Math.max(target.open,target.close),
                    lowContainsOpenClose:
                        Number.isFinite(target.low) &&
                        Number.isFinite(target.open) &&
                        Number.isFinite(target.close) &&
                        target.low <= Math.min(target.open,target.close)
                },
                nearbyPriceOrTimestampAnomalies:overlapping,
                localClassification:classification
            };
        }

        const forensicTargets = new Map();

        function addTarget(i, reason) {
            if(i<0 || i>=n) return;
            if(!forensicTargets.has(i)) forensicTargets.set(i,new Set());
            forensicTargets.get(i).add(reason);
        }

        invalidOHLC.forEach(x=>addTarget(x.index,"INVALID_OHLC"));
        timestampAnomalies.forEach(x=>addTarget(x.index,x.type));
        nonMonotonic.forEach(x=>addTarget(x.index,"NON_MONOTONIC"));
        duplicateTimestamps.forEach(x=>addTarget(x.index,"DUPLICATE_TIMESTAMP"));

        const forensic = [...forensicTargets.entries()]
            .sort((a,b)=>a[0]-b[0])
            .map(([index,reasons])=>({
                index,
                reasons:[...reasons],
                ...contextFor(index)
            }));

        return {
            arrayLengths:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v.length])),
            rowCount:n,
            firstTimestamp:n?ts(a.timestamp[0]):null,
            firstTimestampISO:n?iso(a.timestamp[0]):null,
            lastTimestamp:n?ts(a.timestamp[n-1]):null,
            lastTimestampISO:n?iso(a.timestamp[n-1]):null,
            counts:{
                invalidOHLC:invalidOHLC.length,
                gridOffset:timestampAnomalies.filter(x=>x.type==="GRID_OFFSET").length,
                shortSpacing:timestampAnomalies.filter(x=>x.type==="SHORT_SPACING").length,
                duplicateTimestamp:duplicateTimestamps.length,
                nonMonotonicTimestamp:nonMonotonic.length,
                negativeVolume:negativeVolume.length
            },
            invalidOHLC,
            timestampAnomalies,
            duplicateTimestamps,
            nonMonotonic,
            negativeVolume,
            forensicTargets:forensic
        };
    }

    async function fetchWindow(token, window) {
        const body={
            securityId:"13",
            exchangeSegment:"IDX_I",
            instrument:"INDEX",
            interval:"5",
            oi:false,
            fromDate:window.fromDate,
            toDate:window.toDate
        };

        const response=await fetch(ENDPOINT,{
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                "Accept":"application/json",
                "access-token":token
            },
            body:JSON.stringify(body)
        });

        const text=await response.text();
        let payload=null;
        let parseStatus="NOT_JSON";

        try {
            payload=JSON.parse(text);
            parseStatus="JSON";
        } catch {}

        return {
            window,
            http:{
                status:response.status,
                ok:response.ok,
                contentType:response.headers.get("content-type"),
                parseStatus
            },
            audit:payload?responseAudit(payload):null,
            rawResponsePreview:payload?null:text.replace(/\s+/g," ").slice(0,1200)
        };
    }

    try {
        if(req.method!=="GET"){
            return res.status(405).json({
                success:false,version:VERSION,status:"METHOD_NOT_ALLOWED",
                paperOnly:true,realOrders:false,
                error:"Use GET with ?probe=1."
            });
        }

        const token=(process.env.DHAN_ACCESS_TOKEN||"").trim();

        if(!token){
            return res.status(500).json({
                success:false,version:VERSION,status:"CONFIG_ERROR",
                paperOnly:true,realOrders:false,
                error:"DHAN_ACCESS_TOKEN is not configured."
            });
        }

        if(String(req.query?.probe||"1")!=="1"){
            return res.status(400).json({
                success:false,version:VERSION,status:"INVALID_PROBE",
                availableProbes:["1"],error:"Use probe=1."
            });
        }

        const results=[];
        for(const w of WINDOWS) results.push(await fetchWindow(token,w));

        const totals={
            invalidOHLC:0,
            gridOffset:0,
            shortSpacing:0,
            duplicateTimestamp:0,
            nonMonotonicTimestamp:0,
            negativeVolume:0
        };

        for(const r of results){
            for(const k of Object.keys(totals)){
                totals[k]+=r.audit?.counts?.[k]||0;
            }
        }

        const forensic=results.flatMap(r=>
            (r.audit?.forensicTargets||[]).map(x=>({
                windowId:r.window.id,
                ...x
            }))
        );

        const invalidForensic=forensic.filter(x=>x.reasons.includes("INVALID_OHLC"));
        const timestampForensic=forensic.filter(x=>
            x.reasons.some(r=>["GRID_OFFSET","SHORT_SPACING","NON_MONOTONIC","DUPLICATE_TIMESTAMP"].includes(r))
        );

        let conclusion="S5_FORENSICS_COMPLETED";

        if(totals.invalidOHLC>0){
            conclusion="S5_INVALID_OHLC_FORENSICS_REQUIRES_REVIEW";
        } else if(totals.shortSpacing>0 || totals.gridOffset>0){
            conclusion="S5_TIMESTAMP_FORENSICS_REQUIRES_REVIEW";
        }

        return res.status(200).json({
            success:true,
            version:VERSION,
            status:"COMPLETED",
            mode:"V25_7_DHAN_S5_INVALID_OHLC_TIMESTAMP_FORENSICS",
            paperOnly:true,
            realOrders:false,
            brokerOrderEnabled:false,
            brokerOrderSent:false,
            purpose:"Forensically inspect S5 price and timestamp anomalies before any importer policy is defined.",
            thisIsNotATradingTest:true,
            probe:{
                id:"1",
                label:"S5_INVALID_OHLC_TIMESTAMP_FORENSICS",
                contextRadiusRows:CONTEXT,
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
            windowResults:results,
            combinedAudit:{
                windowsRequested:results.length,
                windowsWithData:results.filter(r=>(r.audit?.rowCount||0)>0).length,
                totalRows:results.reduce((s,r)=>s+(r.audit?.rowCount||0),0),
                totals,
                invalidOHLCForensicCount:invalidForensic.length,
                timestampForensicCount:timestampForensic.length,
                forensicTargetsInspected:forensic.length,
                invalidOHLCTargets:invalidForensic.map(x=>({
                    windowId:x.windowId,
                    index:x.index,
                    reasons:x.reasons,
                    localClassification:x.localClassification,
                    target:x.target,
                    previous:x.previous,
                    next:x.next,
                    priceContinuity:x.priceContinuity,
                    nearbyPriceOrTimestampAnomalies:x.nearbyPriceOrTimestampAnomalies
                })),
                timestampTargets:timestampForensic.map(x=>({
                    windowId:x.windowId,
                    index:x.index,
                    reasons:x.reasons,
                    localClassification:x.localClassification,
                    target:x.target,
                    previous:x.previous,
                    next:x.next,
                    priceContinuity:x.priceContinuity,
                    nearbyPriceOrTimestampAnomalies:x.nearbyPriceOrTimestampAnomalies
                }))
            },
            interpretation:{
                learningRecordsGenerated:false,
                healthStatesCalculated:false,
                strategyModified:false,
                thresholdTuning:false,
                validationRun:false,
                oosRun:false,
                realOrders:false,
                candleRepairPerformed:false,
                candlesDeleted:false,
                syntheticCandlesCreated:false,
                importerAuthorized:false,
                conclusion,
                importerDecision:"DO_NOT_IMPORT_YET"
            },
            nextStep:"Inspect invalidOHLCTargets and timestampTargets. Decide whether anomalies are isolated or sequence-material before defining an importer policy. Do not modify learning-engine.js.",
            guardrails:{
                noCandidateDiscovery:true,
                noLearningRecords:true,
                noHealthClassification:true,
                noValidation:true,
                noOOS:true,
                noStrategyChange:true,
                noThresholdChange:true,
                noCandleRepair:true,
                noCandleDeletion:true,
                noSyntheticData:true,
                noRealOrders:true
            }
        });

    } catch(error) {
        return res.status(500).json({
            success:false,
            version:VERSION,
            status:"ERROR",
            paperOnly:true,
            realOrders:false,
            brokerOrderEnabled:false,
            brokerOrderSent:false,
            error:error?.message||String(error)
        });
    }
}

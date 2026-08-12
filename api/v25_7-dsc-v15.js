/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v15 — S5 Negative-Volume Downstream Impact Audit
===========================================================

PURPOSE
-------
Measure whether the 232 negative-volume S5 observations materially
change downstream price indicators when they are excluded.

This is a CONTROLLED DIAGNOSTIC ONLY.

COMPARISON
----------
A = raw Dhan candles, including negative-volume rows
B = same candles with ONLY negative-volume rows excluded

Indicators compared:
- EMA 9
- EMA 21
- RSI 14
- VWAP
- ATR 14

The source candles are NOT repaired or overwritten.

DOES NOT:
- modify learning-engine.js
- generate learning records
- discover candidates
- run validation/OOS
- tune thresholds
- change strategy
- place orders
- synthesize candles

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

RUN:
 /api/v25_7-dsc-v15?probe=1

ENV:
 DHAN_ACCESS_TOKEN
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v15";
    const ENDPOINT = "https://api.dhan.co/v2/charts/intraday";

    const WINDOWS = [
        { id:"A", fromDate:"2021-12-28 00:00:00", toDate:"2022-02-26 00:00:00" },
        { id:"B", fromDate:"2022-02-26 00:00:00", toDate:"2022-04-27 00:00:00" },
        { id:"C", fromDate:"2022-04-27 00:00:00", toDate:"2022-06-26 00:00:00" }
    ];

    const n = v => {
        const x = Number(v);
        return Number.isFinite(x) ? x : null;
    };

    const ts = v => {
        const x = n(v);
        if (x === null) return null;
        return x > 100000000000 ? Math.floor(x / 1000) : x;
    };

    function rowsFromPayload(payload) {
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

        return Array.from({length:count}, (_,i) => ({
            timestamp: ts(a.timestamp[i]),
            open:n(a.open[i]),
            high:n(a.high[i]),
            low:n(a.low[i]),
            close:n(a.close[i]),
            volume:n(a.volume[i])
        }));
    }

    function emaSeries(values, period) {
        const out = Array(values.length).fill(null);
        if(values.length < period) return out;

        let sum = 0;
        for(let i=0;i<period;i++) {
            if(!Number.isFinite(values[i])) return out;
            sum += values[i];
        }

        let e = sum / period;
        out[period-1] = e;

        const k = 2/(period+1);

        for(let i=period;i<values.length;i++) {
            if(!Number.isFinite(values[i])) {
                out[i] = null;
                continue;
            }
            e = values[i] * k + e * (1-k);
            out[i] = e;
        }

        return out;
    }

    function rsiSeries(values, period) {
        const out = Array(values.length).fill(null);
        if(values.length <= period) return out;

        let gain = 0;
        let loss = 0;

        for(let i=1;i<=period;i++) {
            const d = values[i] - values[i-1];
            gain += Math.max(d,0);
            loss += Math.max(-d,0);
        }

        gain /= period;
        loss /= period;

        out[period] = loss === 0 ? 100 : 100 - (100/(1 + gain/loss));

        for(let i=period+1;i<values.length;i++) {
            const d = values[i] - values[i-1];
            const g = Math.max(d,0);
            const l = Math.max(-d,0);

            gain = ((gain*(period-1))+g)/period;
            loss = ((loss*(period-1))+l)/period;

            out[i] = loss === 0 ? 100 : 100 - (100/(1 + gain/loss));
        }

        return out;
    }

    function atrSeries(rows, period) {
        const out = Array(rows.length).fill(null);
        if(rows.length <= period) return out;

        const tr = Array(rows.length).fill(null);

        for(let i=0;i<rows.length;i++) {
            if(i===0) {
                if(Number.isFinite(rows[i].high) && Number.isFinite(rows[i].low)) {
                    tr[i] = rows[i].high - rows[i].low;
                }
            } else {
                const r = rows[i];
                const p = rows[i-1];

                if(
                    Number.isFinite(r.high) &&
                    Number.isFinite(r.low) &&
                    Number.isFinite(p.close)
                ) {
                    tr[i] = Math.max(
                        r.high-r.low,
                        Math.abs(r.high-p.close),
                        Math.abs(r.low-p.close)
                    );
                }
            }
        }

        let sum=0;
        let count=0;

        for(let i=0;i<tr.length;i++) {
            if(Number.isFinite(tr[i])) {
                sum += tr[i];
                count++;
            }

            if(i>=period && Number.isFinite(tr[i-period])) {
                sum -= tr[i-period];
                count--;
            }

            if(i>=period-1 && count===period) {
                out[i] = sum/period;
            }
        }

        return out;
    }

    function vwapSeries(rows) {
        const out = Array(rows.length).fill(null);

        let pv = 0;
        let vv = 0;
        let currentDay = null;

        for(let i=0;i<rows.length;i++) {
            const r=rows[i];

            if(!Number.isFinite(r.timestamp) ||
               !Number.isFinite(r.high) ||
               !Number.isFinite(r.low) ||
               !Number.isFinite(r.close)) {
                continue;
            }

            const d = new Date(r.timestamp*1000);
            const day =
                d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");

            if(day !== currentDay) {
                currentDay=day;
                pv=0;
                vv=0;
            }

            const typical=(r.high+r.low+r.close)/3;
            const volume=Number.isFinite(r.volume) ? r.volume : 0;

            /*
             * This audit deliberately allows the raw negative volume to
             * flow through VWAP in dataset A. Dataset B removes those
             * rows entirely. This exposes whether the anomaly materially
             * changes the volume-weighted calculation.
             */
            pv += typical*volume;
            vv += volume;

            out[i] = vv !== 0 ? pv/vv : null;
        }

        return out;
    }

    function calculate(rows) {
        const closes=rows.map(r=>r.close);

        return {
            ema9:emaSeries(closes,9),
            ema21:emaSeries(closes,21),
            rsi14:rsiSeries(closes,14),
            atr14:atrSeries(rows,14),
            vwap:vwapSeries(rows)
        };
    }

    function finite(x) {
        return Number.isFinite(x);
    }

    function compareSeries(a,b, tolerance=1e-10) {
        let compared=0;
        let changed=0;
        let maxAbs=0;
        let sumAbs=0;

        for(let i=0;i<Math.min(a.length,b.length);i++) {
            if(finite(a[i]) && finite(b[i])) {
                const d=Math.abs(a[i]-b[i]);
                compared++;
                sumAbs+=d;
                if(d>tolerance) changed++;
                if(d>maxAbs) maxAbs=d;
            }
        }

        return {
            compared,
            changed,
            changedPct:compared ? Number((changed/compared*100).toFixed(4)) : 0,
            meanAbsDifference:compared ? Number((sumAbs/compared).toFixed(8)) : null,
            maxAbsDifference:compared ? Number(maxAbs.toFixed(8)) : null
        };
    }

    function alignByTimestamp(rawRows, filteredRows) {
        const map=new Map(filteredRows.map(r=>[r.timestamp,r]));
        const aligned=[];

        for(const r of rawRows) {
            const f=map.get(r.timestamp);
            if(f) aligned.push({raw:r, filtered:f});
        }

        return aligned;
    }

    function signalComparison(rawRows, filteredRows, rawInd, filteredInd) {

        /*
         * This is intentionally a neutral diagnostic state comparison,
         * NOT candidate discovery.
         */
        const rawByTs=new Map(rawRows.map((r,i)=>[r.timestamp,i]));
        const filtByTs=new Map(filteredRows.map((r,i)=>[r.timestamp,i]));

        let comparable=0;
        let stateChanged=0;

        for(const r of rawRows) {
            const fi=filtByTs.get(r.timestamp);
            const ri=rawByTs.get(r.timestamp);

            if(fi===undefined) continue;

            const re9=rawInd.ema9[ri];
            const re21=rawInd.ema21[ri];
            const fe9=filteredInd.ema9[fi];
            const fe21=filteredInd.ema21[fi];

            if(!finite(re9)||!finite(re21)||!finite(fe9)||!finite(fe21)) continue;

            const rawState=re9>re21 ? 1 : re9<re21 ? -1 : 0;
            const filtState=fe9>fe21 ? 1 : fe9<fe21 ? -1 : 0;

            comparable++;
            if(rawState!==filtState) stateChanged++;
        }

        return {
            comparable,
            ema9vs21StateChanges:stateChanged,
            stateChangePct:comparable ? Number((stateChanged/comparable*100).toFixed(4)) : 0
        };
    }

    async function fetchWindow(token,window) {

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
        try { payload=JSON.parse(text); } catch {}

        if(!payload) {
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
            rows:rowsFromPayload(payload),
            rawResponsePreview:null
        };
    }

    try {

        if(req.method!=="GET") {
            return res.status(405).json({
                success:false,
                version:VERSION,
                status:"METHOD_NOT_ALLOWED",
                paperOnly:true,
                realOrders:false,
                error:"Use GET with ?probe=1."
            });
        }

        const token=(process.env.DHAN_ACCESS_TOKEN||"").trim();

        if(!token) {
            return res.status(500).json({
                success:false,
                version:VERSION,
                status:"CONFIG_ERROR",
                paperOnly:true,
                realOrders:false,
                error:"DHAN_ACCESS_TOKEN is not configured."
            });
        }

        if(String(req.query?.probe||"1")!=="1") {
            return res.status(400).json({
                success:false,
                version:VERSION,
                status:"INVALID_PROBE",
                availableProbes:["1"],
                error:"Use probe=1."
            });
        }

        const fetched=[];

        for(const w of WINDOWS) {
            fetched.push(await fetchWindow(token,w));
        }

        const windowResults=[];

        for(const result of fetched) {

            const rawRows=result.rows;
            const filteredRows=rawRows.filter(r=>!(Number.isFinite(r.volume)&&r.volume<0));

            const rawInd=calculate(rawRows);
            const filteredInd=calculate(filteredRows);

            const common=alignByTimestamp(rawRows,filteredRows);

            const compare = {
                ema9:compareSeries(rawInd.ema9,filteredInd.ema9),
                ema21:compareSeries(rawInd.ema21,filteredInd.ema21),
                rsi14:compareSeries(rawInd.rsi14,filteredInd.rsi14),
                atr14:compareSeries(rawInd.atr14,filteredInd.atr14),
                vwap:compareSeries(rawInd.vwap,filteredInd.vwap)
            };

            const signal=signalComparison(
                rawRows,
                filteredRows,
                rawInd,
                filteredInd
            );

            const negativeRows=rawRows.filter(
                r=>Number.isFinite(r.volume)&&r.volume<0
            );

            windowResults.push({
                window:result.window,
                http:result.http,
                rawRows:rawRows.length,
                negativeVolumeRows:negativeRows.length,
                filteredRows:filteredRows.length,
                retainedPct:rawRows.length
                    ? Number((filteredRows.length/rawRows.length*100).toFixed(4))
                    : 0,
                commonTimestampRows:common.length,
                indicatorComparison:compare,
                emaStateComparison:signal,
                rawIndicatorLastValues:{
                    ema9:rawInd.ema9.at(-1),
                    ema21:rawInd.ema21.at(-1),
                    rsi14:rawInd.rsi14.at(-1),
                    atr14:rawInd.atr14.at(-1),
                    vwap:rawInd.vwap.at(-1)
                },
                filteredIndicatorLastValues:{
                    ema9:filteredInd.ema9.at(-1),
                    ema21:filteredInd.ema21.at(-1),
                    rsi14:filteredInd.rsi14.at(-1),
                    atr14:filteredInd.atr14.at(-1),
                    vwap:filteredInd.vwap.at(-1)
                },
                rawResponsePreview:result.rawResponsePreview
            });
        }

        const totalRaw=windowResults.reduce((s,x)=>s+x.rawRows,0);
        const totalNegative=windowResults.reduce((s,x)=>s+x.negativeVolumeRows,0);
        const totalFiltered=windowResults.reduce((s,x)=>s+x.filteredRows,0);

        const aggregate={};

        for(const key of ["ema9","ema21","rsi14","atr14","vwap"]) {
            const comps=windowResults.map(w=>w.indicatorComparison[key]);

            const compared=comps.reduce((s,x)=>s+x.compared,0);
            const changed=comps.reduce((s,x)=>s+x.changed,0);
            const sumAbs=comps.reduce(
                (s,x)=>s+(x.meanAbsDifference!==null ? x.meanAbsDifference*x.compared : 0),
                0
            );
            const maxAbs=Math.max(
                ...comps.map(x=>x.maxAbsDifference||0)
            );

            aggregate[key]={
                compared,
                changed,
                changedPct:compared ? Number((changed/compared*100).toFixed(4)) : 0,
                meanAbsDifference:compared ? Number((sumAbs/compared).toFixed(8)) : null,
                maxAbsDifference:Number(maxAbs.toFixed(8))
            };
        }

        const emaCompared=windowResults.reduce(
            (s,x)=>s+x.emaStateComparison.comparable,0
        );
        const emaChanged=windowResults.reduce(
            (s,x)=>s+x.emaStateComparison.ema9vs21StateChanges,0
        );

        return res.status(200).json({

            success:true,
            version:VERSION,
            status:"COMPLETED",
            mode:"V25_7_DHAN_S5_NEGATIVE_VOLUME_DOWNSTREAM_IMPACT_AUDIT",

            paperOnly:true,
            realOrders:false,
            brokerOrderEnabled:false,
            brokerOrderSent:false,

            purpose:
                "Compare downstream price indicators using raw S5 candles versus the same candles with only negative-volume observations excluded.",

            thisIsNotATradingTest:true,

            probe:{
                id:"1",
                label:"S5_NEGATIVE_VOLUME_DOWNSTREAM_IMPACT",
                comparison:{
                    datasetA:"RAW_DHAN_CANDLES",
                    datasetB:"NEGATIVE_VOLUME_ROWS_EXCLUDED"
                },
                indicators:["EMA9","EMA21","RSI14","ATR14","VWAP"]
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

            aggregateAudit:{
                rawRows:totalRaw,
                negativeVolumeRows:totalNegative,
                negativeVolumePct:totalRaw
                    ? Number((totalNegative/totalRaw*100).toFixed(4))
                    : 0,
                filteredRows:totalFiltered,
                retainedPct:totalRaw
                    ? Number((totalFiltered/totalRaw*100).toFixed(4))
                    : 0,
                indicatorComparison:aggregate,
                ema9vs21StateComparison:{
                    comparable:emaCompared,
                    stateChanges:emaChanged,
                    stateChangePct:emaCompared
                        ? Number((emaChanged/emaCompared*100).toFixed(4))
                        : 0
                }
            },

            windowResults,

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

                conclusion:
                    "S5_NEGATIVE_VOLUME_DOWNSTREAM_IMPACT_AUDIT_COMPLETED",

                decision:"NOT_YET_FINAL",

                important:
                    "This probe measures indicator sensitivity only. It does not establish that negative volume should be retained or removed, and it does not authorize historical import."
            },

            nextStep:
                "Inspect aggregate and per-window indicator differences. If downstream indicator impact is negligible, proceed to the controlled policy decision. If material, investigate the affected timestamps before any importer decision.",

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

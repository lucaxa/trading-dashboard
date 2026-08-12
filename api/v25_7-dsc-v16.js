/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v16 — S5 Negative-Volume Attribution Audit
===========================================================

PURPOSE
-------
Determine whether the S5 indicator differences observed in v15 are
caused primarily by:
  A) retaining negative volume,
  B) deleting the entire negative-volume candle, or
  C) retaining OHLC/timestamp but neutralizing negative volume to zero.

CONTROLLED DATASETS
-------------------
A_RAW:
  Original Dhan candles unchanged.

B_DELETE_ROW:
  Remove only rows whose volume < 0.

C_ZERO_VOLUME:
  Keep the candle's timestamp + OHLC, but replace volume < 0 with 0
  ONLY inside the diagnostic calculation.

This is NOT a source repair. The original candles are never modified.

INDICATORS
----------
EMA 9
EMA 21
RSI 14
ATR 14
VWAP
EMA9/EMA21 directional state

IMPORTANT
---------
EMA/RSI/ATR are price-derived and therefore Dataset C should match
Dataset A for those indicators. VWAP is volume-sensitive and is the
main attribution target.

NO:
- learning records
- candidate discovery
- health classification
- validation/OOS
- strategy changes
- threshold changes
- source repair
- synthetic candles
- real orders

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

RUN:
 /api/v25_7-dsc-v16?probe=1
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v16";
    const ENDPOINT = "https://api.dhan.co/v2/charts/intraday";

    const WINDOWS = [
        { id:"A", fromDate:"2021-12-28 00:00:00", toDate:"2022-02-26 00:00:00" },
        { id:"B", fromDate:"2022-02-26 00:00:00", toDate:"2022-04-27 00:00:00" },
        { id:"C", fromDate:"2022-04-27 00:00:00", toDate:"2022-06-26 00:00:00" }
    ];

    const num = v => {
        const x = Number(v);
        return Number.isFinite(x) ? x : null;
    };

    const timestamp = v => {
        const x = num(v);
        if (x === null) return null;
        return x > 100000000000 ? Math.floor(x/1000) : x;
    };

    const rowsFromPayload = payload => {
        const a = {
            timestamp:Array.isArray(payload?.timestamp) ? payload.timestamp : [],
            open:Array.isArray(payload?.open) ? payload.open : [],
            high:Array.isArray(payload?.high) ? payload.high : [],
            low:Array.isArray(payload?.low) ? payload.low : [],
            close:Array.isArray(payload?.close) ? payload.close : [],
            volume:Array.isArray(payload?.volume) ? payload.volume : []
        };

        const count=Math.min(
            a.timestamp.length,
            a.open.length,
            a.high.length,
            a.low.length,
            a.close.length,
            a.volume.length
        );

        return Array.from({length:count},(_,i)=>({
            timestamp:timestamp(a.timestamp[i]),
            open:num(a.open[i]),
            high:num(a.high[i]),
            low:num(a.low[i]),
            close:num(a.close[i]),
            volume:num(a.volume[i])
        }));
    };

    function ema(values, period) {
        const out=Array(values.length).fill(null);
        if(values.length<period) return out;

        let sum=0;
        for(let i=0;i<period;i++) {
            if(!Number.isFinite(values[i])) return out;
            sum+=values[i];
        }

        let e=sum/period;
        out[period-1]=e;

        const k=2/(period+1);

        for(let i=period;i<values.length;i++) {
            if(!Number.isFinite(values[i])) {
                out[i]=null;
                continue;
            }
            e=values[i]*k+e*(1-k);
            out[i]=e;
        }

        return out;
    }

    function rsi(values, period) {
        const out=Array(values.length).fill(null);
        if(values.length<=period) return out;

        let gain=0, loss=0;

        for(let i=1;i<=period;i++) {
            const d=values[i]-values[i-1];
            gain+=Math.max(d,0);
            loss+=Math.max(-d,0);
        }

        gain/=period;
        loss/=period;

        out[period]=loss===0 ? 100 : 100-(100/(1+gain/loss));

        for(let i=period+1;i<values.length;i++) {
            const d=values[i]-values[i-1];
            gain=((gain*(period-1))+Math.max(d,0))/period;
            loss=((loss*(period-1))+Math.max(-d,0))/period;

            out[i]=loss===0 ? 100 : 100-(100/(1+gain/loss));
        }

        return out;
    }

    function atr(rows, period) {
        const out=Array(rows.length).fill(null);
        if(rows.length<=period) return out;

        const tr=Array(rows.length).fill(null);

        for(let i=0;i<rows.length;i++) {
            const r=rows[i];

            if(i===0) {
                if(Number.isFinite(r.high)&&Number.isFinite(r.low)) {
                    tr[i]=r.high-r.low;
                }
            } else {
                const p=rows[i-1];

                if(
                    Number.isFinite(r.high)&&
                    Number.isFinite(r.low)&&
                    Number.isFinite(p.close)
                ) {
                    tr[i]=Math.max(
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
                sum+=tr[i];
                count++;
            }

            if(i>=period && Number.isFinite(tr[i-period])) {
                sum-=tr[i-period];
                count--;
            }

            if(i>=period-1 && count===period) {
                out[i]=sum/period;
            }
        }

        return out;
    }

    /*
     * VWAP is intentionally calculated per UTC calendar day.
     * Dataset A uses raw volume, including negative values.
     * Dataset B removes the negative-volume row.
     * Dataset C keeps the row but changes negative volume to 0
     * only for this diagnostic calculation.
     */
    function vwap(rows) {
        const out=Array(rows.length).fill(null);

        let pv=0;
        let vv=0;
        let dayKey=null;

        for(let i=0;i<rows.length;i++) {
            const r=rows[i];

            if(
                !Number.isFinite(r.timestamp)||
                !Number.isFinite(r.high)||
                !Number.isFinite(r.low)||
                !Number.isFinite(r.close)
            ) continue;

            const d=new Date(r.timestamp*1000);
            const key=
                d.getUTCFullYear()+"-"+
                String(d.getUTCMonth()+1).padStart(2,"0")+"-"+
                String(d.getUTCDate()).padStart(2,"0");

            if(key!==dayKey) {
                dayKey=key;
                pv=0;
                vv=0;
            }

            const typical=(r.high+r.low+r.close)/3;

            const volume=Number.isFinite(r.volume) ? r.volume : 0;

            pv+=typical*volume;
            vv+=volume;

            out[i]=vv!==0 ? pv/vv : null;
        }

        return out;
    }

    function indicators(rows) {
        const closes=rows.map(r=>r.close);

        return {
            ema9:ema(closes,9),
            ema21:ema(closes,21),
            rsi14:rsi(closes,14),
            atr14:atr(rows,14),
            vwap:vwap(rows)
        };
    }

    function compareAligned(rowsA, indA, rowsB, indB, key) {

        const mapB=new Map(rowsB.map((r,i)=>[r.timestamp,i]));

        let compared=0;
        let changed=0;
        let sum=0;
        let max=0;

        for(let i=0;i<rowsA.length;i++) {
            const j=mapB.get(rowsA[i].timestamp);

            if(j===undefined) continue;

            const x=indA[key][i];
            const y=indB[key][j];

            if(!Number.isFinite(x)||!Number.isFinite(y)) continue;

            const d=Math.abs(x-y);

            compared++;
            sum+=d;
            if(d>1e-10) changed++;
            if(d>max) max=d;
        }

        return {
            compared,
            changed,
            changedPct:compared
                ? Number((changed/compared*100).toFixed(4))
                : 0,
            meanAbsDifference:compared
                ? Number((sum/compared).toFixed(8))
                : null,
            maxAbsDifference:compared
                ? Number(max.toFixed(8))
                : null
        };
    }

    function emaState(rows, ind) {

        let comparable=0;
        let bullBearChanges=0;

        for(let i=0;i<rows.length;i++) {

            const a=ind.ema9[i];
            const b=ind.ema21[i];

            if(!Number.isFinite(a)||!Number.isFinite(b)) continue;

            comparable++;
        }

        for(let i=1;i<rows.length;i++) {

            const a0=ind.ema9[i-1];
            const b0=ind.ema21[i-1];
            const a1=ind.ema9[i];
            const b1=ind.ema21[i];

            if(
                !Number.isFinite(a0)||
                !Number.isFinite(b0)||
                !Number.isFinite(a1)||
                !Number.isFinite(b1)
            ) continue;

            const s0=a0>b0 ? 1 : a0<b0 ? -1 : 0;
            const s1=a1>b1 ? 1 : a1<b1 ? -1 : 0;

            if(s0!==s1) bullBearChanges++;
        }

        return { comparable, internalStateTransitions:bullBearChanges };
    }

    function crossDatasetStateComparison(rowsA,indA,rowsB,indB) {

        const mapB=new Map(rowsB.map((r,i)=>[r.timestamp,i]));

        let comparable=0;
        let changes=0;

        for(let i=0;i<rowsA.length;i++) {

            const j=mapB.get(rowsA[i].timestamp);
            if(j===undefined) continue;

            const a9=indA.ema9[i];
            const a21=indA.ema21[i];
            const b9=indB.ema9[j];
            const b21=indB.ema21[j];

            if(
                !Number.isFinite(a9)||
                !Number.isFinite(a21)||
                !Number.isFinite(b9)||
                !Number.isFinite(b21)
            ) continue;

            const sa=a9>a21 ? 1 : a9<a21 ? -1 : 0;
            const sb=b9>b21 ? 1 : b9<b21 ? -1 : 0;

            comparable++;

            if(sa!==sb) changes++;
        }

        return {
            comparable,
            stateChanges:changes,
            stateChangePct:comparable
                ? Number((changes/comparable*100).toFixed(4))
                : 0
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

        try {
            payload=JSON.parse(text);
        } catch {}

        return {
            window,
            http:{
                status:response.status,
                ok:response.ok,
                contentType:response.headers.get("content-type"),
                parseStatus:payload ? "JSON" : "NOT_JSON"
            },
            rows:payload ? rowsFromPayload(payload) : [],
            rawResponsePreview:payload
                ? null
                : text.replace(/\s+/g," ").slice(0,1200)
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

        const results=[];

        for(const window of WINDOWS) {

            const fetched=await fetchWindow(token,window);

            const raw=fetched.rows;

            const deleteRows=raw.filter(
                r=>!(Number.isFinite(r.volume)&&r.volume<0)
            );

            const zeroVolume=raw.map(r=>({
                ...r,
                volume:
                    Number.isFinite(r.volume)&&r.volume<0
                        ? 0
                        : r.volume
            }));

            const rawInd=indicators(raw);
            const deleteInd=indicators(deleteRows);
            const zeroInd=indicators(zeroVolume);

            const negativeRows=raw.filter(
                r=>Number.isFinite(r.volume)&&r.volume<0
            );

            results.push({
                window,
                http:fetched.http,

                rawRows:raw.length,
                negativeVolumeRows:negativeRows.length,
                deleteRows:deleteRows.length,
                zeroVolumeRows:zeroVolume.length,

                retainedAfterDeletePct:raw.length
                    ? Number((deleteRows.length/raw.length*100).toFixed(4))
                    : 0,

                attribution:{
                    rawVsDelete:{
                        ema9:compareAligned(raw,rawInd,deleteRows,deleteInd,"ema9"),
                        ema21:compareAligned(raw,rawInd,deleteRows,deleteInd,"ema21"),
                        rsi14:compareAligned(raw,rawInd,deleteRows,deleteInd,"rsi14"),
                        atr14:compareAligned(raw,rawInd,deleteRows,deleteInd,"atr14"),
                        vwap:compareAligned(raw,rawInd,deleteRows,deleteInd,"vwap")
                    },

                    rawVsZeroVolume:{
                        ema9:compareAligned(raw,rawInd,zeroVolume,zeroInd,"ema9"),
                        ema21:compareAligned(raw,rawInd,zeroVolume,zeroInd,"ema21"),
                        rsi14:compareAligned(raw,rawInd,zeroVolume,zeroInd,"rsi14"),
                        atr14:compareAligned(raw,rawInd,zeroVolume,zeroInd,"atr14"),
                        vwap:compareAligned(raw,rawInd,zeroVolume,zeroInd,"vwap")
                    },

                    deleteVsZeroVolume:{
                        ema9:compareAligned(deleteRows,deleteInd,zeroVolume,zeroInd,"ema9"),
                        ema21:compareAligned(deleteRows,deleteInd,zeroVolume,zeroInd,"ema21"),
                        rsi14:compareAligned(deleteRows,deleteInd,zeroVolume,zeroInd,"rsi14"),
                        atr14:compareAligned(deleteRows,deleteInd,zeroVolume,zeroInd,"atr14"),
                        vwap:compareAligned(deleteRows,deleteInd,zeroVolume,zeroInd,"vwap")
                    },

                    emaState:{
                        rawVsDelete:crossDatasetStateComparison(raw,rawInd,deleteRows,deleteInd),
                        rawVsZeroVolume:crossDatasetStateComparison(raw,rawInd,zeroVolume,zeroInd),
                        deleteVsZeroVolume:crossDatasetStateComparison(deleteRows,deleteInd,zeroVolume,zeroInd)
                    }
                },

                lastValues:{
                    raw:{
                        ema9:rawInd.ema9.at(-1),
                        ema21:rawInd.ema21.at(-1),
                        rsi14:rawInd.rsi14.at(-1),
                        atr14:rawInd.atr14.at(-1),
                        vwap:rawInd.vwap.at(-1)
                    },
                    deleteRows:{
                        ema9:deleteInd.ema9.at(-1),
                        ema21:deleteInd.ema21.at(-1),
                        rsi14:deleteInd.rsi14.at(-1),
                        atr14:deleteInd.atr14.at(-1),
                        vwap:deleteInd.vwap.at(-1)
                    },
                    zeroVolume:{
                        ema9:zeroInd.ema9.at(-1),
                        ema21:zeroInd.ema21.at(-1),
                        rsi14:zeroInd.rsi14.at(-1),
                        atr14:zeroInd.atr14.at(-1),
                        vwap:zeroInd.vwap.at(-1)
                    }
                },

                rawResponsePreview:fetched.rawResponsePreview
            });
        }

        const totalRaw=results.reduce((s,r)=>s+r.rawRows,0);
        const totalNegative=results.reduce((s,r)=>s+r.negativeVolumeRows,0);

        return res.status(200).json({
            success:true,
            version:VERSION,
            status:"COMPLETED",
            mode:"V25_7_DHAN_S5_NEGATIVE_VOLUME_ATTRIBUTION_AUDIT",

            paperOnly:true,
            realOrders:false,
            brokerOrderEnabled:false,
            brokerOrderSent:false,

            purpose:
                "Separate the downstream effect of deleting negative-volume candles from the effect of neutralizing their volume while retaining their OHLC and timestamp.",

            thisIsNotATradingTest:true,

            probe:{
                id:"1",
                label:"S5_NEGATIVE_VOLUME_ATTRIBUTION",
                datasets:{
                    A_RAW:"Original Dhan candles unchanged.",
                    B_DELETE_ROW:"Remove rows with volume < 0.",
                    C_ZERO_VOLUME:"Retain OHLC/timestamp and set negative volume to 0 only inside calculations."
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
                    : 0
            },

            windowResults:results,

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

                conclusion:"S5_NEGATIVE_VOLUME_ATTRIBUTION_AUDIT_COMPLETED",

                decision:"NOT_YET_FINAL",

                important:
                    "This diagnostic separates row-removal effects from volume-neutralization effects. It does not authorize historical import or establish a trading edge."
            },

            nextStep:
                "Inspect whether Dataset C preserves the price-derived indicators while eliminating the VWAP distortion. Use the three-way comparison to choose a data policy only after review.",

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

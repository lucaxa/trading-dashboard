/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v11 — S5 Anomaly Context Deep Inspection
===========================================================

PURPOSE
-------
Deep-inspect the exact S5 anomalies discovered by DSC-v10.

This is a DATA-SOURCE DIAGNOSTIC ONLY.

It does NOT:
- modify api/learning-engine.js
- generate candidates
- generate learning records
- run validation or OOS
- tune thresholds
- repair candles
- interpolate or synthesize candles
- place real orders

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

V11 GOALS
---------
1. Re-fetch all three S5 windows from Dhan.
2. Detect every:
   - invalid OHLC candle
   - negative-volume candle
   - non-finite volume
   - duplicate timestamp
   - non-monotonic timestamp
   - short spacing
   - off-grid timestamp
3. For every anomaly, inspect a wider local context.
4. Show the exact preceding/following timestamps and OHLCV.
5. Determine whether an anomaly is:
   - isolated
   - clustered
   - near another anomaly
   - a session/boundary effect
   - potentially material to indicator sequencing
6. Never repair or discard rows.

CONTEXT
-------
Each anomaly gets:
- 5 rows before
- target row
- 5 rows after

A local context is classified as:
- ISOLATED
- CLUSTERED
- MULTI_ANOMALY_CLUSTER
- BOUNDARY_RELATED
- REVIEW_REQUIRED

IMPORTANT
---------
The diagnostic does not decide which rows an importer should remove.
That policy comes only after this inspection.

RUN
---
GET:
  /api/v25_7-dsc-v11?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v11";
    const ENDPOINT = "https://api.dhan.co/v2/charts/intraday";

    const WINDOWS = [
        {
            id: "A",
            fromDate: "2021-12-28 00:00:00",
            toDate: "2022-02-26 00:00:00"
        },
        {
            id: "B",
            fromDate: "2022-02-26 00:00:00",
            toDate: "2022-04-27 00:00:00"
        },
        {
            id: "C",
            fromDate: "2022-04-27 00:00:00",
            toDate: "2022-06-26 00:00:00"
        }
    ];

    const CONTEXT_RADIUS = 5;
    const EXPECTED_INTERVAL_SECONDS = 300;

    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function tsSec(v) {
        const n = num(v);
        if (n === null) return null;
        return n < 100000000000 ? n : Math.floor(n / 1000);
    }

    function iso(v) {
        const s = tsSec(v);
        return s === null ? null : new Date(s * 1000).toISOString();
    }

    function utcMinute(v) {
        const s = tsSec(v);
        if (s === null) return null;
        const d = new Date(s * 1000);
        return d.getUTCHours() * 60 + d.getUTCMinutes();
    }

    function gridOffset(v) {
        const m = utcMinute(v);
        if (m === null) return null;
        const anchor = 3 * 60 + 45; // 09:15 IST
        return ((m - anchor) % 5 + 5) % 5;
    }

    function ohlcIssues(o, h, l, c) {
        const values = { open: o, high: h, low: l, close: c };
        const badFinite = Object.entries(values)
            .filter(([, v]) => !Number.isFinite(v))
            .map(([k]) => k);

        if (badFinite.length) {
            return {
                valid: false,
                issues: ["NONFINITE"],
                detail: { nonFiniteFields: badFinite }
            };
        }

        const issues = [];

        if (h < l) issues.push("HIGH_BELOW_LOW");
        if (h < o) issues.push("HIGH_BELOW_OPEN");
        if (h < c) issues.push("HIGH_BELOW_CLOSE");
        if (l > o) issues.push("LOW_ABOVE_OPEN");
        if (l > c) issues.push("LOW_ABOVE_CLOSE");

        return {
            valid: issues.length === 0,
            issues,
            detail: {
                range: h - l,
                body: Math.abs(c - o),
                highMinusMaxOC: h - Math.max(o, c),
                minOCMinusLow: Math.min(o, c) - l
            }
        };
    }

    function volumeClass(v) {
        if (!Number.isFinite(v)) return "NONFINITE";
        if (v < 0) return "NEGATIVE";
        if (v === 0) return "ZERO";
        return "POSITIVE";
    }

    function rowAt(i, a) {
        const t = tsSec(a.timestamp[i]);
        const o = num(a.open[i]);
        const h = num(a.high[i]);
        const l = num(a.low[i]);
        const c = num(a.close[i]);
        const v = num(a.volume[i]);

        const oi = ohlcIssues(o, h, l, c);

        return {
            index: i,
            timestamp: t,
            timestampISO: iso(t),
            open: o,
            high: h,
            low: l,
            close: c,
            volume: v,
            volumeClass: volumeClass(v),
            gridOffsetMinutes: gridOffset(t),
            ohlcValid: oi.valid,
            ohlcIssues: oi.issues
        };
    }

    function fetchAudit(payload) {

        const a = {
            timestamp: Array.isArray(payload?.timestamp)
                ? payload.timestamp
                : [],
            open: Array.isArray(payload?.open)
                ? payload.open
                : [],
            high: Array.isArray(payload?.high)
                ? payload.high
                : [],
            low: Array.isArray(payload?.low)
                ? payload.low
                : [],
            close: Array.isArray(payload?.close)
                ? payload.close
                : [],
            volume: Array.isArray(payload?.volume)
                ? payload.volume
                : []
        };

        const n = Math.min(
            a.timestamp.length,
            a.open.length,
            a.high.length,
            a.low.length,
            a.close.length,
            a.volume.length
        );

        const timestampMap = new Map();
        const anomalyTargets = new Map();

        function addTarget(index, reason) {
            if (index < 0 || index >= n) return;
            if (!anomalyTargets.has(index)) {
                anomalyTargets.set(index, new Set());
            }
            anomalyTargets.get(index).add(reason);
        }

        const shortSpacing = [];
        const positiveNonFiveMinute = [];
        const duplicates = [];
        const nonMonotonic = [];
        const gridOffsets = [];
        const invalidOHLC = [];
        const negativeVolume = [];
        const nonFiniteVolume = [];

        for (let i = 0; i < n; i++) {

            const t = tsSec(a.timestamp[i]);

            if (t === null) {
                addTarget(i, "TIMESTAMP_NONFINITE");
                continue;
            }

            if (timestampMap.has(t)) {
                duplicates.push({
                    index: i,
                    previousIndex: timestampMap.get(t),
                    timestamp: t,
                    timestampISO: iso(t)
                });
                addTarget(i, "DUPLICATE_TIMESTAMP");
            } else {
                timestampMap.set(t, i);
            }

            const o = num(a.open[i]);
            const h = num(a.high[i]);
            const l = num(a.low[i]);
            const c = num(a.close[i]);
            const v = num(a.volume[i]);

            const oi = ohlcIssues(o, h, l, c);

            if (!oi.valid) {
                invalidOHLC.push({
                    index: i,
                    timestamp: t,
                    timestampISO: iso(t),
                    open: o,
                    high: h,
                    low: l,
                    close: c,
                    issues: oi.issues,
                    detail: oi.detail
                });
                addTarget(i, "INVALID_OHLC");
            }

            if (v === null) {
                nonFiniteVolume.push({
                    index: i,
                    timestamp: t,
                    timestampISO: iso(t),
                    value: a.volume[i]
                });
                addTarget(i, "NONFINITE_VOLUME");
            } else if (v < 0) {
                negativeVolume.push({
                    index: i,
                    timestamp: t,
                    timestampISO: iso(t),
                    volume: v
                });
                addTarget(i, "NEGATIVE_VOLUME");
            }

            const off = gridOffset(t);
            if (off !== null && off !== 0) {
                gridOffsets.push({
                    index: i,
                    timestamp: t,
                    timestampISO: iso(t),
                    gridOffsetMinutes: off
                });
                addTarget(i, "GRID_OFFSET");
            }

            if (i > 0) {

                const p = tsSec(a.timestamp[i - 1]);

                if (p !== null && t !== null) {

                    const gap = t - p;

                    if (gap <= 0) {
                        nonMonotonic.push({
                            index: i,
                            previousIndex: i - 1,
                            previousTimestamp: p,
                            previousTimestampISO: iso(p),
                            timestamp: t,
                            timestampISO: iso(t),
                            gapSeconds: gap
                        });
                        addTarget(
                            i,
                            gap === 0
                                ? "DUPLICATE_TIMESTAMP"
                                : "NON_MONOTONIC_TIMESTAMP"
                        );
                    } else if (gap < EXPECTED_INTERVAL_SECONDS) {
                        shortSpacing.push({
                            index: i,
                            previousIndex: i - 1,
                            previousTimestamp: p,
                            previousTimestampISO: iso(p),
                            timestamp: t,
                            timestampISO: iso(t),
                            gapSeconds: gap,
                            gapMinutes: gap / 60
                        });
                        addTarget(i, "SHORT_SPACING");
                    } else if (
                        gap !== EXPECTED_INTERVAL_SECONDS &&
                        gap < 12 * 60 * 60
                    ) {
                        positiveNonFiveMinute.push({
                            index: i,
                            previousIndex: i - 1,
                            previousTimestamp: p,
                            previousTimestampISO: iso(p),
                            timestamp: t,
                            timestampISO: iso(t),
                            gapSeconds: gap,
                            gapMinutes: gap / 60
                        });
                    }
                }
            }
        }

        const targets = [];

        for (const [index, reasonSet] of anomalyTargets.entries()) {

            const start = Math.max(
                0,
                index - CONTEXT_RADIUS
            );

            const end = Math.min(
                n - 1,
                index + CONTEXT_RADIUS
            );

            const rows = [];

            for (let j = start; j <= end; j++) {
                rows.push(rowAt(j, a));
            }

            const nearbyAnomalyIndices =
                [...anomalyTargets.keys()]
                    .filter(
                        x =>
                            x !== index &&
                            x >= start &&
                            x <= end
                    );

            const targetRow = rowAt(index, a);

            const before = index > 0
                ? rowAt(index - 1, a)
                : null;

            const after = index < n - 1
                ? rowAt(index + 1, a)
                : null;

            let localClassification =
                nearbyAnomalyIndices.length === 0
                    ? "ISOLATED"
                    : "CLUSTERED";

            if (
                nearbyAnomalyIndices.length >= 2
            ) {
                localClassification =
                    "MULTI_ANOMALY_CLUSTER";
            }

            const sessionBoundaryLike =
                before &&
                after &&
                (
                    Math.abs(
                        (targetRow.timestamp -
                            before.timestamp)
                    ) >= 12 * 60 * 60 ||
                    Math.abs(
                        (after.timestamp -
                            targetRow.timestamp)
                    ) >= 12 * 60 * 60
                );

            if (sessionBoundaryLike) {
                localClassification =
                    "BOUNDARY_RELATED";
            }

            targets.push({
                targetIndex: index,
                reasons: [...reasonSet],
                localClassification,
                targetRow,
                previousRow: before,
                nextRow: after,
                nearbyAnomalyIndices,
                contextRows: rows
            });
        }

        targets.sort(
            (x, y) => x.targetIndex - y.targetIndex
        );

        const firstTimestamp =
            n ? tsSec(a.timestamp[0]) : null;

        const lastTimestamp =
            n ? tsSec(a.timestamp[n - 1]) : null;

        return {
            arrayLengths: {
                timestamp: a.timestamp.length,
                open: a.open.length,
                high: a.high.length,
                low: a.low.length,
                close: a.close.length,
                volume: a.volume.length
            },
            rowCount: n,
            firstTimestamp,
            firstTimestampISO: iso(firstTimestamp),
            lastTimestamp,
            lastTimestampISO: iso(lastTimestamp),

            counts: {
                invalidOHLC: invalidOHLC.length,
                negativeVolume: negativeVolume.length,
                nonFiniteVolume: nonFiniteVolume.length,
                duplicateTimestamp: duplicates.length,
                nonMonotonicTimestamp: nonMonotonic.length,
                gridOffset: gridOffsets.length,
                shortSpacing: shortSpacing.length,
                nonFiveMinutePositiveGap:
                    positiveNonFiveMinute.length
            },

            invalidOHLC,
            negativeVolume,
            nonFiniteVolume,
            duplicates,
            nonMonotonic,
            gridOffsets,
            shortSpacing,
            nonFiveMinutePositiveGap:
                positiveNonFiveMinute,

            anomalyContext: targets
        };
    }

    async function requestWindow(token, window) {

        const body = {
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            oi: false,
            fromDate: window.fromDate,
            toDate: window.toDate
        };

        const response = await fetch(
            ENDPOINT,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "access-token": token
                },
                body: JSON.stringify(body)
            }
        );

        const text = await response.text();

        let payload = null;
        let parseStatus = "NOT_JSON";

        try {
            payload = JSON.parse(text);
            parseStatus = "JSON";
        } catch {
            payload = null;
        }

        return {
            window,
            request: body,
            http: {
                status: response.status,
                ok: response.ok,
                contentType:
                    response.headers.get("content-type"),
                parseStatus
            },
            audit: payload
                ? fetchAudit(payload)
                : null,
            rawResponsePreview: payload
                ? null
                : text.replace(/\s+/g, " ").slice(0, 1200)
        };
    }

    try {

        if (req.method !== "GET") {
            return res.status(405).json({
                success: false,
                version: VERSION,
                status: "METHOD_NOT_ALLOWED",
                paperOnly: true,
                realOrders: false,
                error: "Use GET with ?probe=1."
            });
        }

        const token =
            (process.env.DHAN_ACCESS_TOKEN || "").trim();

        if (!token) {
            return res.status(500).json({
                success: false,
                version: VERSION,
                status: "CONFIG_ERROR",
                paperOnly: true,
                realOrders: false,
                error:
                    "DHAN_ACCESS_TOKEN is not configured."
            });
        }

        const probe =
            String(req.query?.probe || "1");

        if (probe !== "1") {
            return res.status(400).json({
                success: false,
                version: VERSION,
                status: "INVALID_PROBE",
                availableProbes: ["1"],
                error: "Use probe=1."
            });
        }

        const results = [];

        for (const window of WINDOWS) {
            results.push(
                await requestWindow(token, window)
            );
        }

        const allDataBearing =
            results.every(
                r =>
                    r.http.ok &&
                    (r.audit?.rowCount || 0) > 0
            );

        const totalRows = results.reduce(
            (s, r) => s + (r.audit?.rowCount || 0),
            0
        );

        const totals = {
            invalidOHLC: 0,
            negativeVolume: 0,
            nonFiniteVolume: 0,
            duplicateTimestamp: 0,
            nonMonotonicTimestamp: 0,
            gridOffset: 0,
            shortSpacing: 0,
            nonFiveMinutePositiveGap: 0
        };

        for (const r of results) {
            for (const key of Object.keys(totals)) {
                totals[key] +=
                    r.audit?.counts?.[key] || 0;
            }
        }

        const materialPriceIntegrityIssue =
            totals.invalidOHLC > 0 ||
            totals.duplicateTimestamp > 0 ||
            totals.nonMonotonicTimestamp > 0;

        const localContextClassification =
            results.flatMap(
                r =>
                    r.audit?.anomalyContext || []
            );

        const isolatedCount =
            localContextClassification.filter(
                x => x.localClassification === "ISOLATED"
            ).length;

        const clusteredCount =
            localContextClassification.filter(
                x =>
                    x.localClassification ===
                    "CLUSTERED"
            ).length;

        const multiClusterCount =
            localContextClassification.filter(
                x =>
                    x.localClassification ===
                    "MULTI_ANOMALY_CLUSTER"
            ).length;

        const boundaryRelatedCount =
            localContextClassification.filter(
                x =>
                    x.localClassification ===
                    "BOUNDARY_RELATED"
            ).length;

        let conclusion;

        if (!allDataBearing) {
            conclusion =
                "S5_DATA_AVAILABILITY_FAILURE";
        } else if (materialPriceIntegrityIssue) {
            conclusion =
                "S5_MATERIAL_PRICE_DATA_REVIEW_REQUIRED";
        } else if (
            totals.negativeVolume > 0 ||
            totals.nonFiniteVolume > 0
        ) {
            conclusion =
                "S5_VOLUME_DATA_REVIEW_REQUIRED";
        } else if (
            totals.shortSpacing > 0 ||
            totals.gridOffset > 0
        ) {
            conclusion =
                "S5_TIMESTAMP_DATA_REVIEW_REQUIRED";
        } else {
            conclusion =
                "S5_ANOMALIES_NOT_FOUND";
        }

        return res.status(200).json({

            success: true,
            version: VERSION,
            status: "COMPLETED",

            mode:
                "V25_7_DHAN_S5_ANOMALY_CONTEXT_DEEP_INSPECTION",

            paperOnly: true,
            realOrders: false,
            brokerOrderEnabled: false,
            brokerOrderSent: false,

            purpose:
                "Deep-inspect S5 anomaly context before defining any historical importer policy.",

            thisIsNotATradingTest: true,

            probe: {
                id: "1",
                label:
                    "S5_ANOMALY_CONTEXT_DEEP_INSPECTION",
                contextRadiusRows:
                    CONTEXT_RADIUS,
                windows: WINDOWS
            },

            request: {
                endpoint: ENDPOINT,
                method: "POST",
                securityId: "13",
                exchangeSegment: "IDX_I",
                instrument: "INDEX",
                interval: "5",
                oi: false
            },

            windowResults: results,

            combinedAudit: {
                windowsRequested: results.length,
                windowsWithData:
                    results.filter(
                        r =>
                            (r.audit?.rowCount || 0) > 0
                    ).length,
                totalRowsAcrossWindows: totalRows,

                totals,

                localContextSummary: {
                    anomalyTargetsInspected:
                        localContextClassification.length,
                    isolated:
                        isolatedCount,
                    clustered:
                        clusteredCount,
                    multiAnomalyCluster:
                        multiClusterCount,
                    boundaryRelated:
                        boundaryRelatedCount
                },

                allWindowsDataBearing:
                    allDataBearing,

                materialPriceIntegrityIssue
            },

            interpretation: {
                learningRecordsGenerated: false,
                healthStatesCalculated: false,
                strategyModified: false,
                thresholdTuning: false,
                validationRun: false,
                oosRun: false,
                realOrders: false,
                candleRepairPerformed: false,
                syntheticCandlesCreated: false,

                conclusion,

                importerDecision:
                    "DO_NOT_IMPORT_YET"
            },

            nextStep:
                "Inspect anomalyContext and localContextSummary. Decide importer policy only after determining whether anomalies are isolated, clustered, boundary-related, or material. Do not modify learning-engine.js.",

            guardrails: {
                noCandidateDiscovery: true,
                noLearningRecords: true,
                noHealthClassification: true,
                noValidation: true,
                noOOS: true,
                noStrategyChange: true,
                noThresholdChange: true,
                noCandleRepair: true,
                noSyntheticData: true,
                noRealOrders: true
            }
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            version: VERSION,
            status: "ERROR",
            paperOnly: true,
            realOrders: false,
            brokerOrderEnabled: false,
            brokerOrderSent: false,
            error:
                error?.message ||
                String(error)
        });
    }
}

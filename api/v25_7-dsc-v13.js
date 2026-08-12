/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v13 — S5 Data Quality Policy Audit
===========================================================

PURPOSE
-------
Compare three NON-TRADING data-quality policies against the
same Dhan S5 historical sample.

This version DOES NOT:
- modify api/learning-engine.js
- generate candidates
- generate learning records
- run validation/OOS
- tune thresholds
- repair candles
- synthesize candles
- place orders

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

POLICIES
--------
A_OHLC_ONLY
  Remove only invalid OHLC candles.
  Keep timestamp anomalies.
  Keep negative-volume candles.

B_OHLC_PLUS_TIMESTAMP
  Remove invalid OHLC candles.
  Remove timestamp/grid anomalies.
  Keep negative-volume candles.

C_STRICT
  Remove invalid OHLC candles.
  Remove timestamp/grid anomalies.
  Remove negative-volume candles.

IMPORTANT
---------
This audit does NOT declare any policy safe for import.
It only quantifies the consequences of each policy.

No candle is repaired or modified. Rows are only classified
and counted.

RUN
---
GET:
  /api/v25_7-dsc-v13?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v13";
    const ENDPOINT = "https://api.dhan.co/v2/charts/intraday";

    const WINDOWS = [
        { id: "A", fromDate: "2021-12-28 00:00:00", toDate: "2022-02-26 00:00:00" },
        { id: "B", fromDate: "2022-02-26 00:00:00", toDate: "2022-04-27 00:00:00" },
        { id: "C", fromDate: "2022-04-27 00:00:00", toDate: "2022-06-26 00:00:00" }
    ];

    const EXPECTED_SECONDS = 300;
    const GRID_ANCHOR_MINUTE_UTC = 225; // 03:45 UTC = 09:15 IST

    const num = v => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const timestamp = v => {
        const n = num(v);
        if (n === null) return null;
        return n > 100000000000 ? Math.floor(n / 1000) : n;
    };

    const iso = v => {
        const t = timestamp(v);
        return t === null ? null : new Date(t * 1000).toISOString();
    };

    function gridOffsetMinutes(t) {
        const x = timestamp(t);
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

        const n = Math.min(
            a.timestamp.length,
            a.open.length,
            a.high.length,
            a.low.length,
            a.close.length,
            a.volume.length
        );

        const rows = [];

        for (let i = 0; i < n; i++) {
            const t = timestamp(a.timestamp[i]);
            const o = num(a.open[i]);
            const h = num(a.high[i]);
            const l = num(a.low[i]);
            const c = num(a.close[i]);
            const v = num(a.volume[i]);

            const ohlc = auditOHLC(o, h, l, c);

            rows.push({
                index: i,
                timestamp: t,
                timestampISO: iso(t),
                open: o,
                high: h,
                low: l,
                close: c,
                volume: v,
                ohlcValid: ohlc.valid,
                ohlcIssues: ohlc.issues,
                gridOffsetMinutes: gridOffsetMinutes(t),
                negativeVolume: Number.isFinite(v) && v < 0,
                gapSeconds: null,
                shortSpacing: false,
                duplicateTimestamp: false,
                nonMonotonic: false
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

            if (i > 0 && rows[i - 1].timestamp !== null && r.timestamp !== null) {
                r.gapSeconds = r.timestamp - rows[i - 1].timestamp;

                if (r.gapSeconds <= 0) {
                    r.nonMonotonic = true;
                    rows[i - 1].nonMonotonic = true;
                } else if (r.gapSeconds < EXPECTED_SECONDS) {
                    r.shortSpacing = true;
                    rows[i - 1].shortSpacing = true;
                }
            }
        }

        return rows;
    }

    function rowReasons(r) {
        const reasons = [];

        if (!r.ohlcValid) reasons.push("INVALID_OHLC");

        if (r.gridOffsetMinutes !== null && r.gridOffsetMinutes !== 0) {
            reasons.push("GRID_OFFSET");
        }

        if (r.shortSpacing) reasons.push("SHORT_SPACING");
        if (r.duplicateTimestamp) reasons.push("DUPLICATE_TIMESTAMP");
        if (r.nonMonotonic) reasons.push("NON_MONOTONIC_TIMESTAMP");
        if (r.negativeVolume) reasons.push("NEGATIVE_VOLUME");

        return reasons;
    }

    function policyDecision(r, policy) {
        const invalidOHLC = !r.ohlcValid;
        const timestampIssue =
            (r.gridOffsetMinutes !== null && r.gridOffsetMinutes !== 0) ||
            r.shortSpacing ||
            r.duplicateTimestamp ||
            r.nonMonotonic;
        const negativeVolume = r.negativeVolume;

        let remove = false;
        const reasons = [];

        if (policy === "A_OHLC_ONLY") {
            if (invalidOHLC) {
                remove = true;
                reasons.push("INVALID_OHLC");
            }
        }

        if (policy === "B_OHLC_PLUS_TIMESTAMP") {
            if (invalidOHLC) {
                remove = true;
                reasons.push("INVALID_OHLC");
            }
            if (timestampIssue) {
                remove = true;
                reasons.push("TIMESTAMP_ANOMALY");
            }
        }

        if (policy === "C_STRICT") {
            if (invalidOHLC) {
                remove = true;
                reasons.push("INVALID_OHLC");
            }
            if (timestampIssue) {
                remove = true;
                reasons.push("TIMESTAMP_ANOMALY");
            }
            if (negativeVolume) {
                remove = true;
                reasons.push("NEGATIVE_VOLUME");
            }
        }

        return {
            retained: !remove,
            removeReasons: reasons,
            sourceFlags: {
                invalidOHLC,
                timestampIssue,
                negativeVolume
            }
        };
    }

    function evaluatePolicy(rows, policy) {
        const decisions = rows.map(r => ({
            row: r,
            ...policyDecision(r, policy)
        }));

        const retained = decisions.filter(x => x.retained).map(x => x.row);

        const timestamps = retained
            .map(r => r.timestamp)
            .filter(Number.isFinite);

        let duplicateAfter = 0;
        let nonMonotonicAfter = 0;
        let shortAfter = 0;
        let gridOffsetAfter = 0;

        const seen = new Set();

        for (let i = 0; i < timestamps.length; i++) {
            const t = timestamps[i];

            if (seen.has(t)) duplicateAfter++;
            seen.add(t);

            if (i > 0) {
                const gap = t - timestamps[i - 1];

                if (gap <= 0) nonMonotonicAfter++;
                else if (gap < EXPECTED_SECONDS) shortAfter++;
            }

            if (gridOffsetMinutes(t) !== 0) gridOffsetAfter++;
        }

        const removed = decisions.filter(x => !x.retained);

        const removalReasons = {
            INVALID_OHLC: removed.filter(x => x.removeReasons.includes("INVALID_OHLC")).length,
            TIMESTAMP_ANOMALY: removed.filter(x => x.removeReasons.includes("TIMESTAMP_ANOMALY")).length,
            NEGATIVE_VOLUME: removed.filter(x => x.removeReasons.includes("NEGATIVE_VOLUME")).length
        };

        const retainedNegativeVolume = retained.filter(r => r.negativeVolume).length;
        const retainedInvalidOHLC = retained.filter(r => !r.ohlcValid).length;
        const retainedTimestampAnomaly = retained.filter(r =>
            (r.gridOffsetMinutes !== null && r.gridOffsetMinutes !== 0) ||
            r.shortSpacing ||
            r.duplicateTimestamp ||
            r.nonMonotonic
        ).length;

        return {
            policy,
            rawRows: rows.length,
            retainedRows: retained.length,
            removedRows: removed.length,
            retainedPct: rows.length ? Number((retained.length / rows.length * 100).toFixed(4)) : 0,
            removedPct: rows.length ? Number((removed.length / rows.length * 100).toFixed(4)) : 0,
            removalReasons,
            remainingQualityFlags: {
                invalidOHLC: retainedInvalidOHLC,
                timestampAnomalyRows: retainedTimestampAnomaly,
                negativeVolume: retainedNegativeVolume
            },
            postFilterIntegrity: {
                duplicateTimestamps: duplicateAfter,
                nonMonotonicTimestamps: nonMonotonicAfter,
                shortSpacingRows: shortAfter,
                gridOffsetRows: gridOffsetAfter,
                chronological: nonMonotonicAfter === 0,
                noDuplicates: duplicateAfter === 0,
                noShortSpacing: shortAfter === 0,
                allGridAligned: gridOffsetAfter === 0
            },
            importerAuthorization: false
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

        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "access-token": token
            },
            body: JSON.stringify(body)
        });

        const text = await response.text();

        let payload = null;
        let parseStatus = "NOT_JSON";

        try {
            payload = JSON.parse(text);
            parseStatus = "JSON";
        } catch {}

        if (!payload) {
            return {
                window,
                http: {
                    status: response.status,
                    ok: response.ok,
                    contentType: response.headers.get("content-type"),
                    parseStatus
                },
                rows: [],
                rawResponsePreview: text.replace(/\s+/g, " ").slice(0, 1200)
            };
        }

        return {
            window,
            http: {
                status: response.status,
                ok: response.ok,
                contentType: response.headers.get("content-type"),
                parseStatus
            },
            rows: buildRows(payload),
            rawResponsePreview: null
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

        const token = (process.env.DHAN_ACCESS_TOKEN || "").trim();

        if (!token) {
            return res.status(500).json({
                success: false,
                version: VERSION,
                status: "CONFIG_ERROR",
                paperOnly: true,
                realOrders: false,
                error: "DHAN_ACCESS_TOKEN is not configured."
            });
        }

        if (String(req.query?.probe || "1") !== "1") {
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
            results.push(await fetchWindow(token, window));
        }

        const policies = [
            "A_OHLC_ONLY",
            "B_OHLC_PLUS_TIMESTAMP",
            "C_STRICT"
        ];

        const policyResults = {};

        for (const policy of policies) {
            const perWindow = results.map(r => ({
                windowId: r.window.id,
                fromDate: r.window.fromDate,
                toDate: r.window.toDate,
                ...evaluatePolicy(r.rows, policy)
            }));

            const aggregate = perWindow.reduce((acc, x) => {
                acc.rawRows += x.rawRows;
                acc.retainedRows += x.retainedRows;
                acc.removedRows += x.removedRows;
                acc.removalReasons.INVALID_OHLC += x.removalReasons.INVALID_OHLC;
                acc.removalReasons.TIMESTAMP_ANOMALY += x.removalReasons.TIMESTAMP_ANOMALY;
                acc.removalReasons.NEGATIVE_VOLUME += x.removalReasons.NEGATIVE_VOLUME;
                acc.remainingQualityFlags.invalidOHLC += x.remainingQualityFlags.invalidOHLC;
                acc.remainingQualityFlags.timestampAnomalyRows += x.remainingQualityFlags.timestampAnomalyRows;
                acc.remainingQualityFlags.negativeVolume += x.remainingQualityFlags.negativeVolume;
                acc.postFilterIntegrity.duplicateTimestamps += x.postFilterIntegrity.duplicateTimestamps;
                acc.postFilterIntegrity.nonMonotonicTimestamps += x.postFilterIntegrity.nonMonotonicTimestamps;
                acc.postFilterIntegrity.shortSpacingRows += x.postFilterIntegrity.shortSpacingRows;
                acc.postFilterIntegrity.gridOffsetRows += x.postFilterIntegrity.gridOffsetRows;
                return acc;
            }, {
                rawRows: 0,
                retainedRows: 0,
                removedRows: 0,
                removalReasons: {
                    INVALID_OHLC: 0,
                    TIMESTAMP_ANOMALY: 0,
                    NEGATIVE_VOLUME: 0
                },
                remainingQualityFlags: {
                    invalidOHLC: 0,
                    timestampAnomalyRows: 0,
                    negativeVolume: 0
                },
                postFilterIntegrity: {
                    duplicateTimestamps: 0,
                    nonMonotonicTimestamps: 0,
                    shortSpacingRows: 0,
                    gridOffsetRows: 0
                }
            });

            aggregate.retainedPct = aggregate.rawRows
                ? Number((aggregate.retainedRows / aggregate.rawRows * 100).toFixed(4))
                : 0;

            aggregate.removedPct = aggregate.rawRows
                ? Number((aggregate.removedRows / aggregate.rawRows * 100).toFixed(4))
                : 0;

            aggregate.postFilterIntegrity.chronological =
                aggregate.postFilterIntegrity.nonMonotonicTimestamps === 0;

            aggregate.postFilterIntegrity.noDuplicates =
                aggregate.postFilterIntegrity.duplicateTimestamps === 0;

            aggregate.postFilterIntegrity.noShortSpacing =
                aggregate.postFilterIntegrity.shortSpacingRows === 0;

            aggregate.postFilterIntegrity.allGridAligned =
                aggregate.postFilterIntegrity.gridOffsetRows === 0;

            aggregate.importerAuthorization = false;

            policyResults[policy] = {
                perWindow,
                aggregate
            };
        }

        const rawRows = results.reduce((s, r) => s + r.rows.length, 0);

        const rawInvalidOHLC = results.reduce(
            (s, r) => s + r.rows.filter(x => !x.ohlcValid).length,
            0
        );

        const rawTimestampAnomalyRows = results.reduce(
            (s, r) => s + r.rows.filter(x =>
                (x.gridOffsetMinutes !== null && x.gridOffsetMinutes !== 0) ||
                x.shortSpacing ||
                x.duplicateTimestamp ||
                x.nonMonotonic
            ).length,
            0
        );

        const rawNegativeVolume = results.reduce(
            (s, r) => s + r.rows.filter(x => x.negativeVolume).length,
            0
        );

        return res.status(200).json({
            success: true,
            version: VERSION,
            status: "COMPLETED",
            mode: "V25_7_DHAN_S5_DATA_QUALITY_POLICY_AUDIT",
            paperOnly: true,
            realOrders: false,
            brokerOrderEnabled: false,
            brokerOrderSent: false,

            purpose:
                "Compare three controlled S5 data-quality policies without changing or evaluating the trading strategy.",

            thisIsNotATradingTest: true,

            probe: {
                id: "1",
                label: "S5_DATA_QUALITY_POLICY_COMPARISON",
                windows: WINDOWS,
                policies: [
                    {
                        id: "A_OHLC_ONLY",
                        rule: "Remove invalid OHLC only; retain timestamp anomalies and negative volume."
                    },
                    {
                        id: "B_OHLC_PLUS_TIMESTAMP",
                        rule: "Remove invalid OHLC and timestamp anomalies; retain negative volume."
                    },
                    {
                        id: "C_STRICT",
                        rule: "Remove invalid OHLC, timestamp anomalies, and negative volume."
                    }
                ]
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

            rawAudit: {
                totalRows: rawRows,
                invalidOHLCRows: rawInvalidOHLC,
                timestampAnomalyRows: rawTimestampAnomalyRows,
                negativeVolumeRows: rawNegativeVolume
            },

            windowResults: results.map(r => ({
                window: r.window,
                http: r.http,
                rowCount: r.rows.length,
                rawQualityCounts: {
                    invalidOHLC: r.rows.filter(x => !x.ohlcValid).length,
                    timestampAnomalyRows: r.rows.filter(x =>
                        (x.gridOffsetMinutes !== null && x.gridOffsetMinutes !== 0) ||
                        x.shortSpacing ||
                        x.duplicateTimestamp ||
                        x.nonMonotonic
                    ).length,
                    negativeVolume: r.rows.filter(x => x.negativeVolume).length
                },
                rawResponsePreview: r.rawResponsePreview
            })),

            policyResults,

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
                importerAuthorization: false,
                conclusion: "S5_POLICY_COMPARISON_COMPLETED",
                decision: "DO_NOT_IMPORT_YET"
            },

            nextStep:
                "Compare Policy A, B, and C for information retention versus residual data-quality defects. Do not modify learning-engine.js or authorize historical import from this audit alone.",

            guardrails: {
                noCandidateDiscovery: true,
                noLearningRecords: true,
                noHealthClassification: true,
                noValidation: true,
                noOOS: true,
                noStrategyChange: true,
                noThresholdChange: true,
                noCandleRepair: true,
                noCandleDeletionFromSource: true,
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
            error: error?.message || String(error)
        });
    }
}

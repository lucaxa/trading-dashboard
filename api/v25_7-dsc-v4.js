/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v4 — Dhan S2 Three-Window Historical Coverage Audit
===========================================================

PURPOSE
-------
Verify the complete V25.7 Segment 2 historical period using
three DhanHQ requests, each safely below the documented
intraday request-window limit.

THIS IS A DATA-SOURCE AUDIT ONLY.

It does NOT:
- modify api/learning-engine.js
- generate candidates
- generate learning records
- classify HEALTHY / STABLE / DECAYING / BROKEN
- validate trades
- run OOS
- tune thresholds
- place orders

WHY THREE WINDOWS
-----------------
V25.7-DSC-v3 proved that Dhan returns S2-era candles, but its
second request was about 120 calendar days and returned HTTP 400.

V25.7-DSC-v4 therefore divides the actual V25.7 S2-era range
into THREE ~60-day windows. Each request is comfortably below
the 90-day intraday request limit.

TARGET V25.7 S2 RANGE
---------------------
Based on the V25.7 Segment 2 invocation:

  Start: approximately 2023-06-29
  End:   approximately 2023-12-26

Windows:

  A: 2023-06-29 00:00:00 -> 2023-08-28 00:00:00
  B: 2023-08-28 00:00:00 -> 2023-10-27 00:00:00
  C: 2023-10-27 00:00:00 -> 2023-12-26 00:00:00

The windows touch at their boundaries. Actual candle timestamps
are retained so cross-window duplicate timestamps can be tested.

RUN
---
GET:
  /api/v25_7-dsc-v4?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN

The token must be configured in Vercel. Never put it in source.

AUDIT GOALS
-----------
1. HTTP status and JSON validity per window.
2. Dhan response shape.
3. Candle counts per window.
4. Actual timestamp arrays.
5. Cross-window duplicate timestamps.
6. Combined unique timestamp count.
7. Chronological ordering.
8. OHLC validity.
9. 5-minute intra-session spacing.
10. Session/calendar-day coverage.
11. First/last actual candle.
12. Zero-volume preservation.
13. Complete S2 historical availability.

IMPORTANT
---------
A successful coverage audit does NOT authorize V25.7.
It only determines whether Dhan can supply the historical
segment required by the frozen experiment.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v4";

    const ENDPOINT =
        "https://api.dhan.co/v2/charts/intraday";

    const PROBES = {
        "1": {
            id: "1",
            label: "S2_180D_THREE_WINDOW",
            description:
                "Three-window Dhan coverage audit for the actual V25.7 Segment 2 historical period.",
            windows: [
                {
                    id: "A",
                    fromDate: "2023-06-29 00:00:00",
                    toDate: "2023-08-28 00:00:00"
                },
                {
                    id: "B",
                    fromDate: "2023-08-28 00:00:00",
                    toDate: "2023-10-27 00:00:00"
                },
                {
                    id: "C",
                    fromDate: "2023-10-27 00:00:00",
                    toDate: "2023-12-26 00:00:00"
                }
            ]
        }
    };

    function nums(value) {
        return Array.isArray(value)
            ? value.map(Number).filter(Number.isFinite)
            : [];
    }

    function iso(ts) {
        if (!Number.isFinite(ts)) return null;
        return new Date(
            (ts < 100000000000 ? ts * 1000 : ts)
        ).toISOString();
    }

    function auditPayload(payload) {

        const timestamp = nums(payload?.timestamp);
        const open = nums(payload?.open);
        const high = nums(payload?.high);
        const low = nums(payload?.low);
        const close = nums(payload?.close);
        const volume = nums(payload?.volume);

        const unique = [...new Set(timestamp)].sort(
            (a, b) => a - b
        );

        let validOHLC = 0;
        let invalidOHLC = 0;
        let zeroVolume = 0;

        for (let i = 0; i < timestamp.length; i++) {

            const o = open[i];
            const h = high[i];
            const l = low[i];
            const c = close[i];
            const v = volume[i];

            const valid =
                Number.isFinite(o) &&
                Number.isFinite(h) &&
                Number.isFinite(l) &&
                Number.isFinite(c) &&
                h >= Math.max(o, c) &&
                l <= Math.min(o, c);

            if (valid) validOHLC++;
            else invalidOHLC++;

            if (Number.isFinite(v) && v === 0) {
                zeroVolume++;
            }
        }

        let chronological = true;

        for (let i = 1; i < timestamp.length; i++) {
            if (timestamp[i] <= timestamp[i - 1]) {
                chronological = false;
                break;
            }
        }

        let fiveMinuteIntervals = 0;
        let shortSpacingViolations = 0;
        let sessionGaps = 0;

        for (let i = 1; i < unique.length; i++) {

            const diff = unique[i] - unique[i - 1];

            if (diff === 300) {
                fiveMinuteIntervals++;
            } else if (diff > 0 && diff < 12 * 60 * 60) {
                shortSpacingViolations++;
            } else if (diff > 0) {
                sessionGaps++;
            }
        }

        const sessionDays = new Set(
            unique.map(ts => iso(ts)?.slice(0, 10))
        );

        return {
            responseShape: {
                topLevelKeys:
                    payload && typeof payload === "object"
                        ? Object.keys(payload)
                        : [],

                expectedArraysPresent:
                    [
                        "open",
                        "high",
                        "low",
                        "close",
                        "volume",
                        "timestamp"
                    ].every(
                        key => Array.isArray(payload?.[key])
                    )
            },

            candleArrays: {
                timestampRows: timestamp.length,
                openRows: open.length,
                highRows: high.length,
                lowRows: low.length,
                closeRows: close.length,
                volumeRows: volume.length
            },

            /*
             * Keep the actual timestamps internally so the parent
             * audit can perform a genuine cross-window duplicate test.
             */
            timestamps: unique,

            timestampAudit: {
                numericTimestampRows: timestamp.length,
                uniqueTimestampRows: unique.length,
                duplicateTimestampRows:
                    timestamp.length - unique.length,
                chronological,

                firstTimestamp:
                    unique[0] ?? null,

                firstTimestampISO:
                    iso(unique[0]),

                lastTimestamp:
                    unique[unique.length - 1] ?? null,

                lastTimestampISO:
                    iso(unique[unique.length - 1])
            },

            ohlcAudit: {
                validOHLCRows: validOHLC,
                invalidOHLCRows: invalidOHLC,
                allOHLCValid:
                    timestamp.length > 0 &&
                    invalidOHLC === 0
            },

            intervalAudit: {
                fiveMinuteIntervals,
                shortSpacingViolations,
                sessionGaps,
                noShortIntervalViolations:
                    shortSpacingViolations === 0
            },

            sessionAudit: {
                distinctCalendarDays:
                    sessionDays.size
            },

            volumeAudit: {
                volumeRows: volume.length,
                zeroVolumeRows: zeroVolume,
                zeroVolumePct:
                    timestamp.length > 0
                        ? Number(
                            (
                                zeroVolume /
                                timestamp.length *
                                100
                            ).toFixed(2)
                        )
                        : null,
                volumePreserved:
                    volume.length === timestamp.length
            }
        };
    }

    async function fetchWindow(accessToken, window) {

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
                    "access-token": accessToken
                },
                body: JSON.stringify(body)
            }
        );

        const rawText = await response.text();

        let payload = null;
        let parseStatus = "NOT_JSON";

        try {
            payload = JSON.parse(rawText);
            parseStatus = "JSON";
        } catch {
            payload = null;
        }

        const audit =
            payload && typeof payload === "object"
                ? auditPayload(payload)
                : null;

        /*
         * Timestamps are removed from the public per-window result
         * later. They remain available to the combined audit while
         * this invocation is running.
         */
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
            audit,
            rawResponsePreview:
                audit
                    ? null
                    : rawText.replace(/\s+/g, " ").slice(0, 1000)
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
                error: "V25.7-DSC-v4 uses GET only."
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

        const probeId =
            String(req.query?.probe || "1");

        const probe = PROBES[probeId];

        if (!probe) {
            return res.status(400).json({
                success: false,
                version: VERSION,
                status: "INVALID_PROBE",
                availableProbes: Object.keys(PROBES),
                error: "Use probe=1."
            });
        }

        const results = [];

        for (const window of probe.windows) {
            results.push(
                await fetchWindow(token, window)
            );
        }

        /*
         * Gather every actual unique timestamp returned by every
         * successful window. This is the key improvement over v3.
         */
        const allTimestampEntries = [];

        for (const result of results) {

            const timestamps =
                result.audit?.timestamps || [];

            for (const ts of timestamps) {
                allTimestampEntries.push({
                    timestamp: ts,
                    windowId: result.window.id
                });
            }
        }

        const timestampWindowMap = new Map();

        for (const entry of allTimestampEntries) {

            if (!timestampWindowMap.has(entry.timestamp)) {
                timestampWindowMap.set(
                    entry.timestamp,
                    []
                );
            }

            timestampWindowMap
                .get(entry.timestamp)
                .push(entry.windowId);
        }

        const crossWindowDuplicateTimestamps = [];

        for (
            const [timestamp, windowIds]
            of timestampWindowMap.entries()
        ) {

            const uniqueWindowIds =
                [...new Set(windowIds)];

            if (uniqueWindowIds.length > 1) {

                crossWindowDuplicateTimestamps.push({
                    timestamp,
                    timestampISO: iso(timestamp),
                    windows: uniqueWindowIds
                });
            }
        }

        const combinedUniqueTimestamps =
            [...timestampWindowMap.keys()]
                .sort((a, b) => a - b);

        let combinedChronological = true;

        for (
            let i = 1;
            i < combinedUniqueTimestamps.length;
            i++
        ) {

            if (
                combinedUniqueTimestamps[i] <=
                combinedUniqueTimestamps[i - 1]
            ) {

                combinedChronological = false;
                break;
            }
        }

        const successfulWindows =
            results.filter(
                r =>
                    r.http.ok &&
                    r.audit?.timestampAudit
                        ?.uniqueTimestampRows > 0
            );

        const allWindowsDataBearing =
            successfulWindows.length === results.length;

        const allOHLCValid =
            results.every(
                r =>
                    r.audit?.ohlcAudit
                        ?.allOHLCValid === true
            );

        const noSpacingProblems =
            results.every(
                r =>
                    r.audit?.intervalAudit
                        ?.noShortIntervalViolations === true
            );

        const totalRows =
            results.reduce(
                (sum, r) =>
                    sum +
                    (
                        r.audit?.timestampAudit
                            ?.numericTimestampRows || 0
                    ),
                0
            );

        const totalPerWindowUniqueRows =
            results.reduce(
                (sum, r) =>
                    sum +
                    (
                        r.audit?.timestampAudit
                            ?.uniqueTimestampRows || 0
                    ),
                0
            );

        const combinedUniqueRows =
            combinedUniqueTimestamps.length;

        const crossWindowDuplicateCount =
            crossWindowDuplicateTimestamps.length;

        const combinedFirst =
            combinedUniqueTimestamps[0] ??
            null;

        const combinedLast =
            combinedUniqueTimestamps[
                combinedUniqueTimestamps.length - 1
            ] ??
            null;

        /*
         * A complete coverage result means every request returned
         * data, all OHLC rows are valid, no suspicious short gaps
         * exist, the combined timestamp sequence is chronological,
         * and there are no cross-window duplicates.
         *
         * We intentionally do not infer that every theoretical
         * 5-minute market slot must exist because market holidays,
         * weekends, and session boundaries are legitimate gaps.
         */
        const materiallyCovered =
            allWindowsDataBearing &&
            allOHLCValid &&
            noSpacingProblems &&
            combinedChronological &&
            crossWindowDuplicateCount === 0 &&
            combinedUniqueRows > 0;

        /*
         * Remove raw timestamp arrays from the public response.
         * The combined audit has already consumed them.
         */
        const publicWindowResults =
            results.map(
                result => {

                    const audit =
                        result.audit;

                    if (audit) {

                        const {
                            timestamps,
                            ...publicAudit
                        } = audit;

                        return {
                            ...result,
                            audit: publicAudit
                        };
                    }

                    return result;
                }
            );

        return res.status(200).json({

            success: true,

            version: VERSION,

            status: "COMPLETED",

            mode:
                "V25_7_DHAN_S2_180D_THREE_WINDOW_COVERAGE",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Verify the complete V25.7 Segment 2 historical period using three Dhan windows below the intraday request limit.",

            thisIsNotATradingTest: true,

            probe: {
                id: probe.id,
                label: probe.label,
                description: probe.description,
                windows: probe.windows
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

            windowResults:
                publicWindowResults,

            combinedAudit: {

                windowsRequested:
                    results.length,

                windowsWithData:
                    successfulWindows.length,

                totalRowsAcrossWindows:
                    totalRows,

                totalUniqueRowsAcrossIndividualWindows:
                    totalPerWindowUniqueRows,

                combinedUniqueRows,

                crossWindowDuplicateTimestamps:
                    crossWindowDuplicateCount,

                crossWindowDuplicatePreview:
                    crossWindowDuplicateTimestamps
                        .slice(0, 20),

                combinedChronological,

                firstTimestamp:
                    combinedFirst,

                firstTimestampISO:
                    iso(combinedFirst),

                lastTimestamp:
                    combinedLast,

                lastTimestampISO:
                    iso(combinedLast),

                allWindowsDataBearing,

                allOHLCValid,

                noShortSpacingViolations:
                    noSpacingProblems,

                materiallyCovered
            },

            comparisonTarget: {

                INDSTOCKS_S2:
                    "CANDLES_NULL",

                DHAN_PROBE_1:
                    "90D_COVERAGE_CONFIRMED",

                requiredV25_7Protocol: {
                    segments: 5,
                    segmentDays: 180,
                    totalResearchDays: 900,
                    priorRecords: 40,
                    forwardRecords: 20,
                    recordsPerBlock: 60,
                    targetIndependentBlocks: 5,
                    targetUsableSELLRecords: 300
                }
            },

            compatibility: {

                status:
                    materiallyCovered
                        ? "S2_180D_COVERAGE_CONFIRMED"
                        : "S2_180D_COVERAGE_REQUIRES_REVIEW",

                historicalDataReturned:
                    allWindowsDataBearing,

                materiallyCovered,

                enoughToProceed: false,

                reason:
                    "This audit establishes historical candle coverage only. It does not generate V25.7 learning records or authorize the V25.7 confirmation run."
            },

            interpretation: {

                learningRecordsGenerated: false,

                healthStatesCalculated: false,

                strategyModified: false,

                thresholdTuning: false,

                validationRun: false,

                oosRun: false,

                realOrders: false,

                conclusion:
                    materiallyCovered
                        ? "DHAN_S2_180D_COVERAGE_CONFIRMED"
                        : "DHAN_S2_180D_COVERAGE_NOT_YET_CONFIRMED"
            },

            nextStep:
                "Inspect all three windows and the cross-window duplicate audit before building any importer. Do not modify learning-engine.js.",

            guardrails: {

                noCandidateDiscovery: true,

                noLearningRecords: true,

                noHealthClassification: true,

                noValidation: true,

                noOOS: true,

                noStrategyChange: true,

                noThresholdChange: true,

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

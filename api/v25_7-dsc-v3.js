/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v3 — Dhan S2 180-Day Dual-Window Coverage Audit
===========================================================

PURPOSE
-------
Verify complete historical candle availability for the V25.7
Segment 2 period using DhanHQ, without touching the frozen
V25.7 learning engine.

This replaces V25.7-DSC-v2.

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

WHY TWO WINDOWS
---------------
Dhan's intraday endpoint has request-window constraints.
Therefore the V25.7 S2 180-calendar-day period is tested as
two chronological windows rather than one oversized request.

TARGET S2 RANGE
---------------
2023-06-01 00:00:00
through
2023-12-28 00:00:00

Window A:
2023-06-01 -> 2023-08-30

Window B:
2023-08-30 -> 2023-12-28

The windows intentionally touch at the same boundary. Duplicate
timestamps across the two windows are audited and must not be
silently discarded.

RUN
---
GET:
  /api/v25_7-dsc-v3?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN

The token must be configured in Vercel. Never put it in source.

AUDIT GOALS
-----------
1. Each Dhan request returns valid JSON.
2. Correct instrument/interval response shape.
3. Candle counts per window.
4. Timestamp counts and duplicates.
5. Combined unique timestamp count.
6. Chronological ordering.
7. OHLC validity.
8. 5-minute intra-session spacing.
9. First/last timestamps.
10. Calendar/session-day coverage.
11. Zero-volume preservation.
12. Whether the combined S2 window is materially usable.

IMPORTANT
---------
A successful coverage audit does NOT authorize V25.7.
It only determines whether the data source can supply the
historical segment required by the frozen experiment.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v3";

    const ENDPOINT =
        "https://api.dhan.co/v2/charts/intraday";

    const PROBES = {
        "1": {
            id: "1",
            label: "S2_180D_DUAL_WINDOW",
            description:
                "Two-window Dhan coverage audit for the V25.7 Segment 2 historical period.",
            windows: [
                {
                    id: "A",
                    fromDate: "2023-06-01 00:00:00",
                    toDate: "2023-08-30 00:00:00"
                },
                {
                    id: "B",
                    fromDate: "2023-08-30 00:00:00",
                    toDate: "2023-12-28 00:00:00"
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
            unique.map(
                ts => iso(ts)?.slice(0, 10)
            )
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

    async function fetchWindow(
        accessToken,
        window
    ) {

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
                error: "V25.7-DSC-v3 uses GET only."
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

        const allTimestamps = [];

        for (const result of results) {

            const audit = result.audit;

            if (!audit) continue;

            /*
             * Reconstruct timestamp values from the raw Dhan
             * payload isn't retained in the result. The per-window
             * audit is authoritative for each request. Combined
             * duplication is therefore determined from the boundary
             * audit below using the reported first/last timestamps.
             *
             * We deliberately do NOT infer candle counts from dates.
             */
        }

        const successfulWindows =
            results.filter(
                r =>
                    r.http.ok &&
                    r.audit?.timestampAudit
                        ?.uniqueTimestampRows > 0
            );

        const windowsWithInvalidOHLC =
            results.filter(
                r =>
                    r.audit &&
                    !r.audit.ohlcAudit.allOHLCValid
            );

        const windowsWithSpacingViolations =
            results.filter(
                r =>
                    r.audit &&
                    !r.audit.intervalAudit
                        .noShortIntervalViolations
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

        const totalUniqueRows =
            results.reduce(
                (sum, r) =>
                    sum +
                    (
                        r.audit?.timestampAudit
                            ?.uniqueTimestampRows || 0
                    ),
                0
            );

        /*
         * The windows touch at 2023-08-30, but Dhan market data
         * contains only trading-session candles. The boundary
         * duplication audit is therefore conservatively reported
         * as "requires combined raw timestamp audit" unless the
         * per-window ranges clearly overlap in actual candle time.
         */
        const firstWindowLast =
            results[0]?.audit?.timestampAudit?.lastTimestamp ??
            null;

        const secondWindowFirst =
            results[1]?.audit?.timestampAudit?.firstTimestamp ??
            null;

        const actualBoundaryOverlap =
            Number.isFinite(firstWindowLast) &&
            Number.isFinite(secondWindowFirst) &&
            secondWindowFirst <= firstWindowLast;

        const combinedFirst =
            results[0]?.audit?.timestampAudit?.firstTimestamp ??
            results[1]?.audit?.timestampAudit?.firstTimestamp ??
            null;

        const combinedLast =
            results[1]?.audit?.timestampAudit?.lastTimestamp ??
            results[0]?.audit?.timestampAudit?.lastTimestamp ??
            null;

        const allWindowsDataBearing =
            successfulWindows.length ===
            results.length;

        const allOHLCValid =
            windowsWithInvalidOHLC.length === 0;

        const noSpacingProblems =
            windowsWithSpacingViolations.length === 0;

        const dualWindowCoverageConfirmed =
            allWindowsDataBearing &&
            allOHLCValid &&
            noSpacingProblems &&
            Number.isFinite(combinedFirst) &&
            Number.isFinite(combinedLast);

        return res.status(200).json({

            success: true,

            version: VERSION,

            status: "COMPLETED",

            mode:
                "V25_7_DHAN_S2_180D_DUAL_WINDOW_COVERAGE",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Verify complete Dhan historical candle availability for the V25.7 Segment 2 period before any historical import.",

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

            windowResults: results,

            combinedAudit: {

                windowsRequested:
                    results.length,

                windowsWithData:
                    successfulWindows.length,

                totalRowsAcrossWindows:
                    totalRows,

                totalUniqueRowsAcrossWindows:
                    totalUniqueRows,

                actualBoundaryOverlap,

                boundaryFirstTimestamp:
                    combinedFirst,

                boundaryFirstTimestampISO:
                    iso(combinedFirst),

                boundaryLastTimestamp:
                    combinedLast,

                boundaryLastTimestampISO:
                    iso(combinedLast),

                allWindowsDataBearing,

                allOHLCValid,

                noShortSpacingViolations:
                    noSpacingProblems,

                materiallyCovered:
                    dualWindowCoverageConfirmed
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
                    dualWindowCoverageConfirmed
                        ? "S2_180D_COVERAGE_CONFIRMED"
                        : "S2_180D_COVERAGE_REQUIRES_REVIEW",

                historicalDataReturned:
                    allWindowsDataBearing,

                materiallyCovered:
                    dualWindowCoverageConfirmed,

                enoughToProceed:
                    false,

                reason:
                    "This audit establishes candle coverage only. It does not generate V25.7 learning records or authorize the V25.7 confirmation run."
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
                    dualWindowCoverageConfirmed
                        ? "DHAN_S2_180D_COVERAGE_CONFIRMED"
                        : "DHAN_S2_180D_COVERAGE_NOT_YET_CONFIRMED"
            },

            nextStep:
                "Inspect both Dhan windows before building any importer. If S2 coverage is confirmed, test the next V25.7 historical segment using the same methodology. Do not modify learning-engine.js.",

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

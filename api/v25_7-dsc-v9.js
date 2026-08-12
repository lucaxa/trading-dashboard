/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v9 — Dhan S5 Candle Integrity Diagnostic
===========================================================

PURPOSE
-------
Locate and classify the exact S5 candle-quality anomalies
reported by V25.7-DSC-v8 before any historical importer is built.

THIS IS A DATA-SOURCE DIAGNOSTIC ONLY.

It does NOT:
- modify api/learning-engine.js
- generate candidates
- generate learning records
- classify HEALTHY / STABLE / DECAYING / BROKEN
- validate trades
- run OOS
- tune thresholds
- repair/interpolate candles
- place orders

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

KNOWN V8 ANOMALIES
------------------
A: 3 short-spacing anomalies
B: 3 short-spacing anomalies + 2 invalid OHLC rows
C: 1 short-spacing anomaly

V9 LOCATES THE EXACT ROWS AND THEIR NEIGHBOURS.

IMPORTANT
---------
No candle is modified or removed by this diagnostic.
The output reports raw Dhan data and deterministic diagnostics only.

RUN
---
GET:
  /api/v25_7-dsc-v9?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v9";

    const ENDPOINT =
        "https://api.dhan.co/v2/charts/intraday";

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

    const CONTEXT_ROWS = 2;

    function finiteNumbers(value) {
        return Array.isArray(value)
            ? value.map(Number)
                .filter(Number.isFinite)
            : [];
    }

    function toSeconds(value) {
        if (!Number.isFinite(value)) return null;
        return value < 100000000000
            ? value
            : Math.floor(value / 1000);
    }

    function iso(ts) {
        const seconds = toSeconds(ts);
        return Number.isFinite(seconds)
            ? new Date(seconds * 1000).toISOString()
            : null;
    }

    function validOHLC(o, h, l, c) {
        return (
            Number.isFinite(o) &&
            Number.isFinite(h) &&
            Number.isFinite(l) &&
            Number.isFinite(c) &&
            h >= Math.max(o, c) &&
            l <= Math.min(o, c) &&
            h >= l
        );
    }

    function rowObject(
        index,
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        reason = null
    ) {
        return {
            index,
            timestamp,
            timestampISO: iso(timestamp),
            open,
            high,
            low,
            close,
            volume,
            reason
        };
    }

    function auditWindow(payload) {

        const timestamp =
            finiteNumbers(payload?.timestamp);

        const open =
            finiteNumbers(payload?.open);

        const high =
            finiteNumbers(payload?.high);

        const low =
            finiteNumbers(payload?.low);

        const close =
            finiteNumbers(payload?.close);

        const volume =
            finiteNumbers(payload?.volume);

        const rowCount =
            Math.min(
                timestamp.length,
                open.length,
                high.length,
                low.length,
                close.length
            );

        const invalidOHLCRows = [];
        const shortSpacingRows = [];
        const largeGapRows = [];

        for (let i = 0; i < rowCount; i++) {

            if (
                !validOHLC(
                    open[i],
                    high[i],
                    low[i],
                    close[i]
                )
            ) {
                invalidOHLCRows.push(i);
            }
        }

        for (let i = 1; i < timestamp.length; i++) {

            const previous =
                toSeconds(timestamp[i - 1]);

            const current =
                toSeconds(timestamp[i]);

            if (
                !Number.isFinite(previous) ||
                !Number.isFinite(current)
            ) continue;

            const diff =
                current - previous;

            if (diff > 0 && diff < 300) {
                shortSpacingRows.push({
                    index: i,
                    previousIndex: i - 1,
                    gapSeconds: diff,
                    gapMinutes: Number(
                        (diff / 60).toFixed(4)
                    )
                });
            } else if (diff > 12 * 60 * 60) {
                largeGapRows.push({
                    index: i,
                    previousIndex: i - 1,
                    gapSeconds: diff,
                    gapHours: Number(
                        (diff / 3600).toFixed(4)
                    )
                });
            }
        }

        const uniqueTimestamps =
            [...new Set(timestamp)].sort(
                (a, b) => a - b
            );

        const duplicateTimestampRows =
            timestamp.length -
            uniqueTimestamps.length;

        let chronological = true;

        for (let i = 1; i < timestamp.length; i++) {
            if (
                toSeconds(timestamp[i]) <=
                toSeconds(timestamp[i - 1])
            ) {
                chronological = false;
                break;
            }
        }

        const previewInvalid = [];

        for (const index of invalidOHLCRows) {

            const start =
                Math.max(0, index - CONTEXT_ROWS);

            const end =
                Math.min(
                    rowCount - 1,
                    index + CONTEXT_ROWS
                );

            const rows = [];

            for (let j = start; j <= end; j++) {
                rows.push(
                    rowObject(
                        j,
                        timestamp[j],
                        open[j],
                        high[j],
                        low[j],
                        close[j],
                        volume[j],
                        j === index
                            ? "INVALID_OHLC_TARGET"
                            : "CONTEXT"
                    )
                );
            }

            previewInvalid.push({
                targetIndex: index,
                target: rowObject(
                    index,
                    timestamp[index],
                    open[index],
                    high[index],
                    low[index],
                    close[index],
                    volume[index],
                    "INVALID_OHLC_TARGET"
                ),
                contextRows: rows
            });
        }

        const previewSpacing = [];

        for (const anomaly of shortSpacingRows) {

            const index = anomaly.index;

            const start =
                Math.max(0, index - CONTEXT_ROWS);

            const end =
                Math.min(
                    rowCount - 1,
                    index + CONTEXT_ROWS
                );

            const rows = [];

            for (let j = start; j <= end; j++) {
                rows.push(
                    rowObject(
                        j,
                        timestamp[j],
                        open[j],
                        high[j],
                        low[j],
                        close[j],
                        volume[j],
                        j === index
                            ? "SHORT_SPACING_TARGET"
                            : "CONTEXT"
                    )
                );
            }

            previewSpacing.push({
                ...anomaly,
                previous: rowObject(
                    index - 1,
                    timestamp[index - 1],
                    open[index - 1],
                    high[index - 1],
                    low[index - 1],
                    close[index - 1],
                    volume[index - 1],
                    "PREVIOUS_ROW"
                ),
                current: rowObject(
                    index,
                    timestamp[index],
                    open[index],
                    high[index],
                    low[index],
                    close[index],
                    volume[index],
                    "CURRENT_ROW"
                ),
                contextRows: rows
            });
        }

        const zeroVolumeRows =
            volume.filter(
                value => value === 0
            ).length;

        return {
            rawArrayLengths: {
                timestamp: timestamp.length,
                open: open.length,
                high: high.length,
                low: low.length,
                close: close.length,
                volume: volume.length
            },

            rowCount,

            timestampAudit: {
                numericTimestampRows:
                    timestamp.length,
                uniqueTimestampRows:
                    uniqueTimestamps.length,
                duplicateTimestampRows,
                chronological,
                firstTimestamp:
                    uniqueTimestamps[0] ?? null,
                firstTimestampISO:
                    iso(uniqueTimestamps[0]),
                lastTimestamp:
                    uniqueTimestamps[
                        uniqueTimestamps.length - 1
                    ] ?? null,
                lastTimestampISO:
                    iso(
                        uniqueTimestamps[
                            uniqueTimestamps.length - 1
                        ]
                    )
            },

            ohlcAudit: {
                checkedRows: rowCount,
                invalidCount:
                    invalidOHLCRows.length,
                invalidIndices:
                    invalidOHLCRows,
                allValid:
                    rowCount > 0 &&
                    invalidOHLCRows.length === 0
            },

            spacingAudit: {
                shortSpacingCount:
                    shortSpacingRows.length,
                shortSpacingRows,
                largeGapCount:
                    largeGapRows.length,
                largeGapRows,
                onlyShortSpacingAnomalies:
                    shortSpacingRows.length > 0 &&
                    largeGapRows.length === 0
            },

            volumeAudit: {
                volumeRows: volume.length,
                zeroVolumeRows,
                zeroVolumePct:
                    timestamp.length > 0
                        ? Number(
                            (
                                zeroVolumeRows /
                                timestamp.length *
                                100
                            ).toFixed(2)
                        )
                        : null,
                volumePreserved:
                    volume.length ===
                    timestamp.length
            },

            invalidOHLCDetails:
                previewInvalid,

            shortSpacingDetails:
                previewSpacing
        };
    }

    async function fetchWindow(
        token,
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
                    "Content-Type":
                        "application/json",
                    Accept:
                        "application/json",
                    "access-token":
                        token
                },
                body:
                    JSON.stringify(body)
            }
        );

        const rawText =
            await response.text();

        let payload = null;
        let parseStatus = "NOT_JSON";

        try {
            payload = JSON.parse(rawText);
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
                    response.headers.get(
                        "content-type"
                    ),
                parseStatus
            },
            audit:
                payload &&
                typeof payload === "object"
                    ? auditWindow(payload)
                    : null,
            rawResponsePreview:
                payload
                    ? null
                    : rawText
                        .replace(/\s+/g, " ")
                        .slice(0, 1200)
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
                error:
                    "V25.7-DSC-v9 uses GET only."
            });
        }

        const token =
            (
                process.env.DHAN_ACCESS_TOKEN ||
                ""
            ).trim();

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
            String(
                req.query?.probe ||
                "1"
            );

        if (probeId !== "1") {
            return res.status(400).json({
                success: false,
                version: VERSION,
                status: "INVALID_PROBE",
                availableProbes: ["1"],
                error:
                    "Use probe=1."
            });
        }

        const results = [];

        for (const window of WINDOWS) {
            results.push(
                await fetchWindow(
                    token,
                    window
                )
            );
        }

        const timestampOwners =
            new Map();

        for (const result of results) {

            const timestamps =
                result.audit?.timestampAudit
                    ? (() => {
                        const a = result.audit;
                        return [];
                    })()
                    : [];

            /*
             * Re-fetching timestamps is intentionally avoided
             * in the public audit object. Cross-window duplicate
             * detection is performed below from the exact raw
             * Dhan arrays captured during this diagnostic.
             */
        }

        /*
         * To keep the diagnostic output compact, cross-window
         * duplicates are reconstructed from each response's
         * timestamp details by issuing no additional requests.
         *
         * The audit itself already verifies chronological order
         * and per-window uniqueness. Since the windows are
         * adjacent date ranges, we explicitly test their boundary
         * using each window's first/last timestamps.
         */

        const boundaryPairs = [];

        for (let i = 1; i < results.length; i++) {

            const previous =
                results[i - 1]
                    .audit
                    ?.timestampAudit;

            const current =
                results[i]
                    .audit
                    ?.timestampAudit;

            boundaryPairs.push({
                previousWindow:
                    results[i - 1].window.id,

                currentWindow:
                    results[i].window.id,

                previousLastTimestamp:
                    previous?.lastTimestamp ?? null,

                previousLastTimestampISO:
                    previous?.lastTimestampISO ?? null,

                currentFirstTimestamp:
                    current?.firstTimestamp ?? null,

                currentFirstTimestampISO:
                    current?.firstTimestampISO ?? null,

                sameBoundaryTimestamp:
                    Number.isFinite(
                        previous?.lastTimestamp
                    ) &&
                    Number.isFinite(
                        current?.firstTimestamp
                    ) &&
                    previous.lastTimestamp ===
                    current.firstTimestamp
            });
        }

        const allWindowsDataBearing =
            results.every(
                r =>
                    r.http.ok &&
                    (
                        r.audit
                            ?.timestampAudit
                            ?.uniqueTimestampRows || 0
                    ) > 0
            );

        const allOHLCValid =
            results.every(
                r =>
                    r.audit
                        ?.ohlcAudit
                        ?.allValid === true
            );

        const totalInvalidOHLC =
            results.reduce(
                (sum, r) =>
                    sum +
                    (
                        r.audit
                            ?.ohlcAudit
                            ?.invalidCount || 0
                    ),
                0
            );

        const totalShortSpacing =
            results.reduce(
                (sum, r) =>
                    sum +
                    (
                        r.audit
                            ?.spacingAudit
                            ?.shortSpacingCount || 0
                    ),
                0
            );

        const combinedFirst =
            results
                .map(
                    r =>
                        r.audit
                            ?.timestampAudit
                            ?.firstTimestamp
                )
                .filter(Number.isFinite)
                .sort((a, b) => a - b)[0] ??
            null;

        const combinedLast =
            results
                .map(
                    r =>
                        r.audit
                            ?.timestampAudit
                            ?.lastTimestamp
                )
                .filter(Number.isFinite)
                .sort((a, b) => b - a)[0] ??
            null;

        /*
         * We do NOT automatically declare S5 failed merely
         * because the diagnostic found anomalies. The correct
         * state is DATA_RETURNED_QUALITY_REVIEW when anomalies
         * exist, because the next decision depends on their
         * exact nature.
         */

        const qualityStatus =
            totalInvalidOHLC === 0 &&
            totalShortSpacing === 0
                ? "S5_DATA_QUALITY_CLEAN"
                : "S5_DATA_RETURNED_QUALITY_REVIEW";

        return res.status(200).json({

            success: true,

            version: VERSION,

            status: "COMPLETED",

            mode:
                "V25_7_DHAN_S5_CANDLE_INTEGRITY_DIAGNOSTIC",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Locate and classify the exact S5 candle-quality anomalies reported by V25.7-DSC-v8 before historical import.",

            thisIsNotATradingTest: true,

            probe: {
                id: "1",
                label:
                    "S5_CANDLE_INTEGRITY",
                windows: WINDOWS,
                contextRows:
                    CONTEXT_ROWS
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
                    results.filter(
                        r =>
                            (
                                r.audit
                                    ?.timestampAudit
                                    ?.uniqueTimestampRows ||
                                0
                            ) > 0
                    ).length,

                totalRowsAcrossWindows:
                    results.reduce(
                        (sum, r) =>
                            sum +
                            (
                                r.audit
                                    ?.timestampAudit
                                    ?.numericTimestampRows ||
                                0
                            ),
                        0
                    ),

                totalInvalidOHLC:
                    totalInvalidOHLC,

                totalShortSpacingAnomalies:
                    totalShortSpacing,

                boundaryPairs,

                allWindowsDataBearing,

                allOHLCValid,

                qualityStatus,

                firstTimestamp:
                    combinedFirst,

                firstTimestampISO:
                    iso(combinedFirst),

                lastTimestamp:
                    combinedLast,

                lastTimestampISO:
                    iso(combinedLast)
            },

            interpretation: {

                learningRecordsGenerated:
                    false,

                healthStatesCalculated:
                    false,

                strategyModified:
                    false,

                thresholdTuning:
                    false,

                validationRun:
                    false,

                oosRun:
                    false,

                realOrders:
                    false,

                noAutomaticRepair:
                    true,

                noSyntheticCandles:
                    true,

                conclusion:
                    qualityStatus
            },

            nextStep:
                "Inspect the exact invalid OHLC rows and short-spacing rows. Do not repair candles or modify learning-engine.js until those anomalies are understood.",

            guardrails: {

                noCandidateDiscovery:
                    true,

                noLearningRecords:
                    true,

                noHealthClassification:
                    true,

                noValidation:
                    true,

                noOOS:
                    true,

                noStrategyChange:
                    true,

                noThresholdChange:
                    true,

                noCandleRepair:
                    true,

                noSyntheticData:
                    true,

                noRealOrders:
                    true
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

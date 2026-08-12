/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v10 — S5 Timestamp/OHLC Anomaly Classification
===========================================================

PURPOSE
-------
Classify the exact S5 data-quality anomalies found by
V25.7-DSC-v9 before any historical importer is built.

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
- create synthetic candles
- place orders

S5 WINDOWS
-----------
A: 2021-12-28 -> 2022-02-26
B: 2022-02-26 -> 2022-04-27
C: 2022-04-27 -> 2022-06-26

V10 CHECKS
----------
1. Exact OHLC violations.
2. Exact timestamp/grid anomalies.
3. Duplicate/non-monotonic timestamps.
4. Negative volume and other volume anomalies.
5. Candle-count and array-length integrity.
6. Whether anomalies are isolated or systemic.
7. Whether an anomaly is near a window boundary.
8. Deterministic classification only — no repairs.

CLASSIFICATION
--------------
OHLC:
- OHLC_VALID
- OHLC_INVALID_HIGH_LOW
- OHLC_INVALID_RANGE
- OHLC_NONFINITE

TIMESTAMP:
- TIMESTAMP_GRID_ALIGNED
- TIMESTAMP_GRID_OFFSETS
- TIMESTAMP_NON_MONOTONIC
- TIMESTAMP_DUPLICATE

VOLUME:
- VOLUME_ZERO
- VOLUME_POSITIVE
- VOLUME_NEGATIVE
- VOLUME_NONFINITE

OVERALL:
- CLEAN
- ISOLATED_DATA_QUALITY_ISSUES
- MATERIAL_DATA_QUALITY_ISSUES

RUN
---
GET:
  /api/v25_7-dsc-v10?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v10";
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

    const CONTEXT_ROWS = 3;
    const EXPECTED_INTERVAL_SECONDS = 300;

    function finiteNumbers(value) {
        return Array.isArray(value)
            ? value.map(Number)
                .filter(Number.isFinite)
            : [];
    }

    function rawNumbers(value) {
        return Array.isArray(value)
            ? value.map(Number)
            : [];
    }

    function toSeconds(value) {
        if (!Number.isFinite(value)) return null;
        return value < 100000000000
            ? value
            : Math.floor(value / 1000);
    }

    function iso(value) {
        const seconds = toSeconds(value);
        return Number.isFinite(seconds)
            ? new Date(seconds * 1000).toISOString()
            : null;
    }

    function minuteOfDayUTC(timestamp) {
        const seconds = toSeconds(timestamp);
        if (!Number.isFinite(seconds)) return null;

        const d = new Date(seconds * 1000);
        return d.getUTCHours() * 60 + d.getUTCMinutes();
    }

    function gridOffsetMinutes(timestamp) {
        const minute = minuteOfDayUTC(timestamp);
        if (!Number.isFinite(minute)) return null;

        /*
         * Dhan's NIFTY examples are observed around 03:45 UTC
         * (09:15 IST). We evaluate the 5-minute grid relative
         * to the session's 03:45 UTC anchor.
         */
        const anchor = 3 * 60 + 45;
        return ((minute - anchor) % 5 + 5) % 5;
    }

    function classifyOHLC(o, h, l, c) {
        if (
            !Number.isFinite(o) ||
            !Number.isFinite(h) ||
            !Number.isFinite(l) ||
            !Number.isFinite(c)
        ) {
            return {
                valid: false,
                classification: "OHLC_NONFINITE"
            };
        }

        if (h < l) {
            return {
                valid: false,
                classification: "OHLC_INVALID_RANGE"
            };
        }

        if (h < Math.max(o, c) || l > Math.min(o, c)) {
            return {
                valid: false,
                classification: "OHLC_INVALID_HIGH_LOW"
            };
        }

        return {
            valid: true,
            classification: "OHLC_VALID"
        };
    }

    function classifyVolume(v) {
        if (!Number.isFinite(v)) {
            return "VOLUME_NONFINITE";
        }

        if (v < 0) return "VOLUME_NEGATIVE";
        if (v === 0) return "VOLUME_ZERO";

        return "VOLUME_POSITIVE";
    }

    function buildRow(
        i,
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        role = "CONTEXT"
    ) {
        const ohlc = classifyOHLC(
            open,
            high,
            low,
            close
        );

        return {
            index: i,
            role,
            timestamp,
            timestampISO: iso(timestamp),
            open,
            high,
            low,
            close,
            volume,
            ohlcClassification:
                ohlc.classification,
            volumeClassification:
                classifyVolume(volume),
            gridOffsetMinutes:
                gridOffsetMinutes(timestamp)
        };
    }

    function auditWindow(payload) {

        const timestampRaw = rawNumbers(payload?.timestamp);
        const openRaw = rawNumbers(payload?.open);
        const highRaw = rawNumbers(payload?.high);
        const lowRaw = rawNumbers(payload?.low);
        const closeRaw = rawNumbers(payload?.close);
        const volumeRaw = rawNumbers(payload?.volume);

        const rowCount = Math.min(
            timestampRaw.length,
            openRaw.length,
            highRaw.length,
            lowRaw.length,
            closeRaw.length
        );

        const invalidOHLC = [];
        const negativeVolume = [];
        const nonFiniteVolume = [];
        const zeroVolume = [];

        const timestampDuplicateIndices = [];
        const timestampNonMonotonic = [];
        const timestampGridOffsets = [];
        const shortSpacing = [];
        const unusualSpacing = [];

        const seen = new Map();

        for (let i = 0; i < timestampRaw.length; i++) {

            const ts = toSeconds(timestampRaw[i]);

            if (!Number.isFinite(ts)) {
                timestampGridOffsets.push({
                    index: i,
                    timestamp: timestampRaw[i],
                    classification: "TIMESTAMP_NONFINITE"
                });
                continue;
            }

            if (seen.has(ts)) {
                timestampDuplicateIndices.push({
                    index: i,
                    previousIndex: seen.get(ts),
                    timestamp: ts,
                    timestampISO: iso(ts)
                });
            } else {
                seen.set(ts, i);
            }

            const offset = gridOffsetMinutes(ts);

            if (offset !== 0) {
                timestampGridOffsets.push({
                    index: i,
                    timestamp: ts,
                    timestampISO: iso(ts),
                    gridOffsetMinutes: offset,
                    classification: "TIMESTAMP_GRID_OFFSETS"
                });
            }

            const volume = volumeRaw[i];

            if (!Number.isFinite(volume)) {
                nonFiniteVolume.push(i);
            } else if (volume < 0) {
                negativeVolume.push(i);
            } else if (volume === 0) {
                zeroVolume.push(i);
            }

            if (i < rowCount) {
                const ohlc = classifyOHLC(
                    openRaw[i],
                    highRaw[i],
                    lowRaw[i],
                    closeRaw[i]
                );

                if (!ohlc.valid) {
                    invalidOHLC.push({
                        index: i,
                        timestamp: ts,
                        timestampISO: iso(ts),
                        open: openRaw[i],
                        high: highRaw[i],
                        low: lowRaw[i],
                        close: closeRaw[i],
                        classification:
                            ohlc.classification
                    });
                }
            }

            if (i > 0) {

                const previous =
                    toSeconds(timestampRaw[i - 1]);

                if (!Number.isFinite(previous)) {
                    continue;
                }

                const diff = ts - previous;

                if (diff <= 0) {
                    timestampNonMonotonic.push({
                        index: i,
                        previousIndex: i - 1,
                        previousTimestamp: previous,
                        previousTimestampISO: iso(previous),
                        timestamp: ts,
                        timestampISO: iso(ts),
                        gapSeconds: diff,
                        classification:
                            diff === 0
                                ? "TIMESTAMP_DUPLICATE"
                                : "TIMESTAMP_NON_MONOTONIC"
                    });
                } else if (diff < EXPECTED_INTERVAL_SECONDS) {
                    shortSpacing.push({
                        index: i,
                        previousIndex: i - 1,
                        previousTimestamp: previous,
                        previousTimestampISO: iso(previous),
                        timestamp: ts,
                        timestampISO: iso(ts),
                        gapSeconds: diff,
                        gapMinutes:
                            Number(
                                (diff / 60).toFixed(4)
                            ),
                        classification:
                            "SHORT_SPACING"
                    });
                } else if (
                    diff !== EXPECTED_INTERVAL_SECONDS &&
                    diff < 12 * 60 * 60
                ) {
                    unusualSpacing.push({
                        index: i,
                        previousIndex: i - 1,
                        previousTimestamp: previous,
                        previousTimestampISO: iso(previous),
                        timestamp: ts,
                        timestampISO: iso(ts),
                        gapSeconds: diff,
                        gapMinutes:
                            Number(
                                (diff / 60).toFixed(4)
                            ),
                        classification:
                            "NON_5MIN_POSITIVE_GAP"
                    });
                }
            }
        }

        const uniqueTimestampCount = seen.size;

        const chronological =
            timestampNonMonotonic.length === 0;

        const duplicateCount =
            timestampDuplicateIndices.length;

        const arrayLengthsEqual =
            timestampRaw.length === openRaw.length &&
            timestampRaw.length === highRaw.length &&
            timestampRaw.length === lowRaw.length &&
            timestampRaw.length === closeRaw.length &&
            timestampRaw.length === volumeRaw.length;

        const anomalyIndexSet = new Set();

        for (const x of invalidOHLC) {
            anomalyIndexSet.add(x.index);
        }

        for (const x of negativeVolume) {
            anomalyIndexSet.add(x);
        }

        for (const x of nonFiniteVolume) {
            anomalyIndexSet.add(x);
        }

        for (const x of timestampGridOffsets) {
            anomalyIndexSet.add(x.index);
        }

        for (const x of timestampNonMonotonic) {
            anomalyIndexSet.add(x.index);
        }

        for (const x of shortSpacing) {
            anomalyIndexSet.add(x.index);
        }

        const contextTargets = [
            ...invalidOHLC.map(x => ({
                index: x.index,
                reason: "INVALID_OHLC"
            })),

            ...negativeVolume.map(index => ({
                index,
                reason: "NEGATIVE_VOLUME"
            })),

            ...nonFiniteVolume.map(index => ({
                index,
                reason: "NONFINITE_VOLUME"
            })),

            ...timestampGridOffsets.map(x => ({
                index: x.index,
                reason: "TIMESTAMP_GRID_OFFSET"
            })),

            ...timestampNonMonotonic.map(x => ({
                index: x.index,
                reason: x.classification
            })),

            ...shortSpacing.map(x => ({
                index: x.index,
                reason: "SHORT_SPACING"
            }))
        ];

        /*
         * Keep the diagnostic bounded. Every anomaly receives
         * local context, but repeated classifications of the same
         * row are grouped into one context package.
         */
        const groupedTargets = new Map();

        for (const target of contextTargets) {

            if (!groupedTargets.has(target.index)) {
                groupedTargets.set(
                    target.index,
                    []
                );
            }

            groupedTargets
                .get(target.index)
                .push(target.reason);
        }

        const anomalyContext = [];

        for (const [index, reasons] of groupedTargets) {

            const start =
                Math.max(
                    0,
                    index - CONTEXT_ROWS
                );

            const end =
                Math.min(
                    rowCount - 1,
                    index + CONTEXT_ROWS
                );

            const rows = [];

            for (let j = start; j <= end; j++) {

                rows.push(
                    buildRow(
                        j,
                        timestampRaw[j],
                        openRaw[j],
                        highRaw[j],
                        lowRaw[j],
                        closeRaw[j],
                        volumeRaw[j],
                        j === index
                            ? "ANOMALY_TARGET"
                            : "CONTEXT"
                    )
                );
            }

            anomalyContext.push({
                targetIndex: index,
                reasons,
                contextRows: rows
            });
        }

        const allOHLCValid =
            rowCount > 0 &&
            invalidOHLC.length === 0;

        const noDuplicates =
            duplicateCount === 0;

        const noNonMonotonic =
            timestampNonMonotonic.length === 0;

        const noGridOffsets =
            timestampGridOffsets.length === 0;

        const noNegativeVolume =
            negativeVolume.length === 0;

        const noNonFiniteVolume =
            nonFiniteVolume.length === 0;

        const anomalyCount =
            invalidOHLC.length +
            duplicateCount +
            timestampNonMonotonic.length +
            timestampGridOffsets.length +
            negativeVolume.length +
            nonFiniteVolume.length +
            shortSpacing.length;

        return {
            rawArrayLengths: {
                timestamp: timestampRaw.length,
                open: openRaw.length,
                high: highRaw.length,
                low: lowRaw.length,
                close: closeRaw.length,
                volume: volumeRaw.length
            },

            arrayLengthsEqual,
            rowCount,

            timestampAudit: {
                numericTimestampRows:
                    timestampRaw.filter(
                        Number.isFinite
                    ).length,

                uniqueTimestampRows:
                    uniqueTimestampCount,

                duplicateTimestampRows:
                    duplicateCount,

                duplicateDetails:
                    timestampDuplicateIndices,

                nonMonotonicCount:
                    timestampNonMonotonic.length,

                nonMonotonicDetails:
                    timestampNonMonotonic,

                gridOffsetCount:
                    timestampGridOffsets.length,

                gridOffsetDetails:
                    timestampGridOffsets,

                chronological,

                firstTimestamp:
                    timestampRaw.length
                        ? toSeconds(
                            timestampRaw[0]
                        )
                        : null,

                firstTimestampISO:
                    timestampRaw.length
                        ? iso(timestampRaw[0])
                        : null,

                lastTimestamp:
                    timestampRaw.length
                        ? toSeconds(
                            timestampRaw[
                                timestampRaw.length - 1
                            ]
                        )
                        : null,

                lastTimestampISO:
                    timestampRaw.length
                        ? iso(
                            timestampRaw[
                                timestampRaw.length - 1
                            ]
                        )
                        : null
            },

            spacingAudit: {
                expectedIntervalSeconds:
                    EXPECTED_INTERVAL_SECONDS,

                shortSpacingCount:
                    shortSpacing.length,

                shortSpacingDetails:
                    shortSpacing,

                nonFiveMinutePositiveGapCount:
                    unusualSpacing.length,

                nonFiveMinutePositiveGapDetails:
                    unusualSpacing,

                totalPositiveNonSessionSpacing:
                    shortSpacing.length +
                    unusualSpacing.length
            },

            ohlcAudit: {
                checkedRows: rowCount,

                invalidCount:
                    invalidOHLC.length,

                invalidDetails:
                    invalidOHLC,

                allValid:
                    allOHLCValid
            },

            volumeAudit: {
                volumeRows:
                    volumeRaw.length,

                zeroVolumeRows:
                    zeroVolume.length,

                zeroVolumePct:
                    timestampRaw.length > 0
                        ? Number(
                            (
                                zeroVolume.length /
                                timestampRaw.length *
                                100
                            ).toFixed(2)
                        )
                        : null,

                negativeVolumeRows:
                    negativeVolume.length,

                negativeVolumeIndices:
                    negativeVolume,

                nonFiniteVolumeRows:
                    nonFiniteVolume.length,

                volumePreserved:
                    timestampRaw.length ===
                    volumeRaw.length
            },

            anomalyContext,

            deterministicClassification: {
                anomalyCount,
                arrayIntegrity:
                    arrayLengthsEqual
                        ? "PASS"
                        : "FAIL",

                timestampIntegrity:
                    noDuplicates &&
                    noNonMonotonic
                        ? "PASS"
                        : "FAIL",

                timestampGridIntegrity:
                    noGridOffsets
                        ? "PASS"
                        : "REVIEW",

                ohlcIntegrity:
                    allOHLCValid
                        ? "PASS"
                        : "REVIEW",

                volumeIntegrity:
                    noNegativeVolume &&
                    noNonFiniteVolume
                        ? "PASS"
                        : "REVIEW",

                overall:
                    anomalyCount === 0
                        ? "CLEAN"
                        : "ISSUES_FOUND"
            }
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
                    "V25.7-DSC-v10 uses GET only."
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

        const allWindowsDataBearing =
            results.every(
                result =>
                    result.http.ok &&
                    (
                        result.audit
                            ?.rowCount || 0
                    ) > 0
            );

        const totalRows =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.rowCount || 0
                    ),
                0
            );

        const totalInvalidOHLC =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.ohlcAudit
                            ?.invalidCount || 0
                    ),
                0
            );

        const totalShortSpacing =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.spacingAudit
                            ?.shortSpacingCount || 0
                    ),
                0
            );

        const totalGridOffsets =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.timestampAudit
                            ?.gridOffsetCount || 0
                    ),
                0
            );

        const totalNegativeVolume =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.volumeAudit
                            ?.negativeVolumeRows || 0
                    ),
                0
            );

        const totalNonFiniteVolume =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.volumeAudit
                            ?.nonFiniteVolumeRows || 0
                    ),
                0
            );

        const totalDuplicates =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.timestampAudit
                            ?.duplicateTimestampRows || 0
                    ),
                0
            );

        const totalNonMonotonic =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.timestampAudit
                            ?.nonMonotonicCount || 0
                    ),
                0
            );

        const materialIssues =
            totalInvalidOHLC > 0 ||
            totalNegativeVolume > 0 ||
            totalNonFiniteVolume > 0 ||
            totalDuplicates > 0 ||
            totalNonMonotonic > 0;

        const qualityStatus =
            !allWindowsDataBearing
                ? "S5_DATA_AVAILABILITY_FAILURE"
                : materialIssues
                    ? "S5_DATA_QUALITY_REQUIRES_REVIEW"
                    : (
                        totalShortSpacing === 0 &&
                        totalGridOffsets === 0
                    )
                        ? "S5_DATA_QUALITY_CLEAN"
                        : "S5_TIMESTAMP_REVIEW_REQUIRED";

        /*
         * V10 deliberately does not decide whether an invalid
         * candle should be removed. That decision belongs to the
         * importer policy after the source is understood.
         */
        const importerDecision =
            qualityStatus ===
                "S5_DATA_QUALITY_CLEAN"
                ? "IMPORTER_CAN_BE_DESIGNED"
                : "DO_NOT_IMPORT_YET";

        return res.status(200).json({

            success: true,

            version: VERSION,

            status: "COMPLETED",

            mode:
                "V25_7_DHAN_S5_TIMESTAMP_OHLC_ANOMALY_CLASSIFICATION",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Classify S5 timestamp, OHLC and volume anomalies before historical import.",

            thisIsNotATradingTest: true,

            probe: {
                id: "1",
                label:
                    "S5_TIMESTAMP_OHLC_VOLUME_CLASSIFICATION",
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
                                    ?.rowCount || 0
                            ) > 0
                    ).length,

                totalRowsAcrossWindows:
                    totalRows,

                totalInvalidOHLC:
                    totalInvalidOHLC,

                totalShortSpacingAnomalies:
                    totalShortSpacing,

                totalTimestampGridOffsets:
                    totalGridOffsets,

                totalNegativeVolumeRows:
                    totalNegativeVolume,

                totalNonFiniteVolumeRows:
                    totalNonFiniteVolume,

                totalDuplicateTimestamps:
                    totalDuplicates,

                totalNonMonotonicTimestamps:
                    totalNonMonotonic,

                allWindowsDataBearing,

                qualityStatus,

                importerDecision
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

                candleRepairPerformed:
                    false,

                syntheticCandlesCreated:
                    false,

                conclusion:
                    qualityStatus
            },

            nextStep:
                "Inspect the exact v10 anomaly classifications. If anomalies are isolated and deterministic, design a transparent importer policy; otherwise continue source-quality investigation. Do not modify learning-engine.js.",

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

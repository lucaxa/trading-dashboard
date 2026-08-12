/*
===========================================================
 TradeMind Pro
 V25.7-DSC v2 — Dhan 90-Day Historical Coverage Audit
===========================================================

PURPOSE
-------
Verify that DhanHQ can provide a LARGE, continuous historical
sample from the V25.7 S2-era period before any V25.7 import.

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

PROBE
-----
GET:
  /api/v25_7-dsc-v2?probe=1

The probe requests one 90-day window from the V25.7 S2-era
period that INDstocks could not provide.

Dhan v2 intraday request geometry:
- securityId: 13 (NIFTY 50 index)
- exchangeSegment: IDX_I
- instrument: INDEX
- interval: 5
- maximum requested span intentionally kept at 90 days

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN

The token must be configured in Vercel. Never put it in source.

AUDIT GOALS
-----------
1. HTTP success
2. Dhan response shape
3. total candle count
4. timestamp count
5. unique timestamps
6. duplicate timestamps
7. valid OHLC rows
8. chronological order
9. intra-session 5-minute spacing
10. first/last timestamp
11. trading-session day coverage
12. zero-volume preservation
13. whether the requested 90-day window appears materially
    covered

IMPORTANT
---------
No learning-engine logic is imported or executed.

A successful coverage audit does NOT authorize V25.7.
It only authorizes the next data-import test.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION =
        "V25.7-DSC-v2";

    const ENDPOINT =
        "https://api.dhan.co/v2/charts/intraday";

    const PROBES = {

        "1": {

            label:
                "S2_ERA_90D_COVERAGE",

            description:
                "90-day 5-minute NIFTY 50 historical coverage test inside the V25.7 S2-era period that INDstocks could not provide.",

            fromDate:
                "2023-10-01 00:00:00",

            toDate:
                "2023-12-30 00:00:00"
        }
    };

    function asNumberArray(value) {

        return Array.isArray(value)
            ? value
                .map(Number)
                .filter(Number.isFinite)
            : [];
    }

    function epochToISO(ts) {

        if (!Number.isFinite(ts)) {
            return null;
        }

        const ms =
            ts < 100000000000
                ? ts * 1000
                : ts;

        return new Date(ms).toISOString();
    }

    function auditPayload(payload) {

        const timestamps =
            asNumberArray(
                payload?.timestamp
            );

        const opens =
            asNumberArray(
                payload?.open
            );

        const highs =
            asNumberArray(
                payload?.high
            );

        const lows =
            asNumberArray(
                payload?.low
            );

        const closes =
            asNumberArray(
                payload?.close
            );

        const volumes =
            asNumberArray(
                payload?.volume
            );

        const rowCount =
            timestamps.length;

        const uniqueTimestamps =
            [...new Set(timestamps)]
                .sort(
                    (a, b) => a - b
                );

        const sorted =
            timestamps
                .slice()
                .sort(
                    (a, b) => a - b
                );

        let chronological =
            true;

        for (
            let i = 1;
            i < timestamps.length;
            i++
        ) {

            if (
                timestamps[i] <=
                timestamps[i - 1]
            ) {

                chronological =
                    false;

                break;
            }
        }

        let validOHLCRows =
            0;

        let invalidOHLCRows =
            0;

        let zeroVolumeRows =
            0;

        const preview =
            [];

        for (
            let i = 0;
            i < rowCount;
            i++
        ) {

            const o =
                opens[i];

            const h =
                highs[i];

            const l =
                lows[i];

            const c =
                closes[i];

            const v =
                volumes[i];

            const valid =
                Number.isFinite(o) &&
                Number.isFinite(h) &&
                Number.isFinite(l) &&
                Number.isFinite(c) &&
                h >= Math.max(o, c) &&
                l <= Math.min(o, c);

            if (valid) {
                validOHLCRows++;
            } else {
                invalidOHLCRows++;
            }

            if (
                Number.isFinite(v) &&
                v === 0
            ) {
                zeroVolumeRows++;
            }

            if (
                preview.length < 3
            ) {

                preview.push({
                    timestamp:
                        timestamps[i] ??
                        null,

                    timestampISO:
                        epochToISO(
                            timestamps[i]
                        ),

                    open:
                        Number.isFinite(o)
                            ? o
                            : null,

                    high:
                        Number.isFinite(h)
                            ? h
                            : null,

                    low:
                        Number.isFinite(l)
                            ? l
                            : null,

                    close:
                        Number.isFinite(c)
                            ? c
                            : null,

                    volume:
                        Number.isFinite(v)
                            ? v
                            : null
                });
            }
        }

        /*
         * Dhan returns market-session candles, so overnight and
         * weekend gaps are expected. We therefore inspect only
         * short internal gaps that should normally be 300 seconds.
         */
        let fiveMinuteViolations =
            0;

        let fiveMinuteIntervals =
            0;

        let overnightOrSessionGaps =
            0;

        for (
            let i = 1;
            i < uniqueTimestamps.length;
            i++
        ) {

            const diff =
                uniqueTimestamps[i] -
                uniqueTimestamps[i - 1];

            if (
                diff === 300
            ) {

                fiveMinuteIntervals++;

            } else if (
                diff > 0 &&
                diff < 12 * 60 * 60
            ) {

                fiveMinuteViolations++;

            } else {

                overnightOrSessionGaps++;
            }
        }

        const firstTimestamp =
            uniqueTimestamps[0] ??
            null;

        const lastTimestamp =
            uniqueTimestamps[
                uniqueTimestamps.length - 1
            ] ??
            null;

        const sessionDays =
            new Set(
                uniqueTimestamps.map(
                    ts =>
                        epochToISO(ts)
                            ?.slice(
                                0,
                                10
                            )
                )
            );

        const expectedStart =
            new Date(
                "2023-10-01T00:00:00Z"
            );

        const expectedEnd =
            new Date(
                "2023-12-30T00:00:00Z"
            );

        const actualStart =
            firstTimestamp === null
                ? null
                : new Date(
                    firstTimestamp *
                    1000
                );

        const actualEnd =
            lastTimestamp === null
                ? null
                : new Date(
                    lastTimestamp *
                    1000
                );

        const startsInsideOrAfterRequested =
            actualStart !== null &&
            actualStart >=
            expectedStart;

        const endsInsideOrBeforeRequested =
            actualEnd !== null &&
            actualEnd <=
            expectedEnd;

        return {

            responseShape: {

                topLevelKeys:
                    payload &&
                    typeof payload ===
                        "object"
                        ? Object.keys(
                            payload
                        )
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
                        key =>
                            Array.isArray(
                                payload?.[key]
                            )
                    )
            },

            candleArrays: {

                timestampRows:
                    timestamps.length,

                openRows:
                    opens.length,

                highRows:
                    highs.length,

                lowRows:
                    lows.length,

                closeRows:
                    closes.length,

                volumeRows:
                    volumes.length
            },

            timestampAudit: {

                numericTimestampRows:
                    timestamps.length,

                uniqueTimestampRows:
                    uniqueTimestamps.length,

                duplicateTimestampRows:
                    timestamps.length -
                    uniqueTimestamps.length,

                chronological,

                firstTimestamp,

                firstTimestampISO:
                    epochToISO(
                        firstTimestamp
                    ),

                lastTimestamp,

                lastTimestampISO:
                    epochToISO(
                        lastTimestamp
                    )
            },

            ohlcAudit: {

                validOHLCRows,

                invalidOHLCRows,

                allOHLCValid:
                    rowCount > 0 &&
                    invalidOHLCRows === 0
            },

            intervalAudit: {

                fiveMinuteIntervals,

                fiveMinuteViolations,

                overnightOrSessionGaps,

                noShortIntervalViolations:
                    fiveMinuteViolations ===
                    0
            },

            coverageAudit: {

                requestedStart:
                    "2023-10-01 00:00:00",

                requestedEnd:
                    "2023-12-30 00:00:00",

                requestedDays:
                    90,

                distinctCalendarDays:
                    sessionDays.size,

                startsInsideOrAfterRequested,

                endsInsideOrBeforeRequested,

                hasData:
                    uniqueTimestamps.length >
                    0,

                materiallyCovered:
                    uniqueTimestamps.length >
                    0 &&
                    validOHLCRows ===
                    rowCount &&
                    chronological &&
                    fiveMinuteViolations ===
                    0
            },

            volumeAudit: {

                volumeRows:
                    volumes.length,

                zeroVolumeRows,

                zeroVolumePct:
                    rowCount > 0
                        ? Number(
                            (
                                zeroVolumeRows /
                                rowCount *
                                100
                            ).toFixed(2)
                        )
                        : null,

                volumePreserved:
                    volumes.length ===
                    rowCount
            },

            previewRows:
                preview
        };
    }

    try {

        if (
            req.method !==
            "GET"
        ) {

            return res.status(405).json({

                success:
                    false,

                version:
                    VERSION,

                status:
                    "METHOD_NOT_ALLOWED",

                paperOnly:
                    true,

                realOrders:
                    false,

                error:
                    "V25.7-DSC-v2 uses GET only."
            });
        }

        const accessToken =
            (
                process.env.DHAN_ACCESS_TOKEN ||
                ""
            ).trim();

        if (
            !accessToken
        ) {

            return res.status(500).json({

                success:
                    false,

                version:
                    VERSION,

                status:
                    "CONFIG_ERROR",

                paperOnly:
                    true,

                realOrders:
                    false,

                error:
                    "DHAN_ACCESS_TOKEN is not configured."
            });
        }

        const probeId =
            String(
                req.query?.probe ||
                "1"
            );

        const probe =
            PROBES[
                probeId
            ];

        if (
            !probe
        ) {

            return res.status(400).json({

                success:
                    false,

                version:
                    VERSION,

                status:
                    "INVALID_PROBE",

                availableProbes:
                    Object.keys(
                        PROBES
                    ),

                error:
                    "Use probe=1."
            });
        }

        const requestBody = {

            securityId:
                "13",

            exchangeSegment:
                "IDX_I",

            instrument:
                "INDEX",

            interval:
                "5",

            oi:
                false,

            fromDate:
                probe.fromDate,

            toDate:
                probe.toDate
        };

        const response =
            await fetch(
                ENDPOINT,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json",

                        "access-token":
                            accessToken
                    },

                    body:
                        JSON.stringify(
                            requestBody
                        )
                }
            );

        const rawText =
            await response.text();

        let payload =
            null;

        let parseStatus =
            "NOT_JSON";

        try {

            payload =
                JSON.parse(
                    rawText
                );

            parseStatus =
                "JSON";

        } catch {

            payload =
                null;
        }

        const audit =
            payload &&
            typeof payload ===
                "object"
                ? auditPayload(
                    payload
                )
                : null;

        const dataReturned =
            audit &&
            audit.timestampAudit
                .uniqueTimestampRows >
            0;

        const coveragePassed =
            Boolean(
                audit?.coverageAudit
                    ?.materiallyCovered
            );

        return res.status(200).json({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_DHAN_90D_COVERAGE_AUDIT",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            purpose:
                "Determine whether Dhan can provide a large, chronologically usable S2-era historical sample before any V25.7 import.",

            thisIsNotATradingTest:
                true,

            probe: {

                id:
                    probeId,

                label:
                    probe.label,

                description:
                    probe.description,

                fromDate:
                    probe.fromDate,

                toDate:
                    probe.toDate
            },

            request: {

                endpoint:
                    ENDPOINT,

                method:
                    "POST",

                securityId:
                    "13",

                exchangeSegment:
                    "IDX_I",

                instrument:
                    "INDEX",

                interval:
                    "5",

                oi:
                    false
            },

            http: {

                status:
                    response.status,

                ok:
                    response.ok,

                contentType:
                    response.headers.get(
                        "content-type"
                    ),

                parseStatus
            },

            audit,

            compatibility: {

                status:
                    dataReturned
                        ? (
                            coveragePassed
                                ? "90D_COVERAGE_DATA_RETURNED"
                                : "DATA_RETURNED_BUT_COVERAGE_REQUIRES_REVIEW"
                        )
                        : "NO_DATA_RETURNED",

                historicalDataReturned:
                    dataReturned,

                materiallyCovered:
                    coveragePassed,

                enoughToProceed:
                    false,

                reason:
                    "This audit establishes historical candle coverage only. It does not generate V25.7 learning records or authorize the V25.7 confirmation run."
            },

            comparisonTarget: {

                INDSTOCKS_S2:
                    "CANDLES_NULL",

                DHAN_PROBE_1:
                    "228_VALID_5MIN_CANDLES",

                requiredV25_7Protocol: {

                    segments:
                        5,

                    segmentDays:
                        180,

                    totalResearchDays:
                        900,

                    priorRecords:
                        40,

                    forwardRecords:
                        20,

                    recordsPerBlock:
                        60,

                    targetIndependentBlocks:
                        5,

                    targetUsableSELLRecords:
                        300
                }
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

                conclusion:
                    dataReturned
                        ? (
                            coveragePassed
                                ? "DHAN_90D_HISTORICAL_COVERAGE_CONFIRMED"
                                : "DHAN_DATA_RETURNED_REQUIRES_COVERAGE_REVIEW"
                        )
                        : "DHAN_HISTORICAL_DATA_NOT_RETURNED"
            },

            nextStep:
                "Inspect this 90-day coverage result before building any historical importer. Do not modify learning-engine.js.",

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

                noRealOrders:
                    true
            }
        });

    } catch (
        error
    ) {

        return res.status(500).json({

            success:
                false,

            version:
                VERSION,

            status:
                "ERROR",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            error:
                error?.message ||
                String(
                    error
                )
        });
    }
}

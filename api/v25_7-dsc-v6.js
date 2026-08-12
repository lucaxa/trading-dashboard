/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v6 — Dhan S3 Exact Boundary Audit
===========================================================

PURPOSE
-------
Verify the two small historical boundary areas surrounding
the exact V25.7 Segment 3 range before S3 is marked fully
data-source cleared.

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

WHY THIS AUDIT
--------------
V25.7-DSC-v5 established strong S3 coverage for:

  2023-01-01 -> 2023-06-28

The original V25.7 S3 invocation used timestamps approximately
covering:

  2022-12-31 -> 2023-06-29

Therefore this audit checks the two small edge areas that were
not explicitly covered by v5:

  EDGE A:
    2022-12-31 -> 2023-01-01

  EDGE B:
    2023-06-28 -> 2023-06-29

These are deliberately short controls, not a new trading test.

RUN
---
GET:
  /api/v25_7-dsc-v6?probe=1

ENVIRONMENT
-----------
DHAN_ACCESS_TOKEN

The token must be configured in Vercel. Never put it in source.

AUDIT GOALS
-----------
1. HTTP status and JSON validity per edge.
2. Dhan response shape.
3. Candle counts.
4. Timestamp integrity.
5. OHLC validity.
6. 5-minute spacing.
7. First/last actual candle.
8. Session/calendar-day presence.
9. Zero-volume preservation.
10. Whether both exact S3 boundary edges are available.

IMPORTANT
---------
This does not import anything into V25.7.
A positive result only clears the data-source boundary.
It does not authorize learning confirmation.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v6";

    const ENDPOINT =
        "https://api.dhan.co/v2/charts/intraday";

    const PROBES = {
        "1": {
            id: "1",
            label: "S3_EXACT_BOUNDARY_EDGES",
            description:
                "Small Dhan controls immediately outside the v5 S3 coverage window to verify the original V25.7 S3 boundary.",
            edges: [
                {
                    id: "A",
                    label: "S3_PRE_START_EDGE",
                    fromDate: "2022-12-31 00:00:00",
                    toDate: "2023-01-01 00:00:00"
                },
                {
                    id: "B",
                    label: "S3_POST_END_EDGE",
                    fromDate: "2023-06-28 00:00:00",
                    toDate: "2023-06-29 00:00:00"
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
            ts < 100000000000
                ? ts * 1000
                : ts
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

            const diff =
                unique[i] - unique[i - 1];

            if (diff === 300) {
                fiveMinuteIntervals++;
            } else if (
                diff > 0 &&
                diff < 12 * 60 * 60
            ) {
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
                    payload &&
                    typeof payload === "object"
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
                        key =>
                            Array.isArray(
                                payload?.[key]
                            )
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
                numericTimestampRows:
                    timestamp.length,

                uniqueTimestampRows:
                    unique.length,

                duplicateTimestampRows:
                    timestamp.length -
                    unique.length,

                chronological,

                firstTimestamp:
                    unique[0] ?? null,

                firstTimestampISO:
                    iso(unique[0]),

                lastTimestamp:
                    unique[unique.length - 1] ??
                    null,

                lastTimestampISO:
                    iso(
                        unique[
                            unique.length - 1
                        ]
                    )
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
                    volume.length ===
                    timestamp.length
            }
        };
    }

    async function fetchEdge(
        accessToken,
        edge
    ) {

        const body = {
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            oi: false,
            fromDate: edge.fromDate,
            toDate: edge.toDate
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
                        accessToken
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
            payload =
                JSON.parse(rawText);

            parseStatus = "JSON";

        } catch {
            payload = null;
        }

        const audit =
            payload &&
            typeof payload === "object"
                ? auditPayload(payload)
                : null;

        return {

            edge,

            request: body,

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

            rawResponsePreview:
                audit
                    ? null
                    : rawText
                        .replace(/\s+/g, " ")
                        .slice(0, 1000)
        };
    }

    try {

        if (req.method !== "GET") {

            return res.status(405).json({

                success: false,

                version: VERSION,

                status:
                    "METHOD_NOT_ALLOWED",

                paperOnly: true,

                realOrders: false,

                error:
                    "V25.7-DSC-v6 uses GET only."
            });
        }

        const token =
            (
                process.env
                    .DHAN_ACCESS_TOKEN ||
                ""
            ).trim();

        if (!token) {

            return res.status(500).json({

                success: false,

                version: VERSION,

                status:
                    "CONFIG_ERROR",

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

        const probe =
            PROBES[probeId];

        if (!probe) {

            return res.status(400).json({

                success: false,

                version: VERSION,

                status:
                    "INVALID_PROBE",

                availableProbes:
                    Object.keys(PROBES),

                error:
                    "Use probe=1."
            });
        }

        const results = [];

        for (
            const edge of probe.edges
        ) {

            results.push(
                await fetchEdge(
                    token,
                    edge
                )
            );
        }

        const dataBearingEdges =
            results.filter(
                result =>
                    result.http.ok &&
                    result.audit
                        ?.timestampAudit
                        ?.uniqueTimestampRows > 0
            );

        const allEdgesDataBearing =
            dataBearingEdges.length ===
            results.length;

        const allOHLCValid =
            results.every(
                result =>
                    result.audit
                        ?.ohlcAudit
                        ?.allOHLCValid === true
            );

        const noSpacingProblems =
            results.every(
                result =>
                    result.audit
                        ?.intervalAudit
                        ?.noShortIntervalViolations === true
            );

        const totalRows =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.timestampAudit
                            ?.numericTimestampRows ||
                        0
                    ),
                0
            );

        const totalUniqueRows =
            results.reduce(
                (sum, result) =>
                    sum +
                    (
                        result.audit
                            ?.timestampAudit
                            ?.uniqueTimestampRows ||
                        0
                    ),
                0
            );

        const materiallyCovered =
            allEdgesDataBearing &&
            allOHLCValid &&
            noSpacingProblems;

        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_DHAN_S3_EXACT_BOUNDARY_AUDIT",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Verify the exact historical edge areas surrounding the original V25.7 Segment 3 period before clearing S3 data-source compatibility.",

            thisIsNotATradingTest: true,

            probe: {
                id: probe.id,
                label: probe.label,
                description:
                    probe.description,

                edges:
                    probe.edges
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

            edgeResults:
                results,

            combinedAudit: {

                edgesRequested:
                    results.length,

                edgesWithData:
                    dataBearingEdges.length,

                totalRows:
                    totalRows,

                totalUniqueRows:
                    totalUniqueRows,

                allEdgesDataBearing,

                allOHLCValid,

                noShortSpacingViolations:
                    noSpacingProblems,

                materiallyCovered
            },

            comparisonTarget: {

                V25_7_S3:
                    "ORIGINAL_APPROXIMATE_RANGE_2022_12_31_TO_2023_06_29",

                DSC_V5:
                    "MAIN_S3_COVERAGE_CONFIRMED",

                requiredV25_7Protocol: {

                    segments: 5,

                    segmentDays: 180,

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

            compatibility: {

                status:
                    materiallyCovered
                        ? "S3_BOUNDARY_CONTROLS_CONFIRMED"
                        : "S3_BOUNDARY_CONTROLS_REQUIRE_REVIEW",

                historicalDataReturned:
                    allEdgesDataBearing,

                materiallyCovered,

                enoughToProceed:
                    false,

                reason:
                    "This audit establishes boundary data availability only. It does not generate V25.7 learning records or authorize the V25.7 confirmation run."
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
                    materiallyCovered
                        ? "DHAN_S3_BOUNDARY_AVAILABILITY_CONFIRMED"
                        : "DHAN_S3_BOUNDARY_AVAILABILITY_NOT_CONFIRMED"
            },

            nextStep:
                "Inspect both S3 boundary controls. If both are usable, S3 can be marked data-source cleared and the project can proceed to S4 coverage auditing. Do not modify learning-engine.js.",

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

    } catch (error) {

        return res.status(500).json({

            success: false,

            version: VERSION,

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
                String(error)
        });
    }
}

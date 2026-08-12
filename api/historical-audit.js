/*
===========================================================
TradeMind Pro
V25.7-HDA v2 — HISTORICAL DATA AVAILABILITY AUDIT
===========================================================

PURPOSE
-------
Determine whether the zero-candle results seen in V25.7
Segments 2 and 3 are a genuine historical-data boundary
or a request-geometry/API issue.

THIS IS A DATA AUDIT ONLY.

It does NOT:
- generate learning records
- discover candidates
- classify HEALTHY/DECAYING
- validate trades
- run OOS
- modify strategy
- tune thresholds
- place orders

IMPORTANT
---------
The previous HDA probes used 14-day windows. That was not
a valid control because the existing TradeMind historical
loader enforces a minimum request window of 30 days.

V2 therefore uses 31-DAY probe windows.

It also mirrors the existing historical API request:
- NIFTY 50
- NIDX_40000001
- 5minute
- INDSTOCKS_API_BASE
- INDSTOCKS_TOKEN / INDSTOCKS_ACCESS_TOKEN
- 7-day chunks
- serialized requests
- 429 retry handling

PROBES
------
probe=1
Known-good S1 interior control.

probe=2
S2 interior.

probe=3
S3 interior.

probe=4
S1/S2 boundary control.

probe=5
S3 older control.

Run probe=1 first.
Do not run all probes simultaneously.
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-HDA-v2";

    const INSTRUMENT = "NIFTY 50";
    const SCRIP_CODE = "NIDX_40000001";
    const INTERVAL = "5minute";

    const API_BASE =
        process.env.INDSTOCKS_API_BASE ||
        "https://api.indstocks.com";

    const MIN_PROBE_DAYS = 31;

    const DAY_MS =
        24 *
        60 *
        60 *
        1000;

    const CHUNK_MS =
        7 *
        DAY_MS;

    const INTER_CHUNK_DELAY_MS = 250;
    const MAX_429_RETRIES = 5;
    const BASE_429_DELAY_MS = 2000;

    /*
     * Exact chronological boundaries reported by the
     * V25.7 S1/S2/S3 runs.
     */
    const S1_START_MS = 1703605271190;
    const S1_END_MS   = 1719157271190;

    const S2_START_MS = 1688053691134;
    const S2_END_MS   = 1703605691134;

    const S3_START_MS = 1672501861964;
    const S3_END_MS   = 1688053861964;

    function sleep(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    /*
     * Build a 31-day window ending safely inside a supplied
     * segment. This avoids crossing the segment boundary.
     */
    function interiorWindow(
        segmentStart,
        segmentEnd
    ) {

        const span =
            segmentEnd -
            segmentStart;

        const minimumSpan =
            MIN_PROBE_DAYS *
            DAY_MS;

        if (
            span <=
            minimumSpan
        ) {
            throw new Error(
                "Segment is too short for a 31-day interior probe."
            );
        }

        const margin =
            Math.floor(
                (span -
                    minimumSpan) /
                2
            );

        const start =
            segmentStart +
            margin;

        const end =
            start +
            minimumSpan -
            1000;

        return {
            startMs: start,
            endMs: end
        };
    }

    const S1_CONTROL =
        interiorWindow(
            S1_START_MS,
            S1_END_MS
        );

    const S2_CONTROL =
        interiorWindow(
            S2_START_MS,
            S2_END_MS
        );

    const S3_CONTROL =
        interiorWindow(
            S3_START_MS,
            S3_END_MS
        );

    /*
     * A boundary probe must also be >=31 days.
     * It is centered around the S1/S2 boundary while staying
     * entirely within the combined S2+S1 range.
     */
    const boundaryCenter =
        S2_END_MS;

    const BOUNDARY_PROBE = {
        startMs:
            boundaryCenter -
            Math.floor(
                (MIN_PROBE_DAYS *
                    DAY_MS) /
                2
            ),

        endMs:
            boundaryCenter +
            Math.floor(
                (MIN_PROBE_DAYS *
                    DAY_MS) /
                2
            )
    };

    const PROBES = {

        "1": {
            label:
                "S1_INTERIOR_CONTROL_31D",

            description:
                "31-day control fully inside the V25.7 Segment 1 period that returned 8778 candles.",

            ...S1_CONTROL
        },

        "2": {
            label:
                "S2_INTERIOR_31D",

            description:
                "31-day probe fully inside V25.7 Segment 2, which previously returned zero candles.",

            ...S2_CONTROL
        },

        "3": {
            label:
                "S3_INTERIOR_31D",

            description:
                "31-day probe fully inside V25.7 Segment 3, which previously returned zero candles.",

            ...S3_CONTROL
        },

        "4": {
            label:
                "S1_S2_BOUNDARY_31D",

            description:
                "31-day probe centered around the S1/S2 chronological boundary.",

            ...BOUNDARY_PROBE
        },

        "5": {
            label:
                "S3_OLDER_CONTROL_31D",

            description:
                "31-day probe inside the older S3 historical period.",

            startMs:
                S3_START_MS +
                20 *
                DAY_MS,

            endMs:
                S3_START_MS +
                51 *
                DAY_MS -
                1000
        }
    };

    function extractRows(payload) {

        const candidates = [
            payload?.data,
            payload?.data?.data,
            payload?.data?.candles,
            payload?.data?.rows,
            payload?.data?.result,
            payload?.candles,
            payload?.rows,
            payload?.result,
            payload?.result?.data,
            payload?.result?.candles,
            payload?.result?.rows
        ];

        for (
            const candidate
            of candidates
        ) {

            if (
                Array.isArray(candidate)
            ) {
                return candidate;
            }
        }

        return [];
    }

    function timestampOf(row) {

        if (
            Array.isArray(row)
        ) {
            return Number(row[0]);
        }

        if (
            row &&
            typeof row === "object"
        ) {

            return Number(
                row.ts ??
                row.timestamp ??
                row.time ??
                row.t
            );
        }

        return NaN;
    }

    function auditRows(rows) {

        const timestamps =
            rows
                .map(timestampOf)
                .filter(
                    Number.isFinite
                )
                .sort(
                    (a, b) =>
                        a - b
                );

        const unique =
            [
                ...new Set(
                    timestamps
                )
            ];

        return {

            timestampedRows:
                timestamps.length,

            uniqueTimestampedRows:
                unique.length,

            duplicateTimestampRows:
                timestamps.length -
                unique.length,

            firstTimestamp:
                unique[0] ??
                null,

            lastTimestamp:
                unique[
                    unique.length - 1
                ] ??
                null
        };
    }

    async function fetchChunk(
        accessToken,
        startMs,
        endMs
    ) {

        const url =
            `${API_BASE}/market/historical/${INTERVAL}` +
            `?scrip-codes=${encodeURIComponent(
                SCRIP_CODE
            )}` +
            `&start_time=${startMs}` +
            `&end_time=${endMs}`;

        const response =
            await fetch(
                url,
                {
                    method: "GET",
                    headers: {
                        Authorization:
                            accessToken,

                        "Content-Type":
                            "application/json"
                    }
                }
            );

        const text =
            await response.text();

        let payload;

        try {
            payload =
                JSON.parse(text);
        } catch {
            payload = {
                raw: text
            };
        }

        if (
            !response.ok
        ) {

            const error =
                new Error(
                    `INDstocks historical API failed: HTTP ${response.status} ${text}`
                );

            error.httpStatus =
                response.status;

            const retryAfter =
                Number(
                    response.headers.get(
                        "retry-after"
                    )
                );

            error.retryAfterMs =
                Number.isFinite(
                    retryAfter
                ) &&
                retryAfter > 0
                    ? retryAfter *
                      1000
                    : null;

            throw error;
        }

        return payload;
    }

    async function fetchRateLimitSafe(
        accessToken,
        chunk
    ) {

        let attempt = 0;

        while (true) {

            try {

                return await fetchChunk(
                    accessToken,
                    chunk.startMs,
                    chunk.endMs
                );

            } catch (error) {

                const status =
                    Number(
                        error?.httpStatus
                    );

                if (
                    status !== 429 ||
                    attempt >=
                        MAX_429_RETRIES
                ) {
                    throw error;
                }

                const retryAfter =
                    Number(
                        error?.retryAfterMs
                    );

                const delay =
                    Number.isFinite(
                        retryAfter
                    ) &&
                    retryAfter > 0
                        ? retryAfter
                        : BASE_429_DELAY_MS *
                          (
                              2 ** attempt
                          );

                attempt++;

                await sleep(
                    delay
                );
            }
        }
    }

    async function auditRange(
        accessToken,
        startMs,
        endMs
    ) {

        const chunks = [];

        let cursor =
            startMs;

        while (
            cursor <
            endMs
        ) {

            const chunkEnd =
                Math.min(
                    cursor +
                    CHUNK_MS -
                    1000,
                    endMs
                );

            chunks.push({
                startMs:
                    cursor,

                endMs:
                    chunkEnd
            });

            cursor =
                chunkEnd +
                1000;
        }

        const allRows = [];
        const chunkResults = [];

        for (
            let i = 0;
            i < chunks.length;
            i++
        ) {

            const chunk =
                chunks[i];

            const payload =
                await
                    fetchRateLimitSafe(
                        accessToken,
                        chunk
                    );

            const rows =
                extractRows(
                    payload
                );

            allRows.push(
                ...rows
            );

            chunkResults.push({

                chunk:
                    i + 1,

                startMs:
                    chunk.startMs,

                endMs:
                    chunk.endMs,

                rows:
                    rows.length,

                status:
                    rows.length > 0
                        ? "DATA_RETURNED"
                        : "EMPTY_RESPONSE"
            });

            if (
                i <
                chunks.length - 1
            ) {
                await sleep(
                    INTER_CHUNK_DELAY_MS
                );
            }
        }

        return {

            chunksRequested:
                chunks.length,

            rawRows:
                allRows.length,

            ...auditRows(
                allRows
            ),

            status:
                allRows.length > 0
                    ? "DATA_RETURNED"
                    : "NO_DATA_RETURNED",

            chunkResults
        };
    }

    try {

        if (
            req.method !==
            "GET"
        ) {

            return res.status(405).json({

                success: false,

                version: VERSION,

                status:
                    "METHOD_NOT_ALLOWED",

                paperOnly: true,

                realOrders: false,

                brokerOrderEnabled: false,

                brokerOrderSent: false,

                error:
                    "V25.7-HDA-v2 uses GET only."
            });
        }

        const accessToken =
            (
                process.env.INDSTOCKS_TOKEN ||
                process.env.INDSTOCKS_ACCESS_TOKEN ||
                ""
            ).trim();

        if (
            !accessToken
        ) {

            return res.status(500).json({

                success: false,

                version: VERSION,

                status:
                    "CONFIG_ERROR",

                paperOnly: true,

                realOrders: false,

                brokerOrderEnabled: false,

                brokerOrderSent: false,

                error:
                    "INDSTOCKS_TOKEN or INDSTOCKS_ACCESS_TOKEN is not configured."
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

                success: false,

                version: VERSION,

                status:
                    "INVALID_PROBE",

                availableProbes:
                    Object.keys(
                        PROBES
                    ),

                error:
                    "Use probe=1,2,3,4,or5."
            });
        }

        const requestedDays =
            (
                probe.endMs -
                probe.startMs
            ) /
            DAY_MS;

        if (
            requestedDays <
            MIN_PROBE_DAYS
        ) {

            return res.status(500).json({

                success: false,

                version: VERSION,

                status:
                    "INTERNAL_PROBE_CONFIGURATION_ERROR",

                requestedDays,

                minimumProbeDays:
                    MIN_PROBE_DAYS
            });
        }

        const audit =
            await auditRange(
                accessToken,
                probe.startMs,
                probe.endMs
            );

        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_HDA_31_DAY_CONTROL_AUDIT",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Determine whether the V25.7 S2/S3 zero-candle results represent a genuine historical-data boundary or an invalid request geometry.",

            instrument:
                INSTRUMENT,

            scripCode:
                SCRIP_CODE,

            interval:
                INTERVAL,

            requestGeometry: {

                minimumProbeDays:
                    MIN_PROBE_DAYS,

                actualProbeDays:
                    requestedDays,

                chunkDays:
                    7,

                serialized:
                    true
            },

            probe: {

                id:
                    probeId,

                label:
                    probe.label,

                description:
                    probe.description,

                rangeStartMs:
                    probe.startMs,

                rangeEndMs:
                    probe.endMs
            },

            audit,

            interpretation: {

                thisIsNotATradingTest:
                    true,

                learningRecordsGenerated:
                    false,

                healthStatesCalculated:
                    false,

                strategyModified:
                    false,

                thresholdTuning:
                    false,

                conclusion:
                    audit.rawRows > 0
                        ? "HISTORICAL_DATA_PRESENT"
                        : "HISTORICAL_DATA_NOT_RETURNED"
            },

            nextStep:
                "Run probe 1 first. If the known-good S1 control returns candles, run probe 2 and probe 3 to test S2/S3 availability.",

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

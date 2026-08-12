/*
===========================================================
TradeMind Pro
V25.7-RD — V25.7 RANGE DIAGNOSTIC
===========================================================

PURPOSE
-------
Diagnose the ACTUAL historical-data fetch path used by the
deployed V25.7 engine.

This endpoint is diagnostic only.

It does NOT:
- create candidates
- create learning records
- classify HEALTHY / DECAYING
- validate trades
- run OOS
- modify thresholds
- modify strategy mechanics
- place orders

WHY THIS EXISTS
---------------
V25.7 Segment 1 successfully reported historical candles,
while Segments 2 and 3 reported zero candles.

Separate HDA endpoints failed to reproduce Segment 1, so
we must inspect the actual request/response path directly.

This diagnostic exposes, for every historical chunk:
- requested start/end
- HTTP status
- response content type
- top-level response keys
- whether the response is JSON
- extracted row count
- first/last extracted timestamp
- response preview when no rows are extracted

It does NOT replace V25.7 learning-engine.js.

DEPLOY
------
api/v25_7-range-diagnostic.js

RUN
---
/api/v25_7-range-diagnostic?segment=1

Then, only after inspecting Segment 1:
segment=2
segment=3

The segment ranges below are the exact ranges reported by
the V25.7 S1/S2/S3 results supplied in this project.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-RD";

    const INSTRUMENT = "NIFTY 50";
    const SCRIP_CODE = "NIDX_40000001";
    const INTERVAL = "5minute";

    const API_BASE =
        process.env.INDSTOCKS_API_BASE ||
        "https://api.indstocks.com";

    const CHUNK_MS =
        7 *
        24 *
        60 *
        60 *
        1000;

    const INTER_CHUNK_DELAY_MS = 250;
    const MAX_429_RETRIES = 5;
    const BASE_429_DELAY_MS = 2000;

    const SEGMENTS = {

        "1": {
            label:
                "V25_7_S1_EXACT_RANGE",

            startMs:
                1703605271190,

            endMs:
                1719157271190
        },

        "2": {
            label:
                "V25_7_S2_EXACT_RANGE",

            startMs:
                1688053691134,

            endMs:
                1703605691134
        },

        "3": {
            label:
                "V25_7_S3_EXACT_RANGE",

            startMs:
                1672501861964,

            endMs:
                1688053861964
        }
    };

    function sleep(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    function getTimestamp(row) {

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

    /*
     * This extractor deliberately reports which response
     * shape was used instead of silently assuming one shape.
     */
    function extractRowsWithShape(payload) {

        const paths = [
            ["data", payload?.data],
            ["data.data", payload?.data?.data],
            ["data.candles", payload?.data?.candles],
            ["data.rows", payload?.data?.rows],
            ["data.result", payload?.data?.result],
            ["candles", payload?.candles],
            ["rows", payload?.rows],
            ["result", payload?.result],
            ["result.data", payload?.result?.data],
            ["result.candles", payload?.result?.candles],
            ["result.rows", payload?.result?.rows]
        ];

        for (
            const [path, value]
            of paths
        ) {

            if (
                Array.isArray(value)
            ) {

                return {
                    rows: value,
                    shape: path
                };
            }
        }

        /*
         * Conservative fallback: inspect direct object values.
         */
        if (
            payload &&
            typeof payload === "object"
        ) {

            for (
                const [
                    key,
                    value
                ]
                of Object.entries(
                    payload
                )
            ) {

                if (
                    !Array.isArray(value) ||
                    value.length === 0
                ) {
                    continue;
                }

                const first =
                    value[0];

                if (
                    Array.isArray(first) &&
                    first.length >= 5
                ) {

                    return {
                        rows: value,
                        shape:
                            `fallback.${key}`
                    };
                }

                if (
                    first &&
                    typeof first === "object" &&
                    (
                        "ts" in first ||
                        "timestamp" in first ||
                        "time" in first ||
                        "t" in first
                    )
                ) {

                    return {
                        rows: value,
                        shape:
                            `fallback.${key}`
                    };
                }
            }
        }

        return {
            rows: [],
            shape: null
        };
    }

    function safePreview(text) {

        if (
            typeof text !== "string"
        ) {
            return null;
        }

        const compact =
            text
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();

        if (
            compact.length <= 500
        ) {
            return compact;
        }

        return (
            compact.slice(
                0,
                500
            ) +
            "..."
        );
    }

    async function fetchDiagnosticChunk(
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

        const contentType =
            response.headers.get(
                "content-type"
            );

        const text =
            await response.text();

        let payload = null;
        let parseStatus =
            "NOT_JSON";

        try {

            payload =
                JSON.parse(text);

            parseStatus =
                "JSON";

        } catch {
            payload = null;
        }

        const payloadKeys =
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload)
                ? Object.keys(
                    payload
                )
                : [];

        const extracted =
            payload
                ? extractRowsWithShape(
                    payload
                )
                : {
                    rows: [],
                    shape: null
                };

        const rows =
            extracted.rows;

        const timestamps =
            rows
                .map(
                    getTimestamp
                )
                .filter(
                    Number.isFinite
                )
                .sort(
                    (a, b) =>
                        a - b
                );

        const uniqueTimestamps =
            [
                ...new Set(
                    timestamps
                )
            ];

        return {

            request: {
                startMs,
                endMs
            },

            http: {

                status:
                    response.status,

                ok:
                    response.ok,

                contentType,

                parseStatus
            },

            response: {

                payloadKeys,

                payloadIsArray:
                    Array.isArray(
                        payload
                    ),

                extractedShape:
                    extracted.shape,

                extractedRows:
                    rows.length,

                timestampedRows:
                    timestamps.length,

                uniqueTimestampedRows:
                    uniqueTimestamps.length,

                firstTimestamp:
                    uniqueTimestamps[0] ??
                    null,

                lastTimestamp:
                    uniqueTimestamps[
                        uniqueTimestamps.length - 1
                    ] ??
                    null,

                previewWhenNoRows:
                    rows.length === 0
                        ? safePreview(text)
                        : null
            }
        };
    }

    async function fetchWith429Retry(
        accessToken,
        startMs,
        endMs
    ) {

        let attempt = 0;

        while (true) {

            const result =
                await fetchDiagnosticChunk(
                    accessToken,
                    startMs,
                    endMs
                );

            if (
                result.http.status !==
                429
            ) {

                return {
                    result,
                    retryAttempts:
                        attempt
                };
            }

            if (
                attempt >=
                MAX_429_RETRIES
            ) {

                return {
                    result,
                    retryAttempts:
                        attempt
                };
            }

            const delay =
                BASE_429_DELAY_MS *
                (
                    2 ** attempt
                );

            attempt++;

            await sleep(
                delay
            );
        }
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

                error:
                    "V25.7-RD uses GET only."
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

                error:
                    "INDSTOCKS_TOKEN or INDSTOCKS_ACCESS_TOKEN is not configured."
            });
        }

        const segmentId =
            String(
                req.query?.segment ||
                "1"
            );

        const segment =
            SEGMENTS[
                segmentId
            ];

        if (
            !segment
        ) {

            return res.status(400).json({

                success: false,

                version: VERSION,

                status:
                    "INVALID_SEGMENT",

                availableSegments:
                    Object.keys(
                        SEGMENTS
                    ),

                error:
                    "Use segment=1,2,or3."
            });
        }

        const chunks = [];

        let cursor =
            segment.startMs;

        while (
            cursor <
            segment.endMs
        ) {

            const chunkEnd =
                Math.min(
                    cursor +
                    CHUNK_MS -
                    1000,
                    segment.endMs
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

        const chunkResults = [];

        for (
            let i = 0;
            i < chunks.length;
            i++
        ) {

            const chunk =
                chunks[i];

            const fetched =
                await
                    fetchWith429Retry(
                        accessToken,
                        chunk.startMs,
                        chunk.endMs
                    );

            chunkResults.push({

                chunk:
                    i + 1,

                retryAttempts:
                    fetched.retryAttempts,

                ...fetched.result
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

        const totalRows =
            chunkResults.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    (
                        item.response
                            ?.extractedRows ||
                        0
                    ),
                0
            );

        const chunksWithData =
            chunkResults.filter(
                item =>
                    (
                        item.response
                            ?.extractedRows ||
                        0
                    ) > 0
            ).length;

        const httpStatuses =
            [
                ...new Set(
                    chunkResults.map(
                        item =>
                            item.http.status
                    )
                )
            ];

        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_RANGE_DIAGNOSTIC",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Inspect the actual historical request/response path for the V25.7 S1/S2/S3 ranges without invoking learning or trading logic.",

            instrument:
                INSTRUMENT,

            scripCode:
                SCRIP_CODE,

            interval:
                INTERVAL,

            segment: {

                id:
                    segmentId,

                label:
                    segment.label,

                rangeStartMs:
                    segment.startMs,

                rangeEndMs:
                    segment.endMs,

                chunksRequested:
                    chunks.length
            },

            aggregate: {

                totalExtractedRows:
                    totalRows,

                chunksWithData,

                chunksEmpty:
                    chunks.length -
                    chunksWithData,

                httpStatuses
            },

            chunks:
                chunkResults,

            comparisonTarget:
                segmentId === "1"
                    ? {
                        expectedFromV25_7:
                            {
                                rawCandles:
                                    8778,
                                usableCandles:
                                    8777
                            },

                        instruction:
                            "Segment 1 is the known-good control. If this diagnostic does not reproduce data, compare its request/response details with the V25.7 engine before testing S2/S3."
                    }
                    : {
                        expectedFromV25_7:
                            {
                                rawCandles:
                                    0,
                                usableCandles:
                                    0
                            },

                        instruction:
                            "Do not interpret zero rows as strategy failure. This diagnostic only establishes the API response path."
                    },

            interpretation: {

                tradingTest:
                    false,

                learningRecordsGenerated:
                    false,

                healthStatesCalculated:
                    false,

                strategyModified:
                    false,

                thresholdTuning:
                    false,

                conclusion:
                    totalRows > 0
                        ? "HISTORICAL_ROWS_RETURNED"
                        : "NO_ROWS_EXTRACTED"
            },

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

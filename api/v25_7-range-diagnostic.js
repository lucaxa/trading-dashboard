/*
===========================================================
TradeMind Pro
V25.7-RD v2 — NESTED CANDLE RESPONSE DIAGNOSTIC
===========================================================

PURPOSE
-------
This is a DATA-LAYER diagnostic for the actual INDstocks
historical response structure observed in V25.7-RD.

ROOT CAUSE FOUND IN V25.7-RD:
-----------------------------
The API returns:

{
  "success": true,
  "data": {
    "NIDX_40000001": {
      "candles": [ ... ]
    }
  }
}

The previous diagnostic looked for data.candles / data.rows
and therefore reported zero rows even though candles existed.

V25.7-RD v2 explicitly reads:

  payload.data[SCRIP_CODE].candles

and reports the response shape.

THIS DOES NOT:
- run learning logic
- generate candidates
- create learning records
- classify health states
- validate trades
- run OOS
- modify strategy
- tune thresholds
- place orders

DEPLOY AS:
-----------
api/v25_7-range-diagnostic.js

RUN FIRST:
----------
/api/v25_7-range-diagnostic?segment=1

Do NOT run segment 2 or 3 until segment 1 is inspected.

SEGMENTS:
---------
1 = exact V25.7 S1 range
2 = exact V25.7 S2 range
3 = exact V25.7 S3 range

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-RD-v2";

    const INSTRUMENT = "NIFTY 50";
    const SCRIP_CODE = "NIDX_40000001";
    const INTERVAL = "5minute";

    const API_BASE =
        process.env.INDSTOCKS_API_BASE ||
        "https://api.indstocks.com";

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
     * Exact ranges reported by the V25.7 S1/S2/S3
     * results supplied in this project.
     */
    const SEGMENTS = {

        "1": {
            label:
                "V25_7_S1_EXACT_RANGE",

            startMs:
                1703605271190,

            endMs:
                1719157271190,

            expected:
                {
                    rawCandles:
                        8778,

                    usableCandles:
                        8777
                }
        },

        "2": {
            label:
                "V25_7_S2_EXACT_RANGE",

            startMs:
                1688053691134,

            endMs:
                1703605691134,

            expected:
                {
                    rawCandles:
                        0,

                    usableCandles:
                        0
                }
        },

        "3": {
            label:
                "V25_7_S3_EXACT_RANGE",

            startMs:
                1672501861964,

            endMs:
                1688053861964,

            expected:
                {
                    rawCandles:
                        0,

                    usableCandles:
                        0
                }
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

    function normalizeRows(
        rows
    ) {

        if (
            !Array.isArray(rows)
        ) {
            return [];
        }

        return rows;
    }

    /*
     * IMPORTANT:
     * This is the actual response path discovered in
     * V25.7-RD:
     *
     * payload.data[SCRIP_CODE].candles
     */
    function extractNestedCandles(
        payload
    ) {

        const instrumentData =
            payload?.data?.[
                SCRIP_CODE
            ];

        const candles =
            instrumentData?.candles;

        if (
            Array.isArray(candles)
        ) {

            return {
                rows:
                    normalizeRows(
                        candles
                    ),

                shape:
                    `data.${SCRIP_CODE}.candles`
            };
        }

        return {
            rows: [],
            shape: null
        };
    }

    function timestampOf(
        row
    ) {

        if (
            Array.isArray(row)
        ) {

            return Number(
                row[0]
            );
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

    function auditRows(
        rows
    ) {

        const timestamps =
            rows
                .map(
                    timestampOf
                )
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

            extractedRows:
                rows.length,

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

    function safePreview(
        text
    ) {

        if (
            typeof text !==
            "string"
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
            compact.length <=
            500
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

        let payload = null;

        let parseStatus =
            "NOT_JSON";

        try {

            payload =
                JSON.parse(
                    text
                );

            parseStatus =
                "JSON";

        } catch {
            payload = null;
        }

        const payloadKeys =
            payload &&
            typeof payload ===
                "object" &&
            !Array.isArray(
                payload
            )
                ? Object.keys(
                    payload
                )
                : [];

        const instrumentKeys =
            payload?.data &&
            typeof payload.data ===
                "object" &&
            !Array.isArray(
                payload.data
            )
                ? Object.keys(
                    payload.data
                )
                : [];

        const extracted =
            payload
                ? extractNestedCandles(
                    payload
                )
                : {
                    rows: [],
                    shape: null
                };

        const rowAudit =
            auditRows(
                extracted.rows
            );

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

                contentType:
                    response.headers.get(
                        "content-type"
                    ),

                parseStatus
            },

            response: {

                payloadKeys,

                instrumentKeys,

                expectedInstrumentPresent:
                    instrumentKeys.includes(
                        SCRIP_CODE
                    ),

                extractedShape:
                    extracted.shape,

                ...rowAudit,

                previewWhenNoRows:
                    extracted.rows.length ===
                    0
                        ? safePreview(
                            text
                        )
                        : null
            }
        };
    }

    async function fetchChunkRateLimitSafe(
        accessToken,
        startMs,
        endMs
    ) {

        let attempt = 0;

        while (
            true
        ) {

            const result =
                await fetchChunk(
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
                    "V25.7-RD v2 uses GET only."
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
                    fetchChunkRateLimitSafe(
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

        const totalExtractedRows =
            chunkResults.reduce(
                (
                    total,
                    chunk
                ) =>
                    total +
                    (
                        chunk.response
                            ?.extractedRows ||
                        0
                    ),
                0
            );

        const totalUniqueTimestampedRows =
            chunkResults.reduce(
                (
                    total,
                    chunk
                ) =>
                    total +
                    (
                        chunk.response
                            ?.uniqueTimestampedRows ||
                        0
                    ),
                0
            );

        const chunksWithData =
            chunkResults.filter(
                chunk =>
                    (
                        chunk.response
                            ?.extractedRows ||
                        0
                    ) > 0
            ).length;

        const chunksEmpty =
            chunks.length -
            chunksWithData;

        const httpStatuses =
            [
                ...new Set(
                    chunkResults.map(
                        chunk =>
                            chunk.http
                                .status
                    )
                )
            ];

        const shapes =
            [
                ...new Set(
                    chunkResults
                        .map(
                            chunk =>
                                chunk.response
                                    ?.extractedShape
                        )
                        .filter(
                            Boolean
                        )
                )
            ];

        const expected =
            segment.expected;

        let controlAssessment =
            "UNASSESSED";

        if (
            segmentId === "1"
        ) {

            if (
                totalExtractedRows >
                0
            ) {

                controlAssessment =
                    "CONTROL_DATA_REPRODUCED";

            } else {

                controlAssessment =
                    "CONTROL_DATA_NOT_EXTRACTED";
            }
        }

        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_RD_NESTED_CANDLE_RESPONSE",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Validate the nested INDstocks candle response parser before interpreting V25.7 Segment 2 or Segment 3.",

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

            responseSchema:

                "data." +
                SCRIP_CODE +
                ".candles",

            aggregate: {

                totalExtractedRows,

                totalUniqueTimestampedRows,

                chunksWithData,

                chunksEmpty,

                httpStatuses,

                extractedShapes:
                    shapes
            },

            controlAssessment,

            expectedFromPriorV25_7:
                expected,

            chunks:
                chunkResults,

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

                parserRecognizedNestedCandles:
                    shapes.includes(
                        `data.${SCRIP_CODE}.candles`
                    ),

                conclusion:
                    totalExtractedRows >
                    0
                        ? "NESTED_CANDLES_EXTRACTED"
                        : "NO_NESTED_CANDLES_EXTRACTED"
            },

            nextStep:
                segmentId === "1"
                    ? "Inspect Segment 1 control. Only after the control reproduces candles should Segment 2 and Segment 3 be run."
                    : "Compare this result with the V25.7 control and do not interpret it as a trading result.",

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

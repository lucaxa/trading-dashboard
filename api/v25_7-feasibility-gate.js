/*
===========================================================
TradeMind Pro
V25.7-FG — INDEPENDENT SAMPLE FEASIBILITY GATE
===========================================================

PURPOSE
-------
Determine whether the V25.7 independent-confirmation protocol
can be executed with the historical candles actually returned
by INDstocks.

THIS IS A DATA-FEASIBILITY DIAGNOSTIC ONLY.

It does NOT:
- generate candidates
- generate learning records
- classify HEALTHY / STABLE / DECAYING / BROKEN
- validate trades
- run OOS
- tune thresholds
- modify strategy mechanics
- place orders

V25.7 REQUIREMENT BEING TESTED
------------------------------
The existing V25.7 learning engine requires:

- 5 independent chronological segments
- 180 days per segment
- 900 total research days
- 40 prior records
- 20 forward records
- 60 records per block
- 5 independent blocks
- 300 usable SELL records target
- no overlap with the frozen V24.5 confirmation horizon

IMPORTANT
---------
This gate does NOT change those requirements.

It asks only:

"Can the historical API provide enough chronological candle
data to make that protocol executable?"

KNOWN EVIDENCE
--------------
V25.7 S1:
  8778 candles

V25.7 S2:
  candles:null

V25.7 S3:
  candles:null

Boundary diagnostic:
  S1-side control  -> data available
  S2-side control  -> candles:null
  deeper S2        -> candles:null

Therefore this gate checks the five planned V25.7 segments
independently and reports availability only.

SEGMENTS
--------
The exact V25.7 S1/S2/S3 ranges supplied during the project are
included below. S4/S5 are calculated chronologically backward
from the V25.7 S3 start so the gate preserves the intended
five-segment geometry.

RUN
---
GET:
  /api/v25_7-feasibility-gate?segment=1

Run segment 1 first.

Then inspect before running segment 2.

The endpoint never invokes learning-engine.js.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-FG";

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

    const SEGMENT_DAYS = 180;
    const TOTAL_SEGMENTS = 5;
    const TOTAL_RESEARCH_DAYS =
        SEGMENT_DAYS *
        TOTAL_SEGMENTS;

    const CHUNK_DAYS = 7;
    const CHUNK_MS =
        CHUNK_DAYS *
        DAY_MS;

    const MAX_429_RETRIES = 5;
    const BASE_429_DELAY_MS = 2000;
    const INTER_CHUNK_DELAY_MS = 250;

    const PRIOR_RECORDS = 40;
    const FORWARD_RECORDS = 20;
    const RECORDS_PER_BLOCK =
        PRIOR_RECORDS +
        FORWARD_RECORDS;

    const TARGET_BLOCKS = 5;
    const TARGET_SELL_RECORDS = 300;

    /*
     * Exact supplied V25.7 ranges.
     *
     * S1 and S2 were generated in separate V25.7 calls, so
     * their timestamps differ by a few seconds. We preserve
     * the actual supplied ranges instead of silently replacing
     * them with current-time calculations.
     */

    const S1_START_MS = 1703605271190;
    const S1_END_MS   = 1719157271190;

    const S2_START_MS = 1688053691134;
    const S2_END_MS   = 1703605691134;

    const S3_START_MS = 1672501861964;
    const S3_END_MS   = 1688053861964;

    /*
     * For S4/S5, continue the chronological geometry from the
     * supplied S3 start. A 180-day segment is 180 * DAY_MS.
     *
     * These are feasibility-gate ranges only. They are NOT fed
     * into the V25.7 learning engine.
     */
    const S4_END_MS =
        S3_START_MS;

    const S4_START_MS =
        S4_END_MS -
        SEGMENT_DAYS *
        DAY_MS;

    const S5_END_MS =
        S4_START_MS;

    const S5_START_MS =
        S5_END_MS -
        SEGMENT_DAYS *
        DAY_MS;

    const SEGMENTS = {

        "1": {
            label:
                "V25_7_S1_KNOWN_GOOD_REFERENCE",

            startMs:
                S1_START_MS,

            endMs:
                S1_END_MS,

            priorReference:
                "V25.7 S1 reported 8778 raw candles."
        },

        "2": {
            label:
                "V25_7_S2_KNOWN_ZERO_DATA",

            startMs:
                S2_START_MS,

            endMs:
                S2_END_MS,

            priorReference:
                "V25.7 S2 reported candles:null across the range."
        },

        "3": {
            label:
                "V25_7_S3_KNOWN_ZERO_DATA",

            startMs:
                S3_START_MS,

            endMs:
                S3_END_MS,

            priorReference:
                "V25.7 S3 reported candles:null across the range."
        },

        "4": {
            label:
                "V25_7_S4_CHRONOLOGICAL_EXTENSION",

            startMs:
                S4_START_MS,

            endMs:
                S4_END_MS,

            priorReference:
                "No prior V25.7 learning result supplied; availability must be measured."
        },

        "5": {
            label:
                "V25_7_S5_CHRONOLOGICAL_EXTENSION",

            startMs:
                S5_START_MS,

            endMs:
                S5_END_MS,

            priorReference:
                "No prior V25.7 learning result supplied; availability must be measured."
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

    function timestampOf(row) {

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

    /*
     * Proven response path:
     *
     * data.NIDX_40000001.candles
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
                    candles,

                candleValueType:
                    "ARRAY",

                shape:
                    `data.${SCRIP_CODE}.candles`
            };
        }

        if (
            candles === null
        ) {

            return {
                rows: [],

                candleValueType:
                    "NULL",

                shape:
                    `data.${SCRIP_CODE}.candles`
            };
        }

        return {
            rows: [],

            candleValueType:
                candles === undefined
                    ? "UNDEFINED"
                    : typeof candles,

            shape:
                `data.${SCRIP_CODE}.candles`
        };
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

        return compact.length <= 500
            ? compact
            : compact.slice(
                0,
                500
            ) + "...";
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
                    method:
                        "GET",

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
                    candleValueType:
                        "NO_PAYLOAD",
                    shape: null
                };

        const rowAudit =
            auditRows(
                extracted.rows
            );

        return {

            request: {

                startMs,

                endMs,

                requestedDays:
                    (
                        endMs -
                        startMs
                    ) /
                    DAY_MS
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

                candleValueType:
                    extracted.candleValueType,

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

    async function fetchRateLimitSafe(
        accessToken,
        startMs,
        endMs
    ) {

        let attempt = 0;

        while (true) {

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

    function buildChunks(
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

        return chunks;
    }

    async function auditSegment(
        accessToken,
        segment
    ) {

        const chunks =
            buildChunks(
                segment.startMs,
                segment.endMs
            );

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
                    fetchRateLimitSafe(
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

        const totalUniqueRows =
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

        const dataChunks =
            chunkResults.filter(
                chunk =>
                    chunk.response
                        ?.candleValueType ===
                    "ARRAY"
            ).length;

        const nullChunks =
            chunkResults.filter(
                chunk =>
                    chunk.response
                        ?.candleValueType ===
                    "NULL"
            ).length;

        const emptyChunks =
            chunkResults.filter(
                chunk =>
                    (
                        chunk.response
                            ?.extractedRows ||
                        0
                    ) === 0
            ).length;

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

        const candleAvailability =
            dataChunks > 0
                ? (
                    nullChunks > 0
                        ? "PARTIAL_OR_RANGE_SENSITIVE"
                        : "AVAILABLE"
                )
                : (
                    nullChunks > 0
                        ? "UNAVAILABLE_CANDLES_NULL"
                        : "NO_CANDLES_EXTRACTED"
                );

        return {

            requestedDays:
                (
                    segment.endMs -
                    segment.startMs
                ) /
                DAY_MS,

            chunksRequested:
                chunks.length,

            totalExtractedRows:
                totalRows,

            totalUniqueTimestampedRows:
                totalUniqueRows,

            chunksWithData:
                dataChunks,

            chunksWithCandleNull:
                nullChunks,

            chunksWithNoRows:
                emptyChunks,

            httpStatuses,

            extractedShapes:
                shapes,

            candleAvailability,

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

                version:
                    VERSION,

                status:
                    "METHOD_NOT_ALLOWED",

                error:
                    "V25.7-FG uses GET only."
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

                version:
                    VERSION,

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

                version:
                    VERSION,

                status:
                    "INVALID_SEGMENT",

                availableSegments:
                    Object.keys(
                        SEGMENTS
                    ),

                error:
                    "Use segment=1,2,3,4,or5."
            });
        }

        const audit =
            await auditSegment(
                accessToken,
                segment
            );

        /*
         * This is deliberately a FEASIBILITY result.
         *
         * It does not claim that candle availability alone
         * guarantees 300 SELL records. It only determines
         * whether the requested historical candle window is
         * available enough to proceed to the next research
         * layer.
         */
        let feasibilityStatus =
            "DATA_NOT_CONFIRMED";

        if (
            audit.candleAvailability ===
            "AVAILABLE"
        ) {

            feasibilityStatus =
                "CANDLE_WINDOW_AVAILABLE";

        } else if (
            audit.candleAvailability ===
            "PARTIAL_OR_RANGE_SENSITIVE"
        ) {

            feasibilityStatus =
                "CANDLE_WINDOW_PARTIAL_OR_RANGE_SENSITIVE";

        } else {

            feasibilityStatus =
                "CANDLE_WINDOW_UNAVAILABLE";
        }

        return res.status(200).json({

            success: true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_INDEPENDENT_SAMPLE_FEASIBILITY_GATE",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Determine whether each chronological V25.7 research segment has sufficient historical candle availability before invoking the learning engine.",

            protocol: {

                segments:
                    TOTAL_SEGMENTS,

                segmentDays:
                    SEGMENT_DAYS,

                totalResearchDays:
                    TOTAL_RESEARCH_DAYS,

                priorRecords:
                    PRIOR_RECORDS,

                forwardRecords:
                    FORWARD_RECORDS,

                recordsPerBlock:
                    RECORDS_PER_BLOCK,

                targetIndependentBlocks:
                    TARGET_BLOCKS,

                targetUsableSELLRecords:
                    TARGET_SELL_RECORDS,

                source:
                    "INDSTOCKS_HISTORICAL_API",

                frozen:
                    true
            },

            segment: {

                id:
                    segmentId,

                label:
                    segment.label,

                rangeStartMs:
                    segment.startMs,

                rangeEndMs:
                    segment.endMs,

                requestedDays:
                    (
                        segment.endMs -
                        segment.startMs
                    ) /
                    DAY_MS,

                priorReference:
                    segment.priorReference
            },

            feasibility: {

                status:
                    feasibilityStatus,

                candleWindowAvailable:
                    audit.candleAvailability ===
                    "AVAILABLE",

                sufficientForLearningEngine:
                    false,

                reason:
                    "Candle availability is necessary but not sufficient to prove that 300 usable SELL records exist. Learning-record generation remains intentionally outside this gate."
            },

            audit,

            knownProjectEvidence: {

                V25_7_S1:
                    {
                        rawCandles:
                            8778,

                        usableCandles:
                            8777
                    },

                V25_7_S2:
                    {
                        rawCandles:
                            0,

                        candles:
                            "null"
                    },

                V25_7_S3:
                    {
                        rawCandles:
                            0,

                        candles:
                            "null"
                    },

                boundaryControls:
                    {
                        P1:
                            "DATA_AVAILABLE",

                        P2:
                            "CANDLES_NULL",

                        P3:
                            "CANDLES_NULL",

                        P4:
                            "CANDLES_NULL"
                    }
            },

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

                hypothesisTested:
                    false,

                conclusion:
                    feasibilityStatus
            },

            nextStep:
                "Run the five feasibility segments sequentially. Do not modify learning-engine.js or infer edge quality from this endpoint.",

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

            version:
                VERSION,

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

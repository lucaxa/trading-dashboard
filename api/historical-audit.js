/*
===========================================================
 TradeMind Pro
 V25.7-HDA — HISTORICAL DATA AVAILABILITY AUDIT
 ==========================================================

 PURPOSE
 -------
 This is a TEMPORARY DIAGNOSTIC endpoint.

 It answers one question only:

 "Which historical NIFTY 50 5-minute periods are actually
  available through the current INDstocks API route?"

 It does NOT:
 - run the learning engine
 - generate candidates
 - create learning records
 - classify HEALTHY / DECAYING
 - modify thresholds
 - modify strategy mechanics
 - run OOS
 - place orders

 IMPORTANT
 ---------
 This endpoint is intentionally separate from:
   /api/learning-engine

 Deploy it as:
   api/historical-audit.js

 Then use:
   /api/historical-audit?probe=1

 The audit uses the SAME INDstocks endpoint structure used
 by the existing V24/V25 confirmation engine:

   /market/historical/5minute
   ?scrip-codes=NIDX_40000001
   &start_time=...
   &end_time=...

 RATE LIMIT SAFETY
 -----------------
 One request at a time.
 250 ms between chunks.
 HTTP 429 retry with exponential backoff.
 Maximum 5 retries.

 PROBES
 ------
 1 = V24.5/V25.7 boundary window
 2 = middle of V25.7 Segment 2
 3 = middle of V25.7 Segment 3
 4 = V25.7 Segment 1 interior control
 5 = older control window

 The probe windows are deliberately small so this diagnostic
 does not reproduce the 180-day / 26-chunk workload.

 ===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-HDA";

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

    /*
     * These timestamps come from the actual V25.7
     * Segment 1 / Segment 2 / Segment 3 results.
     *
     * We deliberately use the already-tested chronological
     * boundary rather than moving the experiment.
     */
    const S1_START_MS = 1703605271190;
    const S1_END_MS   = 1719157271190;

    const S2_START_MS = 1688053691134;
    const S2_END_MS   = 1703605691134;

    const S3_START_MS = 1672501861964;
    const S3_END_MS   = 1688053861964;

    const DAY_MS =
        24 *
        60 *
        60 *
        1000;

    /*
     * Small probe windows.
     *
     * Each probe is 14 days. This is enough to determine
     * whether the API returns data without spending the
     * full 180-day segment request.
     */
    const PROBES = {

        "1": {
            label:
                "S1_S2_BOUNDARY",

            description:
                "14-day window straddling the boundary where V25.7 S1 ended and S2 began.",

            startMs:
                S2_END_MS -
                7 * DAY_MS,

            endMs:
                S1_START_MS +
                7 * DAY_MS
        },

        "2": {
            label:
                "S2_MIDDLE",

            description:
                "14-day window centered inside V25.7 Segment 2.",

            startMs:
                S2_START_MS +
                83 * DAY_MS,

            endMs:
                S2_START_MS +
                97 * DAY_MS
        },

        "3": {
            label:
                "S3_MIDDLE",

            description:
                "14-day window centered inside V25.7 Segment 3.",

            startMs:
                S3_START_MS +
                83 * DAY_MS,

            endMs:
                S3_START_MS +
                97 * DAY_MS
        },

        "4": {
            label:
                "S1_INTERIOR_CONTROL",

            description:
                "14-day control window inside the V25.7 Segment 1 period that successfully returned candles.",

            startMs:
                S1_START_MS +
                83 * DAY_MS,

            endMs:
                S1_START_MS +
                97 * DAY_MS
        },

        "5": {
            label:
                "OLDER_CONTROL",

            description:
                "14-day control window deeper inside the older historical range.",

            startMs:
                S3_START_MS +
                20 * DAY_MS,

            endMs:
                S3_START_MS +
                34 * DAY_MS
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

        /*
         * Some API responses may expose the array under a
         * single object property. This fallback is deliberately
         * conservative: it only accepts arrays that look like
         * candle collections.
         */
        if (
            payload &&
            typeof payload === "object"
        ) {

            for (
                const value
                of Object.values(payload)
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
                    return value;
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
                    return value;
                }
            }
        }

        return [];
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

    function basicCandleAudit(rows) {

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
                    ? retryAfter * 1000
                    : null;

            throw error;
        }

        return payload;
    }

    async function fetchChunkRateLimitSafe(
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

            try {

                const payload =
                    await
                        fetchChunkRateLimitSafe(
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
                    chunk: i + 1,
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

            } catch (error) {

                chunkResults.push({
                    chunk: i + 1,
                    startMs:
                        chunk.startMs,
                    endMs:
                        chunk.endMs,
                    rows: 0,
                    status:
                        "ERROR",
                    error:
                        error?.message ||
                        String(error)
                });

                throw error;
            }

            if (
                i <
                chunks.length - 1
            ) {
                await sleep(
                    INTER_CHUNK_DELAY_MS
                );
            }
        }

        const candleAudit =
            basicCandleAudit(
                allRows
            );

        return {

            chunksRequested:
                chunks.length,

            rawRows:
                allRows.length,

            ...candleAudit,

            status:
                allRows.length >= 500
                    ? "SUFFICIENT_FOR_BASIC_5M_AUDIT"
                    : allRows.length > 0
                        ? "DATA_PRESENT_BUT_SMALL"
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

                error:
                    "V25.7-HDA uses GET only."
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
                    "INDSTOCKS_TOKEN is not configured."
            });
        }

        const requestedProbe =
            String(
                req.query?.probe ||
                "1"
            );

        const probe =
            PROBES[
                requestedProbe
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
                "V25_7_HISTORICAL_DATA_AVAILABILITY_AUDIT",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Determine the actual historical candle availability boundary before continuing independent confirmation.",

            instrument:
                INSTRUMENT,

            scripCode:
                SCRIP_CODE,

            interval:
                INTERVAL,

            dataSource:
                "INDSTOCKS_HISTORICAL_API",

            probe: {

                id:
                    requestedProbe,

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
                "Compare probes 1 through 5. Do not resume V25.7 independent confirmation until the historical availability boundary is understood.",

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

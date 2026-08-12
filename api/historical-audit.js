/*
===========================================================
TradeMind Pro
V25.7-HDA v3 — HISTORICAL RANGE COMPATIBILITY AUDIT
===========================================================

PURPOSE
-------
This is a DATA-LAYER diagnostic only.

It answers:

"Can the current INDstocks historical request path return
the same known-good V25.7 Segment 1 data when we vary only
the requested historical range?"

It does NOT:
- generate learning records
- discover candidates
- classify HEALTHY / DECAYING / BROKEN
- validate trades
- run OOS
- tune thresholds
- modify strategy mechanics
- place orders

IMPORTANT
---------
V25.7 Segment 1 already proved that this exact broad range
returned 8778 raw candles / 8777 usable candles.

V3 therefore starts with that EXACT range as the control.

It then tests progressively smaller windows INSIDE the
known-good S1 period.

PROBES
------
probe=1  EXACT V25.7 S1 range (~180 days)
probe=2  120-day S1 interior
probe=3   90-day S1 interior
probe=4   60-day S1 interior
probe=5   30-day S1 interior

Run probe=1 first.

The fetch path intentionally mirrors the proven V24/V25
historical loader:
- INDSTOCKS_API_BASE
- INDSTOCKS_TOKEN / INDSTOCKS_ACCESS_TOKEN
- /market/historical/5minute
- NIDX_40000001
- 7-day serialized chunks
- 429 retry handling

No learning engine is called.
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-HDA-v3";

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
     * EXACT V25.7 S1 boundaries from the successful S1 run.
     */
    const S1_START_MS = 1703605271190;
    const S1_END_MS   = 1719157271190;

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
     * Build a centered interior window of the requested
     * duration, fully inside the known-good S1 range.
     */
    function centeredWindow(days) {

        const span =
            days *
            DAY_MS;

        const totalSpan =
            S1_END_MS -
            S1_START_MS;

        if (
            span >=
            totalSpan
        ) {
            return {
                startMs:
                    S1_START_MS,

                endMs:
                    S1_END_MS
            };
        }

        const margin =
            Math.floor(
                (
                    totalSpan -
                    span
                ) / 2
            );

        return {
            startMs:
                S1_START_MS +
                margin,

            endMs:
                S1_START_MS +
                margin +
                span
        };
    }

    const PROBES = {

        "1": {
            label:
                "EXACT_V25_7_S1_RANGE",

            description:
                "Exact historical range used by the successful V25.7 Segment 1 run.",

            startMs:
                S1_START_MS,

            endMs:
                S1_END_MS,

            expectedReference:
                "V25.7 S1 reported 8778 raw candles and 8777 usable candles."
        },

        "2": {
            label:
                "S1_INTERIOR_120D",

            description:
                "120-day centered window entirely inside the known-good S1 period.",

            ...centeredWindow(120),

            expectedReference:
                "No prior result; this is a range-compatibility test."
        },

        "3": {
            label:
                "S1_INTERIOR_90D",

            description:
                "90-day centered window entirely inside the known-good S1 period.",

            ...centeredWindow(90),

            expectedReference:
                "No prior result; this is a range-compatibility test."
        },

        "4": {
            label:
                "S1_INTERIOR_60D",

            description:
                "60-day centered window entirely inside the known-good S1 period.",

            ...centeredWindow(60),

            expectedReference:
                "No prior result; this is a range-compatibility test."
        },

        "5": {
            label:
                "S1_INTERIOR_30D",

            description:
                "30-day centered window entirely inside the known-good S1 period.",

            ...centeredWindow(30),

            expectedReference:
                "No prior result; this is a range-compatibility test."
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

        /*
         * Conservative fallback for object-shaped API responses.
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
                    "V25.7-HDA-v3 uses GET only."
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
                "V25_7_HDA_HISTORICAL_RANGE_COMPATIBILITY",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            purpose:
                "Determine whether the INDstocks request path returns the known-good V25.7 S1 historical data across progressively smaller ranges.",

            instrument:
                INSTRUMENT,

            scripCode:
                SCRIP_CODE,

            interval:
                INTERVAL,

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
                    probe.endMs,

                requestedDays,

                expectedReference:
                    probe.expectedReference
            },

            requestGeometry: {

                chunkDays:
                    7,

                serialized:
                    true,

                retries429:
                    MAX_429_RETRIES
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
                        ? "HISTORICAL_DATA_RETURNED"
                        : "NO_HISTORICAL_DATA_RETURNED"
            },

            nextStep:
                "Run probe 1 first. Only after probe 1 is verified should probes 2 through 5 be run sequentially.",

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

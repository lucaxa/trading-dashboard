/*
===========================================================
 TradeMind Pro
 V13.2 — INDSTOCKS DATA DIAGNOSTIC

 PURPOSE:
   Diagnose why historical candles are returning 0.

 PAPER ONLY
 NO ORDERS
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V13.2";

    const BASE_URL =
        "https://api.indstocks.com";

    const SCRIP_CODE =
        "NIDX_40000001";

    const INTERVAL =
        "5minute";


    function output(data) {

        return res.status(200).json(data);

    }


    function errorOutput(message, extra = {}) {

        return res.status(500).json({

            success: false,

            version: VERSION,

            status: "ERROR",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            error: message,

            ...extra

        });

    }


    try {

        // =====================================================
        // TOKEN
        // =====================================================

        const token =
            process.env.INDSTOCKS_ACCESS_TOKEN ||
            process.env.INDSTOCKS_TOKEN ||
            process.env.INDSTOCKS_API_TOKEN;


        if (!token) {

            return errorOutput(
                "INDstocks token is missing from Vercel.",
                {
                    requiredVariable:
                        "INDSTOCKS_ACCESS_TOKEN"
                }
            );

        }


        const accessToken =
            String(token).trim();


        // =====================================================
        // 1. TEST AUTHENTICATION
        // =====================================================

        const profileResponse =
            await fetch(
                `${BASE_URL}/user/profile`,
                {
                    method: "GET",

                    headers: {

                        "Authorization":
                            accessToken,

                        "Accept":
                            "application/json"

                    }

                }
            );


        const profileText =
            await profileResponse.text();


        let profileData = null;


        try {

            profileData =
                JSON.parse(profileText);

        } catch {

            profileData = {
                raw:
                    profileText.slice(
                        0,
                        1000
                    )
            };

        }


        // =====================================================
        // 2. HISTORICAL REQUEST
        // =====================================================

        /*
         * Only request 1 day.
         *
         * This removes the 30-day/chunking variable
         * completely while diagnosing the API.
         */

        const DAY =
            24 *
            60 *
            60 *
            1000;


        const endTime =
            Date.now();


        const startTime =
            endTime -
            DAY;


        const historicalURL =
            `${BASE_URL}/market/historical/${INTERVAL}` +
            `?scrip-codes=${encodeURIComponent(SCRIP_CODE)}` +
            `&start_time=${startTime}` +
            `&end_time=${endTime}`;


        console.log(
            "TradeMind V13.2 historical URL:",
            historicalURL
        );


        const historicalResponse =
            await fetch(
                historicalURL,
                {
                    method: "GET",

                    headers: {

                        "Authorization":
                            accessToken,

                        "Accept":
                            "application/json"

                    }
                }
            );


        const historicalText =
            await historicalResponse.text();


        let historicalData = null;


        try {

            historicalData =
                JSON.parse(
                    historicalText
                );

        } catch {

            historicalData = {

                raw:
                    historicalText.slice(
                        0,
                        5000
                    )

            };

        }


        // =====================================================
        // 3. TRY EVERY COMMON CANDLE LOCATION
        // =====================================================

        function findArrays(
            value,
            path = "root",
            found = []
        ) {

            if (
                found.length >= 20
            ) {

                return found;

            }


            if (
                Array.isArray(value)
            ) {

                found.push({

                    path,

                    length:
                        value.length,

                    first:
                        value.length
                            ? value[0]
                            : null,

                    last:
                        value.length
                            ? value[
                                value.length - 1
                              ]
                            : null

                });


                return found;

            }


            if (
                value &&
                typeof value ===
                "object"
            ) {

                for (
                    const [
                        key,
                        child
                    ]
                    of Object.entries(value)
                ) {

                    findArrays(
                        child,
                        `${path}.${key}`,
                        found
                    );

                }

            }


            return found;

        }


        const arraysFound =
            findArrays(
                historicalData
            );


        // =====================================================
        // 4. EXTRACT CANDLE-LIKE ARRAYS
        // =====================================================

        function isCandleArray(
            array
        ) {

            if (
                !Array.isArray(array)
            ) {

                return false;

            }


            if (
                array.length === 0
            ) {

                return false;

            }


            const first =
                array[0];


            /*
             * Standard INDstocks:
             *
             * [
             *   timestamp,
             *   open,
             *   high,
             *   low,
             *   close,
             *   volume
             * ]
             */

            if (
                Array.isArray(first) &&
                first.length >= 5
            ) {

                return true;

            }


            /*
             * Object format fallback
             */

            if (
                first &&
                typeof first ===
                "object"
            ) {

                if (
                    (
                        first.timestamp !==
                        undefined
                    ) ||
                    (
                        first.ts !==
                        undefined
                    )
                ) {

                    return true;

                }

            }


            return false;

        }


        function findCandleArrays(
            value,
            path = "root",
            found = []
        ) {

            if (
                Array.isArray(value)
            ) {

                if (
                    isCandleArray(value)
                ) {

                    found.push({

                        path,

                        candles:
                            value

                    });

                }


                return found;

            }


            if (
                value &&
                typeof value ===
                "object"
            ) {

                for (
                    const [
                        key,
                        child
                    ]
                    of Object.entries(value)
                ) {

                    findCandleArrays(
                        child,
                        `${path}.${key}`,
                        found
                    );

                }

            }


            return found;

        }


        const candleArrays =
            findCandleArrays(
                historicalData
            );


        // =====================================================
        // 5. NORMALIZE
        // =====================================================

        function normalize(
            row
        ) {

            if (
                Array.isArray(row)
            ) {

                const timestamp =
                    Number(row[0]);


                const open =
                    Number(row[1]);


                const high =
                    Number(row[2]);


                const low =
                    Number(row[3]);


                const close =
                    Number(row[4]);


                const volume =
                    Number(
                        row[5] || 0
                    );


                if (
                    !Number.isFinite(
                        timestamp
                    ) ||
                    !Number.isFinite(
                        open
                    ) ||
                    !Number.isFinite(
                        high
                    ) ||
                    !Number.isFinite(
                        low
                    ) ||
                    !Number.isFinite(
                        close
                    )
                ) {

                    return null;

                }


                return {

                    ts:
                        timestamp,

                    o:
                        open,

                    h:
                        high,

                    l:
                        low,

                    c:
                        close,

                    v:
                        volume

                };

            }


            if (
                row &&
                typeof row ===
                "object"
            ) {

                const timestamp =
                    Number(
                        row.timestamp ??
                        row.ts ??
                        row.time ??
                        row.t
                    );


                const open =
                    Number(
                        row.open ??
                        row.o
                    );


                const high =
                    Number(
                        row.high ??
                        row.h
                    );


                const low =
                    Number(
                        row.low ??
                        row.l
                    );


                const close =
                    Number(
                        row.close ??
                        row.c
                    );


                const volume =
                    Number(
                        row.volume ??
                        row.v ??
                        0
                    );


                if (
                    !Number.isFinite(
                        timestamp
                    ) ||
                    !Number.isFinite(
                        open
                    ) ||
                    !Number.isFinite(
                        high
                    ) ||
                    !Number.isFinite(
                        low
                    ) ||
                    !Number.isFinite(
                        close
                    )
                ) {

                    return null;

                }


                return {

                    ts:
                        timestamp,

                    o:
                        open,

                    h:
                        high,

                    l:
                        low,

                    c:
                        close,

                    v:
                        volume

                };

            }


            return null;

        }


        const discoveredCandles = [];


        for (
            const group
            of candleArrays
        ) {

            for (
                const row
                of group.candles
            ) {

                const candle =
                    normalize(row);


                if (candle) {

                    discoveredCandles.push(
                        candle
                    );

                }

            }

        }


        // =====================================================
        // 6. UNIQUE CANDLES
        // =====================================================

        const unique =
            new Map();


        for (
            const candle
            of discoveredCandles
        ) {

            unique.set(
                String(candle.ts),
                candle
            );

        }


        const normalized =
            [
                ...unique.values()
            ].sort(
                (a, b) =>
                    a.ts - b.ts
            );


        // =====================================================
        // 7. RETURN FULL DIAGNOSTIC
        // =====================================================

        return output({

            success:
                historicalResponse.ok &&
                normalized.length > 0,

            version:
                VERSION,

            status:
                normalized.length > 0
                    ? "HISTORICAL_DATA_FOUND"
                    : "HISTORICAL_DATA_EMPTY",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,


            authentication: {

                httpStatus:
                    profileResponse.status,

                success:
                    profileResponse.ok,

                response:
                    profileData

            },


            historicalRequest: {

                httpStatus:
                    historicalResponse.status,

                success:
                    historicalResponse.ok,

                endpoint:
                    `/market/historical/${INTERVAL}`,

                scripCode:
                    SCRIP_CODE,

                interval:
                    INTERVAL,

                startTime:
                    startTime,

                endTime:
                    endTime,

                startISO:
                    new Date(
                        startTime
                    ).toISOString(),

                endISO:
                    new Date(
                        endTime
                    ).toISOString()

            },


            responseInspection: {

                topLevelKeys:
                    historicalData &&
                    typeof historicalData ===
                    "object"

                        ? Object.keys(
                            historicalData
                        )

                        : [],

                allArraysFound:
                    arraysFound,

                candleArraysFound:
                    candleArrays.map(
                        group => ({

                            path:
                                group.path,

                            candleCount:
                                group.candles.length,

                            first:
                                group.candles[0],

                            last:
                                group.candles[
                                    group.candles.length - 1
                                ]

                        })
                    )

            },


            candles: {

                rawDiscovered:
                    discoveredCandles.length,

                normalized:
                    normalized.length,

                first:
                    normalized.length
                        ? normalized[0]
                        : null,

                last:
                    normalized.length
                        ? normalized[
                            normalized.length - 1
                          ]
                        : null

            },


            /*
             * IMPORTANT:
             *
             * We deliberately include the actual response
             * here, but truncate it so Vercel does not produce
             * a gigantic response.
             */

            rawINDstocksResponse:
                JSON.stringify(
                    historicalData
                ).slice(
                    0,
                    12000
                )

        });


    } catch (error) {

        console.error(
            "TradeMind V13.2 ERROR:",
            error
        );


        return errorOutput(
            error?.message ||
            String(error)
        );

    }

}

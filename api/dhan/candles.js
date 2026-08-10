/*
TradeMind Pro
Dhan Historical Candle API

Dhan → Vercel → TradeMind Pro

Supports:
1. Browser HttpOnly Dhan session
2. Vercel DHAN_ACCESS_TOKEN fallback

Paper analysis only.
No orders are placed.
*/

"use strict";

// ======================================================
// COOKIE HELPER
// ======================================================

function getCookie(req, name) {

    const cookies =
        req.headers.cookie || "";

    const match =
        cookies
            .split(";")
            .map(cookie => cookie.trim())
            .find(
                cookie =>
                    cookie.startsWith(`${name}=`)
            );

    if (!match) {
        return null;
    }

    return decodeURIComponent(
        match.substring(
            name.length + 1
        )
    );
}


// ======================================================
// MAIN HANDLER
// ======================================================

export default async function handler(req, res) {

    try {

        console.log(
            "================================"
        );

        console.log(
            "🔥 DHAN CANDLES API"
        );

        console.log(
            "================================"
        );


        // ==================================================
        // 1. GET DHAN ACCESS TOKEN
        // ==================================================

        /*
        Priority:

        1. Browser HttpOnly cookie
        2. Vercel environment variable

        This allows the API to work in Brave,
        Safari, ChatGPT browser, etc.
        */

        const cookieToken =
            getCookie(
                req,
                "DHAN_ACCESS_TOKEN"
            );


        const envToken =
            process.env.DHAN_ACCESS_TOKEN;


        const accessToken =
            cookieToken ||
            envToken;


        console.log(
            "Dhan authentication source:",
            cookieToken
                ? "HttpOnly cookie"
                : envToken
                    ? "Vercel environment variable"
                    : "NONE"
        );


        // ==================================================
        // 2. NO TOKEN
        // ==================================================

        if (!accessToken) {

            return res.status(401).json({

                success: false,

                error:
                    "Dhan access token not available",

                message:
                    "Authenticate with Dhan or configure DHAN_ACCESS_TOKEN in Vercel Environment Variables."

            });

        }


        // ==================================================
        // 3. NIFTY 50
        // ==================================================

        const securityId =
            "13";


        // ==================================================
        // 4. INDIA DATE
        // ==================================================

        const indiaDate =
            new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone:
                        "Asia/Kolkata",

                    year:
                        "numeric",

                    month:
                        "2-digit",

                    day:
                        "2-digit"
                }
            ).format(
                new Date()
            );


        console.log(
            "India trading date:",
            indiaDate
        );


        // ==================================================
        // 5. DHAN HISTORICAL CANDLE REQUEST
        // ==================================================

        const dhanUrl =
            "https://api.dhan.co/v2/charts/intraday";


        console.log(
            "Requesting Dhan 5-minute candles..."
        );


        const candleResponse =
            await fetch(
                dhanUrl,
                {
                    method:
                        "POST",

                    headers: {

                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json",

                        "access-token":
                            accessToken

                    },

                    body:
                        JSON.stringify({

                            securityId:
                                securityId,

                            exchangeSegment:
                                "IDX_I",

                            instrument:
                                "INDEX",

                            interval:
                                "5",

                            oi:
                                false,

                            fromDate:
                                `${indiaDate} 09:15:00`,

                            toDate:
                                `${indiaDate} 15:30:00`

                        })
                }
            );


        // ==================================================
        // 6. READ DHAN RESPONSE
        // ==================================================

        const candleData =
            await candleResponse.json();


        console.log(
            "Dhan HTTP status:",
            candleResponse.status
        );


        // ==================================================
        // 7. DHAN ERROR
        // ==================================================

        if (!candleResponse.ok) {

            console.error(
                "🔥 Dhan candle request failed:",
                candleData
            );


            return res.status(
                candleResponse.status
            ).json({

                success:
                    false,

                error:
                    "Dhan historical candle request failed",

                securityId:
                    securityId,

                exchangeSegment:
                    "IDX_I",

                instrument:
                    "INDEX",

                details:
                    candleData

            });

        }


        // ==================================================
        // 8. EXTRACT DHAN ARRAYS
        // ==================================================

        const timestamps =
            Array.isArray(
                candleData.timestamp
            )
                ? candleData.timestamp
                : [];


        const opens =
            Array.isArray(
                candleData.open
            )
                ? candleData.open
                : [];


        const highs =
            Array.isArray(
                candleData.high
            )
                ? candleData.high
                : [];


        const lows =
            Array.isArray(
                candleData.low
            )
                ? candleData.low
                : [];


        const closes =
            Array.isArray(
                candleData.close
            )
                ? candleData.close
                : [];


        const volumes =
            Array.isArray(
                candleData.volume
            )
                ? candleData.volume
                : [];


        // ==================================================
        // 9. CONVERT TO TRADEMIND FORMAT
        // ==================================================

        const candles =
            timestamps.map(
                (ts, i) => ({

                    ts:
                        Number(ts),

                    o:
                        Number(
                            opens[i]
                        ),

                    h:
                        Number(
                            highs[i]
                        ),

                    l:
                        Number(
                            lows[i]
                        ),

                    c:
                        Number(
                            closes[i]
                        ),

                    v:
                        Number(
                            volumes[i] ??
                            0
                        )

                })
            )
            .filter(
                candle =>
                    Number.isFinite(
                        candle.ts
                    ) &&
                    Number.isFinite(
                        candle.o
                    ) &&
                    Number.isFinite(
                        candle.h
                    ) &&
                    Number.isFinite(
                        candle.l
                    ) &&
                    Number.isFinite(
                        candle.c
                    )
            );


        // ==================================================
        // 10. SUCCESS
        // ==================================================

        console.log(
            "🔥 Dhan candles received:",
            candles.length
        );


        console.log(
            "First candle:",
            candles[0] || null
        );


        console.log(
            "Last candle:",
            candles[candles.length - 1] || null
        );


        return res.status(
            200
        ).json({

            success:
                true,

            source:
                "Dhan",

            authenticationSource:
                cookieToken
                    ? "cookie"
                    : "environment",

            symbol:
                "NIFTY 50",

            securityId:
                securityId,

            exchangeSegment:
                "IDX_I",

            instrument:
                "INDEX",

            interval:
                "5",

            tradingDate:
                indiaDate,

            candleCount:
                candles.length,

            firstCandle:
                candles[0] ||
                null,

            lastCandle:
                candles[
                    candles.length - 1
                ] ||
                null,

            candles:
                candles

        });

    }


    // ======================================================
    // ERROR HANDLER
    // ======================================================

    catch (error) {

        console.error(
            "🔥 DHAN CANDLES ERROR:",
            error
        );


        return res.status(
            500
        ).json({

            success:
                false,

            error:
                error?.message ||
                "Failed to fetch Dhan historical candles"

        });

    }

}

/*
TradeMind Pro
Dhan Authentication - Step 3

Dhan Browser Login
        ↓
     tokenId
        ↓
consumeApp-consent
        ↓
   accessToken
        ↓
HttpOnly Cookie
        ↓
/api/dhan/candles

Paper analysis only.
No orders are placed.
*/

"use strict";

export default async function handler(req, res) {

    try {

        console.log("================================");
        console.log("🔥 DHAN CALLBACK STARTED");
        console.log("================================");


        // ==================================================
        // 1. GET TOKEN ID FROM DHAN
        // ==================================================

        const tokenId =
            req.query?.tokenId;


        if (!tokenId) {

            console.error(
                "❌ No tokenId received from Dhan"
            );

            return res.status(400).json({

                success: false,

                error:
                    "No tokenId received from Dhan"

            });

        }


        console.log(
            "🔥 Dhan tokenId received"
        );


        // ==================================================
        // 2. GET API CREDENTIALS
        // ==================================================

        const apiKey =
            process.env.DHAN_API_KEY;

        const apiSecret =
            process.env.DHAN_API_SECRET;


        if (!apiKey) {

            return res.status(500).json({

                success: false,

                error:
                    "DHAN_API_KEY is not configured"

            });

        }


        if (!apiSecret) {

            return res.status(500).json({

                success: false,

                error:
                    "DHAN_API_SECRET is not configured"

            });

        }


        // ==================================================
        // 3. CONSUME DHAN CONSENT
        // ==================================================

        console.log(
            "🔥 Exchanging tokenId for access token..."
        );


        const tokenResponse =
            await fetch(

                `https://auth.dhan.co/app/consumeApp-consent?tokenId=${encodeURIComponent(
                    tokenId
                )}`,

                {

                    method:
                        "POST",

                    headers: {

                        "Accept":
                            "application/json",

                        "app_id":
                            apiKey,

                        "app_secret":
                            apiSecret

                    }

                }

            );


        const tokenText =
            await tokenResponse.text();


        console.log(
            "Dhan consume HTTP status:",
            tokenResponse.status
        );


        console.log(
            "Dhan consume response:",
            tokenText.slice(
                0,
                1000
            )
        );


        let tokenData;


        try {

            tokenData =
                JSON.parse(
                    tokenText
                );

        }

        catch {

            return res.status(500).json({

                success: false,

                error:
                    "Dhan returned an invalid response while generating access token"

            });

        }


        // ==================================================
        // 4. HANDLE DHAN AUTH ERROR
        // ==================================================

        if (
            !tokenResponse.ok ||
            !tokenData.accessToken
        ) {

            console.error(
                "❌ Dhan access token generation failed:",
                tokenData
            );


            return res.status(
                tokenResponse.status || 500
            ).json({

                success:
                    false,

                error:
                    "Failed to generate Dhan access token",

                details:
                    tokenData

            });

        }


        const accessToken =
            tokenData.accessToken;


        console.log(
            "🔥 Dhan access token generated successfully"
        );


        // ==================================================
        // 5. VERIFY ACCESS TOKEN
        // ==================================================

        const profileResponse =
            await fetch(

                "https://api.dhan.co/v2/profile",

                {

                    method:
                        "GET",

                    headers: {

                        "Accept":
                            "application/json",

                        "access-token":
                            accessToken

                    }

                }

            );


        const profileText =
            await profileResponse.text();


        let profileData;


        try {

            profileData =
                JSON.parse(
                    profileText
                );

        }

        catch {

            return res.status(500).json({

                success: false,

                error:
                    "Dhan profile returned an invalid response"

            });

        }


        // ==================================================
        // 6. PROFILE VERIFICATION FAILED
        // ==================================================

        if (!profileResponse.ok) {

            console.error(
                "❌ Dhan profile verification failed:",
                profileData
            );


            return res.status(
                profileResponse.status || 500
            ).json({

                success:
                    false,

                error:
                    "Dhan access token verification failed",

                details:
                    profileData

            });

        }


        console.log(
            "🔥 Dhan profile verification successful"
        );


        // ==================================================
        // 7. STORE TOKEN IN HTTPONLY COOKIE
        // ==================================================

        /*
        The access token is NOT returned to
        frontend JavaScript.

        It is stored in a secure HttpOnly cookie.

        Browser:
            cannot read token

        Vercel:
            automatically receives token

        This works independently in each browser.
        */

        const maxAge =
            60 * 60 * 24;


        const cookie =
            `DHAN_ACCESS_TOKEN=${encodeURIComponent(
                accessToken
            )}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;


        res.setHeader(
            "Set-Cookie",
            cookie
        );


        // ==================================================
        // 8. SUCCESS RESPONSE
        // ==================================================

        console.log(
            "🔥 DHAN SESSION ESTABLISHED"
        );


        return res.status(
            200
        ).json({

            success:
                true,

            message:
                "Dhan authentication successful",

            dhanClientId:
                profileData.dhanClientId,

            tokenValidity:
                profileData.tokenValidity,

            expiryTime:
                tokenData.expiryTime

        });

    }


    // ======================================================
    // ERROR HANDLER
    // ======================================================

    catch (error) {

        console.error(
            "🔥 DHAN CALLBACK ERROR:",
            error
        );


        return res.status(
            500
        ).json({

            success:
                false,

            error:
                error?.message ||
                "Dhan authentication callback failed"

        });

    }

}

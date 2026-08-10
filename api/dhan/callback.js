export default async function handler(req, res) {
  try {
    const { tokenId } = req.query;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        error: "No tokenId received from Dhan"
      });
    }

    const apiKey = process.env.DHAN_API_KEY;
    const apiSecret = process.env.DHAN_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({
        success: false,
        error: "Dhan API credentials are missing"
      });
    }

    // Exchange tokenId for access token
    const tokenResponse = await fetch(
      `https://auth.dhan.co/app/consumeApp-consent?tokenId=${encodeURIComponent(tokenId)}`,
      {
        method: "POST",
        headers: {
          "app_id": apiKey,
          "app_secret": apiSecret
        }
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.accessToken) {
      return res.status(500).json({
        success: false,
        error: "Failed to generate Dhan access token"
      });
    }

    const accessToken = tokenData.accessToken;

    // Verify token
    const profileResponse = await fetch(
      "https://api.dhan.co/v2/profile",
      {
        method: "GET",
        headers: {
          "access-token": accessToken
        }
      }
    );

    const profileData = await profileResponse.json();

    if (!profileResponse.ok) {
      return res.status(500).json({
        success: false,
        error: "Dhan profile verification failed"
      });
    }

    /*
      Store token in a secure HttpOnly cookie.

      The browser cannot read this cookie using JavaScript.
      It is automatically sent back to our Vercel API.
    */
    const maxAge = 60 * 60 * 24;

    res.setHeader(
      "Set-Cookie",
      `DHAN_ACCESS_TOKEN=${encodeURIComponent(accessToken)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`
    );

    return res.status(200).json({
      success: true,
      message: "Dhan session established",
      dhanClientId: profileData.dhanClientId,
      tokenValidity: profileData.tokenValidity,
      tokenExpiry: tokenData.expiryTime
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

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

    // Step 1: Exchange tokenId for Dhan access token
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

    // Step 2: Test the access token against Dhan Profile API
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
        error: "Access token generated but profile test failed",
        details: profileData
      });
    }

    // Never send the actual access token to the browser
    return res.status(200).json({
      success: true,
      message: "Dhan authentication and API test successful",
      dhanClientId: profileData.dhanClientId,
      tokenValidity: profileData.tokenValidity,
      activeSegment: profileData.activeSegment,
      ddpi: profileData.ddpi,
      mtf: profileData.mtf,
      dataPlan: profileData.dataPlan,
      dataValidity: profileData.dataValidity,
      tokenExpiry: tokenData.expiryTime
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

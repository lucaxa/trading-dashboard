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

    // Exchange Dhan tokenId for a 24-hour access token
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

    // Immediately test the access token against Dhan Funds API
    const fundResponse = await fetch(
      "https://api.dhan.co/v2/fundlimit",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "access-token": tokenData.accessToken
        }
      }
    );

    const fundData = await fundResponse.json();

    if (!fundResponse.ok) {
      return res.status(fundResponse.status).json({
        success: false,
        error: "Dhan authentication worked, but Fund API failed",
        details: fundData
      });
    }

    // Never expose the access token
    return res.status(200).json({
      success: true,
      message: "Dhan authentication + Fund API successful",
      dhanClientId: fundData.dhanClientId,
      availableBalance: fundData.availabelBalance,
      utilizedAmount: fundData.utilizedAmount,
      withdrawableBalance: fundData.withdrawableBalance,
      tokenExpiry: tokenData.expiryTime
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

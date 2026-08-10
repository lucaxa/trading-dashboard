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

    const response = await fetch(
      `https://auth.dhan.co/app/consumeApp-consent?tokenId=${encodeURIComponent(tokenId)}`,
      {
        method: "POST",
        headers: {
          "app_id": apiKey,
          "app_secret": apiSecret
        }
      }
    );

    const data = await response.json();

    if (!response.ok || !data.accessToken) {
      return res.status(500).json({
        success: false,
        error: "Failed to generate Dhan access token",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "Dhan authentication successful",
      dhanClientId: data.dhanClientId,
      expiryTime: data.expiryTime
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

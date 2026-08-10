export default async function handler(req, res) {
  try {
    // ==========================================
    // TradeMind Pro
    // Dhan Authentication - Step 1
    // Generate Consent
    // ==========================================

    const clientId = process.env.DHAN_CLIENT_ID;
    const apiKey = process.env.DHAN_API_KEY;
    const apiSecret = process.env.DHAN_API_SECRET;

    // ------------------------------------------
    // Check environment variables
    // ------------------------------------------

    if (!clientId) {
      return res.status(500).json({
        success: false,
        error: "DHAN_CLIENT_ID is not configured"
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "DHAN_API_KEY is not configured"
      });
    }

    if (!apiSecret) {
      return res.status(500).json({
        success: false,
        error: "DHAN_API_SECRET is not configured"
      });
    }

    // ------------------------------------------
    // Generate Dhan consent
    // ------------------------------------------

    const response = await fetch(
      `https://auth.dhan.co/app/generate-consent?client_id=${encodeURIComponent(clientId)}`,
      {
        method: "POST",

        headers: {
          "Accept": "application/json",
          "app_id": apiKey,
          "app_secret": apiSecret
        }
      }
    );

    const data = await response.json();

    // ------------------------------------------
    // Handle Dhan error
    // ------------------------------------------

    if (!response.ok || !data.consentAppId) {
      return res.status(response.status || 500).json({
        success: false,
        error: "Dhan consent generation failed",
        details: data
      });
    }

    // ------------------------------------------
    // Redirect user to Dhan login
    // ------------------------------------------

    const loginUrl =
      "https://auth.dhan.co/login/consentApp-login" +
      `?consentAppId=${encodeURIComponent(data.consentAppId)}`;

    return res.redirect(302, loginUrl);

  } catch (error) {

    return res.status(500).json({
      success: false,
      error: error.message
    });

  }
}

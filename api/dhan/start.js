export default async function handler(req, res) {
  try {
    const clientId = process.env.DHAN_CLIENT_ID;
    const apiKey = process.env.DHAN_API_KEY;
    const apiSecret = process.env.DHAN_API_SECRET;

    if (!clientId || !apiKey || !apiSecret) {
      return res.status(500).json({
        success: false,
        error: "Dhan environment variables are missing"
      });
    }

    const response = await fetch(
      `https://auth.dhan.co/app/generate-consent?client_id=${encodeURIComponent(clientId)}`,
      {
        method: "POST",
        headers: {
          "app_id": apiKey,
          "app_secret": apiSecret
        }
      }
    );

    const data = await response.json();

    if (!response.ok || !data.consentAppId) {
      return res.status(500).json({
        success: false,
        error: "Failed to generate Dhan consent",
        details: data
      });
    }

    const loginUrl =
      `https://auth.dhan.co/login/consentApp-login?consentAppId=${encodeURIComponent(data.consentAppId)}`;

    return res.redirect(302, loginUrl);

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

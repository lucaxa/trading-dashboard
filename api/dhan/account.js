export default async function handler(req, res) {
  try {
    const accessToken = process.env.DHAN_ACCESS_TOKEN;

    if (!accessToken) {
      return res.status(500).json({
        success: false,
        error: "DHAN_ACCESS_TOKEN is not configured"
      });
    }

    const response = await fetch(
      "https://api.dhan.co/v2/fundlimit",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "access-token": accessToken
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "Dhan account API request failed",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "Dhan account API connection successful",
      dhanClientId: data.dhanClientId,
      availableBalance: data.availabelBalance,
      utilizedAmount: data.utilizedAmount,
      withdrawableBalance: data.withdrawableBalance,
      currency: "INR"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

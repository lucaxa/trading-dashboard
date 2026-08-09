export default async function handler(req, res) {
  try {
    const token = process.env.INDSTOCKS_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "INDSTOCKS_TOKEN is not configured"
      });
    }

    const { scripCodes } = req.query;

    if (!scripCodes) {
      return res.status(400).json({
        success: false,
        error: "Missing scripCodes parameter",
        example: "/api/quotes?scripCodes=NSE_3045"
      });
    }

    const url =
      "https://api.indstocks.com/market/quotes/full?scrip-codes=" +
      encodeURIComponent(scripCodes);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: token
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    return res.status(200).json({
      success: true,
      source: "INDstocks",
      data: data.data
    });

  } catch (error) {
    console.error("INDstocks quote error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch market quotes"
    });
  }
}

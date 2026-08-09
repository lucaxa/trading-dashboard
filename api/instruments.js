export default async function handler(req, res) {
  try {
    const token = process.env.INDSTOCKS_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "INDSTOCKS_TOKEN is not configured"
      });
    }

    const source = req.query.source || "index";

    const allowedSources = [
      "equity",
      "fno",
      "index"
    ];

    if (!allowedSources.includes(source)) {
      return res.status(400).json({
        success: false,
        error: "Invalid source. Use equity, fno, or index."
      });
    }

    const url =
      `https://api.indstocks.com/market/instruments?source=${source}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: token
      }
    });

    const csv = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: csv
      });
    }

    return res.status(200).json({
      success: true,
      source,
      data: csv
    });

  } catch (error) {
    console.error("INDstocks instruments error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch instrument data"
    });
  }
}

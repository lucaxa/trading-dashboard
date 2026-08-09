export default async function handler(req, res) {
  try {
    const token = process.env.INDSTOCKS_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "INDSTOCKS_TOKEN is not configured"
      });
    }

    const response = await fetch(
      "https://api.indstocks.com/market/instruments",
      {
        method: "GET",
        headers: {
          Authorization: token,
          "Content-Type": "application/json"
        }
      }
    );

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
    console.error("INDstocks instruments error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch instrument data"
    });
  }
}

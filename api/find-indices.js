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
      "https://api.indstocks.com/market/instruments?source=index",
      {
        method: "GET",
        headers: {
          Authorization: token
        }
      }
    );

    const csv = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: csv
      });
    }

    const lines = csv
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    const rows = lines.slice(1);

    const instruments = rows.map(row => {
      const parts = row.split(",");

      return {
        exchange: parts[0] || "",
        segment: parts[1] || "",
        securityId: parts[2] || ""
      };
    });

    const matches = instruments.filter(item => {
      const text = (
        item.exchange +
        " " +
        item.segment
      ).toUpperCase();

      return (
        text.includes("NIFTY 50") ||
        text.includes("NIFTY50") ||
        text.includes("BANKNIFTY") ||
        text.includes("NIFTY BANK")
      );
    });

    return res.status(200).json({
      success: true,
      matches
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to find index instruments"
    });
  }
}

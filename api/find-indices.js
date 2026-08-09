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
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return res.status(500).json({
        success: false,
        error: "Instrument data is empty"
      });
    }

    const headers = lines[0]
      .split(",")
      .map(value => value.trim());

    const exchangeIndex =
      headers.indexOf("EXCH");

    const segmentIndex =
      headers.indexOf("SEGMENT");

    const securityIdIndex =
      headers.indexOf("SECURITY_ID");

    if (
      exchangeIndex === -1 ||
      segmentIndex === -1 ||
      securityIdIndex === -1
    ) {
      return res.status(500).json({
        success: false,
        error: "Unexpected instrument CSV format",
        headers
      });
    }

    const instruments = lines
      .slice(1)
      .map(line => {
        const parts = line.split(",");

        return {
          exchange:
            parts[exchangeIndex]?.trim() || "",

          segment:
            parts[segmentIndex]?.trim() || "",

          securityId:
            parts[securityIdIndex]?.trim() || ""
        };
      });

    const matches = instruments.filter(item => {

      const text =
        item.segment.toUpperCase();

      return (
        text === "NIFTY 50" ||
        text === "BANK NIFTY" ||
        text === "BANKNIFTY"
      );

    });

    return res.status(200).json({
      success: true,
      matches
    });

  } catch (error) {

    console.error(
      "INDstocks instrument error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Failed to fetch instrument data"
    });

  }
}

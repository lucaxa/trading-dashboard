function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  const match = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`));

  if (!match) return null;

  return decodeURIComponent(
    match.substring(name.length + 1)
  );
}

export default async function handler(req, res) {
  try {
    // -------------------------------
    // 1. Get secure Dhan session
    // -------------------------------

    const accessToken = getCookie(
      req,
      "DHAN_ACCESS_TOKEN"
    );

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: "Dhan session not found. Authenticate first."
      });
    }

    // -------------------------------
    // 2. NIFTY 50 mapping
    // -------------------------------

    const securityId = "13";

    // -------------------------------
    // 3. Today's date in India
    // -------------------------------

    const indiaDate = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).format(new Date());

    // -------------------------------
    // 4. Request 5-minute candles
    // -------------------------------

    const candleResponse = await fetch(
      "https://api.dhan.co/v2/charts/intraday",
      {
        method: "POST",

        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "access-token": accessToken
        },

        body: JSON.stringify({
          securityId: securityId,
          exchangeSegment: "IDX_I",
          instrument: "INDEX",
          interval: "5",
          oi: false,
          fromDate: `${indiaDate} 09:15:00`,
          toDate: `${indiaDate} 15:30:00`
        })
      }
    );

    const candleData = await candleResponse.json();

    // -------------------------------
    // 5. Handle Dhan error
    // -------------------------------

    if (!candleResponse.ok) {
      return res.status(candleResponse.status).json({
        success: false,
        error: "Dhan historical candle request failed",
        securityId,
        exchangeSegment: "IDX_I",
        instrument: "INDEX",
        details: candleData
      });
    }

    // -------------------------------
    // 6. Convert Dhan arrays
    //    into our TradeMind format
    // -------------------------------

    const timestamps = candleData.timestamp || [];
    const opens = candleData.open || [];
    const highs = candleData.high || [];
    const lows = candleData.low || [];
    const closes = candleData.close || [];
    const volumes = candleData.volume || [];

    const candles = timestamps.map((ts, i) => ({
      ts: ts,
      o: opens[i],
      h: highs[i],
      l: lows[i],
      c: closes[i],
      v: volumes[i]
    }));

    // -------------------------------
    // 7. Return test result
    // -------------------------------

    return res.status(200).json({
      success: true,
      source: "Dhan",
      symbol: "NIFTY 50",
      securityId: securityId,
      exchangeSegment: "IDX_I",
      instrument: "INDEX",
      interval: "5",
      candleCount: candles.length,
      firstCandle: candles[0] || null,
      lastCandle: candles[candles.length - 1] || null,
      candles: candles
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

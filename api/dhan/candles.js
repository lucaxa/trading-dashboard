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
    // --------------------------------
    // 1. Get secure Dhan session
    // --------------------------------

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

    // --------------------------------
    // 2. Find NIFTY 50 in Dhan instrument list
    // --------------------------------

    const instrumentResponse = await fetch(
      "https://api.dhan.co/v2/instrument/IDX_I",
      {
        method: "GET",
        headers: {
          "access-token": accessToken
        }
      }
    );

    const instruments = await instrumentResponse.json();

    if (!instrumentResponse.ok) {
      return res.status(instrumentResponse.status).json({
        success: false,
        error: "Unable to retrieve Dhan index instruments",
        details: instruments
      });
    }

    // Dhan may return the instrument list as an array
    const list = Array.isArray(instruments)
      ? instruments
      : instruments.data || [];

    const nifty = list.find(item => {
      const symbol =
        item.SYMBOL_NAME ||
        item.symbolName ||
        item.tradingSymbol ||
        item.TRADING_SYMBOL ||
        "";

      return String(symbol).toUpperCase() === "NIFTY";
    });

    if (!nifty) {
      return res.status(404).json({
        success: false,
        error: "NIFTY 50 not found in Dhan IDX_I instrument list"
      });
    }

    const securityId =
      nifty.SECURITY_ID ||
      nifty.securityId ||
      nifty.SEM_SMST_SECURITY_ID;

    if (!securityId) {
      return res.status(500).json({
        success: false,
        error: "NIFTY instrument found but security ID is missing",
        instrument: nifty
      });
    }

    // --------------------------------
    // 3. Request today's 5-minute candles
    // --------------------------------

    const now = new Date();

    // Use today's date in India
    const indiaDate = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).format(now);

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
          securityId: String(securityId),
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

    if (!candleResponse.ok) {
      return res.status(candleResponse.status).json({
        success: false,
        error: "Dhan historical candle request failed",
        securityId: String(securityId),
        details: candleData
      });
    }

    // --------------------------------
    // 4. Return a clean test response
    // --------------------------------

    const timestamps = candleData.timestamp || [];
    const opens = candleData.open || [];
    const highs = candleData.high || [];
    const lows = candleData.low || [];
    const closes = candleData.close || [];
    const volumes = candleData.volume || [];

    const candles = timestamps.map((ts, i) => ({
      ts,
      o: opens[i],
      h: highs[i],
      l: lows[i],
      c: closes[i],
      v: volumes[i]
    }));

    return res.status(200).json({
      success: true,
      source: "Dhan",
      symbol: "NIFTY 50",
      securityId: String(securityId),
      exchangeSegment: "IDX_I",
      instrument: "INDEX",
      interval: "5",
      candleCount: candles.length,
      firstCandle: candles[0] || null,
      lastCandle: candles[candles.length - 1] || null,
      candles
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

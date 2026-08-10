/*
TradeMind Pro
Dhan vs INDstocks Candle Comparison

READ ONLY.
No orders are placed.
*/

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

    // =========================================
    // 1. Get Dhan secure session
    // =========================================

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

    // =========================================
    // 2. Get today's date in IST
    // =========================================

    const today = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).format(new Date());

    // =========================================
    // 3. Dhan candles
    // =========================================

    const dhanResponse = await fetch(
      "https://api.dhan.co/v2/charts/intraday",
      {
        method: "POST",

        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "access-token": accessToken
        },

        body: JSON.stringify({
          securityId: "13",
          exchangeSegment: "IDX_I",
          instrument: "INDEX",
          interval: "5",
          oi: false,
          fromDate: `${today} 09:15:00`,
          toDate: `${today} 15:30:00`
        })
      }
    );

    const dhanData = await dhanResponse.json();

    if (!dhanResponse.ok) {
      return res.status(dhanResponse.status).json({
        success: false,
        error: "Dhan candle request failed",
        details: dhanData
      });
    }

    const dhanCandles =
      (dhanData.timestamp || []).map((ts, i) => ({
        ts: Number(ts),
        o: Number(dhanData.open[i]),
        h: Number(dhanData.high[i]),
        l: Number(dhanData.low[i]),
        c: Number(dhanData.close[i]),
        v: Number(dhanData.volume[i])
      }));

    // =========================================
    // 4. INDstocks candles
    // =========================================

    const token = process.env.INDSTOCKS_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "INDSTOCKS_TOKEN is not configured"
      });
    }

    const endTime = Date.now();

    const startTime =
      endTime -
      (7 * 24 * 60 * 60 * 1000);

    const indUrl =
      "https://api.indstocks.com" +
      "/market/historical/5minute" +
      "?scrip-codes=" +
      encodeURIComponent("NIDX_40000001") +
      "&start_time=" +
      startTime +
      "&end_time=" +
      endTime;

    const indResponse = await fetch(
      indUrl,
      {
        method: "GET",
        headers: {
          Authorization: token
        }
      }
    );

    const indData = await indResponse.json();

    if (!indResponse.ok) {
      return res.status(indResponse.status).json({
        success: false,
        error: "INDstocks candle request failed",
        details: indData
      });
    }

    // =========================================
    // 5. Extract INDstocks data
    // =========================================

    const rawInd =
      indData.data || [];

    /*
      INDstocks response can contain
      multiple instrument groups.

      Find the NIFTY group.
    */

    let indCandles = [];

    if (Array.isArray(rawInd)) {

      for (const group of rawInd) {

        const symbol =
          group.symbol ||
          group.scripCode ||
          group.scrip_code ||
          group.instrument ||
          "";

        if (
          String(symbol)
            .toUpperCase()
            .includes("40000001") ||
          String(symbol)
            .toUpperCase()
            .includes("NIFTY")
        ) {

          const rows =
            group.candles ||
            group.data ||
            group.values ||
            [];

          if (Array.isArray(rows)) {
            indCandles = rows;
            break;
          }
        }
      }

      /*
        If INDstocks returned a flat array,
        use it directly.
      */

      if (
        indCandles.length === 0 &&
        rawInd.length > 0 &&
        Array.isArray(rawInd[0])
      ) {
        indCandles = rawInd[0];
      }
    }

    // =========================================
    // 6. Normalize INDstocks candles
    // =========================================

    indCandles = indCandles
      .map(row => {

        if (Array.isArray(row)) {
          return {
            ts: Number(row[0]),
            o: Number(row[1]),
            h: Number(row[2]),
            l: Number(row[3]),
            c: Number(row[4]),
            v: Number(row[5])
          };
        }

        return {
          ts: Number(
            row.ts ||
            row.timestamp ||
            row.time
          ),

          o: Number(
            row.o ||
            row.open
          ),

          h: Number(
            row.h ||
            row.high
          ),

          l: Number(
            row.l ||
            row.low
          ),

          c: Number(
            row.c ||
            row.close
          ),

          v: Number(
            row.v ||
            row.volume
          )
        };

      })
      .filter(row =>
        Number.isFinite(row.ts)
      );

    // =========================================
    // 7. Convert timestamp to 5-min key
    // =========================================

    function candleKey(ts) {
      return Math.floor(ts / 300) * 300;
    }

    const dhanMap = new Map();

    for (const candle of dhanCandles) {
      dhanMap.set(
        candleKey(candle.ts),
        candle
      );
    }

    const indMap = new Map();

    for (const candle of indCandles) {
      indMap.set(
        candleKey(candle.ts),
        candle
      );
    }

    // =========================================
    // 8. Compare matching candles
    // =========================================

    const comparisons = [];

    for (const [key, dhan] of dhanMap) {

      const ind = indMap.get(key);

      if (!ind) continue;

      const closeDiff =
        dhan.c - ind.c;

      const openDiff =
        dhan.o - ind.o;

      const highDiff =
        dhan.h - ind.h;

      const lowDiff =
        dhan.l - ind.l;

      comparisons.push({

        ts: key,

        dhanClose: dhan.c,
        indstocksClose: ind.c,

        closeDifference:
          Number(closeDiff.toFixed(4)),

        openDifference:
          Number(openDiff.toFixed(4)),

        highDifference:
          Number(highDiff.toFixed(4)),

        lowDifference:
          Number(lowDiff.toFixed(4)),

        volumeDifference:
          dhan.v - ind.v

      });
    }

    // =========================================
    // 9. Calculate statistics
    // =========================================

    let maxCloseDifference = 0;

    let totalCloseDifference = 0;

    for (const row of comparisons) {

      const difference =
        Math.abs(row.closeDifference);

      if (
        difference >
        maxCloseDifference
      ) {
        maxCloseDifference =
          difference;
      }

      totalCloseDifference +=
        difference;
    }

    const averageCloseDifference =
      comparisons.length
        ? totalCloseDifference /
          comparisons.length
        : null;

    // =========================================
    // 10. Return compact result
    // =========================================

    return res.status(200).json({

      success: true,

      date: today,

      comparison: {
        dhanCandles:
          dhanCandles.length,

        indstocksCandles:
          indCandles.length,

        matchingCandles:
          comparisons.length,

        maxCloseDifference:
          Number(
            maxCloseDifference.toFixed(4)
          ),

        averageCloseDifference:
          averageCloseDifference === null
            ? null
            : Number(
                averageCloseDifference
                  .toFixed(4)
              )
      },

      firstMatches:
        comparisons.slice(0, 5),

      lastMatches:
        comparisons.slice(-5)

    });

  } catch (error) {

    console.error(
      "Comparison error:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error.message

    });

  }
}

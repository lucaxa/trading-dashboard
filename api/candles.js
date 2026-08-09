/*
TradeMind Pro
Historical Candle API

INDstocks → Vercel → Dashboard

Paper analysis only.
No orders are placed.
*/

export default async function handler(req, res) {

  try {

    const token =
      process.env.INDSTOCKS_TOKEN;

    if (!token) {

      return res.status(500).json({
        success: false,
        error:
          "INDSTOCKS_TOKEN is not configured"
      });

    }

    /*
    Default interval:
    5-minute candles
    */

    const interval =
      req.query.interval ||
      "5minute";

    const allowedIntervals = [

      "1minute",
      "2minute",
      "3minute",
      "4minute",
      "5minute",
      "10minute",
      "15minute",
      "30minute",
      "60minute",
      "120minute",
      "180minute",
      "240minute",
      "1day"

    ];

    if (
      !allowedIntervals.includes(
        interval
      )
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Invalid candle interval"

      });

    }

    /*
    Your actual index security IDs.

    Replace these with the same IDs
    already used successfully
    in api/quotes.js
    */

    const NIFTY_ID =
      "40000001";

    const BANKNIFTY_ID =
      "40000003";

    /*
    INDstocks instrument format
    for index data.
    */

    const scripCodes =
      `NIDX_${NIFTY_ID},NIDX_${BANKNIFTY_ID}`;

    /*
    Current time in milliseconds.
    */

    const endTime =
      Date.now();

    /*
    Default:
    last 7 days.

    This is the maximum range
    allowed for 5-minute candles.
    */

    const startTime =
      endTime -
      (7 * 24 * 60 * 60 * 1000);

    const url =
      "https://api.indstocks.com" +
      `/market/historical/${interval}` +
      `?scrip-codes=${encodeURIComponent(
        scripCodes
      )}` +
      `&start_time=${startTime}` +
      `&end_time=${endTime}`;

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Authorization: token
          }
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      return res.status(
        response.status
      ).json({

        success: false,

        error: data

      });

    }

    return res.status(200).json({

      success: true,

      interval,

      startTime,

      endTime,

      data:
        data.data

    });

  }

  catch (error) {

    console.error(
      "Historical candle error:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        "Failed to fetch historical candles"

    });

  }

}

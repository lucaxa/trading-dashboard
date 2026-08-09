/*
TradeMind Pro
V4 Technical Indicator Engine

REAL historical candles
EMA 9
EMA 21
RSI 14
VWAP

PAPER ANALYSIS ONLY.
No orders are placed.
*/

function ema(values, period) {

  if (values.length < period) {
    return null;
  }

  const multiplier =
    2 / (period + 1);

  let emaValue =
    values
      .slice(0, period)
      .reduce(
        (sum, value) => sum + value,
        0
      ) / period;

  for (
    let i = period;
    i < values.length;
    i++
  ) {

    emaValue =
      (
        values[i] - emaValue
      ) *
      multiplier +
      emaValue;

  }

  return emaValue;
}


function rsi(
  values,
  period = 14
) {

  if (
    values.length <
    period + 1
  ) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {

    const change =
      values[i] -
      values[i - 1];

    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }

  }

  let averageGain =
    gains / period;

  let averageLoss =
    losses / period;

  for (
    let i = period + 1;
    i < values.length;
    i++
  ) {

    const change =
      values[i] -
      values[i - 1];

    const gain =
      Math.max(change, 0);

    const loss =
      Math.max(-change, 0);

    averageGain =
      (
        averageGain *
        (period - 1) +
        gain
      ) / period;

    averageLoss =
      (
        averageLoss *
        (period - 1) +
        loss
      ) / period;

  }

  if (averageLoss === 0) {
    return 100;
  }

  const rs =
    averageGain /
    averageLoss;

  return (
    100 -
    100 / (1 + rs)
  );
}


function vwap(candles) {

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (
    const candle of candles
  ) {

    const high =
      Number(candle[2]);

    const low =
      Number(candle[3]);

    const close =
      Number(candle[4]);

    const volume =
      Number(candle[5]);

    if (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      continue;
    }

    const typicalPrice =
      (
        high +
        low +
        close
      ) / 3;

    cumulativeTPV +=
      typicalPrice *
      volume;

    cumulativeVolume +=
      volume;
  }

  if (cumulativeVolume === 0) {
    return null;
  }

  return (
    cumulativeTPV /
    cumulativeVolume
  );
}


function extractCandles(data) {

  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(data.candles)
  ) {
    return data.candles;
  }

  if (
    typeof data === "object"
  ) {

    for (
      const value of
      Object.values(data)
    ) {

      if (Array.isArray(value)) {
        return value;
      }

      if (
        value &&
        Array.isArray(
          value.candles
        )
      ) {

        return value.candles;
      }

    }
  }

  return [];
}


export default async function handler(
  req,
  res
) {

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

    const interval =
      req.query.interval ||
      "5minute";

    /*
    Same IDs already working
    with your quote endpoint.
    */

    const NIFTY_ID =
      "40000001";

    const BANKNIFTY_ID =
      "40000003";

    const scripCodes =
      `NIDX_${NIFTY_ID},NIDX_${BANKNIFTY_ID}`;

    const endTime =
      Date.now();

    const startTime =
      endTime -
      (
        7 *
        24 *
        60 *
        60 *
        1000
      );

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

    const result =
      await response.json();

    if (!response.ok) {

      return res.status(
        response.status
      ).json({
        success: false,
        error: result
      });

    }

    const rawData =
      result.data;

    const candles =
      extractCandles(rawData);

    if (
      candles.length === 0
    ) {

      return res.status(200).json({

        success: false,

        error:
          "No candles found",

        rawData

      });

    }

    /*
    TEMPORARY DEBUG RESPONSE

    We want to see the EXACT
    candle structure returned
    by INDstocks.

    */

    return res.status(200).json({

      success: true,

      interval,

      candleCount:
        candles.length,

      sampleCandles:
        candles.slice(0, 3),

      firstCandle:
        candles[0],

      lastCandle:
        candles[
          candles.length - 1
        ]

    });

  }

  catch (error) {

    console.error(
      "Indicator engine error:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        "Failed to calculate indicators"

    });

  }

}
